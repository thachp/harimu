/** #1193: World atlas reads. Flag HARIMU_WORLD_ATLAS_READS_ENABLED in HARIMU_GRAY_PACK. Flag off: no nextFestival key on simulation.clock.
 *  nextFestival is the earliest date among the nation holiday clocks whose own flags are on, with every festival at that instant.
 *  #1214: Aurelle Coronation Day and Charter Fair join worldFestivalSources (no new flag; GRAY unchanged at 62).
 *  #1228: Hoarvale Opening of the Moot joins worldFestivalSources on its own flag (no new flag; GRAY unchanged).
 *  #1231: Kindle Ballot Night joins on HARIMU_KINDLE_ELECTION_CLOCK_ENABLED (no new flag; GRAY unchanged). A missing cycle start skips it.
 *  #1236/#1237: Varkand Lantern Watch and Ilmar Assembly Election join on their existing flags (no new flag; GRAY unchanged).
 *  #1240: Hoarvale Election Night joins on HARIMU_HOARVALE_ELECTION_NIGHT_ENABLED (no new flag; GRAY unchanged). It shares Opening of the Moot's instant; a tie lists both, Opening first. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { displayTimestamp } from '../lib/display-preferences.ts';
import { hoarvaleElectionNightSnapshot, hoarvaleMootAt, hoarvaleMootOpeningSnapshot, ilmarAssemblyElectionDaySnapshot, ilmarGreatPilgrimageSnapshot, ilmarSanctumSnapshot, varkandGovernmentSnapshot, varkandLanternWatchSnapshot, varkandRotationDaySnapshot } from '../lib/government.ts';
import { ilmarNextAssemblyElectionDayAt } from '../lib/ilmar-assembly-election-day.ts';
import { ilmarNextGreatPilgrimageAt } from '../lib/ilmar-great-pilgrimage.ts';
import { ilmarNextGreatPilgrimageAt as sanctumNextGreatPilgrimageAt } from '../lib/ilmar-sanctum.ts';
import { hoarvaleNextElectionNightAt } from '../lib/hoarvale-election-night.ts';
import { hoarvaleNextMootOpeningAt } from '../lib/hoarvale-moot-opening.ts';
import { gameDayAt } from '../lib/topbar-countdown.ts';
import { varkandChairAt } from '../lib/varkand-directorate.ts';
import { varkandNextLanternWatchAt } from '../lib/varkand-lantern-watch.ts';
import { varkandNextRotationDayAt } from '../lib/varkand-rotation-day.ts';
import { spokenRemaining } from '../lib/veldwood-wallet-dividend.ts';
import { ageHudLine, worldAgeAt } from '../lib/world-age.ts';
import { worldAtlasStats } from '../lib/world-atlas.ts';
import { worldAtlasClockFields, worldAtlasReadsEnabled, worldFestivalSources, worldNextFestival } from '../lib/world-atlas-reads.ts';
import { aurelleNextCharterFairAt } from '../lib/aurelle-charter-fair.ts';
import { aurelleNextCoronationDayAt } from '../lib/aurelle-coronation-day.ts';
import { aurelleNextHearthNightAt } from '../lib/aurelle-hearth-night.ts';
import { kindleElectionClock } from '../lib/kindle-election.ts';
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
  assert.equal(worldFestivalSources.length, 34);
  assert.deepEqual([...new Set(worldFestivalSources.map(s => s.nationId))], ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara']);
  assert.equal(worldFestivalSources.some(s => /stillday/i.test(s.name)), false);
  for (const s of worldFestivalSources) assert.match(s.flag, /^HARIMU_[A-Z_]+_ENABLED$/);
  const now = Date.UTC(2026, 10, 9);
  const next = worldNextFestival(now, allOn);
  const each = worldFestivalSources.map(s => s.nextAt(now, allOn));
  const dated = each.filter(at => Number.isSafeInteger(at));
  assert.equal(next.at, Math.min(...dated) / 1000);
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

test('atlas row: a present nextFestival is shown from the read; missing or null leaves the row out', () => {
  const nowMs = Date.UTC(2026, 10, 9);
  const next = worldNextFestival(nowMs, { HARIMU_FULMARA_GRAND_REGATTA_ENABLED: 'true' });
  assert.ok(next, 'a real source is on');
  const epoch = Math.floor(nowMs / 1000) - 86_400, nowSeconds = Math.floor(nowMs / 1000);
  const shown = worldAtlasStats({ nations: [{ id: 'kindle' }], clock: { epochSeconds: epoch, nowSeconds, nextFestival: next } });
  const row = shown.find(item => item.label === 'Next festival');
  const relative = spokenRemaining((next.at - nowSeconds) * 1000);
  const expected = [next.festivals.map(festival => festival.name).join(' · '), displayTimestamp(next.at * 1000), `Day ${gameDayAt(epoch, next.at)}`, ...(relative ? [`in ${relative}`] : [])].join(' · ');
  assert.equal(row.value, expected);
  assert.match(row.value, /Grand Regatta/);
  assert.equal(shown.find(item => item.label === 'World age').value, ageHudLine(worldAgeAt(epoch * 1000, nowSeconds * 1000)));
  assert.equal(shown.some(item => item.label === 'Epoch' || item.label === 'Era'), false);
  const missing = worldAtlasStats({ nations: [{ id: 'kindle' }], clock: { epochSeconds: epoch, nowSeconds } });
  const absent = worldAtlasStats({ nations: [{ id: 'kindle' }], clock: { epochSeconds: epoch, nowSeconds, nextFestival: null } });
  assert.equal(missing.some(item => item.label === 'Next festival'), false);
  assert.equal(absent.some(item => item.label === 'Next festival'), false);
  assert.deepEqual(missing.map(item => item.label), absent.map(item => item.label));
  assert.deepEqual(missing.map(item => item.label), ['Nations', 'World age']);
});

test('#1215: Great Pilgrimage counts only while its own flag is on', async t => {
  const P = 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED';
  const S = 'HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED';
  const source = worldFestivalSources.find(s => s.name === 'Great Pilgrimage');
  assert.equal(source.nationId, 'ilmar');
  assert.equal(source.flag, P, 'the nextFestival candidate uses the pilgrimage flag, not the sanctum calendar');
  assert.equal(source.nextAt, ilmarNextGreatPilgrimageAt);
  assert.notEqual(source.nextAt, sanctumNextGreatPilgrimageAt);
  assert.equal(worldFestivalSources.find(s => s.name === 'Feast of First Light').flag, 'HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED');
  assert.equal(worldFestivalSources.some(s => s.flag === S), false, 'other sanctum calendar items stay on the sanctum flag');
  const now = Date.UTC(2026, 10, 9);
  const picks = env => (worldNextFestival(now, env)?.festivals ?? []).filter(item => item.name === 'Great Pilgrimage');
  assert.deepEqual(picks({ [S]: 'true' }), [], 'pilgrimage off, sanctum on: nextFestival never picks it');
  assert.equal('greatPilgrimage' in ilmarSanctumSnapshot(now, true), false);
  assert.equal(ilmarGreatPilgrimageSnapshot(now, flagOn({ [S]: 'true' }, P)), null);
  const on = worldNextFestival(now, { [P]: 'true' });
  assert.deepEqual(on, { at: ilmarNextGreatPilgrimageAt(now) / 1000, festivals: [{ nationId: 'ilmar', name: 'Great Pilgrimage' }] });
  assert.equal(ilmarGreatPilgrimageSnapshot(now, flagOn({ [P]: 'true' }, P)).greatPilgrimage.nextAt, ilmarNextGreatPilgrimageAt(now));
  assert.equal('sanctum' in ilmarGreatPilgrimageSnapshot(now, true), false);
  assert.deepEqual(picks({}), []);
  assert.equal(worldNextFestival(now, {}), null, 'both off');
  assert.equal(ilmarGreatPilgrimageSnapshot(now, false), null);
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='ilmar' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(F, 'true');
  const read = async () => {
    const clock = (await r.call('world')).data.simulation.clock;
    const government = (await r.call('citizen', 'alice')).data.government;
    return { clock, government, picked: (clock.nextFestival?.festivals ?? []).some(item => item.name === 'Great Pilgrimage') };
  };
  let { clock, government, picked } = await read();
  assert.equal(picked, false);
  assert.equal('nextFestival' in clock, false, 'both off: nextFestival absent');
  assert.equal(government == null || !('greatPilgrimage' in government), true, 'both off: no greatPilgrimage');
  r.setFixtureEnv(S, 'true');
  ({ clock, government, picked } = await read());
  assert.equal(picked, false, 'pilgrimage off, sanctum on: nextFestival never picks it');
  assert.equal('nextFestival' in clock, false);
  assert.equal('greatPilgrimage' in government, false, 'pilgrimage off, sanctum on: no greatPilgrimage');
  assert.equal('sanctum' in government, true);
  r.setFixtureEnv(S, 'false');
  r.setFixtureEnv(P, 'true');
  ({ clock, government, picked } = await read());
  const at = ilmarNextGreatPilgrimageAt(clock.nowSeconds * 1000);
  assert.equal(picked, true, 'pilgrimage on, sanctum off: nextFestival picks it');
  assert.deepEqual(clock.nextFestival, { at: at / 1000, festivals: [{ nationId: 'ilmar', name: 'Great Pilgrimage' }] });
  assert.equal(government.greatPilgrimage.nextAt, at);
  assert.equal(government.greatPilgrimage.cycleDays, 30);
  assert.equal('sanctum' in government, false);
});

test('#1223: Rotation Day counts only while its own flag is on', async t => {
  const R = 'HARIMU_VARKAND_ROTATION_DAY_ENABLED';
  const D = 'HARIMU_VARKAND_DIRECTORATE_ENABLED';
  const source = worldFestivalSources.find(s => s.name === 'Rotation Day');
  assert.equal(source.nationId, 'varkand');
  assert.equal(source.flag, R, 'the nextFestival candidate uses the rotation day flag, not the directorate');
  assert.equal(source.nextAt, varkandNextRotationDayAt);
  assert.notEqual(source.nextAt, varkandChairAt);
  assert.equal(worldFestivalSources.find(s => s.name === 'Muster Day').flag, 'HARIMU_VARKAND_MUSTER_DAY_ENABLED');
  assert.equal(worldFestivalSources.some(s => s.flag === D), false, 'other directorate calendar items stay on the directorate flag');
  const now = Date.UTC(2026, 10, 9);
  assert.equal(source.nextAt(now), varkandChairAt(now).nextRotationAt, 'the dedicated helper keeps the chair term instant');
  const picks = env => (worldNextFestival(now, env)?.festivals ?? []).filter(item => item.name === 'Rotation Day');
  assert.deepEqual(picks({ [D]: 'true' }), [], 'rotation day off, directorate on: nextFestival never picks it');
  assert.equal('rotationDay' in varkandGovernmentSnapshot(now, true), false);
  assert.equal(varkandRotationDaySnapshot(now, flagOn({ [D]: 'true' }, R)), null);
  const on = worldNextFestival(now, { [R]: 'true' });
  assert.deepEqual(on, { at: varkandNextRotationDayAt(now) / 1000, festivals: [{ nationId: 'varkand', name: 'Rotation Day' }] });
  assert.equal(varkandRotationDaySnapshot(now, flagOn({ [R]: 'true' }, R)).rotationDay.nextAt, varkandNextRotationDayAt(now));
  assert.equal('directorate' in varkandRotationDaySnapshot(now, true), false);
  assert.deepEqual(picks({}), []);
  assert.equal(worldNextFestival(now, {}), null, 'both off');
  assert.equal(varkandRotationDaySnapshot(now, false), null);
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(F, 'true');
  const read = async () => {
    const clock = (await r.call('world')).data.simulation.clock;
    const government = (await r.call('citizen', 'alice')).data.government;
    return { clock, government, picked: (clock.nextFestival?.festivals ?? []).some(item => item.name === 'Rotation Day') };
  };
  let { clock, government, picked } = await read();
  assert.equal(picked, false);
  assert.equal('nextFestival' in clock, false, 'both off: nextFestival absent');
  assert.equal(government == null || !('rotationDay' in government), true, 'both off: no rotationDay');
  r.setFixtureEnv(D, 'true');
  ({ clock, government, picked } = await read());
  assert.equal(picked, false, 'rotation day off, directorate on: nextFestival never picks it');
  assert.equal('nextFestival' in clock, false);
  assert.equal('rotationDay' in government, false, 'rotation day off, directorate on: no rotationDay');
  assert.equal('directorate' in government, true);
  r.setFixtureEnv(D, 'false');
  r.setFixtureEnv(R, 'true');
  ({ clock, government, picked } = await read());
  const at = varkandNextRotationDayAt(clock.nowSeconds * 1000);
  assert.equal(picked, true, 'rotation day on, directorate off: nextFestival picks it');
  assert.deepEqual(clock.nextFestival, { at: at / 1000, festivals: [{ nationId: 'varkand', name: 'Rotation Day' }] });
  assert.equal(at, varkandChairAt(clock.nowSeconds * 1000).nextRotationAt);
  assert.equal(government.rotationDay.nextAt, at);
  assert.equal(government.rotationDay.cycleDays, 60);
  assert.equal('directorate' in government, false);
});

test('#1228: Opening of the Moot is ignored while its own flag is off', async t => {
  const O = 'HARIMU_HOARVALE_MOOT_OPENING_ENABLED';
  const M = 'HARIMU_HOARVALE_MOOT_ENABLED';
  const source = worldFestivalSources.find(s => s.name === 'Opening of the Moot');
  assert.equal(source.nationId, 'hoarvale');
  assert.equal(source.flag, O, 'the nextFestival candidate uses the opening flag, not the moot term');
  assert.equal(source.nextAt, hoarvaleNextMootOpeningAt);
  assert.notEqual(source.nextAt, hoarvaleMootAt);
  assert.deepEqual(worldFestivalSources.filter(s => s.nationId === 'hoarvale').map(s => s.name), ['Opening of the Moot', 'Honors List Day', 'Aurora Night', 'Election Night'], 'docs holiday order');
  assert.equal(worldFestivalSources.find(s => s.name === 'Honors List Day').flag, 'HARIMU_HOARVALE_HONORS_LIST_DAY_ENABLED');
  assert.equal(worldFestivalSources.find(s => s.name === 'Aurora Night').flag, 'HARIMU_HOARVALE_AURORA_NIGHT_ENABLED');
  assert.equal(worldFestivalSources.some(s => s.flag === M), false, 'the moot term flag does not gate a festival');
  const now = Date.UTC(2026, 10, 9);
  assert.equal(source.nextAt(now), hoarvaleMootAt(Math.floor(now / 1000)).dissolvesBy * 1000, 'the dedicated helper keeps the moot term instant');
  const picks = env => (worldNextFestival(now, env)?.festivals ?? []).filter(item => item.name === 'Opening of the Moot');
  assert.deepEqual(picks({ [M]: 'true' }), [], 'opening off, moot on: nextFestival never picks it');
  assert.deepEqual(picks({ [O]: 'false' }), []);
  assert.deepEqual(picks({}), []);
  assert.equal(worldNextFestival(now, {}), null, 'every festival flag off');
  assert.equal(worldNextFestival(now, { [M]: 'true', [O]: 'false' }), null);
  assert.equal(hoarvaleMootOpeningSnapshot(now, flagOn({ [M]: 'true' }, O)), null);
  assert.equal(hoarvaleMootOpeningSnapshot(now, false), null);
  const later = { nationId: 'kindle', name: 'Later Fair', flag: 'HARIMU_LATER_FAIR_ENABLED', nextAt: () => source.nextAt(now) + DAY };
  assert.deepEqual(worldNextFestival(now, { HARIMU_LATER_FAIR_ENABLED: 'true', [O]: 'false' }, [later, source]), { at: (source.nextAt(now) + DAY) / 1000, festivals: [{ nationId: 'kindle', name: 'Later Fair' }] });
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(F, 'true');
  const read = async () => {
    const clock = (await r.call('world')).data.simulation.clock;
    const government = (await r.call('citizen', 'alice')).data.government;
    return { clock, government, picked: (clock.nextFestival?.festivals ?? []).some(item => item.name === 'Opening of the Moot') };
  };
  let { clock, government, picked } = await read();
  assert.equal(picked, false);
  assert.equal('nextFestival' in clock, false, 'both off: nextFestival absent');
  assert.equal(government == null || !('mootOpening' in government), true, 'both off: no mootOpening');
  r.setFixtureEnv(M, 'true');
  r.setFixtureEnv('HARIMU_HOARVALE_ASSENT_ENABLED', 'true');
  ({ clock, government, picked } = await read());
  assert.equal(picked, false, 'opening off, moot on: nextFestival never picks it');
  assert.equal('nextFestival' in clock, false);
  assert.equal('mootOpening' in government, false, 'opening off, moot on: no mootOpening');
  assert.equal('moot' in government, true);
});

test('#1228: Opening of the Moot wins nextFestival while its own flag is on', async t => {
  const O = 'HARIMU_HOARVALE_MOOT_OPENING_ENABLED';
  const M = 'HARIMU_HOARVALE_MOOT_ENABLED';
  const source = worldFestivalSources.find(s => s.name === 'Opening of the Moot');
  assert.equal(source.nextAt, hoarvaleNextMootOpeningAt);
  const now = Date.UTC(2026, 10, 9);
  const mootAt = hoarvaleMootAt(Math.floor(now / 1000)).dissolvesBy * 1000;
  assert.equal(source.nextAt(now), mootAt, 'same instant as the government Moot field');
  assert.equal(hoarvaleMootOpeningSnapshot(now, flagOn({ [M]: 'true' }, O)), null);
  const on = worldNextFestival(now, { [O]: 'true' });
  assert.deepEqual(on, { at: hoarvaleNextMootOpeningAt(now) / 1000, festivals: [{ nationId: 'hoarvale', name: 'Opening of the Moot' }] });
  assert.equal(hoarvaleMootOpeningSnapshot(now, flagOn({ [O]: 'true' }, O)).mootOpening.nextAt, hoarvaleNextMootOpeningAt(now));
  assert.equal('moot' in hoarvaleMootOpeningSnapshot(now, true), false);
  const later = { nationId: 'kindle', name: 'Later Fair', flag: 'HARIMU_LATER_FAIR_ENABLED', nextAt: () => source.nextAt(now) + DAY };
  assert.deepEqual(worldNextFestival(now, { [O]: 'true', HARIMU_LATER_FAIR_ENABLED: 'true' }, [later, source]), { at: mootAt / 1000, festivals: [{ nationId: 'hoarvale', name: 'Opening of the Moot' }] });
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(F, 'true');
  r.setFixtureEnv(M, 'false');
  r.setFixtureEnv(O, 'true');
  const read = async () => {
    const clock = (await r.call('world')).data.simulation.clock;
    const government = (await r.call('citizen', 'alice')).data.government;
    return { clock, government, picked: (clock.nextFestival?.festivals ?? []).some(item => item.name === 'Opening of the Moot') };
  };
  let { clock, government, picked } = await read();
  const at = hoarvaleNextMootOpeningAt(clock.nowSeconds * 1000);
  assert.equal(picked, true, 'opening on, moot off: nextFestival picks it');
  assert.deepEqual(clock.nextFestival, { at: at / 1000, festivals: [{ nationId: 'hoarvale', name: 'Opening of the Moot' }] });
  assert.equal(at, hoarvaleMootAt(clock.nowSeconds).dissolvesBy * 1000);
  assert.equal(government.mootOpening.nextAt, at);
  assert.equal('moot' in government, false);
  r.setFixtureEnv('HARIMU_HOARVALE_ASSENT_ENABLED', 'true');
  r.setFixtureEnv(M, 'true');
  ({ clock, government, picked } = await read());
  assert.equal(picked, true, 'opening on: nextFestival still picks it when the moot term is also on');
  assert.equal(clock.nextFestival.at, government.moot.dissolvesBy);
  assert.equal(government.mootOpening.nextAt, government.moot.dissolvesBy * 1000);
  assert.equal(government.mootOpening.nextAt, at);
});

test('the flag is preview true and production false inside HARIMU_GRAY_PACK, and a direct string wins', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars[F], undefined, 'not its own text binding');
  assert.equal(prod.vars[F], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[F], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[F], 'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-8), F, '#1207 Rotation Day, then #1208');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-8), F);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).at(-7), 'HARIMU_VARKAND_ROTATION_DAY_ENABLED');
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).at(-7), 'HARIMU_VARKAND_ROTATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-8), F);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-7), 'HARIMU_VARKAND_ROTATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-9), 'HARIMU_AURELLE_CHARTER_FAIR_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-10), 'HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-11), 'HARIMU_AURELLE_CORONATION_DAY_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-12), 'HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED');
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length, 69); // GRAY 69; #1241 Brasswell Port is last, #1220 red alert cancels is 68th
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, F), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, F), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [F]: 'false' }, F), false);
  assert.match(readFileSync('tests/helpers/local-runtime.mjs', 'utf8'), /lib\/world-atlas-reads\.ts/);
});

test('#1231: Ballot Night is skipped when its flag is off or the cycle start is unset or invalid', async t => {
  const K = 'HARIMU_KINDLE_ELECTION_CLOCK_ENABLED';
  const source = worldFestivalSources.find(s => s.name === 'Ballot Night');
  assert.equal(source.nationId, 'kindle');
  assert.equal(source.flag, K, 'the nextFestival candidate uses the existing election clock flag');
  assert.deepEqual(worldFestivalSources.filter(s => s.nationId === 'kindle').map(s => s.name), ['Ballot Night', "Founders' Forge Day", 'Market Bell'], 'docs §7 Kindle holiday order');
  assert.equal(worldFestivalSources.find(s => s.name === "Founders' Forge Day").flag, 'HARIMU_KINDLE_FOUNDERS_FORGE_DAY_ENABLED');
  assert.equal(worldFestivalSources.find(s => s.name === 'Market Bell').flag, 'HARIMU_KINDLE_MARKET_BELL_ENABLED');
  const now = Date.UTC(2026, 10, 9);
  const start = 1_700_000_000;
  const cycle = { HARIMU_KINDLE_CYCLE_START_AT: String(start) };
  assert.equal(Number.isSafeInteger(source.nextAt(now)), false, 'no env: no date');
  assert.equal(Number.isSafeInteger(source.nextAt(now, { [K]: 'true' })), false, 'flag on, cycle unset');
  for (const raw of ['', 'nope', '0', '-1', '1.5']) assert.equal(Number.isSafeInteger(source.nextAt(now, { [K]: 'true', HARIMU_KINDLE_CYCLE_START_AT: raw })), false, raw);
  const picks = env => (worldNextFestival(now, env)?.festivals ?? []).filter(item => item.name === 'Ballot Night');
  assert.deepEqual(picks({}), []);
  assert.deepEqual(picks({ [K]: 'false', ...cycle }), [], 'flag off skips it');
  assert.deepEqual(picks({ [K]: 'true' }), [], 'unset cycle start skips it');
  assert.deepEqual(picks({ [K]: 'true', HARIMU_KINDLE_CYCLE_START_AT: 'x' }), [], 'invalid cycle start skips it');
  assert.equal(worldNextFestival(now, { [K]: 'false', ...cycle }), null);
  assert.equal(worldNextFestival(now, { [K]: 'true' }), null, 'unset cycle start skips the only source');
  assert.equal(worldNextFestival(Number.MAX_SAFE_INTEGER, { [K]: 'true', ...cycle }), null, 'a held clock skips the source');
  const night = kindleElectionClock(start, now).nextBallotNightAt;
  const later = { nationId: 'fulmara', name: 'Later Fair', flag: 'HARIMU_LATER_FAIR_ENABLED', nextAt: () => night + DAY };
  assert.deepEqual(worldNextFestival(now, { [K]: 'false', HARIMU_LATER_FAIR_ENABLED: 'true', ...cycle }, [later, source]), { at: (night + DAY) / 1000, festivals: [{ nationId: 'fulmara', name: 'Later Fair' }] });
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(F, 'true');
  const read = async () => {
    const clock = (await r.call('world')).data.simulation.clock;
    const government = (await r.call('citizen', 'alice')).data.government;
    return { clock, government, picked: (clock.nextFestival?.festivals ?? []).some(item => item.name === 'Ballot Night') };
  };
  let { clock, government, picked } = await read();
  assert.equal(picked, false);
  assert.equal('nextFestival' in clock, false, 'flag off: nextFestival absent');
  assert.equal(government == null || !('electionClock' in government), true, 'flag off: no electionClock');
  r.setFixtureEnv(K, 'true');
  ({ clock, government, picked } = await read());
  assert.equal(picked, false, 'flag on, cycle unset: skipped');
  assert.equal('nextFestival' in clock, false);
  assert.equal(government == null || !('electionClock' in government), true, 'flag on, cycle unset: no electionClock');
  r.setFixtureEnv('HARIMU_KINDLE_CYCLE_START_AT', 'nope');
  ({ clock, government, picked } = await read());
  assert.equal(picked, false, 'invalid cycle start: skipped');
  assert.equal('nextFestival' in clock, false);
  assert.equal(government == null || !('electionClock' in government), true);
});

test('#1231: Ballot Night wins nextFestival when it is the earliest, on the government date', async t => {
  const K = 'HARIMU_KINDLE_ELECTION_CLOCK_ENABLED';
  const source = worldFestivalSources.find(s => s.name === 'Ballot Night');
  const now = Date.UTC(2026, 10, 9);
  const start = 1_700_000_000;
  const env = { [K]: 'true', HARIMU_KINDLE_CYCLE_START_AT: String(start) };
  const night = kindleElectionClock(start, now).nextBallotNightAt;
  assert.equal(source.nextAt(now, env), night, 'the source date is the election clock nextBallotNightAt');
  const on = worldNextFestival(now, env);
  assert.deepEqual(on, { at: night / 1000, festivals: [{ nationId: 'kindle', name: 'Ballot Night' }] });
  const later = { nationId: 'fulmara', name: 'Later Fair', flag: 'HARIMU_LATER_FAIR_ENABLED', nextAt: () => night + DAY };
  assert.deepEqual(worldNextFestival(now, { ...env, HARIMU_LATER_FAIR_ENABLED: 'true' }, [source, later]), { at: night / 1000, festivals: [{ nationId: 'kindle', name: 'Ballot Night' }] }, 'it wins when it is the earliest');
  const sooner = { nationId: 'fulmara', name: 'Sooner Fair', flag: 'HARIMU_SOONER_FAIR_ENABLED', nextAt: () => night - DAY };
  assert.deepEqual(worldNextFestival(now, { ...env, HARIMU_SOONER_FAIR_ENABLED: 'true' }, [source, sooner]).festivals.map(item => item.name), ['Sooner Fair']);
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(F, 'true');
  r.setFixtureEnv(K, 'true');
  r.setFixtureEnv('HARIMU_KINDLE_CYCLE_START_AT', String(start));
  const clock = (await r.call('world')).data.simulation.clock;
  const government = (await r.call('citizen', 'alice')).data.government;
  const at = kindleElectionClock(start, clock.nowSeconds * 1000).nextBallotNightAt;
  assert.equal((clock.nextFestival.festivals).some(item => item.name === 'Ballot Night'), true, 'it wins when it is the earliest');
  assert.deepEqual(clock.nextFestival, { at: at / 1000, festivals: [{ nationId: 'kindle', name: 'Ballot Night' }] });
  assert.equal(clock.nextFestival.at * 1000, government.electionClock.nextBallotNightAt, 'the atlas date equals the Kindle government read');
  assert.equal(government.electionClock.nextBallotNightAt, at);
});

test('#1237: Lantern Watch is skipped while its flag is off and equals the Varkand government date when on', async t => {
  const L = 'HARIMU_VARKAND_LANTERN_WATCH_ENABLED';
  const source = worldFestivalSources.find(s => s.name === 'Lantern Watch');
  assert.equal(source.nationId, 'varkand');
  assert.equal(source.flag, L, 'the nextFestival candidate uses the existing Lantern Watch flag');
  assert.equal(source.nextAt, varkandNextLanternWatchAt);
  assert.deepEqual(worldFestivalSources.filter(s => s.nationId === 'varkand').map(s => s.name), ['Muster Day', 'Rotation Day', 'Mandate Plebiscite', 'Lantern Watch'], 'docs Varkand holiday order');
  const now = Date.UTC(2026, 10, 9);
  const picks = env => (worldNextFestival(now, env)?.festivals ?? []).filter(item => item.name === 'Lantern Watch');
  assert.deepEqual(picks({}), [], 'flag off skips it');
  assert.deepEqual(picks({ [L]: 'false' }), []);
  assert.equal(worldNextFestival(now, { [L]: 'false' }), null);
  assert.equal(varkandLanternWatchSnapshot(now, false), null, 'flag off: no government clock');
  const at = varkandNextLanternWatchAt(now);
  assert.equal(source.nextAt(now), varkandLanternWatchSnapshot(now, true).lanternWatch.nextAt, 'same date as the government read');
  assert.deepEqual(worldNextFestival(now, { [L]: 'true' }), { at: at / 1000, festivals: [{ nationId: 'varkand', name: 'Lantern Watch' }] });
  const later = { nationId: 'kindle', name: 'Later Fair', flag: 'HARIMU_LATER_FAIR_ENABLED', nextAt: () => at + DAY };
  assert.deepEqual(worldNextFestival(now, { [L]: 'true', HARIMU_LATER_FAIR_ENABLED: 'true' }, [later, source]), { at: at / 1000, festivals: [{ nationId: 'varkand', name: 'Lantern Watch' }] }, 'it wins when it is the earliest');
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='varkand' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(F, 'true');
  let clock = (await r.call('world')).data.simulation.clock;
  let government = (await r.call('citizen', 'alice')).data.government;
  assert.equal((clock.nextFestival?.festivals ?? []).some(item => item.name === 'Lantern Watch'), false);
  assert.equal('nextFestival' in clock, false, 'flag off: nextFestival absent');
  assert.equal(government == null || !('lanternWatch' in government), true, 'flag off: no lanternWatch');
  r.setFixtureEnv(L, 'true');
  clock = (await r.call('world')).data.simulation.clock;
  government = (await r.call('citizen', 'alice')).data.government;
  const readAt = government.lanternWatch.nextAt;
  assert.equal(readAt, varkandNextLanternWatchAt(clock.nowSeconds * 1000));
  assert.deepEqual(clock.nextFestival, { at: readAt / 1000, festivals: [{ nationId: 'varkand', name: 'Lantern Watch' }] });
  assert.equal(clock.nextFestival.at * 1000, readAt, 'the atlas date equals the Varkand government read');
});

test('#1236: Assembly Election is skipped while its flag is off and equals the Ilmar government date when on', async t => {
  const A = 'HARIMU_ILMAR_ASSEMBLY_ELECTION_DAY_ENABLED';
  const S = 'HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED';
  const source = worldFestivalSources.find(s => s.name === 'Assembly Election');
  assert.equal(source.nationId, 'ilmar');
  assert.equal(source.flag, A, 'the nextFestival candidate uses the existing Assembly Election flag');
  assert.equal(source.nextAt, ilmarNextAssemblyElectionDayAt);
  assert.equal(worldFestivalSources.some(s => s.flag === S), false, 'Stilldays stay on the sanctum flag');
  assert.deepEqual(worldFestivalSources.filter(s => s.nationId === 'ilmar').map(s => s.name), ['Feast of First Light', 'Assembly Election', 'Great Pilgrimage'], 'docs Ilmar holiday order; Stilldays stay out');
  const now = Date.UTC(2026, 10, 9);
  const picks = env => (worldNextFestival(now, env)?.festivals ?? []).filter(item => item.name === 'Assembly Election');
  assert.deepEqual(picks({}), [], 'flag off skips it');
  assert.deepEqual(picks({ [A]: 'false' }), []);
  assert.deepEqual(picks({ [S]: 'true' }), [], 'sanctum on does not pick Assembly Election');
  assert.equal(worldNextFestival(now, { [A]: 'false' }), null);
  assert.equal(ilmarAssemblyElectionDaySnapshot(now, false), null, 'flag off: no government clock');
  const at = ilmarNextAssemblyElectionDayAt(now);
  assert.equal(source.nextAt(now), ilmarAssemblyElectionDaySnapshot(now, true).assemblyElectionDay.nextAt, 'same date as the government read');
  assert.deepEqual(worldNextFestival(now, { [A]: 'true' }), { at: at / 1000, festivals: [{ nationId: 'ilmar', name: 'Assembly Election' }] });
  const later = { nationId: 'kindle', name: 'Later Fair', flag: 'HARIMU_LATER_FAIR_ENABLED', nextAt: () => at + DAY };
  assert.deepEqual(worldNextFestival(now, { [A]: 'true', HARIMU_LATER_FAIR_ENABLED: 'true' }, [later, source]), { at: at / 1000, festivals: [{ nationId: 'ilmar', name: 'Assembly Election' }] }, 'it wins when it is the earliest');
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='ilmar' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(F, 'true');
  let clock = (await r.call('world')).data.simulation.clock;
  let government = (await r.call('citizen', 'alice')).data.government;
  assert.equal((clock.nextFestival?.festivals ?? []).some(item => item.name === 'Assembly Election'), false);
  assert.equal('nextFestival' in clock, false, 'flag off: nextFestival absent');
  assert.equal(government == null || !('assemblyElectionDay' in government), true, 'flag off: no assemblyElectionDay');
  r.setFixtureEnv(A, 'true');
  clock = (await r.call('world')).data.simulation.clock;
  government = (await r.call('citizen', 'alice')).data.government;
  const readAt = government.assemblyElectionDay.nextAt;
  assert.equal(readAt, ilmarNextAssemblyElectionDayAt(clock.nowSeconds * 1000));
  assert.deepEqual(clock.nextFestival, { at: readAt / 1000, festivals: [{ nationId: 'ilmar', name: 'Assembly Election' }] });
  assert.equal(clock.nextFestival.at * 1000, readAt, 'the atlas date equals the Ilmar government read');
});

test('#1240: Election Night is skipped while its flag is off and equals the Hoarvale government date when on', async t => {
  const E = 'HARIMU_HOARVALE_ELECTION_NIGHT_ENABLED';
  const O = 'HARIMU_HOARVALE_MOOT_OPENING_ENABLED';
  const M = 'HARIMU_HOARVALE_MOOT_ENABLED';
  const source = worldFestivalSources.find(s => s.name === 'Election Night');
  assert.equal(source.nationId, 'hoarvale');
  assert.equal(source.flag, E, 'the nextFestival candidate uses the existing Election Night flag');
  assert.equal(source.nextAt, hoarvaleNextElectionNightAt);
  // #1240 adds no GRAY flag. Later flags (#1220 red-alert cancels) may follow Election Night, so the pack length and the last slot are not this test's.
  const gray = FLAG_PACKS.HARIMU_GRAY_PACK;
  assert.equal(gray.includes(E), true, 'Election Night reuses the government flag already in GRAY');
  assert.equal(gray.filter(flag => flag === E).length, 1, 'that flag is unchanged');
  assert.equal(gray.includes('HARIMU_ATLAS_ELECTION_NIGHT_ENABLED'), false, 'no new flag and no GRAY change');
  for (const flag of new Set(worldFestivalSources.map(item => item.flag))) assert.equal(gray.includes(flag), true, `${flag} is an existing GRAY flag`);
  assert.deepEqual(worldFestivalSources.filter(s => s.nationId === 'hoarvale').map(s => s.name), ['Opening of the Moot', 'Honors List Day', 'Aurora Night', 'Election Night'], 'docs Hoarvale holiday order');
  const now = Date.UTC(2026, 10, 9);
  const prior = worldFestivalSources.filter(s => s.flag !== E);
  const picks = env => (worldNextFestival(now, env)?.festivals ?? []).filter(item => item.name === 'Election Night');
  assert.deepEqual(picks({}), [], 'flag off skips it');
  assert.deepEqual(picks({ [E]: 'false' }), []);
  assert.deepEqual(picks({ [M]: 'true' }), [], 'moot on does not pick Election Night');
  assert.deepEqual(picks({ [O]: 'true' }), [], 'opening on does not pick Election Night');
  assert.equal(worldNextFestival(now, { [E]: 'false' }), null);
  assert.equal(hoarvaleElectionNightSnapshot(now, false), null, 'flag off: no government clock');
  for (const env of [{}, { [E]: 'false' }, { [O]: 'true' }, { [O]: 'true', [E]: 'false' }, { ...allOn, [E]: 'false' }]) {
    assert.equal(JSON.stringify(worldNextFestival(now, env)), JSON.stringify(worldNextFestival(now, env, prior)), 'flag off: nextFestival matches the source list from before Election Night');
  }
  const seconds = Math.floor(now / 1000);
  const atlasOff = { ...allOn, [F]: 'true', [E]: 'false' };
  const fromPrior = worldNextFestival(now, atlasOff, prior);
  assert.equal(JSON.stringify(worldAtlasClockFields(seconds, atlasOff)), JSON.stringify(fromPrior ? { nextFestival: fromPrior } : {}));
  const at = hoarvaleNextElectionNightAt(now);
  assert.equal(source.nextAt(now), hoarvaleElectionNightSnapshot(now, true).electionNight.nextAt, 'same date as the government read');
  assert.equal(at, hoarvaleNextMootOpeningAt(now), 'same instant as Opening of the Moot');
  assert.deepEqual(worldNextFestival(now, { [E]: 'true' }), { at: at / 1000, festivals: [{ nationId: 'hoarvale', name: 'Election Night' }] });
  const later = { nationId: 'kindle', name: 'Later Fair', flag: 'HARIMU_LATER_FAIR_ENABLED', nextAt: () => at + DAY };
  assert.deepEqual(worldNextFestival(now, { [E]: 'true', HARIMU_LATER_FAIR_ENABLED: 'true' }, [later, source]), { at: at / 1000, festivals: [{ nationId: 'hoarvale', name: 'Election Night' }] }, 'it wins when it is the earliest');
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='hoarvale' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(F, 'true');
  let clock = (await r.call('world')).data.simulation.clock;
  let government = (await r.call('citizen', 'alice')).data.government;
  assert.equal((clock.nextFestival?.festivals ?? []).some(item => item.name === 'Election Night'), false);
  assert.equal('nextFestival' in clock, false, 'flag off: nextFestival absent');
  assert.equal(government == null || !('electionNight' in government), true, 'flag off: no electionNight');
  r.setFixtureEnv(E, 'true');
  clock = (await r.call('world')).data.simulation.clock;
  government = (await r.call('citizen', 'alice')).data.government;
  const readAt = government.electionNight.nextAt;
  assert.equal(readAt, hoarvaleNextElectionNightAt(clock.nowSeconds * 1000));
  assert.deepEqual(clock.nextFestival, { at: readAt / 1000, festivals: [{ nationId: 'hoarvale', name: 'Election Night' }] });
  assert.equal(clock.nextFestival.at * 1000, readAt, 'the atlas date equals the Hoarvale government read');
  r.setFixtureEnv(O, 'true');
  clock = (await r.call('world')).data.simulation.clock;
  government = (await r.call('citizen', 'alice')).data.government;
  assert.equal(government.electionNight.nextAt, government.mootOpening.nextAt);
  assert.deepEqual(clock.nextFestival, { at: government.electionNight.nextAt / 1000, festivals: [{ nationId: 'hoarvale', name: 'Opening of the Moot' }, { nationId: 'hoarvale', name: 'Election Night' }] });
});

test('#1240: a tie with Opening of the Moot lists both in Hoarvale row order', () => {
  const E = 'HARIMU_HOARVALE_ELECTION_NIGHT_ENABLED';
  const O = 'HARIMU_HOARVALE_MOOT_OPENING_ENABLED';
  const H = 'HARIMU_HOARVALE_HONORS_LIST_DAY_ENABLED';
  const A = 'HARIMU_HOARVALE_AURORA_NIGHT_ENABLED';
  const atOf = (now, name) => worldFestivalSources.find(s => s.nationId === 'hoarvale' && s.name === name).nextAt(now);
  const sample = Date.UTC(2026, 10, 9);
  const night = atOf(sample, 'Election Night');
  assert.equal(night, atOf(sample, 'Opening of the Moot'), 'zero offset: the same instant');
  assert.notEqual(atOf(sample, 'Honors List Day'), night);
  assert.notEqual(atOf(sample, 'Aurora Night'), night);
  assert.deepEqual(worldNextFestival(sample, { [O]: 'true', [E]: 'true' }), { at: night / 1000, festivals: [{ nationId: 'hoarvale', name: 'Opening of the Moot' }, { nationId: 'hoarvale', name: 'Election Night' }] });
  const boundary = night;
  assert.equal(atOf(boundary, 'Election Night'), atOf(boundary, 'Opening of the Moot'), 'an exact boundary still ties after both roll forward');
  assert.deepEqual(worldNextFestival(boundary, { [O]: 'true', [E]: 'true' }).festivals.map(item => item.name), ['Opening of the Moot', 'Election Night']);
  const sooner = { nationId: 'kindle', name: 'Sooner Fair', flag: 'HARIMU_SOONER_FAIR_ENABLED', nextAt: () => night - DAY };
  assert.deepEqual(worldNextFestival(sample, { [O]: 'true', [E]: 'true', HARIMU_SOONER_FAIR_ENABLED: 'true' }, [sooner, ...worldFestivalSources]).festivals, [{ nationId: 'kindle', name: 'Sooner Fair' }]);
  const same = { nationId: 'fulmara', name: 'Same Bell', flag: 'HARIMU_SAME_BELL_ENABLED', nextAt: () => night };
  assert.deepEqual(worldNextFestival(sample, { [O]: 'true', [E]: 'true', HARIMU_SAME_BELL_ENABLED: 'true' }, [...worldFestivalSources, same]).festivals.map(item => item.name), ['Opening of the Moot', 'Election Night', 'Same Bell']);
  const term = 120 * DAY;
  const inside = 90 * DAY;
  assert.equal(atOf(inside, 'Election Night'), term);
  assert.equal(atOf(inside, 'Opening of the Moot'), term);
  assert.equal(atOf(inside, 'Honors List Day'), term);
  assert.equal(atOf(inside, 'Aurora Night'), term);
  assert.deepEqual(worldNextFestival(inside, { [O]: 'true', [H]: 'true', [A]: 'true', [E]: 'true' }), {
    at: term / 1000,
    festivals: [
      { nationId: 'hoarvale', name: 'Opening of the Moot' },
      { nationId: 'hoarvale', name: 'Honors List Day' },
      { nationId: 'hoarvale', name: 'Aurora Night' },
      { nationId: 'hoarvale', name: 'Election Night' },
    ],
  });
  const prior = worldFestivalSources.filter(s => s.flag !== E);
  assert.equal(JSON.stringify(worldNextFestival(inside, { [O]: 'true', [H]: 'true', [A]: 'true', [E]: 'false' })), JSON.stringify(worldNextFestival(inside, { [O]: 'true', [H]: 'true', [A]: 'true' }, prior)));
});
