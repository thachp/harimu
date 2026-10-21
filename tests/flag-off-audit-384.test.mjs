/** #384: flag-off invariant audit. Every HARIMU_*_ENABLED flag in wrangler.jsonc and wrangler.prod.jsonc is registered here with the test file that pins
 *  its flag-off path, and a guard fails when a flag is added, read in code or dropped without registering it. A sample of flags is spied directly:
 *  flag off makes no writes (and the Aurelle Rising GET adds no keys and opens no DB), each with a flag-on baseline that shows the same spy sees calls.
 *  The scheduled Worker opens the database only for jobs whose flags are on (lib/cron-gates.ts). Default values are pinned by wrangler-prod-501b. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { cronJobFlags, cronJobsOn } from '../lib/cron-gates.ts';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const configs = { 'wrangler.jsonc': strip(readFileSync('wrangler.jsonc', 'utf8')), 'wrangler.prod.jsonc': strip(readFileSync('wrangler.prod.jsonc', 'utf8')) };
const declared = config => Object.keys(config.vars).filter(name => /^HARIMU_[A-Z0-9_]+_ENABLED$/.test(name)).sort();

// Flag -> the test file that pins its flag-off path (no writes / inert). Register every new flag here.
const flagOffPins = {
  HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'account-election.test.mjs',
  HARIMU_AI_NEWS_ENABLED: 'ai-news-gateway-140.test.mjs',
  HARIMU_NOTABLES_ENABLED: 'ai-captured-drafts.test.mjs',
  HARIMU_AI_CABINET_RESPONSES_ENABLED: 'cabinet-response-ai.test.mjs',
  HARIMU_CITY_FOUNDING_ENABLED: 'flag-off-audit-384.test.mjs',
  HARIMU_SQUARE_PURCHASE_ENABLED: 'flag-off-audit-384.test.mjs',
  HARIMU_TESSERA_EXCHANGE_ENABLED: 'flag-off-audit-384.test.mjs',
  HARIMU_TEST_FAUCET_ENABLED: 'test-faucet-631.test.mjs',
  HARIMU_LABOR_BUREAU_ENABLED: 'labor-bureau-235.test.mjs',
  HARIMU_CONFLUENCE_ENABLED: 'nation-playable.test.mjs',
  HARIMU_MERIDIAN_ENABLED: 'nation-openings.test.mjs',
  HARIMU_ILMAR_ENABLED: 'nation-openings.test.mjs',
  HARIMU_HOARVALE_ENABLED: 'nation-openings.test.mjs',
  HARIMU_VARKAND_ENABLED: 'nation-openings.test.mjs',
  HARIMU_VELDWOOD_ENABLED: 'nation-openings.test.mjs',
  HARIMU_FULMARA_ENABLED: 'nation-openings.test.mjs',
  HARIMU_GRAY_MARKET_ENABLED: 'gray-market-43.test.mjs',
  HARIMU_NATION_WORK_ENABLED: 'nation-work-490.test.mjs',
  HARIMU_FAVOR_DECAY_ENABLED: 'favor-decay-529.test.mjs',
  HARIMU_KINDLE_INCOME_TAX_ENABLED: 'kindle-income-tax-86.test.mjs',
  HARIMU_ORDER_BOOK_ENABLED: 'market-flag-off-344.test.mjs',
  HARIMU_AURELLE_RISING_ENABLED: 'flag-off-audit-384.test.mjs',
  HARIMU_AURELLE_COUP_ENABLED: 'aurelle-coup.test.mjs',
  HARIMU_AURELLE_CHARTERS_ENABLED: 'aurelle-charters-531.test.mjs',
  HARIMU_TESSERA_REWARDS_ENABLED: 'flag-off-audit-384.test.mjs',
  HARIMU_KINDLE_ASSEMBLY_ENABLED: 'assembly.test.mjs',
  HARIMU_PRIMARIES_ENABLED: 'primaries.test.mjs',
  HARIMU_TRAVEL_ENABLED: 'flag-off-audit-384.test.mjs',
  HARIMU_KORUND_PRESIDIUM_ENABLED: 'korund-presidium.test.mjs',
  HARIMU_FAITH_ENABLED: 'flag-off-audit-384.test.mjs',
  HARIMU_DIPLOMATIC_HALL_ENABLED: 'diplomatic-hall-599.test.mjs',
  HARIMU_FOUNDING_PERIOD_ENABLED: 'founding-period-612.test.mjs',
  HARIMU_AURELLE_SUCCESSION_ENABLED: 'aurelle-succession-613.test.mjs',
  HARIMU_RELOCATION_SUPPORT_ENABLED: 'relocation-support-470.test.mjs',
  HARIMU_TARGETED_SANCTIONS_ENABLED: 'goods-sanctions-601.test.mjs',
  HARIMU_WAR_ENABLED: 'war-actions.test.mjs',
  HARIMU_WAR_WEARINESS_ENABLED: 'war-weariness.test.mjs',
  HARIMU_WAR_WEARINESS_LOSSES_ENABLED: 'war-weariness-losses-495.test.mjs',
  HARIMU_WAR_DECLARATION_LIMITS_ENABLED: 'war-limits.test.mjs',
  HARIMU_DIPLOMACY_ENABLED: 'flag-off-audit-384.test.mjs',
  HARIMU_EMBARGO_ENABLED: 'embargo.test.mjs',
  HARIMU_CROWN_DEBASEMENT_ENABLED: 'flag-off-audit-384.test.mjs',
  HARIMU_CANVASSING_ENABLED: 'canvassing.test.mjs',
  HARIMU_TOWN_HALLS_ENABLED: 'town-hall.test.mjs',
  HARIMU_AI_TOWN_HALL_ANSWERS_ENABLED: 'town-hall.test.mjs',
  HARIMU_DEBATE_ENABLED: 'debate.test.mjs',
  HARIMU_AI_DEBATE_ANSWERS_ENABLED: 'debate.test.mjs',
  HARIMU_SPARK_SUPPLY_ENABLED: 'flag-off-audit-384.test.mjs',
  HARIMU_LEDGER_RECONCILIATION_ENABLED: 'flag-off-audit-384.test.mjs',
};

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out); else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

test('every HARIMU_*_ENABLED flag in both wrangler configs is registered, and the two configs declare the same flags', () => {
  const preview = declared(configs['wrangler.jsonc']), prod = declared(configs['wrangler.prod.jsonc']);
  assert.ok(preview.length >= 40, `found ${preview.length} flags`);
  assert.deepEqual(prod, preview, 'wrangler.prod.jsonc and wrangler.jsonc declare different flags');
  assert.deepEqual(Object.keys(flagOffPins).sort(), preview, 'register each new flag in flagOffPins with the test that pins its flag-off path (and drop removed ones)');
});

test('every flag read in app/, lib/ or worker/ is declared in wrangler vars (a new flag cannot ship undeclared or unregistered)', () => {
  const read = new Set();
  for (const file of ['app', 'lib', 'worker'].flatMap(dir => sourceFiles(dir))) for (const [name] of readFileSync(file, 'utf8').matchAll(/HARIMU_[A-Z0-9_]+_ENABLED/g)) read.add(name);
  const missing = [...read].filter(name => !(name in flagOffPins)).sort();
  assert.deepEqual(missing, [], 'declare each flag in both wrangler configs and register it in flagOffPins');
});

test('each registered pin file exists and names its flag (or its fixture setter) next to a flag-off case', () => {
  for (const [flag, file] of Object.entries(flagOffPins)) {
    const path = join('tests', file);
    assert.ok(existsSync(path), `${flag}: ${path} is missing`);
    const text = readFileSync(path, 'utf8'), short = flag.replace(/^HARIMU_|_ENABLED$/g, '').toLowerCase();
    const names = text.includes(flag) || /openingFlag/.test(text) || new RegExp(`setFixtureAiFlags\\([^)]*${short.split('_').pop()}`).test(text);
    assert.ok(names, `${flag}: ${file} never names the flag`);
    assert.match(text, /flag[- ]?off|flag is off|while off|off flag|disabled|=== ?'true'|: ?false/i, `${flag}: ${file} has no flag-off case`);
  }
});

// QA3 on #684: the job-to-flags map is pinned here, so dropping (or adding) a flag in lib/cron-gates.ts fails.
const expectedCronJobFlags = {
  cabinet: ['HARIMU_AI_CABINET_RESPONSES_ENABLED'],
  diplomacy: ['HARIMU_DIPLOMACY_ENABLED'],
  crown: ['HARIMU_CROWN_DEBASEMENT_ENABLED'],
  townHall: ['HARIMU_TOWN_HALLS_ENABLED', 'HARIMU_AI_TOWN_HALL_ANSWERS_ENABLED'],
  debate: ['HARIMU_DEBATE_ENABLED', 'HARIMU_AI_DEBATE_ANSWERS_ENABLED'],
  spark: ['HARIMU_SPARK_SUPPLY_ENABLED'],
  ledger: ['HARIMU_LEDGER_RECONCILIATION_ENABLED'],
  tesseraRewards: ['HARIMU_TESSERA_REWARDS_ENABLED'],
};
test('cron gates: lib/cron-gates.ts matches the pinned job-to-flags map, and each job turns on only with every pinned flag', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(cronJobFlags)), expectedCronJobFlags);
  for (const [job, flags] of Object.entries(expectedCronJobFlags)) {
    const all = Object.fromEntries(flags.map(flag => [flag, 'true']));
    assert.equal(cronJobsOn(all)[job], true, job);
    for (const flag of flags) assert.equal(cronJobsOn({ ...all, [flag]: 'false' })[job], false, `${job} without ${flag}`);
  }
});

test('cron gates: with every flag off no scheduled job runs; each job needs exactly its own flags', () => {
  const off = Object.fromEntries(declared(configs['wrangler.prod.jsonc']).map(name => [name, 'false']));
  assert.deepEqual(Object.values(cronJobsOn(off)), Object.values(cronJobFlags).map(() => false));
  assert.ok(Object.values(cronJobsOn(configs['wrangler.prod.jsonc'].vars)).every(on => !on), 'production config starts no cron job');
  for (const [job, flags] of Object.entries(cronJobFlags)) {
    const on = Object.fromEntries(flags.map(flag => [flag, 'true']));
    assert.equal(cronJobsOn(on)[job], true, `${job} baseline: on with its flags`);
    for (const flag of flags) assert.equal(cronJobsOn({ ...on, [flag]: 'false' })[job], false, `${job} stays off without ${flag}`);
    for (const flag of flags) assert.ok(flag in flagOffPins, `${flag} is registered`);
  }
});

test('worker scheduled(): every getDatabase() call sits behind its job\'s cron gate', () => {
  const source = readFileSync('worker/entry.ts', 'utf8'), scheduled = source.slice(source.indexOf('async scheduled('));
  const opens = scheduled.split('\n').filter(line => line.includes('getDatabase()'));
  assert.equal(opens.length, Object.keys(cronJobFlags).length, 'one database open per job');
  for (const line of opens) assert.match(line, /^\s*if \(on\.(\w+)\) ctx\.waitUntil/, `ungated database open: ${line.trim().slice(0, 80)}`);
  assert.deepEqual(opens.map(line => line.match(/on\.(\w+)/)[1]).sort(), Object.keys(cronJobFlags).sort());
});

// Spies: count every prepare/batch call and every write statement. `fn` runs with the spy installed.
async function spy(r, fn) {
  const prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db), seen = { calls: 0, writes: [] };
  r.db.prepare = sql => { seen.calls++; if (/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)) seen.writes.push(sql.trim().slice(0, 60)); return prepare(sql); };
  r.db.batch = statements => { seen.calls++; seen.writes.push('batch'); return batch(statements); };
  try { seen.result = await fn(); } finally { r.db.prepare = prepare; r.db.batch = batch; }
  return seen;
}
async function runtime(t) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice');
  r.setVerification('alice', { userId: 'alice', emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
  return r;
}

test('HARIMU_AURELLE_RISING_ENABLED off: GET carries only enabled, crown and the coup window (no counts, unrest or pledge) and writes nothing; POST writes nothing; flag-on baseline', async t => {
  const r = await runtime(t);
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv('HARIMU_AURELLE_RISING_ENABLED', 'false');
  const pledge = () => r.call('aurelle/rising', 'alice', { action: 'aurelle-pledge', requestId: randomUUID(), claimantId: 'vaelcourt' });
  for (const coup of [undefined, 'true']) {
    r.setFixtureEnv('HARIMU_AURELLE_COUP_ENABLED', coup);
    const get = await spy(r, () => r.call('aurelle/rising', 'alice'));
    assert.equal(get.result.status, 200); assert.deepEqual(get.writes, []);
    assert.deepEqual(Object.keys(get.result.data).sort(), coup ? ['coup', 'crown', 'enabled'] : ['crown', 'enabled'], 'no new keys while off');
    assert.equal(get.result.data.enabled, false);
  }
  const anonymous = await spy(r, () => r.call('aurelle/rising', null));
  assert.equal(anonymous.result.status, 401); assert.equal(anonymous.calls, 0);
  const post = await spy(r, pledge);
  assert.equal(post.result.status, 403); assert.deepEqual(post.writes, []);
  r.setFixtureEnv('HARIMU_AURELLE_RISING_ENABLED', 'true');
  const on = await spy(r, () => r.call('aurelle/rising', 'alice'));
  assert.ok(on.calls > 0, 'baseline: the spy sees the flag-on reads');
  for (const key of ['claimants', 'weeklyHumans', 'unrest', 'myPledge', 'coup']) assert.ok(key in on.result.data, `flag-on GET has ${key}`);
  const onPost = await spy(r, pledge);
  assert.equal(onPost.result.status, 200, JSON.stringify(onPost.result.data)); assert.ok(onPost.writes.length > 0, 'baseline: the flag-on pledge writes');
});

test('HARIMU_TRAVEL_ENABLED off: start-travel writes nothing; flag-on baseline writes', async t => {
  const r = await runtime(t);
  const go = () => r.call('travel', 'alice', { action: 'start-travel', x: 8, y: 7, requestId: randomUUID() });
  r.setTravel(false);
  const off = await spy(r, go);
  assert.notEqual(off.result.status, 200); assert.deepEqual(off.writes, []);
  assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM citizen_travel").first()).n, 0);
  r.setTravel(true);
  const on = await spy(r, go);
  assert.equal(on.result.status, 200, JSON.stringify(on.result.data)); assert.ok(on.writes.length > 0, 'baseline: the spy sees the flag-on write');
});

test('HARIMU_FAITH_ENABLED off: choose-faith and attend-worship write nothing; flag-on baseline writes', async t => {
  const r = await runtime(t);
  const choose = () => r.call('faith', 'alice', { action: 'choose-faith', faithId: 'kinward-rite', requestId: randomUUID() });
  const worship = () => r.call('faith', 'alice', { action: 'attend-worship', requestId: randomUUID() });
  r.setFaith(false);
  const off = await spy(r, async () => [await choose(), await worship()]);
  for (const res of off.result) assert.notEqual(res.status, 200);
  assert.deepEqual(off.writes, []);
  r.setFaith(true);
  const on = await spy(r, choose);
  assert.equal(on.result.status, 200, JSON.stringify(on.result.data)); assert.ok(on.writes.length > 0, 'baseline: the spy sees the flag-on write');
});

// #384 M3: flag off, each command writes nothing and the GET keeps the same keys; flag-on baselines show the same spy sees the writes.
const offKeys = (res, keys) => assert.deepEqual(Object.keys(res.data).sort(), [...keys].sort(), 'no new keys while off');

test('HARIMU_FAITH_ENABLED off: attend-worship by a citizen who already has a faith writes nothing; flag-on baseline worship writes (QA3 on #684)', async t => {
  const r = await runtime(t);
  r.setFaith(true);
  assert.equal((await r.call('faith', 'alice', { action: 'choose-faith', faithId: 'kinward-rite', requestId: randomUUID() })).status, 200);
  const worship = () => r.call('faith', 'alice', { action: 'attend-worship', requestId: randomUUID() });
  r.setFaith(false);
  const off = await spy(r, worship);
  assert.notEqual(off.result.status, 200); assert.deepEqual(off.writes, []);
  r.setFaith(true);
  const on = await spy(r, worship);
  assert.equal(on.result.status, 200, JSON.stringify(on.result.data)); assert.ok(on.writes.length > 0, 'baseline: flag-on worship writes');
});

test('HARIMU_FAITH_ENABLED off: join-congregation and leave-congregation write nothing, GET keeps its keys; flag-on baseline join writes', async t => {
  const r = await runtime(t);
  r.setFaith(true);
  assert.equal((await r.call('faith', 'alice', { action: 'choose-faith', faithId: 'kinward-rite', requestId: randomUUID() })).status, 200);
  const cmd = action => r.call('congregations', 'alice', { action, requestId: randomUUID() });
  const keys = Object.keys((await r.call('congregations', 'alice')).data);
  r.setFaith(false);
  const off = await spy(r, async () => [await cmd('join-congregation'), await cmd('leave-congregation'), await r.call('congregations', 'alice')]);
  for (const res of off.result.slice(0, 2)) assert.equal(res.data.reason, 'disabled');
  assert.deepEqual(off.writes, []); offKeys(off.result[2], keys); assert.equal(off.result[2].data.enabled, false);
  r.setFaith(true);
  const on = await spy(r, () => cmd('join-congregation'));
  assert.equal(on.result.status, 200, JSON.stringify(on.result.data)); assert.ok(on.writes.length > 0, 'baseline: flag-on join writes');
});

const fundTessera = (r, user, tesseraMinor) => r.db.prepare("INSERT INTO citizen_tessera_exchanges(request_id,clerk_user_id,nation_id,spark_minor,tessera_minor,occurred_at) VALUES (?,?,'kindle',?,?,0)")
  .bind(randomUUID(), user, tesseraMinor * 4, tesseraMinor).run();
const registryKeys = ['currency', 'kiosk', 'open', 'priceMinor', 'tesseraMinor'];

test('HARIMU_SQUARE_PURCHASE_ENABLED off: buy-square writes nothing (world_squares and Tessera unchanged), GET keeps its keys with open:false; flag-on baseline writes', async t => {
  const r = await runtime(t); await fundTessera(r, 'alice', 5000);
  const buy = () => r.call('world/registry', 'alice', { action: 'buy-square', x: 9, y: 8, requestId: randomUUID() });
  const square = () => r.db.prepare('SELECT owner,zone FROM world_squares WHERE x=9 AND y=8').first();
  const before = { ...(await square()) };
  r.setSquarePurchase(false);
  const off = await spy(r, async () => [await buy(), await r.call('world/registry', 'alice')]);
  assert.equal(off.result[0].data.reason, 'disabled'); assert.deepEqual(off.writes, []);
  offKeys(off.result[1], registryKeys); assert.equal(off.result[1].data.open, false); assert.equal(off.result[1].data.tesseraMinor, 5000);
  assert.deepEqual({ ...(await square()) }, before);
  r.setSquarePurchase(true);
  const on = await spy(r, buy);
  assert.equal(on.result.status, 200, JSON.stringify(on.result.data)); assert.ok(on.writes.length > 0, 'baseline: flag-on buy writes');
});

test('HARIMU_TESSERA_EXCHANGE_ENABLED off: the kiosk buy-tessera writes nothing (wallet and ledger unchanged), GET keeps its keys; flag-on baseline writes', async t => {
  const r = await runtime(t); r.setSquarePurchase(true);
  await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' });
  const shift = (await r.call('citizen', 'alice')).data.shifts.find(s => !s.claimedAt); r.setNow(Date.parse(shift.completesAt));
  assert.equal((await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id })).status, 200);
  const wallet = async () => (await r.call('citizen', 'alice')).data.economy.walletMinor, spark = await wallet();
  const kiosk = () => r.call('world/registry', 'alice', { action: 'buy-tessera', tesseraMinor: 100, requestId: randomUUID() });
  r.setTesseraExchange(false);
  const off = await spy(r, async () => [await kiosk(), await r.call('world/registry', 'alice')]);
  assert.equal(off.result[0].data.reason, 'disabled'); assert.deepEqual(off.writes, []);
  offKeys(off.result[1], registryKeys); assert.equal(off.result[1].data.tesseraMinor, 0);
  assert.equal(await wallet(), spark);
  r.setTesseraExchange(true);
  const on = await spy(r, kiosk);
  assert.equal(on.result.status, 200, JSON.stringify(on.result.data)); assert.ok(on.writes.length > 0, 'baseline: flag-on kiosk writes');
});

test('HARIMU_CITY_FOUNDING_ENABLED off: found-city writes nothing (no city, world_squares owner and zone unchanged); flag-on baseline writes', async t => {
  const r = await runtime(t);
  const found = () => r.call('world/found-city', 'alice', { action: 'kindle-charter', x: 21, y: 13, name: 'Emberford', requestId: `found-${randomUUID().slice(0, 8)}` });
  const block = async () => (await r.db.prepare('SELECT x,y,owner,zone FROM world_squares WHERE x BETWEEN 19 AND 23 AND y BETWEEN 11 AND 15 ORDER BY y,x').all()).results.map(s => ({ ...s }));
  const before = await block();
  r.setCityFounding(false);
  const off = await spy(r, found);
  assert.notEqual(off.result.status, 200); assert.deepEqual(off.writes, []);
  assert.deepEqual(Object.keys(off.result.data).sort(), ['error', 'reason']);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM world_cities').first()).n), 0); assert.deepEqual(await block(), before);
  r.setCityFounding(true);
  const on = await spy(r, found);
  assert.equal(on.result.status, 200, JSON.stringify(on.result.data)); assert.ok(on.writes.length > 0, 'baseline: flag-on founding writes');
});
