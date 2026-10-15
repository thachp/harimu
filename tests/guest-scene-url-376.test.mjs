/** #376: Work and Market links keep the previewed nation for guests and signed-out visitors, never while the session loads or for citizens. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
test('changeView passes visitor only for a signed-out or local visitor, not while Clerk loads or for a citizen', () => {
  assert.match(page, /const visitor = !citizenNation && \(!clerkConfigured \|\| citizenSessionStatus === 'anonymous'\);/);
  assert.match(page, /nextNation !== citizenNation\?\.id, visitor\);/);
});
