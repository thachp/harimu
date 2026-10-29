# Cloudflare development world

Current direction (Patrick, 2026-10-13): all development deploys to Cloudflare. Build a good proof of concept here before considering any production launch. https://preview.harimu.com is a fresh, isolated development world; current production at harimu.com/www remains on Sites and its data is preserved. docs.harimu.com stays hosted on Vercel. A full production export is a future launch concern and does not block preview development.

## Default commands

- `npm run dev`: local Vinext/Cloudflare runtime using local simulated D1, not remote production storage. Local Clerk configuration remains in ignored local env files; production Clerk keys do not authenticate localhost.
- `npm run check`: all Node/SQL tests, lint and TypeScript.
- `npm run build`: direct Cloudflare development bundle. Sites build integration is removed from Vite.
- `npm run deploy`: checks, build, guarded upload to harimu-preview. `build:cloudflare` remains an alias.
- `npm run deploy:cloudflare`: uploads an already-built development bundle after guard/schema checks; use `npm run deploy` for normal changes.

The guard pins account 143bccf1a31c2161142c43845a8fc65d, Worker harimu-preview, D1 85ec8276-a39f-4bdb-95ad-e77f92144bb9, binding DB and database name harimu-preview. It refuses production resources, Sites targets, placeholders, missing preview labeling, apex/www/docs routes and wildcards. Preview custom domain is managed in Cloudflare and remains preview.harimu.com; no deployment script creates or modifies production routing. A preview deploy copies the live dashboard QA vars back and does not pass --keep-vars (#988), so folded-away plain-text flags are dropped. Secrets remain encrypted in Cloudflare and are not deleted by the deploy.

No Sites or production deployment command is part of the development workflow. Preserve .openai/hosting.json as historical Site identity/rollback evidence. Do not run native Sites publication tools for development. A future production launch requires a separately approved workflow and evidence; do not relax the development guard.

## Fresh-world state

Before launching, inspection found zero citizens, work shifts, citizen decisions, player fills, chat messages and processed world ticks, with one existing world-clock singleton. The preview already was a clean seeded world, so no reset or deletion was needed. Preserve its clock and bounded seed budgets. Development gameplay tests may now create preview citizens and receipts; those are separate from production progress.

If a future reset is explicitly requested, first export the preview D1 using `wrangler d1 export harimu-preview --remote --config wrangler.jsonc --output <private-path>`, set restrictive file permissions and verify snapshot integrity. Prefer a new isolated D1 after preserving the old one; never silently delete irreversible state or reset production. Changing the pinned development resource requires an intentional reviewed code change.

Fresh empty D1 needs existing Drizzle migrations before first app access. This preview already has 43 application tables; do not replay baseline migrations blindly. The deployment schema preflight checks world and Korund tables to catch missing provisioning. Preserve schema/ledgers across routine development deploys.

## Authentication and user interface

The existing Harimu Clerk instance is reused so user IDs remain stable; keys are not a new identity service. User personally supplied encrypted CLERK_SECRET_KEY. Never retrieve, print, copy or commit its value. Existing production Clerk keys require a harimu.com subdomain, so test real login at preview.harimu.com rather than workers.dev. The runtime shows a small “Development preview” label; its tooltip explains the fresh world and separate production progress.

Clerk routing was restored only after explicit user approval: clerk.harimu.com → frontend-api.clerk.services and accounts.harimu.com → accounts.clerk.services, DNS-only, TTL 14400. No Clerk security settings or new access grants were changed. Fresh sign-in UI loads; credential entry remains user-controlled. Avoid signing out shared production sessions solely for QA.

## Infrastructure and future production

D1 owns durable game state and conserved ledgers. No Redis dependency is added. Future realtime/presence can use Cloudflare-native Durable Objects if needed; KV only suits non-authoritative cache/config. No paid upgrades or new services are required for this launch.

The historical [migration runbook](CLOUDFLARE_MIGRATION.md) records provisioning/DNS evidence and a future production transfer strategy. Its earlier cutover/export blockers do not block this development world. Production still requires an explicit launch decision, data strategy, rollback and one writer; never promote seeded preview data as preserved production progress.

## Launch verification (2026-10-13)

The clean seeded world was preserved without deleting/resetting data. The existing-account session created its first Kindle citizen in preview and received the one-time two-food grant. A household meal recorded exactly one durable receipt, consumed two food and restored four WC (preview capacity now 22). Aggregate remote D1 checks confirmed one citizen and one meal; no production record was touched. Sanitized Worker diagnostics confirmed authenticated citizen/square reads return 200. The initial QA work tab had delayed hydration. A fresh-tab recheck resolved without code changes; live shift start/wait and reload persistence were then verified as detailed below. Local route/SQL suites cover timed claims and replay. No new credential entry is needed for the existing session.

Default deployment version `178704cd-c57a-42a5-bed2-486dc1266189` serves the development label, the same game UI and isolated D1. 69 Node tests (including production-target rejection) and 77 SQL tests pass, plus lint, types and direct build. Fresh sign-in UI was verified in a separate context; all credential entry stays user-controlled. Production promotion remains deferred.

### Bounded work-loop verification

A fresh work tab initially displayed “Loading your citizen…” but later loaded the correct profile/work options with no console errors and without code changes. Reload also recovered successfully. The original permanent-loading symptom was not reproduced; underlying browser/network timing is not established as an application bug, so no speculative timeout change was introduced.

The authenticated preview citizen started one harvest shift at `2026-10-13T15:19:04.992Z`; its server-owned completion time is `2026-10-13T17:19:04.992Z`. Remote D1 confirms exactly one shift, four WC spent, capacity 22 → 18, no claim timestamp and no premature contribution receipt. After page reload the same active shift, capacity, 8.00 SPK + four-food reward and countdown reappeared; “Collect wages and goods” and additional job starts remain disabled while underway. This verifies live start/wait/reload persistence in the isolated world.

Actual live claim must wait until 17:19:04 UTC; no timer, completion timestamp, credentials or production state was modified to skip that requirement. The work tab is left available at https://preview.harimu.com/?view=workplace . Targeted verification passed: four work-shift SQL tests, eleven economy SQL tests and seven two-account route integration tests, including premature-claim/replay/rollback coverage. A real remote claim and resulting wallet/inventory receipt remain outstanding until the timer completes. Development guard/default and Worker version 178704cd-c57a-42a5-bed2-486dc1266189 are unchanged.
