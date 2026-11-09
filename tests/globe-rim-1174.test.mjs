/** #1174: world-globe rim light (HARIMU_UI_PACK) and the City camera bar sitting fully above the bottom edge. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { globeLight, globeRimEnabled, GLOBE_RIM_FLAG } from '../lib/globe-rim.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = GLOBE_RIM_FLAG;

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(globeRimEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(globeRimEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 33);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 33/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/globe-rim.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_GLOBE_RIM/);
});

test('flag off keeps the overhead sun; flag on is a dim rim behind the facing side', () => {
  const off = globeLight(false, 3.2), phone = globeLight(false, 1.5), on = globeLight(true, 3.2);
  assert.deepEqual(off.sunPosition, [-15, 24, 12]);
  assert.equal(off.sunIntensity, 3.2);
  assert.equal(off.hemisphere, 2.2);
  assert.equal(off.sky, '#fff3d6');
  assert.equal(off.roughness, 0.84);
  assert.equal(phone.sunIntensity, 1.5, 'phone top-down still uses its own sun when the flag is off');
  assert.ok(on.sunPosition[2] < 0, 'the rim sits behind the camera-facing side');
  assert.ok(on.sunPosition[1] > 0 && on.sunPosition[1] < off.sunPosition[1], 'the rim is above the limb, not overhead');
  assert.ok(on.sunIntensity < 0.8 && on.sunIntensity < off.sunIntensity);
  assert.equal(on.roughness, 1, 'a matte surface drops the wide specular lobe');
  assert.ok(on.hemisphere < off.hemisphere);
  assert.notEqual(on.sky, off.sky, 'the fill is no longer the cream sky that washes the upper half');
  assert.equal(globeLight(true, 1.5).sunIntensity, on.sunIntensity, 'the rim does not follow the 3.2 sun');
});

test('the viewport applies the rim only on the world view, and the city camera bar clears the dock and the safe area', async () => {
  const viewport = await read('app/game-viewport.tsx'), css = await read('app/game-shell.css');
  assert.match(viewport, /const rim = mode === 'world' && globeRimEnabled\(\)/);
  assert.match(viewport, /sun\.intensity = rim \? globeLight\(true, effects\.sun\)\.sunIntensity : effects\.sun/);
  assert.match(viewport, /roughness = lit\.roughness/);
  assert.doesNotMatch(viewport, /UnrealBloom|BloomPass|Sprite/);
  assert.match(css, /\.viewport-controls,\.has-inspector \.viewport-controls\{position:absolute;z-index:2;bottom:15px/, 'world and the flag-off city keep the 15px overlay');
  assert.match(css, /@media\(min-width:761px\)\{\s*\.game-city-v2 \.viewport-controls\{bottom:calc\(15px \+ env\(safe-area-inset-bottom, 0px\)\)\}/);
  assert.match(css, /\.game-city-v2:has\(\.citizen-dock\) \.viewport-controls\{bottom:calc\(15px \+ 44px \+ env\(safe-area-inset-bottom, 0px\)\)\}/);
  assert.match(css, /@media\(max-width:760px\)\{\.game-city-v2 \.game-stage \.viewport-controls\{flex-shrink:0;padding-bottom:calc\(4px \+ env\(safe-area-inset-bottom, 0px\)\)\}/);
  const phone = css.slice(css.indexOf('/* #528 phones'));
  assert.match(phone, /\.game-stage \.viewport-controls,\.has-inspector \.game-stage \.viewport-controls\{position:static/);
});
