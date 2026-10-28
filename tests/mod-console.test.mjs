/** #880: mod console, flag NEXT_PUBLIC_HARIMU_MOD_CONSOLE. Panels over admin GETs; queue mark-reviewed POST (#959). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { loadAiCosts, loadAiDecisions, loadLedger, loadReports, loadReviewQueue, loadRiskScores, loadVoteBuying, markReviewed, modConsoleEnabled, modPanels, utc } from '../lib/mod-console.ts';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const routes = ['/api/admin/ai-review-queue', '/api/admin/ai-costs', '/api/admin/ledger-reconciliation', '/api/admin/vote-buying', '/api/admin/risk-scores', '/api/admin/reports', '/api/admin/ai-decisions'];

test('flag: preview on, production off, only the exact string "true" enables it; every harness that defines UI_V2_HOUSEHOLD defines it', async () => {
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_MOD_CONSOLE":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_MOD_CONSOLE":\s*"false"/);
  assert.equal(modConsoleEnabled('true'), true); for (const v of [undefined, '', 'false', 'TRUE', '1']) assert.equal(modConsoleEnabled(v), false);
  for (const f of (await readdir(new URL('../scripts/', import.meta.url))).filter(f => f.endsWith('.mjs'))) {
    const src = await read(`scripts/${f}`);
    if (/['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD['"]\s*:/.test(src) && !['ui-v2-household-check.mjs', 'mod-console-check.mjs'].includes(f)) assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_MOD_CONSOLE['"]\s*:\s*'"false"'/, f);
  }
});

test('no new server logic or access: the page 404s with the flag off, only GETs existing admin routes, and keeps the token in memory', async () => {
  const page = await read('app/admin/mod/page.tsx'), ui = await read('app/admin/mod/mod-console.tsx'), lib = await read('lib/mod-console.ts');
  assert.match(page, /if \(!modConsoleEnabled\(\)\) notFound\(\);/); assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.doesNotMatch(ui + lib, /localStorage|sessionStorage|document\.cookie/); assert.match(lib, /method: 'POST'/); assert.match(lib, /markReviewed/);
  assert.deepEqual([...new Set([...lib.matchAll(/\/api\/[a-z/-]+/g)].map(m => m[0]))].sort(), [...routes].sort());
  assert.deepEqual([...modPanels], ['ai-review-queue', 'ai-costs', 'ledger-reconciliation', 'vote-buying', 'risk-scores', 'reports', 'ai-decisions']);
  await assert.rejects(readFile(new URL('../app/api/admin/mod-console', import.meta.url)), 'no new route');
});

test('each loader sends the Bearer token and passes route errors through', async () => {
  const calls = [], fake = (path, okBody, status = 200) => async (url, init) => { calls.push([url, init.headers.Authorization]); return new Response(JSON.stringify(status === 200 ? okBody : { error: 'A server credential is required.' }), { status }); };
  assert.deepEqual(await loadReviewQueue('t'.repeat(16), { reason: 'flagged', nation: 'korund' }, fake('/api/admin/ai-review-queue', { items: [{ id: 'a' }] })), { panel: 'ai-review-queue', ok: true, items: [{ id: 'a' }] });
  assert.deepEqual(calls[0], ['/api/admin/ai-review-queue?reason=flagged&nation=korund', `Bearer ${'t'.repeat(16)}`]);
  assert.equal((await loadReviewQueue('x', {}, fake('/x', {}, 401))).status, 401);
  assert.deepEqual(await loadAiCosts('t'.repeat(16), fake('/api/admin/ai-costs', { days: [{ day: '2026-01-01' }], asOf: 1, windowDays: 7 })), { panel: 'ai-costs', ok: true, days: [{ day: '2026-01-01' }], asOf: 1, windowDays: 7 });
  assert.equal(calls.at(-1)[0], '/api/admin/ai-costs');
  assert.deepEqual(await loadLedger('t'.repeat(16), fake('/api/admin/ledger-reconciliation', { report: null })), { panel: 'ledger-reconciliation', ok: true, report: null });
  assert.equal((await loadLedger('x', fake('/x', {}, 401))).status, 401);
  assert.deepEqual(await loadVoteBuying('t'.repeat(16), fake('/api/admin/vote-buying', { events: [] })), { panel: 'vote-buying', ok: true, events: [] });
  assert.equal((await loadVoteBuying('x', fake('/x', {}, 401))).status, 401);
  assert.equal((await loadAiCosts('x', fake('/x', {}, 401))).status, 401);
  assert.deepEqual(await loadRiskScores('t'.repeat(16), fake('/api/admin/risk-scores', { reviewOnly: true, accounts: [{ userId: 'u1', score: 9, reasons: ['new_account'], civicActCount: 2, updatedAt: 10 }] })), { panel: 'risk-scores', ok: true, accounts: [{ userId: 'u1', score: 9, reasons: ['new_account'], civicActCount: 2, updatedAt: 10 }], reviewOnly: true });
  assert.equal(calls.at(-1)[0], '/api/admin/risk-scores');
  assert.equal((await loadRiskScores('x', fake('/x', {}, 401))).status, 401);
  assert.deepEqual(await loadReports('t'.repeat(16), { limit: 1, offset: 1 }, fake('/api/admin/reports', { reports: [{ id: 'r2' }] })), { panel: 'reports', ok: true, reports: [{ id: 'r2' }] });
  assert.equal(calls.at(-1)[0], '/api/admin/reports?limit=1&offset=1');
  assert.deepEqual(await loadAiDecisions('t'.repeat(16), { limit: 50 }, fake('/api/admin/ai-decisions', { decisions: [{ id: 'd1' }] })), { panel: 'ai-decisions', ok: true, decisions: [{ id: 'd1' }] });
  assert.equal(calls.at(-1)[0], '/api/admin/ai-decisions?limit=50');
  assert.deepEqual(await loadReviewQueue('t'.repeat(16), { limit: 50, offset: 50 }, fake('/api/admin/ai-review-queue', { items: [] })), { panel: 'ai-review-queue', ok: true, items: [] });
  assert.equal(calls.at(-1)[0], '/api/admin/ai-review-queue?limit=50&offset=50');
  const posts = [];
  const postFake = async (url, init) => { posts.push([url, init.method, init.headers.Authorization, init.body]); return new Response(JSON.stringify({ id: 'a', reviewed: true }), { status: 200 }); };
  assert.deepEqual(await markReviewed('t'.repeat(16), 'a', 'ok', postFake), { ok: true, id: 'a', reviewed: true });
  assert.deepEqual(posts[0], ['/api/admin/ai-review-queue', 'POST', `Bearer ${'t'.repeat(16)}`, JSON.stringify({ id: 'a', note: 'ok' })]);
  assert.equal((await markReviewed('x', 'z', 'n', async () => new Response(JSON.stringify({ error: 'Unknown review queue entry.' }), { status: 409 }))).status, 409);
  assert.deepEqual(await loadAiCosts('x', async () => { throw new Error('offline'); }), { panel: 'ai-costs', ok: false, status: 0, error: 'Network error' });
  assert.equal(utc(0), '1970-01-01 00:00 UTC'); assert.equal(utc(null), '');
});

test('the console renders a labelled form; tables appear only after an accepted load', async () => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/admin/mod/mod-console.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty', '.module.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const { ModConsole } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const html = renderToStaticMarkup(React.createElement(ModConsole));
  assert.match(html, /<h1>Mod console<\/h1>/); assert.match(html, /<label>Admin token<input type="password" autoComplete="off" required=""/);
  assert.match(html, /role="status"/); assert.equal((html.match(/<button/g) ?? []).length, 1); assert.doesNotMatch(html, /<table/);
  for (const p of modPanels) assert.match(html, new RegExp(`<option[^>]*value="${p}"`));
});

test('ARC: no data before the server accepts the token; the older-entries cue uses the route\'s 50-entry page', async () => {
  const ui = await read('app/admin/mod/mod-console.tsx');
  assert.match(ui, /result\?\.ok && result\.panel === 'ai-review-queue' && result\.items\.length > 0/, 'queue table only from accepted non-empty');
  assert.match(ui, /result\?\.ok && result\.panel === 'ai-costs' && result\.days\.length > 0/);
  assert.match(ui, /result\?\.ok && result\.panel === 'ledger-reconciliation' && result\.report/);
  assert.match(ui, /result\?\.ok && result\.panel === 'vote-buying' && result\.events\.length > 0/);
  assert.match(ui, /result\?\.ok && result\.panel === 'risk-scores' && result\.accounts\.length > 0/);
  assert.match(ui, /result\?\.ok && result\.panel === 'reports' && result\.reports\.length > 0/);
  assert.match(ui, /result\?\.ok && result\.panel === 'ai-decisions' && result\.decisions\.length > 0/);
  assert.doesNotMatch(ui, /useEffect/, 'nothing loads before Load');
  assert.match(ui, /setResult\(null\);/, 'a new load clears the previous data first');
  assert.match(ui, /const PAGE = 50;/); assert.match(await read('lib/mod-console.ts'), /older entries not shown/);
  assert.match(await read('lib/ai-review-queue.ts'), /limit=50/);
});

test('#880 copy (Content): status line for counts, an empty queue and an empty filter result', async () => {
  const { queueStatus, modConsoleCopy: C } = await import('../lib/mod-console.ts');
  assert.equal(queueStatus(0, true, 50), 'No entries match these filters.');
  assert.equal(queueStatus(0, false, 50), 'The queue is empty.');
  assert.equal(queueStatus(1, false, 50), '1 entry'); assert.equal(queueStatus(3, true, 50), '3 entries');
  assert.equal(queueStatus(50, false, 50), '50 entries · newest 50 shown, older entries not shown');
  assert.equal(C.proposal, true); assert.equal(C.load, 'Load queue'); assert.equal(C.loadAny, 'Load');
});

test('QA2 on #923: the empty-result message follows the filters as submitted, not the menus changed after the load', async () => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/admin/mod/mod-console.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty', '.module.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const { Window } = await import('happy-dom'), w = new Window({ url: 'http://localhost/' });
  globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { ModConsole } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { createRoot } = await import('react-dom/client'), { act } = React;
  const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
  await act(async () => root.render(React.createElement(ModConsole, { loadQueue: async () => ({ panel: 'ai-review-queue', ok: true, items: [] }) })));
  const status = () => el.querySelector('[role=status]').textContent;
  const setValue = async (node, value) => act(async () => { const proto = Object.getPrototypeOf(node), set = Object.getOwnPropertyDescriptor(proto, 'value').set; set.call(node, value); node.dispatchEvent(new w.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  const submit = async () => act(async () => { el.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 0)); });
  const reason = [...el.querySelectorAll('select')].find(s => s.closest('label')?.textContent?.startsWith('reason'));
  await setValue(el.querySelector('input[type=password]'), 'a-staff-token-1234');
  await submit(); assert.equal(status(), 'The queue is empty.');
  await setValue(reason, 'flagged'); assert.equal(status(), 'The queue is empty.', 'a menu change after the load does not change the message');
  await submit(); assert.equal(status(), 'No entries match these filters.');
  await setValue(reason, ''); assert.equal(status(), 'No entries match these filters.', 'clearing the menu after the load does not change it either');
  await act(async () => root.unmount());
});

test('QA3: a loaded ai-costs row shows reservedMicro; a loaded vote-buying row shows voterId', async () => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/admin/mod/mod-console.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty', '.module.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const { Window } = await import('happy-dom'), w = new Window({ url: 'http://localhost/' });
  globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { ModConsole } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { createRoot } = await import('react-dom/client'), { act } = React;
  const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
  const setValue = async (node, value) => act(async () => { const proto = Object.getPrototypeOf(node), set = Object.getOwnPropertyDescriptor(proto, 'value').set; set.call(node, value); node.dispatchEvent(new w.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  const submit = async () => act(async () => { el.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 0)); });
  await act(async () => root.render(React.createElement(ModConsole, {
    loadCosts: async () => ({ panel: 'ai-costs', ok: true, days: [{ day: '2026-01-02', reservedMicro: 4242, settledMicro: 100, calls: 3, budgetMicro: null }], asOf: 1, windowDays: 7 }),
    loadVotes: async () => ({ panel: 'vote-buying', ok: true, events: [{ electionKey: 'k1', voterId: 'voter-real-9', senderId: 's1', transferId: 't1', reason: 'direct_transfer', createdAt: 100 }] }),
  })));
  const panel = [...el.querySelectorAll('select')].find(s => s.closest('label')?.textContent?.startsWith('panel'));
  await setValue(el.querySelector('input[type=password]'), 'a-staff-token-1234');
  await setValue(panel, 'ai-costs'); await submit();
  assert.match(el.textContent, /4242/, 'reservedMicro appears'); assert.match(el.querySelector('caption')?.textContent ?? '', /ai-costs/);
  await setValue(panel, 'vote-buying'); await submit();
  assert.match(el.textContent, /voter-real-9/, 'voterId appears'); assert.match(el.querySelector('caption')?.textContent ?? '', /vote-buying/);
  await act(async () => root.unmount());
});

test('#880 risk-scores: no data before accept; a loaded row shows score and userId', async () => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/admin/mod/mod-console.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty', '.module.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const { Window } = await import('happy-dom'), w = new Window({ url: 'http://localhost/' });
  globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { ModConsole } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { createRoot } = await import('react-dom/client'), { act } = React;
  const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
  let calls = 0;
  const setValue = async (node, value) => act(async () => { const proto = Object.getPrototypeOf(node), set = Object.getOwnPropertyDescriptor(proto, 'value').set; set.call(node, value); node.dispatchEvent(new w.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
  const submit = async () => act(async () => { el.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 0)); });
  await act(async () => root.render(React.createElement(ModConsole, {
    loadRisk: async () => { calls++; return { panel: 'risk-scores', ok: true, reviewOnly: true, accounts: [{ userId: 'user-risk-7', score: 42, reasons: ['new_account'], civicActCount: 3, updatedAt: 100 }] }; },
  })));
  assert.equal(calls, 0, 'nothing fetched before Load'); assert.equal(el.querySelector('table'), null);
  const panel = [...el.querySelectorAll('select')].find(s => s.closest('label')?.textContent?.startsWith('panel'));
  await setValue(el.querySelector('input[type=password]'), 'a-staff-token-1234');
  await setValue(panel, 'risk-scores'); await submit();
  assert.equal(calls, 1); assert.match(el.textContent, /42/); assert.match(el.textContent, /user-risk-7/);
  assert.match(el.querySelector('caption')?.textContent ?? '', /risk-scores/);
  await act(async () => root.unmount());
});

test('#880 reports + ai-decisions: no data before accept; mark-reviewed POSTs then reloads queue', async () => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/admin/mod/mod-console.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty', '.module.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const { Window } = await import('happy-dom'), w = new Window({ url: 'http://localhost/' });
  globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { ModConsole } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { createRoot } = await import('react-dom/client'), { act } = React;
  const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
  let loads = 0, marks = 0;
  const setValue = async (node, value) => act(async () => { const proto = Object.getPrototypeOf(node), set = Object.getOwnPropertyDescriptor(proto, 'value').set; set.call(node, value); node.dispatchEvent(new w.Event(node.tagName === 'SELECT' || node.tagName === 'INPUT' ? (node.tagName === 'SELECT' ? 'change' : 'input') : 'input', { bubbles: true })); });
  const submit = async () => act(async () => { el.querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 0)); });
  await act(async () => root.render(React.createElement(ModConsole, {
    loadReportsList: async () => { loads++; return { panel: 'reports', ok: true, reports: [{ id: 'r1', request_id: 'q', reporter_id: 'u', target_kind: 'citizen-message', target_id: 't', reason_id: 'harassment', note: null, created_at: 100 }] }; },
    loadDecisions: async () => { loads++; return { panel: 'ai-decisions', ok: true, decisions: [{ id: 'd1', created_at: 1, source: 'notables', nation_id: 'kindle', persona: 'p', output_text: 'out', filter_result: 'passed', filter_detail: null, reason: 'sample', reviewed_at: 2, reviewer_note: 'ok' }] }; },
    loadQueue: async () => { loads++; return { panel: 'ai-review-queue', ok: true, items: [{ id: 'q1', created_at: 1, source: 'notables', nation_id: 'kindle', persona: 'p', output_text: 'out', filter_result: 'replaced', filter_detail: 'keyword', reason: 'flagged', reviewed_at: null, reviewer_note: null }] }; },
    markItem: async (_t, id, note) => { marks++; assert.equal(id, 'q1'); assert.equal(note, 'looks fine'); return { ok: true, id, reviewed: true }; },
  })));
  assert.equal(loads, 0); assert.equal(el.querySelector('table'), null);
  const panel = [...el.querySelectorAll('select')].find(s => s.closest('label')?.textContent?.startsWith('panel'));
  await setValue(el.querySelector('input[type=password]'), 'a-staff-token-1234');
  await setValue(panel, 'reports'); await submit();
  assert.match(el.textContent, /r1/); assert.match(el.querySelector('caption')?.textContent ?? '', /reports/);
  await setValue(panel, 'ai-decisions'); await submit();
  assert.match(el.textContent, /d1/); assert.match(el.querySelector('caption')?.textContent ?? '', /ai-decisions/);
  await setValue(panel, 'ai-review-queue'); await submit();
  const note = el.querySelector('input[aria-label=note]'); assert.ok(note);
  await setValue(note, 'looks fine');
  await act(async () => { el.querySelector('button[type=button]').dispatchEvent(new w.Event('click', { bubbles: true })); await new Promise(r => setTimeout(r, 0)); });
  assert.equal(marks, 1); assert.match(el.textContent, /reviewed/);
  await act(async () => root.unmount());
});

