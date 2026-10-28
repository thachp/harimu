'use client';
import {useDisplayTimestamp} from './display-preferences';
import { NationDocument } from './nation-document';
import { GameTimer } from './game-timer';
import { formatDuration, gameTimeCompression } from '../lib/game-time';

import { useEffect, useState } from 'react';
import { ActionButton } from './action-button';
import { firstActionReason, pendingActionReason } from '@/lib/action-reasons';
import type { WorkShift } from '@/lib/work-shifts';
import type { SceneView } from '@/lib/scene-navigation';
import type { KorundPlan } from '@/lib/korund';
import { quotaPercent, korundMedalCopy, korundQuotaValueText, korundShortfallCopy, korundRationCutCopy } from '@/lib/korund-coupons';
import { bureauText, outcomeNotice, reasonText, fillText } from '@/lib/labor-bureau-text';
import { preferenceCount } from '@/lib/labor-bureau-rules';
import { grayText, grayRefusal, ln, fc, rate, rumorLine, walletStreetRateLine, noOffersLine, postedLine, acceptedLine, expiredLine } from '@/lib/gray-market-text';

export type KorundPlanView = KorundPlan;
export type KorundAction = 'korund-start-work' | 'korund-claim-work' | 'korund-redeem-ration' | 'korund-household-meal' | 'korund-join-ration-queue' | 'korund-cancel-ration-queue' | 'korund-redeem-coupon' | 'korund-set-preferences' | 'korund-request-assignment' | 'korund-gray-post-offer' | 'korund-gray-accept-offer';
export type KorundCommand = { action: KorundAction; requestId: string; preferences?: string[]; shiftId?: string; queueId?:string; coupon?:'clothing'|'goods'; gameWeek?: number; amountMinor?: number; askRate?: number; offerId?: string };
/** #43: what the gray-market card asks the page to send (the page adds the request id). */
export type GrayCommand = { action: 'korund-gray-post-offer'; amountMinor: number; askRate: number } | { action: 'korund-gray-accept-offer'; offerId: string };

export function KorundPlanPanel({ plan, scene, capacity, pending, uncertain, localDemo, error, otherShiftActive, onCommand, onGray, onRetry, onRefresh, onNavigate }: {
  plan: KorundPlanView | null; scene: SceneView; capacity: number; pending: boolean; uncertain: boolean;
  localDemo: boolean; error: string | null; onCommand: (action: KorundAction, shiftId?: string, preferences?: string[]) => void;
  otherShiftActive?: boolean; onGray?: (command: GrayCommand) => void;
  onRetry: () => void; onRefresh: () => void; onNavigate: (scene: SceneView) => void;
}) {
  const formatTime=useDisplayTimestamp();
  const [now, setNow] = useState(0);
  useEffect(() => { const update = () => setNow(Date.now()); update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); }, []);
  if (localDemo) return <section className="citizen-market"><h3>Korund planned economy</h3><p>Assignments, Labor Notes and ration coupons require a connected citizen account. This browser-local demo does not simulate Korund’s ledger.</p></section>;
  if (!plan?.available) return <section className="citizen-market"><h3>Korund planned economy</h3><p>Loading your assignment and ration book. Refresh to check the current server record.</p><ActionButton type="button" reason={pendingActionReason(pending)} onClick={onRefresh}>Refresh Korund account</ActionButton>{uncertain && <div role="alert"><p>Confirm the previous Korund action before starting another. Retry uses the same request.</p><ActionButton type="button" reason={pendingActionReason(pending)} onClick={onRetry}>Confirm previous action</ActionButton></div>}{error && <p role="alert">{error}</p>}</section>;
  const active = plan.shifts.find(shift => !shift.claimedAt);
  const ready = Boolean(active && now > 0 && Date.parse(active.completesAt) <= now);
  const couponsCurrent = now > 0 && Date.parse(plan.couponExpiresAt) > now;
  const queue=plan.queue;
  const mealReady = now > 0 && (!plan.mealReadyAt || Date.parse(plan.mealReadyAt) <= now);
  return <NationDocument nationId="korund" className="citizen-market korund-plan" label="Korund assignment and ration account">
    <h3>{scene === 'workplace' ? (plan.bureau ? 'Labor Bureau assignment' : 'Brigade assignment') /* #453: the Bureau name only when HARIMU_LABOR_BUREAU_ENABLED sends plan.bureau */ : scene === 'market' ? 'State ration counter' : 'Korund household account'}</h3>
    <p>Bounded state planning · AI/SI roles follow deterministic rules. Labor Notes are non-convertible; Korund has no legal private market.</p>
    <p>Labor Note wages are recorded in a separate ledger. Labor Notes are spent only on weekly clothing and goods coupons at fixed prices; food comes from free food coupons.</p>
    <dl><dt>Labor Notes</dt><dd>{(plan.walletMinor / 100).toFixed(2)} LN{plan.streetRate && <><br /><small className="wallet-street-rate">{walletStreetRateLine(plan.streetRate.rumoredRate)}</small></>}</dd><dt>Household food</dt><dd>{plan.foodQuantity}</dd>
      <dt>Work capacity</dt><dd>{capacity} / 24 WC</dd><dt>Ration book</dt><dd>Game week {plan.gameWeek} · {plan.couponFoodRemaining} food coupons · <GameTimer endsAt={plan.couponExpiresAt} label="Ration coupons expire" /></dd></dl>
    {uncertain && <div role="alert"><p>Confirm the previous Korund action before starting another. Retry uses the same request.</p><ActionButton type="button" reason={pendingActionReason(pending)} onClick={onRetry}>Confirm previous action</ActionButton></div>}
    {error && <p role="alert">{error}</p>}
    <ActionButton type="button" reason={pendingActionReason(pending)} onClick={onRefresh}>Refresh assignment and ration book</ActionButton>
    {scene === 'workplace' ? <>
      <h4>{plan.assignment.name}</h4><p>{plan.assignment.capacityCost} WC · {formatDuration(plan.assignment.hours * 3600000)} real / {formatDuration(plan.assignment.hours * 3600000 * gameTimeCompression)} game · {(plan.assignment.wageMinor / 100).toFixed(2)} LN wages · {plan.assignment.foodOutput} food added to the state pool on collection.</p>
      {plan.quota && <QuotaBar quota={plan.quota} medals={plan.medals} />}
      {plan.shortfall && <section className="korund-shortfall" aria-label="Plan inspection"><p role="status">{korundShortfallCopy.notice(plan.shortfall.workUnit, plan.shortfall.percent)}</p><p>{korundShortfallCopy.ledger}</p><p><small>City feed: {plan.shortfall.press}</small></p></section>}
      {plan.bureau ? <LaborBureau bureau={plan.bureau} pending={pending} uncertain={uncertain} formatTime={formatTime} onCommand={onCommand} /> : null}
      <p>One assigned shift at a time. {plan.bureau ? 'Bureau placement is recorded; shift pay is unchanged.' : 'Job preferences, reassignment and production-drive progression are planned.'}</p>
      {active ? <><GameTimer endsAt={active.completesAt} label="Shift ends in" readyLabel="Shift ready" /><p>{active.orderName} · {ready ? 'Complete · collect your Labor Notes' : now ? `${Math.max(1, Math.ceil((Date.parse(active.completesAt) - now) / 60000))} minutes remaining` : 'Checking timing…'}</p>
        <ActionButton type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([!now, 'Checking the shift timer…'], [!ready, 'Your assignment is underway. Collect after it finishes.'])} onClick={() => onCommand('korund-claim-work', active.id)}>Collect assigned-shift wages</ActionButton></> :
        <ActionButton type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([otherShiftActive, 'Collect your earlier nation’s shift first.'], [capacity < plan.assignment.capacityCost, `You need ${plan.assignment.capacityCost} WC. Prepare a meal or wait for recovery.`])} onClick={() => onCommand('korund-start-work')}>Begin assigned shift · {plan.assignment.capacityCost} WC</ActionButton>}
      {otherShiftActive && <p>Collect your earlier nation’s shift before beginning another assignment.</p>}
      <button type="button" onClick={() => onNavigate('market')}>Visit the ration counter</button>
    </> : scene === 'market' ? <>
      <p><strong>National FIFO queue:</strong> {queue?`${queue.waiting} waiting requests${queue.position!==null?` · Your position: ${queue.position}`:''}`:'Queue information unavailable; refresh the ration book'}. No wait-time estimate is available.</p><p>Requests expire with the coupon week. Joining reserves no stock and consumes no coupons. Collect at the counter when you reach the front and stock covers your ration; cancelling preserves unused coupons.</p>
      {queue?.requestId?<ActionButton type="button" reason={pendingActionReason(pending,uncertain)??firstActionReason([!couponsCurrent,'The request expired with the coupon week. Refresh the ration book.'])} onClick={()=>onCommand('korund-cancel-ration-queue',queue.requestId!)}>Cancel my ration request</ActionButton>:<ActionButton type="button" reason={pendingActionReason(pending,uncertain)??firstActionReason([!queue,'Refresh to load the current queue.'],[!couponsCurrent,'Refresh for the current coupon week.'],[plan.couponFoodRemaining<=0,'This game week’s coupons have been used.'])} onClick={()=>onCommand('korund-join-ration-queue')}>Join ration queue</ActionButton>}
      <p>Coupons are non-transferable and expire each game week (14 real hours / 7 game days at 12× time). Food coupon redemption costs no Labor Notes. Rations come from actual plan output; available state food: {plan.publicFoodRemaining}.</p>
      {!couponsCurrent && <p>Ration book expired or timing is loading. Refresh for this game week’s allocation.</p>}
      {couponsCurrent && plan.couponFoodRemaining > plan.publicFoodRemaining && <p>State food shortage · available output cannot cover this ration. Assigned work replenishes the pool when collected.</p>}
      <ActionButton type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([!couponsCurrent, 'Refresh for the current game week’s ration book.'], [plan.couponFoodRemaining <= 0, 'This game week’s food coupons have been used.'], [!queue,'Refresh to load the current queue.'], [Boolean(queue&&queue.waiting>0&&queue.position!==1),queue?.requestId?'Wait for earlier requests to collect or cancel. Your place is retained.':'Join the queue and wait for earlier requests to collect or cancel.'], [plan.publicFoodRemaining < plan.couponFoodRemaining, 'State food cannot cover this ration. Collected assignments replenish it.'])} onClick={() => onCommand('korund-redeem-ration')}>Redeem this week’s food coupons · {plan.couponFoodRemaining} food</ActionButton>
      <button type="button" onClick={() => onNavigate('household')}>Take rations to your household</button>
    </> : scene === 'household' ? <>
      {plan.rationCut && <p className="korund-ration-cut" role="status" aria-label={korundRationCutCopy.label}>{korundRationCutCopy.notice}{plan.rationCut.stability ? ` ${korundRationCutCopy.stability}` : ''}</p>}
      {plan.coupons && <CouponBook now={now} coupons={plan.coupons} walletMinor={plan.walletMinor} clothing={plan.clothingQuantity ?? 0} goods={plan.goodsQuantity ?? 0} reason={pendingActionReason(pending, uncertain)} onRedeem={(kind) => onCommand('korund-redeem-coupon', kind)} onFood={() => onNavigate('market')} />}
      <p>A household meal uses 2 food and restores up to 4 WC, capped at 24. Meals have a two-real-hour (one game day) cooldown; normal capacity recovery continues.</p>
      <p>{capacity >= 24 ? 'Capacity is full; save your rations.' : plan.foodQuantity < 2 ? 'Redeem your ration coupons for food.' : !mealReady ? `Next meal: ${plan.mealReadyAt ? formatTime(plan.mealReadyAt) : 'checking timing…'}` : 'Household meal available.'}</p>
      <ActionButton type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([capacity >= 24, 'Capacity is full. Save your rations.'], [plan.foodQuantity < 2, 'You need 2 food. Redeem ration coupons at the counter.'], [!mealReady, now ? 'Wait until the next meal time shown above.' : 'Checking the meal timer…'])} onClick={() => onCommand('korund-household-meal')}>Prepare ration meal · 2 food</ActionButton>{plan.mealReadyAt && <GameTimer endsAt={plan.mealReadyAt} label="Next meal" />}
      <button type="button" onClick={() => onNavigate('market')}>Open ration book</button><button type="button" onClick={() => onNavigate('workplace')}>Open assigned work</button>
    </> : <>
      <p>Daily loop: complete the assigned shift, collect Labor Notes, redeem game-week food coupons at the state counter, then prepare a household meal.</p>
      <button type="button" onClick={() => onNavigate(active ? 'workplace' : plan.foodQuantity < 2 && plan.couponFoodRemaining > 0 ? 'market' : 'workplace')}>{active ? 'Check assigned shift' : plan.foodQuantity < 2 && plan.couponFoodRemaining > 0 ? 'Redeem ration coupons' : 'Open assigned work'}</button>
    </>}
    {plan.gray && onGray ? <GrayMarket gray={plan.gray} pending={pending} uncertain={uncertain} onGray={onGray} /> : null}
  </NationDocument>;
}

export function PriorNationShift({ shift, currency, pending, uncertain, onClaim, onRetry }: {
  shift: WorkShift; currency: 'LN' | 'SPK' | 'CRN' | 'CUR'; pending: boolean; uncertain: boolean; onClaim: () => void;
  onRetry: () => void;
}) {
  const formatTime=useDisplayTimestamp();
  const [now, setNow] = useState(0);
  useEffect(() => { const update = () => setNow(Date.now()); update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer); }, []);
  const ready = now > 0 && Date.parse(shift.completesAt) <= now;
  return <section className="citizen-market" aria-label="Earlier nation shift">
    <h3>Earlier nation’s shift · {shift.orderName}</h3>
    <p>Your citizenship changed during this shift. Its original reward remains payable in {currency === 'LN' ? 'Labor Notes' : currency === 'CRN' ? 'Crowns' : currency === 'CUR' ? 'Current' : 'Sparks'}; no currency conversion takes place.</p>
    <p>{shift.wageMinor === undefined ? 'Reward terms are recorded with the shift.' : `${(shift.wageMinor / 100).toFixed(2)} ${currency}`} · {ready ? 'Ready to collect' : `Finishes ${formatTime(shift.completesAt)}`}</p>
    <GameTimer endsAt={shift.completesAt} label="Original shift ready" />
    {currency === 'LN' && <p>The output replenishes Korund’s state ration pool. Labor Notes remain in your Korund ledger.</p>}
    {uncertain && <><p>Confirm the pending action before collecting another reward.</p><ActionButton type="button" reason={pendingActionReason(pending)} onClick={onRetry}>Confirm pending action</ActionButton></>}
    <ActionButton type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([!now, 'Checking the shift timer…'], [!ready, 'Your earlier shift is underway. Collect after it finishes.'])} onClick={onClaim}>Collect original {currency} reward</ActionButton>
  </section>;
}

export function QuotaBar({ quota, medals }: { quota: NonNullable<KorundPlanView['quota']>; medals?: KorundPlanView['medals'] }) {
  // #737 (only with HARIMU_KORUND_MEDALS_ENABLED on): unclamped over-fulfilment percent, same formula as lib/korund-medals-rules overFulfilledPercent (inlined: the panel's test loaders map each import)
  const over = medals && quota.targetFood > 0 && quota.unitFood > quota.targetFood ? Math.round(quota.unitFood * 100 / quota.targetFood) : 0;
  const unit = quotaPercent(quota.unitFood, quota.targetFood);
  const own = quotaPercent(quota.ownFood, quota.targetFood);
  return <section className="korund-quota" aria-label="Work-unit quota">
    <h4>{quota.workUnit} · weekly quota</h4>
    <div className="korund-quota-track" role="progressbar" aria-label="Work-unit quota progress" aria-valuemin={0} aria-valuemax={quota.targetFood} aria-valuenow={Math.min(quota.unitFood, quota.targetFood)} aria-valuetext={korundQuotaValueText(quota.unitFood, quota.targetFood, quota.ownFood, over)}>
      <span className="korund-quota-unit" style={{ width: `${unit}%` }} /><span className="korund-quota-own" style={{ width: `${own}%` }} />
    </div>
    <p>Unit: {quota.unitFood} / {quota.targetFood} food ({over || unit}%) · Your contribution: {quota.ownFood} food. Quota resets with the coupon week.</p>
    {over > 0 && <p className="korund-quota-over">{korundMedalCopy.over(over)}<br /><small>{korundMedalCopy.overSub}</small></p>}
    {medals && <p title={korundMedalCopy.rule}>{korundMedalCopy.count(medals.total)} <small>{korundMedalCopy.rule}</small></p>}
  </section>;
}

export function CouponBook({ now, coupons, walletMinor, clothing, goods, reason, onRedeem, onFood }: {
  now: number; coupons: NonNullable<KorundPlanView['coupons']>; walletMinor: number; clothing: number; goods: number; reason: string | null;
  onRedeem: (kind: 'clothing' | 'goods') => void; onFood: () => void;
}) {
  const expiresAt = coupons[0]?.expiresAt;
  return <section className="korund-coupons" aria-label="Weekly ration coupons">
    <h4>This week’s ration coupons</h4>
    {expiresAt && <GameTimer endsAt={expiresAt} label="Coupons expire at the weekly reset" />}
    <p>Coupons are issued in your name, cannot be traded or sent, and unused coupons disappear at the weekly reset.</p>
    <ul>{coupons.map((coupon) => <li key={coupon.kind}>
      <strong>{coupon.label}</strong> · {coupon.quantity} {coupon.item} · {coupon.priceMinor === 0 ? 'no LN charge' : `${(coupon.priceMinor / 100).toFixed(2)} LN fixed price`} · {coupon.withdrawn ? korundRationCutCopy.withdrawn : coupon.used ? 'used this week' : 'available'}
      {coupon.kind === 'food' ? (!coupon.used && <button type="button" onClick={onFood}>Redeem at the ration counter</button>)
        : <ActionButton type="button" reason={reason ?? firstActionReason([!now, 'Checking the coupon expiry…'], [Boolean(coupon.withdrawn), korundRationCutCopy.notice], [now >= Date.parse(coupon.expiresAt), 'This coupon book expired at the weekly reset. Refresh for this week’s coupons.'], [coupon.used, 'This coupon was already used this week.'], [walletMinor < coupon.priceMinor, `You need ${(coupon.priceMinor / 100).toFixed(2)} LN. Complete an assigned shift first.`])} onClick={() => onRedeem(coupon.kind as 'clothing' | 'goods')}>Redeem {coupon.label.toLowerCase()}</ActionButton>}
    </li>)}</ul>
    <p>Household stores: {clothing} clothing · {goods} goods bundles.</p>
  </section>;
}

/** #235 Labor Bureau (flag HARIMU_LABOR_BUREAU_ENABLED): rendered only when the server sends plan.bureau. Copy is Content's #329 via lib/labor-bureau-text. */
function LaborBureau({ bureau, pending, uncertain, formatTime, onCommand }: { bureau: NonNullable<KorundPlanView['bureau']>; pending: boolean; uncertain: boolean;
  formatTime: (iso: string) => string; onCommand: (action: KorundAction, shiftId?: string, preferences?: string[]) => void }) {
  const [draft, setDraft] = useState<string[]>(() => bureau.preferences ?? Array(preferenceCount).fill(''));
  const complete = draft.length === preferenceCount && draft.every(Boolean) && new Set(draft).size === preferenceCount;
  const nextAt = bureau.nextRequestAt ? formatTime(bureau.nextRequestAt) : '';
  const requestReason = pendingActionReason(pending, uncertain) ?? firstActionReason(
    [Boolean(bureau.nextRequestAt), fillText(bureauText.refusal, { nextRequestAt: nextAt })]);
  return <section aria-label="Labor Bureau">
    <h4>{bureauText.header}</h4><p>{bureauText.explainer}</p>
    {bureauText.slotLabels.map((label, index) => <label key={label}>{label}{' '}
      <select value={draft[index] ?? ''} onChange={event => setDraft(current => current.map((value, i) => i === index ? event.target.value : value))}>
        <option value="">Choose a job</option>{bureau.jobs.map(job => <option key={job.id} value={job.id}>{job.name} · {job.open} open</option>)}
      </select></label>)}
    <ActionButton type="button" reason={pendingActionReason(pending, uncertain) ?? firstActionReason([!complete, 'Choose three different jobs.'])} onClick={() => onCommand('korund-set-preferences', undefined, draft)}>{bureauText.fileButton}</ActionButton>
    {bureau.preferences && <p>{bureauText.filed}</p>}
    {bureau.assignment && (() => { const notice = outcomeNotice(bureau.assignment.outcome, { id: bureau.assignment.jobId, name: bureau.assignment.jobName }); return <><p><strong>{notice.headline}</strong> · {notice.body}</p>
      <ul>{bureau.assignment.reasons.map(reason => <li key={reason}>{reasonText[reason]}</li>)}</ul></>; })()}
    {bureau.assignment && <ActionButton type="button" reason={requestReason} onClick={() => onCommand('korund-request-assignment')}>{bureauText.reassignButton}</ActionButton>}
    {bureau.nextRequestAt && <p>{fillText(bureauText.nextRequest, { nextRequestAt: nextAt })}</p>}
  </section>;
}

/** #43 gray market (flag HARIMU_GRAY_MARKET_ENABLED): rendered only when the server sends plan.gray, for Korund citizens. A collapsed, optional
 * entry. Copy is Content's #314 via lib/gray-market-text (PoC warning lines only: no Suspicion or seizure). FC is smuggled foreign cash. */
export function GrayMarket({ gray, pending, uncertain, onGray }: { gray: NonNullable<KorundPlanView['gray']>; pending: boolean; uncertain: boolean; onGray: (command: GrayCommand) => void }) {
  const [amount, setAmount] = useState('');
  const [askRate, setAskRate] = useState('');
  const amountMinor = Math.round(Number(amount) * 100), rateHundredths = Math.round(Number(askRate) * 100);
  const validTerms = amount !== '' && askRate !== '' && Number.isSafeInteger(amountMinor) && amountMinor >= 1 && amountMinor <= gray.limits.amountCapMinor
    && Number.isSafeInteger(rateHundredths) && rateHundredths >= gray.limits.rateMin && rateHundredths <= gray.limits.rateMax;
  const mine = gray.myOffer;
  const base = pendingActionReason(pending, uncertain);
  return <details className="korund-gray-market" aria-label={grayText.label}>
    <summary>{grayText.label} · {grayText.subtitle}</summary>
    <section aria-label={grayText.warningTitle}><h4>{grayText.warningTitle}</h4>{grayText.warning.map(line => <p key={line}>{line}</p>)}</section>
    <dl><dt>{grayText.cashLabel}</dt><dd>{fc(gray.cashMinor)}{gray.grantPending ? ' (starting stash, yours when you first trade)' : ''}</dd></dl>
    <p><small>{grayText.cashHelp}</small></p>
    {gray.suspicion && <p title={gray.suspicion.tooltip.join(' ')}>{gray.suspicion.line} <small>({gray.suspicion.privateTag})</small></p>}
    {gray.seizure && <p role="status">{gray.seizure}</p>}
    {gray.dailyRemainingMinor !== undefined && <p>Today&apos;s limit: {ln(gray.dailyRemainingMinor)} left</p>}
    <p aria-label={grayText.rumorLabel}>{gray.rumoredRate === null ? grayText.noRumor : rumorLine(gray.rumoredRate)}</p>
    <h4>{grayText.yourOffer}</h4>
    {mine ? <div className="gray-offer-card" data-status={mine.status}>
      <dl><dt>Amount</dt><dd>{ln(mine.amountMinor)}</dd><dt>Asking rate</dt><dd>{rate(mine.askRate)}</dd><dt>For</dt><dd>{fc(mine.cashMinor)}</dd></dl>
      <p>{mine.status === 'open' ? postedLine(mine.amountMinor, mine.askRate) : mine.status === 'accepted' ? acceptedLine(mine.amountMinor, mine.askRate) : expiredLine}</p>
      {mine.status === 'open' && <GameTimer endsAt={mine.expiresAt} label="Offer expires in" />}
    </div> : null}
    {(!mine || mine.status !== 'open') && <form onSubmit={event => { event.preventDefault(); if (validTerms) onGray({ action: 'korund-gray-post-offer', amountMinor, askRate: rateHundredths }); }}>
      <label>{grayText.amountLabel} <input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} aria-label={grayText.amountLabel} /></label>{' '}
      <label>{grayText.rateLabel} <input inputMode="decimal" value={askRate} onChange={event => setAskRate(event.target.value)} aria-label={grayText.rateLabel} /></label>{' '}
      <ActionButton type="submit" reason={base ?? firstActionReason([!validTerms, `Offer 0.01 to ${(gray.limits.amountCapMinor / 100).toFixed(2)} LN at ${(gray.limits.rateMin / 100).toFixed(2)} to ${(gray.limits.rateMax / 100).toFixed(2)} FC per LN.`])}>{grayText.postButton}</ActionButton>
    </form>}
    <h4>{grayText.boardTitle}</h4>
    {gray.offers.length === 0 ? <p>{noOffersLine}</p> : <ul>{gray.offers.map(offer => <li key={offer.id} className="gray-offer-card">
      <dl><dt>Amount</dt><dd>{ln(offer.amountMinor)}</dd><dt>Asking rate</dt><dd>{rate(offer.askRate)}</dd><dt>Price</dt><dd>{fc(offer.cashMinor)}</dd></dl>
      <ActionButton type="button" reason={base ?? firstActionReason([gray.cashMinor < offer.cashMinor, grayRefusal.insufficient_cash])} onClick={() => onGray({ action: 'korund-gray-accept-offer', offerId: offer.id })}>{grayText.acceptButton}</ActionButton>
    </li>)}</ul>}
  </details>;
}
