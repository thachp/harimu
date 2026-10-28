'use client';
// #789: Kindle "National budget" card (docs §12.12). Fetches GET /api/kindle/budget once; renders nothing when the flag is off (404) or the read fails.
import { useEffect, useState } from 'react';
import type { KindleBudget } from '@/lib/kindle-budget';

const spk = (minor: number) => `${(minor / 100).toFixed(2)} SPK`;
/** #811: one fetch shared by the card and the Nation panel's Treasury row. `enabled` false: no request, null. */
export function useKindleBudget(enabled: boolean): KindleBudget | null {
  const [budget, setBudget] = useState<KindleBudget | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch('/api/kindle/budget', { cache: 'no-store', signal: controller.signal })
      .then(async r => { if (r.ok) setBudget(((await r.json()) as { budget?: KindleBudget }).budget ?? null); })
      .catch(() => {});
    return () => controller.abort();
  }, [enabled]);
  return enabled ? budget : null;
}
export function KindleBudgetCard({ budget }: { budget: KindleBudget | null }) {
  return budget ? <KindleBudgetView budget={budget} /> : null;
}

/** Presentational: the server's integer minor units, shown as SPK (render-tested in tests/kindle-budget-789.test.mjs). */
export function KindleBudgetView({ budget }: { budget: KindleBudget }) {
  return <section className="kindle-budget-card" aria-label="National budget">
    <h3>National budget</h3>
    <dl>
      <dt>Treasury balance</dt><dd>{spk(budget.treasuryMinor)}</dd>
      <dt>Income tax collected this game day</dt><dd>{spk(budget.todayTaxMinor)}</dd>
      {budget.salesTaxTodayMinor !== undefined ? <><dt>Sales tax today</dt><dd>{spk(budget.salesTaxTodayMinor)}</dd></> : null}
      <dt>Income tax rate</dt><dd>{budget.ratePercent > 0 ? `${budget.ratePercent}% (${budget.rateSource})` : 'Not collected'}</dd>
    </dl>
    <h4>Spending</h4>
    <ul>{budget.categories.map(c => <li key={c.name}>{c.name}: {c.spentMinor === null ? 'no spending yet' : spk(c.spentMinor)}</li>)}</ul>
  </section>;
}
