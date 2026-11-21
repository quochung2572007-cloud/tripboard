/**
 * Forecast for the trip days. The forecast lives on the trip record (cached
 * server-side for 3h), so every member sees the same data the planner uses.
 * On mount we ask the server to refresh it; the server only spends a call
 * when the cache is stale.
 */

import { useAsyncResource } from 'deepspace'
import { CloudRain, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui'
import { callAction } from '@/lib/api'
import { shortDate, weatherIconUrl } from '@/lib/format'
import { FORECAST_WINDOW_DAYS, tripHasForecastWindow, type DailyForecast } from '@/lib/trip-logic'
import type { Trip } from '@/lib/types'

export function WeatherStrip({ tripId, trip }: { tripId: string; trip: Trip }) {
  const today = new Date().toISOString().slice(0, 10)
  const inWindow = tripHasForecastWindow(trip.startDate, trip.endDate, today)
  const refresh = useAsyncResource(
    async () => {
      if (!inWindow) return null
      const r = await callAction<{ days: DailyForecast[] }>('refreshForecast', { tripId })
      if (!r.success) throw new Error(r.error)
      return r.data
    },
    [tripId, inWindow],
  )

  const days = (Array.isArray(trip.forecast) ? trip.forecast : []).filter((d) => d.date >= trip.startDate && d.date <= trip.endDate)

  return (
    <section aria-labelledby="weather-heading" className="rounded-md border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <h2 id="weather-heading" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Weather on the trip
        </h2>
        {inWindow && refresh.status === 'error' && (
          <Button variant="ghost" size="sm" onClick={refresh.reload}>
            <RefreshCw /> Retry
          </Button>
        )}
      </div>

      {!inWindow && (
        <p className="mt-2 text-sm text-muted-foreground">
          The forecast appears {FORECAST_WINDOW_DAYS} days before you leave. Until then, plans are built without weather.
        </p>
      )}
      {inWindow && days.length === 0 && refresh.status === 'loading' && <p className="mt-2 text-sm text-muted-foreground">Checking the sky…</p>}
      {inWindow && days.length === 0 && refresh.status === 'error' && (
        <p className="mt-2 text-sm text-destructive">{refresh.error}</p>
      )}
      {inWindow && days.length === 0 && refresh.status === 'ready' && (
        <p className="mt-2 text-sm text-muted-foreground">No forecast covers these dates yet.</p>
      )}

      {days.length > 0 && (
        <ul className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2" data-testid="weather-days">
          {days.map((d) => (
            <li key={d.date} className={`rounded-md border px-2 py-2 text-center ${d.wet ? 'border-primary/40 bg-primary/5' : 'border-border'}`}>
              <p className="text-xs font-medium">{shortDate(d.date)}</p>
              {d.icon ? (
                <img src={weatherIconUrl(d.icon)} alt="" className="mx-auto size-10" loading="lazy" />
              ) : (
                <div className="size-10" />
              )}
              <p className="text-sm font-semibold">
                {d.high}° <span className="font-normal text-muted-foreground">{d.low}°</span>
              </p>
              <p className="truncate text-[11px] capitalize text-muted-foreground" title={d.summary}>
                {d.wet && <CloudRain className="mr-0.5 inline size-3" />}
                {d.summary}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
