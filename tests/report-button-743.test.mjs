/** #743 slice 1: the Report control (app/report-button.tsx) and the flag the square and Notable GETs pass to it. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
import {localRuntime} from './helpers/local-runtime.mjs';
import * as copy from '../lib/report-copy.ts';
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(await readFile(new URL('../app/report-button.tsx', import.meta.url), 'utf8'), {compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS}}).outputText;
function harness(kind, slots, respond) {
  const refs = [{current: null}, {current: null}], requests = []; let cursor = 0, refCursor = 0;
  const react = {useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], next => { slots[i] = next; }]; }, useRef(initial) { const i = refCursor++; return refs[i] ?? (refs[i] = {current: initial}); }, useEffect() {}};
  const exports = {};
  new Function('exports', 'require', 'fetch', 'crypto', compiled)(exports, name => name === 'react' ? react : name === '../lib/report-copy' ? copy : require(name), async (url, options) => { requests.push({url, ...options, body: JSON.parse(options.body)}); return respond(); }, {randomUUID: () => `00000000-0000-4000-8000-00000000000${requests.length}`});
  const render = () => { cursor = 0; refCursor = 0; return exports.ReportButton({kind, targetId: '11111111-1111-4111-8111-111111111111'}); };
  const all = node => [node, ...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child => typeof child === 'object' ? all(child) : [child])];
  return {render, all, requests};
}
test('closed: one entry button with the accessible name; open: header, reasons (no AI-only reason for a chat message), note and buttons', () => {
  const closed = harness('citizen-message', []).render();
  assert.equal(closed.type, 'button'); assert.equal(closed.props.children, 'Report this message'); assert.equal(closed.props['aria-label'], copy.reportTargetFor('citizen-message').accessibleName);
  const h = harness('citizen-message', [true]); const nodes = h.all(h.render());
  const text = nodes.filter(n => typeof n === 'string').join('|');
  assert.ok(text.includes(copy.reportHeader.title) && text.includes(copy.reportHeader.line.text));
  assert.deepEqual(nodes.filter(n => n?.type === 'input').map(n => n.props.value), copy.reasonsFor('citizen-message').map(r => r.id));
  assert.equal(nodes.some(n => n?.props?.value === 'ai-inappropriate'), false);
  assert.ok(nodes.some(n => n?.type === 'textarea' && n.props.maxLength === 280));
  assert.equal(h.render().props.role, 'dialog');
  const ai = harness('notable-reply', [true]); assert.ok(ai.all(ai.render()).some(n => n?.props?.value === 'ai-inappropriate'));
});
test('submit posts the report once per dialog id: a retry after failure reuses the request id; 201 shows sent, 409 duplicate shows already reported', async () => {
  const slots = [true, 'spam-other', ' noisy ', 'idle']; let reply = {status: 500, json: async () => ({})};
  const h = harness('citizen-message', slots, () => reply);
  const send = () => h.all(h.render()).find(n => n?.type === 'button' && [copy.reportActions.submit, copy.reportActions.retry].includes(n.props.children));
  await send().props.onClick(); await new Promise(r => setTimeout(r, 0));
  assert.equal(slots[3], 'failed'); assert.equal(send().props.children, copy.reportActions.retry);
  reply = {status: 201, json: async () => ({ok: true})};
  await send().props.onClick(); await new Promise(r => setTimeout(r, 0));
  assert.equal(slots[3], 'sent'); assert.equal(h.requests.length, 2); assert.equal(h.requests[0].body.requestId, h.requests[1].body.requestId);
  assert.deepEqual({...h.requests[0].body, requestId: undefined}, {requestId: undefined, targetKind: 'citizen-message', targetId: '11111111-1111-4111-8111-111111111111', reasonId: 'spam-other', note: 'noisy'});
  assert.equal(h.render().props.children, copy.reportStates.sent.text);
  const d = harness('citizen-message', [true, 'spam-other', '', 'idle'], () => ({status: 409, json: async () => ({duplicate: true})}));
  await d.all(d.render()).find(n => n?.type === 'button' && n.props.children === copy.reportActions.submit).props.onClick(); await new Promise(r => setTimeout(r, 0));
  assert.equal(d.render().props.children, copy.reportStates.duplicate.text);
});
test('the square and Notable GETs say whether reports are on', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  for (const on of [true, false]) {
    r.setFixtureEnv('HARIMU_REPORTS_ENABLED', String(on));
    assert.equal((await r.call('square', 'alice')).data.reportsEnabled, on);
    assert.equal((await r.call('notables', 'alice')).data.reportsEnabled, on);
  }
});
test('the Notable transcript offers Report only on model replies and only when reports are on', async () => {
  const source = await readFile(new URL('../app/notable-control.tsx', import.meta.url), 'utf8');
  assert.match(source, /\{reports&&turn\.model===true&&<ReportButton kind="notable-reply" targetId=\{turn\.id\}\/>\}/);
  assert.match(source, /model:value\.source==='model'/);
  assert.match(await readFile(new URL('../app/square-chat.tsx', import.meta.url), 'utf8'), /\{!message\.mine&&state\.reportsEnabled===true&&<ReportButton kind="citizen-message" targetId=\{message\.id\}\/>\}/);
});
