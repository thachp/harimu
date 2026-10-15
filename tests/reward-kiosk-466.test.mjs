// #466: the earned-reward kiosk panel (earn-only; flag-gated by the route answering 404, so the panel is simply absent when the flag is off).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { loadApp } from './helpers/component-module.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const { WalletPanel } = await loadApp('wallet-panel');
const claim = async () => null;
const rewards = { claimableMinor: 50, claimedMinor: 25, claimableCount: 2, claimedCount: 1,
  claimable: [{ entryId: 'trw-20000-aaa', epochDay: 20000, amountMinor: 25 }, { entryId: 'trw-20001-bbb', epochDay: 20001, amountMinor: 25 }],
  history: [{ entryId: 'trw-19999-ccc', epochDay: 19999, amountMinor: 25, claimedAt: '2026-10-15T00:00:00.000Z' }], claim };
const render = (props) => renderToStaticMarkup(createElement(WalletPanel, { sparkMinor: 0, transactions: [], onClose() {}, ...props }));

test('the panel shows claimable rewards and claimed history with the earned provenance label', () => {
  const html = render({ rewards });
  assert.match(html, /Earned Tessera rewards/);
  assert.match(html, /Ready to claim: 0\.50 TSR/); assert.match(html, /Claimed so far: 0\.25 TSR/);
  assert.equal((html.match(/Claim 0\.25 TSR/g) ?? []).length, 2, 'one claim button per claimable entry');
  assert.match(html, /Earned · shift reward · 2024-10-04 UTC/); // epoch day 20000 is 2024-10-04
  assert.match(html, /<caption>Claimed rewards<\/caption>/); assert.match(html, /Earned · shift reward<\/td>/); assert.match(html, /\+0\.25/);
  assert.doesNotMatch(html, /starter|faucet grant|Test grant/i, 'starter grants and faucet rows are never listed as earned');
});

test('the copy says earn-only and the panel has no purchase, exchange or cash-out control', () => {
  const html = render({ rewards });
  assert.match(html, /earn-only: it cannot be bought with Spark, exchanged or cashed out/);
  const buttons = [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(match => match[1].replace(/<[^>]+>/g, ''));
  for (const label of buttons) assert.doesNotMatch(label, /buy|exchange|cash|withdraw|convert|swap/i, label);
  assert.ok(buttons.some(label => /^Claim 0\.25 TSR$/.test(label)));
});

test('flag off: with no rewards prop the wallet panel renders no reward section; the empty state is plain', () => {
  assert.doesNotMatch(render({}), /Earned Tessera rewards|wallet-rewards/);
  const empty = render({ rewards: { ...rewards, claimable: [], history: [], claimableMinor: 0, claimedMinor: 0, claimableCount: 0, claimedCount: 0 } });
  assert.match(empty, /No unclaimed rewards yet\./); assert.doesNotMatch(empty, /<table[^>]*><caption>Claimed rewards/);
});

test('a limited list says it is limited while the totals stay complete', () => {
  const html = render({ rewards: { ...rewards, claimableCount: 130, claimableMinor: 3250 } });
  assert.match(html, /Ready to claim: 32\.50 TSR/); assert.match(html, /Showing the newest 2 of 130\./);
});

test('wiring: the page asks the flag-gated route only while the wallet is open, and the new code never touches the exchange', async () => {
  const page = await read('app/page.tsx');
  assert.match(page, /fetch\('\/api\/tessera\/rewards'\)/); assert.match(page, /rewards=\{rewardsView \? \{ \.\.\.rewardsView, claim: claimReward \} : undefined\}/);
  assert.match(page, /action: 'claim', entryId, requestId: crypto\.randomUUID\(\)/);
  for (const file of ['app/wallet-panel.tsx', 'lib/tessera-rewards.ts', 'lib/tessera-rewards-rules.ts', 'app/api/tessera/rewards/route.ts']) assert.doesNotMatch(await read(file), /tessera-exchange|buy-tessera/, file);
  const panel = await read('app/wallet-panel.tsx'), kiosk = panel.slice(panel.indexOf('function WalletRewardKiosk'), panel.indexOf('export function WalletPanel'));
  assert.doesNotMatch(kiosk, /onBuyTessera|kiosk-text|sparkMinor/);
  for (const file of ['wrangler.jsonc', 'wrangler.prod.jsonc']) assert.match(await read(file), /"HARIMU_TESSERA_REWARDS_ENABLED":\s*"false"/, `${file} keeps the rewards flag off`);
});
