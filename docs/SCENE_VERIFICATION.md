# Connected-scene verification

The six first-release scenes share the existing citizen state and commands.
City square is the default; world, home, workplace, market and government have
query URL deep links. Nation and planning legacy links remain supported.

Validated locally with the Cloudflare/Vinext preview:

- Page and `/api/world` return HTTP 200; unauthenticated `/api/citizen` returns 401.
- World and city hub render; Home displays persisted demo food, capacity and shift.
- Market Forward restored its heading and selected navigation after Back to World.
- Enter on the Market → Home button changed the URL to Home.
- Government displays deterministic officials/proposals and petition actions.
- At 390 × 844, World and Government layouts fit; document width matches viewport.
- Scene transitions focus the scene heading. Mobile navigation uses two rows.

The initial D1 check rejected a six-way inventory compound query. The inventory
view now derives four distinct item sources and calculates transfers separately;
SQLite regression coverage uses a five-term compound limit. D1 bootstrap and
world reads passed after the correction.

Economic SQL tests cover whole-lot escrow, conserved money/goods, eligibility,
request reuse, restart, rollback and competing fill/cancel transactions. Pure
rules tests cover government constraints, briefing priorities and scene URLs.

Limits: Browser QA used the explicit browser-local demo. Authenticated two-account
D1 player transfers and live Clerk sign-in were not exercised end to end. Timed
shift completion remains covered by production SQL tests rather than waiting
hours in the browser. Presence/chat, elections/protests, wider national markets,
and cross-border routes are honestly labeled future systems. Seeded noticeboard
items are scenario content, not an active live election feed.
