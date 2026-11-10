/** #392: selected nation on the world globe gets a soft gold coast ring. NEXT_PUBLIC_HARIMU_SELECTED_NATION_GLOW is a HARIMU_UI_PACK key.
 *  Preview on, production off. Flag off keeps the marker box highlight and the rim light. The ring does not animate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { squareLatLon } from '../lib/globe-mapping.ts';
import { crestEdge } from '../lib/nation-crests.ts';
import { glowShowsHalo, nationGlowPoint, nationGlowPose, selectedNationGlowEnabled, GLOW_EDGE, GLOW_GOLD, GLOW_HALO, NATION_COAST_DOT, SELECTED_NATION_GLOW_FLAG } from '../lib/selected-nation-glow.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = SELECTED_NATION_GLOW_FLAG;
const hypot = (p) => Math.hypot(p[0], p[1], p[2]);
const angle = (a, b) => {
  const v = ({ latitude, longitude }) => { const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180; return [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)]; };
  const A = v(a), B = v(b), dot = A[0] * B[0] + A[1] * B[1] + A[2] * B[2];
  return Math.acos(Math.min(1, Math.max(-1, dot)));
};

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(selectedNationGlowEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(selectedNationGlowEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 46);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 46/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/selected-nation-glow.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_SELECTED_NATION_GLOW/);
});

test('the ring uses existing gold tokens, sits on the land coast, and leaves the next capital outside it', async () => {
  assert.equal(GLOW_GOLD, '#d3aa5b');
  assert.equal(GLOW_HALO, '#f1d58a');
  assert.equal(GLOW_EDGE, crestEdge);
  assert.match(await read('app/globals.css'), /--gold: #d3aa5b/);
  assert.match(await read('app/world-atlas.css'), /#f1d58a/);
  assert.match(await read('lib/game-art.ts'), /proximity - \.91/);
  assert.equal(NATION_COAST_DOT, 0.91);
  const pose = nationGlowPose({ x: 1, y: 2, z: 2 });
  assert.ok(pose);
  assert.equal(nationGlowPose({ x: 0, y: 0, z: 0 }), null);
  for (const turn of [0, 0.7, 2.2, 4.1]) {
    const point = nationGlowPoint(pose, turn);
    assert.ok(Math.abs(hypot(point) - pose.lift) < 1e-6, 'the ring sits on one sphere');
    const along = (point[0] * pose.axis[0] + point[1] * pose.axis[1] + point[2] * pose.axis[2]) / hypot(point);
    assert.ok(Math.abs(along - NATION_COAST_DOT) < 1e-6, 'every ring point is on the land coast');
  }
  const theta = Math.acos(NATION_COAST_DOT);
  const squares = [{ x: 19, y: 11 }, { x: 26, y: 10 }, { x: 5, y: 4 }, { x: 4, y: 13 }, { x: 18, y: 4 }, { x: 25, y: 3 }, { x: 12, y: 14 }];
  let nearest = Math.PI;
  for (let i = 0; i < squares.length; i++) for (let j = i + 1; j < squares.length; j++) nearest = Math.min(nearest, angle(squareLatLon(squares[i]), squareLatLon(squares[j])));
  assert.ok(nearest > theta, 'the coast ring does not reach the next capital, so the other nations stay readable');
});

test('flag off keeps the box highlight and the rim light; the ring does not animate; reduced motion drops only the halo', async () => {
  const viewport = await read('app/game-viewport.tsx'), css = await read('app/game-shell.css');
  assert.match(viewport, /const rim = mode === 'world' && globeRimEnabled\(\)/);
  assert.match(viewport, /sun\.intensity = rim \? globeLight\(true, effects\.sun\)\.sunIntensity : effects\.sun/);
  assert.match(viewport, /const glow = mode === 'world' && selectedNationGlowEnabled\(\)/);
  assert.match(viewport, /else \{ button\.classList\.remove\('viewport-nation-selected'\); button\.style\.outline = active \? '2px solid #f7d080' : ''; \}/);
  assert.match(viewport, /else \{ highlight\.setFromObject\(anchor\.object\); highlight\.visible = true; \}/);
  assert.match(viewport, /button\.setAttribute\('aria-pressed', String\(active\)\)/);
  assert.match(viewport, /button\.type = 'button'/);
  assert.match(viewport, /Use the location buttons to select with a keyboard/);
  assert.match(viewport, /glowShowsHalo\(motionReduced\(\)\)/);
  assert.match(viewport, /prefers-reduced-motion: reduce/);
  assert.match(viewport, /data-harimu-reduced-motion/);
  assert.doesNotMatch(viewport, /UnrealBloom|BloomPass|Sprite/);
  assert.doesNotMatch(await read('lib/selected-nation-glow.ts'), /requestAnimationFrame|setInterval|keyframes/);
  assert.equal(glowShowsHalo(true), false);
  assert.equal(glowShowsHalo(false), true);
  const start = css.indexOf('/* #392 selected nation');
  const block = css.slice(start, css.indexOf('@media(max-width:760px){.viewport-world-label{min-height:44px}}', start));
  assert.match(block, /\.viewport-world-label\.viewport-nation-selected\{border:3px double #d3aa5b/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\)\{\.viewport-world-label\.viewport-nation-selected\{box-shadow:0 0 0 1px #071217,0 0 0 2px #d0ad54\}/);
  assert.doesNotMatch(block, /@keyframes/);
  assert.match(css, /\.viewport-world-label:focus-visible\{outline:2px solid #80d8ce/);
});
