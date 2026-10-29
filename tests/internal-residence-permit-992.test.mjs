/** #992: internal residence permit for closed-system home-city moves behind HARIMU_INTERNAL_PERMIT_ENABLED. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { citiesForNation } from '../lib/cities.ts';

const kindle = citiesForNation('kindle'), capital = kindle[0].id, tarrek = kindle[1].id;
const korund = citiesForNation('korund'), kCap = korund[0].id, kRel = korund.find(c => !c.capital).id;
const epoch = Date.UTC(2026, 0, 15, 12);
const read = f => readFileSync(f, 'utf8');

test('closed-system rule: Korund/Meridian always; Varkand Amber/Red only; open nations never', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { requiresInternalPermit, internalPermitWaitSeconds } = await r.importModule('lib/home-move.ts');
  assert.equal(requiresInternalPermit('korund'), true);
  assert.equal(requiresInternalPermit('meridian'), true);
  assert.equal(requiresInternalPermit('varkand', 'green'), false);
  assert.equal(requiresInternalPermit('varkand', 'amber'), true);
  assert.equal(requiresInternalPermit('varkand', 'red'), true);
  assert.equal(requiresInternalPermit('kindle'), false);
  assert.equal(requiresInternalPermit('aurelle'), false);
  assert.equal(internalPermitWaitSeconds, 60);
});

test('flag pinned: preview "true", production "false"', () => {
  assert.match(read('wrangler.jsonc'), /"HARIMU_INTERNAL_PERMIT_ENABLED":\s*"true"/);
  assert.match(read('wrangler.prod.jsonc'), /"HARIMU_INTERNAL_PERMIT_ENABLED":\s*"false"/);
});

test('move panel copy names Internal residence permit required and request / pending / granted', () => {
  const card = read('app/home-move-card.tsx');
  for (const s of ['Internal residence permit required', 'Request residence permit', 'Permit pending', 'Permit granted', 'permit_required', 'request-permit']) assert.ok(card.includes(s), s);
});

async function fundKorund(r, user) {
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'korund',?,18,0,'Good standing',?,?)").bind(user, user, at, at).run();
  for (let i = 0; i < 3; i++) {
    const id = randomUUID(), iso = new Date((1 + i) * 1000).toISOString();
    await r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, user, 'aurelle-food-estate', 'Korund fixture', '4 state food', 4, iso, iso, iso).run();
    await r.db.prepare('INSERT INTO korund_settlements(shift_id,clerk_user_id,wage_minor,food_output,settled_at) VALUES (?,?,800,4,?)').bind(id, user, 1 + i).run();
    await r.db.prepare("INSERT INTO labor_note_issuances(id,shift_id,clerk_user_id,amount_minor,source,issued_at) VALUES (?,?,?,800,'korund-brigade-wage',?)").bind('ln-wage:' + id, id, user, 1 + i).run();
  }
}

async function world(t, { permit = true, home = true, backend = 'sqlite', alert } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  if (home) r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', 'true');
  if (permit) r.setFixtureEnv('HARIMU_INTERNAL_PERMIT_ENABLED', 'true');
  else r.setFixtureEnv('HARIMU_INTERNAL_PERMIT_ENABLED', undefined);
  if (alert) r.setFixtureEnv('HARIMU_VARKAND_ALERT', alert);
  r.setFixtureEnv('HARIMU_LEDGER_RECONCILIATION_ENABLED', 'true');
  await r.call('citizen', 'alice');
  await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,5000,1)").bind(randomUUID(), 'alice').run();
  const move = (user, cityId, requestId = randomUUID()) => r.call('city-home', user, { cityId, requestId });
  const ask = (user, cityId, requestId = randomUUID()) => r.call('city-home', user, { action: 'request-permit', cityId, requestId });
  return { r, move, ask };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: open nation (Kindle) unaffected with permit flag on`, async t => {
    const { r, move, ask } = await world(t, { backend });
    const g = await r.call('city-home', 'alice', undefined, 'https://fixture.invalid', `?cityId=${tarrek}`);
    assert.equal(g.status, 200); assert.equal(g.data.permitRequired, false);
    assert.equal((await ask('alice', tarrek)).status, 400);
    const res = await move('alice', tarrek);
    assert.equal(res.status, 200, JSON.stringify(res.data)); assert.equal(res.data.homeCityId, tarrek);
  });

  test(`${backend}: Korund blocked without permit; allowed after grant; permit consumed`, async t => {
    const { r, move, ask } = await world(t, { backend });
    await fundKorund(r, 'kim');
    const blocked = await move('kim', kRel);
    assert.equal(blocked.status, 403); assert.equal(blocked.data.reason, 'permit_required');
    assert.equal(Number((await r.db.prepare("SELECT COUNT(*) AS n FROM home_city_moves WHERE clerk_user_id='kim'").first()).n), 0);

    const req = await ask('kim', kRel);
    assert.equal(req.status, 200, JSON.stringify(req.data)); assert.equal(req.data.permit.status, 'pending');
    const still = await move('kim', kRel);
    assert.equal(still.status, 403); assert.equal(still.data.reason, 'permit_required');

    r.setNow(epoch + 60 * 1000);
    const g = await r.call('city-home', 'kim', undefined, 'https://fixture.invalid', `?cityId=${kRel}`);
    assert.equal(g.data.permitRequired, true); assert.equal(g.data.permit.status, 'granted');

    const ok = await move('kim', kRel);
    assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.equal(ok.data.homeCityId, kRel);
    const row = await r.db.prepare("SELECT consumed_at FROM internal_residence_permits WHERE clerk_user_id='kim' AND to_city_id=?").bind(kRel).first();
    assert.ok(row.consumed_at != null);

    // Cooldown clear + new attempt needs a fresh permit (consumed).
    r.setNow(epoch + (60 + 604800) * 1000);
    const again = await move('kim', kCap);
    assert.equal(again.status, 403); assert.equal(again.data.reason, 'permit_required');
  });

  test(`${backend}: Varkand Green unaffected; Amber blocked without permit`, async t => {
    const { r, move } = await world(t, { backend, alert: 'green' });
    const at = new Date(r.now).toISOString();
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('vik','varkand','vik',18,0,'Good standing',?,?)").bind(at, at).run();
    const voren = citiesForNation('varkand').find(c => !c.capital).id;
    // Green: permit gate does not fire (nation has no wallet currency → not_open_yet, not permit_required).
    const green = await move('vik', voren);
    assert.equal(green.status, 403); assert.equal(green.data.reason, 'not_open_yet');

    r.setFixtureEnv('HARIMU_VARKAND_ALERT', 'amber');
    const amber = await move('vik', voren);
    assert.equal(amber.status, 403); assert.equal(amber.data.reason, 'permit_required');
  });

  test(`${backend}: flag off — Korund moves without a permit (identical to #781)`, async t => {
    const { r, move } = await world(t, { backend, permit: false });
    await fundKorund(r, 'kim');
    const res = await move('kim', kRel);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM internal_residence_permits').first()).n), 0);
  });
}
