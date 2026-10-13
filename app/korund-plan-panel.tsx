'use client';
import { GameTimer } from './game-timer';
import { formatDuration, gameTimeCompression } from '../lib/game-time';

import { useEffect, useState } from 'react';
import { ActionButton } from './action-button';
import { firstActionReason, pendingActionReason } from '@/lib/action-reasons';
import type { WorkShift } from '@/lib/work-shifts';
import type { SceneView } from '@/lib/scene-navigation';
import type { KorundPlan } from '@/lib/korund';

export type KorundPlanView = KorundPlan;
export type KorundAction = 'korund-start-work' | 'korund-claim-work' | 'korund-redeem-ration' | 'korund-household-meal';
export type KorundCommand = { action: KorundAction; requestId: string; shiftId?: string };

export function KorundPlanPanel({ plan, scene, capacity, pending, uncertain, localDemo, error, otherShiftActive, onCommand, onRetry, onRefresh, onNavigate }: {
  plan: KorundPlanView | null; scene: SceneView; capacity: number; pending: boolean; uncertain: boolean;
  localDemo: boolean; error: string | null; onCommand: (action: KorundAction, shiftId?: string) => void;
  otherShiftActive?: boolean;
  onRetry: () => void; onRefresh: () => void; onNavigate: (scene: SceneView) => void;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => { const update = () => setNow(Date.now()); update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); }, []);
  if (localDemo) return <section className="citizen-market"><h3>Korund planned economy</h3><p>Assignments, Labor Notes and ration coupons require a connected citizen account. This browser-local demo does not simulate Korund’s ledger.</p></section>;
  if (!plan?.available) return <section className="citizen-market"><h3>Korund planned economy</h3><p>Loading your assignment and ration book. Refresh to check the current server record.</p><ActionButton type="button" reason={pendingActionReason(pending)} onClick={onRefresh}>Refresh Korund account</ActionButton>{error && <p role="alert">{error}</p>}</section>;
  const active = plan.shifts.find(shift => !shift.claimedAt);
  const ready = Boolean(active && now > 0 && Date.parse(active.completesAt) <= now);
  const couponsCurrent = now > 0 && Date.parse(plan.couponExpiresAt) > now;
  const mealReady = now > 0 && (!plan.mealReadyAt || Date.parse(plan.mealReadyAt) <= now);
  return <section className="citizen-market korund-plan" aria-label="Korund assignment and ration account">
    <h3>{scene === 'workplace' ? 'Labor Bureau assignment' : scene === 'market' ? 'State ration counter' : 'Korund household account'}</h3>
    <p>Bounded state planning · AI/SI roles follow deterministic rules. Labor Notes are non-convertible; Korund has no legal private market.</p>
    <p>Labor Note wages are recorded in a separate ledger. Spending Labor Notes is planned; food currently comes from coupons rather than LN purchases.</p>
    <dl><dt>Labor Notes</dt><dd>{(plan.walletMinor / 100).toFixed(2)} LN</dd><dt>Household food</dt><dd>{plan.foodQuantity}</dd>
      <dt>Work capacity</dt><dd>{capacity} / 24 WC</dd><dt>Ration book</dt><dd>Game week {plan.gameWeek} · {plan.couponFoodRemaining} food coupons · <GameTimer endsAt={plan.couponExpiresAt} label="Ration coupons expire" /></dd></dl>
    {uncertain && <div role="alert"><p>Confirm the previous Korund action before starting another. Retry uses the same request.</p><ActionButton type="button" reason={pendingActionReason(pending)} onClick={onRetry}>Confirm previous action</ActionButton></div>}
    {error && <p role="alert">{error}</p>}
    <ActionButton type="button" reason={pendingActionReason(pending)} onClick={onRefresh}>Refresh assignment and ration book</ActionButton>
    {scene === 'workplace' ? <>
      <h4>{plan.assignment.name}</h4><p>{plan.assignment.capacityCost} WC · {formatDuration(plan.assignment.hours * 3600000)} real / {formatDuration(plan.assignment.hours * 3600000 * gameTimeCompression)} game · {(plan.assignment.wageMinor / 100).toFixed(2)} LN wages · {plan.assignment.foodOutput} food added to the state pool on collection.</p>
      <p>One assigned shift at a time. Job preferences, reassignment and production-drive progression are planned.</p>
      {active ? <><GameTimer endsAt={active.completesAt} label="Shift ready" /><p>{active.orderName} · {ready ? 'Complete · collect your Labor Notes' : now ? `${Math.max(1, Math.ceil((Date.parse(active.completesAt) - now) / 60000))} minutes remaining` : 'Checking timing…'}</p>
        <ActionButton type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([!now, 'Checking the shift timer…'], [!ready, 'Your assignment is underway. Collect after it finishes.'])} onClick={() => onCommand('korund-claim-work', active.id)}>Collect assigned-shift wages</ActionButton></> :
        <ActionButton type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([otherShiftActive, 'Collect your earlier nation’s shift first.'], [capacity < plan.assignment.capacityCost, `You need ${plan.assignment.capacityCost} WC. Prepare a meal or wait for recovery.`])} onClick={() => onCommand('korund-start-work')}>Begin assigned shift · {plan.assignment.capacityCost} WC</ActionButton>}
      {otherShiftActive && <p>Collect your earlier nation’s shift before beginning another assignment.</p>}
      <button type="button" onClick={() => onNavigate('market')}>Visit the ration counter</button>
    </> : scene === 'market' ? <>
      <p>Coupons are non-transferable and expire each game week (14 real hours / 7 game days at 12× time). Redemption costs no Labor Notes. Rations come from actual plan output; available state food: {plan.publicFoodRemaining}.</p>
      {!couponsCurrent && <p>Ration book expired or timing is loading. Refresh for this game week’s allocation.</p>}
      {couponsCurrent && plan.couponFoodRemaining > plan.publicFoodRemaining && <p>State food shortage · available output cannot cover this ration. Assigned work replenishes the pool when collected.</p>}
      <ActionButton type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([!couponsCurrent, 'Refresh for the current game week’s ration book.'], [plan.couponFoodRemaining <= 0, 'This game week’s food coupons have been used.'], [plan.publicFoodRemaining < plan.couponFoodRemaining, 'State food cannot cover this ration. Collected assignments replenish it.'])} onClick={() => onCommand('korund-redeem-ration')}>Redeem this week’s food coupons · {plan.couponFoodRemaining} food</ActionButton>
      <button type="button" onClick={() => onNavigate('household')}>Take rations to your household</button>
    </> : scene === 'household' ? <>
      <p>A household meal uses 2 food and restores up to 4 WC, capped at 24. Meals have a two-real-hour (one game day) cooldown; normal capacity recovery continues.</p>
      <p>{capacity >= 24 ? 'Capacity is full; save your rations.' : plan.foodQuantity < 2 ? 'Redeem your ration coupons for food.' : !mealReady ? `Next meal: ${plan.mealReadyAt ? new Date(plan.mealReadyAt).toLocaleString() : 'checking timing…'}` : 'Household meal available.'}</p>
      <ActionButton type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([capacity >= 24, 'Capacity is full. Save your rations.'], [plan.foodQuantity < 2, 'You need 2 food. Redeem ration coupons at the counter.'], [!mealReady, now ? 'Wait until the next meal time shown above.' : 'Checking the meal timer…'])} onClick={() => onCommand('korund-household-meal')}>Prepare ration meal · 2 food</ActionButton>{plan.mealReadyAt && <GameTimer endsAt={plan.mealReadyAt} label="Next meal" />}
      <button type="button" onClick={() => onNavigate('market')}>Open ration book</button><button type="button" onClick={() => onNavigate('workplace')}>Open assigned work</button>
    </> : <>
      <p>Daily loop: complete the assigned shift, collect Labor Notes, redeem game-week food coupons at the state counter, then prepare a household meal.</p>
      <button type="button" onClick={() => onNavigate(active ? 'workplace' : plan.foodQuantity < 2 && plan.couponFoodRemaining > 0 ? 'market' : 'workplace')}>{active ? 'Check assigned shift' : plan.foodQuantity < 2 && plan.couponFoodRemaining > 0 ? 'Redeem ration coupons' : 'Open assigned work'}</button>
    </>}
  </section>;
}

export function PriorNationShift({ shift, currency, pending, uncertain, onClaim, onRetry }: {
  shift: WorkShift; currency: 'LN' | 'SPK' | 'CRN'; pending: boolean; uncertain: boolean; onClaim: () => void;
  onRetry: () => void;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => { const update = () => setNow(Date.now()); update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); }, []);
  const ready = now > 0 && Date.parse(shift.completesAt) <= now;
  return <section className="citizen-market" aria-label="Earlier nation shift">
    <h3>Earlier nation’s shift · {shift.orderName}</h3>
    <p>Your citizenship changed during this shift. Its original reward remains payable in {currency === 'LN' ? 'Labor Notes' : currency === 'CRN' ? 'Crowns' : 'Sparks'}; no currency conversion takes place.</p>
    <p>{shift.wageMinor === undefined ? 'Reward terms are recorded with the shift.' : `${(shift.wageMinor / 100).toFixed(2)} ${currency}`} · {ready ? 'Ready to collect' : `Finishes ${new Date(shift.completesAt).toLocaleString()}`}</p>
    <GameTimer endsAt={shift.completesAt} label="Original shift ready" />
    {currency === 'LN' && <p>The output replenishes Korund’s state ration pool. Labor Notes remain in your Korund ledger.</p>}
    {uncertain && <><p>Confirm the pending action before collecting another reward.</p><ActionButton type="button" reason={pendingActionReason(pending)} onClick={onRetry}>Confirm pending action</ActionButton></>}
    <ActionButton type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([!now, 'Checking the shift timer…'], [!ready, 'Your earlier shift is underway. Collect after it finishes.'])} onClick={onClaim}>Collect original {currency} reward</ActionButton>
  </section>;
}
