/** #501d: read-only smoke checks run after a production deploy (inactive: only the manual deploy-production workflow runs it). GET requests to the one production hostname; nothing is written and no secret is read.
 *  Tests inject `fetchImpl`, so they never touch the network. A failure exits 1; the workflow summary then tells the approver to roll back (--rollback=<previous version id>). */
import { pathToFileURL } from 'node:url';
import { productionTarget } from './production-config.mjs';

export const smokeBase = `https://${productionTarget.hostname}`;
/** Returns the list of failed checks (empty = healthy). `expectedSha` must be the deployed commit: /api/version proves the new bundle is the one serving. After a rollback the serving commit is unknown, so 'any' skips only that comparison. */
export async function smokeProblems(expectedSha, fetchImpl = fetch, base = smokeBase) {
  if (base !== smokeBase) throw new Error(`Smoke checks run only against ${smokeBase}.`);
  if (expectedSha !== 'any' && !/^[a-f0-9]{40}$/.test(expectedSha ?? '')) throw new Error('A full 40 hex commit sha is required.');
  const problems = [], get = async path => { try { return await fetchImpl(`${base}${path}`, { redirect: 'manual', headers: { 'user-agent': 'harimu-production-smoke' } }); } catch { problems.push(`${path}: request failed.`); return null; } };
  const home = await get('/'); if (home && home.status !== 200) problems.push(`/: status ${home.status}.`);
  const version = await get('/api/version');
  if (version) { if (version.status !== 200) problems.push(`/api/version: status ${version.status}.`); else { const body = await version.json().catch(() => ({})); if (expectedSha !== 'any' && body.sha !== expectedSha) problems.push('/api/version: the serving build is not the deployed commit.'); } }
  const world = await get('/api/world'); // reads the database through Hyperdrive, so a broken storage readiness check fails here
  if (world) { if (world.status !== 200) problems.push(`/api/world: status ${world.status}.`); else if (!Array.isArray((await world.json().catch(() => ({}))).nations)) problems.push('/api/world: no nations in the answer.'); }
  return problems;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  smokeProblems(process.argv.find(a => a.startsWith('--sha='))?.slice(6)).then(problems => { if (problems.length) { console.error(`Smoke checks failed:\n- ${problems.join('\n- ')}`); process.exit(1); } console.log('Smoke checks passed.'); }, error => { console.error(error.message); process.exit(1); });
}
