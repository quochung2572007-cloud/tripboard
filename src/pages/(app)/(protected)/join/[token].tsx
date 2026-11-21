/**
 * Invite link landing: /join/:token. Shows a minimal preview (name, place,
 * dates, group size) and lets the signed-in visitor join. The server checks
 * the token; the joiner's identity comes from their JWT.
 */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAsyncResource } from 'deepspace'
import { MapPin, Users } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { callAction } from '@/lib/api'
import { dateRange } from '@/lib/format'

interface Preview {
  tripId: string
  name: string
  destination: string
  startDate: string
  endDate: string
  memberCount: number
  alreadyMember: boolean
}

export default function JoinPage() {
  const { token = '' } = useParams()
  const { error } = useToast()
  const [joining, setJoining] = useState(false)
  const preview = useAsyncResource(
    async () => {
      const r = await callAction<Preview>('resolveInvite', { token })
      if (!r.success) throw new Error(r.error)
      return r.data
    },
    [token],
  )

  async function join() {
    setJoining(true)
    const r = await callAction<{ tripId: string }>('joinTrip', { token })
    if (!r.success) {
      setJoining(false)
      return error('Could not join', r.error)
    }
    // A full load re-opens the records socket with the new membership, so the
    // board's rows arrive immediately rather than after a resubscribe.
    window.location.assign(`/trip/${r.data.tripId}`)
  }

  return (
    <div className="paper-ruled flex min-h-full items-center justify-center px-5 py-16">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-8 shadow-[var(--shadow-card)]">
        {preview.status === 'loading' && <p className="text-muted-foreground">Checking your invite…</p>}
        {preview.status === 'error' && (
          <>
            <h1 className="font-display text-2xl font-semibold">This link doesn't work</h1>
            <p className="mt-2 text-sm text-muted-foreground">{preview.error}</p>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" onClick={preview.reload}>
                Try again
              </Button>
              <Link to="/home" className="inline-flex h-10 items-center px-4 text-sm underline-offset-4 hover:underline">
                My trips
              </Link>
            </div>
          </>
        )}
        {preview.data && (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stamp">You're invited</p>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight">{preview.data.name}</h1>
            <div className="mt-3 space-y-1 text-sm text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <MapPin className="size-4" />
                {preview.data.destination} · {dateRange(preview.data.startDate, preview.data.endDate)}
              </p>
              <p className="flex items-center gap-1.5">
                <Users className="size-4" />
                {preview.data.memberCount} {preview.data.memberCount === 1 ? 'person' : 'people'} planning
              </p>
            </div>
            {preview.data.alreadyMember ? (
              <Link to={`/trip/${preview.data.tripId}`} className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">
                You're already on this trip — open the board
              </Link>
            ) : (
              <Button className="mt-6 w-full" onClick={join} loading={joining} disabled={joining} data-testid="join-trip">
                Join the trip
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
