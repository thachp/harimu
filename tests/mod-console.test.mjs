/** #880: mod console (read-only slice), flag NEXT_PUBLIC_HARIMU_MOD_CONSOLE ("true" in preview, "false" in production). Flag and access pins, the client over
 *  GET /api/admin/ai-review-queue (Bearer token, filters, errors passed through), the page rendered flag off and on, and harness defines. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { loadReviewQueue, modConsoleEnabled, utc } from '../lib/mod-console.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('flag: preview on, production off, only the exact string "true" enables it; every harness that defines UI_V2_HOUSEHOLD defines it', async () => {
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_MOD_CONSOLE":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_MOD_CONSOLE":\s*"false"/);
  assert.equal(modConsoleEnabled('true'), true); for (const v of [undefined, '', 'false', 'TRUE', '1']) assert.equal(modConsoleEnabled(v), false);
  for (const f of (await readdir(new URL('../scripts/', import.meta.url))).filter(f => f.endsWith('.mjs'))) {
    const src = await read(`scripts/${f}`);
    if (/['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD['"]\s*:/.test(src) && f !== 'ui-v2-household-check.mjs') assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_MOD_CONSOLE['"]\s*:\s*'"false"'/, f);
  }
});

test('no new server logic or access: the page 404s with the flag off, only GETs an existing admin route, and keeps the token in memory', async () => {
  const page = await read('app/admin/mod/page.tsx'), ui = await read('app/admin/mod/mod-console.tsx'), lib = await read('lib/mod-console.ts');
  assert.match(page, /if \(!modConsoleEnabled\(\)\) notFound\(\);/); assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.doesNotMatch(ui + lib, /localStorage|sessionStorage|document\.cookie|method:\s*'POST'/);
  assert.deepEqual([...new Set([...lib.matchAll(/\/api\/[a-z/-]+/g)].map(m => m[0]))], ['/api/admin/ai-review-queue']);
  await assert.rejects(readFile(new URL('../app/api/admin/mod-console', import.meta.url)), 'no new route');
});

test('loadReviewQueue sends the Bearer token and filters, and passes the route errors through', async () => {
  const calls = [], fake = status => async (url, init) => { calls.push([url, init.headers.Authorization]); return new Response(JSON.stringify(status === 200 ? { items: [{ id: 'a' }] } : { error: 'A server credential is required.' }), { status }); };
  assert.deepEqual(await loadReviewQueue('t'.repeat(16), { reason: 'flagged', nation: 'korund' }, fake(200)), { ok: true, items: [{ id: 'a' }] });
  assert.deepEqual(calls[0], ['/api/admin/ai-review-queue?reason=flagged&nation=korund', `Bearer ${'t'.repeat(16)}`]);
  assert.deepEqual(await loadReviewQueue('x', {}, fake(401)), { ok: false, status: 401, error: 'A server credential is required.' }); assert.equal(calls[1][0], '/api/admin/ai-review-queue');
  assert.deepEqual(await loadReviewQueue('x', {}, async () => { throw new Error('offline'); }), { ok: false, status: 0, error: 'Network error' });
  assert.equal(utc(0), '1970-01-01 00:00 UTC'); assert.equal(utc(null), '');
});

test('the console renders a labelled form and, after a load, a captioned table with scoped headers (read-only: no action buttons)', async () => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/admin/mod/mod-console.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty', '.module.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const { ModConsole } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const html = renderToStaticMarkup(React.createElement(ModConsole));
  assert.match(html, /<h1>Mod console<\/h1>/); assert.match(html, /<label>Admin token<input type="password" autoComplete="off" required=""/);
  assert.match(html, /role="status"/); assert.equal((html.match(/<button/g) ?? []).length, 1, 'one button: Load');
});

test('ARC: no data before the server accepts the token; the older-entries cue uses the route\'s 50-entry page', async () => {
  const ui = await read('app/admin/mod/mod-console.tsx');
  assert.match(ui, /\{result\?\.ok && <div className=\{styles\.scroll\}/, 'the table renders only from an accepted response');
  assert.equal((ui.match(/<table/g) ?? []).length, 1); assert.doesNotMatch(ui, /useEffect/, 'nothing loads before Load');
  assert.match(ui, /setResult\(null\); setResult\(await load\(/, 'a new load clears the previous data first');
  assert.match(ui, /const PAGE = 50;/); assert.match(ui, /older entries not shown/);
  assert.match(await read('lib/ai-review-queue.ts'), /limit=50/);
});
