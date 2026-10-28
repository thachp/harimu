/** #886 (a): the single MVP job-type catalog (ARC ruling on #886: farming, orchard, herding, forestry, quarrying, foundry/industry, freight, archive/clerk),
 *  behind HARIMU_MVP_JOB_TYPES_ENABLED. Every playable work order and every Labor Bureau post maps to exactly one type. Off: the route is 404. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { jobTypeCatalog, jobTypeOf, mvpJobs, mvpJobTypeIds, mvpJobTypes, mvpJobTypesEnabled } from '../lib/mvp-job-types.ts';
import { bureauJobs } from '../lib/labor-bureau-rules.ts';
import { shiftRules } from '../lib/work-shifts.ts';

test('the eight ARC-approved types, each with a §11.3 family; job ids are unique', () => {
  assert.deepEqual([...mvpJobTypeIds], ['farming', 'orchard', 'herding', 'forestry', 'quarrying', 'foundry', 'freight', 'archive']);
  assert.deepEqual(Object.keys(mvpJobTypes), [...mvpJobTypeIds]);
  assert.equal(new Set(mvpJobs.map(job => job.id)).size, mvpJobs.length);
  for (const job of mvpJobs) assert.ok(mvpJobTypeIds.includes(job.type), job.id);
});

test('pin: every seeded work order and every Labor Bureau post is in the catalog with one type; playable = seeded orders, posts and charters', async () => {
  const db = await readFile(new URL('../lib/db.ts', import.meta.url), 'utf8');
  const seeds = db.slice(db.indexOf('const workOrderSeeds = ['), db.indexOf('] as const;', db.indexOf('const workOrderSeeds = [')));
  const seeded = [...seeds.matchAll(/^\s*\['([a-z-]+)', '(kindle|korund|aurelle)'/gm)].map(m => [m[1], m[2]]);
  assert.equal(seeded.length, 8, 'the 8 playable orders the audit counted');
  for (const [id, nation] of seeded) { const job = mvpJobs.find(j => j.id === id); assert.ok(job, id); assert.equal(job.nation, nation); assert.equal(job.status, 'playable', id); }
  assert.deepEqual(mvpJobs.filter(j => j.status === 'playable').map(j => j.id).sort(), [...seeded.map(([id]) => id), ...bureauJobs.map(j => j.id).filter(id => id !== 'korund-food-production'), 'aurelle-quarry-charter', 'aurelle-foundry-charter'].sort(), '#886 (b)/(c): posts and charters are playable');
  for (const id of Object.keys(shiftRules)) assert.ok(jobTypeOf(id), `shift rule ${id}`);
  for (const post of bureauJobs) assert.ok(jobTypeOf(post.id), `bureau post ${post.id}`);
  assert.equal(jobTypeOf('nope'), null); assert.equal(jobTypeOf(undefined), null);
});

test('catalog: all 8 types are playable after #886 (b)/(c); each MVP nation has its approved jobs', () => {
  const catalog = jobTypeCatalog();
  assert.deepEqual(catalog.map(t => t.id), [...mvpJobTypeIds]);
  assert.deepEqual(catalog.filter(t => !t.playable).map(t => t.id), []); assert.equal(mvpJobs.filter(j => j.status === 'planned').length, 0);
  const of = nation => mvpJobs.filter(j => j.nation === nation).map(j => j.type);
  assert.deepEqual(of('kindle'), ['farming', 'orchard', 'herding', 'forestry', 'freight', 'archive']);
  assert.deepEqual(of('korund'), ['farming', 'quarrying', 'foundry', 'freight', 'archive']);
  assert.deepEqual(of('aurelle'), ['farming', 'quarrying', 'foundry'], 'ARC: Aurelle gets quarrying and foundry charter jobs');
  assert.deepEqual(new Set(mvpJobs.map(j => j.type)).size, 8, 'all eight types are covered across the three nations');
});

test('flag: exactly "true" is on', () => {
  assert.equal(mvpJobTypesEnabled({ HARIMU_MVP_JOB_TYPES_ENABLED: 'true' }), true);
  for (const v of [undefined, 'false', 'TRUE', '1']) assert.equal(mvpJobTypesEnabled({ HARIMU_MVP_JOB_TYPES_ENABLED: v }), false);
  assert.equal(mvpJobTypesEnabled(undefined), false);
});

test('GET /api/jobs/types: flag off is 404, the catalog when on; no database statement either way', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const off = await r.call('jobs/types', 'anyone');
  assert.equal(off.status, 404); assert.equal(off.data.reason, 'not_found');
  r.setFixtureEnv('HARIMU_MVP_JOB_TYPES_ENABLED', 'true');
  const on = await r.call('jobs/types', 'anyone');
  assert.equal(on.status, 200); assert.deepEqual(on.data.jobTypes, jobTypeCatalog());
  assert.equal(on.cache, 'no-store', 'QA3: no-store like the other flagged routes'); assert.equal(off.cache, 'no-store');
  const route = await readFile(new URL('../app/api/jobs/types/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /getDatabase|prepare\(/);
});
