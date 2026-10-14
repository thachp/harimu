# AI spend control (#45)

AI news, Notables and (with #46) Cabinet responses are gated by two guards. Neither needs a daily edit.

1. **Durable daily budget (in the app).** `HARIMU_AI_DAILY_BUDGET_MICRO` (integer micro-USD, 1..970000) sets the per-UTC-day
   cap enforced atomically in `harimu_ai_reservations`. The code ceiling `aiDailyBudgetMicroUsd` (US$0.97) can only be lowered by env.
2. **Cloudflare AI Gateway (at the edge).** Every Workers AI call passes `{gateway:{id:HARIMU_AI_GATEWAY_ID}}`.
   Rate limits and spend logs are configured on that gateway in the Cloudflare dashboard.

Fail closed: a missing or invalid budget or gateway id, an exhausted budget, or an unpriced model means no inference;
authored content is shown instead.

## Price table
`lib/ai-budget.ts` holds a versioned table (`aiPriceTableVersion`, `aiPricesVerifiedAt`) of per-call reservation upper bounds.
When it is older than `aiPriceStaleAfterDays` (30), a warning is logged once per isolate and `/api/notables` reports
`budget.pricesStale: true`. Staleness never blocks AI; only a model missing from the table does.
To re-verify: check Workers AI pricing, update the amounts if needed, bump the version and date.

## Owner steps (dashboard, one time)
- Create AI Gateway `harimu-preview` (account of the preview Worker). Enable logging.
- Add a rate limit (suggested: 60 requests / 1 minute, sliding) and, if available, a spend alert near US$1/day.
- Only then set `HARIMU_AI_NEWS_ENABLED` / `HARIMU_NOTABLES_ENABLED` to `true`.

## Concurrency and outages
- Reserving is one atomic conditional `INSERT ... SELECT`, followed by a committed re-check. If a racing writer under
  READ COMMITTED pushed the day over the cap, the over-cap pending row is withdrawn before any inference (ties fail closed).
  PostgreSQL writes also serialize on the adapter's transaction advisory lock.
- A pending/uncertain reservation from an earlier UTC day blocks new reservations for `aiUncertainBlockTtlSeconds` (1h)
  after it started. After that it stops blocking. An `uncertain` row (the request was handed to the gateway and the
  outcome is unknown) keeps its full charge.

## Reservation lifecycle (#92)
- **No reservation without inference.** Only an enabled feature with a valid budget *and* gateway id reserves. Database
  readiness never writes `harimu_ai_reservations` (the old preview acceptance ledger/prebook was removed).
- **Not sent = not charged.** If a sequence fails before any request is handed to the gateway, its `pending` row is deleted.
- **Stale pending expires.** A `pending` row older than `aiPendingExpirySeconds` (1h) has no evidence of a gateway call:
  it stops counting immediately and is deleted on the next reservation.

## Preview cleanup (PM step, #92)
Preview readiness used to insert hard-coded `acceptance:2026-10-14:*` rows (959,000 micro-USD on Oct 14 and Oct 15)
that never went through `harimu-preview`. After deploying #92, PM runs, against the **preview** database only:

```
psql "$PREVIEW_DATABASE_URL" -c "SELECT request_id,status,reserved_micro FROM harimu_ai_reservations WHERE request_id LIKE 'acceptance:%'"   # dry run
psql "$PREVIEW_DATABASE_URL" -1 -f db/postgres/maintenance/092_release_unspent_ai_reservations.sql
```
It is idempotent (a second run deletes nothing) and leaves real reservations alone. Confirm with `GET /api/notables`
(`budget.remainingMicroUsd` should be back near the daily budget). Deploy #92 first, or old readiness re-inserts the rows.
