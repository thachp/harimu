# POC backlog batch 7: Country, City and presence

Issue #19 and its owner comments were re-read before closure. The agreed POC scope takes priority over broader proposals: Square becomes City with compatible old URLs; Country has 2–3 static city pins and free instant travel; real same-city presence uses existing opt-in chat presence. Costs, separate city jobs/markets, batching and full city simulation remain deferred.

The official Cities page and all ten national Cities sections were read. Each country uses its capital plus the first two canonical destinations, with static lore descriptions and explicitly illustrative geography. The linked owner mockup was inspected; illustrative place names, populations, prices and online totals were not invented as live data.

- Existing World nation selection remains in the bottom strip and globe labels. Country adds accessible city pins, destination inspection, explicit free/instant confirmation and Cancel. Foreign inspection cannot travel or claim false residence.
- Old Square and new City URL aliases remain compatible. Navigation and breadcrumbs add the Country layer. Terrain controls use the visited city's name; national geometry and shared jobs/markets remain intact.
- The additive city-location table defaults existing citizens to their capital, persists current city and preserves home. Travel clears old-city presence atomically. Repeat requests are harmless, and late responses cannot hydrate a different account generation.
- Existing opt-in presence is scoped to authenticated nation/current city, includes self, expires after 90 seconds and refreshes every 15 seconds while visible. Stale, expired and foreign pings are excluded. Guests see counts unavailable. Chat stays nationwide and is labeled separately; travel resets opt-in.
- Guest visits use disposable navigation without city API writes. Travel does not alter citizenship, economic state, home ownership or work timers.

## Verification and delivery

Full checks passed 134 Node tests, 77 SQL tests, lint and TypeScript; build passed. Isolated actual API/SQLite fixtures cover applying the additive migration twice, active-shift/economy/profile preservation, repeat travel/reopen, foreign requests, nation normalization, legacy capital presence, cross-city isolation, exact expiry, stale pings and client account-generation isolation.

The additive migration was applied to the existing preview D1 without resetting data. Drizzle migration, journal and snapshot are recorded; deployment preflight verifies seven required tables. Runtime `64c9a97e8f5cc4c7cdf5b38492e9bf20b42c896d` was pushed to main and deployed as Worker version `dd770a74-9959-4768-a51a-7e531e681903` at https://preview.harimu.com and https://harimu-preview.thachp.workers.dev. Worker/D1/account bindings are unchanged.

Live acceptance verified guest keyboard travel, refresh/history, authenticated persistence and fixed home, corrected terrain labels, City/Country Back/Forward and safe foreign inspection. Mobile 390×844 checks verified three pins, keyboard Cancel, no horizontal overflow, non-overlapping HUD/dock and map content growing above the context strip. No captured preview console errors; local QA server stopped.

Automatic approval review initially rejected real presence opt-in. The user approved one brief test, which verified the count followed opt-in and opt-out. Sharing was turned off immediately and a subsequent read-only check confirmed cleanup. No message or additional economic action was sent. Private citizen location, balances and timestamps are intentionally excluded from this repository report.

Documentation remained on Vercel with its independently published revision. Production Sites, DNS, documentation content and hosting were untouched. No credentials, paid service or financial commitment was created.
