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
