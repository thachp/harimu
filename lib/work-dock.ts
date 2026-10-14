import type { WorkShift } from './work-shifts';

// Issue #54: the Available jobs dock must match the work panel and label only the active job.
export type DockOrder = { id: string; name: string; cost: number };

/** Status suffix for one job in the dock, given the citizen's shifts and the current time (ms). */
export function workOrderDockStatus(order: DockOrder, shifts: readonly WorkShift[], capacity: number, now: number): string {
  const active = shifts.find((shift) => !shift.claimedAt);
  if (active) {
    const mine = active.workOrderId ? active.workOrderId === order.id : active.orderName === order.name;
    if (!mine) return 'Collect your active shift first';
    return Date.parse(active.completesAt) <= now ? 'Shift complete · ready to collect' : 'Shift in progress';
  }
  return capacity < order.cost ? 'More capacity needed' : '';
}
