/** #466: starter grants and test faucet credits appear in the reward kiosk with their own provenance labels, apart from earned rewards, and never in the earned totals.
 *  Server read (SQLite and PGlite) plus the panel render. Flag stays "false" in both wrangler configs (asserted in the #465/#656 tests). */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { localRuntime } from './helpers/local-runtime.mjs';
import { loadApp } from './helpers/component-module.mjs';

const forbidden = /buy|bought|sell|purchase|exchange|swap|convert|cash|withdraw|price|worth|\$|kindle/i;
const at = Date.parse('2026-10-14T10:00:00.000Z') / 1000;
async function scene(t, backend) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_TESSERA_REWARDS_ENABLED', 'true');
  const iso = new Date(r.now).toISOString();
  for (const id of ['ava', 'ben', 'cyn']) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(id, id, iso, iso).run();
  const grant = (id, user, minor) => r.db.prepare("INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at) VALUES (?,?,?,'starter-grant',?)").bind(id, user, minor, at).run();
  await grant('tsr-starter-ava', 'ava', 5000); await grant('tsr-test-faucet-ben', 'ben', 5000);
  return { r, lib: await r.importModule('lib/tessera-rewards.ts'), credits: await r.importModule('lib/tessera-not-earned.ts') };
}

for (const backend of ['sqlite', 'postgres']) test(`kiosk read labels starter grants and faucet credits and keeps them out of the earned totals (${backend})`, async t => {
  const { r, lib, credits } = await scene(t, backend);
  const ava = (await r.call('tessera/rewards', 'ava')).data, ben = (await r.call('tessera/rewards', 'ben')).data, cyn = (await r.call('tessera/rewards', 'cyn')).data;
  assert.deepEqual(ava.notEarned, [{ id: 'tsr-starter-ava', provenance: 'starter_grant', amountMinor: 5000, occurredAt: '2026-10-14T10:00:00.000Z' }]);
  assert.deepEqual(ben.notEarned.map(c => c.provenance), ['faucet']); assert.deepEqual(cyn.notEarned, [], 'another citizen sees none of these rows');
  assert.equal((await lib.readRewardKiosk(r.db, 'ava')).notEarned, undefined, 'the earned-reward read itself never lists ledger rows');
  for (const view of [ava, ben]) assert.deepEqual([view.claimableMinor, view.claimedMinor, view.claimableCount, view.claimedCount, view.claimable.length, view.history.length], [0, 0, 0, 0, 0, 0], 'not counted as earned');
  await r.db.prepare("INSERT INTO citizen_tessera_ledger(id,clerk_user_id,delta_minor,reason,occurred_at) VALUES ('tsr-square-x','ava',-100,'square-purchase',?)").bind(at).run();
  assert.equal((await credits.readNotEarnedCredits(r.db, 'ava')).length, 1, 'debits are not listed as credits');
});

test('the faucet id prefix matches lib/test-faucet.ts, and the rewards code still does not import the exchange module', async () => {
  const src = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
  const prefix = (text, name) => text.match(new RegExp(`export const ${name} = '([^']+)'`))?.[1];
  assert.equal(prefix(await src('lib/tessera-not-earned.ts'), 'faucetIdPrefix'), prefix(await src('lib/test-faucet.ts'), 'testFaucetIdPrefix')); assert.ok(prefix(await src('lib/test-faucet.ts'), 'testFaucetIdPrefix'));
  for (const file of ['lib/tessera-rewards.ts', 'lib/tessera-not-earned.ts', 'app/api/tessera/rewards/route.ts', 'app/wallet-panel.tsx']) assert.doesNotMatch(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), /tessera-exchange|test-faucet'/, file);
});

const { WalletPanel } = await loadApp('wallet-panel');
const base = { claimable: [], history: [], claimableMinor: 0, claimedMinor: 0, claimableCount: 0, claimedCount: 0, claim: async () => null };
const render = (rewards) => renderToStaticMarkup(createElement(WalletPanel, { sparkMinor: 0, transactions: [], onClose() {}, rewards }));
const section = (html) => { const start = html.indexOf('<section class="wallet-rewards"'); const markup = html.slice(start, html.indexOf('</section>', start));
  return `${markup.replace(/<[^>]+>/g, ' ')} ${[...markup.matchAll(/\s(?:aria-label|title|alt|placeholder)="([^"]*)"/g)].map(m => m[1]).join(' ')}`.replace(/\s+/g, ' '); };

test('the panel lists not-earned credits apart, with the Content labels and help lines, and the earned totals stay zero', () => {
  const html = render({ ...base, notEarned: [{ id: 'a', provenance: 'starter_grant', amountMinor: 5000, occurredAt: '2026-10-14T10:00:00.000Z' }, { id: 'b', provenance: 'faucet', amountMinor: 5000, occurredAt: '2026-10-13T10:00:00.000Z' }] });
  assert.match(html, /<caption>Other credits \(not earned\)<\/caption>/);
  assert.match(html, /<td>Starter grant<\/td>/); assert.match(html, /<td>Faucet \(not earned\)<\/td>/); assert.match(html, /2026-10-14 UTC/);
  assert.match(html, /A starter grant is given to get you started\. It is not an earned reward\./); assert.match(html, /A test faucet is issued for testing\. It is not an earned reward\./);
  assert.match(html, /Ready to claim: 0\.00 TSR · Claimed so far: 0\.00 TSR/);
  assert.doesNotMatch(html, /<td>Earned/, 'no not-earned row carries the earned label');
  assert.doesNotMatch(section(html), forbidden, section(html));
});

test('without not-earned credits (or with the field absent) the section is unchanged', () => {
  for (const rewards of [base, { ...base, notEarned: [] }]) { const html = render(rewards); assert.doesNotMatch(html, /not earned|Starter grant/i); }
});
