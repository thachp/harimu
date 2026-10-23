import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('#875: the nations-bar Preview badge waits for openNations, so Confluence and unbuilt nations never flash Preview before the open list loads', async () => {
  const shell = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /view === 'world' && openNations !== undefined && nationIsPreview\(item\.id, openNations\) && item\.badge !== 'Coming soon' && <small className="nation-preview-badge">Preview<\/small>/);
  assert.equal((shell.match(/>Preview</g) ?? []).length, 1, 'no new badge copy');
});

test('#875: a loaded snapshot always sets a list ([] when no nation is flag-opened), so Preview still shows after load', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /setOpenNations\(snapshot\.openNations \?\? \[\]\)/);
  assert.match(page, /useState<readonly string\[\] \| undefined>\(\)/, 'undefined until the snapshot loads');
});
