'use client';
// #1315 E1. Read-only jobs, Kindle book, and Korund plan facts. No commands and no new wording.
import { useEffect, useState } from 'react'; import { PanelV2 } from './panel-v2'; import { NationCrest } from './nation-crest'; import { economyEnabled } from '@/lib/economy-flag';
import { boardLabels, orderStateLines } from '@/lib/market-board-copy'; import { mvpJobs, mvpJobTypes, type MvpNation } from '@/lib/mvp-job-types'; import { bureauText, outcomeNotice } from '@/lib/labor-bureau-text';
import { grayText, noOffersLine, rate, rumorLine } from '@/lib/gray-market-text'; import { couponCard, queueCopy, quotaBar, rationCut, rationRecovery } from '@/lib/ration-copy'; import { korundPlanStatLine } from '@/lib/korund-plan-stats'; import type { OrderBookState } from '@/lib/order-book-rules'; import './economy.css';

const spark = (minor: number) => `${(minor / 100).toFixed(2)} SPK`;
const mvp = (id: string): id is MvpNation => id === 'kindle' || id === 'korund' || id === 'aurelle';
const fill = (text: string, vars: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (bit, key) => key in vars ? String(vars[key]) : bit);
export function EconomyPanel({ nation, citizenNationId = null, plan = null, shifts = null, orders = null, work = null, book: given = null, enabled = economyEnabled() }: {
  nation: { id: string; name: string; economy?: string | null; currency?: string | null }; citizenNationId?: string | null;
  plan?: { available?: boolean; couponFoodRemaining?: number; quota?: { unitFood: number; targetFood: number } | null; queue?: { waiting?: number; position?: number | null } | null; rationCut?: unknown; rationRecovery?: unknown; bureau?: { jobs?: { name: string }[]; assignment?: { jobId: string; jobName: string; outcome: 'first-choice' | 'lower-choice' | 'quota-posting' } | null } | null; gray?: { rumoredRate: number | null; offers?: readonly unknown[]; myOffer?: unknown } | null } | null;
  shifts?: readonly { id: string; orderName: string; claimedAt: string | null }[] | null; orders?: readonly { nationId?: string | null; name: string }[] | null;
  work?: { nationId?: string; jobs?: readonly { name: string }[] } | null; book?: OrderBookState | null; enabled?: boolean;
}) {
  const own = enabled && !!citizenNationId && citizenNationId === nation.id;
  const [book, setBook] = useState<OrderBookState | null>(given);
  useEffect(() => { if (!(own && nation.id === 'kindle')) return; let live = true; fetch('/api/market/orders').then(r => r.ok ? r.json() : null).then(data => { const next = data as { open?: boolean; book?: OrderBookState } | null; if (live) setBook(next?.open && next.book ? next.book : null); }).catch(() => { if (live) setBook(null); }); return () => { live = false; }; }, [own, nation.id]);
  if (!enabled) return null;
  const shown = nation.id === 'kindle' ? book : null, korund = nation.id === 'korund' && plan?.available !== false ? plan : null;
  const jobs = [...new Set([...(mvp(nation.id) ? mvpJobs.filter(job => job.nation === nation.id).map(job => mvpJobTypes[job.type].name) : []), ...(orders ?? []).filter(order => order.nationId === nation.id).map(order => order.name), ...((work?.nationId === nation.id ? work.jobs : undefined) ?? []).map(job => job.name), ...(korund?.bureau?.jobs ?? []).map(job => job.name)])];
  const quota = korund?.quota ?? null, stat = quota ? korundPlanStatLine(quota.unitFood, quota.targetFood) : null, caption = quota ? (quota.unitFood > quota.targetFood ? quotaBar.captions.over : quota.unitFood === quota.targetFood ? quotaBar.captions.on : quotaBar.captions.under) : null;
  const gray = korund?.gray ?? null, active = own ? (shifts ?? []).filter(shift => !shift.claimedAt) : [], assignment = own ? korund?.bureau?.assignment : null;
  return <div className="economy-v2"><PanelV2 title="Economy" subtitle={nation.name} household={{ lead: nation.id ? <NationCrest id={nation.id} size={44} force /> : null }} rowsLabel="Economy" rows={[]} stats={[]} />
    {nation.economy ? <p>Economy {nation.economy}</p> : null}{nation.currency ? <p>Currency {nation.currency}</p> : null}
    {jobs.length > 0 && <ul>{jobs.map(name => <li key={name}>{name}</li>)}</ul>}
    {active.length > 0 && <p>Your work shifts</p>}{active.map(shift => <p key={shift.id}>{shift.orderName}</p>)}
    {shown?.goods.map(good => <p key={good.good}>{good.label}{good.bestBidMinor !== null && <> {boardLabels.bestBid} {spark(good.bestBidMinor)}</>}{good.bestAskMinor !== null && <> {boardLabels.bestAsk} {spark(good.bestAskMinor)}</>}{good.lastTradeMinor !== null && <> {boardLabels.lastTrade} {spark(good.lastTradeMinor)}</>}</p>)}
    {own && shown?.myOrders.length ? <p>{boardLabels.myOpenOrders}</p> : null}{own && shown?.myOrders.map(order => <p key={order.id}>{fill((order.remaining < order.qty ? orderStateLines['partly-filled'] : orderStateLines.open).text, { filled: order.qty - order.remaining, qty: order.qty, good: shown.goods.find(good => good.good === order.good)?.label ?? order.good })}</p>)}
    {stat && <p>{stat}</p>}{quota && <p>{quotaBar.label}</p>}{quota && <p>{fill(quotaBar.progress.text, { output: quota.unitFood, target: quota.targetFood })}</p>}{caption && <p>{caption.text}</p>}
    {korund?.queue && korund.queue.waiting !== undefined ? <p>{fill(queueCopy.queueSize.text, { waiting: korund.queue.waiting })}</p> : null}{own && korund?.queue?.position != null ? <p>{fill(queueCopy.states.waiting.text, { position: korund.queue.position })}</p> : null}
    {korund && typeof korund.couponFoodRemaining === 'number' ? <p>{couponCard.labels.food}</p> : null}{korund?.rationCut ? <p>{rationCut.notice.text}</p> : null}{korund?.rationRecovery ? <p>{rationRecovery.notice.text}</p> : null}
    {assignment && <p>{bureauText.header}</p>}{assignment && <p>{outcomeNotice(assignment.outcome, { id: assignment.jobId, name: assignment.jobName }).headline}</p>}
    {gray && <p>{grayText.label}</p>}{gray && <p>{grayText.subtitle}</p>}{own && gray ? grayText.warning.map(line => <p key={line}>{line}</p>) : null}
    {gray?.rumoredRate != null ? <p>{own ? rumorLine(gray.rumoredRate) : grayText.rumorLabel}</p> : null}{gray?.rumoredRate != null && !own ? <p>{rate(gray.rumoredRate)}</p> : null}
    {own && gray && (gray.offers?.length ?? 0) === 0 && !gray.myOffer ? <p>{noOffersLine}</p> : null}{own && gray?.myOffer ? <p>{grayText.yourOffer}</p> : null}</div>;
}
