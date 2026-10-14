# Kindle account-level election preview

Patrick approved this preview-only exception during the #25 review to complete #25: signed-in Kindle citizens may vote without Tier1 verification. One citizen has one immutable ranked ballot. This is an account-level PoC, not a certified human election; the incumbent remains in office. Other counted civic actions retain their verification gate.

Activation requires both trusted Worker bindings `NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW=true` and `HARIMU_ACCOUNT_ELECTION_POC_ENABLED=true`. Request fields cannot activate it. The separate `poc_*` tables, `preview-citizen-v1` policy and account election identifier keep it distinct from legacy Tier1 elections. Existing imported world data and migration markers are preserved. The additive schema is created under the existing approved temporary preview admin role; no credential or permission is created.

Rankings and participation receipts have no shared ballot identifier or timestamps. An authenticated command writes its receipt, random ballot and receipt acknowledgment in one serialized transaction. An exact own receipt retry acknowledges the original without changing preferences. Other citizens cannot reuse that receipt. The API exposes only the caller's participation status and the candidate slate before the fixed 72-hour close. Candidates never receive individual ballots or voter lists. Finalization freezes voting and verifies the saved aggregate against grouped rankings and receipt totals. Human votes and the deterministic capped Simulated Public remain separate.

Operators can correlate authenticated requests or database transactions. This PoC does not claim cryptographic anonymity or operator unlinkability. No raw ranking or receipt transaction is logged into the ordered rollback journal. PostgreSQL error messages suppress SQL, parameters and database detail. Mixed private ballot and unrelated gameplay batches are refused before connection.

## Rollback safety

Each accepted ballot transaction records only a `separated-ballots-v1` boundary in the protected journal. It contains no user, receipt, ballot ID, ranking or timestamp. Both SQLite and D1 replay refuse journal-only rollback when they encounter this boundary. **After voting starts, do not switch storage to D1 using only the old backup plus journal.** Enter maintenance and prepare a separately protected consistent snapshot of all election tables before designing and verifying a private snapshot restoration. That restoration is not implemented by this batch. The guard prevents silent loss of accepted votes, and never copies private ballots into identity-linked journals. Existing D1 rollback data remains untouched.

Acceptance uses synthetic identities and isolated SQLite/PostgreSQL fixtures, including actual routes and UI. Deployed checks only read status and controls; no real citizen ballot is submitted by the agent. News and Notables remain disabled and no model is called.

## Verified acceptance

The final source passes 338 Node tests, 338 tests against isolated PostgreSQL, 90 standalone SQL tests, lint, TypeScript and the Cloudflare build. Added regression coverage checks the approved flags, current citizenship, fixed namespace, atomic duplicate submission, immutable retry, cross-account receipt collision, exact close, hidden aggregates, saved-count corruption, separated storage, unchanged verification gates and ranking-free rollback refusal.

The real RankedBallot inside GameShell was exercised through the actual route and production PostgreSQL adapter against synthetic local data: a deliberately lost successful response, receipt retry, reload, 390×844 mobile display, and published IRV results with separate human and Simulated Public columns. Mobile result-table contrast was corrected. The owner-linked mockup pixels were inspected. Deployed acceptance is read-only; no real citizen ballot is submitted.
