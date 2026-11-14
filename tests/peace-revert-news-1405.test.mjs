/** #1405: peace-revert news only includes a war the reader fought (docs §11.5 information fog, follow-up to #1379 and #1054).
 *  A Kindle–Aurelle treaty return stays off the Korund edition. Parties still see their own line. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86400;

for (const backend of ['sqlite', 'postgres']) {
  test(`#1405 ${backend}: an uninvolved reader, including Korund, does not see another pair's peace-revert line`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
    r.setFixtureEnv('HARIMU_WAR_PEACE_REVERT_ENABLED', 'true');
    r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(Math.floor(r.now / 1000) - 31 * D));
    const war = await r.importModule('lib/war.ts');
    const peace = await r.importModule('lib/war-peace-revert.ts');
    const news = await r.importModule('lib/national-news.ts');
    const at = Math.floor(r.now / 1000);
    const made = await war.declareWar(r.db, { attacker: 'kindle', defender: 'aurelle', casusBelli: 'Border incidents', declaredBy: 'AI President', requestId: randomUUID() }, at, { enabled: true });
    assert.equal(made.ok, true, JSON.stringify(made));
    const warId = made.war.id;
    await r.db.prepare("INSERT INTO war_peace_reverts (war_id,status,squares,reverted_at) VALUES (?,'done',2,?)").bind(warId, at).run();

    const items = async nation => peace.peaceRevertNewsItems(r.db, nation);
    const ids = rows => rows.map(row => row.id);
    const lineId = `war:${warId}:peace-revert`;
    const expected = peace.peaceRevertLine(2);

    const korundItems = await items('korund');
    assert.equal(ids(korundItems).includes(lineId), false, 'Korund omits a Kindle–Aurelle revert');
    assert.equal(korundItems.length, 0);

    for (const nation of ['kindle', 'aurelle']) {
      const rows = await items(nation);
      assert.equal(rows.length, 1, nation);
      assert.equal(rows[0].id, lineId);
      assert.equal(rows[0].title, 'Occupied squares returned');
      assert.equal(rows[0].text, expected);
    }

    const edition = await news.readNationalNews(r.db, 'korund', r.now, { peaceRevert: true });
    assert.equal(edition.items.some(item => item.id === lineId), false, 'Korund State Media omits the foreign revert');
    const kindleEdition = await news.readNationalNews(r.db, 'kindle', r.now, { peaceRevert: true });
    assert.ok(kindleEdition.items.some(item => item.id === lineId && item.text === expected), 'Kindle still carries the line');
    assert.equal((await news.readNationalNews(r.db, 'korund', r.now, {})).items.some(item => item.id === lineId), false, 'flag-off path does not read it');

    const home = await war.declareWar(r.db, { attacker: 'korund', defender: 'kindle', casusBelli: 'Border incidents', declaredBy: 'Chairman', requestId: randomUUID() }, at + 11 * D, { enabled: true });
    assert.equal(home.ok, true, JSON.stringify(home));
    await r.db.prepare("INSERT INTO war_peace_reverts (war_id,status,squares,reverted_at) VALUES (?,'done',1,?)").bind(home.war.id, at + 11 * D).run();
    const homeId = `war:${home.war.id}:peace-revert`;
    const korundHome = await items('korund');
    assert.equal(ids(korundHome).includes(lineId), false);
    assert.ok(ids(korundHome).includes(homeId), 'a war Korund fought still appears');
    assert.equal(korundHome.find(item => item.id === homeId).text, peace.peaceRevertLine(1));
    assert.equal(ids(await items('aurelle')).includes(homeId), false, 'Aurelle omits a Kindle–Korund revert');
  });
}
