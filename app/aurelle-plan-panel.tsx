'use client';
import { NationDocument } from './nation-document';
import { GameTimer } from './game-timer';
import { formatDuration, gameTimeCompression } from '../lib/game-time';

import { useEffect, useState } from 'react';
import { ActionButton } from './action-button';
import { firstActionReason, pendingActionReason } from '@/lib/action-reasons';
import type { WorkShift } from '@/lib/work-shifts';
import type { SceneView } from '@/lib/scene-navigation';
import { aurelleFoodPriceMinor } from '@/lib/aurelle';

export type AurelleAction = 'aurelle-start-work' | 'aurelle-claim-work' | 'aurelle-buy-food' | 'aurelle-household-meal';
export type AurelleCommand = { action: AurelleAction; requestId: string; shiftId?: string; quantity?: 1 | 2 };
export type AurellePlanView = {
  available: boolean;
  charter: { id: string; name: string; active: boolean };
  walletMinor: number;
  foodQuantity: number;
  favor: number;
  publicFoodRemaining: number;
  publicFundMinor: number;
  mealReadyAt: string | null;
  shifts: WorkShift[];
};

const actionStyle = { minHeight: 44, maxWidth: '100%', whiteSpace: 'normal' } as const;

export function AurellePlanPanel({ plan, scene, capacity, pending, uncertain, localDemo, error, otherShiftActive, onCommand, onRetry, onRefresh, onNavigate }: {
  plan: AurellePlanView | null; scene: SceneView; capacity: number; pending: boolean; uncertain: boolean;
  localDemo: boolean; error: string | null; otherShiftActive?: boolean;
  onCommand: (action: AurelleAction, shiftId?: string, quantity?: 1 | 2) => void;
  onRetry: () => void; onRefresh: () => void; onNavigate: (scene: SceneView) => void;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  if (localDemo) return <section className="citizen-market aurelle-plan" aria-label="Aurelle charter account"><h3>Aurelle charter account</h3><p>Sign in as an Aurelle citizen to work under your charter and use your Crown ledger.</p></section>;
  if (!plan?.available) return <section className="citizen-market aurelle-plan" aria-label="Aurelle charter account"><h3>Aurelle charter account</h3><p>Checking your charter and balances.</p><ActionButton style={actionStyle} type="button" reason={pendingActionReason(pending)} onClick={onRefresh}>Refresh charter account</ActionButton>{error && <p role="alert">{error}</p>}</section>;
  const active = plan.shifts.find(shift => !shift.claimedAt);
  const ready = Boolean(active && now && Date.parse(active.completesAt) <= now);
  const mealReady = now > 0 && (!plan.mealReadyAt || Date.parse(plan.mealReadyAt) <= now);
  return <NationDocument nationId="aurelle" className="citizen-market aurelle-plan" label="Aurelle charter account"><div aria-busy={pending}>
    <h3>{scene === 'workplace' ? 'Chartered service' : scene === 'market' ? 'Chartered food counter' : scene === 'household' ? 'Aurelle household' : 'Your Aurelle next step'}</h3>
    <dl><dt>Crowns</dt><dd>{(plan.walletMinor / 100).toFixed(2)} CRN</dd><dt>Food</dt><dd>{plan.foodQuantity}</dd><dt>Royal Favor</dt><dd>{plan.favor} / 100</dd></dl>
    {uncertain && <div role="alert"><p>Confirm your previous action before starting another.</p><ActionButton style={actionStyle} type="button" reason={pendingActionReason(pending)} onClick={onRetry}>Confirm previous action</ActionButton></div>}
    {error && <p role="alert">{error}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {scene === 'workplace' ? <>
        <p style={{ width: '100%' }}>{plan.charter.name} · {plan.charter.active ? 'Active' : 'Inactive'}<br />4 WC · {formatDuration(7200000)} real / {formatDuration(7200000 * gameTimeCompression)} game · 8 CRN and 2 Favor on collection.</p>
        {active ? <><GameTimer endsAt={active.completesAt} label="Shift ready" /><p style={{ width: '100%' }}>{active.orderName} · {ready ? 'Ready to collect' : now ? `${Math.max(1, Math.ceil((Date.parse(active.completesAt) - now) / 60000))} min remaining` : 'Checking timer…'}</p><ActionButton style={actionStyle} type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([!now, 'Checking the service timer…'], [!ready, 'Service is underway. Collect after it finishes.'])} onClick={() => onCommand('aurelle-claim-work', active.id)}>Collect service reward</ActionButton></> : <ActionButton style={actionStyle} type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([otherShiftActive, 'Collect your earlier nation’s shift first.'], [!plan.charter.active, 'An active charter is required for service.'], [capacity < 4, 'You need 4 WC. Prepare a meal or wait for capacity recovery.'], [plan.publicFundMinor < 800, 'The service fund cannot cover another reward yet.'])} onClick={() => onCommand('aurelle-start-work')}>Begin chartered service · 4 WC</ActionButton>}
        {otherShiftActive && <p style={{ width: '100%' }}>Collect your earlier nation’s shift first.</p>}
        {!active && plan.publicFundMinor < 800 && <p style={{ width: '100%' }}>The finite service fund cannot cover another reward yet.</p>}
      </> : scene === 'market' ? <>
        <p style={{ width: '100%' }}>{plan.publicFoodRemaining} food available at the chartered counter.</p>
        {([1, 2] as const).map(quantity => <ActionButton key={quantity} style={actionStyle} type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([!plan.charter.active, 'An active charter is required at this counter.'], [plan.publicFoodRemaining < quantity, 'The counter does not have enough food for this purchase.'], [plan.walletMinor < quantity * aurelleFoodPriceMinor, 'You do not have enough Crowns for this purchase.'])} onClick={() => onCommand('aurelle-buy-food', undefined, quantity)}>Buy {quantity} food · {(quantity * aurelleFoodPriceMinor / 100).toFixed(2)} CRN</ActionButton>)}
        {!plan.charter.active && <p style={{ width: '100%' }}>An active charter is required to buy at this counter.</p>}
      </> : scene === 'household' ? <>
        <p style={{ width: '100%' }}>A meal uses 2 food and restores up to 4 WC. {capacity >= 24 ? 'Capacity is full.' : !mealReady ? plan.mealReadyAt ? `Next meal: ${new Date(plan.mealReadyAt).toLocaleString()}.` : 'Checking meal timing…' : plan.foodQuantity < 2 ? 'Buy food at the chartered counter.' : 'Your meal is ready.'}</p>
        <ActionButton style={actionStyle} type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([capacity >= 24, 'Capacity is full. Save your food for later.'], [plan.foodQuantity < 2, 'You need 2 food. Visit the chartered counter.'], [!mealReady, now ? 'Wait until the next meal time shown above.' : 'Checking the meal timer…'])} onClick={() => onCommand('aurelle-household-meal')}>Prepare meal · 2 food</ActionButton>{plan.mealReadyAt && <GameTimer endsAt={plan.mealReadyAt} label="Next meal" />}
      </> : <button style={actionStyle} type="button" onClick={() => onNavigate(active ? 'workplace' : plan.foodQuantity < 2 && plan.walletMinor >= aurelleFoodPriceMinor ? 'market' : 'workplace')}>{active ? 'Check chartered service' : plan.foodQuantity < 2 && plan.walletMinor >= aurelleFoodPriceMinor ? 'Visit the food counter' : 'Begin chartered service'}</button>}
      {scene !== 'square' && <ActionButton style={actionStyle} type="button" reason={pendingActionReason(pending)} onClick={onRefresh}>Refresh account</ActionButton>}
    </div>
    <details><summary>Prototype rules</summary><p>This seeded charter is a prototype entitlement, not royal charter issuance. Service contributes 4 food to finite public stock. Prices and rewards are prototype tuning; currency backing, mint redemption, charter grants and revocation are not simulated.</p><p>Favor is social standing, not currency. Service grants up to the 100 cap; decay, spending, ranks and estates are planned. Meals have a two-real-hour cooldown. Government uses deterministic rules; no live AI model is connected.</p></details>
  </div></NationDocument>;
}
