'use client';

import { X } from '@phosphor-icons/react';
import { useState } from 'react';
import { formatMinor, quoteTessera, summarizeWallet, walletHistoryLimit, type WalletTransaction } from '@/lib/wallet';

export type WalletPanelProps = {
  sparkMinor?: number;
  tesseraMinor?: number;
  transactions?: WalletTransaction[];
  /** #210: Clearing House kiosk. Resolves to an error message, or null on success. Omitted while the kiosk is closed. */
  onBuyTessera?: (tesseraMinor: number) => Promise<string | null>;
  onClose: () => void;
};

/** Kindle citizen wallet: SPK + TSR balances, the SPK→TSR quote and recent movements (issue #39). */
export const kioskOffers = [100, 500, 2500]; // 1, 5 and 25 TSR; 4 SPK per TSR at the official rate

export function WalletPanel({ sparkMinor, tesseraMinor = 0, transactions, onBuyTessera, onClose }: WalletPanelProps) {
  const [kiosk, setKiosk] = useState<{ pending: boolean; message: string | null }>({ pending: false, message: null });
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
        {onBuyTessera ? <section className="wallet-kiosk" aria-label="Clearing House kiosk">
          <h3>Clearing House kiosk</h3>
          <p>Buy Tessera with Spark at the official rate. No fee in this preview.</p>
          <div>{kioskOffers.map(offer => { const cost = Math.ceil(offer / wallet.quote.rate); return <button key={offer} type="button"
            disabled={kiosk.pending || cost > wallet.sparkMinor} title={cost > wallet.sparkMinor ? `Needs ${formatMinor(cost)} SPK` : undefined}
            onClick={async () => { setKiosk({ pending: true, message: null }); const error = await onBuyTessera(offer); setKiosk({ pending: false, message: error ?? `Bought ${formatMinor(offer)} TSR for ${formatMinor(cost)} SPK.` }); }}>
            Buy {formatMinor(offer)} TSR · {formatMinor(cost)} SPK</button>; })}</div>
          {kiosk.message && <p role="status">{kiosk.message}</p>}
        </section> : <p><small>The Clearing House kiosk is not open yet.</small></p>}
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
