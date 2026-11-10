/** #392 UI 43: Nation overview fact rows. .nation-overview-rows must be one column.
 *  The inspector dl is two columns, and overflow-wrap:anywhere was breaking Government and Faith letter by letter.
 *  Values on these rows wrap on words. No new pack flag. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('.nation-overview-rows is a single column and its values do not use overflow-wrap:anywhere', async () => {
  const css = await read('app/nation-overview.css');
  const rowsRule = css.match(/\.game-inspector-body \.nation-overview-rows\{[^}]*\}/)?.[0];
  assert.ok(rowsRule, '.nation-overview-rows rule');
  assert.match(rowsRule, /grid-template-columns:\s*(?:1fr|minmax\(0,\s*1fr\))/);
  assert.doesNotMatch(rowsRule, /minmax\(90px,\.8fr\)/);
  const pair = css.match(/\.nation-overview-rows>div\{[^}]*\}/)?.[0];
  assert.ok(pair, 'label/value pair rule');
  assert.match(pair, /grid-template-columns:\s*minmax\(96px,\s*110px\)\s+minmax\(0,\s*1fr\)/);
  const values = css.match(/\.nation-overview-rows dd\{[^}]*\}/g) ?? [];
  assert.equal(values.length, 1);
  assert.match(values[0], /overflow-wrap:\s*(?:break-word|normal)/);
  assert.doesNotMatch(values[0], /overflow-wrap:\s*anywhere/);
  const rowsBlock = css.slice(css.indexOf('/* #392 UI 43'));
  assert.doesNotMatch(rowsBlock, /overflow-wrap:\s*anywhere/);
  assert.match(css, /\.game-inspector-body \.nation-overview dd\{[^}]*overflow-wrap:anywhere/, 'the shared dd rule stays for the stat trio');
  assert.match(css, /\.nation-overview-actions\{display:flex/);
});
