/**
 * Trip lifecycle: create, and the invite-link join flow.
 *
 * The invite token lives on the trip row, which only members can read, so a
 * non-member can only learn it from someone who shared the link. `resolveInvite`
 * and `joinTrip` look the trip up BY token (RBAC-bypassed query), so the token
 * is the authorization for joining; the joiner's identity always comes from
 * the verified JWT, never from params.
 */

import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { validateTripDates } from '../lib/trip-logic'
import {
  activeMembers,
  fail,
  newToken,
  ok,
  param,
  queryAll,
  takeQuota,
  type MemberData,
  type TripData,
} from './helpers'

interface GeoHit {
  name: string
  lat: number
  lon: number
  country?: string
  state?: string
}

export const createTrip: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const name = param(params, 'name', 80)
  const destinationInput = param(params, 'destination', 120)
  const startDate = param(params, 'startDate', 10)
  const endDate = param(params, 'endDate', 10)
  if (!name) return fail('Give the trip a name.')
  if (!destinationInput) return fail('Where are you going?')
  const dateError = validateTripDates(startDate, endDate)
  if (dateError) return fail(dateError)

  const quota = await takeQuota(tools, userId, 'createTrip', 10)
  if (quota) return fail(quota)

  // Resolve the destination once, so weather and suggestions use the same place.
  const geo = await tools.integration<GeoHit[]>('openweathermap/geocoding', { q: destinationInput, limit: 1 })
  if (!geo.success) return fail(`Couldn't look up that destination: ${geo.error}`)
  const hit = Array.isArray(geo.data) ? geo.data[0] : undefined
  if (!hit) return fail(`We couldn't find "${destinationInput}". Try a city name, e.g. "Lisbon".`)
  const destination = [hit.name, hit.state, hit.country].filter(Boolean).join(', ')

  const trip: TripData = {
    name,
    destination,
    country: hit.country ?? '',
    lat: hit.lat,
    lon: hit.lon,
    startDate,
    endDate,
    inviteToken: newToken(),
    generating: false,
  }
  const created = await tools.create('trips', trip as unknown as Record<string, unknown>)
  if (!created.success) return fail(created.error)
  const tripId = created.data.recordId

  const member: MemberData = { teamId: tripId, userId, status: 'active', role: 'organizer' }
  const joined = await tools.create('team_members', member as unknown as Record<string, unknown>)
  if (!joined.success) return fail(joined.error)

  return ok({ tripId, destination })
}

async function tripForToken(tools: Parameters<ActionHandler<Env>>[0]['tools'], token: string) {
  if (!/^[a-f0-9]{40}$/.test(token)) return null
  const rows = await queryAll<TripData>(tools, 'trips', { inviteToken: token }, 1)
  return rows[0] ?? null
}

/** Preview for the join page. Shows only what a link holder needs to decide. */
export const resolveInvite: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const trip = await tripForToken(tools, param(params, 'token', 64))
  if (!trip) return fail('This invite link is invalid or has been replaced.')
  const members = await activeMembers(tools, trip.recordId)
  return ok({
    tripId: trip.recordId,
    name: trip.data.name,
    destination: trip.data.destination,
    startDate: trip.data.startDate,
    endDate: trip.data.endDate,
    memberCount: members.length,
    alreadyMember: members.some((m) => m.data.userId === userId),
  })
}

export const joinTrip: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const trip = await tripForToken(tools, param(params, 'token', 64))
  if (!trip) return fail('This invite link is invalid or has been replaced.')
  const tripId = trip.recordId
  const existing = await queryAll<MemberData>(tools, 'team_members', { teamId: tripId, userId })
  if (existing[0]) {
    if (existing[0].data.status === 'left') {
      await tools.update('team_members', existing[0].recordId, { status: 'active' })
    }
    return ok({ tripId, joined: false })
  }
  const members = await activeMembers(tools, tripId)
  if (members.length >= 20) return fail('This trip is full (20 people).')
  const member: MemberData = { teamId: tripId, userId, status: 'active', role: 'member' }
  const r = await tools.create('team_members', member as unknown as Record<string, unknown>)
  if (!r.success) return fail(r.error)
  return ok({ tripId, joined: true })
}
