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
const keyOf = name => gov.match(new RegExp(`<${name} key=\\{([^}]*\\}?[^}]*)\\}`))?.[1];

test('every keyed panel in the Government fragment has its own prefixed key', () => {
  const keys = [...gov.matchAll(/ key=\{(`[^`]*`|[^}]+)\}/g)].map(m => m[1]);
  assert.ok(keys.length >= 8, `found ${keys.length} keys`);
  assert.equal(new Set(keys).size, keys.length, `duplicate keys: ${keys.join(' | ')}`);
  for (const k of keys) assert.match(k, /^`[a-z-]+:\$\{citizenSessionKey\}`$/, `bare or unprefixed key: ${k}`);
});

test('the Presidential election card renders exactly once across several refreshes and polls', async () => {
  const w = new Window(); globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = (await import('react')).default, { createRoot } = await import('react-dom/client');
  // The keys come from app/page.tsx itself, evaluated for one session key.
  const evalKey = src => new Function('citizenSessionKey', `return ${src};`)('session-1');
  const ranked = evalKey(keyOf('RankedBallot')), petitions = evalKey(keyOf('CollectivePetitionsPanel'));
  let mounts = 0, bump;
  function Card({ onSnapshot, label }) { // stands in for a panel that fetches on mount and reports a snapshot up
    React.useEffect(() => { mounts++; const t = setTimeout(() => onSnapshot({ at: mounts }), 0); return () => clearTimeout(t); }, [onSnapshot]);
    return React.createElement('h3', null, label);
  }
  function Government() {
    const [, setElection] = React.useState(null), [, setPetitions] = React.useState(null), [n, setN] = React.useState(0); bump = () => setN(x => x + 1);
    return React.createElement(React.Fragment, null,
      n % 2 ? React.createElement('p', null, 'siege') : false, // a conditional sibling above, like SiegePanel / ReserveBoardLine
      React.createElement(Card, { key: ranked, onSnapshot: setElection, label: 'Presidential election · PoC' }),
      React.createElement('p', null, 'assembly'),
      React.createElement(Card, { key: petitions, onSnapshot: setPetitions, label: 'Collective petitions' }));
  }
  const el = document.createElement('div'); document.body.appendChild(el);
  const root = createRoot(el), errors = [], orig = console.error; console.error = (...a) => errors.push(a.join(' '));
  try {
    await React.act(async () => root.render(React.createElement(Government)));
    for (let i = 0; i < 6; i++) await React.act(async () => { bump(); await new Promise(r => setTimeout(r, 5)); });
    assert.equal((el.innerHTML.match(/Presidential election/g) ?? []).length, 1);
    assert.equal(mounts, 2, 'each panel mounts once; no remount loop');
    assert.ok(!errors.some(e => /same key/.test(e)), 'no duplicate-key warning');
  } finally { console.error = orig; await React.act(async () => root.unmount()); }
});
