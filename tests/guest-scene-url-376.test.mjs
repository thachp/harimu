/** #376 (widened by #543): Work and Market links keep the previewed nation for guests, signed-out visitors and signed-in users with no citizen yet; never while the session loads or for citizens. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
test('changeView passes visitor from isVisitorSession(citizen, clerkConfigured, status)', () => {
  assert.match(page, /const visitor = isVisitorSession\(Boolean\(citizenNation\), clerkConfigured, citizenSessionStatus\);/);
  assert.match(page, /nextNation !== citizenNation\?\.id, visitor\);/);
});
