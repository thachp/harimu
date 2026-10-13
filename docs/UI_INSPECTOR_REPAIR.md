# Nation inspector repair

The reported World → Inspect national institutions flow embedded a full-page registry inside the game sidebar. At 1440×900 the component was 391px wide but its fixed 196px/520px/346px grid required 1,062px. An absolute-positioned internal map and viewport-height container clipped the meaningful controls. URL nation selection could also disagree with the citizen-derived shell nation.

## Audited flow

1. Select a nation in World and inspect its institutions. A compact native picker, rules facts, five institution buttons and a readable detail card now fit the existing sidebar. The selected nation drives the terrain and inspector; citizen resources and life destinations retain the citizen's actual nation.
2. Select Fulmara, Confluence and Ilmar; switch institution details and use Back/Forward. Selection follows the URL, including returning from life scenes, without changing citizenship. All ten nations and paid-work ownership guards are covered by rendering regressions.
3. Collapse and reopen with keyboard input. Reopening focuses the panel heading. Escape leaves active text fields, native selects and account dialogs intact. Camera and form controls have visible focus, and mobile action controls have 44px targets.
4. Visit World, Square, Household, Work, Market and Civic at 1440×900, 1024×768 and 390×844. All eighteen DOM checks had matching client/scroll widths for both document and inspector. Long facts wrap; market actions and daily-loop buttons have spacing; notifications sit below the location banner. Desktop inspectors scroll vertically; mobile panels follow the scene/context strip.

## Evidence and health

The exact supplied Library screenshot was materialized on the Mac at `../artifacts/reference/institutions-bug.png` with identity metadata. Fresh live-v18 before evidence is `design-ui-01-before-institutions-desktop.jpg`; local after evidence is `design-ui-02-after-institutions-desktop.jpg`, plus tablet/mobile institutions frames and `design-ui-{1440,1024,mobile}-{scene}.jpg`. Screenshots are ignored internal QA evidence, not public application assets.

Before/after pixels confirm the nested registry/map is removed and all institution controls fit. The repaired component measured 391px client/scroll width on desktop, 336px on tablet and 358px on mobile. General scene screenshots retain the same globe, 3D terrain, top resource bar, sidebar and contextual bottom strip. Seeded nation statistics are explicitly illustrative; government officials remain deterministic AI/SI-role simulations with no connected model.

Validation: lint, TypeScript, 72 SQLite regression tests and all 18 JavaScript regression scripts. Interaction checks include repeated selection, institution actions, browser history, inspector focus, textarea Escape and keyboard camera movement. Existing accounts were not enrolled, charged or traded during visual QA; backend settlement and isolation behavior are covered by regression tests. This is a targeted browser/keyboard audit, not a complete screen-reader or WCAG certification. No schema, service, credential or audience changes are included.

Tracked implementation issue: https://github.com/thachp/harimu/issues/1.

## World selection simplification

Patrick's subsequent direction keeps exactly two selection surfaces: clickable globe labels and the bottom nation strip. The sidebar nation list, globe chooser overlay and institutions select were removed. Selected-nation facts and citizenship/inspection actions remain; repeated instructions, motto headings and the unrelated seeded regional noticeboard were removed from World. Simulation and verification limits remain available under Rules and limits; institution details still expose their specific restrictions. Paid contributions remain available in a compact disclosure.

Fresh desktop selected/collapsed/institution frames and a 390×844 mobile full-page frame confirm the concise layout. Native button keyboard activation changes the selected nation through both retained surfaces; browser Back restores it. The mobile document measures 390px client/scroll width and has no extra picker. Targeted institution/navigation/camera tests, all eighteen JavaScript regression scripts, lint and TypeScript pass. Economy SQL and schema are unchanged from the fully tested v19 release. Aurelle feature expansion is paused for this UI priority.
