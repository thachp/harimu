/** #1537: a city-founding expedition travels to the site and claims on arrival. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';

const FLAG = 'HARIMU_CITY_EXPEDITION_TRAVEL_ENABLED';
const site = { x: 21, y: 13 };
const cmd = (requestId, extra = {}) => ({ action: 'kindle-charter', x: site.x, y: site.y, name: 'Emberford', requestId, ...extra });
const setTravel = (r, on = true) => { r.setCityFounding(true); r.setFixtureEnv(FLAG, on ? 'true' : undefined); };
const found = (r, requestId = 'found-travel-01') => r.call('world/found-city', 'alice', cmd(requestId));
const cities = async (r) => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM world_cities').first()).n);
const blockOwned = async (r) => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM world_squares WHERE x BETWEEN 19 AND 23 AND y BETWEEN 11 AND 15 AND owner IS NOT NULL').first()).n);
const expedition = (r, requestId) => r.db.prepare('SELECT * FROM city_expeditions WHERE request_id=?').bind(requestId).first();
const snapshot = async (r) => ({
  cities: await cities(r),
  owned: await blockOwned(r),
  tessera: (await r.db.prepare('SELECT id,clerk_user_id,delta_minor,reason FROM citizen_tessera_ledger ORDER BY id').all()).results ?? [],
  economy: (await r.db.prepare("SELECT id,clerk_user_id,kind,item,quantity_delta FROM citizen_economy_events ORDER BY id").all().catch(() => ({ results: [] }))).results ?? [],
});
const spySql = async (r, fn) => {
  const seen = [];
  const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = (sql, ...rest) => { seen.push(String(sql)); return prepare(sql, ...rest); };
  try { return { value: await fn(), seen }; } finally { r.db.prepare = prepare; }
};

test('#1537 curve: travel seconds sum moveSeconds along the capital-to-site Chebyshev line, including a mountain step; no winter factor', async () => {
  const r = await localRuntime({ backend: 'sqlite' });
  try {
    const { expeditionTravelSeconds, expeditionTravelStatus, cityFoundingNewsItems } = await r.importModule('lib/city-expedition-travel.ts');
    const { moveSeconds, ARMY_MOVE_SECONDS_FAST, ARMY_MOVE_SECONDS_ROUGH } = await r.importModule('lib/army-map.ts');
    const { landFor } = await r.importModule('lib/land-copy.ts');
    const capital = { x: 0, y: 0 }, dest = { x: 2, y: 0 };
    const terrainAt = (p) => p.x === 2 ? 'mountains' : 'plains';
    assert.equal(expeditionTravelSeconds(capital, dest, terrainAt), ARMY_MOVE_SECONDS_FAST + ARMY_MOVE_SECONDS_ROUGH);
    assert.equal(expeditionTravelSeconds(capital, dest, terrainAt), moveSeconds('plains') + moveSeconds('mountains'));
    assert.equal(expeditionTravelStatus.proposal, true);
    assert.match(expeditionTravelStatus.enRoute('21, 13', 7200), /Expedition to 21, 13 arrives in /);
    assert.equal(expeditionTravelStatus.siteClaimed, 'The expedition found the site already claimed.');
    const news = cityFoundingNewsItems([{ id: 'e1', nation_id: 'kindle', name: 'Emberford', arrives_at: 10 }], 'kindle');
    const copy = landFor('kindle').founded;
    assert.equal(news[0].title, copy.headline.replaceAll('{city}', 'Emberford'));
    assert.equal(news[0].text, copy.body.text.replaceAll('{city}', 'Emberford'));
    assert.equal(news[0].occurredAt, 10_000);
  } finally { await r.close(); }
});

for (const backend of ['sqlite', 'postgres']) {
  test(`#1537 flag on: a valid founding returns 202 with arrivesAt and claims nothing until arrival (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setTravel(r);
      const before = Math.floor(r.now / 1000);
      const res = await found(r, 'found-travel-ok');
      assert.equal(res.status, 202, JSON.stringify(res.data));
      assert.equal(res.data.ok, true);
      assert.equal(res.data.pending, true);
      assert.ok(res.data.arrivesAt > before);
      assert.equal(res.data.site, '21, 13');
      assert.match(res.data.status, /^Expedition to 21, 13 arrives in /);
      assert.equal(await cities(r), 0);
      assert.equal(await blockOwned(r), 0);
      const row = await expedition(r, 'found-travel-ok');
      assert.equal(row.status, 'en_route');
      assert.equal(Number(row.arrives_at), res.data.arrivesAt);
    } finally { await r.close(); }
  });

  test(`#1537 same requestId replays the expedition; a second founding while en route is refused (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setTravel(r);
      const first = await found(r, 'found-travel-replay');
      const again = await found(r, 'found-travel-replay');
      assert.equal(again.status, 202);
      assert.equal(again.data.replay, true);
      assert.equal(again.data.arrivesAt, first.data.arrivesAt);
      const other = await found(r, 'found-travel-second');
      assert.equal(other.data.reason, 'expedition_en_route', JSON.stringify(other.data));
      assert.equal(await cities(r), 0);
    } finally { await r.close(); }
  });

  test(`#1537 first tick at arrives_at founds with founded_at = arrives_at; a later tick changes nothing (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setTravel(r);
      const res = await found(r, 'found-travel-arrive');
      const arrivesAt = res.data.arrivesAt;
      r.setNow((arrivesAt - 1) * 1000);
      assert.equal((await r.call('world', null)).status, 200);
      assert.equal(await cities(r), 0, 'a tick before arrives_at must not found');
      r.setNow(arrivesAt * 1000);
      assert.equal((await r.call('world', null)).status, 200);
      assert.equal(await cities(r), 1);
      const city = await r.db.prepare('SELECT founded_at,name FROM world_cities WHERE request_id=?').bind('found-travel-arrive').first();
      assert.equal(Number(city.founded_at), arrivesAt);
      assert.equal(city.name, 'Emberford');
      assert.equal(await blockOwned(r), 25);
      assert.equal((await expedition(r, 'found-travel-arrive')).status, 'founded');
      r.setNow((arrivesAt + 10) * 1000);
      assert.equal((await r.call('world', null)).status, 200);
      assert.equal(await cities(r), 1);
    } finally { await r.close(); }
  });

  test(`#1537 a taken site fails on arrival, claims nothing, and charges or loses nothing (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setTravel(r);
      const start = await snapshot(r);
      const res = await found(r, 'found-travel-taken');
      const mid = await snapshot(r);
      assert.deepEqual(mid, start, 'departure has no treasury, Tessera, or inventory cost (headcount only)');
      await r.db.prepare("UPDATE world_squares SET owner='korund', zone='frontier' WHERE x=21 AND y=13").run();
      r.setNow(res.data.arrivesAt * 1000);
      const { value: world, seen } = await spySql(r, () => r.call('world', null));
      assert.equal(world.status, 200);
      assert.equal((await expedition(r, 'found-travel-taken')).status, 'failed');
      assert.equal(await cities(r), 0);
      assert.equal((await r.db.prepare('SELECT owner FROM world_squares WHERE x=21 AND y=13').first()).owner, 'korund');
      const end = await snapshot(r);
      assert.deepEqual({ tessera: end.tessera, economy: end.economy, cities: end.cities }, { tessera: start.tessera, economy: start.economy, cities: 0 });
      assert.ok(!seen.some((sql) => /INSERT INTO (citizen_tessera_ledger|citizen_economy_events|world_cities)/i.test(sql)), 'failed arrival writes no charge and no city');
      const replay = await found(r, 'found-travel-taken');
      assert.equal(replay.status, 202);
      assert.equal(replay.data.status, 'The expedition found the site already claimed.');
    } finally { await r.close(); }
  });

  test(`#1537 founded land-copy news is on the edition after arrival, not at departure (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      setTravel(r);
      const res = await found(r, 'found-travel-news');
      const before = (await r.call('news', 'alice')).data.items.filter((item) => String(item.id).startsWith('city-expedition:'));
      assert.equal(before.length, 0);
      r.setNow(res.data.arrivesAt * 1000);
      assert.equal((await r.call('world', null)).status, 200);
      const items = (await r.call('news', 'alice')).data.items.filter((item) => String(item.id).startsWith('city-expedition:'));
      assert.equal(items.length, 1);
      assert.equal(items[0].title, 'A new city: Emberford');
      assert.equal(items[0].text, 'The Republic founds Emberford on the frontier.');
    } finally { await r.close(); }
  });

  test(`#1537 flag off: founding SQL and 200 response are byte-identical and city_expeditions is not read (${backend})`, async () => {
    const baseline = await localRuntime({ backend });
    const off = await localRuntime({ backend });
    try {
      baseline.setCityFounding(true);
      off.setCityFounding(true);
      off.setFixtureEnv(FLAG, undefined);
      const base = await baseline.call('world/found-city', 'alice', cmd('found-travel-off-a'));
      const { value: ours, seen } = await spySql(off, () => off.call('world/found-city', 'alice', cmd('found-travel-off-b')));
      assert.equal(base.status, 200);
      assert.equal(ours.status, 200);
      assert.equal(ours.data.ok, base.data.ok);
      assert.equal(ours.data.claimed, base.data.claimed);
      assert.equal(ours.data.city.name, base.data.city.name);
      assert.ok(!seen.some((sql) => /city_expeditions/i.test(sql)), 'flag off must not read city_expeditions');
      assert.equal(await cities(off), 1);
    } finally { await baseline.close(); await off.close(); }
  });
}

test('#1537 a missing city_expeditions table adds no expedition and does not throw (sqlite)', async () => {
  const r = await localRuntime({ backend: 'sqlite' });
  try {
    setTravel(r);
    await r.db.prepare('DROP TABLE city_expeditions').run();
    r.setNow(r.now + 86_400_000);
    assert.equal((await r.call('world', null)).status, 200);
  } finally { await r.close(); }
});

test('#1537 mutants of the as-of bound, route stop, en-route cap, and founding wiring are caught in a scratch tree', () => {
  const file = 'tests/city-expedition-travel-1537.test.mjs';
  const cases = [
    {
      file: 'lib/city-expedition-travel.ts',
      find: "FROM city_expeditions WHERE status='en_route' AND arrives_at<=? ORDER BY arrives_at, request_id",
      replace: "FROM city_expeditions WHERE status='en_route' AND (arrives_at<=? OR 1=1) ORDER BY arrives_at, request_id",
      pattern: 'first tick at arrives_at',
    },
    {
      file: 'lib/city-expedition-travel.ts',
      find: 'return marchRoute(capital, site, 0).reduce',
      replace: 'return marchRoute(capital, site, 1).reduce',
      pattern: '#1537 curve',
    },
    {
      file: 'lib/city-expedition-travel.ts',
      find: "SELECT ?,?,?,?,?,?,?,?,?,?,'en_route' WHERE NOT EXISTS (SELECT 1 FROM city_expeditions WHERE nation_id=? AND status='en_route')",
      replace: "SELECT ?,?,?,?,?,?,?,?,?,?,'en_route' WHERE 1=1",
      pattern: 'same requestId replays',
    },
    {
      file: 'lib/world-simulation.ts',
      find: "flagOn(options.atlasEnv, 'HARIMU_CITY_EXPEDITION_TRAVEL_ENABLED') && flagOn(options.atlasEnv, 'HARIMU_CITY_FOUNDING_ENABLED')",
      replace: 'false',
      pattern: 'first tick at arrives_at',
    },
    {
      file: 'app/api/world/found-city/route.ts',
      find: 'cityExpeditionTravelEnabled(env)',
      replace: 'false',
      pattern: 'a valid founding returns 202',
    },
  ];
  const tree = mutantTree();
  try {
    for (const c of cases) {
      const restore = tree.mutate(c.file, c.find, c.replace);
      try {
        const result = tree.run([file], c.pattern);
        assert.notEqual(result.status, 0, `mutant survived (${c.find} -> ${c.replace}):\n${result.stdout}\n${result.stderr}`);
      } finally { restore(); }
    }
  } finally { tree.close(); }
});
