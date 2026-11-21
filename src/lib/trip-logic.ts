/**
 * Pure trip logic shared by the worker (server actions) and the client.
 * No I/O here — everything is unit-tested in trip-logic.test.ts.
 */

export const MAX_TRIP_DAYS = 10
export const FORECAST_WINDOW_DAYS = 5
export const FORECAST_TTL_MS = 3 * 60 * 60 * 1000

// ─── Dates ──────────────────────────────────────────────────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Inclusive list of ISO dates from start to end. */
export function tripDates(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end && out.length < 366; d = addDays(d, 1)) out.push(d)
  return out
}

export function validateTripDates(start: unknown, end: unknown): string | null {
  if (!isIsoDate(start) || !isIsoDate(end)) return 'Pick a start and end date.'
  if (end < start) return 'The trip ends before it starts.'
  if (tripDates(start, end).length > MAX_TRIP_DAYS) return `Trips can be at most ${MAX_TRIP_DAYS} days.`
  return null
}

// ─── Forecast ───────────────────────────────────────────────────────────────

/** One 3-hour step as returned by `openweathermap/forecast`. */
export interface ForecastStep {
  dt: number
  temp: number
  feels_like?: number
  humidity?: number
  description: string
  icon?: string
}

export interface DailyForecast {
  date: string
  high: number
  low: number
  /** The most frequent daytime condition. */
  summary: string
  icon: string
  /** True when any step that day reports rain, drizzle, thunder or snow. */
  wet: boolean
}

const WET = /rain|drizzle|thunder|snow|sleet|shower/i

/**
 * Roll 3-hour steps into local days. The flattened forecast carries no
 * timezone, so local time is approximated from longitude (15° per hour) —
 * accurate to about an hour, which is fine for day buckets.
 */
export function rollupForecast(steps: ForecastStep[], lon: number): DailyForecast[] {
  const offsetSec = Math.round(lon / 15) * 3600
  const byDay = new Map<string, ForecastStep[]>()
  for (const s of steps) {
    if (typeof s?.dt !== 'number' || typeof s?.temp !== 'number') continue
    const date = new Date((s.dt + offsetSec) * 1000).toISOString().slice(0, 10)
    const list = byDay.get(date) ?? []
    list.push(s)
    byDay.set(date, list)
  }
  const days: DailyForecast[] = []
  for (const [date, list] of [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const temps = list.map((s) => s.temp)
    const daytime = list.filter((s) => {
      const h = new Date((s.dt + offsetSec) * 1000).getUTCHours()
      return h >= 8 && h <= 20
    })
    const pool = daytime.length ? daytime : list
    const counts = new Map<string, number>()
    for (const s of pool) counts.set(s.description, (counts.get(s.description) ?? 0) + 1)
    const summary = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
    const iconStep = pool.find((s) => s.description === summary)
    days.push({
      date,
      high: Math.round(Math.max(...temps)),
      low: Math.round(Math.min(...temps)),
      summary,
      icon: (iconStep?.icon ?? '').replace(/n$/, 'd'),
      wet: list.some((s) => WET.test(s.description)),
    })
  }
  return days
}

/** True when at least one trip day falls inside the forecast window. */
export function tripHasForecastWindow(start: string, end: string, today: string): boolean {
  const windowEnd = addDays(today, FORECAST_WINDOW_DAYS - 1)
  return start <= windowEnd && end >= today
}

// ─── Votes ──────────────────────────────────────────────────────────────────

export interface RankablePlace {
  id: string
  name: string
  createdAt: string
}

export interface RankedPlace<P extends RankablePlace = RankablePlace> {
  place: P
  votes: number
  voters: string[]
}

/**
 * Rank places by member votes (desc), ties broken by who added first. Votes
 * from non-members are ignored — a vote row can only be created with a
 * known trip id, but the ranking does not trust that.
 */
export function rankPlaces<P extends RankablePlace>(
  places: P[],
  votes: { placeId: string; userId: string }[],
  memberIds: Set<string>,
): RankedPlace<P>[] {
  const voters = new Map<string, Set<string>>()
  for (const v of votes) {
    if (!memberIds.has(v.userId)) continue
    const set = voters.get(v.placeId) ?? new Set<string>()
    set.add(v.userId)
    voters.set(v.placeId, set)
  }
  return places
    .map((place) => {
      const vs = [...(voters.get(place.id) ?? [])]
      return { place, votes: vs.length, voters: vs }
    })
    .sort((a, b) => b.votes - a.votes || a.place.createdAt.localeCompare(b.place.createdAt))
}

// ─── Model output parsing ───────────────────────────────────────────────────

/** Pull the first JSON object/array out of a model reply (tolerates ``` fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.search(/[[{]/)
  if (start < 0) throw new Error('No JSON in model reply')
  const open = body[start]
  const close = open === '{' ? '}' : ']'
  const end = body.lastIndexOf(close)
  if (end <= start) throw new Error('Unterminated JSON in model reply')
  return JSON.parse(body.slice(start, end + 1))
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

// Place suggestions (Exa sources → Claude extraction)

export interface SourceDoc {
  title: string
  url: string
  text: string
}

export interface PlaceSuggestion {
  name: string
  kind: string
  why: string
  sourceUrl: string
  sourceTitle: string
}

/**
 * Validate extracted suggestions: each must cite one of the sources we
 * actually fetched (by index). Anything uncited, unnamed or duplicated is
 * dropped — this is what keeps the list grounded in real pages.
 */
export function validateSuggestions(raw: unknown, sources: SourceDoc[], max = 8): PlaceSuggestion[] {
  const list = Array.isArray(raw) ? raw : Array.isArray((raw as { places?: unknown })?.places) ? (raw as { places: unknown[] }).places : []
  const seen = new Set<string>()
  const out: PlaceSuggestion[] = []
  for (const item of list) {
    const o = item as Record<string, unknown>
    const name = str(o?.name, 120)
    const idx = Number(o?.source)
    if (!name || !Number.isInteger(idx) || idx < 0 || idx >= sources.length) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      name,
      kind: str(o.kind, 40),
      why: str(o.why, 300),
      sourceUrl: sources[idx].url,
      sourceTitle: sources[idx].title,
    })
    if (out.length >= max) break
  }
  return out
}

export function buildSuggestPrompt(query: string, destination: string, sources: SourceDoc[]) {
  const system =
    'You extract concrete, visitable places from travel sources. Only include places that are ' +
    `named in the sources and located in or near ${destination}. Never invent places. ` +
    'Reply with JSON only: {"places":[{"name":string,"kind":string,"why":string,"source":number}]} ' +
    '— "kind" is 1-3 words (e.g. "bakery", "viewpoint", "museum"), "why" is one sentence in English ' +
    'under 140 characters saying what makes it worth a visit according to the source, and "source" is ' +
    'the index of the source that names it. At most 8 places, best matches for the request first.'
  const docs = sources
    .map((s, i) => `[${i}] ${s.title}\n${s.url}\n${s.text.slice(0, 1800)}`)
    .join('\n\n---\n\n')
  const user = `Request: ${query}\nDestination: ${destination}\n\nSources:\n\n${docs}`
  return { system, user }
}

// Itinerary

export const SLOTS = ['morning', 'afternoon', 'evening'] as const
export type Slot = (typeof SLOTS)[number]

export interface ItinerarySlot {
  slot: Slot
  placeId: string | null
  title: string
  detail: string
  /** Optional indoor alternative when the day looks wet. */
  rainPlan?: string
}

export interface ItineraryDay {
  date: string
  theme: string
  weather?: string
  slots: ItinerarySlot[]
}

export interface Itinerary {
  title: string
  summary: string
  days: ItineraryDay[]
  tips: string[]
}

export interface ItineraryInputPlace {
  id: string
  name: string
  kind?: string
  why?: string
  note?: string
  votes: number
}

export function buildItineraryPrompt(args: {
  tripName: string
  destination: string
  dates: string[]
  places: ItineraryInputPlace[]
  memberCount: number
  forecast: DailyForecast[]
}) {
  const { tripName, destination, dates, places, memberCount, forecast } = args
  const weatherByDate = new Map(forecast.map((f) => [f.date, f]))
  const weatherLines = dates
    .map((d) => {
      const f = weatherByDate.get(d)
      return f ? `${d}: ${f.summary}, ${f.low}–${f.high}°C${f.wet ? ' (wet)' : ''}` : `${d}: no forecast yet`
    })
    .join('\n')
  const placeLines = places
    .map(
      (p) =>
        `- id=${p.id} | ${p.name}${p.kind ? ` (${p.kind})` : ''} | votes ${p.votes}/${memberCount}` +
        `${p.why ? ` | ${p.why}` : ''}${p.note ? ` | group note: ${p.note}` : ''}`,
    )
    .join('\n')
  const system =
    'You plan group trips. Build a realistic day-by-day plan from the group\'s shortlist. Rules: ' +
    'prioritise places with more votes; you may leave low-vote places out; never reference a place id ' +
    'that is not in the list; put outdoor places on dry days and indoor ones on wet days when a forecast ' +
    'exists; keep each day geographically sensible; fill gaps with a short generic suggestion ' +
    '(placeId null) such as "Long lunch near the river" rather than inventing named venues. ' +
    'Reply with JSON only, matching: {"title":string,"summary":string (2 sentences),' +
    '"days":[{"date":"YYYY-MM-DD","theme":string,"weather":string|null,"slots":[{"slot":"morning"|"afternoon"|"evening",' +
    '"placeId":string|null,"title":string,"detail":string (one sentence),"rainPlan":string|null}]}],"tips":[string] (max 3)}. ' +
    'One entry per date, three slots per day in order.'
  const user =
    `Trip: ${tripName}\nDestination: ${destination}\nGroup size: ${memberCount}\n` +
    `Dates:\n${weatherLines}\n\nShortlist (id | name | votes | notes):\n${placeLines || '(empty)'}`
  return { system, user }
}

/**
 * Coerce a model reply into a well-formed itinerary: exactly the trip's dates,
 * three ordered slots per day, and only place ids from the shortlist.
 */
export function validateItinerary(raw: unknown, dates: string[], placeIds: Set<string>): Itinerary {
  const o = (raw ?? {}) as Record<string, unknown>
  const rawDays = Array.isArray(o.days) ? (o.days as Record<string, unknown>[]) : []
  if (!rawDays.length) throw new Error('Itinerary has no days')
  const byDate = new Map<string, Record<string, unknown>>()
  rawDays.forEach((d, i) => {
    const date = isIsoDate(d?.date) ? (d.date as string) : dates[i]
    if (date && !byDate.has(date)) byDate.set(date, d)
  })
  const days: ItineraryDay[] = dates.map((date) => {
    const d = byDate.get(date) ?? {}
    const rawSlots = Array.isArray(d.slots) ? (d.slots as Record<string, unknown>[]) : []
    const slots: ItinerarySlot[] = SLOTS.map((slot, i) => {
      const s = rawSlots.find((x) => x?.slot === slot) ?? rawSlots[i] ?? {}
      const pid = typeof s.placeId === 'string' && placeIds.has(s.placeId) ? s.placeId : null
      const rainPlan = str(s.rainPlan, 200)
      return {
        slot,
        placeId: pid,
        title: str(s.title, 120) || 'Free time',
        detail: str(s.detail, 300),
        ...(rainPlan ? { rainPlan } : {}),
      }
    })
    const weather = str(d.weather, 80)
    return { date, theme: str(d.theme, 80) || 'Explore', ...(weather ? { weather } : {}), slots }
  })
  const tips = Array.isArray(o.tips) ? (o.tips as unknown[]).map((t) => str(t, 200)).filter(Boolean).slice(0, 3) : []
  return {
    title: str(o.title, 120) || 'Trip plan',
    summary: str(o.summary, 500),
    days,
    tips,
  }
}

// ─── Email ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export function renderItineraryEmail(args: {
  tripName: string
  destination: string
  itinerary: Itinerary
  placeNames: Map<string, string>
  tripUrl: string
}): { subject: string; html: string; text: string } {
  const { tripName, destination, itinerary, placeNames, tripUrl } = args
  const dayHtml = itinerary.days
    .map((d) => {
      const rows = d.slots
        .map((s) => {
          const place = s.placeId ? placeNames.get(s.placeId) : null
          return (
            `<tr><td style="padding:4px 12px 4px 0;color:#6b5f4b;text-transform:capitalize;vertical-align:top">${s.slot}</td>` +
            `<td style="padding:4px 0"><strong>${esc(s.title)}</strong>${place && place !== s.title ? ` — ${esc(place)}` : ''}` +
            `${s.detail ? `<br><span style="color:#4a4a4a">${esc(s.detail)}</span>` : ''}` +
            `${s.rainPlan ? `<br><em style="color:#4a4a4a">If it rains: ${esc(s.rainPlan)}</em>` : ''}</td></tr>`
          )
        })
        .join('')
      return (
        `<h3 style="margin:20px 0 4px;font-family:Georgia,serif">${esc(d.date)} · ${esc(d.theme)}</h3>` +
        `${d.weather ? `<div style="color:#6b5f4b;font-size:13px">${esc(d.weather)}</div>` : ''}` +
        `<table style="border-collapse:collapse;font-size:14px">${rows}</table>`
      )
    })
    .join('')
  const html =
    `<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px;color:#1d2a2a">` +
    `<h2 style="font-family:Georgia,serif;margin-bottom:4px">${esc(itinerary.title)}</h2>` +
    `<div style="color:#6b5f4b">${esc(tripName)} · ${esc(destination)}</div>` +
    `<p>${esc(itinerary.summary)}</p>${dayHtml}` +
    (itinerary.tips.length ? `<h3 style="font-family:Georgia,serif">Tips</h3><ul>${itinerary.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '') +
    `<p style="margin-top:24px"><a href="${esc(tripUrl)}">Open the trip board</a></p></div>`
  const text =
    `${itinerary.title}\n${tripName} · ${destination}\n\n${itinerary.summary}\n\n` +
    itinerary.days
      .map(
        (d) =>
          `${d.date} · ${d.theme}${d.weather ? ` (${d.weather})` : ''}\n` +
          d.slots.map((s) => `  ${s.slot}: ${s.title}${s.detail ? ` — ${s.detail}` : ''}`).join('\n'),
      )
      .join('\n\n') +
    `\n\nOpen the trip board: ${tripUrl}\n`
  return { subject: `Your plan for ${tripName}`, html, text }
}
