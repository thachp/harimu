/** #1193: World atlas reads. Flag HARIMU_WORLD_ATLAS_READS_ENABLED in HARIMU_GRAY_PACK. Flag off: no nextFestival key on simulation.clock.
 *  nextFestival is the earliest date among the nation holiday clocks whose own flags are on, with every festival at that instant.
 *  #1214: Aurelle Coronation Day and Charter Fair join worldFestivalSources (no new flag; GRAY unchanged at 62). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { worldAtlasClockFields, worldAtlasReadsEnabled, worldFestivalSources, worldNextFestival } from '../lib/world-atlas-reads.ts';
import { aurelleNextCharterFairAt } from '../lib/aurelle-charter-fair.ts';
import { aurelleNextCoronationDayAt } from '../lib/aurelle-coronation-day.ts';
import { aurelleNextHearthNightAt } from '../lib/aurelle-hearth-night.ts';
import { fulmaraNextGrandRegattaAt } from '../lib/fulmara-grand-regatta.ts';
import { meridianNextCongressWeekAt } from '../lib/meridian-congress-week.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const F = 'HARIMU_WORLD_ATLAS_READS_ENABLED';
const DAY = 86_400_000;
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1'));
const allOn = Object.fromEntries(worldFestivalSources.map(s => [s.flag, 'true']));
const src = (nationId, name, flag, at) => ({ nationId, name, flag, nextAt: () => at });

test('pure: earliest enabled source wins, ties list every festival in source order, off sources are skipped', () => {
  const sources = [src('kindle', 'A', 'X_ON', 5 * DAY), src('fulmara', 'B', 'Y_ON', 3 * DAY), src('veldwood', 'C', 'Z_ON', 3 * DAY), src('korund', 'D', 'OFF', DAY)];
  const env = { X_ON: 'true', Y_ON: 'true', Z_ON: 'true', OFF: 'false' };
  assert.deepEqual(worldNextFestival(0, env, sources), { at: 3 * 86_400, festivals: [{ nationId: 'fulmara', name: 'B' }, { nationId: 'veldwood', name: 'C' }] });
  assert.deepEqual(worldNextFestival(0, { X_ON: 'true' }, sources), { at: 5 * 86_400, festivals: [{ nationId: 'kindle', name: 'A' }] });
  assert.equal(worldNextFestival(0, {}, sources), null, 'no festival flag on');
  assert.equal(worldNextFestival(0, { X_ON: 'true' }, [src('kindle', 'A', 'X_ON', Number.NaN)]), null, 'unsafe date is dropped');
});

test('pure: the real sources are docs-named, one clock each, all ten nations, Stilldays left out', () => {
  assert.equal(worldFestivalSources.length, 29);
  assert.deepEqual([...new Set(worldFestivalSources.map(s => s.nationId))], ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara']);
  assert.equal(worldFestivalSources.some(s => /stillday/i.test(s.name)), false);
  for (const s of worldFestivalSources) assert.match(s.flag, /^HARIMU_[A-Z_]+_ENABLED$/);
  const now = Date.UTC(2026, 10, 9);
  const next = worldNextFestival(now, allOn);
  const each = worldFestivalSources.map(s => s.nextAt(now));
  assert.equal(next.at, Math.min(...each) / 1000);
  assert.ok(next.at * 1000 > now, 'next is in the future');
  assert.deepEqual(next.festivals, worldFestivalSources.filter((s, i) => each[i] === next.at * 1000).map(({ nationId, name }) => ({ nationId, name })));
  const regattaOnly = worldNextFestival(now, { HARIMU_FULMARA_GRAND_REGATTA_ENABLED: 'true' });
  assert.deepEqual(regattaOnly, { at: fulmaraNextGrandRegattaAt(now) / 1000, festivals: [{ nationId: 'fulmara', name: 'Grand Regatta' }] });
  const pack = worldNextFestival(now, { HARIMU_GRAY_PACK: JSON.stringify({ HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED: 'true' }) });
  assert.equal(pack.at, meridianNextCongressWeekAt(now) / 1000, 'a festival flag in the pack counts');
  const aurelle = worldFestivalSources.filter(s => s.nationId === 'aurelle').map(s => s.name);
  assert.deepEqual(aurelle, ['Coronation Day', 'Hearth Night', 'Charter Fair'], 'docs §7.5 Aurelle holiday order; Heir\'s Naming stays out');
  // Identity pins: Aurelle clocks share Chair-anchor timestamps, so value checks alone can't prove wiring.
  const byName = name => worldFestivalSources.find(s => s.nationId === 'aurelle' && s.name === name);
  assert.equal(byName('Coronation Day').nextAt, aurelleNextCoronationDayAt);
  assert.equal(byName('Coronation Day').flag, 'HARIMU_AURELLE_CORONATION_DAY_ENABLED');
  assert.equal(byName('Hearth Night').nextAt, aurelleNextHearthNightAt);
  assert.equal(byName('Hearth Night').flag, 'HARIMU_AURELLE_HEARTH_NIGHT_ENABLED');
  assert.equal(byName('Charter Fair').nextAt, aurelleNextCharterFairAt);
  assert.equal(byName('Charter Fair').flag, 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
});

test('#1214: Coronation Day and Charter Fair are absent when their own flag is off and can win earliest when on', () => {
  const now = Date.UTC(2026, 10, 9);
  assert.equal(worldNextFestival(now, { HARIMU_AURELLE_CORONATION_DAY_ENABLED: 'false', HARIMU_AURELLE_CHARTER_FAIR_ENABLED: 'false' }), null);
  assert.equal(worldNextFestival(now, {}), null);
  const coronation = worldNextFestival(now, { HARIMU_AURELLE_CORONATION_DAY_ENABLED: 'true' });
  assert.deepEqual(coronation, { at: aurelleNextCoronationDayAt(now) / 1000, festivals: [{ nationId: 'aurelle', name: 'Coronation Day' }] });
  const fair = worldNextFestival(now, { HARIMU_AURELLE_CHARTER_FAIR_ENABLED: 'true' });
  assert.deepEqual(fair, { at: aurelleNextCharterFairAt(now) / 1000, festivals: [{ nationId: 'aurelle', name: 'Charter Fair' }] });
  // Same Chair-family cadence: when both are on they tie and keep docs order.
  const both = worldNextFestival(now, { HARIMU_AURELLE_CORONATION_DAY_ENABLED: 'true', HARIMU_AURELLE_CHARTER_FAIR_ENABLED: 'true' });
  assert.deepEqual(both, { at: aurelleNextCoronationDayAt(now) / 1000, festivals: [{ nationId: 'aurelle', name: 'Coronation Day' }, { nationId: 'aurelle', name: 'Charter Fair' }] });
});

test('clock fields: flag off is an empty object; flag on with no festival flag adds nothing', () => {
  const now = Math.floor(Date.UTC(2026, 10, 9) / 1000);
  assert.deepEqual(worldAtlasClockFields(now, { ...allOn }), {}, 'flag off');
  assert.deepEqual(worldAtlasClockFields(now, { ...allOn, [F]: 'false' }), {});
  assert.deepEqual(worldAtlasClockFields(now, undefined), {});
  assert.deepEqual(worldAtlasClockFields(now, { [F]: 'true' }), {});
  assert.deepEqual(worldAtlasClockFields(now, { ...allOn, [F]: 'true' }), { nextFestival: worldNextFestival(now * 1000, allOn) });
  assert.equal(worldAtlasReadsEnabled({ HARIMU_GRAY_PACK: JSON.stringify({ [F]: 'true' }) }), true);
});

test('GET /api/world: flag off leaves simulation.clock unchanged; flag on adds nextFestival', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_FULMARA_GRAND_REGATTA_ENABLED', 'true');
  const off = (await r.call('world')).data.simulation.clock;
  assert.equal('nextFestival' in off, false, 'flag off: no nextFestival key');
  r.setFixtureEnv(F, 'true');
  const on = (await r.call('world')).data.simulation.clock;
  assert.deepEqual(on.nextFestival, { at: fulmaraNextGrandRegattaAt(on.nowSeconds * 1000) / 1000, festivals: [{ nationId: 'fulmara', name: 'Grand Regatta' }] });
  const rest = { ...on }; delete rest.nextFestival;
  assert.deepEqual(Object.keys(rest).sort(), Object.keys(off).sort(), 'only nextFestival is added');
  r.setFixtureEnv('HARIMU_FULMARA_GRAND_REGATTA_ENABLED', 'false');
  assert.equal('nextFestival' in (await r.call('world')).data.simulation.clock, false, 'no festival flag on: absent');
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, last, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[F], undefined, 'not its own text binding');
  assert.equal(prod.vars[F], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[F], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[F], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-1), F, '#1193 is last');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-1), F);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), F);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-2), 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-3), 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-4), 'HARIMU_AURELLE_CORONATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-5), 'HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 62); // GRAY 62
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, F), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, F), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [F]: 'false' }, F), false);
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/world-atlas-reads\.ts/);
});
