import { useState } from 'react'
import { Check, Link2, MapPin } from 'lucide-react'
import { Button, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui'
import { dateRange, initials } from '@/lib/format'
import type { Trip } from '@/lib/types'
import { TripManage } from './TripManage'

export interface Person {
  userId: string
  name: string
  online: boolean
  organizer: boolean
  isMe: boolean
}

export function TripHeader({ tripId, trip, people, isOrganizer }: { tripId: string; trip: Trip; people: Person[]; isOrganizer: boolean }) {
  const [copied, setCopied] = useState(false)
  const link = trip.inviteToken ? `${window.location.origin}/join/${trip.inviteToken}` : ''
  const online = people.filter((p) => p.online).length

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      window.prompt('Copy this invite link', link)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="size-4" />
          {trip.destination} · {dateRange(trip.startDate, trip.endDate)}
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl" data-testid="trip-name">
          {trip.name}
        </h1>
        <div className="-ml-3 mt-2">
          <TripManage tripId={tripId} trip={trip} isOrganizer={isOrganizer} />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-start gap-1 md:items-end">
          <div className="flex -space-x-2" data-testid="trip-people">
            {people.map((p) => (
              <Tooltip key={p.userId}>
                <TooltipTrigger
                  render={
                    <span
                      className={`relative inline-flex size-9 items-center justify-center rounded-full border-2 text-xs font-semibold ${
                        p.online ? 'border-primary bg-primary text-primary-foreground' : 'border-card bg-muted text-muted-foreground'
                      }`}
                    />
                  }
                >
                  {initials(p.name)}
                  {p.online && <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card bg-success" />}
                </TooltipTrigger>
                <TooltipContent>
                  {p.isMe ? 'You' : p.name}
                  {p.organizer ? ' · organizer' : ''}
                  {p.online ? ' · on the board now' : ''}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          <p className="text-xs text-muted-foreground" data-testid="online-count">
            {online} on the board now
          </p>
        </div>
        <Button variant="outline" onClick={copy} disabled={!link} data-testid="copy-invite" data-invite-url={link}>
          {copied ? <Check /> : <Link2 />}
          {copied ? 'Link copied' : 'Invite link'}
        </Button>
      </div>
    </header>
  )
}
