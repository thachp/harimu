import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertDevelopmentConfig, developmentTarget, readDevelopmentConfig } from '../scripts/development-config.mjs';
const fixture = () => ({ name: 'harimu-preview', account_id: developmentTarget.accountId,
  d1_databases: [{ binding: 'DB', database_name: 'harimu-preview', database_id: developmentTarget.databaseId }],
  vars: { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true' } });
test('default deploy accepts isolated preview and refuses production resources or routes', () => {
  assert.doesNotThrow(() => assertDevelopmentConfig(fixture()));
  for (const pattern of ['harimu.com', 'www.harimu.com', 'docs.harimu.com', '*.harimu.com', 'preview.harimu.com/*']) {
    const config = fixture(); config.routes = [{ pattern, custom_domain: true }];
    assert.throws(() => assertDevelopmentConfig(config));
  }
  for (const field of ['name', 'account_id']) {
    const config = fixture(); config[field] = 'production'; assert.throws(() => assertDevelopmentConfig(config));
  }
  for (const field of ['binding', 'database_name', 'database_id']) {
    const config = fixture(); config.d1_databases[0][field] = 'production'; assert.throws(() => assertDevelopmentConfig(config));
  }
  const hidden = fixture(); hidden.vars = {}; assert.throws(() => assertDevelopmentConfig(hidden));
});

// #633: readDevelopmentConfig() strips full-line // comments only, so a trailing comment after a value broke build and deploy.
test('the real wrangler.jsonc parses through readDevelopmentConfig()', () => {
  const config = readDevelopmentConfig();
  assert.equal(config.name, 'harimu-preview');
  assert.equal(config.vars.HARIMU_DIPLOMATIC_HALL_ENABLED, 'false');
});
test('wrangler.jsonc has no trailing // comment after a value', () => {
  const offenders = [];
  readFileSync('wrangler.jsonc', 'utf8').split('\n').forEach((line, index) => {
    if (/^\s*\/\//.test(line)) return;
    let inString = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (inString) { if (char === '\\') i += 1; else if (char === '"') inString = false; continue; }
      if (char === '"') inString = true;
      else if (char === '/' && line[i + 1] === '/') { offenders.push(index + 1); break; }
    }
  });
  assert.deepEqual(offenders, [], `Move trailing // comments onto their own full line (wrangler.jsonc lines ${offenders.join(', ')}).`);
});
