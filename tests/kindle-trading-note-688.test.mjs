/** #688 follow-up: the "Trading is currently supported in Kindle" note is hidden for Confluence citizens (real render), unchanged for others. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadApp } from './helpers/component-module.mjs';

const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
const { KindleTradingNote } = await loadApp('kindle-trading-note');
const render = props => renderToStaticMarkup(React.createElement(KindleTradingNote, props));
const note = 'Trading is currently supported in Kindle. Other nation markets are planned.';

test('Confluence citizen: no Kindle trading note, whether or not the market is available', () => {
  assert.equal(render({ nationId: 'confluence', available: false }), '');
  assert.equal(render({ nationId: 'confluence', available: undefined }), '');
  assert.equal(render({ nationId: 'confluence', available: true }), '');
});

test('other nations: the note shows exactly as before (only while the market is unavailable)', () => {
  for (const nationId of ['kindle', 'meridian']) {
    assert.equal(render({ nationId, available: false }), `<p>${note}</p>`, nationId);
    assert.equal(render({ nationId, available: undefined }), `<p>${note}</p>`, nationId);
    assert.equal(render({ nationId, available: true }), '', nationId);
  }
});

test('page.tsx renders the note only through the component', () => {
  const page = readFileSync('app/page.tsx', 'utf8');
  assert.ok(!page.includes(note));
  assert.match(page, /<KindleTradingNote nationId=\{citizenNation\.id\} available=\{market\?\.available\} \/>/);
});
