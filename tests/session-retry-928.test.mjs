/** #928: a session card whose signed-in load fails (5xx or offline) shows a status line and Retry instead of staying hidden until a full reload; Retry loads
 *  again and the card appears; a 4xx (not eligible / signed out) still hides the card with no Retry. Real cards, mounted in happy-dom with a stubbed fetch. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mountAll = async () => {
  const { build } = await import('esbuild');
  const out = await build({ stdin: { contents: "export { ArmyCard } from './app/army-card.tsx'; export { Rallies } from './app/rallies.tsx'; export { PrimaryCard } from './app/primary-card.tsx';", resolveDir: new URL('..', import.meta.url).pathname, loader: 'tsx' },
    bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', plugins: [{ name: 'css-modules', setup(b) { b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'm', namespace: 'cssm' })); b.onLoad({ filter: /.*/, namespace: 'cssm' }, () => ({ contents: 'export default new Proxy({}, { get: (_, k) => String(k) })' })); } }], alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const { Window } = await import('happy-dom'); const w = new Window(); globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = (await import('react')).default, { createRoot } = await import('react-dom/client'), { act } = await import('react');
  return async (name, respond) => {
    globalThis.fetch = async (url, init) => { const r = respond(String(url), init); if (r === 'offline') throw new TypeError('offline'); return new Response(JSON.stringify(r.body ?? {}), { status: r.status }); };
    const el = document.createElement('div'); document.body.append(el); const root = createRoot(el);
    const settle = async () => { for (let i = 0; i < 5; i++) await act(async () => { await new Promise(r => setTimeout(r, 5)); }); };
    await act(async () => root.render(React.createElement(mod[name]))); await settle();
    return { el, settle, click: async () => { await act(async () => el.querySelector('.session-retry button').click()); await settle(); }, done: () => act(async () => root.unmount()) };
  };
};

test('a 5xx or offline load shows Retry; Retry loads again; a 4xx stays hidden with no Retry', async () => {
  const mount = await mountAll();
  for (const [name, url, ok] of [['Rallies', '/api/rallies', { rallies: [], eligible: true }], ['PrimaryCard', '/api/primaries', null]]) {
    for (const fail of [{ status: 500 }, 'offline']) {
      let failing = true, calls = 0;
      const card = await mount(name, u => u.startsWith(url) ? (calls++, failing ? fail : ok ? { status: 200, body: ok } : { status: 403 }) : { status: 404 });
      assert.ok(card.el.querySelector('.session-retry [role=status]'), `${name} ${JSON.stringify(fail)}: a status line`);
      assert.equal(card.el.querySelector('.session-retry button')?.textContent, 'Retry');
      failing = false; const before = calls; await card.click();
      assert.equal(calls, before + 1, `${name}: Retry fetched again`);
      assert.equal(card.el.querySelector('.session-retry'), null, `${name}: Retry loaded again`);
      await card.done();
    }
    const hidden = await mount(name, () => ({ status: 403 }));
    assert.equal(hidden.el.querySelector('.session-retry'), null, `${name}: a 4xx is not a failure`);
    await hidden.done();
  }
  const army = await mount('ArmyCard', u => u === '/api/army' ? { status: 503 } : { status: 200 });
  assert.match(army.el.querySelector('.session-retry [role=status]')?.textContent ?? '', /Your unit/);
  await army.done();
});

test('every session card on the Civic panel uses the shared retry', async () => {
  for (const f of ['army-card', 'poll-card', 'plank-votes', 'party-donations', 'rallies', 'primary-card', 'debate', 'canvassing', 'assembly-ballot'])
    assert.match(await readFile(new URL(`../app/${f}.tsx`, import.meta.url), 'utf8'), /<SessionRetry name=\{[^}]+\} onRetry=\{load(State)?\.retry\} \/>/, f);
});
