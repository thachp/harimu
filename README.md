# Harimu Cloudflare development

Canonical design source: [official Harimu documentation, GDD v0.7](https://docs.harimu.com/). Patrick designated this site as the source of truth; it supersedes the older PDF when they differ. Preserve direct user requirements and review [documented gaps/conflicts](docs/OFFICIAL_DOCS_ALIGNMENT.md) before subsequent implementation.

All development deploys to **https://preview.harimu.com**, a fresh isolated Cloudflare world. Production at harimu.com remains on Sites until a good proof of concept and a separate launch decision. Docs remains on Vercel. See [Cloudflare development](docs/CLOUDFLARE_DEVELOPMENT.md) for the default guarded workflow. Preserve `.openai/hosting.json` as historical production identity; do not publish development through Sites.

From this directory:

- `npm run dev`: local Vinext/Cloudflare preview (use the printed localhost URL).
- `npm run lint`: ESLint.
- `npx tsc --noEmit --incremental false`: TypeScript verification.
- `python3 tests/work-shifts.test.py`: work lifecycle SQL tests with SQLite.
- `python3 tests/economy.test.py`: atomic wages/inventory, concurrent claims, recovery and restart tests.
- `python3 tests/market.test.py`: merchant transfers, household meals, conservation, concurrency and rollback.
- `node --experimental-strip-types tests/market-validation.test.mjs`: market command validation.
- `node --experimental-strip-types tests/economy-config.test.mjs`: recovery configuration tests.
- `python3 tests/player-market.test.py`: reservations, whole-lot transfers and concurrent fills.
- `python3 tests/government-petitions.test.py`: petition eligibility, replay and daily limits.
- `node --experimental-strip-types tests/player-market-validation.test.mjs`: bounded commands and exact prices.
- `node --experimental-strip-types tests/government-rules.test.mjs`: regime and proposal rules.
- `node --experimental-strip-types tests/daily-briefing-rules.test.mjs`: daily priority rules.
- `node --experimental-strip-types tests/scene-navigation.test.mjs`: scene URLs and history restoration.
- `npm run build`: direct Cloudflare development compilation.
- `npm run check`: full Node/SQL suites, lint and types.
- `npm run deploy`: checks, build and guarded development deployment.

Commit/push source through Git and use the guarded Cloudflare deploy command. Do not upload `.env*`, local database state, or authentication tokens. Development must not deploy to Sites, apex/www, or docs.


See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch flow: feature PRs go to `dev`, preview deploys from `dev`, and PM release PRs go from `dev` to `main`.

## Wrangler version (required)

Preview deploys require **wrangler 4.92.0**, pinned exactly in `package.json` devDependencies and in `package-lock.json`. Newer releases (4.151 and later) reject the `legacy_env` key in the vinext-built `dist/server/wrangler.json`. The deploy script therefore removes `legacy_env: true`, which was the old default; wrangler states that removing it does not change the deployment. Both 4.92.0 and 4.151.0 then pass `wrangler deploy --dry-run`. `npm run deploy:cloudflare` refuses to run unless the project-local wrangler matches the pin. Run `npm ci` and never deploy with a global or `npx` wrangler. Before bumping the pin, check `npm run deploy -- --dry-run` (bundles with `wrangler deploy --dry-run`, without remote D1 access or upload) on the new version.

## Timed citizen work milestone

The Kindle work board starts harvest (2h), freight (4h), or archive (3h) shifts.
These are real-time, tunable prototype assumptions based on GDD v0.6 section
11.1. The server owns durations, output targets, citizenship eligibility, and
capacity costs. Each citizen can have one unrecorded shift. Finishing a shift
adds a contribution receipt, wages, and personal inventory together once.
Harvest pays 8.00 SPK + 4 food; freight pays 12.00 SPK + 2 materials; archive
pays 6.00 SPK + 1 knowledge. These are prototype rewards, separate from the
public production targets printed on the board; shared national stockpiles are
not yet simulated. Reward terms are snapshotted when work starts.

Authenticated shifts persist in D1 and are returned with the citizen snapshot.
Start/debit and completion/receipt operations use transactional batches. A
partial unique index additionally prevents overlapping shifts. Repeating a
completion request cannot duplicate the receipt. After a connection error,
retrying a start retrieves the active shift with a conflict response; refreshing
also restores it. Timers use absolute timestamps, so offline time counts.

When Clerk is absent, the UI explicitly labels a browser-local demo. Its citizen,
plan, decision, and shift state persist in localStorage, with no shared-world
authority. Server routes continue requiring authentication.

The database bootstrap installs the additive `work_shifts` table/index on first
access. Existing citizens, work orders, decisions, and contributions are retained.
The Drizzle schema includes the new table. No external services were provisioned.

The SQLite tests execute the production SQL for capacity/overlap guards,
cross-account and cross-nation denial, premature completion, replay after a
database restart, and atomic rollback. Browser authentication and real-time
multi-client concurrency should receive additional end-to-end coverage before
calling this a complete citizen economy.

## Citizen economy milestone

Money uses integer Spark cents (100 = 1 SPK). The append-only settlement row is
a transfer from a persisted, finite Kindle employer pool to one citizen. Wallet
balances and personal inventory are derived from those settlement rows, so they
cannot diverge during an interrupted payout. The pool starts at 100,000 minor
units (1,000 SPK), once per database. It is a prototype budget assumption, not
the display treasury balance. There is no public funding or minting endpoint.
If the pool cannot pay, the finished shift remains unclaimed and can be retried;
production funding/supply design is still required. Legacy completed v9 shifts
are not retroactively paid. Existing unfinished shifts receive reward terms once.

Capacity recovers by 24 WC per complete interval, capped at 24, with offline
catch-up and an atomic persisted recovery clock. Default: 86,400 real seconds.
Configure `HARIMU_CAPACITY_RECOVERY_SECONDS` on the server to an integer from
60 to 604,800; invalid values fall back to the default. This keeps the GDD's
ambiguous daily/game-day cadence tunable. Clock initialization starts when an
existing citizen next accesses the account; it does not invent retroactive
recovery before the feature existed. Refreshing the citizen account displays the
current authoritative balance, inventory, and recovery time without overwriting
private planning drafts.

`shift_settlements`, `shift_rewards`, `capacity_clocks`, and `economy_funds` are
additive bootstrap tables. Clerk-disabled demos simulate these rules only in
browser storage; production API authentication remains required.

Additional tests cover simultaneous claim transactions, recovery rollback,
clock reversal and offline catch-up, fractional money denial, exhausted funds,
and failure/retry after the settlement insert. SQLite tests establish rule and
transaction behavior; they do not replace full authenticated D1/browser testing.

The design companion and vocabulary are in [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
and [docs/CONTEXT.md](docs/CONTEXT.md). The original PDF stays outside this source
checkout. No environment files, credentials, local databases or build output are
included in source synchronization.

## Kindle market and household milestone

Enrolled Kindle citizens can buy/sell 1–10 units of food, materials, or knowledge.
This is an explicitly labeled simulated merchant, not player liquidity or a full
order book. Prices are persisted server-side: food 1.50/1.00 SPK buy/sell,
materials 3.00/2.00, knowledge 5.00/3.50. Starter merchant stocks are 100/40/20;
the finite merchant pool begins at 1,000 SPK once per database. These are tunable
prototype assumptions, separate from the employer and display treasury.

Each trade is one durable transfer event carrying integer money and goods deltas.
Citizen wallet/inventory and merchant balances are derived from the same events.
The INSERT resolves price and checks citizenship, stock and funds atomically;
client prices, outcomes and account identifiers are not authoritative. Request
UUIDs bind the intent to an authenticated owner. Retries return the original
receipt, while cross-account or mismatched-intent reuse is refused. On an
ambiguous connection/server failure, the UI retains the request UUID and offers
Retry previous transaction before permitting another market action. Refreshing
restores authoritative balances; a newly submitted request is a new intent.

Kindle accounts receive two starter food once, including existing accounts on
first access. Changing citizenship never grants more. A household meal consumes
two food and restores up to four WC, capped at 24, once per capacity-recovery
interval. Food/capacity/eligibility and the cooldown are checked server-side.
Food debit, bonus and the applied marker form one transaction. Meals at full
capacity are refused to prevent wasting food. Regular offline capacity recovery
continues; meals are a daily bonus, without an absence penalty. The 2-food/4-WC
values are playtest assumptions consistent with the GDD wellbeing loop.

The public production targets remain illustrative; the market uses actual
personal rewards, balances and goods. Other nation markets, larger verified-tier
trading, automatic matching, fees, production supply/replenishment, and
persistent household wellbeing beyond meals remain future work. Browser-local
demos mirror basic interactions only and are not authoritative or safe for
concurrent tabs. Production API authentication remains enforced.

Additive tables: `market_items`, `starter_food_grants`, `citizen_economy_events`.
Balance views include shift rewards, trades, starter goods, and meals. Initial
merchant stock and funding are never reset by normal bootstrap. SQL tests cover
buy/sell conservation, insufficient wallet/stock/merchant funds, replay after
restart, wrong-nation/unenrolled accounts, cross-account reuse, malformed amounts,
write failure, meal cooldown/rollback, one-time grants, consistent snapshots,
concurrent buyers for the final good, and concurrent duplicate meal requests.

## Connected citizen scenes

The city square connects the daily Home → Workplace → Market loop, with World
and Government as adjacent scenes. Scene URLs preserve browser Back/Forward and
support direct links. Existing nation dossiers and planning remain accessible.
Home owns the briefing, belongings and meals; Workplace owns timed shifts;
Market separates the finite simulated merchant from real player listings.
Illustrative borders/routes, seeded news and future social features are labeled;
the chat uses authenticated nation-scoped messages rather than fabricated residents. Elections remain planned.

## Player market

Authenticated Kindle citizens create whole-lot listings of 1–10 owned goods at
0.01–10.00 SPK per good, with at most five open listings. Open lots reserve goods,
so they cannot also be eaten or sold. One atomic fill records both cash and goods
transfers in integer cents; cancellation returns the reservation once. The server
checks citizenship, ownership, stock, balance and closed status. Request IDs bind
the full intent, and the UI retains uncertain requests for retry. Player offers
are actual persisted listings; browser demos do not manufacture counterparties.
Owners may cancel reserved goods after a citizenship change.

Additive listing/fill/cancellation tables and a versioned atomic balance-view
migration retain existing economic events. SQL tests cover reservation, bounds,
conservation, eligibility, rollback, concurrent fills/cancellation and replay.
Full authenticated multi-browser D1 testing remains additional coverage.

## Government and briefing

All first-release government offices are AI/SI-controlled; player officeholding
is deferred. The present runtime is explicitly a deterministic rule-bound
simulation, with no model service or new credentials. Kindle, Korund and Aurelle
retain distinct institutions. One citizen petition per UTC day affects the
proposal priority and locks the citizenship grace period. Food emergencies take
precedence; spending proposals are bounded by verified funding and do not debit
funds. Kindle uses its remaining work-programme pool, not the illustrative
national treasury. Other nations have no connected programme funding.

Elections, protests, public opinion and wider regimes require future authoritative
systems; they are described as planned rather than presented as working polls.
The requirement override is [docs/REQUIREMENT_CHANGES.md](docs/REQUIREMENT_CHANGES.md).
The daily briefing uses current citizen snapshots to prioritize a finished shift,
food or capacity, with direct scene navigation and refresh. Demo state remains
browser-local and separate from authenticated citizens.

## City conversation and recorded petition reviews

Signed-in enrolled citizens share a nation-only plain-text square feed with random
pseudonyms; account IDs and display names are not public chat metadata. The feed
shows the latest 50 messages visible for 7 days. Expired rows are deleted on the
next square access; this is lazy cleanup rather than a scheduled purge. Posting
requires 1–280 characters, a same-origin session request and a UUID intent. Atomic
rules enforce 10 seconds between posts and 20 per hour, including removed messages.
Citizens can remove their own messages and mute/unmute other pseudonyms locally.
Presence is opt-in and exposes only an aggregate count, expiring after 90 seconds;
the UI refreshes every 15 seconds while visible. Demo mode cannot post or announce
presence. There is no external moderation service or fabricated report processing.

Petitions are pending until their UTC day ends. The next government visit records
an immutable daily review and resolves petitions as accepted/deferred with reasons.
The accepted priority sets the next day's proposal; current food safety overrides
and current funding bounds apply without changing the historical record. Proposals
do not spend or mint funds. Citizens see only their own history for the current
nation. Processing is bounded to 30 outstanding days per read, with 14 recent own
petitions displayed. Government remains explicitly deterministic, not a live model.

Citizen API responses are private/no-store. Account transitions clear private
snapshots and ignore obsolete in-flight responses. No new accounts, credentials,
paid services or external infrastructure were provisioned for these features.

## Shared game shell

World, city square, Household, workplace, market and government share a full-width
resource/status bar and location navigation. The 3D square terrain occupies the
left side; the persistent right sidebar contains the current scene's context
and actions, extending to the bottom. A separate strip beneath the terrain shows
scene-specific belongings, jobs, goods/listings, government offices or nations.
These strips use current snapshots; they do not manufacture player listings or
named officials. Job cards reveal details; starting work remains an explicit
sidebar action. Mobile stacks terrain, a horizontally scrollable context strip,
and the action panel without covering controls.

Scene history preserves framework metadata and handles marked same-path
Back/Forward entries without restoring stale RSC snapshots. Collapsing a panel reclaims its space while
keeping the current scene and camera; selecting a location or reopening restores
its actions. Keyboard terrain controls: arrows to pan, +/− to zoom, Home to
centre, Enter to select, Escape to close details. World/city camera geometry
persists through scene transitions in memory; it carries no citizen identity.

Citizen writes require a matching Origin and bounded JSON command bodies.
The additional parser tests run with `node --experimental-strip-types
tests/command-request.test.mjs`. SQL tests validate chat, petition reviews and
account isolation; full authenticated multi-browser Clerk/D1 coverage remains
necessary beyond the browser-local demo checks.


## Globe, Household and interface refinement

World is a rotatable fictional globe with procedural Earth-like land, ocean and
polar ice. It uses no third-party map assets or real-country boundaries. Drag
or use arrow controls to rotate; scroll or use +/− to zoom. The expandable nation
menu provides a keyboard alternative for all ten nations, including those behind
the globe. The 3D city remains unchanged.

The dark contextual sidebar collapses completely and returns its width to the
scene and bottom strip. Its reopen button receives keyboard focus; Escape closes
scene details while authentication overlays retain their own behavior.

Household replaces Home. Legacy `?view=home` and `?view=planning` links resolve to
Household. The former Citizen Plan scene and header CTA have been removed. Private
notes, horizon/task drafts, and existing one-time civic commitment outcomes are
preserved in Household's expandable notes section. Draft editing is locked during
saves, and commitments require sufficient capacity. Government remains explicitly
a deterministic simulation; no model integration or new credentials were added.

Clerk's neutral, input, menu and modal theme now uses readable light text on dark
surfaces. Account controls are compact, and focus/hover states are scoped to Clerk
components so authentication behavior and security settings stay intact.

## Local two-account integration verification

`node --experimental-strip-types tests/local-account-integration.test.mjs`
executes the actual citizen/square GET and POST handlers and database bootstrap
against temporary SQLite files through a small D1-compatible adapter. It substitutes
fixture identities for Clerk only inside temporary compiled test copies and freezes
the clock to a fixed UTC day. It starts no HTTP server and uses no credentials,
real accounts, network requests, or production D1 data. Reopening the database tests
persistence independently of the request/session fixture.

The fixtures check simultaneous private draft saves, decision/account isolation,
private/no-store response headers, anonymous and foreign-origin denial, own-only
pending/resolved petition history, cross-account UUID reuse, nation-scoped chat,
pseudonymous public metadata, ownership deletion and aggregate-only presence.
The player-market/economy SQL suites additionally use independent SQLite connections
and synchronized race starts for owner cancellation vs buyer fill, duplicate and
foreign settlement claims, and competing claims against a finite employer fund.
They check conservation and original-request replay after reconnect.

These tests verify local handler/storage boundaries and SQL transaction behavior.
They do not establish real Clerk session authentication, Cloudflare D1 runtime
semantics, browser account switching, or authenticated multi-browser concurrency.

## Direct Cloudflare hosting

See [the migration runbook](docs/CLOUDFLARE_MIGRATION.md) for the isolated Workers preview, complete production-data transfer, docs-hosting constraints, and rollback. `npm run build:cloudflare` builds without the Sites plugin; `npm run deploy` is the default tested development deployment. Its guard pins the preview Worker and isolated D1 and rejects production routes. Production launch is deferred; its future data-export requirements do not block the fresh development world.

## Postgres migrations (#119)

Postgres (Hyperdrive) never bootstraps schema, so numbered `db/postgres/NNNN_*.sql` files are applied by
`npm run db:postgres:migrate` and recorded (with a SHA-256 checksum) in `schema_migrations`:

- Each pending file runs in its own transaction, in order, under an advisory lock; any failure rolls that file back and stops.
- First run backfills migrations through `0010` as applied **without re-running them**, and only if every table they create already exists.
- Migrations must stay idempotent and additive. SQL that drops, truncates, deletes or renames is rejected unless the file carries `-- harimu:destructive-reviewed` after manual review. Editing an applied file fails; add a new one.
- `npm run db:postgres:migrate -- --dry-run` lists what would run. It needs `PREVIEW_DATABASE_ADMIN_URL` (admin role with CREATE on `public`), never the app role.
- `npm run deploy` refuses to upload when storage is Postgres and any migration is unrecorded, edited, or missing tables (needs `HARIMU_POSTGRES_URL` or `PREVIEW_DATABASE_ADMIN_URL`).
