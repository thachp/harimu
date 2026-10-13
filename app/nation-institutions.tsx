'use client';

import { useState } from 'react';
import { rewards } from '@/lib/economy';
import './nation-institutions.css';

export type InspectedNation = {
  id: string; name: string; shortName: string; capital: string; government: string; economy: string;
  currency: string; religion: string; population: string; treasury: string; stability: number; motto: string; tradeStatus: string;
};
type InstitutionWork = { id: string; name: string; detail: string; cost: number; nationId?: string | null };
export function NationInstitutions({ nation, citizenNation, capacity, workOrders, workPending,
  onWorldView, onHousehold, onWorkplace, onCommitWork }: {
  nation: InspectedNation; nations?: InspectedNation[]; citizenNation?: InspectedNation; capacity: number;
  workOrders: InstitutionWork[]; workPending: boolean; onSelectNation?: (id: string) => void;
  onWorldView: () => void; onHousehold: () => void; onWorkplace: () => void;
  onCommitWork: (order: InstitutionWork) => void | Promise<void>;
}) {
  const [selectedSystemId, setSelectedSystemId] = useState('capital');
  const systems = [
    { id: 'capital', label: 'Capital', title: nation.capital, detail: 'Computer-controlled leaders follow fixed game rules. AI/SI means artificial or simulated intelligence; no live AI model is connected.' },
    { id: 'currency', label: 'Currency', title: nation.currency.split(' · ')[0], detail: `${nation.currency}. ${nation.id === 'korund' ? 'Labor Notes stay in Korund’s separate ledger. Coupon rations replace legal private-market food purchases; LN spending is planned.' : 'This is the nation’s designed currency regime. International exchange and conversion are planned.'}` },
    { id: 'corridor', label: 'Trade', title: 'Trade corridor', detail: `${nation.tradeStatus}. Cross-border settlement, transport and corridor controls are design context; they are not simulated here yet.` },
    { id: 'commons', label: 'Civic life', title: 'Civic institutions', detail: 'Counted petitions require Tier 1 phone verification, which is not available yet. Elections, protests and public-opinion systems are planned.' },
    { id: 'works', label: 'Public works', title: 'Production and reserves', detail: `${nation.economy}. ${nation.id === 'kindle' ? 'Paid contribution shifts produce recorded output and agreed citizen rewards.' : nation.id === 'korund' ? 'Assigned food-production shifts pay Labor Notes and replenish the finite state ration pool.' : nation.id === 'aurelle' ? 'Chartered service pays Crowns and earns bounded Favor; food is sold from finite estate stock.' : 'This nation’s work and production ledger is planned.'}` },
  ];
  const system = systems.find(item => item.id === selectedSystemId) ?? systems[0];
  const ownNation = nation.id === citizenNation?.id;
  const jobs = nation.id === 'kindle' ? workOrders.filter(order => !order.nationId || order.nationId === 'kindle') : [];
  return <section className="nation-inspector" aria-label={`${nation.name} institutions`}>
    <dl><dt>Government</dt><dd>{nation.government}</dd><dt>Economy</dt><dd>{nation.economy}</dd><dt>Official faith stance</dt><dd>{nation.religion}</dd></dl>
    <details><summary>Example nation profile</summary><p>Illustrative starting figures, not measured live conditions.</p>
      <dl><dt>Population</dt><dd>{nation.population}</dd><dt>Treasury</dt><dd>{nation.treasury}</dd><dt>Stability</dt><dd>{nation.stability} / 100</dd></dl>
    </details>
    <div className="nation-inspector-systems" role="group" aria-label="Institution systems">
      {systems.map(item => <button key={item.id} type="button" aria-pressed={item.id === system.id} onClick={() => setSelectedSystemId(item.id)}>{item.label}</button>)}
    </div>
    <article aria-live="polite"><h3>{system.title}</h3><p>{system.detail}</p></article>
    {jobs.length > 0 && <details className="nation-inspector-jobs"><summary>Paid contributions</summary>
      {!ownNation && <p>Kindle citizens only. Your citizenship remains {citizenNation?.shortName ?? 'unselected'}.</p>}
      {jobs.map(order => <article key={order.id}><h4>{order.name}</h4><p>{order.detail} · {order.cost} WC
        {rewards[order.id] && ` · ${(rewards[order.id].wageMinor / 100).toFixed(2)} SPK + ${rewards[order.id].quantity} ${rewards[order.id].item}`}</p>
        {ownNation && <button type="button" disabled={workPending || capacity < order.cost} aria-describedby={workPending || capacity < order.cost ? `institution-work-${order.id}-reason` : undefined} onClick={() => { if (!workPending && capacity >= order.cost) void onCommitWork(order); }}>Start shift · {order.cost} WC</button>}
        {ownNation && (workPending || capacity < order.cost) && <small id={`institution-work-${order.id}-reason`}>{workPending ? 'An action is being saved. Please wait.' : `You need ${order.cost} WC. Prepare a meal or wait for recovery.`}</small>}
      </article>)}
    </details>}
    {ownNation && nation.id === 'korund' && <button type="button" onClick={onWorkplace}>Open your Labor Bureau assignment</button>}
    <div className="nation-inspector-links"><button type="button" onClick={onWorldView}>World globe</button>
      <button type="button" onClick={onHousehold}>{citizenNation ? `Household · ${citizenNation.shortName}` : 'Household and citizenship'}</button></div>
  </section>;
}
