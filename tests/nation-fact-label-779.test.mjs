import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../app/nation-institutions.css', import.meta.url), 'utf8');

test('#779: the fact label column grows to its longest word and labels never break inside a word', () => {
  assert.match(css, /\.nation-inspector dl\{[^}]*grid-template-columns:minmax\(max\(70px,min-content\),\.8fr\)/);
  assert.match(css, /\.nation-inspector dt\{[^}]*overflow-wrap:normal;word-break:normal/);
  assert.doesNotMatch(css.match(/\.nation-inspector dt\{[^}]*\}/)[0], /anywhere|break-all/);
});

test('#779: narrow panels stack label over value', () => {
  assert.match(css, /@media \(max-width:420px\)\{\.nation-inspector dl\{grid-template-columns:minmax\(0,1fr\)/);
});

test('#779: the layout check runs in hud-layout-check at 1280/390/320, 100/125/150%, flag off and on', async () => {
  const hud = await readFile(new URL('../scripts/hud-layout-check.mjs', import.meta.url), 'utf8');
  const check = await readFile(new URL('../scripts/nation-fact-label-check.mjs', import.meta.url), 'utf8');
  assert.match(hud, /await checkNationFactLabels\(/);
  assert.match(check, /\[\[1280, 800\], \[390, 844\], \[320, 700\]\]/);
  assert.match(check, /\[1, 1\.25, 1\.5\]/);
  assert.match(check, /\['false', 'true'\]/);
  assert.match(check, /splits "\$\{m\[0\]\}" mid-word/);
});
