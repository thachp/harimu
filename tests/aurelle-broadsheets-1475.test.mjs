/** #1475: an Aurelle citizen founds one broadsheet and publishes bylined articles in the Court Gazette.
 *  Storage reuses kindle_newspapers / kindle_articles, keyed by the founder's current citizens.nation_id. No migration. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { aurelleBroadsheetCopy } from '../lib/kindle-newspapers.ts';
const require = createRequire(import.meta.url);

const FLAG = 'HARIMU_AURELLE_BROADSHEETS_ENABLED';
const KINDLE = 'HARIMU_KINDLE_NEWSPAPERS_ENABLED';
const flagOffError = 'Aurelle broadsheets are not available yet.';
const existsError = 'You already founded a newspaper.';
const nationError = 'Only a Kindle citizen can found a newspaper or publish an article.';
const iso = ms => new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
const player = data => data.items.filter(i => i.kind === 'player-article' || i.source === 'player');
const count = async (r, sql) => Number((await r.db.prepare(sql).first()).n);
const spy = async (r, fn) => {
  const prepare = r.db.prepare.bind(r.db), sql = [];
  r.db.prepare = q => { sql.push(String(q)); return prepare(q); };
  try { return { result: await fn(), sql }; }
  finally { r.db.prepare = prepare; }
};
const touchesArticles = sql => sql.some(q => /kindle_articles|kindle_newspapers/.test(q));

test('flag is preview true, production false, GRAY 96 at index 95, and listed in previewOnFlags', () => {
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_KORUND_STATE_MEDIA_WRITERS_ENABLED'), 94);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG), 95); // GRAY 96. Not pinned as last: #1490 trade renewal is index 96, #1495 NAP gate is index 97, and #1491 battle terrain is index 98.
  const preview = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  const prod = JSON.parse(readFileSync('wrangler.prod.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(preview.vars[FLAG], undefined);
  assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 95);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 95);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, FLAG), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, FLAG), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [FLAG]: 'false' }, FLAG), false);
  assert.match(readFileSync('tests/wrangler-prod-501b.test.mjs', 'utf8'), /'HARIMU_AURELLE_BROADSHEETS_ENABLED'/);
  assert.equal(aurelleBroadsheetCopy.proposal, true);
  assert.equal(aurelleBroadsheetCopy.found, 'Found a broadsheet');
  assert.equal(aurelleBroadsheetCopy.publish, 'Publish to your broadsheet');
  assert.equal(aurelleBroadsheetCopy.name, 'Broadsheet name');
  assert.equal(aurelleBroadsheetCopy.writer, 'Broadsheet writer');
  assert.equal(aurelleBroadsheetCopy.tag, 'Tolerated broadsheet');
  const ui = readFileSync('app/national-news.tsx', 'utf8');
  const post = readFileSync('app/api/news/route.ts', 'utf8').slice(readFileSync('app/api/news/route.ts', 'utf8').indexOf('export async function POST'));
  assert.match(ui, /kindleNewspapers&&nationId==='kindle'\|\|aurelleBroadsheets&&nationId==='aurelle'/);
  assert.match(ui, /aurelleBroadsheetCopy\.found/);
  assert.match(ui, /aurelleBroadsheetCopy\.publish/);
  assert.match(ui, /aurelleBroadsheetCopy\.name/);
  assert.match(ui, /aurelleBroadsheetCopy\.writer/);
  assert.match(ui, /news-broadsheet-tag/);
  assert.doesNotMatch(ui, /function Broadsheet|BroadsheetWriter/);
  assert.ok(post.indexOf('SELECT nation_id FROM citizens') < post.indexOf('AURELLE_BROADSHEETS_FLAG'));
  assert.ok(post.indexOf('SELECT nation_id FROM citizens') < post.indexOf('KINDLE_NEWSPAPERS_FLAG'));
  assert.match(readFileSync('lib/kindle-newspapers.ts', 'utf8'), /WHERE founder\.nation_id=\?/);
  assert.match(readFileSync('lib/national-news.ts', 'utf8'), /nationId==='aurelle'&&options\.aurelleBroadsheets&&options\.readerId/);
});

for (const backend of ['sqlite', 'postgres']) test(`#1475 broadsheets on ${backend}: flag off, both leak directions, replay, one paper, Korund, shadow-mute`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  const at = new Date(r.now).toISOString();
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle', display_name='Ada Shore' WHERE clerk_user_id='alice'").run();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('cara','aurelle','Cara Vale',18,0,'Good standing',?,?)").bind(at, at).run();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('noel','aurelle','Noel',18,0,'Good standing',?,?)").bind(at, at).run();
  await r.db.prepare("UPDATE citizens SET display_name=NULL WHERE clerk_user_id='noel'").run();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('kira','korund','Kira Stone',18,0,'Good standing',?,?)").bind(at, at).run();

  const before = await r.call('news', 'cara');
  assert.equal(before.status, 200);
  assert.equal(before.data.title, 'Aurelle Court Gazette');
  assert.equal(before.data.style, 'court');
  assert.equal(player(before.data).length, 0);
  assert.equal(JSON.stringify(before.data).includes('"tag"'), false);
  assert.equal('aurelleBroadsheets' in (await r.call('citizen', 'cara')).data.flags, false);
  const quietGet = await spy(r, () => r.call('news', 'cara'));
  assert.equal(touchesArticles(quietGet.sql), false, 'flag off: Aurelle GET does not query the article tables');
  const quietPost = await spy(r, () => r.call('news', 'alice', { action: 'found-paper', requestId: randomUUID(), name: 'Court Sheet' }));
  assert.equal(quietPost.result.status, 404);
  assert.equal(quietPost.result.data.error, flagOffError);
  assert.equal(touchesArticles(quietPost.sql), false, 'flag off: Aurelle POST does not query the article tables');
  const after = await r.call('news', 'cara');
  assert.deepEqual(Object.keys(after.data).sort(), Object.keys(before.data).sort());
  assert.deepEqual(after.data.items.map(i => i.id), before.data.items.map(i => i.id));
  assert.equal(await count(r, 'SELECT COUNT(*) AS n FROM kindle_newspapers'), 0);
  const kindleOff = await r.call('news', 'bob', { action: 'found-paper', requestId: randomUUID(), name: 'Harbor Ledger' });
  assert.equal(kindleOff.status, 404);
  assert.equal(kindleOff.data.error, 'Kindle newspapers are not available yet.');

  r.setFixtureEnv(FLAG, 'true');
  const armed = await r.call('news', 'cara');
  assert.deepEqual(Object.keys(armed.data).sort(), Object.keys(before.data).sort(), 'flag on with no articles adds no response key');
  assert.deepEqual(armed.data.items.map(i => ({ id: i.id, kind: i.kind ?? null, source: i.source })), before.data.items.map(i => ({ id: i.id, kind: i.kind ?? null, source: i.source })));
  assert.equal((await r.call('citizen', 'cara')).data.flags.aurelleBroadsheets, true);
  const loud = await spy(r, () => r.call('news', 'cara'));
  assert.equal(loud.sql.some(q => /kindle_articles/.test(q) && /founder\.nation_id/.test(q)), true);

  const foundId = randomUUID();
  const founded = await r.call('news', 'alice', { action: 'found-paper', requestId: foundId, name: 'Court Sheet' });
  assert.equal(founded.status, 200, founded.data.error);
  const replay = await r.call('news', 'alice', { action: 'found-paper', requestId: foundId, name: 'Other Sheet' });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.paper.id, founded.data.paper.id);
  assert.equal(await count(r, 'SELECT COUNT(*) AS n FROM kindle_newspapers'), 1);
  const second = await r.call('news', 'alice', { action: 'found-paper', requestId: randomUUID(), name: 'Second Sheet' });
  assert.equal(second.status, 403);
  assert.equal(second.data.error, existsError);
  assert.equal(await count(r, 'SELECT COUNT(*) AS n FROM kindle_newspapers'), 1);
  const pubId = randomUUID();
  const published = await r.call('news', 'alice', { action: 'publish', requestId: pubId, headline: 'Royal note', paragraphs: ['The yard kept the old hour.'] });
  assert.equal(published.status, 200, published.data.error);
  assert.equal((await r.call('news', 'alice', { action: 'publish', requestId: pubId, headline: 'Royal note', paragraphs: ['The yard kept the old hour.'] })).data.article.id, published.data.article.id);
  assert.equal(await count(r, 'SELECT COUNT(*) AS n FROM kindle_articles'), 1);
  const item = player((await r.call('news', 'cara')).data).find(i => i.title === 'Royal note');
  assert.ok(item);
  assert.equal(item.kind, 'player-article');
  assert.equal(item.source, 'player');
  assert.equal(item.paperName, 'Court Sheet');
  assert.equal(item.authorName, 'Ada Shore');
  assert.equal(item.tag, aurelleBroadsheetCopy.tag);
  assert.doesNotMatch(JSON.stringify(item), /AI-generated|ai-generated/i);

  assert.equal((await r.call('news', 'noel', { action: 'found-paper', requestId: randomUUID(), name: 'Plain Sheet' })).status, 200);
  assert.equal((await r.call('news', 'noel', { action: 'publish', requestId: randomUUID(), headline: 'Unsigned', paragraphs: ['No name on the door.'] })).status, 200);
  assert.equal(player((await r.call('news', 'cara')).data).find(i => i.title === 'Unsigned').authorName, 'A citizen');

  r.setFixtureEnv(KINDLE, 'true');
  assert.equal((await r.call('news', 'bob', { action: 'found-paper', requestId: randomUUID(), name: 'Harbor Ledger' })).status, 200);
  assert.equal((await r.call('news', 'bob', { action: 'publish', requestId: randomUUID(), headline: 'Shifts posted', paragraphs: ['Twelve shifts cleared at the yard.'] })).status, 200);
  const aurelleFeed = player((await r.call('news', 'cara')).data);
  assert.equal(aurelleFeed.some(i => i.title === 'Shifts posted' || i.paperName === 'Harbor Ledger'), false);
  const kindleFeed = player((await r.call('news', 'bob')).data);
  assert.equal(kindleFeed.some(i => i.paperName === 'Harbor Ledger' && i.title === 'Shifts posted'), true);
  assert.equal(kindleFeed.some(i => i.paperName === 'Court Sheet' || i.title === 'Royal note' || i.tag), false);

  const korund = await r.call('news', 'kira', { action: 'found-paper', requestId: randomUUID(), name: 'State Sheet' });
  assert.equal(korund.status, 403);
  assert.equal(korund.data.error, nationError);
  assert.equal(await count(r, "SELECT COUNT(*) AS n FROM kindle_newspapers WHERE founder_user_id='kira'"), 0);

  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', `alice@${iso(r.now - 60_000)}`);
  assert.ok(player((await r.call('news', 'alice')).data).some(i => i.title === 'Royal note'));
  assert.equal(player((await r.call('news', 'cara')).data).some(i => i.title === 'Royal note'), false);
  assert.equal(player((await r.call('news', 'cara')).data).some(i => i.title === 'Unsigned'), true);

  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', '');
  for (let i = 2; i <= 7; i++) {
    r.setNow(r.now + 60_000);
    assert.equal((await r.call('news', 'alice', { action: 'publish', requestId: randomUUID(), headline: `Dispatch ${i}`, paragraphs: ['One paragraph of news.'] })).status, 200);
  }
  const latest = player((await r.call('news', 'cara')).data);
  assert.deepEqual(latest.map(i => i.title), ['Dispatch 7', 'Dispatch 6', 'Dispatch 5', 'Dispatch 4', 'Dispatch 3', 'Dispatch 2']);
  assert.equal(latest.every(i => i.tag === 'Tolerated broadsheet' && !/AI-generated/i.test(JSON.stringify(i))), true);
});

test('#1475 Aurelle writer uses broadsheet wording and the Kindle writer stays a newspaper', async () => {
  const source = ts.transpileModule(await readFile(new URL('../app/national-news.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const papers = require('../lib/kindle-newspapers.ts');
  let cursor = 0, slots = [];
  const react = { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; }, useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial ?? null }; return slots[i]; }, useEffect() {} };
  const requests = [];
  const fetch = (url, options) => new Promise(resolve => requests.push({ url, options, resolve }));
  const exports = {};
  const local = name => name === '../lib/kindle-newspapers' ? papers
    : name === './wire-stories' ? { WireStories() { return null; } }
    : name === '../lib/wire-bylines' ? require('../lib/wire-bylines.ts')
    : name === '../lib/press-templates' ? require('../lib/press-templates.ts')
    : name === '../lib/news-intro-copy' ? require('../lib/news-intro-copy.ts')
    : name === '../lib/kill-switch-copy' ? require('../lib/kill-switch-copy.ts')
    : name === '../lib/morning-brief' ? require('../lib/morning-brief.ts')
    : name === './nation-document' ? { NationDocument() { return null; } }
    : name === './display-preferences' ? { useDisplayTimestamp: () => require('../lib/display-preferences.ts').displayTimestamp }
    : name === 'react-dom' ? { createPortal: node => node }
    : name === 'react' ? react
    : name === './weekly-addresses' ? { WeeklyAddresses() { return null; } }
    : name === './ai-disclosure' ? { AiTextTag() { return null; } }
    : name === './report-button' ? { ReportButton() { return null; } }
    : require(name);
  new Function('exports', 'require', 'fetch', 'document', source)(exports, local, fetch, { body: {} });
  const all = node => [node, ...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child => typeof child === 'object' ? all(child) : [child])];
  const words = tree => [...all(tree).filter(node => typeof node === 'string'), ...all(tree).map(node => node?.props?.['aria-label']).filter(Boolean)].join('\n');
  const render = broadsheet => { cursor = 0; return exports.NewspaperWriter({ onPublished() {}, broadsheet }); };
  const aurelle = words(render(true));
  for (const line of ['Found a broadsheet', 'Broadsheet name', 'Broadsheet writer']) assert.match(aurelle, new RegExp(line));
  assert.doesNotMatch(aurelle, /Newspaper name|Found paper|Newspaper writer|Found a newspaper|Publish article/);
  const kindle = words((() => { slots = []; return render(false); })());
  for (const line of ['Found a newspaper', 'Newspaper name', 'Found paper', 'Newspaper writer']) assert.match(kindle, new RegExp(line));
  assert.doesNotMatch(kindle, /Broadsheet name|Broadsheet writer|Found a broadsheet|Publish to your broadsheet/);
  slots = [];
  let tree = render(true);
  all(tree).find(node => node?.type === 'input').props.onChange({ target: { value: 'Court Sheet' } });
  tree = render(true);
  all(tree).find(node => node?.type === 'form').props.onSubmit({ preventDefault() {} });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  requests[0].resolve({ ok: true, json: async () => ({ paper: { name: 'Court Sheet' } }) });
  for (let i = 0; i < 20; i++) await Promise.resolve();
  const published = words(render(true));
  assert.match(published, /Publish to your broadsheet/);
  assert.doesNotMatch(published, /Publish article|Publish in /);
});
