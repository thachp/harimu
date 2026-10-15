/** #633: scripts/development-config.mjs strips full-line // comments only, so a trailing // comment in wrangler.jsonc breaks readDevelopmentConfig() and with it `npm run build` and the deploy. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { readDevelopmentConfig } from '../scripts/development-config.mjs';

test('readDevelopmentConfig() parses the real wrangler.jsonc', () => {
  const config = readDevelopmentConfig();
  assert.equal(config.name, 'harimu-preview');
  assert.equal(config.vars.HARIMU_DIPLOMATIC_HALL_ENABLED, 'false');
});

test('wrangler.jsonc has only full-line // comments: no line carries a trailing comment or a block comment', () => {
  const offenders = readFileSync('wrangler.jsonc', 'utf8').split('\n').map((line, index) => ({ line, number: index + 1 }))
    .filter(({ line }) => !/^\s*\/\//.test(line))
    .filter(({ line }) => /\/\/|\/\*|\*\//.test(line.replace(/"(?:[^"\\]|\\.)*"/g, '""'))) // text inside a quoted string (a URL) is fine
    .map(({ line, number }) => `${number}: ${line.trim().slice(0, 80)}`);
  assert.deepEqual(offenders, [], 'move each comment to its own full line');
});
