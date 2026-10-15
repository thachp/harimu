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
const forbidden = /buy|bought|sell|purchase|exchange|swap|convert|cash|withdraw|price|worth|\$|kindle/i; // ARC's words plus Kindle (a reward is never linked to Kindle currency)
const sectionText = (html) => { const start = html.indexOf('<section class="wallet-rewards"'); assert.ok(start >= 0, 'rewards section rendered'); return html.slice(start, html.indexOf('</section>', start)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); };
const rewards = { claimableMinor: 50, claimedMinor: 25, claimableCount: 2, claimedCount: 1,
  claimable: [{ entryId: 'trw-20000-aaa', epochDay: 20000, amountMinor: 25 }, { entryId: 'trw-20001-bbb', epochDay: 20001, amountMinor: 25 }],
  history: [{ entryId: 'trw-19999-ccc', epochDay: 19999, amountMinor: 25, claimedAt: '2026-10-15T00:00:00.000Z' }], claim };
const render = (props) => renderToStaticMarkup(createElement(WalletPanel, { sparkMinor: 0, transactions: [], onClose() {}, ...props }));

test('the panel shows claimable rewards and claimed history with the earned provenance label', () => {
  const html = render({ rewards });
  assert.match(html, /<h3>Reward kiosk<\/h3>/);
  assert.match(html, /Ready to claim: 0\.50 TSR/); assert.match(html, /Claimed so far: 0\.25 TSR/);
  assert.equal((html.match(/>Claim reward<\/button>/g) ?? []).length, 2, 'one claim button per claimable entry');
  assert.match(html, /aria-label="Claim 0\.25 TSR for shift work"/);
  assert.match(html, /Earned · shift reward · 2024-10-04 UTC/); // epoch day 20000 is 2024-10-04
  assert.match(html, /<caption>Reward history<\/caption>/); assert.match(html, /Earned · shift reward<\/td>/); assert.match(html, /\+0\.25/);
  assert.match(html, /Tessera earned for settled shift work by verified citizens\./); assert.match(html, /Rewards are capped and paid only for verified work\./);
  assert.match(html, /Spark stays in the world\./);
  assert.doesNotMatch(html, /starter|faucet|Test grant/i, 'starter grants and faucet rows are never listed as earned');
});

const states = {
  'claimable and history': rewards,
  'empty': { ...rewards, claimable: [], history: [], claimableMinor: 0, claimedMinor: 0, claimableCount: 0, claimedCount: 0 },
  'history only': { ...rewards, claimable: [], claimableMinor: 0, claimableCount: 0 },
  'limited': { ...rewards, claimableCount: 130, claimedCount: 140, claimableMinor: 3250 },
};
test('copy guard: no buy, exchange, cash-out, convert or Kindle wording anywhere in the rendered rewards section', () => {
  for (const [name, view] of Object.entries(states)) {
    const text = sectionText(render({ rewards: view }));
    assert.doesNotMatch(text, forbidden, `${name}: ${text}`);
  }
  for (const line of ['Tessera earned for settled shift work by verified citizens.', 'Rewards are capped and paid only for verified work.']) assert.ok(line.length < 80);
});

test('the copy guard catches wording injected into the section (so it is a real guard)', () => {
  for (const bad of ['Exchange Spark for TSR here.', 'You can cash out your TSR.', 'Buy Tessera.', 'Link to your Kindle wallet.', 'Withdraw to your account.']) {
    const html = render({ rewards }).replace('Spark stays in the world.', bad);
    assert.match(sectionText(html), forbidden, bad);
  }
});

test('no purchase, exchange or cash-out control: the only button in the section is the claim button', () => {
  const html = render({ rewards });
  const section = html.slice(html.indexOf('<section class="wallet-rewards"'), html.indexOf('</section>', html.indexOf('<section class="wallet-rewards"')));
  const buttons = [...section.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map(match => match[1].replace(/<[^>]+>/g, ''));
  assert.deepEqual(buttons, ['Claim reward', 'Claim reward']);
});

test('flag off: with no rewards prop the wallet panel renders no reward section; the empty state is plain', () => {
  assert.doesNotMatch(render({}), /Reward kiosk|wallet-rewards/);
  const empty = render({ rewards: { ...rewards, claimable: [], history: [], claimableMinor: 0, claimedMinor: 0, claimableCount: 0, claimedCount: 0 } });
  assert.match(empty, /No rewards yet\. Rewards appear here after verified work earns them\./); assert.doesNotMatch(empty, /<caption>/);
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
