'use client';
import { useState } from 'react';
import type { Economy } from '@/lib/economy';
import { parseSparkPrice, type PlayerCommand, type PlayerMarketState } from '@/lib/player-market';

export function PlayerMarket({ state, economy, demo, busy, uncertain, onCommand, onRetry }: {
  state: PlayerMarketState | null; economy: Economy | null; demo: boolean;
  busy: boolean; uncertain: boolean;
  onCommand: (command: Omit<PlayerCommand, 'requestId'>) => void; onRetry: () => void;
}) {
  const [item, setItem] = useState('food');
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState('1.00');
  const unitMinor = parseSparkPrice(price);
  const owned = economy?.inventory.find((entry) => entry.item === item)?.quantity ?? 0;
  const valid = Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10 && unitMinor !== null;
  const mine = state?.listings.filter((lot) => lot.mine) ?? [];
  const others = state?.listings.filter((lot) => !lot.mine && lot.status === 'open') ?? [];
  return <section className="citizen-market player-market" aria-label="Player-to-player Kindle market">
    <h3>Kindle citizen listings</h3>
    <p>Real citizen-owned goods · whole lots only. Listing goods are reserved until sold or cancelled. No simulated buyers or automatic matching.</p>
    {demo ? <p>Player trading requires signed-in citizens. This browser-local demo cannot trade with other players.</p> : <>
      {!state?.available && <p>Kindle citizenship is required to list or buy. You can still cancel your own open listings.</p>}
      {uncertain && <div role="alert"><p>Confirm the previous listing action before starting another.</p>
        <button type="button" disabled={busy} onClick={onRetry}>Retry previous listing action</button></div>}
      <form onSubmit={(event) => { event.preventDefault(); if (valid) onCommand({ action: 'create-listing', item, quantity, unitMinor: unitMinor! }); }}>
        <label>Good to list <select aria-label="Good to list" value={item} onChange={(event) => setItem(event.target.value)} disabled={busy || uncertain}>
          <option value="food">Food</option><option value="materials">Materials</option><option value="knowledge">Knowledge</option>
        </select></label>
        <label>Lot quantity <input aria-label="Lot quantity" type="number" min={1} max={10} step={1}
          value={Number.isNaN(quantity) ? '' : quantity} onChange={(event) => setQuantity(event.target.valueAsNumber)} disabled={busy || uncertain} /></label>
        <label>Price per good (SPK) <input aria-label="Price per good (SPK)" inputMode="decimal" value={price}
          onChange={(event) => setPrice(event.target.value)} disabled={busy || uncertain} /></label>
        <small>{owned} available · 0.01–10.00 SPK per good · at most five open lots</small>
        <button type="submit" disabled={busy || uncertain || !state?.available || !valid || quantity > owned || mine.filter((lot) => lot.status === 'open').length >= 5}>
          Reserve goods and list{valid ? ` · ${((unitMinor! * quantity) / 100).toFixed(2)} SPK total` : ''}
        </button>
      </form>
      <h4>Your listings</h4>
      {!mine.length && <p>No listings yet. Reserved goods leave your available inventory.</p>}
      {mine.map((lot) => <article key={lot.id}>
        <strong>{lot.quantity} {lot.item} · {((lot.quantity * lot.unitMinor) / 100).toFixed(2)} SPK</strong>
        <small>{lot.status === 'open' ? 'Open · goods reserved' : lot.status === 'sold' ? 'Sold · payment settled' : 'Cancelled · goods returned'}</small>
        {lot.status === 'open' && <button type="button" disabled={busy || uncertain}
          onClick={() => onCommand({ action: 'cancel-listing', listingId: lot.id })}>Cancel listing and reclaim goods</button>}
      </article>)}
      <h4>Other citizens’ offers</h4>
      {!others.length && <p>No player offers yet. The simulated merchant remains available separately.</p>}
      {others.map((lot) => <article key={lot.id}>
        <strong>{lot.quantity} {lot.item} · {((lot.quantity * lot.unitMinor) / 100).toFixed(2)} SPK total</strong>
        <small>Kindle citizen · whole lot · {((lot.unitMinor) / 100).toFixed(2)} SPK per good</small>
        <button type="button" disabled={busy || uncertain || !state?.available || (economy?.walletMinor ?? 0) < lot.unitMinor * lot.quantity}
          onClick={() => onCommand({ action: 'buy-listing', listingId: lot.id })}>Buy whole lot · {((lot.quantity * lot.unitMinor) / 100).toFixed(2)} SPK</button>
      </article>)}
      <small>Showing your latest 20 listings and up to 40 recent public offers. Refresh the citizen account for new offers.</small>
    </>}
  </section>;
}
