# Preview AI activation acceptance — 2026-10-14

The owner explicitly approved the exact Workers AI binding and preview news/Notable activation on 2026-10-14 at 08:06:58 UTC, with public facts plus explicitly submitted questions, the reviewed Llama 3.2 3B and Llama Guard 3 8B models, and a US$1/day ceiling. No new credentials, subscription upgrades or model terms were accepted.

## Result: binding prepared, runtime services OFF

The real provider is reachable and did not require an explicit model agreement. A bounded public-fact generation probe succeeded. Benign synthetic questions were classified safe; a separate bounded violence classifier probe returned unsafe with category S1. No harmful answer was generated.

Full synthetic Notable attempts never produced an accepted reply. Initial real responses exposed Cloudflare's structured object response format and the need for explicit JSON schema. The provider rejects the schema keyword uniqueItems; uniqueness remains enforced by the server validator. Real fact-check responses then rejected the generated prose. The latest attempt returned supported:false and was discarded. These are actual failures, not fabricated acceptance output. Both HARIMU_AI_NEWS_ENABLED and HARIMU_NOTABLES_ENABLED remain false; #22 and #30 remain open.

The source now supports Cloudflare's documented structured draft/verification responses, rejects truncated and malformed responses, and requests constrained schema output. Unsupported prose, unknown moderation, provider failures and uncertain transport publish nothing. Failed attempts retain their reservation; replay returns the already-attempted result without further inference. The live app has no acceptance endpoint or synthetic citizen record.

## Accounting and isolation

Real calls were orchestrated against isolated in-process fixture services and persisted SQLite reservation snapshots under /tmp. No owner chat, unsent saved draft, private conversation, citizen identifier, hidden reasoning, ballot, petition or gameplay command was sent to a model. Fixture context contained only a public persona, an explicitly selected synthetic question and allowlisted public ledger statistics. No preview gameplay/database records were changed by these fixture invocations.

Fourteen successful real inference calls reported 2,778 input tokens and 523 output tokens. At the verified per-model rates, their reported-token cost is approximately US$0.000940745; this is a token-based estimate, not a billing statement. One additional generation API request was rejected because of the unsupported schema keyword and provided no usage. The conservative isolated reservations total US$0.8866: six complete US$0.1364 Notable attempts, a US$0.0042 generation probe and a US$0.064 moderation probe. Failed/uncertain reservations were not refunded. These isolated acceptance reservations are separate from the live PostgreSQL reservation ledger; live runtime switches stayed OFF throughout acceptance.

The application retains its shared atomic US$0.97/day reservation ceiling, full-sequence accounting, equal account quota, pending/uncertain rollover blocking and price-review expiry. Price review is valid until 2026-10-15T08:06:58Z; expired reviews fail closed. No automatic retries or larger/unreviewed models were introduced.

## Remaining blocker

Successful real-model content generation, factual verification and output moderation must complete together before turning either runtime switch on. Further prompt/schema work may improve valid answers; weakening verification to accept rejected drafts would violate the acceptance bar. News publication and actual Notable replies have not passed their full issue criteria.

References: https://developers.cloudflare.com/workers-ai/features/json-mode/ ; https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/ ; https://developers.cloudflare.com/workers-ai/models/llama-guard-3-8b/ ; https://developers.cloudflare.com/workers-ai/platform/pricing/ .
