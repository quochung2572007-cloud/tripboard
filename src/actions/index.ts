/**
 * Server actions — exposed at POST /api/actions/<name>, called with the
 * signed-in user's JWT. They run RBAC-off, so each one checks trip
 * membership itself (see helpers.ts → requireMember).
 */
import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { backfillTripIds, createTrip, joinTrip, leaveTrip, resolveInvite, rotateInvite, updateTrip } from './trips'
import { addPlace, removePlace, suggestPlaces } from './places'
import { emailItinerary, generateItinerary, refreshForecast } from './plan'

export const actions: Record<string, ActionHandler<Env>> = {
  createTrip,
  resolveInvite,
  joinTrip,
  updateTrip,
  rotateInvite,
  leaveTrip,
  backfillTripIds,
  suggestPlaces,
  addPlace,
  removePlace,
  refreshForecast,
  generateItinerary,
  emailItinerary,
}
