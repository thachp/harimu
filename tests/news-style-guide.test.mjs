import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const guide = readFileSync(new URL('../docs/NEWS_STYLE_GUIDE.md', import.meta.url), 'utf8');
test('guide covers ten nations with tone, sample lines and banned moves', () => {
  const sections = guide.split(/\n## /).filter(s => /^(Kindle|The Confluence|Meridian|Korund|Aurelle|Ilmar|Hoarvale|Varkand|Veldwood|Fulmara)/.test(s));
  assert.equal(sections.length, 10);
  for (const s of sections) for (const key of ['**Tone:**', '**Sample lines:**', '**Banned:**']) assert.ok(s.includes(key), s.slice(0, 30) + key);
});
test('provenance labels match NewsItem source kinds; Notable rule present', () => {
  for (const label of ['System record', 'Template', 'AI-generated', '`system` / `record`', '`deterministic`', '`model` / `article`']) assert.ok(guide.includes(label), label);
  assert.match(guide, /Emberwarden/);
  assert.match(guide, /Kindle Press.*Korund State Media.*Aurelle Court Gazette/s);
});
