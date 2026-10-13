# POC regression review 1

The owner-authored backlog search was empty on October 13, 2026, after issue #9 closure. Review therefore focused on navigation, keyboard access and existing work settlement rather than new systems.

## Keyboard focus fixed

On the deployed first-session guide, clicking About government removed the focused control and left the document body focused. The next Tab restarted at the page's initial controls. Actual guide stage changes now focus the stage heading; initial arrival and preference edits do not steal focus. Return from a tour also restores focus to the government heading.

`npm run check` passed 115 Node tests, 77 SQL tests, lint and TypeScript; build passed. Source `dd2a379` was pushed and deployed as Worker version `d8bdd3a3-9d9c-45a8-867a-9e13b5d30bfd`. Live acceptance verified stage headings receive focus, Tab continues into the current guide controls, Back works and tour Skip restores the government heading. No enrollment or real game command was issued.

## Work settlement review

An isolated local actual-API/SQLite probe verified foreign claims are rejected with 404, premature claims with 409, exact maturity grants 800 minor SPK plus 4 food, and repeated claims/database reopening retain exactly one receipt and unchanged balances. Eight existing isolation/receipt tests passed. No live data or timers were modified by these tests.

The protected original live harvest still had zero receipts before maturity at `2026-10-13T17:19:04.992Z`; another citizen's shift at `17:41:26.820Z` remained separate and unclaimed. At actual maturity the original claim became enabled. A normal UI double-click recorded the claim at `2026-10-13T17:19:35.727Z`: exactly one receipt, 800 minor SPK and 4 food. The UI changed from 0 SPK/0 food to 8 SPK/4 food, retained 18 WC, removed the completed claim controls, and displayed the recorded harvest. The second citizen remained unclaimed with zero receipts. Reload persistence was checked afterward.

## Next confirmed navigation defect

The public deep link `?view=world&nation=korund` initially returns server HTML headed City square with City terrain, then changes to the correct world/nation after hydration. `getServerLocationSearch()` returns an empty string and the initial selected nation is Kindle. This is reproducible via HTTP and live reload. Fix and server/hydration/history acceptance follow the protected harvest claim; no routing change has yet been made.
