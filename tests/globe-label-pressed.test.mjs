import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

// #618: the globe labels are rebuilt whenever the scene effect's dependencies change (the visitor flag from #558 flips after load, the market flag
// arrives later), and a rebuilt label has no aria-pressed. The selected nation must be re-applied after every rebuild.
const source = await readFile(new URL('../app/game-viewport.tsx', import.meta.url), 'utf8');
const deps = text => text.split(',').map(d => d.trim()).filter(Boolean);
const sceneDeps = deps(source.match(/labelLayer\.remove\(\); canvas\.remove\(\);\s*\};\s*\}, \[([^\]]+)\]\);/)?.[1] ?? '');
const focusDeps = deps(source.match(/controls\.current\?\.focusNation\(selectedNationId\); \}, \[([^\]]+)\]\);/)?.[1] ?? '');

test('#618: the scene effect and the selected-nation effect are both found', () => {
  assert.ok(sceneDeps.length >= 7, `scene effect deps: ${sceneDeps.join(', ')}`);
  assert.ok(focusDeps.length >= 7, `focus effect deps: ${focusDeps.join(', ')}`);
});

test('#618: every dependency that rebuilds the scene re-applies the selected nation (visitor and marketOpen were missing)', () => {
  for (const dep of sceneDeps) assert.ok(focusDeps.includes(dep), `"${dep}" rebuilds the labels but does not re-apply aria-pressed`);
  for (const dep of ['visitor', 'marketOpen', 'cityName', 'nationSignature']) assert.ok(focusDeps.includes(dep), dep);
});

test('#618: focusNation still sets aria-pressed on exactly the selected nation label and no other', () => {
  assert.match(source, /const active = selection\.kind === 'nation' && selection\.nationId === id;\s*button\.setAttribute\('aria-pressed', String\(active\)\);/);
  assert.match(source, /if \(selectedNationId && mode === 'world'\) controls\.current\?\.focusNation\(selectedNationId\)/);
});
