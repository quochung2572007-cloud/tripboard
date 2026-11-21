/**
 * Shared helpers for server actions.
 *
 * Actions run with RBAC OFF (see src/server/action-routes.ts), so every action
 * that touches a trip must call `requireMember` with the verified caller id
 * before reading or writing anything for that trip.
 */

import type { ActionResult, ActionTools } from 'deepspace/worker'

export interface Envelope<T> {
  recordId: string
  data: T
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TripData {
  name: string
  destination: string
  country?: string
  lat?: number
  lon?: number
  startDate: string
  endDate: string
  inviteToken?: string
  forecast?: unknown
  forecastAt?: number
  generating?: boolean
  generatingBy?: string
  generatingAt?: number
  lastEmailAt?: number
}

export interface MemberData {
  teamId: string
  userId: string
  status: 'active' | 'left'
  role: 'organizer' | 'member'
}

export interface PlaceData {
  tripId: string
  name: string
  kind?: string
  why?: string
  note?: string
  sourceUrl?: string
  sourceTitle?: string
  origin: 'search' | 'manual'
}

export interface VoteData {
  tripId: string
  placeId: string
  userId: string
}

export const ok = <T>(data: T): ActionResult<T> => ({ success: true, data })
export const fail = (error: string): ActionResult<never> => ({ success: false, error })

export function param(params: Record<string, unknown>, key: string, max = 200): string {
  const v = params[key]
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

export async function getRecord<T>(tools: ActionTools, coll: string, id: string): Promise<Envelope<T> | null> {
  if (!id) return null
  const r = await tools.get(coll, id)
  if (!r.success) return null
  return ((r.data as { record?: Envelope<T> }).record ?? null)
}

export async function queryAll<T>(
  tools: ActionTools,
  coll: string,
  where: Record<string, string | number | boolean>,
  limit = 500,
): Promise<Envelope<T>[]> {
  const r = await tools.query(coll, { where, limit })
  if (!r.success) throw new Error(r.error)
  return (r.data as { records: Envelope<T>[] }).records
}

export async function activeMembers(tools: ActionTools, tripId: string): Promise<Envelope<MemberData>[]> {
  const rows = await queryAll<MemberData>(tools, 'team_members', { teamId: tripId })
  return rows.filter((m) => m.data.status !== 'left')
}

/** Load a trip and confirm the caller is an active member of it. */
export async function requireMember(
  tools: ActionTools,
  tripId: string,
  userId: string,
): Promise<{ ok: true; trip: Envelope<TripData> } | { ok: false; error: string }> {
  if (!tripId) return { ok: false, error: 'Trip not found.' }
  // Independent reads — run them together (one DO round trip of latency, not two).
  const [trip, rows] = await Promise.all([
    getRecord<TripData>(tools, 'trips', tripId),
    queryAll<MemberData>(tools, 'team_members', { teamId: tripId, userId }),
  ])
  if (!trip) return { ok: false, error: 'Trip not found.' }
  if (!rows.some((m) => m.data.status !== 'left')) return { ok: false, error: 'You are not on this trip.' }
  return { ok: true, trip }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Daily quota for owner-billed work. Returns an error message once `limit`
 * is reached for (`scope`, `kind`) today. Counts are approximate under
 * concurrent calls — this is spend control, not accounting.
 */
export async function takeQuota(tools: ActionTools, scope: string, kind: string, limit: number): Promise<string | null> {
  const day = today()
  const id = `${kind}:${scope}:${day}`
  const existing = await getRecord<{ count: number; day: string }>(tools, 'usage_counters', id)
  const count = existing?.data.count ?? 0
  if (count >= limit) return `Daily limit reached (${limit} per day). Try again tomorrow.`
  await tools.create('usage_counters', { count: count + 1, day }, id)
  return null
}

/** Call Claude through the integration proxy and return the text reply. */
export async function askClaude(
  tools: ActionTools,
  opts: { model: string; system: string; user: string; maxTokens: number },
): Promise<string> {
  const r = await tools.integration<{ content?: { type: string; text?: string }[] }>('anthropic/chat-completion', {
    model: opts.model,
    max_tokens: opts.maxTokens,
    temperature: 0.3,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  })
  if (!r.success) throw new Error(r.error)
  const text = (r.data.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
  if (!text) throw new Error('Empty reply from Claude')
  return text
}

export function newToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}
