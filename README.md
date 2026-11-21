# Tripboard

**Plan the trip together, not in the chat.** A live board where a group finds places, votes on them, and gets a day-by-day plan built around those votes and the weather.

**Live:** https://tripboard.app.space · Built on the [DeepSpace SDK](https://docs.deep.space) (0.44.2)

## What it does

1. **Start a board.** Pick a trip name, city and dates. The city is geocoded once (OpenWeather) so weather and search agree on the place.
2. **Invite by link.** Anyone with the link signs in (Google/GitHub) and joins. Only members can see the board. This is enforced by the server, not hidden in the UI.
3. **Find places.** Describe what you feel like ("pastry shops", "sunset viewpoints"). Exa searches the web, then Claude pulls out *named* places from those pages. Every suggestion has to cite one of the fetched pages, and anything without a source is dropped.
4. **Vote live.** "Count me in" on what you'd actually do. Counts, order and voters update for everyone instantly. You can see who has the board open and which card each person is looking at.
5. **Get the plan.** Claude turns the most-voted places and the 5-day forecast into morning / afternoon / evening for each day, with rain alternatives. Everyone sees "Bob is building the plan…" while it runs. Each build is a new version, and any version can be emailed to the whole group.

## DeepSpace primitives used

| Primitive | Where | Why |
|---|---|---|
| RecordRoom collections + `read: 'team'` + `teamField` | `src/schemas/trip-schemas.ts` | Each trip is a team. The Durable Object filters rows in SQL, so non-members never receive them. The trip row is its own team (`teamField: '_rowId'`). |
| `uniqueOn` + `userBound` + `ownerField` + `writableFields` | `votes` schema | One vote per person per place, checked on the server; a client can't vote as someone else. |
| Server actions (RBAC-off, verified caller) | `src/actions/*` | Membership-checked orchestration: invite join, adding places, owner-billed integration calls. |
| Integration proxy (`tools.integration`) | `src/actions/*`, `src/integrations.ts` | No API keys in the app. Calls are owner-billed and gated by membership and daily quotas. |
| `useQuery` / `useMutations` (real-time) | `src/pages/(app)/(protected)/trip/[id].tsx` | Places, votes, members and plan versions stream to every member. |
| `usePresenceRoom` | trip page | "On the board now" and "Bob looking" on cards. |
| Auth (`AuthGate`, `useAuth`, `useUserLookup`) | `(protected)` routes | Sign-in, and peer names without exposing emails. |

### Integrations (4)

| Integration | Used for |
|---|---|
| `exa/search` | Finding web pages about what the group wants in the destination |
| `anthropic/chat-completion` | Haiku 5.5 extracts cited places from those pages; Sonnet 5.5 writes the itinerary |
| `openweathermap/geocoding` + `/forecast` | Resolving the destination; daily forecast cached on the trip for 3h |
| `email/send` | Emailing a plan version to every member |

## Project layout

```
src/schemas/trip-schemas.ts   collections + permissions (the privacy model lives here)
src/actions/                  server actions: trips (create/invite/join), places (search/add), plan (weather/itinerary/email)
src/lib/trip-logic.ts         pure logic: forecast rollup, vote ranking, prompt building, model-output validation, email HTML
src/components/trip/          board UI: header + presence, place finder, shortlist, weather, plan
src/pages/                    landing (static), /home, /trip/:id, /join/:token
tests/trip.spec.ts            3-account e2e: invite, live votes, presence, outsider refused, duplicate vote refused
```

## Run it

Requires Node 22.15+/24 and npm 11.6+.

```bash
npm install
npx deepspace auth login
npx deepspace dev start          # local dev
npx vitest run                   # unit tests (pure logic)
npx deepspace test run all       # smoke + api + e2e (needs test accounts Alice, Bob, Carol)
npx deepspace deploy
```

No secrets are needed: every third-party call goes through the DeepSpace integration proxy.

See [WRITEUP.md](./WRITEUP.md) for the design decisions, tradeoffs and verification.
