'use client';

import { X } from '@phosphor-icons/react';
import { formatMinor, quoteTessera, summarizeWallet, walletHistoryLimit, type WalletTransaction } from '@/lib/wallet';

export type WalletPanelProps = {
  sparkMinor?: number;
  tesseraMinor?: number;
  transactions?: WalletTransaction[];
  onClose: () => void;
};

/** Kindle citizen wallet: SPK + TSR balances, the SPK→TSR quote and recent movements (issue #39). */
export function WalletPanel({ sparkMinor, tesseraMinor = 0, transactions, onClose }: WalletPanelProps) {
  const wallet = sparkMinor === undefined ? null : summarizeWallet(sparkMinor, transactions ?? [], tesseraMinor);
  return <div className="wallet-panel-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="wallet-panel" role="dialog" aria-modal="true" aria-labelledby="wallet-panel-title" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
      <header><h2 id="wallet-panel-title">Wallet</h2><button type="button" aria-label="Close wallet" onClick={onClose} autoFocus><X size={16} /></button></header>
      {!wallet ? <p role="status">Loading your citizen snapshot…</p> : <>
        <dl className="wallet-balances">
          <div><dt>Spark (SPK) · home currency</dt><dd>{formatMinor(wallet.sparkMinor)} SPK</dd></div>
          <div><dt>Tessera (TSR)</dt><dd>{formatMinor(wallet.tesseraMinor)} TSR</dd></div>
        </dl>
        <p className="wallet-quote">1 SPK = {wallet.quote.rate.toFixed(2)} TSR · your SPK ≈ {formatMinor(quoteTessera(wallet.sparkMinor))} TSR<br />
          <small>Read-only quote, {wallet.quote.source}. Currency exchange is not available yet.</small></p>
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
