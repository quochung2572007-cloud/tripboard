/**
 * The shortlist. Votes are plain record writes (one per person per place,
 * enforced by `uniqueOn` + `userBound` in the schema), so every member sees
 * counts and order change live. Presence state shows which card each peer is
 * looking at.
 */

import { useEffect } from 'react'
import { useMutations } from 'deepspace'
import { ExternalLink, MapPinned, Trash2 } from 'lucide-react'
import { Button, Tooltip, TooltipContent, TooltipTrigger, useToast } from '@/components/ui'
import { hostOf, initials, mapsUrl } from '@/lib/format'
import type { RankedPlace } from '@/lib/trip-logic'
import { callAction } from '@/lib/api'
import type { Place, Vote } from '@/lib/types'

export interface BoardPlace {
  id: string
  name: string
  createdAt: string
  createdBy: string
  data: Place
}

interface Props {
  tripId: string
  destination: string
  ranked: RankedPlace<BoardPlace>[]
  memberCount: number
  me: string
  myVotes: Map<string, string>
  nameOf: (userId: string) => string
  watchers: Map<string, string[]>
  onFocus: (placeId: string | null) => void
}

export function PlaceBoard({ tripId, destination, ranked, memberCount, me, myVotes, nameOf, watchers, onFocus }: Props) {
  const votes = useMutations<Vote>('votes')
  const { error } = useToast()

  // Dev/test-only hook: send a raw vote write that skips the toggle logic, so
  // the e2e spec can prove the server refuses a duplicate. Absent in prod builds.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __tripboardForceVote?: (t: string, p: string) => Promise<void> }
    w.__tripboardForceVote = async (t, p) => {
      try {
        await votes.createConfirmed({ tripId: t, placeId: p })
      } catch (e) {
        error('Vote not saved', (e as Error).message)
      }
    }
    return () => {
      delete w.__tripboardForceVote
    }
  }, [votes, error])

  async function toggle(placeId: string) {
    const mine = myVotes.get(placeId)
    try {
      if (mine) await votes.removeConfirmed(mine)
      else await votes.createConfirmed({ tripId, placeId })
    } catch (e) {
      error('Vote not saved', (e as Error).message)
    }
  }

  if (!ranked.length) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/60 p-8 text-center" data-testid="board-empty">
        <p className="font-display text-xl">The board is empty.</p>
        <p className="mt-1 text-sm text-muted-foreground">Find places above and add the ones worth a vote.</p>
      </div>
    )
  }

  return (
    <ol className="space-y-3" data-testid="place-board">
      {ranked.map(({ place, votes: count, voters }, i) => {
        const voted = myVotes.has(place.id)
        const looking = (watchers.get(place.id) ?? []).filter(Boolean)
        return (
          <li
            key={place.id}
            className="rise relative flex gap-4 rounded-md border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]"
            onMouseEnter={() => onFocus(place.id)}
            onMouseLeave={() => onFocus(null)}
            onFocus={() => onFocus(place.id)}
            data-testid="place-card"
            data-place-name={place.name}
            data-place-id={place.id}
          >
            <div className="flex w-16 shrink-0 flex-col items-center gap-1 pt-1">
              <div
                className={`stamp flex size-14 flex-col items-center justify-center ${count > 0 ? 'text-stamp' : 'text-muted-foreground/60'}`}
                aria-label={`${count} of ${memberCount} votes`}
              >
                <span className="font-display text-xl font-bold leading-none" data-testid="vote-count">
                  {count}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-wider">of {memberCount}</span>
              </div>
              <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-semibold leading-snug">{place.name}</h3>
                  {place.data.kind && <p className="text-xs uppercase tracking-wider text-muted-foreground">{place.data.kind}</p>}
                </div>
                <Button
                  size="sm"
                  variant={voted ? 'default' : 'outline'}
                  onClick={() => void toggle(place.id)}
                  disabled={!votes.ready}
                  aria-pressed={voted}
                  data-testid="vote-button"
                >
                  {voted ? "I'm in" : 'Count me in'}
                </Button>
              </div>
              {place.data.why && <p className="mt-1.5 text-sm">{place.data.why}</p>}
              {place.data.note && <p className="mt-1 text-sm italic text-muted-foreground">“{place.data.note}”</p>}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <a href={mapsUrl(place.name, destination)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                  <MapPinned className="size-3.5" /> Map
                </a>
                {place.data.sourceUrl && (
                  <a href={place.data.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground" title={place.data.sourceTitle}>
                    <ExternalLink className="size-3.5" /> {hostOf(place.data.sourceUrl)}
                  </a>
                )}
                <span>added by {place.createdBy === me ? 'you' : nameOf(place.createdBy)}</span>
                {voters.length > 0 && (
                  <span className="flex -space-x-1.5">
                    {voters.map((v) => (
                      <Tooltip key={v}>
                        <TooltipTrigger render={<span className="inline-flex size-6 items-center justify-center rounded-full border border-card bg-secondary text-[10px] font-semibold text-secondary-foreground" />}>
                          {initials(nameOf(v))}
                        </TooltipTrigger>
                        <TooltipContent>{v === me ? 'You' : nameOf(v)}</TooltipContent>
                      </Tooltip>
                    ))}
                  </span>
                )}
                {place.createdBy === me && (
                  <button
                    type="button"
                    className="ml-auto inline-flex items-center gap-1 hover:text-destructive disabled:opacity-50"
                    onClick={async () => {
                      const r = await callAction('removePlace', { tripId, placeId: place.id })
                      if (!r.success) error('Could not remove', r.error)
                    }}
                    aria-label={`Remove ${place.name}`}
                  >
                    <Trash2 className="size-3.5" /> Remove
                  </button>
                )}
              </div>
            </div>

            {looking.length > 0 && (
              <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground" data-testid="peer-looking">
                {looking.join(', ')} looking
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
