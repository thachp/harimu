# Disabled Notables preparation — 2026-10-14

Scope follows owner issue #30 and official daily loops §11.8. One authored profile is available per MVP nation: Kindle civic journalist Mara Vale, Korund plan chronicler Ilya Renn and Aurelle court chronicler Celine Orrel. These are prototype personas, not live AI citizens or officeholders. City opens the authenticated own-nation profile in a labeled dialog with authored public-topic examples. The send button explains why it is disabled.

Live AI remains OFF and unbound. Notables also has its own compiled OFF switch, so a later news activation cannot silently activate conversations. No credentials, bindings, subscriptions, counted politics or gameplay mutations were introduced. GET reads an own-nation authored profile; parameters cannot select a foreign profile. POST requires authentication, same origin, a bounded body, a UUID and an allowlisted topic. Private/freeform fields are rejected. While the gate is off, POST performs no inference reservation and invokes no model.

The prepared service supports public-topic answers only. Prompts contain the authored persona, a predefined public question and an allowlist of national ledger statistics. Private chat, household drafts, account identifiers, hidden leadership reasoning and conversation history are excluded. Numeric claims are rendered from ledger facts; model prose is checked by a separate fact-check call and moderation. Unknown/truncated/error outputs publish nothing. Citizenship is rechecked before exposing a response. Model terms code 5016 returns only the sanitized code and exact model; no agreement is accepted.

The service uses the existing atomic global reservation ledger. Each answer reserves the same complete US$0.0724 sequence as news before any inference. An owner-bound hashed request key prevents repeated/concurrent submissions from starting another sequence, including a changed topic with the same request. Duplicate responses are not stored or regenerated; the service reports that the request was already attempted. A separate quota predicate in that same atomic INSERT enforces the equal ceiling of 20 attempted sequences per account per starting UTC day, across nations. There is no separate usage counter, paid increase or automatic retry. Global budget restrictions can allow fewer than 20. Reservations remain charged on failure and cover both starting and next UTC days.

## Acceptance boundaries

Isolated route/service fixtures verify own-nation context, disabled zero-call behavior, private-field rejection, owner-bound repeats, concurrent duplicates, shared-budget exhaustion before inference, atomic owner quotas, unsafe/unknown/truncated moderation, sanitized model-terms failure and citizenship changes during inference.

Browser fixtures use the real UI component with synthetic profile states. Desktop and 390 × 844 mobile checks cover all three personas, authored labels, disabled sends, topic selection, loading/error and keyboard refresh, with no horizontal overflow. These fixture actions make no model or gameplay calls.

Issue #30 remains open: live LLM-backed conversations, freeform public questions and live acceptance still require a separate activation decision. This batch does not claim that authored examples satisfy live AI chat. The previously verified Korund queue report is preserved unchanged.
