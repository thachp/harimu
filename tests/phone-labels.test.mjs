import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { placeLabels } from '../lib/game-viewport.ts';

const area = { w: 390, h: 400 };
const overlap = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs((a.y - a.h / 2) - (b.y - b.h / 2)) < (a.h + b.h) / 2;

test('labels that already fit and do not touch are returned unchanged (desktop scenes do not move)', () => {
  const boxes = [{ x: 100, y: 100, w: 90, h: 44 }, { x: 300, y: 250, w: 120, h: 44 }];
  assert.deepEqual(placeLabels(boxes, { w: 1280, h: 700 }), boxes);
});

test('a label at the edge is pulled inside the canvas (Kindle "Your household" was cut off at the left edge)', () => {
  const [left, right, top] = placeLabels([{ x: 10, y: 200, w: 140, h: 44 }, { x: 385, y: 200, w: 140, h: 44 }, { x: 200, y: 10, w: 100, h: 44 }], area);
  assert.ok(left.x - left.w / 2 >= 0 && right.x + right.w / 2 <= area.w);
  assert.ok(top.y - top.h >= 0, 'a label near the top is not pushed above the canvas');
});

test('overlapping labels are separated, in order, so a label is not hidden behind the others (Korund "Stonehearth square")', () => {
  const boxes = [{ x: 195, y: 200, w: 180, h: 44 }, { x: 190, y: 205, w: 180, h: 44 }, { x: 200, y: 210, w: 180, h: 44 }];
  const placed = placeLabels(boxes, area);
  assert.deepEqual(placed[0], boxes[0], 'the first label keeps its place');
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert.ok(!overlap(placed[i], placed[j]), `${i} and ${j} overlap`);
  for (const p of placed) assert.ok(p.y - p.h >= 0 && p.y <= area.h && p.x - p.w / 2 >= 0 && p.x + p.w / 2 <= area.w);
});

test('a label wider than the canvas is centred and the result is deterministic', () => {
  const boxes = [{ x: 30, y: 100, w: 500, h: 44 }];
  assert.equal(placeLabels(boxes, area)[0].x, area.w / 2);
  assert.deepEqual(placeLabels(boxes, area), placeLabels(boxes, area));
});

test('the viewport applies placement in the city scene only, and the phone cards wrap in a grid instead of scrolling sideways', () => {
  const viewport = readFileSync(new URL('../app/game-viewport.tsx', import.meta.url), 'utf8');
  assert.match(viewport, /if \(mode === 'city'\) \{[\s\S]{0,400}placeLabels\(/);
  const css = readFileSync(new URL('../app/game-shell.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const phone = css.split(/@media\(max-width:760px\)\{/).slice(1).find(block => block.startsWith('.game-context-items{display:grid'));
  assert.ok(phone, 'a phone block makes the destination cards a grid');
  assert.match(phone, /\.game-context-items\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(min\(100%,/);
  assert.match(phone, /overflow:visible/);
  assert.match(phone, /\.game-context-items>button\{[^}]*min-height:44px/);
  assert.match(css, /\.game-context-items\{display:flex;flex:1;min-width:0;overflow:auto/, 'the desktop row still scrolls');
});
