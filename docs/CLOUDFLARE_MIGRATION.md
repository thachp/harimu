# Direct Cloudflare migration

Status: portable build and upload dry-run verified; no direct remote preview or production cutover yet. Current UI/gameplay and docs hosting are unchanged. Source baseline is c6729c4b23094f79e995c1d3a287f4a8240627d1 (Sites v22). Earlier v21 baseline: e8e7b89d2ab0803220df2495717ab6415643bdd4.

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
4. Build, dry-run the generated `dist/server/wrangler.json`, then deploy with `npm run deploy:cloudflare`. Record deployment version and exact URL. Request-time initialization creates the existing schema/seeds in isolated preview; this is not migrated production data.
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
