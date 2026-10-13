# POC backlog batch 1

Scope: owner-authored [Harimu issue backlog](https://github.com/thachp/harimu/issues), issues #2, #3, #4 and cheap #8 only. No GitHub issue comments, closure, labels or other metadata edits are part of this batch. Development targets only preview.harimu.com; productionSites/data/docs remain intact. Preserve the preview citizen's harvest shift completing 2026-10-13T17:19:04.992Z.

Official onboarding19.1 (https://docs.harimu.com/systems/onboarding/) places hands-on nation previews before a two-step nation-choice/oath confirmation; character creation/tutorial follow. One free change within48realhours beforepoliticalaction remains accurate. Broader families/lenses, tutorial, capital identity, HUD timing/help and copy issues are deferred. Nation picking remains only the existing strip and clickable globe labels.

| Issue | Bounded change | Automated acceptance |
| --- | --- | --- |
| [#2 guest examples](https://github.com/thachp/harimu/issues/2) | Signed-out “Try a day in the life” opens disposable work/food/meal examples. Root owns ephemeral state across scene changes/panel collapse; exit/reload/account change discards it. No citizenship, receipts, civic state, chat, network or storage writes. HUD explicitly labels guest samples. Signed-out/local examples cannot call the stateful world endpoint. | Pure example conservation/replay/reset tests and shared-world access boundary test. |
| [#3 oath flow](https://github.com/thachp/harimu/issues/3) | Visible Review1/2 then Oath2/2; styled44px sign-inbutton; back/cancel/Escape restore exploration; account-scoped exact-intent interrupted review restoration, fresh checkbox consent required. | Actual component hook/step tests plus existing enrollment concurrency/interruption tests. |
| [#4 globe labels](https://github.com/thachp/harimu/issues/4) | All ten spherical anchors. Selecting a strip nation brings its label forward and highlights it, including repeat selection after rotation. Label click updates strip. Far hemisphere labels stay occluded; canvas surface clicks no longer pick nations. | All-ten anchor/centre rotation/front-back projection and visibility tests. |
| [#8 favicon](https://github.com/thachp/harimu/issues/8) | Metadata uses existing favicon.svg; conventional favicon.ico route redirects to the SVG. GPU warnings investigated only if a real rendering failure is reproduced. | Runtime route/asset HTTP verification after deployment. |

Integrated checks: 76 Node tests, 77 SQL tests, lint, TypeScript and direct Cloudflare build pass. Parallel source owners handled disjoint guest/globe/oath modules; one integrator handled page/shell wiring, favicon and deployment.

Deployment and acceptance on 2026-10-13:

- Runtime source commit `709414e14e7519eca967e4246f51b28f9ed15d23`, pushed and remotely verified. Worker `harimu-preview` version `ee57d6b0-87cc-4608-8ef8-67c9addcc23a` serves https://preview.harimu.com and https://harimu-preview.thachp.workers.dev. Preview and favicon.ico (following the SVG redirect) return HTTP 200.
- Signed-out browser completed work → food purchase → meal: sample capacity 22 → 18 → 22, coins 0 → 8 → 4, food 0 → 2 → 0. Collapse/reopen retained resources; exit/re-entry reset them; reload discarded the guest session. No real action was submitted.
- All ten strip choices exposed and selected their corresponding globe label. Clicking Veldwood's globe label selected the strip and nation review. Repeating the strip selection after rotation remained selected.
- Review step 1 precedes oath step 2. Opening then canceling Clerk sign-in retained Fulmara and step 2. Escape dismissed the oath; reopening began step 1. At 390×844, the dialog fit and sign-in CTA measured 44px high. No credential entry or citizenship confirmation was performed.
- Existing authenticated citizen loaded 18 WC, 0 wallet/inventory, and the original pending harvest. Collection remained disabled; its completion is still `2026-10-13T17:19:04.992Z`. Remote D1 confirmed its original timestamps and null claim. Concurrent human activity created another harvest at 15:41 UTC, so aggregate shifts/events rose from 1/1 to 2/2 before QA ended; citizen count stayed 2, ticks/petitions 0. No database reset or timing bypass occurred.
- Apex and www remain the existing Sites targets; docs CNAME remains `cname.vercel-dns.com`, response HTTP 200 with Vercel headers. Docs response bytes changed from the earlier baseline and its Last-Modified is 15:44 UTC; this task did not edit or deploy docs, so byte identity cannot be asserted across concurrent work.

Remaining acceptance: actual timed harvest collection after maturity; fresh-account credential/enrollment completion requires user interaction. Broader backlog and GitHub issue metadata remain untouched.
