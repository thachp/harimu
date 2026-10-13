# POC regression review 2: direct-link first render

World/Korund links originally returned City square/Kindle server HTML and changed scene after hydration. The initial custom location-store snapshot now comes from Vinext's request-scoped `useSearchParams()`; initial explored nation uses that same query. Existing capture-phase scene traversal and query-only history events remain unchanged, preserving the citizen session and pending intent lifecycle.

Actual-page hook tests demonstrate the former failure and cover World/Korund, Nation/Fulmara, default and invalid queries. Full checks passed 117 Node tests, 77 SQL tests, lint and TypeScript; build passed. Runtime `cd1dadbb55886cd82c25ddf8ded3197b0ac630ad` was pushed and deployed as Worker version `90e1bad0-e53a-498d-a90b-40618d2076d4` at https://preview.harimu.com and https://harimu-preview.thachp.workers.dev.

Actual HTTP SSR now returns Korund's globe for World/Korund, Fulmara's Nation institutions/Arcport for Nation/Fulmara, and City square for default/invalid queries. Local and deployed initial browser captures showed the requested globe immediately. Hydration preserved the scene and selected nation, with no captured preview console errors. Live Back/Forward restored Korund/City square; nation selection and institution navigation/refresh retained Fulmara. At 390×844 the world refreshed correctly with no horizontal overflow. The guest work sample remained isolated (18 sample capacity/8 sample coins after one example shift) and returned to Fulmara exploration.

Authenticated direct-link exploration showed Korund while retaining the actual Kindle citizen's 18 WC, 8 SPK and 4 food. Work navigation and Back retained Korund exploration. No new work, meal, trade, petition, message or enrollment was submitted. The local QA server was stopped after acceptance.

On recheck a new owner-authored issue #19 was open. Its owner comment narrows scope to Square→City labels, same-city presence, and a static Country map with 2–3 pins and free instant travel; paid travel, per-city markets/jobs, batching and full city simulation are deferred. It remains open pending implementation.

Documentation remained hosted on Vercel, HTTP 200. It independently published a new revision during this review: at 17:27 UTC ETag `d1e92fcbea0dedba9e8b2962f3f0aac5`, last-modified 17:27:34 UTC, still GDD v0.7 and now a Cities of Harimu navigation entry. This task made no documentation/DNS/hosting edits or production cutover.
