/**
 * Server actions — exposed at POST /api/actions/<name>, called with the
 * signed-in user's JWT. They run RBAC-off, so each one checks trip
 * membership itself (see helpers.ts → requireMember).
 */
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { createTrip, joinTrip, resolveInvite } from './trips'
import { addPlace, suggestPlaces } from './places'
import { emailItinerary, generateItinerary, refreshForecast } from './plan'

export const actions: Record<string, ActionHandler<Env>> = {
  createTrip,
  resolveInvite,
  joinTrip,
  suggestPlaces,
  addPlace,
  refreshForecast,
  generateItinerary,
  emailItinerary,
}
