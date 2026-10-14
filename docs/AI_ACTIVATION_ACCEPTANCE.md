# Preview AI activation acceptance — 2026-10-14

The owner explicitly approved the exact Workers AI binding and preview news/Notable activation on 2026-10-14 at 08:06:58 UTC, with public facts plus explicitly submitted questions, the reviewed Llama 3.2 3B and Llama Guard 3 8B models, and a US$1/day ceiling. No new credentials, subscription upgrades or model terms were accepted.

## Result: binding prepared, runtime services OFF

The real provider is reachable and did not require an explicit model agreement. A bounded public-fact generation probe succeeded. Benign synthetic questions were classified safe; a separate bounded violence classifier probe returned unsafe with category S1. No harmful answer was generated.

Full synthetic Notable attempts never produced an accepted reply. Initial real responses exposed Cloudflare's structured object response format and the need for explicit JSON schema. The provider rejects the schema keyword uniqueItems; uniqueness remains enforced by the server validator. Real fact-check responses then rejected the generated prose. The latest attempt returned supported:false and was discarded. These are actual failures, not fabricated acceptance output. Both HARIMU_AI_NEWS_ENABLED and HARIMU_NOTABLES_ENABLED remain false; #22 and #30 remain open.

The source now supports Cloudflare's documented structured draft/verification responses, rejects truncated and malformed responses, and requests constrained schema output. Unsupported prose, unknown moderation, provider failures and uncertain transport publish nothing. Failed attempts retain their reservation; replay returns the already-attempted result without further inference. The live app has no acceptance endpoint or synthetic citizen record.

## Accounting and isolation

Real calls were orchestrated against isolated in-process fixture services and persisted SQLite reservation snapshots under /tmp. No owner chat, unsent saved draft, private conversation, citizen identifier, hidden reasoning, ballot, petition or gameplay command was sent to a model. Fixture context contained only a public persona, an explicitly selected synthetic question and allowlisted public ledger statistics. No preview gameplay/database records were changed by these fixture invocations.

Fourteen successful real inference calls reported 2,778 input tokens and 523 output tokens. At the verified per-model rates, their reported-token cost is approximately US$0.000940745; this is a token-based estimate, not a billing statement. One additional generation API request was rejected because of the unsupported schema keyword and provided no usage. The conservative isolated reservations total US$0.8866: six complete US$0.1364 Notable attempts, a US$0.0042 generation probe and a US$0.064 moderation probe. Failed/uncertain reservations were not refunded. The original fixture rows were separate from live PostgreSQL and used the fixed test clock (2026-01-15), so live inference could not count them. This was an accounting gap. The correction below records all eight full charges on their actual 2026-10-14 UTC day and prebooks 2026-10-15. Live runtime switches stayed OFF throughout acceptance; no further paid calls occurred during reconciliation.

The application retains its shared atomic US$0.97/day reservation ceiling, full-sequence accounting, equal account quota, pending/uncertain rollover blocking and price-review expiry. Price review is valid until 2026-10-15T08:06:58Z; expired reviews fail closed. No automatic retries or larger/unreviewed models were introduced.

## Remaining blocker

Successful real-model content generation, factual verification and output moderation must complete together before turning either runtime switch on. Further prompt/schema work may improve valid answers; weakening verification to accept rejected drafts would violate the acceptance bar. News publication and actual Notable replies have not passed their full issue criteria.

References: https://developers.cloudflare.com/workers-ai/features/json-mode/ ; https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/ ; https://developers.cloudflare.com/workers-ai/models/llama-guard-3-8b/ ; https://developers.cloudflare.com/workers-ai/platform/pricing/ .

## Reconciliation and allowance before the final news prebook

`lib/ai-acceptance-charges.ts` is the immutable manifest of the actual six attempted sequences and two probes. The archived fixture SQLite files remain under `/tmp/harimu-ai-live-acceptance-20261014*/reservations.sqlite`, `/tmp/harimu-ai-approval-probe.sqlite` and `/tmp/harimu-ai-moderation-probe.sqlite`. Those archives are evidence, not the authoritative live budget. Actual attempt timestamps come from the probe reservations and captured request-file timestamps, not the mocked fixture calendar.

Preview PostgreSQL initialization in `getDatabase()` reconciles the manifest into `harimu_ai_reservations` before returning the database. Eight stable synthetic accounting IDs make this idempotent; existing amounts, windows and statuses are checked, and collisions fail closed. Only AI accounting rows and their existing protected rollback-journal entries are written. Citizens/gameplay are not imported and D1 rollback data is untouched. All live news/Notable reservations read this same table and include these full costs in both daily-window sums. No amount or uncertain status is reset/refunded.

With no additional reservations, both windows contain US$0.8866 against the conservative US$0.97 cap, leaving US$0.0834. A freeform sequence needs US$0.1364 and cannot fit. One three-call news sequence needs US$0.0724 and can fit on October 14, leaving US$0.0110; concurrent second sequences are rejected. On October 15 the three unresolved October 14 attempts also trigger the existing uncertain-carryover gate, so available money alone does not authorize inference. Budget status is read from the shared live ledger in the own-nation profile; no account identifiers or question text enter that DTO.

## Precise captured rejection causes

- First attempt: the provider returned `response` as a structured object with object-valued claims. The old string adapter rejected the format; the objects also contained unsupported inferences that no citizens had begun work/produced food from zero completed settlements. The schema/adapter fix does not permit those claims.
- Second attempt: the provider rejected `uniqueItems` in its schema grammar. Duplicate claims still fail the server validator.
- Third attempt: the old verifier explained its rejection in terms of the fact-key array, treating keys as unsupported statements. Structured boolean verification and an explicit explanation of server-rendered ledger keys correct that prompt/schema ambiguity. A false decision still rejects the draft.
- Fourth attempt: the broad numeric-word filter rejected the grammatical pronoun in “how one should read national news.” This is a false positive, but the filter was not relaxed; generation instructions now avoid ambiguous quantifier words.
- Fifth attempt: orchestration did not confirm its provider response within the service timeout. The late classification was counted in reported usage; the reservation stays uncertain.
- Sixth attempt: “The public record does not establish specific details about the work ledger” and “Public Record Incomplete” imply missing detail despite supplied counters. The verifier returned supported:false. This is a substantive unsupported claim, not a reason to force acceptance. New generation instructions explain what each counter establishes and that zero is known data, not missing records or evidence about ongoing work.

News uses its own generation context and runtime switch. Isolated fake-provider coverage proves supported, moderated news can publish after a rejected Notable attempt; it does not establish actual model acceptance. Notable availability no longer depends on the news switch. Both flags remain OFF.

That reconciliation pass made no further real inference calls. The owner subsequently authorized the single globally prebooked news attempt documented below; its full cost is now also retained. No further paid sequence fits the remaining allowance.

## Single prepaid news acceptance — 2026-10-14

The separately authorized final news sequence was atomically prebooked in the shared PostgreSQL ledger as `acceptance:2026-10-14:news-final`, using the normal reservation predicate. Live UI confirmed US$0.0110 remained before inference, from US$0.9590 reserved in both October 14 and 15 windows. No alternative account, model or local allowance was used to authorize payment. The isolated fixture held only article/diagnostic data; its mirror reservation is not an additional global charge.

Public facts read from the live Kindle feed at 08:52:53 UTC were 2 registered citizens, 3 completed paid shifts and 8 food earned. Exactly one sequence was invoked, with no retries or prompt changes during it. Generation returned title “National Status Report,” summary “National Ledger Facts” and the three allowed fact keys. Structured verification returned supported:false. The service recorded a validation failure and zero articles. Moderation was not called after rejection. The draft was not force-accepted, repaired or substituted with authored output. Both runtime flags remain OFF and #22/#30 remain open.

The two successful Llama 3.2 3B calls reported 332 input tokens and 53 output tokens, approximately US$0.0000346538 at the verified rates. The entire US$0.0724 reservation remains charged despite the uncalled moderation stage. This confirmed rejected attempt is marked finished; the three earlier uncertain charges are unchanged. Cumulative conservative reservations are US$0.9590, with US$0.0110 left. Cumulative reported-token estimate is approximately US$0.0009753988 (16 successful real inference calls; the earlier schema-error request reported no usage). These are estimates, not a billing statement.

Next budget-eligible UTC time: there is **no finite automatic time** under the current ledger. Another complete news sequence cannot fit on October 14; October 15 still carries the full US$0.9590 and is also blocked by unresolved October 14 attempts. At 2026-10-16T00:00:00Z the monetary windows would clear, but those three uncertain attempts continue to block inference until legitimately reconciled. Price review also expires at 2026-10-15T08:06:58Z. Neither uncertainty nor charges were reset to gain allowance.

Captured public-only request/response payloads and the fixture SQLite snapshot remain at `/tmp/harimu-one-news-20261014/`. The exact generation and verification responses are retained in the repository companion diagnostic below for offline work. No further paid attempt is authorized by this result.
