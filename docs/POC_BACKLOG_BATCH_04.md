# POC backlog batch 4: the first-shift wait

Issue #18 offers alternatives to shortening the timer or granting money. This batch keeps existing two-real-hour harvests, funds and starting goods unchanged and surfaces current useful activities instead: read Civic decisions, visit citizen chat, or write a private Household note. The shift remains active across navigation and closing the game. Its actual duration and exact ready time are shown; other job durations are not mislabeled two hours.

These buttons only navigate. Reading decisions and writing private notes do not count as political actions; counted petitions still require phone verification and may lock the citizenship change window. Wait choices disappear when the shift matures, when collection becomes the next action. No paid service, real-time bypass, stipend or new account is introduced.

Verified source commit `07e64be988299e18f010812ca0af23eb70ef211a`, Worker version `84e7b66e-c995-4a45-9767-7acd07f10658`, https://preview.harimu.com. Full checks pass: 94 Node tests, 77 SQL tests, lint, types and Cloudflare build.

Live acceptance on the original signed-in citizen: all three wait buttons reached their actual destinations. Civic displayed saved policy decisions with petitions disabled; Square displayed chat with presence unchecked and no message sent; Household exposed the editable private note without saving. The harvest remained pending with its original 17:19:04.992 UTC deadline, 18 WC, zero money and food. Collection remained disabled. A safe D1 aggregate read confirmed two unclaimed harvests for two separate citizens; no claims or new commands were issued.

The current citizen’s next meal is tomorrow, 2026-10-14 around 15:09 UTC, reflecting the existing 24-hour prototype meal interval. Food after the harvest alone will not permit a same-day meal, so #13's live transport verification remains pending without changing timers or creating an account. The read-only route and component tests cover its status fix; this limitation is explicit.
