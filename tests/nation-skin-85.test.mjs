// #85: nation skin PoC on the top bar (NEXT_PUBLIC_HARIMU_NATION_SKIN). Flag off and on run the same render assertions; only data-nation-skin differs.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as discovery from '../lib/nation-discovery.ts';
import { nationSkin, nationSkinEnabled, skinnedNations } from '../lib/nation-skin.ts';
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const exports = {};
let effects = [];
let stateCursor=0,stateOverrides={};
new Function('exports','require',compiled)(exports,name=>name==='@/lib/market-visibility'?require('../lib/market-visibility.ts'):name==='@/lib/ui-v2-world'?require('../lib/ui-v2-world.ts'):name==='@/lib/ui-v2-rail'?require('../lib/ui-v2-rail.ts'):name==='@/lib/ui-v2-city'?require('../lib/ui-v2-city.ts'):name==='@/lib/nation-skin'?require('../lib/nation-skin.ts'):name==='@/lib/ui-v2-mobile'?require('../lib/ui-v2-mobile.ts'):name==='@/lib/context-strip-copy'?require('../lib/context-strip-copy.ts'):name==='@/lib/hud-help'?require('../lib/hud-help.ts'):name==='@/lib/nation-themes'?require('../lib/nation-themes.ts'):name==='@/lib/nation-emblem'?require('../lib/nation-emblem.ts'):name==='@/lib/topbar-countdown'?require('../lib/topbar-countdown.ts'):name==='@/lib/world-age'?require('../lib/world-age.ts'):name==='@/lib/game-season'?require('../lib/game-season.ts'):name==='@/lib/korund-wallet-rations'?require('../lib/korund-wallet-rations.ts'):name==='./korund-wallet-rations'?{KorundWalletRations:()=>null}:name==='./topbar-countdown'?{TopbarCountdown:()=>null}:name==='./nation-symbol'?{NationSymbol:()=>null}:name==='./nation-crest'?{NationCrest:()=>null}:name==='@/lib/action-reasons'?require('../lib/action-reasons.ts'):name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./game-settings'?{GameSettings:()=>null}:name==='@/lib/notice-scope'?require('../lib/notice-scope.ts'):name==='./game-timer'?{GameTimer:()=>null}:name==='react'?{useEffect(fn){effects.push(fn);},useState(initial){const slot=stateCursor++;return [stateOverrides[slot]??initial,()=>{}];}}:name==='@/lib/nation-discovery'?discovery:name==='@phosphor-icons/react'?new Proxy({},{get:(_,key)=>String(key)}):name.endsWith('.css')?{}:name==='./game-viewport'?{default:()=>null}:require(name));
const props={view:'square',nation:{id:'kindle',name:'Kindle'},nations:[],capacity:18,localDemo:false,panel:null,onNavigate(){}};
function nodes(node){if(!node || typeof node!=='object')return [node]; if(typeof node.type==='function' && node.type.name==='HudHelp')return nodes(node.type(node.props));return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
const render=extra=>{stateCursor=0;return nodes(exports.GameShell({...props,...extra}));};
const hud=tree=>tree.find(n=>n?.type==='header'&&/\bgame-hud\b/.test(n.props.className));
const text=tree=>tree.filter(n=>typeof n==='string').join(' ');
const citizen=id=>({identityHold:'none',citizenNation:{id,name:id[0].toUpperCase()+id.slice(1)},nation:{id,name:id}});

test('flag: only the exact string "true"; skin only for a signed-in Kindle, Korund or Aurelle citizen', () => {
  assert.equal(nationSkinEnabled('true'), true); for (const v of [undefined, '', 'false', 'TRUE', '1']) assert.equal(nationSkinEnabled(v), false);
  assert.deepEqual([...skinnedNations], ['kindle', 'korund', 'aurelle']);
  for (const id of skinnedNations) { assert.equal(nationSkin(id, true), id); assert.equal(nationSkin(id, false), null); }
  for (const id of [null, undefined, '', 'ilmar', 'fulmara']) assert.equal(nationSkin(id, true), null, 'neutral for guests, pre-citizens and other nations');
});

for (const flag of ['false', 'true']) test(`top bar with NEXT_PUBLIC_HARIMU_NATION_SKIN=${flag}: same tree and text, the skin attribute only when on`, () => {
  process.env.NEXT_PUBLIC_HARIMU_NATION_SKIN = flag;
  try {
    for (const id of skinnedNations) {
      const tree = render(citizen(id)), bar = hud(tree);
      assert.ok(bar); assert.match(text(tree), /Your citizen/);
      assert.equal(bar.props['data-nation-skin'], flag === 'true' ? id : undefined);
      process.env.NEXT_PUBLIC_HARIMU_NATION_SKIN = 'false'; const plain = render(citizen(id)); process.env.NEXT_PUBLIC_HARIMU_NATION_SKIN = flag;
      assert.equal(text(tree), text(plain), 'copy unchanged'); assert.equal(tree.length, plain.length, 'same element tree');
      assert.equal(bar.props.className, hud(plain).props.className, 'same classes, so layout rules are shared');
    }
    for (const extra of [{}, { identityHold: 'loading', viewedNationHeld: true }, { visitorSession: true }]) assert.equal(hud(render(extra)).props['data-nation-skin'], undefined, 'guest / pre-citizen / loading: neutral');
    assert.equal(hud(render(citizen('ilmar'))).props['data-nation-skin'], undefined);
  } finally { delete process.env.NEXT_PUBLIC_HARIMU_NATION_SKIN; }
});

const css = readFileSync(new URL('../app/game-shell.css', import.meta.url), 'utf8');
const block = css.slice(css.indexOf('/* #85:'), css.indexOf('/* #392 S4 zoom rail'));
const rules = [...block.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim(), body: m[2] }));
const lum = hex => { const h = hex.replace('#', '').slice(0, 6); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test('skin CSS: scoped to [data-nation-skin], no layout properties, three distinct nations with one motif each', () => {
  assert.ok(rules.length >= 5); for (const r of rules) assert.match(r.sel, /^header\.game-hud\[data-nation-skin(=(kindle|korund|aurelle))?\]/, r.sel);
  for (const r of rules) assert.doesNotMatch(r.body, /(^|;)\s*(padding|margin|width|height|min-|max-|font|display|position|gap|flex|grid|border-width|border:|line-height|letter-spacing|top|left|right|bottom|inset:)/, 'skin only: ' + r.sel);
  const grounds = skinnedNations.map(id => rules.find(r => r.sel === `header.game-hud[data-nation-skin=${id}]`)?.body.match(/--skin-ground:(#[0-9a-f]{6})/)?.[1]);
  assert.equal(new Set(grounds).size, 3, 'each nation has its own ground');
  for (const id of skinnedNations) assert.match(rules.find(r => r.sel === `header.game-hud[data-nation-skin=${id}]`).body, /box-shadow|background-image/, id + ' motif');
});

test('contrast: every top bar text color is AA (4.5:1) and every focus outline is 3:1 on each nation ground and chip', () => {
  const textColors = ['#e4f1ef', '#dce7e8', '#d6ebe8', '#ead08a', '#d0ad54', '#a9bfc2', '#99afb4', '#95b3bd', '#91a9ae', '#77c7b8'];
  const focus = ['#80d8ce', '#8ad9cc', '#d6b45c', '#d8b35a', '#f7d080'];
  for (const id of skinnedNations) {
    const body = rules.find(r => r.sel === `header.game-hud[data-nation-skin=${id}]`).body;
    for (const ground of ['ground', 'chip'].map(k => body.match(new RegExp(`--skin-${k}:(#[0-9a-f]{6})`))[1])) {
      for (const c of textColors) assert.ok(ratio(c, ground) >= 4.5, `${id} ${c} on ${ground}: ${ratio(c, ground).toFixed(2)}`);
      for (const c of focus) assert.ok(ratio(c, ground) >= 3, `${id} focus ${c} on ${ground}`);
    }
  }
});

test('ARC on #819: chip hover uses the nation accent, and each accent is at least 3:1 against its own ground (otherwise the shared teal must stay)', () => {
  const hover = rules.find(r => /:hover/.test(r.sel) && /\.game-resources/.test(r.sel)); assert.ok(hover, 'a skinned chip hover rule'); assert.match(hover.body, /border-color:var\(--skin-accent\)/);
  for (const id of skinnedNations) {
    const body = rules.find(r => r.sel === `header.game-hud[data-nation-skin=${id}]`).body, get = k => body.match(new RegExp(`--skin-${k}:(#[0-9a-f]{6})`))[1];
    assert.ok(ratio(get('accent'), get('ground')) >= 3, `${id} accent ${get('accent')} on ${get('ground')}: ${ratio(get('accent'), get('ground')).toFixed(2)}`);
    assert.ok(ratio(get('accent'), get('chip')) >= 3, `${id} accent on chip`);
  }
});
