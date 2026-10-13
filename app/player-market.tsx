'use client';
import { useState } from 'react';
import { ActionButton } from './action-button';
import { firstActionReason, pendingActionReason } from '@/lib/action-reasons';
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
  const waiting = pendingActionReason(busy, uncertain);
  const mine = state?.listings.filter((lot) => lot.mine) ?? [];
  const others = state?.listings.filter((lot) => !lot.mine && lot.status === 'open') ?? [];
  return <section className="citizen-market player-market" aria-label="Player-to-player Kindle market">
    <h3>Kindle citizen listings</h3>
    <p>Real citizen-owned goods · whole lots only. Listing goods are reserved until sold or cancelled. No simulated buyers or automatic matching.</p>
    {demo ? <p>Player trading requires signed-in citizens. This browser-local demo cannot trade with other players.</p> : <>
      {!state?.available && <p>Kindle citizenship is required to list or buy. You can still cancel your own open listings.</p>}
      {uncertain && <div role="alert"><p>Confirm the previous listing action before starting another.</p>
        <ActionButton type="button" reason={pendingActionReason(busy)} onClick={onRetry}>Retry previous listing action</ActionButton></div>}
      {waiting && <p id="listing-edit-reason" role="status">{waiting}</p>}
      <form onSubmit={(event) => { event.preventDefault(); if (!waiting && state?.available && valid && quantity <= owned && mine.filter((lot) => lot.status === 'open').length < 5) onCommand({ action: 'create-listing', item, quantity, unitMinor: unitMinor! }); }}>
        <label>Good to list <select aria-label="Good to list" value={item} onChange={(event) => { if (!waiting) setItem(event.target.value); }} disabled={busy || uncertain} aria-describedby={waiting ? "listing-edit-reason" : undefined}>
          <option value="food">Food</option><option value="materials">Materials</option><option value="knowledge">Knowledge</option>
        </select></label>
        <label>Lot quantity <input aria-label="Lot quantity" type="number" min={1} max={10} step={1}
          value={Number.isNaN(quantity) ? '' : quantity} onChange={(event) => { if (!waiting) setQuantity(event.target.valueAsNumber); }} disabled={busy || uncertain} aria-describedby={waiting ? "listing-edit-reason" : undefined} /></label>
        <label>Price per good (SPK) <input aria-label="Price per good (SPK)" inputMode="decimal" value={price}
          onChange={(event) => { if (!waiting) setPrice(event.target.value); }} disabled={busy || uncertain} aria-describedby={waiting ? "listing-edit-reason" : undefined} /></label>
        <small>{owned} available · 0.01–10.00 SPK per good · at most five open lots</small>
        <ActionButton type="submit" reason={waiting ?? firstActionReason([!state?.available, 'Kindle citizenship is required to list goods.'], [!valid, 'Enter 1–10 whole goods and a price from 0.01 to 10.00 SPK.'], [quantity > owned, 'You do not have enough available goods for this lot.'], [mine.filter((lot) => lot.status === 'open').length >= 5, 'Five lots are already open. Sell or cancel one first.'])}>
          Reserve goods and list{valid ? ` · ${((unitMinor! * quantity) / 100).toFixed(2)} SPK total` : ''}
        </ActionButton>
      </form>
      <h4>Your listings</h4>
      {!mine.length && <p>No listings yet. Reserved goods leave your available inventory.</p>}
      {mine.map((lot) => <article key={lot.id}>
        <strong>{lot.quantity} {lot.item} · {((lot.quantity * lot.unitMinor) / 100).toFixed(2)} SPK</strong>
        <small>{lot.status === 'open' ? 'Open · goods reserved' : lot.status === 'sold' ? 'Sold · payment settled' : 'Cancelled · goods returned'}</small>
        {lot.status === 'open' && <ActionButton type="button" reason={waiting}
          onClick={() => onCommand({ action: 'cancel-listing', listingId: lot.id })}>Cancel listing and reclaim goods</ActionButton>}
      </article>)}
      <h4>Other citizens’ offers</h4>
      {!others.length && <p>No player offers yet. The simulated merchant remains available separately.</p>}
      {others.map((lot) => <article key={lot.id}>
        <strong>{lot.quantity} {lot.item} · {((lot.quantity * lot.unitMinor) / 100).toFixed(2)} SPK total</strong>
        <small>Kindle citizen · whole lot · {((lot.unitMinor) / 100).toFixed(2)} SPK per good</small>
        <ActionButton type="button" reason={waiting ?? firstActionReason([!state?.available, 'Kindle citizenship is required to buy goods.'], [(economy?.walletMinor ?? 0) < lot.unitMinor * lot.quantity, 'You do not have enough Sparks to buy this whole lot.'])}
          onClick={() => onCommand({ action: 'buy-listing', listingId: lot.id })}>Buy whole lot · {((lot.quantity * lot.unitMinor) / 100).toFixed(2)} SPK</ActionButton>
      </article>)}
      <small>Showing your latest 20 listings and up to 40 recent public offers. Refresh the citizen account for new offers.</small>
    </>}
  </section>;
}
