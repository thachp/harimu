/** #495 follow-up (ARC ruling): lost squares count over the rolling game week before the tick (docs 15.3 "that week"), netted against squares won back by capture in that window, floor 0. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { WEARINESS_WEEK_SECONDS as WEEK } from '../lib/war-rules.ts';

async function setup(t) {
  const r = await localRuntime(); t.after(() => r.close());
  const asOf = Math.floor(r.now / 1000) + 10 * WEEK, war = randomUUID();
  await r.db.prepare('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(war, randomUUID(), 'kindle:korund', 'kindle', 'korund', '', 'test', asOf - 4 * WEEK - 100 - 172800, asOf - 4 * WEEK - 100, null, null).run();
  const capture = async (attacker, defender, squares, at) => {
    const siege = randomUUID();
    await r.db.prepare('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at,captured_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(siege, war, `outpost:${siege.slice(0, 8)}`, 'outpost', 3, 4, attacker, defender, at - 100, at).run();
    await r.db.prepare('INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(randomUUID(), siege, war, randomUUID(), attacker, defender, squares, 0, at).run();
  };
  const wear = await r.importModule('lib/war-weariness.ts');
  return { asOf, capture, read: at => wear.readWarWeariness(r.db, at, { losses: true }), base: await wear.readWarWeariness(r.db, asOf) };
}

test('window boundary: a loss counts for exactly one game week after it, then drops out', async t => {
  const { asOf, capture, read, base } = await setup(t);
  await capture('kindle', 'korund', 3, asOf - WEEK); // exactly one week old: outside (asOf-WEEK, asOf]
  assert.equal((await read(asOf)).korund, base.korund, 'a loss exactly a week old no longer counts');
  assert.equal((await read(asOf - 1)).korund, base.korund + 3, 'one second inside the week it still counts');
  await capture('kindle', 'korund', 2, asOf);
  assert.equal((await read(asOf)).korund, base.korund + 2, 'a loss at the tick time counts; only this week is summed, not the war');
});

test('netting: squares won back in the same week offset losses, floored at 0; gains outside the week do not net', async t => {
  const { asOf, capture, read, base } = await setup(t);
  await capture('kindle', 'korund', 5, asOf - 1000);
  await capture('korund', 'kindle', 2, asOf - 500);
  let w = await read(asOf);
  assert.equal(w.korund, base.korund + 3, 'Korund lost 5, recaptured 2: net 3');
  assert.equal(w.kindle, base.kindle, 'Kindle lost 2 but took 5: floored at 0, never negative');
  await capture('korund', 'kindle', 9, asOf - 2 * WEEK);
  assert.equal((await read(asOf)).korund, base.korund + 3, 'a recapture from an earlier week does not net this week');
  await capture('korund', 'kindle', 10, asOf - 100);
  w = await read(asOf);
  assert.equal(w.korund, base.korund, 'more recaptured than lost: floor 0, not below the weeks-at-war base');
});
