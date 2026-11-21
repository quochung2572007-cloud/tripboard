/**
 * Weather, itinerary generation, and emailing the plan.
 *
 * All three spend the app owner's credits, so each is membership-checked and
 * rate-limited. The forecast is cached on the trip row (one fetch serves every
 * member for 3 hours), and generation takes a per-trip lock that every member
 * sees live, so two people pressing "Build plan" at once don't both pay.
 */

import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import {
  FORECAST_TTL_MS,
  buildItineraryPrompt,
  extractJson,
  rankPlaces,
  renderItineraryEmail,
  rollupForecast,
  tripDates,
  tripHasForecastWindow,
  validateItinerary,
  type DailyForecast,
  type ForecastStep,
  type Itinerary,
} from '../lib/trip-logic'
import {
  activeMembers,
  askClaude,
  fail,
  getRecord,
  ok,
  param,
  queryAll,
  requireMember,
  takeQuota,
  type Envelope,
  type PlaceData,
  type TripData,
  type VoteData,
} from './helpers'

const PLAN_MODEL = 'claude-sonnet-5-5'
const LOCK_MS = 3 * 60 * 1000
const EMAIL_COOLDOWN_MS = 10 * 60 * 1000

/** Returns the trip's daily forecast, fetching only when the cache is stale. */
async function loadForecast(
  tools: ActionTools,
  trip: Envelope<TripData>,
  force: boolean,
): Promise<{ days: DailyForecast[]; inWindow: boolean; error?: string }> {
  const today = new Date().toISOString().slice(0, 10)
  const inWindow = tripHasForecastWindow(trip.data.startDate, trip.data.endDate, today)
  if (!inWindow) return { days: [], inWindow }
  const cached = Array.isArray(trip.data.forecast) ? (trip.data.forecast as DailyForecast[]) : null
  const fresh = cached && trip.data.forecastAt && Date.now() - trip.data.forecastAt < FORECAST_TTL_MS
  if (cached && fresh && !force) return { days: cached, inWindow }

  const r = await tools.integration<ForecastStep[]>('openweathermap/forecast', { q: trip.data.destination, units: 'metric' })
  if (!r.success) return { days: cached ?? [], inWindow, error: r.error }
  const days = rollupForecast(Array.isArray(r.data) ? r.data : [], trip.data.lon ?? 0)
  await tools.update('trips', trip.recordId, { forecast: days, forecastAt: Date.now() })
  return { days, inWindow }
}

export const refreshForecast: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const tripId = param(params, 'tripId', 64)
  const access = await requireMember(tools, tripId, userId)
  if (!access.ok) return fail(access.error)
  const quota = await takeQuota(tools, tripId, 'forecast', 20)
  if (quota) return fail(quota)
  const f = await loadForecast(tools, access.trip, false)
  if (f.error) return fail(`Weather unavailable: ${f.error}`)
  return ok({ days: f.days, inWindow: f.inWindow })
}

export const generateItinerary: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const tripId = param(params, 'tripId', 64)
  const access = await requireMember(tools, tripId, userId)
  if (!access.ok) return fail(access.error)
  const trip = access.trip

  if (trip.data.generating && trip.data.generatingAt && Date.now() - trip.data.generatingAt < LOCK_MS) {
    return fail('Someone is already building the plan — it will appear here in a moment.')
  }

  const [places, votes, members] = await Promise.all([
    queryAll<PlaceData>(tools, 'places', { tripId }),
    queryAll<VoteData>(tools, 'votes', { tripId }),
    activeMembers(tools, tripId),
  ])
  if (!places.length) return fail('Add a few places to the board first.')

  const quota = await takeQuota(tools, tripId, 'itinerary', 6)
  if (quota) return fail(quota)

  await tools.update('trips', tripId, { generating: true, generatingBy: userId, generatingAt: Date.now() })
  try {
    const memberIds = new Set(members.map((m) => m.data.userId))
    const ranked = rankPlaces(
      places.map((p) => ({ id: p.recordId, name: p.data.name, createdAt: p.createdAt, data: p.data })),
      votes.map((v) => ({ placeId: v.data.placeId, userId: v.data.userId })),
      memberIds,
    ).slice(0, 18)
    const dates = tripDates(trip.data.startDate, trip.data.endDate)
    const forecast = await loadForecast(tools, trip, false)

    const prompt = buildItineraryPrompt({
      tripName: trip.data.name,
      destination: trip.data.destination,
      dates,
      memberCount: memberIds.size,
      forecast: forecast.days,
      places: ranked.map((r) => ({
        id: r.place.id,
        name: r.place.name,
        kind: r.place.data.kind,
        why: r.place.data.why,
        note: r.place.data.note,
        votes: r.votes,
      })),
    })

    const placeIds = new Set(ranked.map((r) => r.place.id))
    let itinerary: Itinerary | null = null
    let lastError = ''
    // One retry: models occasionally wrap or truncate JSON.
    for (let attempt = 0; attempt < 2 && !itinerary; attempt++) {
      try {
        const reply = await askClaude(tools, {
          model: PLAN_MODEL,
          system: prompt.system,
          user: attempt === 0 ? prompt.user : `${prompt.user}\n\nReturn ONLY the JSON object, nothing else.`,
          maxTokens: 6000,
        })
        itinerary = validateItinerary(extractJson(reply), dates, placeIds)
      } catch (e) {
        lastError = (e as Error).message
      }
    }
    if (!itinerary) return fail(`Couldn't build the plan: ${lastError}`)

    const previous = await queryAll<{ version: number }>(tools, 'itineraries', { tripId })
    const version = previous.reduce((m, r) => Math.max(m, r.data.version ?? 0), 0) + 1
    const saved = await tools.create('itineraries', {
      tripId,
      version,
      title: itinerary.title,
      summary: itinerary.summary,
      days: itinerary.days,
      tips: itinerary.tips,
      usedWeather: forecast.days.length > 0,
      model: PLAN_MODEL,
    })
    if (!saved.success) return fail(saved.error)
    return ok({ itineraryId: saved.data.recordId, version })
  } finally {
    await tools.update('trips', tripId, { generating: false, generatingBy: '', generatingAt: 0 })
  }
}

export const emailItinerary: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const tripId = param(params, 'tripId', 64)
  const access = await requireMember(tools, tripId, userId)
  if (!access.ok) return fail(access.error)
  const trip = access.trip

  if (trip.data.lastEmailAt && Date.now() - trip.data.lastEmailAt < EMAIL_COOLDOWN_MS) {
    const mins = Math.ceil((EMAIL_COOLDOWN_MS - (Date.now() - trip.data.lastEmailAt)) / 60000)
    return fail(`The plan was just emailed. You can send it again in ${mins} min.`)
  }

  const itineraryId = param(params, 'itineraryId', 64)
  const all = await queryAll<{ version: number }>(tools, 'itineraries', { tripId })
  const chosen = itineraryId ? all.find((r) => r.recordId === itineraryId) : all.sort((a, b) => b.data.version - a.data.version)[0]
  if (!chosen) return fail('Build a plan first.')
  const it = await getRecord<Itinerary & { tripId: string }>(tools, 'itineraries', chosen.recordId)
  if (!it) return fail('Plan not found.')

  // Emails are read server-side and never returned to the client.
  const members = await activeMembers(tools, tripId)
  const users = await Promise.all(members.map((m) => getRecord<{ email?: string }>(tools, 'users', m.data.userId)))
  const emails = users.map((u) => u?.data.email).filter((e): e is string => Boolean(e))
  if (!emails.length) return fail('No member email addresses are available.')

  const places = await queryAll<PlaceData>(tools, 'places', { tripId })
  const placeNames = new Map(places.map((p) => [p.recordId, p.data.name]))
  const mail = renderItineraryEmail({
    tripName: trip.data.name,
    destination: trip.data.destination,
    itinerary: it.data,
    placeNames,
    tripUrl: `https://${env.APP_NAME}.app.space/trip/${tripId}`,
  })

  // Mark first so a double click can't send twice.
  await tools.update('trips', tripId, { lastEmailAt: Date.now() })
  const sent = await tools.integration('email/send', {
    to: emails,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  })
  if (!sent.success) {
    await tools.update('trips', tripId, { lastEmailAt: 0 })
    return fail(`Email failed: ${sent.error}`)
  }
  return ok({ sentTo: emails.length })
}
