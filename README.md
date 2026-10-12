# Harimu local development

This checkout is the existing Harimu Site. Preserve `.openai/hosting.json` and
its project identity when publishing. Dependencies are already installed.

From this directory:

- `npm run dev`: local Vinext/Cloudflare preview (use the printed localhost URL).
- `npm run lint`: ESLint.
- `npx tsc --noEmit --incremental false`: TypeScript verification.
- `python3 tests/work-shifts.test.py`: work lifecycle SQL tests with SQLite.
- `npm run build`: production compilation.

Use the supported Sites source workflow for synchronization, packaging, and
deployment. Do not upload `.env*`, local database state, or authentication tokens.

## Timed citizen work milestone

The Kindle work board starts harvest (2h), freight (4h), or archive (3h) shifts.
These are real-time, tunable prototype assumptions based on GDD v0.6 section
11.1. The server owns durations, output targets, citizenship eligibility, and
capacity costs. Each citizen can have one unrecorded shift. Finishing a shift
adds a contribution receipt once; it does not yet settle wages or add goods to
market inventory. Work Capacity is spent under the existing prototype rules;
daily recovery is the next implementation step.

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

Next: implement configurable daily capacity recovery, integer wallet balances,
and atomic wage/inventory settlement before introducing the Kindle market.
