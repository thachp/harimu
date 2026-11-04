/** #1085: Varkand Directorate of the Five Commands. The Chair rotates every 60 real days.
 *  Flag HARIMU_VARKAND_DIRECTORATE_ENABLED, packed in HARIMU_GRAY_PACK. Flag off: no directorate key.
 *  The zzz- prefix sorts this file after zzz-nation-fact-rows-1076. Node's --test-shard is round-robin,
 *  so a mid-alphabet file moves later files between the Postgres shards. Sorting last leaves those shards as they are. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { flagOn } from '../lib/flag-pack.mjs';
import { simulateGovernment, varkandGovernmentSnapshot, withVarkandDirectorate } from '../lib/government.ts';
import { VARKAND_CHAIR_ANCHOR_MS, VARKAND_ROTATION_MS, varkandChairAt, varkandCommands } from '../lib/varkand-directorate.ts';
import { publicGovernmentSnapshot } from '../lib/government-disclosure.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const order = ['Army', 'Fleet', 'Gendarmerie', 'Arsenal', 'Intelligence'];
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const baseInput = { availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} };

test('the five Commands stay in the doc order, and the Chair walks that order from the anchor', () => {
  assert.deepEqual(varkandCommands.map(command => command.command), order);
  assert.equal(new Set(varkandCommands.map(command => command.marshal)).size, 5);
  for (const command of varkandCommands) assert.match(command.marshal, /\S/);
  for (let step = 0; step < order.length * 2; step++) {
    const at = VARKAND_CHAIR_ANCHOR_MS + step * VARKAND_ROTATION_MS;
    const turn = varkandChairAt(at);
    assert.equal(turn.chair.command, order[step % order.length]);
    assert.equal(turn.chair.marshal, varkandCommands[step % order.length].marshal);
    assert.equal(turn.nextRotationAt, at + VARKAND_ROTATION_MS);
    assert.deepEqual(varkandChairAt(at), turn);
  }
});

test('the Chair passes at exactly 60 real days, and the instant before stays with the current Command', () => {
  assert.equal(VARKAND_ROTATION_MS, 60 * 86_400_000);
  const boundary = VARKAND_CHAIR_ANCHOR_MS + VARKAND_ROTATION_MS;
  const before = varkandChairAt(boundary - 1);
  assert.equal(before.chair.command, 'Army');
  assert.equal(before.nextRotationAt, boundary);
  const at = varkandChairAt(boundary);
  assert.equal(at.chair.command, 'Fleet');
  assert.equal(at.nextRotationAt, boundary + VARKAND_ROTATION_MS);
  assert.equal(varkandChairAt(boundary + VARKAND_ROTATION_MS - 1).chair.command, 'Fleet');
  assert.equal(varkandChairAt(VARKAND_CHAIR_ANCHOR_MS - 1).chair.command, 'Army');
  assert.equal(varkandChairAt(VARKAND_CHAIR_ANCHOR_MS - 1).nextRotationAt, boundary);
});

test('nextRotationAt is always a safe integer', () => {
  for (const now of [VARKAND_CHAIR_ANCHOR_MS, VARKAND_ROTATION_MS, VARKAND_ROTATION_MS - 1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, -1, 0.9, NaN, Infinity, -Infinity]) {
    const turn = varkandChairAt(now);
    assert.equal(Number.isSafeInteger(turn.nextRotationAt), true, String(now));
    assert.ok(turn.nextRotationAt > VARKAND_CHAIR_ANCHOR_MS);
  }
});

test('flag off leaves the snapshot unchanged, and other nations gain no directorate key', () => {
  assert.equal(simulateGovernment({ ...baseInput, nationId: 'varkand' }), null);
  assert.equal(varkandGovernmentSnapshot(VARKAND_ROTATION_MS, false), null);
  for (const nationId of ['kindle', 'korund', 'aurelle']) {
    const snapshot = simulateGovernment({ ...baseInput, nationId });
    assert.equal(withVarkandDirectorate(snapshot, VARKAND_ROTATION_MS, true), snapshot);
    assert.equal(withVarkandDirectorate(snapshot, VARKAND_ROTATION_MS, false), snapshot);
    assert.equal('directorate' in snapshot, false);
  }
  const varkand = { ...simulateGovernment({ ...baseInput, nationId: 'kindle' }), nationId: 'varkand' };
  assert.equal(withVarkandDirectorate(varkand, VARKAND_ROTATION_MS, false), varkand);
  assert.equal('directorate' in varkand, false);
  const on = withVarkandDirectorate(varkand, VARKAND_ROTATION_MS, true);
  assert.equal(on.directorate.chair.command, 'Fleet');
  assert.equal(on.directorate.commands.length, 5);
  assert.equal(Number.isSafeInteger(on.directorate.nextRotationAt), true);
  assert.equal('directorate' in varkand, false, 'the input snapshot is not mutated');
  const read = varkandGovernmentSnapshot(VARKAND_CHAIR_ANCHOR_MS, true);
  assert.equal(read.directorate.chair.marshal, varkandCommands[0].marshal);
  assert.equal(read.directorate.chair.command, 'Army');
  const published = publicGovernmentSnapshot(read);
  assert.equal(published.directorate.chair.marshal, read.directorate.chair.marshal);
  assert.equal(published.directorate.nextRotationAt, read.directorate.nextRotationAt);
  assert.equal(publicGovernmentSnapshot(simulateGovernment({ ...baseInput, nationId: 'korund' })).directorate, undefined);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_VARKAND_DIRECTORATE_ENABLED, undefined, 'not its own text binding');
  assert.equal(prod.vars.HARIMU_VARKAND_DIRECTORATE_ENABLED, undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_VARKAND_DIRECTORATE_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_VARKAND_DIRECTORATE_ENABLED, 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, 'HARIMU_VARKAND_DIRECTORATE_ENABLED'), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_VARKAND_DIRECTORATE_ENABLED'), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_VARKAND_DIRECTORATE_ENABLED: 'false' }, 'HARIMU_VARKAND_DIRECTORATE_ENABLED'), false, 'a direct string wins');
});

test('flag off: the Varkand government read is unchanged; flag on names the Chair and the next Rotation Day; other nations are unaffected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const gov = await r.importModule('lib/government-state.ts');
  const seconds = Math.floor(r.now / 1000);
  const expected = varkandChairAt(seconds * 1000);
  assert.equal(await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true }), null, 'flag off');
  const on = await gov.readGovernment(r.db, 'varkand', seconds, 'alice', { readOnly: true, varkandDirectorate: true });
  assert.equal(on.directorate.chair.command, expected.chair.command);
  assert.equal(on.directorate.chair.marshal, expected.chair.marshal);
  assert.equal(on.directorate.nextRotationAt, expected.nextRotationAt);
  assert.deepEqual(on.directorate.commands.map(command => command.command), order);
  const kindle = await gov.readGovernment(r.db, 'kindle', seconds, 'bob', { readOnly: true, varkandDirectorate: true });
  assert.equal('directorate' in kindle, false);
  const korund = await gov.readGovernment(r.db, 'korund', seconds, 'bob', { readOnly: true, varkandDirectorate: true });
  assert.equal('directorate' in korund, false);
  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'flag off leaves the citizen read unchanged');
  r.setFixtureEnv('HARIMU_GRAY_PACK', JSON.stringify({ HARIMU_VARKAND_DIRECTORATE_ENABLED: 'true' }));
  const packed = (await r.call('citizen', 'alice')).data.government;
  assert.equal(packed.directorate.chair.marshal, expected.chair.marshal);
  assert.equal(Number.isSafeInteger(packed.directorate.nextRotationAt), true);
  r.setFixtureEnv('HARIMU_VARKAND_DIRECTORATE_ENABLED', 'false');
  assert.equal((await r.call('citizen', 'alice')).data.government, null, 'a direct false wins over the pack');
  const other = (await r.call('citizen', 'bob')).data.government;
  assert.equal('directorate' in other, false);
});
