'use client';

import { useEffect, useState } from 'react';
import type { Economy } from '@/lib/economy';
import type { MarketState } from '@/lib/market';
import type { WorkShift } from '@/lib/work-shifts';
import type { SceneView } from '@/lib/scene-navigation';
import { nextDailyAction } from './daily-loop-choice';

type Job = { id: string; name: string; cost: number; detail: string };
export function DailyLoop({ nationName, supported, localDemo, view, economy, market, shifts, capacity,
  jobs, busy, uncertain, onNavigate, onStart, onClaim, onBuyFood, onMeal, onRefresh }: {
  nationName: string; supported: boolean; localDemo: boolean; view: SceneView;
  economy: Economy | null; market: MarketState | null; shifts: WorkShift[]; capacity: number;
  jobs: Job[]; busy: boolean; uncertain: boolean;
  onNavigate: (view: SceneView) => void; onStart: (id: string) => void; onClaim: (id: string) => void;
  onBuyFood: (quantity: number) => void; onMeal: () => void; onRefresh: () => void;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now()); update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const active = shifts.find(shift => !shift.claimedAt);
  const shiftHours = active ? (Date.parse(active.completesAt) - Date.parse(active.startedAt)) / 3600000 : NaN;
  const shiftDuration = Number.isFinite(shiftHours) && shiftHours > 0 ? `${Number(shiftHours.toFixed(2))} real hours` : 'real time';
  const collected = shifts.some(shift => Boolean(shift.claimedAt));
  const food = economy?.inventory.find(item => item.item === 'food')?.quantity ?? 0;
  const mealFood = market?.mealFood ?? 2;
  const quote = market?.quotes.find(item => item.item === 'food');
  const quantity = Math.min(10, Math.max(1, mealFood - food));
  const canBuy = Boolean(market?.available && quote && economy && quote.stock >= quantity && economy.walletMinor >= quote.buyMinor * quantity);
  const mealReady = Boolean(market?.available && food >= mealFood && capacity < 24 && now > 0
    && (!market.mealReadyAt || Date.parse(market.mealReadyAt) <= now));
  const firstJob = jobs.find(job => job.id === 'harvest' && capacity >= job.cost) ?? jobs.find(job => capacity >= job.cost);
  const readyToCollect = Boolean(active && now > 0 && Date.parse(active.completesAt) <= now);
  const nextAction = nextDailyAction({ supported, economyLoaded: Boolean(economy), activeShift: Boolean(active),
    collected, readyToCollect, food, mealFood, canBuy, mealReady, eligibleJob: Boolean(firstJob) });
  let title = 'Check your citizen account';
  let detail = 'Refresh to load your current balances and available actions.';
  let label = 'Refresh citizen';
  let action = onRefresh;
  if (supported && economy) {
    if ((nextAction === 'collect' || nextAction === 'waiting') && active) {
      title = readyToCollect ? 'Your wages and goods are ready' : `${active.orderName} is underway`;
      detail = readyToCollect ? 'Collect the agreed reward once, then take your earnings to market.'
        : now ? `About ${Math.max(1, Math.ceil((Date.parse(active.completesAt) - now) / 60000))} minutes remain. Your shift continues while you are away.` : 'Checking the shift timer…';
      label = readyToCollect && view === 'workplace' ? 'Collect wages and goods' : 'Open work board';
      action = readyToCollect && view === 'workplace' ? () => onClaim(active.id) : () => onNavigate('workplace');
    } else if (nextAction === 'first-work' && firstJob) {
      title = collected ? 'Earn your next wages and goods' : 'Start your first paid shift';
      detail = `${firstJob.name} · ${firstJob.cost} WC. Check the agreed duration and reward on the work board; collect when its timer finishes.`;
      label = view === 'workplace' ? `Start ${firstJob.name}` : 'Choose a paid shift';
      action = view === 'workplace' ? () => onStart(firstJob.id) : () => onNavigate('workplace');
    } else if (nextAction === 'buy') {
      title = 'Use your earnings for household food';
      detail = `${food} food owned; a meal needs ${mealFood}. ${quantity} food costs ${((quote!.buyMinor * quantity) / 100).toFixed(2)} SPK at the starter merchant.`;
      label = view === 'market' ? `Buy ${quantity} food` : 'Open food market';
      action = view === 'market' ? () => onBuyFood(quantity) : () => onNavigate('market');
    } else if (nextAction === 'meal') {
      title = 'Feed your household and recover';
      detail = `${mealFood} food restores up to ${market!.mealCapacity} WC. Your current capacity is ${capacity} / 24.`;
      label = view === 'household' ? `Prepare meal · ${mealFood} food` : 'Return to household';
      action = view === 'household' ? onMeal : () => onNavigate('household');
    } else if (nextAction === 'work') {
      title = 'Ready for your next shift';
      detail = `${food} food available · ${(economy.walletMinor / 100).toFixed(2)} SPK. ${capacity >= 24 ? 'Capacity is full; save food for later.' : market?.mealReadyAt ? `Next meal: ${new Date(market.mealReadyAt).toLocaleString()}.` : 'Your normal capacity recovery continues while away.'}`;
      label = 'Open work board'; action = () => onNavigate('workplace');
    } else {
      title = 'Recover before your next shift';
      detail = `Capacity ${capacity} / 24. Next recovery: ${new Date(economy.nextRecoveryAt).toLocaleString()}. Refresh after that time.`;
    }
  }
  return <section className="citizen-market daily-loop" aria-label="Your next daily action">
    <h3>Your daily loop · {nationName}</h3>
    {localDemo && <p>Browser-local demo · these actions and balances do not affect the shared world.</p>}
    {!supported ? <><p>Paid shifts, trading and household meals currently work in Kindle. This nation’s jobs and economy are planned; no wages or market actions are available here yet.</p>
      <button type="button" onClick={() => onNavigate('world')}>Review nation support and citizenship</button></> : <>
      <ol aria-label="Daily loop steps"><li>Work a paid shift {active ? '· underway' : collected ? '· first shift completed' : ''}</li>
        <li>Collect wages and goods {collected ? '· collected' : '· when the timer finishes'}</li>
        <li>Trade for food · {economy ? `${food} food owned` : 'loading'}</li><li>Prepare a household meal · recover capacity</li></ol>
      <strong>{title}</strong><p>{detail}</p>
      {active && !readyToCollect && <aside aria-label="Things to do while your shift runs">
        <p>Your shift takes {shiftDuration}. You can visit other scenes or close the game; the real-time timer keeps running.</p>
        <p>Ready to collect: <time dateTime={active.completesAt}>{new Date(active.completesAt).toLocaleString(undefined, { timeZoneName: 'short' })}</time>.</p>
        <nav aria-label="Optional activities while waiting">
          <button type="button" onClick={() => onNavigate('government')}>Read Civic decisions</button>
          <button type="button" onClick={() => onNavigate('square')}>Visit citizen chat</button>
          <button type="button" onClick={() => onNavigate('household')}>Write a private household note</button>
        </nav>
        <p>Reading decisions and writing a private note do not count as political actions. Counted petitions require phone verification and may end your citizenship change window.</p>
      </aside>}
      {uncertain && <p role="status">Confirm your pending market transaction in its panel before starting another action.</p>}
      <button type="button" disabled={busy || uncertain} onClick={action}>{busy ? 'Saving action…' : label}</button>
      {label !== 'Refresh citizen' && <button type="button" disabled={busy} onClick={onRefresh}>Refresh balances</button>}
    </>}
    <details><summary>What comes after the daily loop?</summary><p>Read decisions in Civic or chat with neighbours in City. Petitions require phone verification; counted civic actions can end your citizenship change window. Officials currently follow fixed rules; no live AI model is connected.</p></details>
  </section>;
}
