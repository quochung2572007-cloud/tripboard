/**
 * My trips — every trip the signed-in user belongs to (the RecordRoom only
 * sends trips whose team includes them), plus the form to start a new one.
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from 'deepspace'
import { ArrowRight, MapPin, Users } from 'lucide-react'
import { Button, Input, Label, useToast } from '@/components/ui'
import { callAction } from '@/lib/api'
import { dateRange } from '@/lib/format'
import { addDays } from '@/lib/trip-logic'
import type { Member, Trip } from '@/lib/types'

export default function HomePage() {
  const { records: trips, status } = useQuery<Trip>('trips', { orderBy: 'createdAt', orderDir: 'desc' })
  const { records: members } = useQuery<Member>('team_members')
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = trips.filter((t) => t.data.endDate >= today)
  const past = trips.filter((t) => t.data.endDate < today)
  const count = (id: string) => members.filter((m) => m.data.teamId === id && m.data.status !== 'left').length

  return (
    <div className="paper-ruled min-h-full">
      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-10 md:grid-cols-[1fr_340px]">
        <section>
          <h1 className="font-display text-4xl font-bold tracking-tight">My trips</h1>
          <p className="mt-1 text-muted-foreground">Boards you started or joined from an invite link.</p>

          <div className="mt-8 space-y-3" data-testid="trip-list">
            {status === 'loading' && <p className="text-sm text-muted-foreground">Opening your notebook…</p>}
            {status === 'ready' && trips.length === 0 && (
              <div className="rounded-md border border-dashed border-border bg-card/60 p-8 text-center">
                <p className="font-display text-xl">No trips yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start one on the right, then send the invite link to your group.
                </p>
              </div>
            )}
            {upcoming.map((t) => (
              <TripRow key={t.recordId} id={t.recordId} trip={t.data} people={count(t.recordId)} />
            ))}
            {past.length > 0 && (
              <>
                <h2 className="pt-6 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Past trips</h2>
                {past.map((t) => (
                  <TripRow key={t.recordId} id={t.recordId} trip={t.data} people={count(t.recordId)} muted />
                ))}
              </>
            )}
          </div>
        </section>

        <aside>
          <NewTripForm />
        </aside>
      </div>
    </div>
  )
}

function TripRow({ id, trip, people, muted }: { id: string; trip: Trip; people: number; muted?: boolean }) {
  return (
    <Link
      to={`/trip/${id}`}
      className={`rise group flex items-center gap-4 rounded-md border border-border bg-card px-5 py-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)] ${muted ? 'opacity-70' : ''}`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-display text-xl font-semibold leading-tight">{trip.name}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" />
            {trip.destination}
          </span>
          <span>{dateRange(trip.startDate, trip.endDate)}</span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" />
            {people}
          </span>
        </p>
      </div>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function NewTripForm() {
  const navigate = useNavigate()
  const { error } = useToast()
  const today = new Date().toISOString().slice(0, 10)
  const [name, setName] = useState('')
  const [destination, setDestination] = useState('')
  const [startDate, setStartDate] = useState(addDays(today, 3))
  const [endDate, setEndDate] = useState(addDays(today, 5))
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const r = await callAction<{ tripId: string }>('createTrip', { name, destination, startDate, endDate })
    setBusy(false)
    if (!r.success) return error('Could not create the trip', r.error)
    navigate(`/trip/${r.data.tripId}`)
  }

  return (
    <form
      onSubmit={submit}
      className="sticky top-6 space-y-4 rounded-md border border-border bg-card p-5 shadow-[var(--shadow-card)]"
      data-testid="new-trip-form"
    >
      <div>
        <h2 className="font-display text-2xl font-semibold">Start a trip</h2>
        <p className="text-sm text-muted-foreground">You'll get a link to invite your group.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="trip-name">Trip name</Label>
        <Input id="trip-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lisbon long weekend" maxLength={80} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="trip-dest">Destination city</Label>
        <Input id="trip-dest" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Lisbon" maxLength={120} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="trip-start">From</Label>
          <Input id="trip-start" type="date" value={startDate} min={today} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="trip-end">To</Label>
          <Input id="trip-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
      </div>
      <Button type="submit" className="w-full" loading={busy} disabled={busy}>
        Create board
      </Button>
      <p className="text-xs text-muted-foreground">Up to 10 days. Weather appears once the trip is within 5 days.</p>
    </form>
  )
}
