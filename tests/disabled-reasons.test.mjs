import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { disabledReasonProps } from '../lib/action-reasons.ts';

test('blocked actions stay focusable and expose their reason on hover and to assistive tech', () => {
  const p = disabledReasonProps('You do not have enough SPK for this quantity.', 'r1');
  assert.deepEqual(p, { 'aria-disabled': true, 'aria-describedby': 'r1', title: 'You do not have enough SPK for this quantity.', 'data-reason': 'blocked' });
  assert.equal('disabled' in p, false, 'never native disabled: that would drop the control from the tab order');
  assert.deepEqual(disabledReasonProps(null, 'r1'), { 'aria-disabled': false, 'aria-describedby': undefined, title: undefined, 'data-reason': undefined });
});

const src = f => readFile(new URL(`../app/${f}`, import.meta.url), 'utf8');
test('chosen Kindle daily-loop controls use the shared helper, guard clicks and show specific reasons', async () => {
  const work = await src('work-shift-board.tsx');
  assert.match(work, /disabledReasonProps\(claimReason, "work-claim-reason"\)[^>]*onClick=\{\(\) => \{ if \(!claimReason\) onClaim/);
  const market = await src('citizen-market.tsx');
  for (const r of ['buyReason', 'sellReason', 'mealReason']) assert.match(market, new RegExp(`disabledReasonProps\\(${r},[^)]*\\)[^]{0,200}?if \\(!${r}\\)`));
  for (const reason of ['You do not have enough SPK for this quantity.', 'The merchant does not have enough stock.', 'You do not own enough goods for this quantity.', 'Capacity is full. Save your food for later.']) assert.ok(market.includes(reason), reason);
  const gov = await src('government-panel.tsx');
  assert.match(gov, /disabledReasonProps\(petitionReason, "petition-action-reason"\)[^>]*onClick=\{\(\) => \{ if \(!petitionReason\) onPetition/);
  assert.match(gov, /Checking phone verification before petitions can count\./);
  for (const s of [market, gov]) assert.doesNotMatch(s, /'Unavailable'|"Unavailable"/);
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  assert.match(css, /button\[aria-disabled="true"\] \{[^}]*cursor: not-allowed/);
});
