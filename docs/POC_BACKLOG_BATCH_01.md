# POC backlog batch 1

Scope: owner-authored [Harimu issue backlog](https://github.com/thachp/harimu/issues), issues #2, #3, #4 and cheap #8 only. No GitHub issue comments, closure, labels or other metadata edits are part of this batch. Development targets only preview.harimu.com; productionSites/data/docs remain intact. Preserve the preview citizen's harvest shift completing 2026-10-13T17:19:04.992Z.

Official onboarding19.1 (https://docs.harimu.com/systems/onboarding/) places hands-on nation previews before a two-step nation-choice/oath confirmation; character creation/tutorial follow. One free change within48realhours beforepoliticalaction remains accurate. Broader families/lenses, tutorial, capital identity, HUD timing/help and copy issues are deferred. Nation picking remains only the existing strip and clickable globe labels.

| Issue | Bounded change | Automated acceptance |
| --- | --- | --- |
| [#2 guest examples](https://github.com/thachp/harimu/issues/2) | Signed-out “Try a day in the life” opens disposable work/food/meal examples. Root owns ephemeral state across scene changes/panel collapse; exit/reload/account change discards it. No citizenship, receipts, civic state, chat, network or storage writes. HUD explicitly labels guest samples. Signed-out/local examples cannot call the stateful world endpoint. | Pure example conservation/replay/reset tests and shared-world access boundary test. |
| [#3 oath flow](https://github.com/thachp/harimu/issues/3) | Visible Review1/2 then Oath2/2; styled44px sign-inbutton; back/cancel/Escape restore exploration; account-scoped exact-intent interrupted review restoration, fresh checkbox consent required. | Actual component hook/step tests plus existing enrollment concurrency/interruption tests. |
| [#4 globe labels](https://github.com/thachp/harimu/issues/4) | All ten spherical anchors. Selecting a strip nation brings its label forward and highlights it, including repeat selection after rotation. Label click updates strip. Far hemisphere labels stay occluded; canvas surface clicks no longer pick nations. | All-ten anchor/centre rotation/front-back projection and visibility tests. |
| [#8 favicon](https://github.com/thachp/harimu/issues/8) | Metadata uses existing favicon.svg; conventional favicon.ico route redirects to the SVG. GPU warnings investigated only if a real rendering failure is reproduced. | Runtime route/asset HTTP verification after deployment. |

Integrated checks:76Node tests,77SQL tests,lint,TypeScript and direct Cloudflare build pass. Browser acceptance/deployment evidence will be appended after verification; no browser result is claimed here yet. Parallel source owners handled disjoint guest/globe/oath modules; one integrator handled page/shell wiring, favicon and deployment.
