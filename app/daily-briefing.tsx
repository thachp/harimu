'use client';

import { useEffect, useState } from 'react';
import { governmentDisclosure } from '../lib/government-disclosure';
import { GameTimer } from './game-timer';
import type { Economy } from '@/lib/economy';
import type { WorkShift } from '@/lib/work-shifts';
import type { MarketState } from '@/lib/market';
import type { GovernmentSnapshot } from '@/lib/government';
import { dailyPriority } from '@/lib/daily-briefing';

const sparks = (minor: number) => `${(minor / 100).toFixed(2)} SPK`;

export function DailyBriefing({ economy, shifts, capacity, market, government, citizenNationName,
  localDemo, onRefresh, onOpenWork, onOpenMarket }: {
  economy: Economy | null;
  shifts: WorkShift[];
  capacity: number;
  market: MarketState | null;
  government: GovernmentSnapshot | null;
  citizenNationName: string;
  localDemo: boolean;
  onRefresh: () => void;
  onOpenWork: () => void;
  onOpenMarket: () => void;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 15000);
    window.addEventListener('focus', update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
    };
  }, []);
  const food = economy?.inventory.find((entry) => entry.item === 'food')?.quantity ?? 0;
  const activeShift = shifts.find((shift) => !shift.claimedAt);
  const mealFood = market?.mealFood ?? 2;
  const priority = dailyPriority({ now, capacity, food, mealFood, mealReadyAt: market?.mealReadyAt ?? null,
    marketAvailable: !!market?.available && !!economy, activeShift });
  const action = priority.action === 'work' ? onOpenWork : priority.action === 'market' ? onOpenMarket : onRefresh;
  const actionLabel = priority.action === 'work' ? 'Open work board' : priority.action === 'market' ? 'Open food market' : 'Refresh citizen';

  return <section className="citizen-market daily-briefing" aria-label="Citizen daily briefing">
    <h3>Your day in {citizenNationName}</h3>
    {localDemo && <p><strong>Browser-local demo.</strong> These balances and actions are saved on this browser; they do not affect the shared world.</p>}
    <p>A persistent loop: work, collect wages and goods, trade, then feed your household. Timers continue while you are away.</p>
    <div>
      <strong>{priority.title}</strong>
      <p>{priority.reason}</p>
      <button type="button" onClick={action}>{actionLabel}</button>
      {priority.action !== 'refresh' && <button type="button" onClick={onRefresh}>Refresh citizen</button>}
    </div>
    <dl>
      <dt>Work capacity</dt><dd>{capacity} / 24 WC</dd>
      <dt>Next capacity recovery</dt><dd>{capacity >= 24 ? 'Full · spend capacity on a shift when ready'
        : economy ? <><GameTimer endsAt={economy.nextRecoveryAt} label="Capacity recovery" /> · refresh to apply recovery</> : 'Loading citizen economy…'}</dd>
      <dt>Wallet</dt><dd>{economy ? sparks(economy.walletMinor) : 'Loading…'}</dd>
      <dt>Household food</dt><dd>{economy ? `${food} food` : 'Loading…'}{market?.available && ` · ${mealFood} per meal`}</dd>
      <dt>Other available goods</dt><dd>{economy ? economy.inventory.filter((entry) => entry.item !== 'food' && entry.quantity > 0)
        .map((entry) => `${entry.quantity} ${entry.item}`).join(', ') || 'None yet' : 'Loading…'}</dd>
      <dt>Current shift</dt><dd>{activeShift ? <>{activeShift.orderName} · <GameTimer endsAt={activeShift.completesAt} label="Shift ends in" readyLabel="Shift ready" />
        {activeShift.wageMinor !== undefined && ` · ${sparks(activeShift.wageMinor)} on collection`}
        {activeShift.rewardItem && ` + ${activeShift.rewardQuantity ?? 0} ${activeShift.rewardItem}`}</> : 'No active shift'}</dd>
      <dt>Household meal</dt><dd>{!market?.available ? 'Kindle household meals are not available in this nation yet'
        : !economy ? 'Loading household…' : capacity >= 24 ? 'Capacity full · save your food'
          : food < mealFood ? `Need ${mealFood - food} more food`
            : market.mealReadyAt && (now === 0 || Date.parse(market.mealReadyAt) > now)
              ? <GameTimer endsAt={market.mealReadyAt} label="Next meal" /> : `Available · restores up to ${market.mealCapacity} WC`}</dd>
    </dl>
    <small>Displayed balances are a snapshot. Refresh after returning; the server checks every authenticated action again.</small>
    {government && <div>
      <h3>Government briefing</h3>
      <p>AI/SI-controlled government · rule-bound simulation, with no live AI model connected.</p>
      <strong>{government.decision.title}</strong>
      <p>{governmentDisclosure(government).text}</p>
      <p>Proposed spend: {sparks(government.decision.proposedSpendMinor)} · available budget: {sparks(government.availableBudgetMinor)}.</p>
      <p>{government.influenceSummary}</p>
    </div>}
  </section>;
}
