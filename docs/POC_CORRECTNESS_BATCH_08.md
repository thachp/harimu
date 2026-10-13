# POC correctness batch 08

Runtime commit: `321876e9d5ef6044363525c8ef9f66503d1de802`.
Cloudflare preview Worker version: `0e6a13cf-ca48-4857-9d9d-6c0a26016251`.
Preview: https://preview.harimu.com/ and https://harimu-preview.thachp.workers.dev/.

## Changes

- Market quantity input visibly rejects non-integers and values outside 1–10, suppresses misleading invalid totals, and guards submission. Existing API rejection remains enforced.
- Full daily-loop guidance appears once in City; work offers a compact optional waiting-activities disclosure.
- Native account dialog adds explicit Close, Escape/backdrop dismissal and focus restoration around Clerk account actions.
- Empty context strip distinguishes its open and collapsed states.
- Visible accessible disabled-action reasons cover market, meal, work, national plans, player market and petition verification. Broader onboarding/chat audit remains pending.
- Shared timers display real time and game time at 12× speed, actual server deadlines, offline uncertainty and refresh-to-confirm expiry. HUD next event uses existing work, meal or recovery deadlines. Day and tick terminology is explicit. Countdown never grants rewards.

## Evidence

`npm run check` passed: 153 Node tests, 77 SQL tests, lint and TypeScript. `npm run build` passed. Tests include invalid client/server quantities, single guidance placement, dialog lifecycle/focus, disabled explanations, timer boundaries, hydration and listener cleanup.

Existing authorized Cloudflare OAuth session was verified without reading credentials. Read-only D1 preflight found all seven required tables and wrote zero rows. Preview deployment used the existing Worker and D1 with secrets retained; no schema or economic-data migration was needed. Public preview returned HTTP 200 after deployment.

Docs returned HTTP 200 from Vercel with unchanged ETag `d1e92fcbea0dedba9e8b2962f3f0aac5` and Last-Modified `2026-10-13 17:27:34 GMT`. No docs, production Sites, DNS or paid resources were changed.

## Pending verification

Browser-control transport disconnected before post-deployment UI checks. Verify the actual signed-in Clerk account menu, all dismissal/focus paths, desktop/mobile geometry, market validation and responsive HUD timers before closing issues. No issues were closed for this batch.

Issue #32 remains unresolved: isolated API evidence shows starter food granted once, cooldown only after a successful meal receipt, and persistence on reopening. Do not grant food or reset an existing cooldown based on the reported ambiguity. Issue #28 remains partially addressed pending the wider disabled-control audit. Rendering performance issue #38 requires a fresh reproducible browser trace.

Production cutover and production-data export remain separate outstanding migration steps; the existing production deployment stays available for rollback. No extra presence sharing or another citizen’s reward claim was performed.
