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

## Recovered live verification

Documented browser-session reset restored Chrome control without changing authentication or closing user tabs. A dedicated QA tab confirmed actual Clerk Manage account and Sign out actions; neither was invoked. Desktop Civic heading and dialog bounds do not overlap; backdrop is dimmed. At 390×844 the dialog fits inside the viewport, and the document has no horizontal overflow. Close, backdrop and Escape restore Account focus.

Live Escape testing exposed a shell shortcut regression: native dialog Escape also collapsed the scene. Runtime follow-up `2fdae8d5fbfde4db46da276d55299de73dc8fe1e` adds dialog keyboard isolation and the native-dialog exclusion to shell shortcuts. Full checks now pass 154 Node tests plus 77 SQL tests, lint, types and build. Deployed Worker version: `e19e96bf-b350-4b5c-ac85-4ffddcb1ef88`. Reloaded live preview confirms Escape leaves the scene open and restores Account focus.

Live market checks rejected -5 and 99999 with visible range instructions and disabled buy/sell controls; quantity 2 displayed correctly scaled totals and resource reasons. No trades were submitted. City contains one full daily-loop guide; Household, Work and Market do not repeat it. Actual work, meal, recovery and HUD next-work timers show both units and count down. Expanded clock help visibly explains one-based days, zero-based ticks and 12× speed. Empty open/collapsed context behavior is covered by component tests. Issues #31, #33, #34, #36 and #37 were closed completed without comments or other metadata changes.

Read-only anonymous D1 consistency query found every Kindle profile has its two-food once-only grant and a meal receipt, with no meal missing a starter grant; query wrote zero rows. #32 remains open because the reported no-meal assertion needs reconciliation; no food or cooldown was modified. #29 remains open for remaining timer-surface audit. #28 broader controls audit continues separately. No renderer warnings were recorded in this QA tab; that observation alone does not resolve #38.

## Follow-up controls and persistence evidence

Runtime `90137c3a2b3a6a7a4d09e848d1ee949f1652cd6f`, Worker `1b787a04-b695-4ac7-bb02-e2a20c6a14cf`: adds accessible reasons and handler guards to chat, citizenship oath and household drafts/commitments; preserves identical-message retry and fresh oath acceptance. Shift chip and earlier-nation escrow now use the shared real/game timer. Checks pass 163 Node tests, 77 SQL tests, lint, TypeScript and build. Fresh-account integration test confirms grant and unset cooldown across repeated reads/reopen, then exactly one meal receipt, consumed starter food and unchanged cooldown across reopen.

Follow-up live hydration was still showing Loading your citizen in a fresh isolated tab, with no captured console error; signed-in follow-up controls have not yet been verified live. #28 and #29 remain open. Remaining #29 audit includes ration expiry, active civic-review expiry, Daily Briefing deadlines and static agreed-duration descriptions. The five earlier verified closures remain valid; no further issues were closed.
