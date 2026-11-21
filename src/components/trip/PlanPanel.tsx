/**
 * The plan. "Build plan" asks Claude to turn the voted shortlist + forecast
 * into a day-by-day itinerary. While it runs, the trip's `generating` flag is
 * set server-side, so every member sees who is building it. Each build is a
 * new version; members can flip between versions and email one to the group.
 */

import { useEffect, useMemo, useState } from 'react'
import { CloudRain, Mail, Sparkles, Umbrella } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { callAction } from '@/lib/api'
import { shortDate } from '@/lib/format'
import type { ItineraryRecord, Trip } from '@/lib/types'

interface Props {
  tripId: string
  trip: Trip
  itineraries: { recordId: string; createdBy: string; createdAt: string; data: ItineraryRecord }[]
  placeNames: Map<string, string>
  placeCount: number
  nameOf: (userId: string) => string
  me: string
}

export function PlanPanel({ tripId, trip, itineraries, placeNames, placeCount, nameOf, me }: Props) {
  const { error, success } = useToast()
  const [building, setBuilding] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const sorted = useMemo(() => [...itineraries].sort((a, b) => b.data.version - a.data.version), [itineraries])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const latestId = sorted[0]?.recordId ?? null
  // Follow the newest version when a new one arrives (from anyone).
  useEffect(() => setSelectedId(latestId), [latestId])
  const current = sorted.find((r) => r.recordId === selectedId) ?? sorted[0]

  const lockFresh = trip.generating && trip.generatingAt && Date.now() - trip.generatingAt < 3 * 60 * 1000
  const someoneBuilding = Boolean(lockFresh) || building
  const builder = trip.generatingBy ? (trip.generatingBy === me ? 'You are' : `${nameOf(trip.generatingBy)} is`) : 'Someone is'

  async function build() {
    setBuilding(true)
    const r = await callAction<{ version: number }>('generateItinerary', { tripId })
    setBuilding(false)
    if (!r.success) return error('Plan not built', r.error)
    success(`Plan v${r.data.version} is ready`)
  }

  async function email() {
    if (!current) return
    setEmailing(true)
    const r = await callAction<{ sentTo: number }>('emailItinerary', { tripId, itineraryId: current.recordId })
    setEmailing(false)
    if (!r.success) return error('Email not sent', r.error)
    success(`Sent to ${r.data.sentTo} ${r.data.sentTo === 1 ? 'person' : 'people'}`)
  }

  return (
    <section aria-labelledby="plan-heading" className="rounded-md border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <h2 id="plan-heading" className="font-display text-xl font-semibold">
          The plan
        </h2>
        {sorted.length > 1 && current && (
          <select
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
            value={current.recordId}
            onChange={(e) => setSelectedId(e.target.value)}
            aria-label="Plan version"
          >
            {sorted.map((r) => (
              <option key={r.recordId} value={r.recordId}>
                v{r.data.version} · by {r.createdBy === me ? 'you' : nameOf(r.createdBy)}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Claude reads the board — most-voted places first — and the forecast, then lays out each day.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={build} disabled={someoneBuilding || placeCount === 0} loading={someoneBuilding} data-testid="build-plan">
          <Sparkles /> {sorted.length ? 'Rebuild plan' : 'Build plan'}
        </Button>
        {current && (
          <Button variant="outline" onClick={email} loading={emailing} disabled={emailing} data-testid="email-plan">
            <Mail /> Email to group
          </Button>
        )}
      </div>
      {someoneBuilding && (
        <p className="mt-2 text-sm text-primary" data-testid="building-note">
          {builder} building the plan… this takes about half a minute.
        </p>
      )}
      {placeCount === 0 && <p className="mt-2 text-xs text-muted-foreground">Add places to the board first.</p>}

      {current && (
        <div className="mt-5 space-y-4" data-testid="itinerary">
          <div>
            <h3 className="font-display text-2xl font-bold leading-tight">{current.data.title}</h3>
            <p className="mt-1 text-sm">{current.data.summary}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              v{current.data.version} · {current.data.usedWeather ? 'weather-aware' : 'built without a forecast'}
            </p>
          </div>
          {current.data.days.map((day) => (
            <article key={day.date} className="ticket rounded-md border border-border py-3 pl-6 pr-4">
              <header className="flex items-baseline justify-between gap-2 border-b border-dashed border-border pb-2">
                <p className="font-display text-lg font-semibold">
                  {shortDate(day.date)} <span className="font-normal text-muted-foreground">· {day.theme}</span>
                </p>
                {day.weather && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {/rain|shower|drizzle|wet/i.test(day.weather) && <CloudRain className="size-3.5" />}
                    {day.weather}
                  </span>
                )}
              </header>
              <ul className="mt-2 space-y-2.5">
                {day.slots.map((s) => {
                  const placeName = s.placeId ? placeNames.get(s.placeId) : null
                  return (
                    <li key={s.slot} className="grid grid-cols-[76px_1fr] gap-2 text-sm">
                      <span className="pt-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{s.slot}</span>
                      <div>
                        <p className="font-medium">
                          {s.title}
                          {placeName && !s.title.toLowerCase().includes(placeName.toLowerCase()) && <span className="font-normal text-muted-foreground"> · {placeName}</span>}
                          {placeName && <span className="ml-1.5 rounded-sm bg-stamp/10 px-1 text-[10px] font-semibold uppercase text-stamp">voted</span>}
                        </p>
                        {s.detail && <p className="text-muted-foreground">{s.detail}</p>}
                        {s.rainPlan && (
                          <p className="mt-0.5 inline-flex items-start gap-1 text-xs text-primary">
                            <Umbrella className="mt-0.5 size-3 shrink-0" /> If it rains: {s.rainPlan}
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </article>
          ))}
          {current.data.tips.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {current.data.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
