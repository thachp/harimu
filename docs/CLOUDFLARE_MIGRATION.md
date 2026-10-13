# Direct Cloudflare migration

Status: isolated remote preview serves public routes/assets; authenticated acceptance and production cutover remain blocked. See the latest verification below. Current UI/gameplay and docs hosting are unchanged. Source baseline is c6729c4b23094f79e995c1d3a287f4a8240627d1 (Sites v22). Earlier v21 baseline: e8e7b89d2ab0803220df2495717ab6415643bdd4.

## Inventory and blockers (2026-10-13)

- Sites project: appgprj_6acc915e6d28819195fb8b517441739e. Existing rollback endpoints: https://harimu.com and https://harimu-world.thachp.chatgpt.site . Keep the old deployment and database.
- Destination account: OM.Network, LLC, 143bccf1a31c2161142c43845a8fc65d. Connected account has no Workers or D1 databases; Workers subdomain is `thachp`. Intended preview URL is https://harimu-preview.thachp.workers.dev (NOT deployed/verified).
- Local Wrangler 4.92.0 is unauthenticated. The connected Cloudflare API can inspect/provision/upload without creating a token; CLI login is only required for the CLI path. A connector upload must transfer the complete built modules and assets, not just index.js. User must run `wrangler login` themselves, or provide credentials through their secure environment; do not grant persistent access or export masked Sites secrets. Clerk secret and public key must come from the user's Clerk dashboard, retaining the same Clerk instance/user IDs.
- Sites DB binding `DB` has 43 tables. Available table reads are bounded/truncatable and are NOT an export: pagination ends at offset 10000 and cells/columns/rows may be omitted. No underlying source D1 ID or supported consistent full SQL export is exposed. Obtain a provider-supported full export/backup before importing production. Never reconstruct it from model projections.
- Authoritative DNS: ns-cloud-e1/e2/e3/e4.googledomains.com. Apex A records: 162.159.143.30 and 172.66.3.26. `docs.harimu.com` CNAME: cname.vercel-dns.com. DNS provider account access is not established. Cloudflare zone lookup was empty.
- Docs baseline GET SHA256: bc36de8fb2a3f0e68c1a0b07e9ef9bbd9cdd6795fab8526a6ced1f82b23902a6. No docs files, DNS, content, deployment, or settings are changed by this migration.

## Portable preview

`npm run build` retains the existing Sites path. `npm run build:cloudflare` excludes the Sites plugin and uses wrangler.jsonc with the same Vinext entry point and D1 `DB` binding. The current all-zero D1 ID is local-only; `npm run deploy:cloudflare` refuses it and refuses custom routes or an unexpected account/Worker. No production deploy command is supplied until migration evidence is complete.

After user-authenticated CLI access is available:

1. Confirm account identity with `wrangler whoami`; check free capacity and limits before creating anything. No paid upgrades are authorized.
2. Provision one isolated preview D1 (`wrangler d1 create harimu-preview`) and replace only the preview database ID in wrangler.jsonc. Do not bind production to preview.
3. User supplies Clerk environment through ignored local files/secure prompts. Set preview Worker `CLERK_SECRET_KEY` interactively; provide `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at build time. Verify Clerk permits the preview hostname. Never print secrets or use command-line secret values.
4. Build, dry-run the generated `dist/server/wrangler.json`, then deploy with `npm run deploy:cloudflare`. Record deployment version and exact URL. Before the first application request, run `wrangler d1 migrations apply harimu-preview --remote --config wrangler.jsonc` on a fresh empty preview D1 (migrations_dir is drizzle). Sites previously applied these automatically. Request-time initialization adds legacy tables/seeds, but does not create all world/Korund tables; this is not migrated production data. Never blindly apply baseline migrations to an imported or partially initialized database.
5. Verify public landing/world, sign-in/sign-out, two real accounts, permanent nation selection/reload, work start/claim/replay, wallet/inventory conservation, petitions, square presence/chat, and mobile globe rendering. No live Clerk round trip is claimed from fixture tests.

Cloudflare Vite uses generated deployment configuration; rebuild whenever input configuration changes. Never upload a Sites-generated bundle directly. References: https://developers.cloudflare.com/workers/vite-plugin/reference/migrating-from-wrangler-dev/ and https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/ .

## Data migration and single writer cutover

1. Obtain a provider-supported full SQL schema+data snapshot and its source database identity. Store it outside Git with restrictive permissions; inventory every table, indexes/triggers/views and exact counts, plus checksums and ledger totals. Include all 43 tables, IDs, Clerk user IDs, world_clock/world_ticks, timestamps, pending shifts, receipts, economy_migrations, funds and chat. Protect private citizen data. Export bytes must be complete, not tool-projected rows.
2. Rehearse import into isolated destination D1 via `wrangler d1 execute ... --remote --file ...`. Check foreign keys/integrity, all table counts, monetary/inventory totals, IDs, world clock continuity, pending work and idempotency receipts. Preserve timestamp-driven clock; never reset/reseed a production world. Account for source application's request-time compatibility migrations/seeds and compare before/after first request.
3. Rehearsal snapshot may be stale. Before final export, add and test an old-app write/advancement freeze covering ALL public/Clerk APIs, request-time initialization, GET-induced world ticks/settlements and scheduled tasks. Stop scheduled jobs too. The existing app has no tested migration freeze yet. A DNS switch alone does not stop stale clients or the Sites URL from writing.
4. Freeze old app; prove writes and clock mutation have stopped; take final consistent full export; import into separate production D1; rerun reconciliation. Destination must remain frozen while this happens. Record a cutoff timestamp and snapshot hash. Do not perform dual writes.
5. Only after preview and final import verification, enable one destination writer and cut over app routing. Keep old source frozen and intact. Verify login, existing citizens, pending jobs, clock, ledgers and unchanged docs HTTP/DNS. Keep old origin reachable for rollback diagnostics.
6. Rollback before destination writes: disable destination and restore old app routing, then unfreeze old writer. Rollback after destination writes: freeze destination first and reconcile/export all new state back to old storage or retain destination DB behind restored app; never re-enable a stale database. DNS rollback alone would lose data/split the shard.

## App hostname without moving docs

Workers Custom Domains require an active Cloudflare zone: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/ . A bare apex CNAME to workers.dev is not a verified cutover solution. Current Google authoritative DNS and absent Cloudflare zone mean the custom app hostname is blocked pending a supported routing decision. Keep the workers.dev preview independent of DNS.

Do not change nameservers, zone-wide TLS/cache settings or docs records as a shortcut. If later approval permits DNS authority migration, first inventory EVERY DNS record including mail/verification records, preserve the exact docs CNAME and Vercel ownership, assess DNSSEC, and explicitly obtain approval for the consequences. If the requirement means DNS authority must also stay exactly where it is, choose a documented supported external-DNS ingress solution under existing free capacity; do not buy a partial-zone/enterprise feature. A future Pages alternative must first prove Vinext SSR/API/D1 compatibility. No such alternative is implemented here.

## Cloudflare-native state instead of Redis

No Redis dependency is introduced. Keep D1 authoritative for citizen identity, transactions, jobs and conserved ledgers. Current polling/presence stays unchanged. A later separately tested Durable Object per shard/square can own WebSocket sessions and ephemeral presence/fan-out, with server-validated writes persisted in D1 and idempotency receipts. KV is suitable only for non-authoritative public cache/config because eventual consistency is unsuitable for locks, balances, uniqueness or job claims. Do not add Durable Objects/KV or paid services merely to migrate hosting.

## Verification

Run `npm test`, `npm run test:sql`, `npm run lint`, `npx tsc --noEmit`, both build targets and direct Wrangler upload dry-run. Fixture tests establish existing rules/SQL behavior, not production authentication or remote D1 correctness. Record remote preview URL/version and live checks only after deployment. Compare docs baseline and DNS after every future cutover step.

The compatibility date is pinned to 2026-05-22, the newest date supported by the installed workerd. A current-date configuration built successfully but failed local runtime startup; upgrade and verify toolchain before advancing it.

Verified locally on 2026-10-13: 68 Node tests and 77 SQL tests pass; lint and TypeScript pass; Sites and direct builds pass; direct upload dry-run is 2032.71 KiB (gzip 570.41 KiB), 59 modules and 37 assets. Local direct preview: `/` 200 with Harimu markup, `/api/world` 200 with expected world read model, anonymous `/api/citizen` 401. Real Clerk login/game writes and a remote preview remain unverified. Docs second GET has the exact baseline hash and the same Vercel CNAME.

### Connector upload handoff

The API exposes `POST /accounts/{account_id}/workers/scripts/{script_name}/assets-upload-session` (manifest of path/hash/size), `POST /accounts/{account_id}/workers/assets/upload?base64=true` (multipart asset buckets), and multipart Worker script upload. Asset-session response contains a sensitive upload JWT; never print it. The currently documented connector request interface has no authorization-header override, although assets upload requires the session JWT. A tokenless multipart Worker-only upload is insufficient for this app's 37 static assets. Parent should confirm a supported secure asset-session authentication path in the connector before provisioning/uploading; otherwise the user-authenticated Wrangler path handles the asset workflow. Required actions after that: create isolated preview D1, bind DB; upload complete server modules and assets; enable harimu-preview workers.dev; have user securely supply Clerk secret; record exact remote version and verify real flows. Do not create an API credential to work around this interface.

Public routing research confirms retaining Google authoritative DNS with Workers partial-zone setup requires Business/Enterprise. Do not upgrade. The preview can use workers.dev now. Any later nameserver migration requires explicit approval and a complete DNS inventory while preserving Vercel docs CNAME and all other records.

### Remote preview provisioned after personal authorization

User personally approved the scoped Wrangler consent on 2026-10-13. Nonsecret `whoami` verified thachp@gmail.com and OM.Network, LLC (143bccf1a31c2161142c43845a8fc65d), with account:read, user:read, workers_scripts:write, d1:write, offline_access. No broader grant was requested.

Isolated D1: `harimu-preview`, ID `85ec8276-a39f-4bdb-95ad-e77f92144bb9`, WNAM. Worker: `harimu-preview`. Deployed version `0bcea0ea-270f-467e-846b-c5e348a1c7f1`, URL https://harimu-preview.thachp.workers.dev . Existing public Clerk publishable key is configured; no secret was copied. Secret-name inventory is empty. Remote landing/world/citizen currently return 500; configured Clerk middleware asserts a secret for every request, so this preview is not yet accepted. User must securely supply the matching Clerk instance secret before real authentication/game-flow checks. Deployment does not imply completed migration.

User-only secret entry command, from this checkout (do not paste the secret into chat or command arguments):

```sh
WRANGLER_WRITE_LOGS=false WRANGLER_LOG_PATH=.wrangler/logs \
node_modules/.bin/wrangler secret put CLERK_SECRET_KEY \
--name harimu-preview --config wrangler.jsonc
```

The user must personally enter the value at the hidden interactive prompt. Preview hostname authorization in Clerk may also require user configuration. After entry, verify a fresh Worker version and all public/authenticated flows. Production data was not imported and app DNS was not changed. Docs hash and Vercel CNAME remain identical after preview deployment.

### Latest verification after user secret entry

User saved CLERK_SECRET_KEY securely; secret-name inventory confirms secret_text without reading its value. Current preview Worker version: `5c0c5c04-93e7-4f87-8fa4-b427b0420303`. Public landing/world now return 200, world has ten nations, anonymous citizen API returns 401, current CSS/JS bundles and atlas return 200. Browser renders city/globe and navigation. Runtime revealed missing world_supply in fresh D1; existing unchanged migrations 0004 and 0005 were applied only to the isolated partially initialized preview (all their tables were absent), bringing it to 43 app tables. Redeployment cleared the cached initialization failure. Deployment now checks required world/Korund tables before upload.

Login still fails client-side with Clerk: Production Keys are only allowed for domain harimu.com; the request Origin must equal or be a subdomain of the Clerk URL. workers.dev therefore cannot establish the existing production Clerk session. Do not work around this with relaxed auth or unrelated user IDs. The now-active Free Cloudflare zone permits a separate preview.harimu.com Worker Custom Domain; parent/user must approve and attach this preview-only hostname before authenticated acceptance, while keeping apex/www on Sites. No routing was changed in this task.

Reverified active full Free zone `244c864044c9d411b3963e51fad95fcf`, with henry.ns.cloudflare.com and rafe.ns.cloudflare.com, following the external user-side nameserver change. Docs DNS record `7d170a27c7c20607b104d5c3daf9b392` remains unproxied CNAME cname.vercel-dns.com, and its HTTP SHA256 remains the original baseline. Earlier Google-DNS blocker is historical and resolved; complete source Sites database export remains blocked. Settings/Database UI was inspected read-only and offered table viewing, no full export control.

All 68 Node tests and 77 SQL tests passed after deployment-preflight changes; lint/types and direct build passed. Actual authenticated login/citizen flows remain unverified, and preview data is isolated seeded data, not migrated production.
