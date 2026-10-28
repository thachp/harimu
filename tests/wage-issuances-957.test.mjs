/** #957: brigade LN and Aurelle food-estate wages write issuance ledger rows so #885/#954 caps see them.
 *  Rows are always written; cap enforcement stays behind HARIMU_EMISSION_CAPS_ENABLED (preview true / prod false). */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { charterMonthCap, charterYearCap } from '../lib/emission-caps-rules.ts';
import { korundPostTerms } from '../lib/korund-posts.ts';
import { aurelleJob } from '../lib/aurelle.ts';

test('wrangler flag unchanged; schema + settle paths wire brigade/food-estate issuances', async () => {
  const preview = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  const prod = await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...preview.matchAll(/"HARIMU_EMISSION_CAPS_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['true']);
  assert.deepEqual([...prod.matchAll(/"HARIMU_EMISSION_CAPS_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  const posts = await readFile(new URL('../lib/korund-posts.ts', import.meta.url), 'utf8');
  const aurelle = await readFile(new URL('../lib/aurelle.ts', import.meta.url), 'utf8');
  const korund = await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8');
  assert.match(posts, /korund-brigade-wage/);
  assert.match(posts, /laborNoteBrigadeIssuanceSql/);
  assert.match(posts, /REFERENCES work_shifts\(id\)/);
  assert.match(aurelle, /aurelle-food-estate-wage/);
  assert.match(aurelle, /crownFoodEstateIssuanceSql/);
  assert.match(aurelle, /REFERENCES work_shifts\(id\)/);
  assert.match(korund, /laborNoteBrigadeIssuanceSql/);
  assert.match(korund, /korundSettleSql\+laborNoteMonthCapSql/);
  assert.match(aurelle, /aurelleSettleSql\+crownYearCapSql/);
  assert.match(await readFile(new URL('../drizzle/0104_wage_issuances.sql', import.meta.url), 'utf8'), /korund-brigade-wage/);
  assert.match(await readFile(new URL('../db/postgres/0104_wage_issuances.sql', import.meta.url), 'utf8'), /harimu:destructive-reviewed/);
});

async function korundBrigade(t, { caps = false } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'ana', { action: 'enroll', nationId: 'kindle', expectedNationId: null });
  await r.db.prepare("UPDATE citizens SET nation_id='korund', capacity=24").run();
  await r.call('world', null);
  if (caps) r.setFixtureEnv('HARIMU_EMISSION_CAPS_ENABLED', 'true');
  // mvp off → food brigade, not a Labor Bureau post
  r.setFixtureEnv('HARIMU_MVP_JOB_TYPES_ENABLED', 'false');
  const work = async () => {
    const id = randomUUID();
    const start = await r.call('citizen', 'ana', { action: 'korund-start-work', requestId: id });
    r.setNow(r.now + korundPostTerms.hours * 3600 * 1000);
    const claim = await r.call('citizen', 'ana', { action: 'korund-claim-work', shiftId: id });
    return { id, start, claim };
  };
  return { r, work };
}

test('flag off: brigade wage pays and always writes a labor_note_issuances row', async t => {
  const { r, work } = await korundBrigade(t, { caps: false });
  const w = await work();
  assert.equal(w.start.status, 200); assert.equal(w.claim.status, 200);
  const row = await r.db.prepare('SELECT amount_minor, source FROM labor_note_issuances WHERE shift_id=?').bind(w.id).first();
  assert.equal(Number(row.amount_minor), 800);
  assert.equal(row.source, 'korund-brigade-wage');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM korund_settlements').first()).n), 1);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM korund_post_settlements').first()).n), 0);
});

test('flag on: a prior brigade issuance counts toward the Labor Note monthly cap', async t => {
  const { r, work } = await korundBrigade(t, { caps: true });
  await r.db.prepare("UPDATE korund_resources SET initial_minor=10000 WHERE id='state'").run();
  assert.equal(charterMonthCap(10000), 1500);
  const first = await work();
  assert.equal(first.start.status, 200); assert.equal(first.claim.status, 200);
  assert.equal((await r.db.prepare('SELECT source FROM labor_note_issuances WHERE shift_id=?').bind(first.id).first()).source, 'korund-brigade-wage');
  await r.db.prepare("UPDATE citizens SET capacity=24").run();
  // Second brigade wage would make month sum 1600 > 1500
  const second = await work();
  assert.equal(second.start.status, 200);
  assert.equal(second.claim.status, 409, 'brigade wage must see prior brigade issuance in the month sum');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM labor_note_issuances').first()).n), 1);
});

async function aurelleFood(t, { caps = false } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'bob', { action: 'enroll', nationId: 'kindle', expectedNationId: null });
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle', capacity=24").run();
  await r.call('world', null);
  if (caps) r.setFixtureEnv('HARIMU_EMISSION_CAPS_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_MVP_JOB_TYPES_ENABLED', 'false');
  const work = async () => {
    const id = randomUUID();
    const start = await r.call('citizen', 'bob', { action: 'aurelle-start-work', requestId: id });
    r.setNow(r.now + aurelleJob.hours * 3600 * 1000);
    const claim = await r.call('citizen', 'bob', { action: 'aurelle-claim-work', requestId: randomUUID(), shiftId: id });
    return { id, start, claim };
  };
  return { r, work };
}

test('flag off: food-estate wage pays and always writes a crown_issuances row', async t => {
  const { r, work } = await aurelleFood(t, { caps: false });
  const w = await work();
  assert.equal(w.start.status, 200); assert.equal(w.claim.status, 200);
  const row = await r.db.prepare('SELECT amount_minor, source FROM crown_issuances WHERE shift_id=?').bind(w.id).first();
  assert.equal(Number(row.amount_minor), 800);
  assert.equal(row.source, 'aurelle-food-estate-wage');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM aurelle_settlements').first()).n), 1);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM aurelle_charter_settlements').first()).n), 0);
});

test('flag on: a prior food-estate issuance counts toward the Crown yearly cap', async t => {
  const { r, work } = await aurelleFood(t, { caps: true });
  await r.db.prepare("UPDATE aurelle_resources SET initial_minor=8000 WHERE id='estate'").run();
  assert.equal(charterYearCap(8000), 2400);
  for (let i = 0; i < 3; i++) {
    await r.db.prepare("UPDATE citizens SET capacity=24").run();
    const w = await work();
    assert.equal(w.start.status, 200, `start ${i}`); assert.equal(w.claim.status, 200, `claim ${i}`);
  }
  await r.db.prepare("UPDATE citizens SET capacity=24").run();
  const over = await work();
  assert.equal(over.start.status, 200);
  assert.equal(over.claim.status, 409, 'fourth food-estate wage must see prior food-estate issuances');
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM crown_issuances').first()).n), 3);
  assert.equal(Number((await r.db.prepare("SELECT COUNT(*) AS n FROM crown_issuances WHERE source='aurelle-food-estate-wage'").first()).n), 3);
});
