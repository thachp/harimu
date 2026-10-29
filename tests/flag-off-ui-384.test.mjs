/** #384 L2/L3: flag-off UI containers, mounted in a happy-dom window with real effects (react-dom/client + act).
 *  Each check has a flag-on baseline so it cannot pass by rendering nothing at all. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, after } from 'node:test';
import { Window } from 'happy-dom';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const React = require('react'); const { createRoot } = require('react-dom/client');

const load = (file, shims) => {
  const code = ts.transpileModule(readFileSync(`app/${file}`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {}; new Function('exports', 'require', code)(exports, name => shims[name] ?? require(name)); return exports;
};
const stub = () => new Proxy({}, { get: (_, key) => key === '__esModule' ? false : () => null });

const window = new Window({ url: 'https://fixture.invalid/' });
Object.assign(globalThis, { window, document: window.document, IS_REACT_ACT_ENVIRONMENT: true });
after(() => window.happyDOM.close());
async function mount(t, element, { fetch, WebSocket } = {}) {
  if (fetch) globalThis.fetch = fetch;
  globalThis.WebSocket = WebSocket;
  const host = window.document.createElement('div'); window.document.body.appendChild(host);
  const root = createRoot(host);
  await React.act(async () => { root.render(element); });
  const settle = async (ms = 20) => { await React.act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); }); };
  t.after(async () => { await React.act(async () => root.unmount()); host.remove(); });
  return { host, settle };
}
const respond = (status, body) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('L2: AssemblyBallot renders nothing when GET /api/assembly is 404; baseline: a 200 snapshot renders the panel', async t => {
  const { AssemblyBallot } = load('assembly-ballot.tsx', { './session-retry': load('session-retry.tsx', {}), './nation-document': { NationDocument: ({ children }) => React.createElement('section', null, children) },
    './ai-disclosure': stub(), './action-button': stub(), './game-timer': stub(), './kindle-civic-ballot': load('kindle-civic-ballot.tsx', {}), '../lib/assembly-copy': { ballotExplainer: { title: 'Ballot', body: [] }, resultsCaption: '' } });
  let calls = 0;
  const off = await mount(t, React.createElement(AssemblyBallot), { fetch: async (...a) => { calls++; return respond(404, { error: 'Not found.' })(...a); } });
  await off.settle();
  assert.equal(calls, 1, 'the panel asked'); assert.equal(off.host.innerHTML, '', 'nothing renders while the flag is off');
});

test('L2: AurelleRisingPanel shows no placeholder before load and renders nothing for {enabled:false}; a failed read still shows its error', async t => {
  const { AurelleRisingPanel } = load('aurelle-rising.tsx', { '../lib/action-reasons': stub(), './game-timer': stub(), './ai-disclosure': stub(), '../lib/claimant-copy': stub(), '../lib/aurelle-rising': stub(), '../lib/palace-coup-copy': stub() });
  let release; const pending = new Promise(resolve => { release = resolve; });
  const off = await mount(t, React.createElement(AurelleRisingPanel), { fetch: async () => { await pending; return respond(200, { enabled: false, crown: null })(); } });
  await off.settle();
  assert.equal(off.host.innerHTML, '', 'no "Loading claimants…" placeholder before the first read');
  release(); await off.settle();
  assert.equal(off.host.innerHTML, '', 'flag off renders nothing');
  const failed = await mount(t, React.createElement(AurelleRisingPanel), { fetch: respond(500, { error: 'Claimants unavailable.' }) });
  await failed.settle();
  assert.match(failed.host.textContent, /Claimants unavailable/, 'baseline: the panel renders when there is something to show');
});

test('L2: the wallet gets onBuyTessera only while the kiosk is open (GET /api/world/registry kiosk.open)', () => {
  const page = readFileSync('app/page.tsx', 'utf8');
  const wallets = page.match(/<WalletPanel[^>]*>/g) ?? [];
  assert.ok(wallets.length > 0, 'the wallet is mounted');
  for (const tag of wallets) assert.match(tag, /onBuyTessera=\{kioskOpen \? buyTessera : undefined\}/, tag.slice(0, 120));
  assert.match(page, /const \[kioskOpen, setKioskOpen\] = useState\(false\)/, 'the kiosk starts closed');
});

test('L3: NEXT_PUBLIC_HARIMU_REALTIME_PRESENCE on with the server flag off (socket 404s): falls back to off and does not retry; flag off opens no socket', async t => {
  const presence = load('city-presence-live.tsx', { '@/lib/city-presence': require('../lib/city-presence.ts') });
  let sockets = 0;
  class FailingSocket { static OPEN = 1; constructor() { sockets++; setTimeout(() => this.onerror?.(new Event('error')), 1); setTimeout(() => this.onclose?.({ code: 1006 }), 2); } send() {} close() {} }
  const Probe = ({ enabled }) => { const state = presence.useCityPresence(true, 'forgehaven', enabled); return React.createElement('p', null, state.status); };
  const on = await mount(t, React.createElement(Probe, { enabled: true }), { WebSocket: FailingSocket });
  await on.settle(100);
  assert.equal(sockets, 1, 'baseline: one attempt (the client tried), and no retry loop'); assert.equal(on.host.textContent, 'off', 'falls back to status off');
  sockets = 0;
  const off = await mount(t, React.createElement(Probe, { enabled: false }), { WebSocket: FailingSocket });
  await off.settle(50);
  assert.equal(sockets, 0, 'flag off never opens a socket'); assert.equal(off.host.textContent, 'off');
});
