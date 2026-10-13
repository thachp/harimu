# POC disclosure and leader batch 09

## Confirmed execution recovery

Local shell and Chrome browser operations work after reconnection. The nested `site/` Git repository retained `ec8f821` plus an uncommitted citizen API projection, disclosure helper and test. Those changes were preserved and completed. The earlier QA tab is owned by the previous session and was left untouched; this task created a separate QA tab.

## Tested and deployed slices

- `9081949`: explicit citizen API projection excludes unlisted record fields and private closed-nation decision/review rationale. GET, petition POST and citizenship response use the projection. Kindle retains public rationale; Korund/Aurelle receive official proposal text. In-process actual-route fixtures exercise current and recorded review responses through reopen. Internal Aurelle needs tests now inspect internal government state, rather than expecting private data in the citizen API. Civic and Household share the nation disclosure rule, including local demo rendering.
- `ba0aeb2`: world API work descriptions now use authoritative shift hours and their 12× game equivalent. Live signed-in descriptions previously overwrote corrected guest constants with old one-unit database descriptions. The actual world-route regression failed before the fix and passes after reopen. No database migration or stored work-order rewrite was needed.
- `39f210f`: compact leader cards for President Ines Varro, Chairman Neral Voss and Monarch Maera Solenne. These are authored fictional preview personas with vector portraits and truthful SI badges. Programme statuses describe rule enforcement and current proposals; no unexecuted appropriation is marked complete. Kindle gets goals, considered inputs and alternative-priority rules; closed nations get official text. Shared text tags distinguish deterministic statements from model-generated content. Next routine review uses the existing server clock and shared dual-unit timer.

Latest full validation: 182 Node tests, 87 SQL tests, lint, TypeScript and Cloudflare build pass. The leader bundle contains the authored persona in server and client artifacts. Leader version `2a912ad1-ab5d-440d-988f-2f6750ad8ad2` was verified live after reload and hydration, including all three disclosure toggles, actual upcoming settlement deadline and mobile portrait/programme layout at 390×844 with no horizontal overflow. The first post-upload reload had caught the previous deployment; another reload after upload completion loaded the correct artifact. Follow-up `f65421d` fixes inherited small-element styling so badges remain inline; full validation passes unchanged. Final preview deployment reports version `d5072a41-54f2-4d4c-8367-f2e0791cdc73`; final desktop/mobile recheck confirms inline SI badges (22.7px wide), portrait/name visibility, and no horizontal overflow. Cloudflare deployment status confirms this version serves 100% of traffic.

## Live acceptance and issue handling

Desktop and 390×844 checks confirmed Civic public disclosure opening, the linked verification reason on disabled petitions, active-shift/claim explanations, Household recovery and meal cooldown in both units, invalid merchant quantity alert and disabled trade controls, and empty-chat explanation. Mobile document width stays 390px, with no horizontal overflow. Restored normal viewport afterward. No trade, meal, work start/claim, petition, message or presence opt-in was submitted. User sessions and preview citizen data were preserved.

The `ba0aeb2` preview was reloaded and its signed-in work offers displayed 2h/24h, 4h/48h and 3h/36h in both the panel and context strip. #28 and #29 were closed completed without comments. #21/#26 were then closed completed without comments after leader acceptance and all-nation route/component regressions; #32 remains open and no food or cooldown correction was made.

Production routing/data, docs hosting/content, existing credentials, paid plans and verification configuration were untouched. Tier 1 counted-action gating remains fail closed. No deterministic statement is advertised as live LLM output.
