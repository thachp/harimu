/** #988: Cloudflare error 10055 counts secrets + plain-text vars, limit 128 (Workers Paid). Hyperdrive, AI, D1 and Durable Objects are not text bindings.
 *  Run 40757731540 printed 123 plain-text vars and the API counted 129. The 6 not in that upload were the 4 dashboard-managed names
 *  (3 of those are in wrangler.jsonc, stripped, then present again) plus 2 secret_text bindings. A JSON pack is one binding.
 *  The ceiling is 127 so a few new flags still fit under 128. The #1001 imports note is a key of HARIMU_CITY_PACK. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { expandFlagPacks, flagOn, flagValue } from '../lib/flag-pack.mjs';
import { armiesEnabled } from '../lib/army-rules.ts';
import { dashboardManagedVars } from '../scripts/wrangler-pin.mjs';

const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
const TEXT_BINDING_CEILING = 127, KEPT_SECRET_TEXT_BINDINGS = 2;
const count = (vars, outside) => Object.keys(vars).length + outside.length + KEPT_SECRET_TEXT_BINDINGS;

test('preview and prod stay at or under 127 text bindings, counting known injects', () => {
  const outsidePreview = dashboardManagedVars.filter(name => !(name in preview.vars));
  const previewTotal = count(preview.vars, outsidePreview), prodTotal = count(prod.vars, []);
  assert.deepEqual(outsidePreview, ['HARIMU_QA_TEST_CITIZEN_IDS'], 'the only dashboard name missing from the file');
  assert.ok(previewTotal <= TEXT_BINDING_CEILING, `preview ${previewTotal} = ${Object.keys(preview.vars).length} file vars + ${outsidePreview.length} dashboard name not in the file + ${KEPT_SECRET_TEXT_BINDINGS} secrets`);
  assert.ok(prodTotal <= TEXT_BINDING_CEILING, `production ${prodTotal} = ${Object.keys(prod.vars).length} file vars + ${KEPT_SECRET_TEXT_BINDINGS} secrets`);
  assert.ok(TEXT_BINDING_CEILING - previewTotal >= 3, `preview headroom ${TEXT_BINDING_CEILING - previewTotal} is under 3`);
});

test('flag packs still answer env.HARIMU_* and a direct string wins', () => {
  const on = { HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_ARMY_PACK: preview.vars.HARIMU_ARMY_PACK, HARIMU_CITY_PACK: preview.vars.HARIMU_CITY_PACK, HARIMU_AURELLE_PACK: preview.vars.HARIMU_AURELLE_PACK };
  assert.equal(flagOn(on, 'HARIMU_GRAY_MARKET_ENABLED'), true);
  assert.equal(flagOn(on, 'HARIMU_GRAY_RATION_RISE_ENABLED'), true);
  assert.equal(flagOn({ ...on, HARIMU_GRAY_MARKET_ENABLED: 'false' }, 'HARIMU_GRAY_MARKET_ENABLED'), false, 'a direct binding wins over the pack');
  assert.equal(flagValue({ HARIMU_GRAY_PACK: '{' }, 'HARIMU_GRAY_MARKET_ENABLED'), undefined, 'a bad pack is off');
  assert.equal(armiesEnabled({ ...on, HARIMU_WAR_ENABLED: 'true' }), true);
  assert.equal(armiesEnabled({ HARIMU_ARMY_PACK: prod.vars.HARIMU_ARMY_PACK, HARIMU_WAR_ENABLED: 'true' }), false);
  assert.equal(expandFlagPacks(preview.vars).HARIMU_ARMY_BATTLES_ENABLED, 'true');
  assert.equal(flagOn(on, 'HARIMU_CITY_CAPTURE_NOTE_ENABLED'), true);
  assert.equal(flagOn(on, 'HARIMU_CITY_CIVIC_UNIT_NOTE_ENABLED'), true);
  assert.equal(flagOn(on, 'HARIMU_CITY_IMPORTS_NOTE_ENABLED'), true);
  assert.equal(flagOn(on, 'HARIMU_CITY_TIER_POPULATION_NOTE_ENABLED'), true);
  assert.equal(expandFlagPacks(prod.vars).HARIMU_CITY_TIER_POPULATION_NOTE_ENABLED, 'false');
  assert.equal(flagOn({ ...on, HARIMU_CITY_IMPORTS_NOTE_ENABLED: 'false' }, 'HARIMU_CITY_IMPORTS_NOTE_ENABLED'), false, 'a direct binding wins over the pack');
  assert.equal(expandFlagPacks(preview.vars).HARIMU_CITY_IMPORTS_NOTE_ENABLED, 'true');
  assert.equal(expandFlagPacks(prod.vars).HARIMU_CITY_IMPORTS_NOTE_ENABLED, 'false');
  assert.equal(flagOn(on, 'HARIMU_CITY_GOVERNOR_NOTE_ENABLED'), true);
  assert.equal(expandFlagPacks(preview.vars).HARIMU_CITY_TIER_GROWTH_ENABLED, 'true');
  assert.equal('HARIMU_GRAY_PACK' in expandFlagPacks(preview.vars), false);
  assert.equal('HARIMU_CITY_PACK' in expandFlagPacks(preview.vars), false);
  assert.equal(flagOn(on, 'HARIMU_AURELLE_TSR_VIEW_ENABLED'), true);
  assert.equal(flagOn(on, 'HARIMU_CROWN_DEBASEMENT_ENABLED'), true);
  assert.equal(flagOn({ ...on, HARIMU_AURELLE_TSR_VIEW_ENABLED: 'false' }, 'HARIMU_AURELLE_TSR_VIEW_ENABLED'), false, 'a direct binding wins over the Aurelle pack');
  assert.equal(flagOn({ HARIMU_AURELLE_PACK: prod.vars.HARIMU_AURELLE_PACK }, 'HARIMU_AURELLE_RISING_ENABLED'), false);
  assert.equal(expandFlagPacks(preview.vars).HARIMU_AURELLE_TSR_VIEW_ENABLED, 'true');
  assert.equal(expandFlagPacks(prod.vars).HARIMU_AURELLE_TSR_VIEW_ENABLED, 'false');
  assert.equal('HARIMU_AURELLE_PACK' in expandFlagPacks(preview.vars), false);
});
