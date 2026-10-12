'use client';

import { useEffect, useState } from 'react';
import type { WorkShift } from '@/lib/work-shifts';

export function WorkShiftBoard({ shifts, pending, error, localDemo, onClaim }: {
  shifts: WorkShift[];
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
    <section className="work-shift-status" aria-label="Your work shifts">
      <strong>Your work shifts</strong>
      {localDemo && <p>Local demo · saved in this browser only. Contributions do not change the shared world.</p>}
      <p>One shift at a time. Work continues while you are away.</p>
      {error && <p role="alert">{error}</p>}
      {active ? (
        <div>
          <strong>{active.orderName}</strong>
          <p>{active.output} · {active.capacitySpent} WC committed</p>
          <p>{remaining > 0 ? `Underway · ${Math.ceil(remaining / 60000)} min remaining` : 'Shift complete · ready to record'}</p>
          <small>Finishes {new Date(active.completesAt).toLocaleString()}</small>
          <button disabled={pending || remaining > 0 || !now} onClick={() => onClaim(active.id)} type="button">
            {pending ? 'Recording…' : 'Record completed shift'}
          </button>
        </div>
      ) : <p>Choose a contribution to start your next shift.</p>}
      {completed.map((shift) => (
        <p key={shift.id}><strong>Recorded: {shift.orderName}</strong><br />{shift.output}</p>
      ))}
    </section>
  );
}
