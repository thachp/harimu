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
- **Sent is persisted first.** Before the first gateway call the row is marked `uncertain` (sent, outcome unknown).
  It never expires and is never released, so a crash mid-call stays charged and keeps its id (Notable replay guard).
- **Stale pending expires.** A `pending` row (never marked sent) older than `aiPendingExpirySeconds` (1h) has no evidence of a gateway call:
  it stops counting immediately and is deleted on the next reservation.

## Preview cleanup (#92): automatic, in-app
Preview readiness used to insert hard-coded `acceptance:2026-10-14:*` rows (9 rows, 959,000 micro-USD on Oct 14 and
Oct 15; most already `finished`) that never went through `harimu-preview`. After #92 deploys:
- `readAiBudget` ignores any `acceptance:%` row immediately, so the budget readout is restored on the first read.
- The next reservation (`expireStaleAiReservations`, run inside every `reserveBudget`) deletes them. It is idempotent and
  is the same plain `DELETE` the app role already runs for over-cap rows, so no elevated privilege is needed.
- Real rows (UUID / `notable:` / `cabinet:` ids) are untouched whatever their status, including sent/`uncertain` ones.
- Rollout window: old isolates may re-insert rows for a minute or so after deploy; they are ignored on read and deleted
  again on the next reservation. Keep AI flags off until `GET /api/notables` shows `budget.remainingMicroUsd` restored.

### Optional manual fallback (only if the in-app release cannot run)
Preview readiness used to insert hard-coded `acceptance:2026-10-14:*` rows (959,000 micro-USD on Oct 14 and Oct 15)
that never went through `harimu-preview`. After deploying #92, PM runs, against the **preview** database only:

1. Deploy #92 to preview first (old readiness would re-insert the rows).
2. Dry run (expect 9 rows, 959,000 total):
   `psql "$PREVIEW_DATABASE_URL" -c "SELECT request_id,status,reserved_micro FROM harimu_ai_reservations WHERE request_id LIKE 'acceptance:%'"`
3. Snapshot for rollback:
   `psql "$PREVIEW_DATABASE_URL" -c "SELECT * INTO harimu_ai_reservations_backup_092 FROM harimu_ai_reservations WHERE request_id LIKE 'acceptance:%'"`
4. Clean: `psql "$PREVIEW_DATABASE_URL" -1 -f db/postgres/maintenance/092_release_unspent_ai_reservations.sql`
5. Rollout window: between the deploy and full rollout, old isolates still run the removed readiness code and can
   re-insert the `acceptance:%` rows (within ~1 minute each). Keep AI flags off until cleanup is confirmed. A few minutes later re-run the dry-run SELECT; if rows reappear, run step 4
   again (idempotent). Then check `GET /api/notables` → `budget.remainingMicroUsd` is back near the daily budget.

**Rollback:**
`psql "$PREVIEW_DATABASE_URL" -1 -c "INSERT INTO harimu_ai_reservations SELECT * FROM harimu_ai_reservations_backup_092 ON CONFLICT (request_id) DO NOTHING"`
Without a snapshot, the rows can be rebuilt from `aiAcceptanceCharges` in `git show 8f27353^:lib/ai-acceptance-charges.ts`
(day 2026-10-14, next day 2026-10-15, plus `acceptance:2026-10-14:news-final`, 72,400, finished). Drop the backup table
once preview AI is confirmed healthy: `DROP TABLE harimu_ai_reservations_backup_092`.
A direct `psql` write bypasses the app adapter's protected rollback journal, so this snapshot is the only undo record.
