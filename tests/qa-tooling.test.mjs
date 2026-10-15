import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { buildInfo } from '../scripts/build-info.mjs';
const { qaTestCitizenAllowed } = await (async () => { const r = await localRuntime(); try { return await r.importModule('lib/qa-tools.ts'); } finally { await r.close(); } })(); // qa-tools imports the shared playable list (#485)

const versionModule = async globals => {
  const out = ts.transpileModule(await readFile('app/api/version/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; new Function('exports', ...Object.keys(globals), out)(exports, ...Object.values(globals)); return exports;
};
test('GET /api/version returns the stamped sha and build time only, uncached', async () => {
  const sha = 'a'.repeat(40), builtAt = '2026-10-14T13:00:00.000Z';
  const route = await versionModule({ __HARIMU_BUILD_SHA__: sha, __HARIMU_BUILT_AT__: builtAt });
  const response = route.GET();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { sha, builtAt });
  assert.deepEqual((await versionModule({})).versionPayload(), { sha: 'unknown', builtAt: null });
  const source = await readFile('app/api/version/route.ts', 'utf8');
  assert.doesNotMatch(source, /process\.env|cloudflare:workers|env\./, 'no runtime env access');
});
test('build info prefers CI sha, validates it, falls back to git, never leaks other env', () => {
  const now = new Date('2026-10-14T13:00:00Z');
  assert.deepEqual(buildInfo({ GITHUB_SHA: 'ABCDEF1234567', CLOUDFLARE_API_TOKEN: 'x' }, now, () => 'b'.repeat(40)), { sha: 'abcdef1234567', builtAt: '2026-10-14T13:00:00.000Z' });
  assert.equal(buildInfo({}, now, () => 'c'.repeat(40)).sha, 'c'.repeat(40));
  assert.equal(buildInfo({ HARIMU_BUILD_SHA: 'not a sha; rm -rf' }, now).sha, 'unknown');
  assert.equal(buildInfo({}, now, () => { throw new Error('no git'); }).sha, 'unknown');
});
test('QA nation switch gate requires both flags and the allowlist', () => {
  const on = { HARIMU_QA_TEST_CITIZENS: 'true', NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_QA_TEST_CITIZEN_IDS: ' qa1 , qa2 ' };
  assert.equal(qaTestCitizenAllowed(on, 'qa2'), true);
  assert.equal(qaTestCitizenAllowed(on, 'qa3'), false);
  assert.equal(qaTestCitizenAllowed({ ...on, HARIMU_QA_TEST_CITIZENS: 'false' }, 'qa1'), false);
  assert.equal(qaTestCitizenAllowed({ ...on, NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: undefined }, 'qa1'), false);
  assert.equal(qaTestCitizenAllowed({ ...on, HARIMU_QA_TEST_CITIZEN_IDS: '' }, ''), false);
  assert.equal(qaTestCitizenAllowed(undefined, 'qa1'), false);
});
test('wrangler ships the QA flag off and no id list', async () => {
  const config = await readFile('wrangler.jsonc', 'utf8');
  assert.match(config, /"HARIMU_QA_TEST_CITIZENS": "false"/);
  assert.doesNotMatch(config, /HARIMU_QA_TEST_CITIZEN_IDS"/);
});
test('allowlisted QA citizen switches to Korund without spending the change; others get 404', async t => {
  const r = await localRuntime({ accountElectionBindings: { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_QA_TEST_CITIZENS: 'true', HARIMU_QA_TEST_CITIZEN_IDS: 'alice' } });
  t.after(() => r.close());
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  assert.equal((await r.call('citizen', 'bob', { action: 'qa-test-nation', nationId: 'korund' })).status, 404);
  assert.equal((await r.call('citizen', 'alice', { action: 'qa-test-nation', nationId: 'fulmara' })).status, 400);
  const switched = await r.call('citizen', 'alice', { action: 'qa-test-nation', nationId: 'korund' });
  assert.equal(switched.status, 200); assert.equal(switched.data.nationId, 'korund');
  const row = await r.db.prepare('SELECT nation_id,nation_changes FROM citizens WHERE clerk_user_id=?').bind('alice').first();
  assert.deepEqual({ ...row }, { nation_id: 'korund', nation_changes: 0 });
  assert.equal((await r.call('city', 'alice')).data.nationId, 'korund');
  assert.ok((await r.call('citizen', 'alice')).data.korundPlan, 'Korund plan visible');
});
test('QA switch is 404 when the flags are off (default)', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice');
  assert.equal((await r.call('citizen', 'alice', { action: 'qa-test-nation', nationId: 'korund' })).status, 404);
});
