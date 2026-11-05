/** #1082: Varkand Alert Level banner and stamped dispatches. The stored level reaches the nation read through GET /api/world (#1081,
 *  tests/varkand-alert-1081.test.mjs); here a fixture supplies alertLevel, and a missing field is Green. Flag off and other nations stay as they are.
 *  The zz- prefix keeps this file last so --test-shard does not move earlier files between Postgres shards. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { varkandAlertLevel, varkandAlertMeaning, varkandAlertName, varkandDispatchEnabled } from '../lib/varkand-dispatch.ts';
import { dashboardManagedVars } from '../scripts/wrangler-pin.mjs';
import { componentModule } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_VARKAND_DISPATCH';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const field = (block, name) => block.match(new RegExp(`${name}: '([^']*)'`))[1];
const nationFrom = (src, id, next) => {
  const block = src.slice(src.indexOf(`id: '${id}'`), src.indexOf(`id: '${next}'`));
  return { id, name: field(block, 'name'), shortName: field(block, 'shortName'), capital: field(block, 'capital'), government: field(block, 'government'), economy: field(block, 'economy'), currency: field(block, 'currency'), religion: field(block, 'religion'), population: field(block, 'population'), treasury: field(block, 'treasury'), stability: Number(block.match(/stability: (\d+)/)[1]), motto: field(block, 'motto'), tradeStatus: field(block, 'tradeStatus') };
};
const { NationInstitutions } = await import(await componentModule(fileURLToPath(new URL('../app/nation-institutions.tsx', import.meta.url))));
const { GovernmentPanel } = await import(await componentModule(fileURLToPath(new URL('../app/government-panel.tsx', import.meta.url))));
const noop = () => {};
const nationProps = nation => ({ nation, citizenNation: nation, capacity: 10, workOrders: [{ id: 'harvest', nationId: 'kindle', name: 'Support the savanna harvest', detail: 'Recorded contribution', cost: 4 }], workPending: false, onWorldView: noop, onHousehold: noop, onWorkplace: noop, onCommitWork: noop });
const civic = (nationId, alertLevel) => renderToStaticMarkup(React.createElement(GovernmentPanel, { snapshot: null, nationId, alertLevel, localDemo: true, pending: false, error: null, onPetition: noop }));
const institutions = nation => renderToStaticMarkup(React.createElement(NationInstitutions, nationProps(nation)));
const bannerOf = html => html.match(/<div class="varkand-alert" data-alert="[^"]+">[\s\S]*?<\/div><\/div>/)[0];

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off, with binding headroom', async () => {
  assert.equal(varkandDispatchEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(varkandDispatchEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 21);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_VARKAND_DISPATCH/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_VARKAND_DISPATCH/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 21/);
  const outside = dashboardManagedVars.filter(name => !(name in preview.vars));
  const previewTotal = Object.keys(preview.vars).length + outside.length + 2;
  assert.ok(127 - previewTotal >= 3, `preview headroom ${127 - previewTotal} is under 3`);
});

test('a missing or unknown Alert Level is Green; the three Freedoms clauses stay the docs wording', () => {
  assert.equal(varkandAlertLevel(undefined), 'green');
  assert.equal(varkandAlertLevel({}), 'green');
  assert.equal(varkandAlertLevel({ alertLevel: undefined }), 'green');
  assert.equal(varkandAlertLevel({ alertLevel: 'blue' }), 'green');
  assert.equal(varkandAlertLevel('GREEN'), 'green');
  assert.deepEqual(['green', 'amber', 'red'].map(varkandAlertLevel), ['green', 'amber', 'red']);
  assert.equal(varkandAlertMeaning.green, 'Licensed press, civilian dress, internal passes rarely checked.');
  assert.equal(varkandAlertMeaning.amber, 'Checkpoints, curfew in game-night hours for public squares, censorship.');
  assert.equal(varkandAlertMeaning.red, 'Martial law, information fog for foreign news, movement by order only.');
  assert.deepEqual(varkandAlertName, { green: 'Green', amber: 'Amber', red: 'Red' });
});

test('styles name the level in text and with a distinct mark pattern, and do not animate', async () => {
  const css = await read('app/globals.css');
  const block = css.slice(css.indexOf('/* #1082'), css.indexOf('/* Greyed-out'));
  assert.match(block, /font-family:ui-monospace/);
  assert.match(block, /flex-wrap:wrap/);
  assert.match(block, /min-width:0/);
  assert.match(block, /max-width:100%/);
  assert.match(block, /overflow-wrap:break-word/);
  assert.match(block, /#c5d0ce/);
  assert.match(block, /#526b68/);
  assert.doesNotMatch(block, /\b(?:animation|transition)\s*:|@keyframes|(?<!text-)transform\s*:/);
  const pattern = level => block.match(new RegExp(`data-alert="${level}"\\] \\.varkand-alert-mark\\{([^}]*)\\}`))[1];
  assert.notEqual(pattern('green'), pattern('amber'));
  assert.notEqual(pattern('amber'), pattern('red'));
  const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
  const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  for (const [fg, bg] of [['#1a2422', '#c5d0ce'], ['#12331c', '#e7f4e4'], ['#3a2806', '#f8f1d6'], ['#4a1210', '#f8e6e2']]) assert.ok(contrast(fg, bg) >= 4.5, `${fg} on ${bg}`);
});

test('three levels, the missing-field fallback, flag off, and other nations', async () => {
  const src = await read('app/page.tsx');
  const varkand = nationFrom(src, 'varkand', 'veldwood'), kindle = nationFrom(src, 'kindle', 'confluence');
  assert.equal(varkand.capital, 'Watchfast');
  assert.equal('alertLevel' in varkand, false, 'the static nation read does not store a level');
  const marks = { green: '○', amber: '△', red: '□' };
  for (const level of ['green', 'amber', 'red']) {
    const fixture = { ...varkand, alertLevel: level };
    for (const html of [withFlag('true', () => civic('varkand', level)), withFlag('true', () => institutions(fixture))]) {
      const banner = bannerOf(html);
      assert.match(banner, new RegExp(`data-alert="${level}"`));
      assert.match(banner, new RegExp(`<span class="sr-only">Alert Level: ${varkandAlertName[level]}</span>`));
      assert.doesNotMatch(banner, /aria-label=/);
      assert.match(banner, new RegExp(`aria-hidden="true">${marks[level]}`));
      assert.match(banner, new RegExp(varkandAlertMeaning[level].replace(/[.]/g, '\\.')));
      assert.doesNotMatch(banner, /aria-live|role="status"|role="alert"/);
      assert.match(html, /class="varkand-dispatch-stamp" aria-hidden="true"/);
      assert.match(html, /class="[^"]*varkand-dispatch/);
    }
  }
  const missing = withFlag('true', () => civic('varkand', undefined));
  const missingNation = withFlag('true', () => institutions(varkand));
  for (const html of [missing, missingNation]) assert.match(bannerOf(html), /data-alert="green"/);
  assert.match(missing, /Civic play coming soon/);
  assert.match(missingNation, /<h3>Watchfast<\/h3>/);
  assert.doesNotMatch(missingNation, /Directorate order|stamped dispatch/i);
  const offCivic = withFlag('false', () => civic('varkand', 'red'));
  const offNation = withFlag(undefined, () => institutions({ ...varkand, alertLevel: 'red' }));
  for (const html of [offCivic, offNation]) assert.doesNotMatch(html, /varkand-alert|varkand-dispatch|Alert Level/);
  assert.match(offCivic, /Civic play coming soon/);
  assert.match(offNation, /<article aria-live="polite"><h3>Watchfast<\/h3>/);
  const kindleOn = withFlag('true', () => civic('kindle', 'red') + institutions({ ...kindle, alertLevel: 'red' }));
  const kindleOff = withFlag('false', () => civic('kindle', 'red') + institutions(kindle));
  assert.equal(kindleOn, kindleOff);
  assert.match(kindleOn, /Support the savanna harvest/);
  assert.match(kindleOn, /Start shift/);
  assert.doesNotMatch(kindleOn, /varkand-alert|varkand-dispatch/);
});
