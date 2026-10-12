# Harimu local development

This checkout is the existing Harimu Site. Preserve `.openai/hosting.json` and
its project identity when publishing. Dependencies are already installed.

From this directory:

- `npm run dev`: local Vinext/Cloudflare preview (use the printed localhost URL).
- `npm run lint`: ESLint.
- `npx tsc --noEmit --incremental false`: TypeScript verification.
- `python3 tests/work-shifts.test.py`: work lifecycle SQL tests with SQLite.
- `python3 tests/economy.test.py`: atomic wages/inventory, concurrent claims, recovery and restart tests.
- `node --experimental-strip-types tests/economy-config.test.mjs`: recovery configuration tests.
- `npm run build`: production compilation.

Use the supported Sites source workflow for synchronization, packaging, and
deployment. Do not upload `.env*`, local database state, or authentication tokens.

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

Next: a Kindle market with atomic wallet/inventory transfers and bounded listings;
then household food consumption to give wages and goods a daily purpose.
