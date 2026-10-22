// #709: the Presidential election card duplicated endlessly on the Kindle Government view.
// Root cause: RankedBallot and CollectivePetitionsPanel (and the Aurelle panel) used the same bare key={citizenSessionKey}
// as siblings in one fragment. When a conditional sibling above them toggles, React reconciles by key, the duplicate key
// leaves an orphaned RankedBallot behind, the new one mounts and fetches, its onSnapshot re-renders the page, and the copies grow.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Window } from 'happy-dom';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const gov = page.slice(page.indexOf("{viewMode === 'government' && <>"), page.indexOf('</>}', page.indexOf("{viewMode === 'government' && <>")));
const keyOf = name => gov.match(new RegExp(`<${name} key=\\{(\`[^\`]*\`|[^}]+)\\}`))?.[1]; // QA3 on #711: a bare key stops at its own brace

test('every keyed panel in the Government fragment has a unique key', () => {
  const keys = [...gov.matchAll(/ key=\{(`[^`]*`|[^}]+)\}/g)].map(m => m[1]);
  assert.ok(keys.length >= 8, `found ${keys.length} keys`);
  assert.equal(new Set(keys).size, keys.length, `duplicate keys: ${keys.join(' | ')}`);
});

// QA1 on #711: the same harness must reproduce #709 with dev's shared bare key, so it is a real regression test.
const w = new Window(); globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = (await import('react')).default, { createRoot } = await import('react-dom/client');
const h = React.createElement;
const evalKey = src => new Function('citizenSessionKey', `return ${src};`)('session-1');
async function render(rankedKey, petitionsKey, shape) {
  let mounts = 0, set;
  function Card({ onSnapshot, label }) { // stands in for a panel that fetches on mount and reports a snapshot up
    React.useEffect(() => { mounts++; const t = setTimeout(() => onSnapshot({ at: mounts }), 0); return () => clearTimeout(t); }, [onSnapshot]);
    return h('h3', null, label);
  }
  function Government() {
    const [, setElection] = React.useState(null), [, setPetitions] = React.useState(null), [n, s] = React.useState(0); set = s;
    const ranked = h(Card, { key: rankedKey, onSnapshot: setElection, label: 'Presidential election · PoC' });
    return h(React.Fragment, null, h('p', { key: 'b' }, 'banner'),
      shape === 'sibling-above' ? (n % 2 ? h('p', { key: 'reserve' }, 'reserve') : false) : null, // like SiegePanel / ReserveBoardLine
      shape === 'ranked-toggles' && n % 2 ? false : ranked,
      h(Card, { key: petitionsKey, onSnapshot: setPetitions, label: 'Collective petitions' }));
  }
  const el = document.createElement('div'), root = createRoot(el), errors = [], orig = console.error; console.error = (...a) => errors.push(a.join(' '));
  try {
    await React.act(async () => root.render(h(Government)));
    for (let i = 1; i <= 10; i++) await React.act(async () => { set(i); await new Promise(r => setTimeout(r, 2)); });
    return { cards: (el.innerHTML.match(/Presidential election/g) ?? []).length, mounts, warned: errors.some(e => /same key/.test(e)) };
  } finally { console.error = orig; await React.act(async () => root.unmount()); }
}

for (const shape of ['sibling-above', 'ranked-toggles']) {
  test(`dev's shared bare key duplicates the card (${shape}): the harness reproduces #709`, async () => {
    const r = await render(evalKey('citizenSessionKey'), evalKey('citizenSessionKey'), shape);
    assert.ok(r.cards > 1 && r.warned, JSON.stringify(r));
  });
  test(`the keys in app/page.tsx render the card exactly once across 10 refreshes (${shape})`, async () => {
    const r = await render(evalKey(keyOf('RankedBallot')), evalKey(keyOf('CollectivePetitionsPanel')), shape);
    assert.equal(r.cards, 1);
    assert.equal(r.warned, false, 'no duplicate-key warning');
    if (shape === 'sibling-above') assert.equal(r.mounts, 2, 'each panel mounts once; no remount loop');
  });
}

test('no bare key={citizenSessionKey} remains in app/page.tsx', () => assert.doesNotMatch(page, /key=\{citizenSessionKey\}/));
