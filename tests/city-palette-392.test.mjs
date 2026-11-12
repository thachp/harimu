/** #392: per-nation city ground and lights. Flag off keeps today's globals. Flag on uses each capital's tokens. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { capitalProfiles, citySceneGlobals, createCityWorld } from '../lib/game-art.ts';
import { cityLight, cityPaletteEnabled, CITY_PALETTE_FLAG } from '../lib/city-palette.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const ids = ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara'];
const key = CITY_PALETTE_FLAG;
const lin = c => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const parse = hex => { const n = typeof hex === 'string' ? Number.parseInt(hex.slice(1), 16) : hex; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rel = rgb => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const composite = (fg, bg, a) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
const contrast = (a, b) => { const [x, y] = [rel(a), rel(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const over = (hex, fg, bg, a) => contrast(fg, composite(bg, parse(hex), a));
const label = { fg: parse('#d6eceb'), bg: parse('#0b2735'), a: 0xec / 255 };
const pill = { fg: parse('#f3ecd6'), bg: parse('#0b2631'), a: 0xf2 / 255 };
const hue = hex => {
  const [r, g, b] = parse(hex).map(v => v / 255), max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min, h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const legacy = (x, z, riverX) => {
  const edge = Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5)), river = x >= riverX - 1 && x <= riverX;
  const road = Math.abs(x + 0.5) < 1 || Math.abs(z + 0.5) < 1, plaza = Math.abs(x + 0.5) < 2 && Math.abs(z + 0.5) < 2, water = edge > 10.5 || river;
  return water ? ((x + z) % 2 ? 0x527f85 : 0x58888d) : plaza ? 0xa3997e : road ? 0xb5a17a : ((x * 7 + z * 11) % 3 ? 0x75845b : 0x839165);
};
const tiles = world => world.group.children.filter(child => child.userData.kind === 'tile').map(mesh => mesh.material.color.getHex());
const buildings = world => { const out = []; world.group.traverse(obj => { if (obj.isMesh && obj.userData.kind === 'building') out.push(obj.material.color.getHex()); }); return out; };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(cityPaletteEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(cityPaletteEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 70);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(34), key, 'entry 35');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 70/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/city-palette.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_CITY_PALETTE/);
});

test('each capital has a full token set, and flag off returns the current globals', () => {
  assert.deepEqual(citySceneGlobals, { ground: 0x75845b, groundAlt: 0x839165, road: 0xb5a17a, plaza: 0xa3997e, water: 0x527f85, waterAlt: 0x58888d, sky: '#fff3d6', hemisphereGround: '#334b4d', hemisphere: 2.2, sun: '#ffe2ac' });
  const off = cityLight(false, 'aurelle', 3.2), phone = cityLight(false, 'varkand', 1.5);
  assert.deepEqual(off, { hemisphere: 2.2, sky: '#fff3d6', ground: '#334b4d', sunColor: '#ffe2ac', sunIntensity: 3.2 });
  assert.equal(phone.sunIntensity, 1.5);
  assert.equal(phone.sunColor, '#ffe2ac');
  const grounds = new Set(), suns = new Set();
  for (const id of ids) {
    const scene = capitalProfiles[id].scene;
    for (const token of ['ground', 'road', 'water', 'sky', 'hemisphereGround', 'sun', 'sunIntensity']) assert.ok(scene[token] !== undefined && scene[token] !== '', `${id} ${token}`);
    assert.match(scene.sky, /^#[0-9a-f]{6}$/); assert.match(scene.hemisphereGround, /^#[0-9a-f]{6}$/); assert.match(scene.sun, /^#[0-9a-f]{6}$/);
    assert.ok(scene.sunIntensity > 0.8 && scene.sunIntensity <= 1, id);
    assert.ok(over(scene.ground, label.fg, label.bg, label.a) >= over(0x839165, label.fg, label.bg, label.a) - 0.02, `${id} label/ground`);
    assert.ok(over(scene.ground, pill.fg, pill.bg, pill.a) >= over(0x839165, pill.fg, pill.bg, pill.a) - 0.02, `${id} pill/ground`);
    assert.ok(over(scene.road, label.fg, label.bg, label.a) >= over(0xb5a17a, label.fg, label.bg, label.a) - 0.02, `${id} label/road`);
    assert.ok(over(scene.road, pill.fg, pill.bg, pill.a) >= over(0xb5a17a, pill.fg, pill.bg, pill.a) - 0.02, `${id} pill/road`);
    const lit = cityLight(true, id, 3.2);
    assert.equal(lit.hemisphere, 2.2, 'fill stays, so silhouettes stay');
    assert.equal(lit.sky, scene.sky); assert.equal(lit.ground, scene.hemisphereGround); assert.equal(lit.sunColor, scene.sun);
    assert.equal(lit.sunIntensity, 3.2 * scene.sunIntensity);
    assert.notEqual(lit.sky, off.sky); assert.notEqual(scene.ground, citySceneGlobals.ground);
    grounds.add(scene.ground); suns.add(scene.sun);
    const plain = createCityWorld(id), flagged = createCityWorld(id, undefined, { cityPalette: false }), painted = createCityWorld(id, undefined, { cityPalette: true });
    const expected = [];
    for (let x = -12; x < 12; x++) for (let z = -12; z < 12; z++) expected.push(legacy(x, z, capitalProfiles[id].riverX));
    assert.deepEqual(tiles(plain), expected, `${id} flag off`);
    assert.deepEqual(tiles(flagged), expected, `${id} explicit off`);
    assert.notDeepEqual(tiles(painted), expected, `${id} flag on changes the ground`);
    assert.deepEqual(buildings(plain), buildings(painted), `${id} buildings stay`);
    const land = painted.group.children.find(child => child.userData.x === 5 && child.userData.z === 5);
    assert.equal(land.material.color.getHex(), scene.ground, id);
  }
  assert.equal(grounds.size, 10); assert.equal(suns.size, 10);
  const aurelle = capitalProfiles.aurelle.scene, kindle = capitalProfiles.kindle.scene, varkand = capitalProfiles.varkand.scene;
  const chroma = hex => { const [r, g, b] = parse(hex); return Math.max(r, g, b) - Math.min(r, g, b); };
  assert.ok(hue(kindle.ground) < 40 && chroma(kindle.ground) > 40, `kindle ember ${kindle.ground.toString(16)}`);
  assert.ok(chroma(aurelle.ground) < 16, `aurelle stone stays neutral ${aurelle.ground.toString(16)}`);
  assert.ok(hue(aurelle.road) > 35 && hue(aurelle.road) < 55, `aurelle gilt hue ${hue(aurelle.road)}`);
  assert.ok(hue(varkand.sun) < 30 && rel(parse(varkand.ground)) < rel(parse(kindle.ground)), `varkand red-dark sun ${varkand.sun}`);
  assert.ok(varkand.sunIntensity < kindle.sunIntensity && varkand.sunIntensity < aurelle.sunIntensity);
});

test('capital grounds stay at least deltaE 6 apart, and the kept capitals do not move', () => {
  const toLinear = v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const lab = ([r, g, b]) => {
    const R = toLinear(r), G = toLinear(g), B = toLinear(b);
    const x = (.4124 * R + .3576 * G + .1805 * B) / .95047, y = .2126 * R + .7152 * G + .0722 * B, z = (.0193 * R + .1192 * G + .9505 * B) / 1.08883;
    const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
  const grounds = Object.fromEntries(ids.map(id => [id, parse(capitalProfiles[id].scene.ground)]));
  assert.equal(capitalProfiles.kindle.scene.ground, 0xb6714d);
  assert.equal(capitalProfiles.aurelle.scene.ground, 0x7f7e7e);
  assert.equal(capitalProfiles.varkand.scene.ground, 0x8b6969);
  const suns = { kindle: '#ffd794', confluence: '#fde2b2', meridian: '#ffdba3', korund: '#ffe097', aurelle: '#ffe296', ilmar: '#ffe29c', hoarvale: '#fae3b7', varkand: '#ffc69a', veldwood: '#ffe095', fulmara: '#e5e7d3' };
  for (const [id, sun] of Object.entries(suns)) assert.equal(capitalProfiles[id].scene.sun, sun, id);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const d = dE(grounds[ids[i]], grounds[ids[j]]);
    assert.ok(d >= 6, `${ids[i]}/${ids[j]} deltaE ${d.toFixed(2)}`);
  }
});

test('the viewport swaps city lights only, keeps shadows, and does not animate them', async () => {
  const viewport = await read('app/game-viewport.tsx');
  assert.match(viewport, /const paletteOn = mode === 'city' && cityPaletteEnabled\(\)/);
  assert.match(viewport, /createCityWorld\(nationId, cityName, \{ marketOpen, cityPalette: paletteOn \}\)/);
  assert.match(viewport, /createRegionWorld\(JSON\.parse\(nationSignature\)\)/);
  assert.match(viewport, /sun\.position\.set\(-15, 24, 12\); sun\.castShadow = opening\.shadows/);
  assert.match(viewport, /sun\.intensity = rim \? globeLight\(true, effects\.sun\)\.sunIntensity : effects\.sun/);
  assert.match(viewport, /if \(paletteOn\) sun\.intensity = cityLight\(true, nationId, effects\.sun\)\.sunIntensity/);
  assert.doesNotMatch(viewport, /paletteOn[\s\S]{0,500}lerp/);
  assert.doesNotMatch(viewport, /cityLight\([^)]*\)\.sunIntensity[\s\S]{0,80}lerp/);
});
