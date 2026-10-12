'use client';
import { useEffect, useState } from 'react';
import type { Economy } from '@/lib/economy';
import type { MarketState } from '@/lib/market';

export function CitizenMarket({ market, economy, capacity, busy, uncertain, onTrade, onMeal, onRetry }: {
  market: MarketState | null; economy: Economy | null; capacity: number;
  busy: boolean; uncertain: boolean;
  onTrade: (side: 'buy' | 'sell', item: string, quantity: number) => void;
  onMeal: () => void; onRetry: () => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (!market?.available || !economy) return null;
  const count = (item: string) => economy.inventory.find((entry) => entry.item === item)?.quantity ?? 0;
  const ready = !market.mealReadyAt || (now > 0 && Date.parse(market.mealReadyAt) <= now);
  const mealInterval = market.mealIntervalSeconds >= 3600 ? `${market.mealIntervalSeconds / 3600} hours` : `${market.mealIntervalSeconds / 60} minutes`;
  const validQuantity = Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10;
  return <section className="citizen-market" aria-label="Kindle market and household food">
    <h3>Kindle starter market</h3>
    <p>Simulated merchant · fixed prototype prices and finite stock. Small trades only; this is not a player order book.</p>
    {uncertain && <div role="alert"><p>Connection interrupted. Confirm the previous transaction before starting another.</p>
      <button disabled={busy} type="button" onClick={onRetry}>Retry previous transaction</button></div>}
    <label>Goods per trade <input aria-label="Goods per trade" type="number" min={1} max={10} step={1}
      value={Number.isNaN(quantity) ? '' : quantity} disabled={busy || uncertain}
      onChange={(event) => setQuantity(event.target.valueAsNumber)} /></label>
    <div className="market-quotes">
      {market.quotes.map((quote) => <article key={quote.item}>
        <strong>{quote.label}</strong><small>{quote.stock} at merchant · {count(quote.item)} owned</small>
        <div>
          <button type="button" disabled={busy || uncertain || !validQuantity || quote.stock < quantity || economy.walletMinor < quote.buyMinor * quantity}
            onClick={() => onTrade('buy', quote.item, quantity)}>
            Buy {validQuantity ? quantity : ''} · {((quote.buyMinor * (validQuantity ? quantity : 1)) / 100).toFixed(2)} SPK
          </button>
          <button type="button" disabled={busy || uncertain || !validQuantity || count(quote.item) < quantity || market.merchantCashMinor < quote.sellMinor * quantity}
            onClick={() => onTrade('sell', quote.item, quantity)}>
            Sell {validQuantity ? quantity : ''} · {((quote.sellMinor * (validQuantity ? quantity : 1)) / 100).toFixed(2)} SPK
          </button>
        </div>
      </article>)}
    </div>
    <h3>Household meal</h3>
    <p>{market.mealFood} food → up to {market.mealCapacity} WC, capped at 24. Once every {mealInterval}; your normal capacity recovery continues while away.</p>
    <p>{!ready ? `Next meal: ${new Date(market.mealReadyAt!).toLocaleString()}`
      : capacity >= 24 ? 'Capacity full · save your food for later.'
        : count('food') < market.mealFood ? 'Not enough food · harvest or buy food at the market.' : 'Meal available · feed your household to recover capacity.'}</p>
    <button type="button" disabled={busy || uncertain || !ready || capacity >= 24 || count('food') < market.mealFood}
      onClick={onMeal}>Prepare household meal · {market.mealFood} food</button>
    <small>Two starter food are granted once per Kindle account. Meals and prices are prototype assumptions.</small>
  </section>;
}
