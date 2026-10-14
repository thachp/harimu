'use client';
import {useDisplayTimestamp} from './display-preferences';
import { disabledReasonProps } from '@/lib/action-reasons';
import { GameTimer } from './game-timer';
import { useEffect, useState } from 'react';
import type { Economy } from '@/lib/economy';
import type { MarketState } from '@/lib/market';

export function CitizenMarket({ market, economy, capacity, busy, uncertain, pendingAction, onTrade, onMeal, onRetry, showMeal = true, showTrading = true }: {
  market: MarketState | null; economy: Economy | null; capacity: number;
  busy: boolean; uncertain: boolean; pendingAction?: 'household-meal' | 'market-trade'; showMeal?: boolean; showTrading?: boolean;
  onTrade: (side: 'buy' | 'sell', item: string, quantity: number) => void;
  onMeal: () => void; onRetry: () => void;
}) {
  const formatTime=useDisplayTimestamp();
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
  const mealInterval = market.mealIntervalSeconds >= 3600 ? `${market.mealIntervalSeconds / 3600} real hours · ${market.mealIntervalSeconds / 300} game hours` : `${market.mealIntervalSeconds / 60} real minutes · ${market.mealIntervalSeconds / 5} game minutes`;
  const validQuantity = Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 10;
  const quantityError = validQuantity ? null : 'Enter a whole number from 1 to 10.';
  const tradeCommonReason = busy ? 'An action is being saved. Please wait.' : uncertain ? 'Confirm your previous transaction first.' : quantityError;
  const tradeCommonId = busy || uncertain ? 'trade-action-reason' : 'trade-quantity-error';
  const mealReason = busy ? 'An action is being saved. Please wait.' : uncertain ? 'Confirm your previous action first.' : capacity >= 24 ? 'Capacity is full. Save your food for later.' : count('food') < market.mealFood ? `You need ${market.mealFood} food. Harvest or buy food at the market.` : !ready ? 'Wait until the next meal time shown above.' : null;
  return <section id="citizen-simulated-market" className="citizen-market" aria-label={showTrading ? 'Kindle simulated merchant' : 'Household food and recovery'}>
    {showTrading && <><h3>Kindle starter market</h3>
    <p>Simulated merchant · fixed prototype prices and finite stock. Small trades only; this is not a player order book.</p>
    </>}
    {uncertain && !busy && <div role="alert"><p>{pendingAction === 'household-meal'
      ? 'Connection interrupted. Confirm the previous household meal before preparing another.'
      : 'Connection interrupted. Confirm the previous transaction before starting another.'}</p>
      <button type="button" onClick={() => { if (!busy) onRetry(); }}>{pendingAction === 'household-meal' ? 'Retry household meal' : 'Retry previous transaction'}</button></div>}
    {showTrading && <><label>Goods per trade <input aria-label="Goods per trade" type="number" min={1} max={10} step={1}
      aria-invalid={!validQuantity} aria-describedby={tradeCommonReason ? tradeCommonId : undefined}
      value={Number.isNaN(quantity) ? '' : quantity} disabled={busy || uncertain}
      onChange={(event) => { if (!busy && !uncertain) setQuantity(event.target.valueAsNumber); }} /></label>
    {quantityError && <p id="trade-quantity-error" role="alert">{quantityError}</p>}
    {tradeCommonReason && (busy || uncertain) && <p id="trade-action-reason" role="status">{tradeCommonReason}</p>}
    <div className="market-quotes">
      {market.quotes.map((quote) => {
        const buyReason = tradeCommonReason ?? (quote.stock < quantity ? 'The merchant does not have enough stock.' : economy.walletMinor < quote.buyMinor * quantity ? 'You do not have enough SPK for this quantity.' : null);
        const sellReason = tradeCommonReason ?? (count(quote.item) < quantity ? 'You do not own enough goods for this quantity.' : market.merchantCashMinor < quote.sellMinor * quantity ? 'The merchant cannot afford this quantity.' : null);
        const buyId = `trade-${quote.item}-buy-reason`, sellId = `trade-${quote.item}-sell-reason`;
        return <article key={quote.item}>
          <strong>{quote.label}</strong><small>{quote.stock} at merchant · {count(quote.item)} owned</small>
          <div>
            <button type="button" {...disabledReasonProps(buyReason, tradeCommonReason ? tradeCommonId : buyId)}
              onClick={() => { if (!buyReason) onTrade('buy', quote.item, quantity); }}>
              {validQuantity ? `Buy ${quantity} · ${((quote.buyMinor * quantity) / 100).toFixed(2)} SPK` : 'Buy · choose 1–10 goods'}
            </button>
            {buyReason && !tradeCommonReason && <small id={buyId}>{buyReason}</small>}
            <button type="button" {...disabledReasonProps(sellReason, tradeCommonReason ? tradeCommonId : sellId)}
              onClick={() => { if (!sellReason) onTrade('sell', quote.item, quantity); }}>
              {validQuantity ? `Sell ${quantity} · ${((quote.sellMinor * quantity) / 100).toFixed(2)} SPK` : 'Sell · choose 1–10 goods'}
            </button>
            {sellReason && !tradeCommonReason && <small id={sellId}>{sellReason}</small>}
          </div>
        </article>;
      })}
    </div>
    </>}
    {showMeal && <><h3>Household meal</h3>
    <p>{market.mealFood} food → up to {market.mealCapacity} WC, capped at 24. Once every {mealInterval}; your normal capacity recovery continues while away.</p>
    {!ready && market.householdRecord?.lastMealAt && <p>{`Your household ate on ${formatTime(market.householdRecord.lastMealAt)}${market.householdRecord.starterFoodGranted > 0 && count('food') < market.mealFood ? `, using food that included your one-time ${market.householdRecord.starterFoodGranted} starter food` : ''}. That meal started the cooldown below.`}</p>}
    <p>{!ready ? `Next meal: ${formatTime(market.mealReadyAt!)}`
      : capacity >= 24 ? 'Capacity full · save your food for later.'
        : count('food') < market.mealFood ? 'Not enough food · harvest or buy food at the market.' : 'Meal available · feed your household to recover capacity.'}</p>
    {!ready && market.mealReadyAt && <GameTimer endsAt={market.mealReadyAt} label="Next meal" />}
    <button type="button" {...disabledReasonProps(mealReason, 'household-meal-reason')}
      onClick={() => { if (!mealReason) onMeal(); }}>Prepare household meal · {market.mealFood} food</button>
    {mealReason && <small id="household-meal-reason">{mealReason}</small>}
    <details><summary>Household food records</summary>
      {market.householdRecord ? <>
        <p>{market.householdRecord.starterFoodGranted > 0
          ? `One-time starter grant recorded: ${market.householdRecord.starterFoodGranted} food. This is the original grant, not your current inventory.`
          : 'No starter food grant is recorded for this account.'}</p>
        <p>{market.householdRecord.lastMealAt
          ? `Last household meal recorded: ${formatTime(market.householdRecord.lastMealAt)}. This meal starts the cooldown shown above.`
          : 'No household meal is recorded. No meal cooldown has started.'}</p>
      </> : <p>Refresh your citizen to load the live household records. Local samples do not contain account receipts.</p>}
      <p>Current food: {count('food')}. Harvests, purchases, meals, sales and player-market reservations can change this balance. Starter food is granted only once.</p>
    </details>
    <small>Meals and prices are prototype assumptions.</small>
    </>}
  </section>;
}
