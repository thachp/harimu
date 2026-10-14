# Approved terminal-failure reconciliation — 2026-10-14

Scope: correct only `acceptance:2026-10-14:notable-1`, `notable-2` and `notable-5` from uncertain transport to a known completed **failed** attempt. No successful model acceptance is asserted. Each retains US$0.1364, its exact model, original start, October 14/15 monetary windows and identity. No inference is made. Both services remain OFF.

## Exact evidence

[AI_TERMINAL_FAILURE_EVIDENCE.json](AI_TERMINAL_FAILURE_EVIDENCE.json) records the original synthetic command UUIDs, captured request/response SHA256 hashes, provider receipts, timestamps in the preserved evidence paths, and absence of downstream requests. The original SQLite snapshots/results are not rewritten.

- #1: generation request at 08:14:35.283232 UTC returned HTTP 200 at 08:14:53.217168 with finish_reason=stop and usage. Provider ID `chatcmpl-55f1a6d8-af27-4eb4-93e5-c5ce52120df4`. The old string-only parser rejected completed object content. No verification or output moderation was sent.
- #5: Guard request at 08:19:52.679543 timed out locally at 08:20:22.688062, then returned HTTP 200 safe with usage at 08:20:24.850783. No generation or later stage was sent.
- #2: generation request at 08:16:39.905031 contained the uniqueItems schema keyword. The original connected Cloudflare execute result was **Cloudflare API error 8007**, an upstream AiError with Grammar error “Unimplemented keys: uniqueItems,” nested BadRequestError code 400 and provider trace `bbcf73fb-be44-48f3-9637-2c280b6fc4a4`. That response was matched to the captured request before the bridge normalized it into response-2.json at 08:17:06.631274. This was a remote terminal rejection, not local fixture validation. No downstream stage was sent. No usage was returned, so the full charge is retained; zero spend is not inferred.

## Transition/history safeguards

The immutable original manifest still records the initial uncertain states. Reconciliation allows the authorized finished state only for these three IDs. It validates every ID, day, next day, model, full charge and start timestamp before changes. Updates repeat those exact predicates plus status=uncertain, in a serialized transaction, and validate the resulting states. Repeated/concurrent runs do not charge again or mutate unrelated unknowns. A mismatch fails closed.

The existing protected PostgreSQL rollback journal retains the original UPDATE SQL and predicates, evidence artifact SHA256 and reconciliation Unix timestamp. This records the old uncertain state and new finished state without adding a new service/table or altering historical journal entries. Tests verify one journal entry containing precisely three transitions, unchanged financial fields and preservation of unrelated uncertainty.

## Totals and eligibility

Shared charges remain nine records totaling US$0.9590 in **both** October 14 and October 15 windows. Monetary remainder stays US$0.0110. Only the three approved statuses change; no charge/window is released or refunded. The original unknown-carryover predicate remains intact for all other requests.

After this reconciliation, these three entries no longer indefinitely trip the transport circuit. With no other unknown request, the monetary budget becomes eligible at **2026-10-16T00:00:00Z**. This does not authorize automatic inference: current price review expires at 2026-10-15T08:06:58Z, both runtime services remain OFF, and real-model acceptance remains failed. No further work or spending is performed as part of this correction.
