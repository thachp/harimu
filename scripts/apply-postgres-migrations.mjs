/**
 * Apply pending db/postgres migrations (#128). Used by the preview deploy workflow and
 * by admins by hand:
 *   PREVIEW_DATABASE_ADMIN_URL=postgres://... npm run db:postgres:migrate [-- --dry-run | --bootstrap-empty [--fresh-world]]
 * --fresh-world (#501, with --bootstrap-empty only) also writes the fresh-world-v1 readiness marker a production database that launches empty needs.
 * Requires an admin role with CREATE on schema public, never the app role.
 */
import { bootstrapEmptyPostgres, applyPostgresMigrations, assertPostgresMigrationsApplied, connectPostgres } from './postgres-migrations.mjs';

const url = process.env.PREVIEW_DATABASE_ADMIN_URL;
if (!url) { console.error('PREVIEW_DATABASE_ADMIN_URL is not set (admin role with CREATE on schema public).'); process.exit(1); }
if (process.argv.includes('--fresh-world') && !process.argv.includes('--bootstrap-empty')) { console.error('--fresh-world only works with --bootstrap-empty.'); process.exit(1); }
const dryRun = process.argv.includes('--dry-run') || process.env.npm_config_dry_run === 'true';
const db = await connectPostgres(url);
try {
  if (process.argv.includes('--bootstrap-empty')) {
    if (dryRun) throw new Error('--bootstrap-empty has no dry run; it only ever runs on an empty database.');
    const done = await bootstrapEmptyPostgres(db, { log: line => console.log(line), freshWorld: process.argv.includes('--fresh-world') });
    console.log(`Bootstrapped empty database; ${done.applied.length} migration(s) applied and recorded.`);
  } else {
    const result = await applyPostgresMigrations(db, undefined, { dryRun, log: line => console.log(line) });
    if (!dryRun) await assertPostgresMigrationsApplied(db);
    console.log(dryRun ? `Dry run: ${result.pending.length} pending.` : `Postgres migrations up to date (${result.applied.length} applied now).`);
  }
} finally { await db.close(); }
