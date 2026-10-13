import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertDevelopmentConfig, developmentTarget } from '../scripts/development-config.mjs';
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
