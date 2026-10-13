# POC national news batch 10

Runtime commits: `d0e9b7e` (merchant parameter correction) and `a065930` (national news).
Preview Worker: `2f44ee52-f8ec-4a78-8859-b3c5293568aa`, verified serving 100% of traffic.

## Implemented

An authenticated, private/no-store news endpoint derives the edition from the saved citizen. Inspected nation and query parameters cannot change it. Anonymous, unenrolled and unsupported citizens fail closed. The three editions are Kindle Press, Korund State Media and Aurelle Court Gazette, with distinct mastheads and verified system statistics.

Articles derive from durable paid-shift settlements, first-citizenship registrations, merchant/store/ration records and saved world-tick policy proposals. They publish aggregate facts, not names, account identifiers, private wallets or household balances. Historical work is attributed to its recorded national work order rather than a citizen's later nationality. Closed-nation policy text passes through the same public disclosure projection as the citizen API. News reads do not process ticks, claim work, change economic ledgers or count civic input.

News is reachable from the persistent location navigation through a native modal. It aborts interrupted requests, rejects an edition that disagrees with citizenship and resets at account/session boundaries. City sample stories are separated from connected citizen play. Chat and opt-in city presence remain unchanged. No live AI writer is configured: system events and deterministic statements are honestly labeled; the shared tag supports actual model provenance when such a record exists.

## Merchant root cause and correction

Actual-route news fixtures revealed valid merchant trades returned 409. SQLite `typeof(?)='integer'` incorrectly rejected integer-valued JavaScript number bindings. Node SQLite and a read-only query against preview D1 both report the parameter `1` as REAL. The fixture adapter was kept unchanged; the production SQL now checks the 1–10 range and exact equality to an integer cast. Read-only D1 evaluation accepts 1 and rejects 1.5, with zero writes.

The actual-route regression failed before the fix and passes afterward, including buy/sell, exact replay after reopen, fractional rejection and conservation. Direct SQL regression also accepts an integral REAL value and rejects a fractional value. No live merchant trade was submitted for verification.

## Validation and remaining live acceptance

191 Node tests, 88 SQL tests, lint, TypeScript and Cloudflare build pass. Actual-route news fixtures cover all three citizenship scopes, spoofed foreign query parameters, aggregate output, source labels, closed-nation disclosure, reopen and repeated read immutability. UI tests cover three edition skins, model versus deterministic tags, blocked session states and ignored late responses.

Read-only preview SQL confirms two Kindle citizens, one paid shift and four earned food; no private identifiers were returned. Active presence remains zero. The deployed public client entry returned 200 and its SHA-256 matches the built artifact.

Initial fresh-tab hydration was delayed without captured console errors; reload eventually loaded the signed-in citizen. The native News dialog opened with its loading state. Browser debugger binding was then lost during a parent checkpoint, so documented rebind, fresh-tab and explicit runtime-reset recovery were attempted. Existing QA tabs still reported an unattached debugger and fresh bindings repeatedly disappeared. The native Chrome fallback found the user interacting in another tab; it was not modified. An attempt to expand only the task-created QA group failed because the element was offscreen. Feed content, foreign-nation inspection and desktop/mobile dismissal acceptance are still pending. #22 and #24 remain open. No production routing/data, docs content/hosting, credentials, paid resources, presence opt-in or irreversible gameplay action was changed.
