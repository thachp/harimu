'use client';
import {useDisplayTimestamp} from './display-preferences';
import { disabledReasonProps } from '@/lib/action-reasons';
import { GameTimer } from './game-timer';

import { useEffect, useState } from 'react';
import type { Economy } from '@/lib/economy';
import type { WorkShift } from '@/lib/work-shifts';

// Grade labels mirror lib/shift-quality.ts (kept inline so this board stays dependency-light).
const gradeNames: Record<string, string> = { poor: 'Poor', fair: 'Fair', good: 'Good', excellent: 'Excellent' };
const gradeLabel = (grade: WorkShift['qualityGrade']) => grade ? gradeNames[grade] : 'Base (step skipped)';
const qualityText = (shift: WorkShift) => shift.qualityMultiplierPct === undefined ? '' : ` · Quality: ${gradeLabel(shift.qualityGrade)} ×${(shift.qualityMultiplierPct / 100).toFixed(2)}`;
const seasonHistory = (output: string) => { const mark = output.match(/ · ([A-Z][a-z]+: [+\u2212]\d+% harvest)$/); return mark ? ` · ${mark[1]}` : ''; }; // #1033
import type { SceneView } from '@/lib/scene-navigation';
import { describeKindlePay } from '@/lib/income-tax';

export function WorkShiftBoard({ shifts, pending, error, localDemo, economy, onRefresh, onClaim, onNavigate }: {
  onNavigate?: (view: SceneView) => void;
  shifts: WorkShift[];
  economy: Economy | null;
  onRefresh: () => void;
  pending: boolean;
  localDemo: boolean;
  error: string | null;
  onClaim: (id: string) => void;
}) {
  const formatTime=useDisplayTimestamp();
  const [now, setNow] = useState(0);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const active = shifts.find((shift) => !shift.claimedAt);
  const completed = shifts.filter((shift) => shift.claimedAt).slice(0, 3);
  const remaining = active ? Math.max(0, Date.parse(active.completesAt) - now) : 0;

  const claimReason = pending ? 'An action is being saved. Please wait.' : !now ? 'Checking the shift timer…' : remaining > 0 ? 'Your shift is underway. Return when it finishes to collect.' : null;

  return (
    <section id="citizen-work-shifts" className="work-shift-status" aria-label="Your work shifts">
      <strong>Your work shifts</strong>
      {localDemo && <p>Local demo · saved in this browser only. Contributions do not change the shared world.</p>}
      {economy && <div aria-label="Citizen wallet and inventory">
        <p><strong>Wallet: {(economy.walletMinor / 100).toFixed(2)} SPK</strong></p>
        <p>{economy.inventory.length ? economy.inventory.map((item) => `${item.quantity} ${item.item}`).join(' · ') : 'Inventory empty · finish work to earn goods'}</p>
        <GameTimer endsAt={economy.nextRecoveryAt} label="Capacity recovery" />
      </div>}
      <button type="button" disabled={pending} aria-describedby={pending ? "work-pending-reason" : undefined} onClick={onRefresh}>Refresh citizen account</button>
      {pending && <small id="work-pending-reason">An action is being saved. Please wait.</small>}
      <p>One shift at a time. Work continues while you are away.</p>
      {error && <p role="alert">{error}</p>}
      {active ? (
        <div>
          <strong>{active.orderName}</strong>
          {active.wageMinor !== undefined && <p>On completion: {describeKindlePay(active.wageMinor, economy?.incomeTaxPercent ?? 0)} + {active.rewardQuantity} {active.rewardItem}{qualityText(active)}</p>}
          {active.qualityPending && <p>Quality step recorded · your grade and reward are revealed when the shift completes.</p>}
          <p>Public contribution target: {active.output} · {active.capacitySpent} WC committed</p>
          <p>{remaining > 0 ? `Underway · ${Math.ceil(remaining / 60000)} min remaining` : 'Shift complete · ready to record'}</p>
          <GameTimer endsAt={active.completesAt} label="Shift ends in" readyLabel="Shift ready" />
          <button {...disabledReasonProps(claimReason, "work-claim-reason")} onClick={() => { if (!claimReason) onClaim(active.id); }} type="button">
            {pending ? 'Recording…' : 'Collect wages and goods'}
          </button>
          {claimReason && <small id="work-claim-reason">{claimReason}</small>}
          {now > 0 && remaining > 0 && onNavigate && <details>
            <summary>Things to do while your shift runs</summary>
            <p>Your shift continues while you visit other scenes or close the game. Ready to collect: <time dateTime={active.completesAt}>{formatTime(active.completesAt)}</time>.</p>
            <nav aria-label="Optional activities while waiting">
              <button type="button" onClick={() => onNavigate('government')}>Read Civic decisions</button>
              <button type="button" onClick={() => onNavigate('square')}>Visit citizen chat</button>
              <button type="button" onClick={() => onNavigate('household')}>Write a private household note</button>
            </nav>
            <p>Reading decisions and private notes do not count as political actions. Petitions require phone verification and can end your citizenship change window.</p>
          </details>}
        </div>
      ) : <p>Choose a contribution to start your next shift.</p>}
      {completed.map((shift) => (
        <p key={shift.id}><strong>Recorded: {shift.orderName}</strong><br />{shift.wageMinor !== undefined ? `${(shift.wageMinor / 100).toFixed(2)} SPK + ${shift.rewardQuantity} ${shift.rewardItem}${qualityText(shift)}${seasonHistory(shift.output)}` : shift.output}</p>
      ))}
    </section>
  );
}
