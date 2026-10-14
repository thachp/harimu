# Offline AI diagnosis — 2026-10-14

> **Superseded by #92.** The `lib/ai-acceptance-charges.ts` ledger and its readiness reconciliation/prebook were removed: they wrote 959,000 micro-USD of reservations into preview that never went through the `harimu-preview` AI Gateway and blocked all AI. See docs/AI_BUDGET_GATEWAY.md › Preview cleanup.

No new inference calls, refunds, deletions, historical status changes, access changes or model changes were made. Both services remain OFF. The shared ledger retains US$0.9590, including all three uncertain attempts.

## Captured news rejection

The public counters (2 citizens, 3 completed shifts, 8 food) match the generation and verification inputs. The generated claim keys are valid references, not model-supplied quantities. The structured response and supported:false boolean were parsed correctly. There is no captured source-data or schema mismatch in this final attempt.

“National Ledger Facts” is a noun label and does not assert a clear proposition contradicting those counters. Thus supported:false provides no demonstrable factual counterexample; the verifier's rationale cannot be reconstructed from a boolean. Calling it factually correct or incorrect with certainty would be speculation. Independently, the output is not the requested explanatory news introduction, so rejecting it for content quality is warranted. It must not be force-approved or relabeled as authored content.

The offline fix requests an explanatory sentence and applies a separate introduction-format check before factual verification. The captured label is rejected deterministically. Valid sentences still require factual verification and moderation; false/unknown decisions remain rejection. Existing system statistics and honestly labeled authored/SI content remain the fallback. No real-model acceptance is claimed.

## Three historical uncertain attempts

All used the explicit synthetic question “What does the public work ledger establish?” Public personas and allowlisted counters were the only added context. Actual October timestamps below come from captured request/response files; the fixture's January test clock is not the live budget date. Each retains its full US$0.1364 charge on October 14 and 15.

| Global ledger suffix | Original request UTC | Captured terminal evidence | Why it became uncertain |
| --- | --- | --- | --- |
| notable-1 | 08:14:21.728453; generation 08:14:35.283232 | Guard HTTP 200 safe at 08:14:35.231968; generator HTTP 200 at 08:14:53.217168, finish_reason=stop, 223 input/199 output tokens. Provider generation ID chatcmpl-55f1a6d8-af27-4eb4-93e5-c5ce52120df4. Fixture finished rejected at 08:14:53.279965. No later stage was requested. | Completed provider response was an object; the old string parser threw inside the transport catch. This was a classification bug, not an outstanding provider call. |
| notable-2 | 08:16:18.625879; generation 08:16:39.905031 | Guard HTTP 200 safe at 08:16:39.876709. Cloudflare returned error 8007 / schema error “Unimplemented keys: uniqueItems”; bridge recorded HTTP 400 at 08:17:06.631274, fixture ended at 08:17:06.710368. No generation usage or per-request completion ID was returned. | Every thrown provider error was classed uncertain. Rejection is evidenced; precise provider billing/usage is not. The full reservation remains the monetary bound. |
| notable-5 | 08:19:52.679543 | Fixture timeout/rejection at 08:20:22.688062. Late Guard HTTP 200 safe arrived at 08:20:24.850783 with 208 input/3 output tokens. No generation/verification/output-Guard request file exists. | Timeout was initially genuine transport uncertainty. A terminal response arrived later, but the stopped fixture never reconciled it. No automatic late completion was allowed to publish. |

Local evidence directories: `/tmp/harimu-ai-live-acceptance-20261014/`, `...-second/`, `...-fifth/`. Requests, responses, result JSON and SQLite snapshots remain preserved. The native Workers AI API exposed by the connected OpenAPI search has no request-log/usage lookup endpoint. Documented request logging is an AI Gateway feature; these calls used direct Workers AI and no Gateway was configured. Aggregate usage would not prove an individual request's disposition. No logging service, permission or credential was added to obtain missing evidence.

## Monetary liability versus circuit state

The reservation SUM charges every status through both reserved monetary windows. Separately, reserveBudget denies calls whenever **any** pending/uncertain row has utc_day earlier than the requested day. That predicate has no age limit and ignores next_utc_day. Thus old circuit state blocks forever even after monetary windows clear. For a genuinely unknown provider outcome, that is conservative policy; for a completed response misclassified by local parsing, it is an implementation bug.

The future-call fix moves response validation outside the transport catch. Fulfilled but malformed/truncated content is a terminal **failed** attempt, still fully charged and unpublished. A thrown/timeout request remains uncertain. Fake-provider tests cover both cases and preserve genuinely unknown rollover blocking. Historical rows and the breaker predicate were not altered.

## Bounded resolution requiring a decision/evidence

A safe reconciliation must retain every amount, UTC window and identity, and record terminal failure evidence rather than claim model success. The first and fifth attempts have returned completion/usage evidence and no remaining requested stages. For the second, the original Cloudflare rejection is evidence of a terminal API error, but missing usage must not be interpreted as zero charge; obtain provider disposition/billing confirmation if the owner requires independent proof beyond that captured rejection.

The remaining decision is whether those captured terminal responses/rejection are sufficient to reclassify the three exact rows as known rejected/finished, with an auditable evidence reference and unchanged full charges, or whether provider confirmation is required first. This pass performs neither reclassification nor expiry-based release. Any approved transition would need a transaction checking the exact IDs, costs, windows and old states, and a matching immutable-manifest update; it must not affect unrelated unknown requests.

Even after legitimate terminal reconciliation, the US$0.9590 charges still occupy October 14 and 15. Monetary windows clear at 2026-10-16T00:00:00Z. Current price review expires at 2026-10-15T08:06:58Z, and service acceptance is still unverified. There is therefore no automatic paid restart or currently scheduled eligible time.

Follow-up authorization: the owner subsequently approved the exact terminal-failure correction described in [AI_TERMINAL_RECONCILIATION.md](AI_TERMINAL_RECONCILIATION.md). That bounded correction preserves every full charge/window and journals the evidence; it is not a refund or successful-acceptance claim.
