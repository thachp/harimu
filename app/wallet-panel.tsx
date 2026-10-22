'use client';

import { X } from '@phosphor-icons/react';
import { useState } from 'react';
import { formatMinor, quoteTessera, summarizeWallet, walletHistoryLimit, type WalletTransaction } from '@/lib/wallet';
import { kioskClaim, kioskClaimable, kioskHistory, kioskLabels, kioskNationVoice, kioskNotes } from '@/lib/reward-kiosk-copy';
import { kioskBuyLabel, kioskClosed, kioskComingSoon, kioskExplainer, kioskHeader, kioskRateLine, kioskReceipt, spk } from '@/lib/kiosk-text';

export type WalletPanelProps = {
  sparkMinor?: number;
  tesseraMinor?: number;
  transactions?: WalletTransaction[];
  /** #210: Clearing House kiosk. Resolves to an error message, or null on success. Omitted while the kiosk is closed. */
  onBuyTessera?: (tesseraMinor: number) => Promise<string | null>;
  /** #631: preview-only TEST faucet; omitted unless the server says it is available. claim resolves to an error message, or null on success. */
  testFaucet?: { grantMinor: number; granted: boolean; claim: () => Promise<string | null> };
  /** #466: earned-Tessera reward kiosk; omitted unless the server answers (HARIMU_TESSERA_REWARDS_ENABLED off is a 404, so nothing shows). claim resolves to an error message, or null on success. */
  rewards?: WalletRewards;
  onClose: () => void;
};

/** Kindle citizen wallet: SPK + TSR balances, the SPK→TSR quote and recent movements (issue #39). */
export const kioskOffers = [100, 500, 2500]; // 1, 5 and 25 TSR; 4 SPK per TSR at the official rate

function WalletKiosk({ sparkMinor, rate, onBuyTessera }: { sparkMinor: number; rate: number; onBuyTessera: (tesseraMinor: number) => Promise<string | null> }) {
  const [kiosk, setKiosk] = useState<{ pending: boolean; message: string | null }>({ pending: false, message: null });
  return <section className="wallet-kiosk" aria-label={kioskHeader}>
    <h3>{kioskHeader}</h3>
    <p>{kioskExplainer}</p>
    <p>{kioskRateLine(rate)}</p>
    <div>{kioskOffers.map(offer => { const cost = Math.ceil(offer / rate); return <button key={offer} type="button"
      disabled={kiosk.pending || cost > sparkMinor} title={cost > sparkMinor ? `Needs ${spk(cost)}` : undefined}
      onClick={async () => { setKiosk({ pending: true, message: null }); const error = await onBuyTessera(offer); setKiosk({ pending: false, message: error ?? kioskReceipt(offer, cost) }); }}>
      {kioskBuyLabel(offer)} <small>· {spk(cost)}</small></button>; })}</div>
    {kiosk.message && <p role="status">{kiosk.message}</p>}
    <p><small>{kioskComingSoon}</small></p>
  </section>;
}

const testFaucetLabel = 'Test faucet, preview only'; // the same text as lib/test-faucet.ts (a test pins them equal; the panel stays free of server-lib imports)
/** #631: clearly a test tool, not the Clearing House: its own section, labeled "Test faucet, preview only". */
function WalletTestFaucet({ grantMinor, granted, claim }: NonNullable<WalletPanelProps['testFaucet']>) {
  const [state, setState] = useState<{ pending: boolean; done: boolean; message: string | null }>({ pending: false, done: false, message: null });
  return <section className="wallet-test-faucet" aria-label={testFaucetLabel}>
    <h3>{testFaucetLabel}</h3>
    <p><small>Test tool for the preview world only. It pays {formatMinor(grantMinor)} TSR once per citizen and cannot be cashed out or exchanged.</small></p>
    <button type="button" disabled={state.pending || state.done || granted} onClick={async () => { setState({ pending: true, done: false, message: null }); const error = await claim(); setState({ pending: false, done: error === null, message: error ?? `Test grant received: ${formatMinor(grantMinor)} TSR.` }); }}>
      Get {formatMinor(grantMinor)} test TSR</button>
    {(granted || state.message) && <p role="status">{state.message ?? 'This citizen already took the test grant.'}</p>}
  </section>;
}

export type WalletRewardRow = { entryId: string; epochDay: number; amountMinor: number; claimedAt?: string };
export type WalletNotEarnedRow = { id: string; provenance: 'starter_grant' | 'faucet'; amountMinor: number; occurredAt: string };
export type WalletRewards = { claimable: WalletRewardRow[]; history: WalletRewardRow[]; notEarned?: WalletNotEarnedRow[]; claimableMinor: number; claimedMinor: number; claimableCount: number; claimedCount: number; claim: (entryId: string) => Promise<string | null> };
const rewardVoice = kioskNationVoice.kindle; // the wallet is Kindle-only (page.tsx); every line below is from Content's lib/reward-kiosk-copy.ts (#535)
const rewardsLineWork = 'Tessera earned for settled shift work by verified citizens.'; // ARC's two lines (each under 80 characters); no buy, exchange or cash-out wording, even as a negation
const rewardsLineCaps = 'Rewards are capped and paid only for verified work.';
const rewardDay = (epochDay: number) => new Date(epochDay * 86400000).toISOString().slice(0, 10);
const rewardWork = 'shift work';
const fillReward = (text: string, minor: number) => text.replace('{reward}', `${formatMinor(minor)} TSR`).replace('{work}', rewardWork);
/** #466: starter grants and test faucet credits get their own labels (Content #535) and sit apart; they are never in the earned totals. */
const notEarnedLabel = { starter_grant: kioskLabels.starterGrant, faucet: kioskLabels.faucet } as const;
const notEarnedHelp = { starter_grant: kioskLabels.starterGrantHelp.text, faucet: kioskLabels.faucetHelp.text } as const;
/** #466: every earned row here is provenance "earned" (a settled shift reward). Starter grants and the test faucet are never listed or counted here. */
function WalletRewardKiosk({ claimable, history, notEarned = [], claimableMinor, claimedMinor, claimableCount, claimedCount, claim }: WalletRewards) {
  const [state, setState] = useState<{ pending: string | null; message: string | null }>({ pending: null, message: null });
  const more = (shown: number, total: number) => total > shown ? <small>Showing the newest {shown} of {total}.</small> : null;
  const earned = `${kioskLabels.earned} · shift reward`;
  return <section className="wallet-rewards" aria-label={rewardVoice.title}>
    <h3>{rewardVoice.title}</h3>
    <p><small>{rewardsLineWork}</small><br /><small>{rewardsLineCaps}</small></p>
    <p><small>{kioskNotes.sparkStays.text}</small></p>
    <p>{kioskClaimable.label}: {formatMinor(claimableMinor)} TSR · Claimed so far: {formatMinor(claimedMinor)} TSR</p>
    {claimable.length === 0 && history.length === 0 ? <p><small>{kioskHistory.empty.text}</small></p> : claimable.length === 0 ? <p><small>Nothing is waiting to be claimed.</small></p> : <ul>{claimable.map((row) => <li key={row.entryId}>
      <span>{earned} · {rewardDay(row.epochDay)} UTC</span>
      <button type="button" aria-label={fillReward(kioskClaimable.claimAccessibleName.text, row.amountMinor)} disabled={state.pending !== null} onClick={async () => { setState({ pending: row.entryId, message: null }); const error = await claim(row.entryId); setState({ pending: null, message: error ?? fillReward(kioskClaim.claimed.text, row.amountMinor) }); }}>{kioskClaimable.claimButton}</button></li>)}</ul>}
    {more(claimable.length, claimableCount)}
    {state.message && <p role="status">{state.message}</p>}
    {history.length > 0 && <table className="wallet-history"><caption>{kioskHistory.title}</caption><thead><tr><th scope="col">Day</th><th scope="col">Provenance</th><th scope="col">Amount (TSR)</th></tr></thead>
      <tbody>{history.map((row) => <tr key={row.entryId}><td>{rewardDay(row.epochDay)} UTC</td><td>{earned}</td><td className="wallet-credit">{formatMinor(row.amountMinor, true)}</td></tr>)}</tbody></table>}
    {more(history.length, claimedCount)}
    {notEarned.length > 0 && <>
      <table className="wallet-history wallet-not-earned"><caption>Other credits (not earned)</caption><thead><tr><th scope="col">Day</th><th scope="col">Provenance</th><th scope="col">Amount (TSR)</th></tr></thead>
        <tbody>{notEarned.map((row) => <tr key={row.id}><td>{row.occurredAt.slice(0, 10)} UTC</td><td>{notEarnedLabel[row.provenance]}</td><td>{formatMinor(row.amountMinor, true)}</td></tr>)}</tbody></table>
      {[...new Set(notEarned.map(row => row.provenance))].map(kind => <p key={kind}><small>{notEarnedHelp[kind]}</small></p>)}
    </>}
  </section>;
}

export function WalletPanel({ sparkMinor, tesseraMinor = 0, transactions, onBuyTessera, testFaucet, rewards, onClose }: WalletPanelProps) {
  const wallet = sparkMinor === undefined ? null : summarizeWallet(sparkMinor, transactions ?? [], tesseraMinor);
  return <div className="wallet-panel-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="wallet-panel" role="dialog" aria-modal="true" aria-labelledby="wallet-panel-title" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); else if (event.key === 'Tab') { event.preventDefault(); (event.currentTarget.querySelector('button') as HTMLButtonElement | null)?.focus(); } }}>
      <header><h2 id="wallet-panel-title">Wallet</h2><button type="button" aria-label="Close wallet" onClick={onClose} autoFocus><X size={16} /></button></header>
      {!wallet ? <p role="status">Loading your citizen snapshot…</p> : <>
        <dl className="wallet-balances">
          <div><dt>Spark (SPK) · home currency</dt><dd>{formatMinor(wallet.sparkMinor)} SPK</dd></div>
          <div><dt>Tessera (TSR)</dt><dd>{formatMinor(wallet.tesseraMinor)} TSR</dd></div>
        </dl>
        <p className="wallet-quote">1 SPK = {wallet.quote.rate.toFixed(2)} TSR · your SPK ≈ {formatMinor(quoteTessera(wallet.sparkMinor))} TSR<br />
          <small>Official rate, {wallet.quote.source}.</small></p>
        {onBuyTessera ? <WalletKiosk sparkMinor={wallet.sparkMinor} rate={wallet.quote.rate} onBuyTessera={onBuyTessera} /> : <p><small>{kioskClosed}</small></p>}
        {testFaucet && <WalletTestFaucet {...testFaucet} />}
        {rewards && <WalletRewardKiosk {...rewards} />}
        <h3>Recent transactions</h3>
        {wallet.transactions.length === 0 ? <p>No wages, purchases or fees recorded yet.</p> :
          <table className="wallet-history"><thead><tr><th scope="col">Date</th><th scope="col">Reason</th><th scope="col">Amount (SPK)</th></tr></thead>
            <tbody>{wallet.transactions.map((entry) => <tr key={entry.id}>
              <td><time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString()}</time></td>
              <td>{entry.reason}</td>
              <td className={entry.amountMinor < 0 ? 'wallet-debit' : 'wallet-credit'}>{formatMinor(entry.amountMinor, true)}</td>
            </tr>)}</tbody></table>}
        <small>Showing up to {walletHistoryLimit} most recent movements. Balances come from the server ledger.</small>
      </>}
    </section>
  </div>;
}
export default WalletPanel;
