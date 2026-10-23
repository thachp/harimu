/** #599 slice 2: the Diplomatic Hall tab and panel. Real components server-rendered with real React; the flag reaches the client through GET /api/citizen flags. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
const require = createRequire(import.meta.url);
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');

const cache = new Map();
async function load(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const src = await readFile(new URL(`../app/${rel}.tsx`, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const deps = {};
  for (const [, name] of js.matchAll(/require\("([^"]+)"\)/g)) if (name.startsWith('./') && !name.endsWith('.css') && !['./square-chat', './national-news'].includes(name)) deps[name] = await load(name.slice(2));
  const exports = {}; const mod = { exports };
  new Function('exports', 'require', 'module', js)(exports, name => {
    if (deps[name]) return deps[name];
    if (name === './square-chat') return { SquareChat: () => null };
    if (name === './national-news') return { NationalNewsControl: () => null };
    if (name.endsWith('.css')) return {};
    if (name === '@phosphor-icons/react') return new Proxy({}, { get: () => () => null });
    if (name.startsWith('../lib/')) return require(`${name}.ts`);
    return require(name);
  }, mod);
  cache.set(rel, mod.exports); return mod.exports;
}
const copy = require('../lib/diplomatic-hall-copy.ts');
const dock = async props => renderToStaticMarkup(React.createElement((await load('citizen-dock')).CitizenDock, { cityVisible: true, session: 'ready', configured: true, shifts: [], government: null, collectivePetitions: null, election: null, korund: null, onNavigate() {}, ...props }));

test('the Diplomatic Hall tab shows only with the flag on, signed in and enrolled, in Kindle or Aurelle', async () => {
  for (const nationId of ['kindle', 'aurelle']) assert.match(await dock({ diplomaticHall: true, nationId }), new RegExp(`>${copy.hallChrome.tabLabel}</button>`), nationId);
  const hidden = [
    ['flag off', { diplomaticHall: false, nationId: 'kindle' }], ['flag unset', { nationId: 'aurelle' }],
    ['Korund', { diplomaticHall: true, nationId: 'korund' }], ['another nation', { diplomaticHall: true, nationId: 'confluence' }], ['no nation', { diplomaticHall: true, nationId: null }],
    ['signed out', { diplomaticHall: true, nationId: 'kindle', session: 'anonymous' }], ['loading', { diplomaticHall: true, nationId: 'kindle', session: 'loading' }], ['local demo', { diplomaticHall: true, nationId: 'kindle', configured: false }],
  ];
  for (const [name, props] of hidden) assert.doesNotMatch(await dock(props), /Diplomatic Hall/, name);
  assert.match(await dock({ nationId: 'kindle' }), />Chat</, 'the other dock buttons are unchanged');
});

test('the panel and a post read from the copy module, with the poster nation tag and Remove only on your own post', async () => {
  const { DiplomaticHall, HallPostRow } = await load('diplomatic-hall');
  const html = renderToStaticMarkup(React.createElement(DiplomaticHall));
  for (const line of [copy.hallChrome.headerTitle, copy.hallExplainer.line.text, copy.hallExplainer.nationNote.text, copy.hallComposer.sendButton]) assert.ok(html.includes(line), line);
  assert.ok(html.includes(`placeholder="${copy.hallComposer.placeholder}"`)); assert.match(html, /<button type="submit" disabled="">Post<\/button>/, 'Post is off until there is text');
  const row = (nationId, mine) => renderToStaticMarkup(React.createElement(HallPostRow, { post: { id: 'a', handle: 'Citizen-0123456789abcdef', nationId, body: 'Hello hall', postedAt: 1790000000, mine }, onRemove() {}, formatTime: ms => String(ms) }));
  const { nationMark } = require('../lib/nation-themes.ts'), [kn, an] = [nationMark('kindle').name, nationMark('aurelle').name];
  const kindle = row('kindle', false), aurelle = row('aurelle', true);
  assert.ok(kindle.includes(`>${kn} citizen<`) && kindle.includes(`aria-label="Citizen of ${kn}"`)); assert.doesNotMatch(kindle, /Remove/);
  assert.ok(aurelle.includes(`>${an} citizen<`) && aurelle.includes(`aria-label="Citizen of ${an}"`)); assert.match(aurelle, />Remove</); assert.notEqual(kn, an);
  assert.ok(kindle.includes('Citizen-0123456789abcdef') && kindle.includes('Hello hall'));
  const src = await readFile(new URL('../app/diplomatic-hall.tsx', import.meta.url), 'utf8');
  assert.match(src, /hallRefusalFor\(data\.reason as HallRefusalKey\)/, 'refusals use the copy module lines by reason code');
  assert.match(src, /hallChrome\.emptyState\.text/);
});

for (const backend of ['sqlite', 'postgres']) test(`GET /api/citizen: one new flags field, off by default, and no other key moves (${backend})`, async t => {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('kay','kindle','kay',18,0,'Good standing',?,?)").bind(at, at).run();
  const off = (await r.call('citizen', 'kay')).data;
  assert.deepEqual(Object.keys(off.flags), ['market', 'diplomaticHall', 'mapOverlays']); assert.equal(off.flags.diplomaticHall, false);
  r.setDiplomaticHall(true);
  const on = (await r.call('citizen', 'kay')).data;
  assert.equal(on.flags.diplomaticHall, true);
  assert.deepEqual(Object.keys(on), Object.keys(off)); assert.deepEqual({ ...on, flags: null }, { ...off, flags: null }, 'only flags.diplomaticHall differs');
  assert.deepEqual(Object.keys(off), ['aurellePlan', 'election', 'collectivePetitions', 'korundPlan', 'firstWeek', 'flags', 'simulation', 'verification', 'economy', 'market', 'playerMarket', 'government', 'shifts', 'profile', 'plan', 'decision'].filter(k => k in off));
});

test('page and dock wiring: the flag is read from the snapshot, defaults to false, and the tab is gated by hallOpenTo', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'), dockSrc = await readFile(new URL('../app/citizen-dock.tsx', import.meta.url), 'utf8');
  assert.match(page, /const \[hallFlag, setHallFlag\] = useState\(false\)/); assert.match(page, /setHallFlag\(snapshot\.flags\.diplomaticHall === true\)/); assert.match(page, /<CitizenDock diplomaticHall=\{hallFlag\}/);
  assert.match(dockSrc, /const hallTab=diplomaticHall&&enabled&&hallOpenTo\(nationId\)/); assert.match(dockSrc, /diplomaticHall=false/);
});
