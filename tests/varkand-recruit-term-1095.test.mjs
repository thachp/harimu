/** #1095: a Varkand citizen's first 7 real days are a recruit term on GET /api/citizen.
 *  Flag HARIMU_VARKAND_NATIONAL_SERVICE_ENABLED off: the read is unchanged (no nationalService key). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { expandFlagPacks, FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { NATIONAL_SERVICE_TERM_DAYS } from '../lib/varkand-national-service.ts';
import { RECRUIT_TERM_DAYS, RECRUIT_TERM_MS, varkandRecruitTerm } from '../lib/varkand-recruit-term.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const DAY = 86_400_000;
const FLAG = 'HARIMU_VARKAND_NATIONAL_SERVICE_ENABLED';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const at = (created, plus) => varkandRecruitTerm({ nation_id: 'varkand', created_at: new Date(created).toISOString() }, created + plus);
const without = data => { const { nationalService: _skipped, ...rest } = data; return rest; };

test('the term is 7 real days, active on day 0 and day 6, inactive at exactly 7 days', () => {
  assert.equal(RECRUIT_TERM_DAYS, 7);
  assert.equal(RECRUIT_TERM_DAYS, NATIONAL_SERVICE_TERM_DAYS);
  assert.equal(RECRUIT_TERM_MS, 7 * DAY);
  const created = Date.parse('2026-03-01T00:00:00.000Z');
  const endsAt = created + 7 * DAY;
  assert.deepEqual(at(created, 0), { active: true, endsAt });
  assert.deepEqual(at(created, 6 * DAY), { active: true, endsAt });
  assert.deepEqual(at(created, 7 * DAY - 1), { active: true, endsAt });
  assert.deepEqual(at(created, 7 * DAY), { active: false, endsAt });
  assert.equal(Number.isSafeInteger(endsAt), true);
  assert.deepEqual(at(created, -1), { active: false, endsAt }, 'before created_at is not yet the term');
});

test('non-Varkand citizens get nothing, and a Varkand row without a real created_at gets nothing', () => {
  const now = Date.parse('2026-03-02T00:00:00.000Z');
  const created = new Date(now).toISOString();
  for (const nation_id of ['kindle', 'korund', 'aurelle', 'Varkand', '', null, undefined]) {
    assert.equal(varkandRecruitTerm({ nation_id, created_at: created }, now), null, String(nation_id));
  }
  assert.equal(varkandRecruitTerm(null, now), null);
  assert.equal(varkandRecruitTerm(undefined, now), null);
  assert.equal(varkandRecruitTerm({ nation_id: 'varkand' }, now), null);
  assert.equal(varkandRecruitTerm({ nation_id: 'varkand', created_at: 'not-a-date' }, now), null);
  assert.equal(varkandRecruitTerm({ nation_id: 'varkand', created_at: created }, 1.5), null);
});

test('the flag is packed, preview on, production off, and not its own text binding', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_ARMY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_ARMY_PACK[FLAG], 'false');
  assert.ok(FLAG_PACKS.HARIMU_ARMY_PACK.includes(FLAG));
  assert.equal(expandFlagPacks(preview.vars)[FLAG], 'true');
  assert.equal(expandFlagPacks(prod.vars)[FLAG], 'false');
  assert.equal(flagOn({ HARIMU_ARMY_PACK: preview.vars.HARIMU_ARMY_PACK }, FLAG), true);
  assert.equal(flagOn({ HARIMU_ARMY_PACK: prod.vars.HARIMU_ARMY_PACK }, FLAG), false);
  assert.equal(flagOn({ HARIMU_ARMY_PACK: '{"HARIMU_VARKAND_NATIONAL_SERVICE_ENABLED":"true"}', [FLAG]: 'false' }, FLAG), false, 'a direct string wins');
  for (const value of ['false', '', undefined, 'TRUE', '1']) assert.equal(flagOn({ [FLAG]: value }, FLAG), false);
});

test('GET /api/citizen: day 0 and day 6 are active, exactly 7 days is inactive, other nations and flag off add nothing', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice');
  const created = Date.parse((await r.db.prepare("SELECT created_at FROM citizens WHERE clerk_user_id='alice'").first()).created_at);
  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  r.setNow(created);
  const unset = await r.call('citizen', 'alice');
  assert.equal(unset.status, 200);
  assert.equal('nationalService' in unset.data, false, 'flag off (unset) leaves the read unchanged');
  r.setFixtureEnv(FLAG, 'false');
  assert.deepEqual((await r.call('citizen', 'alice')).data, unset.data, 'flag off');
  r.setFixtureEnv(FLAG, 'true');
  const day0 = await r.call('citizen', 'alice');
  assert.deepEqual(without(day0.data), unset.data, 'flag on adds only nationalService');
  assert.deepEqual(day0.data.nationalService, { active: true, endsAt: created + 7 * DAY });
  r.setNow(created + 6 * DAY);
  assert.deepEqual((await r.call('citizen', 'alice')).data.nationalService, { active: true, endsAt: created + 7 * DAY });
  r.setFixtureEnv(FLAG, 'false');
  assert.equal('nationalService' in (await r.call('citizen', 'alice')).data, false, 'flag off on day 6 still adds nothing');
  r.setFixtureEnv(FLAG, undefined);
  r.setFixtureEnv('HARIMU_ARMY_PACK', JSON.stringify({ [FLAG]: 'true' }));
  r.setNow(created + 7 * DAY);
  const day7 = await r.call('citizen', 'alice');
  assert.deepEqual(day7.data.nationalService, { active: false, endsAt: created + 7 * DAY }, 'the pack turns the read on');
  r.setFixtureEnv(FLAG, 'false');
  assert.equal('nationalService' in (await r.call('citizen', 'alice')).data, false, 'a direct false wins over the pack');
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(FLAG, 'true');
  r.setNow(created);
  const kindle = await r.call('citizen', 'alice');
  assert.equal(kindle.status, 200);
  assert.equal(kindle.data.profile.nationId, 'kindle');
  assert.equal('nationalService' in kindle.data, false, 'a non-Varkand citizen gets nothing');
});
