/** #1379: Korund State Media omits foreign-war (`world`) headlines (docs §11.5 information fog, §8.6, Korund Freedoms).
 *  Wars Korund is in still appear. Kindle and Aurelle world coverage is unchanged. No new flag, no migration. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const H = 3600;
const D = 86400;
const foreignWar = (over = {}) => ({
  id: 'w-foreign', attacker: 'kindle', defender: 'aurelle', casusBelli: 'Border incidents', declaredBy: 'AI President',
  declaredAt: 1_000, mobilizationEndsAt: 1_000 + 48 * H, status: 'active', endedAt: null, endKind: null, peaceLockEndsAt: null, ...over,
});
const ids = items => items.map(i => i.id);

test('warNewsItems: Korund omits an uninvolved war; Kindle and Aurelle still see it; a war on Korund still appears', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const war = await r.importModule('lib/war.ts');
  const abroad = foreignWar();
  assert.deepEqual(war.warNewsItems([abroad], 'korund'), [], 'no foreign-war lines for Korund');
  const kindle = war.warNewsItems([abroad], 'kindle');
  assert.ok(ids(kindle).includes('war:w-foreign:declared') && ids(kindle).includes('war:w-foreign:mobilized'));
  assert.equal(kindle.find(i => i.id.endsWith(':declared')).title, 'Kindle declares war');
  const aurelle = war.warNewsItems([abroad], 'aurelle');
  assert.ok(ids(aurelle).includes('war:w-foreign:declared'));
  assert.equal(aurelle.find(i => i.id.endsWith(':declared')).title, 'War is declared upon the realm');
  const ended = foreignWar({ status: 'ended', endedAt: 1_000 + 49 * H, endKind: 'treaty', peaceLockEndsAt: 1_000 + 49 * H + 10 * D });
  assert.deepEqual(war.warNewsItems([ended], 'korund'), [], 'ended foreign wars stay off the Korund feed');
  assert.ok(ids(war.warNewsItems([ended], 'kindle')).includes('war:w-foreign:ended'));

  const onKorund = foreignWar({ id: 'w-home', defender: 'korund' });
  const home = war.warNewsItems([onKorund], 'korund');
  assert.ok(ids(home).includes('war:w-home:declared') && ids(home).includes('war:w-home:mobilized'));
  assert.equal(home.find(i => i.id.endsWith(':declared')).title, 'War declared on Korund');
  const declaredByKorund = foreignWar({ id: 'w-ours', attacker: 'korund', defender: 'kindle' });
  const ours = war.warNewsItems([declaredByKorund], 'korund');
  assert.ok(ids(ours).includes('war:w-ours:declared'));
  assert.equal(ours.find(i => i.id.endsWith(':declared')).title, 'The state declares war');
});

test('national news: a Kindle–Aurelle war is absent from the Korund edition and present for the two sides', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(Math.floor(r.now / 1000) - 31 * D));
  const war = await r.importModule('lib/war.ts');
  const citizen = (id, nation) => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z')").bind(id, nation, id).run();
  await citizen('kim', 'kindle'); await citizen('kai', 'korund'); await citizen('ava', 'aurelle');
  const at = Math.floor(r.now / 1000);
  const made = await war.declareWar(r.db, { attacker: 'kindle', defender: 'aurelle', casusBelli: 'Border incidents', declaredBy: 'AI President', requestId: randomUUID() }, at, { enabled: true });
  assert.equal(made.ok, true, JSON.stringify(made));
  const titles = async user => (await r.call('news', user)).data.items.filter(i => i.id.startsWith('war:'));
  assert.deepEqual(await titles('kai'), [], 'Korund State Media has no foreign-war headlines');
  const kindle = await titles('kim');
  assert.equal(kindle.length, 1);
  assert.equal(kindle[0].title, 'Kindle declares war');
  const aurelle = await titles('ava');
  assert.equal(aurelle[0].title, 'War is declared upon the realm');
  r.setNow(r.now + 48 * H * 1000);
  assert.deepEqual(await titles('kai'), [], 'still omitted after mobilization ends');
  assert.ok((await titles('kim')).some(i => i.id.endsWith(':mobilized')));
  assert.ok((await titles('ava')).some(i => i.id.endsWith(':mobilized')));
  await war.endWar(r.db, made.war.id, 'treaty', Math.floor(r.now / 1000), true);
  assert.deepEqual(await titles('kai'), [], 'still omitted after the war ends');
  assert.ok((await titles('kim')).some(i => i.title === 'The war has ended'));
});
