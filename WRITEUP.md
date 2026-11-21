# Tripboard: build exercise writeup

**Live:** https://tripboard.app.space · **Repo:** https://github.com/quochung2572007-cloud/tripboard

## What I built

A real-time, multi-user trip board. A group joins from an invite link, finds places with a grounded web search, votes on them live (with presence), and gets a day-by-day itinerary from Claude. The itinerary ranks places by votes, uses the forecast (outdoor on dry days, indoor on wet days, rain alternatives), and can be emailed to everyone.

The core path, all working on the deployed app:
**create trip → share link → friend joins → search & add places → vote live → forecast → build plan → email plan.**

## DeepSpace integrations used, and why

- **Exa (`exa/search`)** + **Claude (`anthropic/chat-completion`)** for place discovery. Exa returns real pages for "pastry shops in Lisbon". Claude Haiku 5.5 extracts named places from those pages. Each place must cite a fetched page by index; uncited, unnamed or duplicate entries are dropped in `validateSuggestions`. The result is a list of real places with a source link, not model memory.
- **Claude Sonnet 5.5** for the itinerary. It gets the vote-ranked shortlist and daily forecast and returns strict JSON. `validateItinerary` maps the reply onto the exact trip dates and three ordered slots, and strips any place id that isn't on the board. Bad JSON gets one retry.
- **OpenWeather (`geocoding`, `forecast`)**. The destination is resolved once at creation. The 3-hour forecast is rolled up into daily highs, lows, conditions and a "wet" flag, then cached on the trip row for 3 hours. Every member sees the same weather the planner used, and one fetch serves the whole group.
- **Email (`email/send`)** to send a plan version to all members. Member emails are read server-side and never sent to the client.

**Left out on purpose:**
- **SerpApi Google Maps places.** This was my first choice, but during the build the platform's SerpApi account returned `429: Your account has run out of searches`. I switched to Exa + Claude extraction, which also gives a source page per place.
- **Maps/tiles.** No map integration in the catalog. A "Map" link opens Google Maps instead of shipping a heavy map library.
- **AI chat.** A one-shot structured plan fits this better than open-ended chat.
- **Payments, file uploads, Yjs co-editing.** They don't serve the core flow.
- **Cron.** On-demand forecast with a cache is cheaper than polling every trip.

## Platform primitives (instead of re-implementing them)

- **Privacy = DeepSpace teams.** Every trip-scoped collection uses `read: 'team'` with a `teamField`, resolved against a `team_members` collection. The trip row is its own team (`teamField: '_rowId'`). The RecordRoom filters rows in SQL before broadcast, so an uninvited user's socket never receives them. This is verified in the e2e test with an outsider account.
- **Vote integrity via schema.** `uniqueOn: ['placeId','userId']`, `userBound` + `immutable` user column, `ownerField`, `writableFields`. Votes are the one client-writable collection, so they feel instant, and the server still refuses a forged duplicate (tested).
- **Server actions** for anything that needs membership checks or spends owner credits. Each action calls `requireMember` with the verified JWT caller, because actions run with RBAC off.
- **Integration proxy:** no API keys in the repo or the app. Billing is `developer`, so invited friends never need DeepSpace credits.
- **`usePresenceRoom`** for "on the board now" and "Bob looking" on the card a peer is hovering.

## The main tradeoff

**Owner-billed AI, protected by server-side gates, versus simplicity.**
Making each user pay (`billing: 'user'`) would have been simpler and safer for my wallet. But then every friend who opens an invite link would need DeepSpace credits before searching or building a plan, which breaks the "click a link and join" experience. So the owner pays, and I put the spend control on the server:
- every paid action checks trip membership
- per-user daily quotas: 25 searches, 10 trip creations
- per-trip daily quotas: 6 plan builds, 20 forecast refreshes
- the forecast is cached for 3 hours
- a shared per-trip generation lock (visible to everyone) stops two members paying for parallel builds
- email has a 10-minute cooldown

The counters are approximate under heavy concurrency (read-then-write). That's acceptable for spend control, not for accounting.

Smaller tradeoffs:
- The plan is generated synchronously in one action (~10s), not as a background job. Simpler, and fine at this size; a job would be next if plans grew.
- The forecast only covers 5 days. Trips further out plan without weather, and the UI says so.
- Local time for forecast buckets is approximated from longitude, because the flattened forecast has no timezone. It's accurate to about an hour.

## What the agent (Claude Code) did

- Read the DeepSpace docs, the agent skill, the full integration catalog, and the Evenly example's invite/membership code.
- Before choosing a design, checked the installed SDK source to confirm `'team'` permissions are enforced in SQL.
- Made one real test call to each candidate integration. This is how the SerpApi quota failure was caught early and Exa was swapped in.
- Scaffolded, wrote the schemas, server actions, pure logic + 11 unit tests, UI, theme, and a 3-account Playwright spec.
- Created the GitHub repo before the first deploy so the app's source latched to GitHub, then deployed.
- Ran a scripted live check against production (search → votes → forecast → plan → email) and reviewed screenshots. It fixed the bugs this found: duplicated place names in plan slots, avatar initials, and mobile header layout.

## Verification

Automated (`npx deepspace test run all`: 13/13 passing; `vitest`: 17/17, 14 of them for the trip logic):
- Alice creates a trip. Bob joins via the invite link. Alice sees Bob arrive (presence) without reloading.
- Places and votes sync live; the shortlist reorders for both; un-voting syncs.
- Carol (not invited) gets "This board isn't open to you", and the server refuses her `addPlace` and `generateItinerary` calls.
- A forged second vote for the same place is refused by the server (`uniqueOn`).
- Unit tests cover date validation, forecast rollup, vote ranking (non-member votes ignored), JSON extraction, suggestion grounding, itinerary normalization, and HTML escaping in the email.

Live, on https://tripboard.app.space (scripted, two accounts):
- Search for "pastry shops" returned 8 cited places in ~7s.
- The plan was built in ~9s. The other member saw the "building" state live.
- The plan put viewpoints on the clear day and the tile museum on the rainy day.
- Email was sent to both members.
- No browser console errors. No errors in `deepspace logs`.
- Total integration spend for all testing was about $0.11.

**What I verified myself:**
I ran the full core path on the live app with two real accounts: my laptop and my phone as the second person. I created a trip, joined from the phone through the invite link, searched for and added places, voted from both devices and watched the counts and order update live, built the plan, and emailed it. Everything worked. The plan email arrived, but in my **spam** folder (see next steps).

## Optimization pass (measured on production)

I measured before changing anything. Server actions were already 45–80ms median, including the Durable Object round trips. The client bundle is 157 KB gzipped, mostly React and the SDK; the trip page is 7 KB. So the work went where the time and money actually go:

| Change | Before | After |
|---|---|---|
| Shared 24h search cache keyed by (destination, normalized query), stored server-side | 7.5s and ~$0.02 every repeat | **37–49ms, $0, no quota used**; "Rooftop BARS!" matches "rooftop bars" |
| Place extraction asks for one `name \| kind \| why \| source` line per place instead of JSON | Production benchmark: a paid search failed on an unescaped quote in JSON (intermittent, depends on what Exa returns) | No escaping needed; JSON kept as fallback; one retry; 17 unit tests incl. quoted names |
| `removePlace` action deletes the place's votes (bounded `deleteWhere`) | Removing a place left orphan votes | Cascade; only the person who added it can remove it (e2e-tested) |
| Independent reads in `requireMember` and email recipients run in parallel | Sequential round trips | One round-trip of latency |

## Unfinished / next steps

- **Plan email lands in spam.** `email/send` always sends from DeepSpace's shared sender (`notifications@updates.app.space`), so deliverability isn't under the app's control. Fix: verify my own domain in Resend, store the key with `deepspace secrets set RESEND_API_KEY=…`, and send from a server action. Until then, the app should tell people to check spam.
- Edit the trip (rename, change dates) and leave a trip. Membership rows already support `status: 'left'`, but there's no UI yet.
- Rotate the invite link (revoke old links).
- Comments on places, and "must do" vs "nice to have" weights for votes.
- Move plan generation to a background job with streamed progress.
- Embed a real map once a map-tile integration exists. Use place coordinates for routing-aware days.
