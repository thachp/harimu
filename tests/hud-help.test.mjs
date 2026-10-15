/** #366: the top-bar tooltip state machine. One tooltip at a time; hover/keyboard focus open it, leave/blur/Escape close it; mouse focus never pins it. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reduceHelp, helpClosed, helpIdOf } from '../lib/hud-help.ts';

const run = (...events) => events.reduce(reduceHelp, helpClosed);
const open = s => s.id;

test('hover opens its own item and moving to another item replaces it: never two open', () => {
  let s = run({ type: 'pointer', id: 'wc' }); assert.equal(open(s), 'wc');
  s = reduceHelp(s, { type: 'pointer', id: 'food' }); assert.equal(open(s), 'food');
  s = reduceHelp(s, { type: 'pointer', id: 'mat' }); assert.equal(open(s), 'mat');
  s = reduceHelp(s, { type: 'pointer', id: null }); assert.equal(open(s), null, 'leaving closes it');
});

test('keyboard focus opens, the next focus replaces it, blur and Escape close it', () => {
  let s = run({ type: 'focus', id: 'wc', visible: true }); assert.deepEqual(s, { id: 'wc', via: 'focus' });
  s = reduceHelp(s, { type: 'blur', id: 'wc' }); s = reduceHelp(s, { type: 'focus', id: 'food', visible: true }); assert.equal(open(s), 'food');
  s = reduceHelp(s, { type: 'escape' }); assert.equal(open(s), null);
  s = run({ type: 'focus', id: 'wc', visible: true }, { type: 'blur', id: 'wc' }); assert.equal(open(s), null);
  s = run({ type: 'focus', id: 'wc', visible: true }, { type: 'blur', id: 'other' }); assert.equal(open(s), 'wc', 'another item blurring does not close it');
});

test('mouse focus (not :focus-visible) never opens or pins a tooltip', () => {
  assert.equal(open(run({ type: 'focus', id: 'wc', visible: false })), null);
  // Hover then click (focuses the summary), then the mouse leaves: closed, even though focus remains.
  let s = run({ type: 'pointer', id: 'wc' }, { type: 'focus', id: 'wc', visible: false }, { type: 'click', id: 'wc' }); assert.equal(open(s), 'wc');
  s = reduceHelp(s, { type: 'pointer', id: null }); assert.equal(open(s), null, 'leftover focus and click state do not pin it');
  // A keyboard-opened tooltip is not closed by the mouse wandering over empty space, but another item takes over.
  s = run({ type: 'focus', id: 'wc', visible: true }, { type: 'pointer', id: null }); assert.equal(open(s), 'wc');
  s = reduceHelp(s, { type: 'pointer', id: 'food' }); assert.equal(open(s), 'food');
});

test('tap: click opens, the same item again closes, a press elsewhere or blur closes; hover does not close a tapped item', () => {
  let s = run({ type: 'click', id: 'wc' }); assert.deepEqual(s, { id: 'wc', via: 'click' });
  assert.equal(open(reduceHelp(s, { type: 'pointer', id: 'wc' })), 'wc', 'hovering the tapped item keeps it open');
  assert.equal(open(reduceHelp(s, { type: 'click', id: 'wc' })), null);
  assert.equal(open(reduceHelp(s, { type: 'outside' })), null);
  assert.equal(open(reduceHelp(s, { type: 'blur', id: 'wc' })), null);
  assert.equal(open(reduceHelp(s, { type: 'click', id: 'food' })), 'food', 'another tap replaces it');
  assert.equal(open(reduceHelp(run({ type: 'pointer', id: 'wc' }), { type: 'outside' })), 'wc', 'hover is owned by the pointer');
});

test('Escape closes any tooltip, and it stays closed until the next event opens it', () => {
  for (const s of [run({ type: 'pointer', id: 'a' }), run({ type: 'focus', id: 'a', visible: true }), run({ type: 'click', id: 'a' })]) assert.equal(open(reduceHelp(s, { type: 'escape' })), null);
});

test('ids come from the label', () => assert.equal(helpIdOf('Work capacity'), 'hud-help-work-capacity'));
