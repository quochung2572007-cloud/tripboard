/**
 * Place discovery and the shortlist.
 *
 * `suggestPlaces` is a small retrieval pipeline: Exa web search finds pages
 * about the request in the trip's destination, then Claude extracts concrete
 * named places from those pages. Every suggestion must cite one of the fetched
 * pages (validated in `validateSuggestions`), so the list is grounded in real
 * sources rather than model memory. Suggestions are returned, not stored —
 * only what the group adds to the board becomes a record.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { buildSuggestPrompt, extractJson, validateSuggestions, type SourceDoc } from '../lib/trip-logic'
import { askClaude, fail, ok, param, queryAll, requireMember, takeQuota, type PlaceData } from './helpers'

const EXTRACT_MODEL = 'claude-haiku-5-5'
const MAX_PLACES_PER_TRIP = 40

interface ExaResult {
  title?: string
  url?: string
  highlights?: string[]
  text?: string
  summary?: string
}

export const suggestPlaces: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const tripId = param(params, 'tripId', 64)
  const query = param(params, 'query', 100)
  if (query.length < 2) return fail('Type what you are looking for, e.g. "pastry shops".')
  const access = await requireMember(tools, tripId, userId)
  if (!access.ok) return fail(access.error)
  const destination = access.trip.data.destination

  const quota = await takeQuota(tools, userId, 'suggest', 25)
  if (quota) return fail(quota)

  const search = await tools.integration<{ results?: ExaResult[] }>('exa/search', {
    query: `${query} in ${destination}`,
    numResults: 6,
    type: 'auto',
    contents: { highlights: { numSentences: 5, highlightsPerUrl: 3 } },
  })
  if (!search.success) return fail(`Search failed: ${search.error}`)

  const sources: SourceDoc[] = (search.data.results ?? [])
    .map((r) => ({
      title: (r.title ?? '').slice(0, 160) || (r.url ?? ''),
      url: r.url ?? '',
      text: (r.highlights ?? []).join('\n…\n') || r.summary || r.text || '',
    }))
    .filter((s) => s.url.startsWith('http') && s.text.length > 40)
  if (!sources.length) return ok({ suggestions: [], sourceCount: 0 })

  const prompt = buildSuggestPrompt(query, destination, sources)
  let suggestions
  try {
    const reply = await askClaude(tools, { model: EXTRACT_MODEL, system: prompt.system, user: prompt.user, maxTokens: 1500 })
    suggestions = validateSuggestions(extractJson(reply), sources)
  } catch (e) {
    return fail(`Couldn't read the search results: ${(e as Error).message}`)
  }
  return ok({ suggestions, sourceCount: sources.length })
}

export const addPlace: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const tripId = param(params, 'tripId', 64)
  const access = await requireMember(tools, tripId, userId)
  if (!access.ok) return fail(access.error)

  const name = param(params, 'name', 120)
  if (!name) return fail('A place needs a name.')
  const sourceUrl = param(params, 'sourceUrl', 500)
  const place: PlaceData = {
    tripId,
    name,
    kind: param(params, 'kind', 40),
    why: param(params, 'why', 300),
    note: param(params, 'note', 300),
    sourceUrl: /^https?:\/\//.test(sourceUrl) ? sourceUrl : '',
    sourceTitle: param(params, 'sourceTitle', 160),
    origin: params.origin === 'search' ? 'search' : 'manual',
  }

  const existing = await queryAll<PlaceData>(tools, 'places', { tripId })
  if (existing.length >= MAX_PLACES_PER_TRIP) return fail(`A board holds up to ${MAX_PLACES_PER_TRIP} places.`)
  const dupe = existing.find((p) => p.data.name.toLowerCase() === name.toLowerCase())
  if (dupe) return ok({ placeId: dupe.recordId, duplicate: true })

  const r = await tools.create('places', place as unknown as Record<string, unknown>)
  if (!r.success) return fail(r.error)
  return ok({ placeId: r.data.recordId, duplicate: false })
}
