/**
 * Find places: a web search (Exa) read by Claude, returning named places that
 * each cite a real source page. Or add your own by name.
 */

import { useState, type FormEvent } from 'react'
import { ExternalLink, Plus, Search } from 'lucide-react'
import { Button, Input, useToast } from '@/components/ui'
import { callAction } from '@/lib/api'
import { hostOf } from '@/lib/format'
import type { PlaceSuggestion } from '@/lib/trip-logic'

const EXAMPLES = ['pastry shops', 'sunset viewpoints', 'rainy-day museums', 'local food market']

export function PlaceFinder({ tripId, destination, existingNames }: { tripId: string; destination: string; existingNames: Set<string> }) {
  const { error, success } = useToast()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<{ query: string; items: PlaceSuggestion[]; sourceCount: number; cached: boolean } | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [manual, setManual] = useState('')

  async function search(q: string) {
    const text = q.trim()
    if (text.length < 2 || searching) return
    setQuery(text)
    setSearching(true)
    setSearchError(null)
    const r = await callAction<{ suggestions: PlaceSuggestion[]; sourceCount: number; cached: boolean }>('suggestPlaces', { tripId, query: text })
    setSearching(false)
    if (!r.success) return setSearchError(r.error)
    setResults({ query: text, items: r.data.suggestions, sourceCount: r.data.sourceCount, cached: r.data.cached })
  }

  async function add(p: { name: string; kind?: string; why?: string; sourceUrl?: string; sourceTitle?: string }, origin: 'search' | 'manual') {
    setAdding(p.name)
    const r = await callAction<{ duplicate: boolean }>('addPlace', { tripId, origin, ...p })
    setAdding(null)
    if (!r.success) return error('Could not add place', r.error)
    if (r.data.duplicate) success('Already on the board')
    return true
  }

  async function addManual(e: FormEvent) {
    e.preventDefault()
    if (!manual.trim()) return
    if (await add({ name: manual.trim() }, 'manual')) setManual('')
  }

  return (
    <section aria-labelledby="finder-heading" className="rounded-md border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <h2 id="finder-heading" className="font-display text-xl font-semibold">
        Find places in {destination.split(',')[0]}
      </h2>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void search(query)
        }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What are you in the mood for?" maxLength={100} aria-label="Search for places" data-testid="place-query" />
        <Button type="submit" loading={searching} disabled={searching || query.trim().length < 2} data-testid="place-search">
          <Search /> Find
        </Button>
      </form>
      {!results && !searching && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => void search(ex)} className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
              {ex}
            </button>
          ))}
        </div>
      )}

      {searching && <p className="mt-3 text-sm text-muted-foreground">Searching the web and reading the best pages…</p>}
      {searchError && !searching && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-destructive/40 p-2 text-sm text-destructive">
          <span>{searchError}</span>
          <Button variant="ghost" size="sm" onClick={() => void search(query)}>
            Retry
          </Button>
        </div>
      )}
      {results && !searching && (
        <div className="mt-3" data-testid="suggestions">
          <p className="text-xs text-muted-foreground">
            {results.items.length
              ? `${results.items.length} places for “${results.query}”, each cited from one of ${results.sourceCount} pages${results.cached ? ' · searched recently, so this was instant' : ''}`
              : `Nothing specific found for “${results.query}”. Try different words.`}
          </p>
          <ul className="mt-2 divide-y divide-border">
            {results.items.map((p) => {
              const onBoard = existingNames.has(p.name.toLowerCase())
              return (
                <li key={p.name} className="flex items-start gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {p.name} {p.kind && <span className="ml-1 text-xs font-normal text-muted-foreground">{p.kind}</span>}
                    </p>
                    {p.why && <p className="text-sm text-muted-foreground">{p.why}</p>}
                    <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline-offset-2 hover:underline">
                      {hostOf(p.sourceUrl)} <ExternalLink className="size-3" />
                    </a>
                  </div>
                  <Button size="sm" variant={onBoard ? 'ghost' : 'outline'} disabled={onBoard || adding === p.name} loading={adding === p.name} onClick={() => void add(p, 'search')}>
                    {onBoard ? 'On board' : (
                      <>
                        <Plus /> Add
                      </>
                    )}
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <form onSubmit={addManual} className="mt-4 flex gap-2 border-t border-dashed border-border pt-4">
        <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Or add one you already know" maxLength={120} aria-label="Add a place by name" data-testid="manual-place" />
        <Button type="submit" variant="secondary" disabled={!manual.trim() || adding !== null} data-testid="manual-add">
          Add
        </Button>
      </form>
    </section>
  )
}
