'use client';

import { useEffect, useState } from 'react';
import type { Economy } from '@/lib/economy';
import type { WorkShift } from '@/lib/work-shifts';

export function WorkShiftBoard({ shifts, pending, error, localDemo, economy, onRefresh, onClaim }: {
  shifts: WorkShift[];
  economy: Economy | null;
  onRefresh: () => void;
  pending: boolean;
  localDemo: boolean;
  error: string | null;
  onClaim: (id: string) => void;
}) {
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

  return (
    <section id="citizen-work-shifts" className="work-shift-status" aria-label="Your work shifts">
      <strong>Your work shifts</strong>
      {localDemo && <p>Local demo · saved in this browser only. Contributions do not change the shared world.</p>}
      {economy && <div aria-label="Citizen wallet and inventory">
        <p><strong>Wallet: {(economy.walletMinor / 100).toFixed(2)} SPK</strong></p>
        <p>{economy.inventory.length ? economy.inventory.map((item) => `${item.quantity} ${item.item}`).join(' · ') : 'Inventory empty · finish work to earn goods'}</p>
        <small>Capacity recovers up to 24 WC at {new Date(economy.nextRecoveryAt).toLocaleString()}</small>
      </div>}
      <button type="button" disabled={pending} onClick={onRefresh}>Refresh citizen account</button>
      <p>One shift at a time. Work continues while you are away.</p>
      {error && <p role="alert">{error}</p>}
      {active ? (
        <div>
          <strong>{active.orderName}</strong>
          {active.wageMinor !== undefined && <p>On completion: {(active.wageMinor / 100).toFixed(2)} SPK + {active.rewardQuantity} {active.rewardItem}</p>}
          <p>Public contribution target: {active.output} · {active.capacitySpent} WC committed</p>
          <p>{remaining > 0 ? `Underway · ${Math.ceil(remaining / 60000)} min remaining` : 'Shift complete · ready to record'}</p>
          <small>Finishes {new Date(active.completesAt).toLocaleString()}</small>
          <button disabled={pending || remaining > 0 || !now} onClick={() => onClaim(active.id)} type="button">
            {pending ? 'Recording…' : 'Collect wages and goods'}
          </button>
        </div>
      ) : <p>Choose a contribution to start your next shift.</p>}
      {completed.map((shift) => (
        <p key={shift.id}><strong>Recorded: {shift.orderName}</strong><br />{shift.wageMinor !== undefined ? `${(shift.wageMinor / 100).toFixed(2)} SPK + ${shift.rewardQuantity} ${shift.rewardItem}` : shift.output}</p>
      ))}
    </section>
  );
}
