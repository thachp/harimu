# Issues 20–38: exact acceptance review — 2026-10-14

The remaining issue criteria were reviewed against owner-authored GitHub bodies, current main implementation and isolated/live evidence. UI requirements do not acquire unrelated live gameplay mutation prerequisites. Fixtures prove implemented conditional behavior; they do not activate a missing provider, election or AI service.

## #24 — bottom dock

1. Dock visible and usable from World, City, Household, Work, Market and Civic: actual GameShell plus CitizenDock exercised in a production-built isolated integration harness at desktop and 390 × 844 mobile. All six views retain Chat/News/Civic inbox; no horizontal overflow. Live read-only navigation confirms deployed integration.
2. Completed shifts and open ballots/petitions surface and bump the badge: real civicInbox and CitizenDock receive synthetic completed/unclaimed work, a privacy-ready open uncast ballot and a petition at two of three required signatures. The badge begins at three; all three entries appear. Opening acknowledges the local session and reduces unread to zero. Expired, foreign and ineligible states have regression coverage. The bell now exposes the same expanded state as the dock launcher.
3. Existing chat works from the dock: actual SquareChat mounts in the dialog and reads synthetic nation-scoped messages. Existing route tests cover transport/ownership/replay; deferred-fetch regressions prevent stale pre-post/pre-delete reads and out-of-order refreshes from overwriting newer lists. Presence remains OFF. No live message, ballot or petition was submitted.

These criteria are UI integration and conditional rendering, not a requirement to enable counted voting or create a live petition. Closure does not imply #20 or #25 is operationally complete.

## #27 — nation-themed screens

1. Switching Kindle/Korund citizen context visibly changes ballot/ration/decree screens: integrated actual GameShell and RankedBallot, KorundPlanPanel and GovernmentPanel render synthetic nation contexts. Kindle is a ruled civic form, Korund a stamped grid booklet, Aurelle a double-bordered royal scroll. Desktop/mobile pixels were inspected; actual ranked selects are rendered with fixture privacy/verification evidence.
2. Korund Market shows no prices: the real ration panel shows food coupons, waiting count and own queue position; no buy/sell or per-good prices. Shared rendering tests reject merchant price labels.
3. Each palette includes pattern/icon: nationThemes defines distinct symbols and patterns; NationDocument exposes accessible motif names. Foreground/accent contrast tests pass. News editions now reuse the same authoritative nation tokens and preserve system-statistics/provenance labels.

Live nationality changes, redemption and ballot casting are not stated prerequisites. Synthetic citizen switching verifies presentation without altering game data. Counted politics and AI remain gated.

## Issues that remain open

- #20: create/sign, unique verified-human counting, seven-day expiry and response states are implemented and fixture-tested. The trusted live verification source and an operable authored/admin Cabinet response publishing flow are still absent; usable citizen participation is incomplete.
- #22: own-nation feeds, system/SI provenance, ledger statistics and nation styling are implemented. The requested live AI-generated Kindle articles remain absent while AI is OFF/unbound. Fixture model output is not live news.
- #25: ranked ballots, duplicate rejection, hidden results, IRV and separated human/AI tallies are implemented in fixtures. The permanent fail-closed privacy gate and absent trusted verification prevent a real election opening/counting. The issue’s deferral of verification cannot override the current official human-counting rules.
- #30: authored own-nation profiles, disabled public-topic UI, shared atomic budget, equal quotas, moderation and ownership are prepared. Uncertain client requests now preserve original intent; fake-binding lost-response coverage verifies one three-stage sequence and US$0.0724 reservation. Close/reopen invalidates late POST responses. Live LLM chat remains OFF. Bounded explicit freeform questions, input/output moderation and four-call reservations are now prepared; activation requires a separate review and live acceptance.
- #32: no root cause reproduced. Fresh enrollment/meal fixtures grant two food with no pre-meal cooldown, preserve receipts across reload and enforce cooldown boundaries. Live household records show a grant and actual meal explaining the current timer. Do not add food or reset timers.
- #38: no ReadPixels/context warnings captured across twelve read-only scene transitions, with one canvas and no stale open dialogs. Source disposes owned geometry/materials/textures/shadow maps/renderer, removes listeners and disconnects observers. Native GPU tracing is unavailable; captured console/DOM evidence does not disprove the owner’s warning.

No live gameplay submissions, presence opt-in, credentials, access changes, AI activation, production or docs-hosting changes were performed. GitHub closures, where qualified, are made without comments per the owner’s instruction.

## Independent follow-up: civic command ordering

Petition and ballot clients now suppress reads with a synchronous in-flight command guard, reject repeated captured submit handlers, and invalidate read epochs again when a command settles. Deferred-response fixtures prove stale reads/errors cannot replace the acknowledged command snapshot and reads resume afterward. All verification/privacy gates remain unchanged; no live political command is submitted.
