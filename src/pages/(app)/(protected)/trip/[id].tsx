/**
 * The trip board: /trip/:id.
 *
 * All data here is live: places, votes, members and plan versions arrive over
 * the records WebSocket, and the RecordRoom only sends rows for trips the
 * caller is a member of. Presence (who has the board open, which card they're
 * on) uses a PresenceRoom scoped to this trip.
 */

import { useCallback, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, usePresenceRoom, useQuery, useUserLookup } from 'deepspace'
import { ArrowLeft } from 'lucide-react'
import { PlaceBoard, type BoardPlace } from '@/components/trip/PlaceBoard'
import { PlaceFinder } from '@/components/trip/PlaceFinder'
import { PlanPanel } from '@/components/trip/PlanPanel'
import { TripHeader, type Person } from '@/components/trip/TripHeader'
import { WeatherStrip } from '@/components/trip/WeatherStrip'
import { rankPlaces } from '@/lib/trip-logic'
import type { ItineraryRecord, Member, Place, Trip, Vote } from '@/lib/types'

export default function TripPage() {
  const { id = '' } = useParams()
  const { userId } = useAuth()
  const me = userId ?? ''

  const trips = useQuery<Trip>('trips')
  const members = useQuery<Member>('team_members', { where: { teamId: id } })
  const places = useQuery<Place>('places', { where: { tripId: id } })
  const votes = useQuery<Vote>('votes', { where: { tripId: id } })
  const itineraries = useQuery<ItineraryRecord>('itineraries', { where: { tripId: id } })
  const { getName } = useUserLookup()
  const presence = usePresenceRoom(`trip:${id}`)

  const trip = trips.records.find((t) => t.recordId === id)
  const nameOf = useCallback((uid: string) => getName(uid) ?? 'A friend', [getName])

  const activeMembers = useMemo(() => members.records.filter((m) => m.data.status !== 'left'), [members.records])
  const memberIds = useMemo(() => new Set(activeMembers.map((m) => m.data.userId)), [activeMembers])
  const onlineIds = useMemo(() => new Set([me, ...presence.peers.map((p) => p.userId)]), [me, presence.peers])

  const people: Person[] = useMemo(
    () =>
      activeMembers
        .map((m) => ({
          userId: m.data.userId,
          name: nameOf(m.data.userId),
          isMe: m.data.userId === me,
          online: onlineIds.has(m.data.userId),
          organizer: m.data.role === 'organizer',
        }))
        .sort((a, b) => Number(b.online) - Number(a.online)),
    [activeMembers, me, nameOf, onlineIds],
  )

  const ranked = useMemo(() => {
    const board: BoardPlace[] = places.records.map((p) => ({
      id: p.recordId,
      name: p.data.name,
      createdAt: p.createdAt,
      createdBy: p.createdBy,
      data: p.data,
    }))
    return rankPlaces(
      board,
      votes.records.map((v) => ({ placeId: v.data.placeId, userId: v.data.userId ?? v.createdBy })),
      memberIds,
    )
  }, [places.records, votes.records, memberIds])

  const myVotes = useMemo(() => {
    const m = new Map<string, string>()
    for (const v of votes.records) if ((v.data.userId ?? v.createdBy) === me) m.set(v.data.placeId, v.recordId)
    return m
  }, [votes.records, me])

  const watchers = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const p of presence.peers) {
      const focus = p.state?.focus
      if (typeof focus !== 'string') continue
      m.set(focus, [...(m.get(focus) ?? []), (p.userName || nameOf(p.userId)).split(' ')[0]])
    }
    return m
  }, [presence.peers, nameOf])

  const placeNames = useMemo(() => new Map(places.records.map((p) => [p.recordId, p.data.name])), [places.records])
  const existingNames = useMemo(() => new Set(places.records.map((p) => p.data.name.toLowerCase())), [places.records])
  const { updateState } = presence
  const onFocus = useCallback((placeId: string | null) => updateState({ focus: placeId }), [updateState])

  if (!trip) {
    return (
      <div className="paper-ruled flex min-h-full items-center justify-center px-5">
        {trips.status === 'loading' ? (
          <p className="text-muted-foreground">Opening the board…</p>
        ) : (
          <div className="max-w-sm text-center" data-testid="trip-missing">
            <p className="font-display text-2xl font-semibold">This board isn't open to you</p>
            <p className="mt-2 text-sm text-muted-foreground">It doesn't exist, or you haven't joined it. Ask someone on the trip for the invite link.</p>
            <Link to="/home" className="mt-4 inline-block text-sm text-primary underline-offset-4 hover:underline">
              Back to my trips
            </Link>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="paper-ruled min-h-full">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <Link to="/home" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> My trips
        </Link>
        <TripHeader trip={trip.data} people={people} />

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
          <div className="space-y-6">
            <PlaceFinder tripId={id} destination={trip.data.destination} existingNames={existingNames} />
            <div>
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <h2 className="font-display text-2xl font-semibold">The shortlist</h2>
                <p className="text-xs text-muted-foreground">Vote on what you'd go to. Most votes rise to the top.</p>
              </div>
              <PlaceBoard
                tripId={id}
                destination={trip.data.destination}
                ranked={ranked}
                memberCount={Math.max(memberIds.size, 1)}
                me={me}
                myVotes={myVotes}
                nameOf={nameOf}
                watchers={watchers}
                onFocus={onFocus}
              />
            </div>
          </div>
          <div className="space-y-6 lg:sticky lg:top-6 lg:self-start">
            <WeatherStrip tripId={id} trip={trip.data} />
            <PlanPanel
              tripId={id}
              trip={trip.data}
              itineraries={itineraries.records}
              placeNames={placeNames}
              placeCount={places.records.length}
              nameOf={nameOf}
              me={me}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
