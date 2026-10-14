# Korund FIFO queue acceptance — 2026-10-14

Isolated browser fixture imports the actual KorundPlanPanel and CivicInboxView components with synthetic records and callbacks. It has no authentication, database connection or gameplay network requests. The acceptance harness was served on localhost; it is not a deployed demo or alternative game ledger.

Desktop (1728px) and mobile (390 × 844px) checks covered empty, queued, queue head with sufficient stock, expired, loading, error, uncertain retry, missing queue and unavailable-book retry. All states had no document horizontal overflow. Queue counts and own position were visible; Korund showed coupons rather than market prices. Disabled actions exposed visible reasons through aria-describedby. Expired requests could not cancel/redeem; refresh remained available. Missing queue information failed closed. Cancellation and retry invoked only fixture callbacks.

Two defects were reproduced and fixed: unavailable ration-book data hid same-request confirmation, and an already-queued citizen was told to join again. Regression tests cover retry availability/disabled saving state and distinguish queued, unjoined and head-of-queue affordances.

The civic inbox now includes read-only Korund counter guidance for an available own-nation plan, an unexpired coupon week, unused coupons, an existing head request and sufficient recorded stock. It directs the citizen to Market and refresh; it neither reserves stock nor redeems coupons. Foreign, missing, expired, short-stock and non-head records produce no entry. The timestamp is explicitly the coupon-week start; it does not invent a queue arrival or availability event. Inbox acknowledgement stays local to the session.

This is fixture acceptance. No live citizenship was changed and no live queue, cancellation, ration, meal, work, ballot or petition was submitted. Issue #27 stays open pending its live cross-nation acceptance criteria; #24 remains open pending its broader live civic criteria.

## Disabled AI preparation: reservation and throughput

AI remains disabled and has no Workers AI binding. These are application reservation limits, not provider/account billing caps.

One full news sequence reserves US$0.0724 before any inference:

- Llama 3.2 3B generation: US$0.0042.
- Llama 3.2 3B fact checking: US$0.0042.
- Llama Guard 3 8B moderation: US$0.064.

Each reservation covers the full allowed model input context plus up to 256 output tokens, regardless of free allowance. Early failure does not refund the unused stages. Unknown, truncated, timed-out or provider-error classifications fail closed. Model terms are not silently accepted.

The shared US$0.97 reservation budget fits at most 13 complete sequences (US$0.9412, 39 inference stages) in an otherwise empty budget window; a fourteenth is refused. The separate 200-stage cap is less restrictive for this sequence. Every reservation is charged against both its starting UTC day and the next UTC day, covering calls crossing midnight. Therefore 13 is not a sustainable daily rate: prior-day reservations reduce next-day capacity. Old pending/uncertain reservations block subsequent-day inference.

The current news job lease permits one attempt per nation per UTC day across Kindle, Korund and Aurelle: at most three full sequences, nine calls and US$0.2172 reserved per day, if enabled and all gates pass. On consecutive successful days, today’s budget also includes yesterday’s US$0.2172 reservation. Shared standalone calls reduce capacity. Refresh/concurrency cannot create another attempt for the same nation/day, and failed jobs do not automatically retry. Actual production throughput is zero while AI is disabled and unbound.
