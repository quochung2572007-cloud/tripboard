/**
 * Tripboard collections.
 *
 * Privacy model: every trip is a DeepSpace "team". A row is readable only by
 * members of the trip it belongs to — enforced in the RecordRoom Durable
 * Object via `read: 'team'` + `teamField`, which resolves membership against
 * the `team_members` collection. Non-members never receive the rows over the
 * WebSocket (the DO filters them in SQL), so this is a real boundary, not a UI
 * filter.
 *
 * Membership rows, trips, places and itineraries are written only by server
 * actions (src/actions), which re-check membership with the verified caller id.
 * The one client-writable collection is `votes`, where `userBound` +
 * `uniqueOn` guarantee one vote per person per place on the server.
 */

import type { CollectionSchema, RolePermissions } from 'deepspace/schema'

const closed: RolePermissions = { read: false, create: false, update: false, delete: false }

/** Readable by the trip's members; written only by server actions. */
const teamReadOnly: Record<string, RolePermissions> = {
  '*': closed,
  viewer: closed,
  member: { read: 'team', create: false, update: false, delete: false },
  admin: { read: 'team', create: false, update: false, delete: false },
}

export const tripsSchema: CollectionSchema = {
  name: 'trips',
  columns: [
    // The trip's own record id, so the trip row can name its team like every
    // other trip-scoped row. (teamField '_rowId' is honoured when rows are
    // queried but not when updates are broadcast, so renames and the
    // "building" lock never reached members other than the creator.)
    { name: 'tripId', storage: 'text', interpretation: 'plain' },
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: 80 },
    { name: 'destination', storage: 'text', interpretation: 'plain', required: true, maxLength: 120 },
    { name: 'country', storage: 'text', interpretation: 'plain' },
    { name: 'lat', storage: 'number', interpretation: 'plain' },
    { name: 'lon', storage: 'number', interpretation: 'plain' },
    { name: 'startDate', storage: 'text', interpretation: 'plain', required: true },
    { name: 'endDate', storage: 'text', interpretation: 'plain', required: true },
    { name: 'inviteToken', storage: 'text', interpretation: 'plain' },
    { name: 'forecast', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'forecastAt', storage: 'number', interpretation: 'plain' },
    { name: 'generating', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'generatingBy', storage: 'text', interpretation: 'plain' },
    { name: 'generatingAt', storage: 'number', interpretation: 'plain' },
    { name: 'lastEmailAt', storage: 'number', interpretation: 'plain' },
  ],
  // The trip row IS the team: `tripId` holds its own record id.
  teamField: 'tripId',
  permissions: teamReadOnly,
}

export const teamMembersSchema: CollectionSchema = {
  name: 'team_members',
  columns: [
    { name: 'teamId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'status', storage: 'text', interpretation: { kind: 'select', options: ['active', 'left'] } },
    { name: 'role', storage: 'text', interpretation: { kind: 'select', options: ['organizer', 'member'] } },
  ],
  uniqueOn: ['teamId', 'userId'],
  teamField: 'teamId',
  permissions: teamReadOnly,
}

export const placesSchema: CollectionSchema = {
  name: 'places',
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'name', storage: 'text', interpretation: 'plain', required: true, maxLength: 120 },
    { name: 'kind', storage: 'text', interpretation: 'plain', maxLength: 40 },
    { name: 'why', storage: 'text', interpretation: 'plain', maxLength: 300 },
    { name: 'note', storage: 'text', interpretation: 'plain', maxLength: 300 },
    { name: 'sourceUrl', storage: 'text', interpretation: { kind: 'url' } },
    { name: 'sourceTitle', storage: 'text', interpretation: 'plain' },
    { name: 'origin', storage: 'text', interpretation: { kind: 'select', options: ['search', 'manual'] } },
  ],
  teamField: 'tripId',
  permissions: {
    '*': closed,
    viewer: closed,
    // Add and remove go through server actions (`addPlace`, `removePlace`) so
    // removal can also delete the place's votes.
    member: { read: 'team', create: false, update: false, delete: false },
    admin: { read: 'team', create: false, update: false, delete: false },
  },
}

export const votesSchema: CollectionSchema = {
  name: 'votes',
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'placeId', storage: 'text', interpretation: 'plain', required: true },
    // Filled by the server with the caller's id; the client cannot choose it.
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
  ],
  uniqueOn: ['placeId', 'userId'],
  ownerField: 'userId',
  teamField: 'tripId',
  permissions: {
    '*': closed,
    viewer: closed,
    member: { read: 'team', create: true, update: false, delete: 'own', writableFields: ['tripId', 'placeId', 'userId'] },
    admin: { read: 'team', create: true, update: false, delete: 'own', writableFields: ['tripId', 'placeId', 'userId'] },
  },
}

export const itinerariesSchema: CollectionSchema = {
  name: 'itineraries',
  columns: [
    { name: 'tripId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'version', storage: 'number', interpretation: 'plain' },
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'summary', storage: 'text', interpretation: 'plain' },
    { name: 'days', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'tips', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'usedWeather', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'model', storage: 'text', interpretation: 'plain' },
  ],
  teamField: 'tripId',
  permissions: teamReadOnly,
}

/**
 * Server-only cache of place suggestions keyed by (destination, query).
 * Results depend only on the public web, not on the trip, so every trip to
 * the same city shares them: a repeat search is instant and costs nothing.
 */
export const searchCacheSchema: CollectionSchema = {
  name: 'search_cache',
  columns: [
    { name: 'suggestions', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'sourceCount', storage: 'number', interpretation: 'plain' },
    { name: 'fetchedAt', storage: 'number', interpretation: 'plain' },
  ],
  permissions: { '*': closed, viewer: closed, member: closed, admin: closed },
}

/** Per-user / per-trip counters for owner-billed calls. Server-only. */
export const usageCountersSchema: CollectionSchema = {
  name: 'usage_counters',
  columns: [
    { name: 'count', storage: 'number', interpretation: 'plain' },
    { name: 'day', storage: 'text', interpretation: 'plain' },
  ],
  permissions: { '*': closed, viewer: closed, member: closed, admin: closed },
}
