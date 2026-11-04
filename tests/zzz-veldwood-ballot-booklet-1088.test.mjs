/** #1088: a Veldwood viewer gets the wood-grain Ballot Booklet; other nations keep their own ballot styling.
 *  The zz- prefix keeps this file last so --test-shard does not move earlier files between Postgres shards. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { nationCrests } from '../lib/nation-crests.ts';
import { nationMarks } from '../lib/nation-themes.ts';
import { componentModule } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_VELDWOOD_BALLOT_BOOKLET';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const { BallotStatus, ballotStatusCopy, veldwoodBallotBookletEnabled } = await import(await componentModule(fileURLToPath(new URL('../app/veldwood-ballot-booklet.tsx', import.meta.url))));
const status = (nationId, kindleAccount, flag) => withFlag(flag, () => renderToStaticMarkup(React.createElement(BallotStatus, { nationId, kindleAccount })));
const nations = ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'fulmara'];
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(veldwoodBallotBookletEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(veldwoodBallotBookletEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 19);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_VELDWOOD_BALLOT_BOOKLET/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_VELDWOOD_BALLOT_BOOKLET/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 19/);
});

test('styles use Veldwood tokens, the reverse-diagonal pattern, scaled type, and no motion', async () => {
  const css = await read('app/globals.css');
  const block = css.slice(css.indexOf('/* #1088'), css.length);
  assert.match(block, /data-nation-pattern|45deg/);
  assert.match(block, /#25552f/); assert.match(block, /#f6ead3/); assert.match(block, /#e0a43a/); assert.match(block, /#96b66d/);
  assert.equal(nationCrests.veldwood.field, '#25552f'); assert.equal(nationCrests.veldwood.mark, '#f6ead3');
  assert.equal(nationCrests.veldwood.accent, '#e0a43a'); assert.equal(nationMarks.veldwood.accent, '#96b66d');
  assert.equal(nationMarks.veldwood.pattern, 'reverse-diagonal'); assert.equal(nationMarks.veldwood.symbol, '❖');
  assert.doesNotMatch(block, /font-size:\s*\d+(\.\d+)?px/);
  assert.match(block, /font-size:calc\(16px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /width:calc\(36px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /width:calc\(28px \* var\(--text-scale, 1\)\)/);
  assert.doesNotMatch(block, /\b(?:animation|transition)\s*:|@keyframes|(?<!text-)transform\s*:/);
  assert.ok(contrast('#25552f', '#f6ead3') >= 4.5, 'page ink on cream');
  assert.ok(contrast('#f6ead3', '#25552f') >= 4.5, 'cover title on field');
});

test('a Veldwood viewer gets the booklet; other nations keep their ballot copy and styling', async () => {
  const open = 'This location has no counted ballot. Protests and broader public-opinion systems are planned under each nation’s rules.';
  const kindle = 'Kindle’s preview ballot status is shown above. Protests and broader public-opinion systems are planned.';
  assert.equal(ballotStatusCopy('veldwood', true), open);
  assert.equal(ballotStatusCopy('kindle', true), kindle);
  assert.equal(ballotStatusCopy('kindle', false), open);
  for (const id of nations) assert.equal(ballotStatusCopy(id, id === 'kindle'), id === 'kindle' ? kindle : open);
  const on = status('veldwood', true, 'true');
  assert.match(on, /aria-label="Veldwood Ballot Booklet"/);
  assert.match(on, /data-nation-pattern="reverse-diagonal"/);
  assert.match(on, /class="nation-symbol veldwood-ballot-mark"/);
  assert.match(on, /❖/);
  assert.match(on, /data-nation-crest="veldwood"/);
  assert.match(on, /aria-label="Veldwood crest: a ring of seven leaves"/);
  assert.match(on, /<span class="veldwood-ballot-num" aria-hidden="true">1<\/span><p>This location has no counted ballot\.<\/p>/);
  assert.match(on, /<span class="veldwood-ballot-num" aria-hidden="true">2<\/span><p>Protests and broader public-opinion systems are planned under each nation’s rules\.<\/p>/);
  assert.equal([...on.matchAll(/<p>([^<]+)<\/p>/g)].filter(m => m[1] !== 'Veldwood Ballot Booklet').map(m => m[1]).join(' '), open);
  assert.doesNotMatch(on, /tabindex/i);
  for (const flag of ['false', undefined]) {
    const off = status('veldwood', true, flag);
    assert.equal(off, `<p>${open}</p>`);
    assert.doesNotMatch(off, /veldwood-ballot-booklet|Veldwood Ballot Booklet/);
  }
  const kindleOn = status('kindle', true, 'true');
  assert.equal(kindleOn, `<p>${kindle}</p>`);
  assert.doesNotMatch(kindleOn, /veldwood-ballot|type="radio"|kindle-civic/);
  for (const id of nations.filter(id => id !== 'kindle')) {
    const html = status(id, true, 'true');
    assert.equal(html, `<p>${open}</p>`, id);
    assert.doesNotMatch(html, /veldwood-ballot-booklet/);
  }
  const ranked = await read('app/ranked-ballot.tsx'), assembly = await read('app/assembly-ballot.tsx'), korund = await read('app/korund-plan-panel.tsx'), aurelle = await read('app/leader-panel.tsx');
  assert.match(ranked, /kindle-civic-ballot/); assert.doesNotMatch(ranked, /veldwood-ballot/);
  assert.match(assembly, /kindle-civic-ballot/); assert.doesNotMatch(assembly, /veldwood-ballot/);
  assert.match(korund, /korund-ration-booklet/); assert.doesNotMatch(korund, /veldwood-ballot/);
  assert.match(aurelle, /aurelle-sealed-scroll/); assert.doesNotMatch(aurelle, /veldwood-ballot/);
  assert.match(await read('app/page.tsx'), /<BallotStatus nationId=\{citizenNation\.id\} kindleAccount=\{clerkConfigured\} \/>/);
  const booklet = await read('app/veldwood-ballot-booklet.tsx');
  assert.match(booklet, /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_VELDWOOD_BALLOT_BOOKLET/);
  assert.match(booklet, /key=\{index\}/);
  assert.doesNotMatch(booklet, /key=\{line\}/);
});
