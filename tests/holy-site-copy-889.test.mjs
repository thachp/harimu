import test from 'node:test';
import assert from 'node:assert/strict';
import { holySiteCopy as C, holySites } from '../lib/holy-sites.ts';

test('#889 faith-panel copy: every site labeled, phone-width, neutral, no figures', () => {
  assert.equal(C.proposal, true);
  assert.deepEqual(Object.keys(C.pilgrimage).sort(), Object.keys(holySites).sort());
  for (const l of [...Object.values(C.pilgrimage), C.charity]) assert.ok(l.length <= 36, l);
  const lines = [C.heading, C.helper.pilgrimage, C.helper.charity, ...Object.values(C.outcome), C.failed];
  for (const l of lines) assert.ok(l.length <= 90, l);
  for (const t of [...lines, ...Object.values(C.pilgrimage), C.charity]) {
    assert.doesNotMatch(t, /\d|!|["“”]/, t);
    assert.doesNotMatch(t, /\b(Kinward|Quiet Path|Lumen|Open Hand|Round|true faith|heretic\w*|infidel\w*|blessed|sin\w*|Crown|Chairman|placeholder|TODO)\b/i, t);
  }
  assert.deepEqual(Object.keys(C.outcome).sort(), ['denied', 'given', 'granted']);
  assert.match(C.failed, /\{reason\}/);
});
