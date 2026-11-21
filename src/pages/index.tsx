/**
 * Landing page — STATIC (no providers, prerendered at build).
 *
 * Design direction
 * - Product: a shared board where a group decides what to do on a trip, then
 *   gets a day-by-day plan that respects their votes and the weather.
 * - Audience: friends planning a weekend away, usually stuck in a group chat.
 * - Feeling: a well-kept travel notebook — warm paper, teal ink, postmark red.
 *   Calm, tactile, a little analogue; never glossy SaaS.
 * - Type: Fraunces (display, editorial serif) + Inter (UI text).
 * - Signature: postmark vote stamps and perforated ticket-stub days, drawn in
 *   CSS so the hero is the product itself, not an illustration of it.
 * - Voice: plain, specific, second person. No hype words.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'

const STEPS = [
  { n: '01', title: 'Start a board', body: 'Name the trip, pick the city and dates, and send the invite link to the group.' },
  { n: '02', title: 'Find places worth going to', body: 'Describe what you feel like. Tripboard searches the web and lists named places, each with the page it came from.' },
  { n: '03', title: 'Vote together, live', body: 'Everyone taps “count me in” on what they would actually do. The shortlist reorders as votes land, and you can see who is looking at what.' },
  { n: '04', title: 'Get the plan', body: 'Claude turns the most-voted places and the forecast into morning, afternoon and evening for each day — with a rain plan — and emails it to everyone.' },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="paper-ruled min-h-screen">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <span className="font-display text-xl font-bold tracking-tight">Tripboard</span>
          <Link to="/home" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </header>

        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-stamp">For groups going somewhere</p>
            <h1 className="mt-4 font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
              Plan the trip together, not in the chat.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              One live board for the whole group: find places, vote on them, and get a day-by-day plan built around what
              people chose and what the weather will do.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/home"
                className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Start a trip board
              </Link>
              <span className="text-sm text-muted-foreground">Free for your group. Sign in with Google or GitHub.</span>
            </div>
          </div>

          <BoardMock />
        </section>

        <section className="border-t border-border bg-card/70">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 className="font-display text-3xl font-semibold">How a trip comes together</h2>
            <ol className="mt-8 divide-y divide-dashed divide-border border-y border-dashed border-border">
              {STEPS.map((s) => (
                <li key={s.n} className="grid gap-2 py-6 md:grid-cols-[80px_260px_1fr] md:gap-8">
                  <span className="font-display text-2xl text-stamp">{s.n}</span>
                  <h3 className="font-display text-xl font-semibold">{s.title}</h3>
                  <p className="text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <footer className="mx-auto max-w-6xl px-5 py-10 text-sm text-muted-foreground">
          Tripboard · built on DeepSpace · weather from OpenWeather, place search by Exa, plans by Claude.
        </footer>
      </div>
    </>
  )
}

/** The hero visual is the product: a static rendering of a live board. */
function BoardMock() {
  const places = [
    { name: 'Miradouro da Senhora do Monte', kind: 'viewpoint', votes: 4, who: ['AN', 'JM', 'SK', 'TL'] },
    { name: 'Manteigaria', kind: 'bakery', votes: 3, who: ['JM', 'SK', 'TL'] },
    { name: 'Museu Nacional do Azulejo', kind: 'museum', votes: 2, who: ['AN', 'SK'] },
  ]
  return (
    <div aria-hidden className="relative">
      <div className="rotate-[0.6deg] rounded-md border border-border bg-card p-5 shadow-[var(--shadow-card-hover)]">
        <div className="flex items-end justify-between border-b border-border pb-3">
          <div>
            <p className="text-xs text-muted-foreground">Lisbon, PT · 12–14 Dec</p>
            <p className="font-display text-2xl font-bold">Lisbon long weekend</p>
          </div>
          <div className="flex -space-x-2">
            {['AN', 'JM', 'SK', 'TL'].map((i, k) => (
              <span key={i} className={`inline-flex size-8 items-center justify-center rounded-full border-2 text-[11px] font-semibold ${k < 3 ? 'border-primary bg-primary text-primary-foreground' : 'border-card bg-muted text-muted-foreground'}`}>
                {i}
              </span>
            ))}
          </div>
        </div>
        <ul className="mt-4 space-y-3">
          {places.map((p, i) => (
            <li key={p.name} className="relative flex items-center gap-4 rounded-md border border-border bg-background/60 p-3">
              <div className="stamp flex size-12 shrink-0 flex-col items-center justify-center text-stamp">
                <span className="font-display text-lg font-bold leading-none">{p.votes}</span>
                <span className="text-[8px] font-semibold uppercase">of 4</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-semibold">{p.name}</p>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{p.kind}</p>
              </div>
              <span className="hidden text-[11px] text-muted-foreground sm:block">{p.who.join(' · ')}</span>
              {i === 1 && (
                <span className="absolute -top-2.5 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">Ana looking</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="ticket absolute -bottom-10 -left-4 hidden w-64 -rotate-3 rounded-md border border-border py-3 pl-6 pr-4 shadow-[var(--shadow-card-hover)] sm:block">
        <p className="font-display font-semibold">
          Sat 13 Dec <span className="font-normal text-muted-foreground">· Alfama</span>
        </p>
        <p className="mt-1 text-xs">
          <span className="font-semibold uppercase tracking-wider text-muted-foreground">Morning</span> Miradouro, then coffee
        </p>
        <p className="text-xs text-primary">If it rains: Azulejo museum</p>
      </div>
    </div>
  )
}
