import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { cityDestinations } from '../lib/city-destinations.ts';

const labels = cards => cards.map(card => card.label);
const words = cards => cards.map(card => `${card.label} ${card.detail}`).join(' | ');

test('#378: Korund destination cards use Korund wording: Assignment and State store, no Market or Workplace', () => {
  const cards = cityDestinations('korund', true);
  assert.deepEqual(labels(cards), ['Household', 'Assignment', 'State store', 'Government']);
  assert.deepEqual(cards.map(card => card.id), ['household', 'workplace', 'market', 'government'], 'the card ids (and so the scenes they open) are unchanged');
  assert.doesNotMatch(words(cards), /Market|Workplace|citizen listings/);
  assert.match(words(cards), /Ration coupons and state food/);
});

test('#378: the card labels match the dock tabs and the 3D buildings Korund already uses', async () => {
  const shell = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /resourceNation\.id === 'korund' && id === 'market' \? 'State store'/);
  assert.match(shell, /resourceNation\.id === 'korund' && id === 'workplace' \? 'Assignment'/);
  const cards = cityDestinations('korund', true);
  assert.equal(cards[1].label, 'Assignment'); assert.equal(cards[2].label, 'State store');
});

test('#378: Kindle and Aurelle (and a nation not yet known) keep the existing card wording', () => {
  for (const nation of ['kindle', 'aurelle', null, undefined]) {
    const cards = cityDestinations(nation, true);
    assert.deepEqual(labels(cards), ['Household', 'Workplace', 'Market', 'Government'], String(nation));
    assert.deepEqual(cards.map(card => card.detail), ['Belongings and recovery', 'Contributions and earnings', 'Goods and citizen listings', 'Policy and petitions']);
  }
});

test('#378 / #344: the Market card is hidden while the market is off, and every other card stays', () => {
  const cards = cityDestinations('kindle', false);
  assert.deepEqual(labels(cards), ['Household', 'Workplace', 'Government']);
  assert.doesNotMatch(words(cards), /Market/);
  assert.deepEqual(labels(cityDestinations('korund', false)), ['Household', 'Assignment', 'Government'], 'the caller decides showMarket; this never invents a Market card');
});

test('#378: the page builds the cards for the nation on screen (a visitor previewing Korund too) and keeps the #344 rule', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /viewMode === 'square' \? cityDestinations\(\(citizenNation \?\? selected\)\.id, marketVisible\(\(citizenNation \?\? selected\)\.id, marketShown\)\)\.map\(card => \(\{ \.\.\.card, onSelect: \(\) => changeView\(card\.id\) \}\)\)/);
  const { marketVisible } = await import('../lib/market-visibility.ts');
  assert.equal(marketVisible('korund', false), true, 'a visitor previewing Korund with the flag off still sees the State store card, as the dock does');
  assert.equal(marketVisible('kindle', false), false);
  assert.doesNotMatch(page, /label: citizenNation\?\.id === 'korund' \? 'State store' : 'Market'/, 'the old citizen-only wording is gone');
});

test('#378: country map pins grow with the text size, size to their text and stay inside the map (Forgehaven was wider than its 100px pin at 390 wide and 150% text)', async () => {
  const css = (await readFile(new URL('../app/country-scene.module.css', import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.pin \{ --pin-max: 145px;[^}]*width: max-content; max-width: var\(--pin-max\);/);
  assert.match(css, /@media \(max-width: 440px\) \{[^\n]*\.pin \{ --pin-max: calc\(100px \* var\(--text-scale, 1\)\);/, 'the phone pin cap scales with the text size');
  assert.doesNotMatch(css, /max-width: 100px/, 'no fixed 100px pin cap');
  const scene = await readFile(new URL('../app/country-scene.tsx', import.meta.url), 'utf8');
  assert.match(scene, /left:`clamp\(calc\(var\(--pin-max\) \/ 2\), \$\{pins\[index\]\.x\}%, calc\(100% - var\(--pin-max\) \/ 2\)\)`/, 'the pin centre keeps half a pin from the map edges');
});
