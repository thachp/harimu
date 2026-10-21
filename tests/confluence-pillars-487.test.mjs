/** #487: read-only Four Pillars for Confluence citizens, from lib/leader-drafts.ts. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { draftLeaderPersonas } from '../lib/leader-drafts.ts';
import { leaderPersonas } from '../lib/leader-personas.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('the four offices come from the drafts in docs order; the live leader personas are unchanged', () => {
  assert.deepEqual(draftLeaderPersonas.confluence.map(p => p.office), ['General Secretary', 'President', 'Premier', "Chair of the People's Assembly"]);
  assert.equal(Object.hasOwn(leaderPersonas, 'confluence'), false, 'Confluence is not moved into leaderPersonas (weekly addresses, leader panel stay off)');
});

test('component: read-only (no buttons, handlers or ballots), AI badge on each office, data from leader-drafts', async () => {
  const ui = await read('app/confluence-pillars.tsx');
  assert.match(ui, /from '@\/lib\/leader-drafts'/);
  assert.match(ui, /draftLeaderPersonas\.confluence/);
  assert.match(ui, /<AiBadge \/>/);
  assert.doesNotMatch(ui.replace(/\/\*[\s\S]*?\*\//g, ''), /onClick|<button|ActionButton|fetch\(|ballot|vote/i);
});

test('page: rendered only in a Confluence citizen\'s government view', async () => {
  const page = await read('app/page.tsx');
  assert.equal([...page.matchAll(/<ConfluencePillars \/>/g)].length, 1);
  assert.match(page, /citizenNation\.id === 'confluence' && <ConfluencePillars \/>/);
});
