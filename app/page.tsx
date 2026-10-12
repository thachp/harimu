'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { WorkShiftBoard } from './work-shift-board';
import { shiftRules, type WorkShift } from '@/lib/work-shifts';
import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from '@clerk/nextjs';
import {
  ArrowLeft,
  ArrowRight,
  Bank,
  Buildings,
  CalendarDots,
  Check,
  ClockCountdown,
  Coins,
  Drop,
  FirstAidKit,
  Info,
  Leaf,
  MapPin,
  Notebook,
  Pulse,
  Scales,
  ShieldCheck,
  Storefront,
  Student,
  Train,
  UsersThree,
  Warehouse,
  Waves,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { clerkConfigured } from './providers';

type MapMode = 'sovereignty' | 'trade' | 'influence';
type ViewMode = 'world' | 'nation' | 'planning';
type PlanHorizon = 'today' | 'week' | 'season';

type Nation = {
  id: string;
  name: string;
  shortName: string;
  government: string;
  economy: string;
  currency: string;
  religion: string;
  capital: string;
  population: string;
  treasury: string;
  stability: number;
  color: string;
  softColor: string;
  motto: string;
  tradeStatus: string;
  position: { x: number; y: number };
};

type WorkOrder = {
  id: string;
  nationId?: string | null;
  name: string;
  detail: string;
  cost: number;
};

type PlanningTask = {
  id: string;
  title: string;
  detail: string;
  meta: string;
  effects: {
    capacity: number;
    influence: number;
    water: number;
    stability: number;
  };
  outcome: string;
  infrastructureId: string;
  householdMemberId: string;
};

type CitizenDecision = {
  decisionId: string;
  optionId: string;
  infrastructureId: string;
  householdMemberId: string;
  effects: PlanningTask['effects'];
  outcome: string;
  committedAt: string;
};

type CitizenshipStatus = {
  enrolledAt: string;
  graceEndsAt: string;
  changesRemaining: number;
  politicalActionTaken: boolean;
  canChange: boolean;
  lockedReason: 'political-action' | 'change-used' | 'grace-expired' | null;
};

type DecisionCommitInput = {
  optionId: string;
  infrastructureId: string;
  householdMemberId: string;
};

type WorldEvent = {
  id: number;
  kind: string;
  headline: string;
  detail: string;
  location: string | null;
  occurredAt: string;
};

const fallbackNations: Nation[] = [
  {
    id: 'kindle',
    name: 'Kindle Republic',
    shortName: 'Kindle',
    government: 'Liberal democracy',
    economy: 'Market capitalism',
    currency: 'Spark (SPK) · free float',
    religion: 'Secular pluralism',
    capital: 'Forgehaven',
    population: '1.42m',
    treasury: 'SPK 86.4m',
    stability: 78,
    color: '#cf4b32',
    softColor: '#edc1b8',
    motto: 'Anyone can rise - and anyone can fall.',
    tradeStatus: 'Open exchange',
    position: { x: 85, y: 67 },
  },
  {
    id: 'confluence',
    name: 'The Confluence',
    shortName: 'Confluence',
    government: 'Single-party socialist state',
    economy: 'Socialist-oriented market',
    currency: 'Current (CUR) · managed band',
    religion: 'Registered faiths',
    capital: 'Meetwater',
    population: '1.16m',
    treasury: 'CUR 61.8m',
    stability: 83,
    color: '#2776a6',
    softColor: '#b7d4e5',
    motto: 'Many rivers, one current.',
    tradeStatus: 'Managed band',
    position: { x: 50, y: 88 },
  },
  {
    id: 'meridian',
    name: 'Meridian',
    shortName: 'Meridian',
    government: 'Party-state',
    economy: 'State capitalism with SEZs',
    currency: 'Gauge (GAU) · crawling peg',
    religion: 'State-supervised associations',
    capital: 'Steamgate',
    population: '1.87m',
    treasury: 'GAU 103.1m',
    stability: 86,
    color: '#a1639c',
    softColor: '#dec7dc',
    motto: 'Order today, prosperity tomorrow.',
    tradeStatus: 'SEZ convertibility',
    position: { x: 72, y: 82 },
  },
  {
    id: 'korund',
    name: 'Korund',
    shortName: 'Korund',
    government: 'Full communism; leader for life',
    economy: 'Central planning',
    currency: 'Labor Note (LN) + ration coupons',
    religion: 'State atheism',
    capital: 'Stonehearth',
    population: '1.31m',
    treasury: 'LN 58.2m',
    stability: 68,
    color: '#75654e',
    softColor: '#d3cabd',
    motto: 'Nobody falls through the stone.',
    tradeStatus: 'State bureau only',
    position: { x: 14, y: 45 },
  },
  {
    id: 'aurelle',
    name: 'Aurelle',
    shortName: 'Aurelle',
    government: 'Absolute hereditary monarchy',
    economy: 'Royal charters and fiefs',
    currency: 'Crown (CRN) · gold-backed',
    religion: 'Kinward Rite state church',
    capital: 'Highspire',
    population: '924k',
    treasury: 'CRN 74.6m',
    stability: 72,
    color: '#94afbf',
    softColor: '#d9e2e8',
    motto: "Win the crown's favor - or take the crown.",
    tradeStatus: 'Royal charter',
    position: { x: 72, y: 28 },
  },
  {
    id: 'ilmar',
    name: 'Ilmar Sanctum',
    shortName: 'Ilmar',
    government: 'Theocracy',
    economy: 'Endowment economy',
    currency: 'Prism (PRM) · Canon rules',
    religion: 'Lumen Canon theocracy',
    capital: 'Mirrorhall',
    population: '778k',
    treasury: 'PRM 48.9m',
    stability: 75,
    color: '#d3a72f',
    softColor: '#efe1af',
    motto: 'Every duty is a step toward the light.',
    tradeStatus: 'Clear Measure',
    position: { x: 28, y: 82 },
  },
  {
    id: 'hoarvale',
    name: 'Hoarvale',
    shortName: 'Hoarvale',
    government: 'Constitutional monarchy',
    economy: 'Coordinated market',
    currency: 'Rime (RIM) · inflation band',
    religion: 'Ceremonial Kinward establishment',
    capital: 'Rimehall',
    population: '1.09m',
    treasury: 'RIM 79.3m',
    stability: 81,
    color: '#45a7b8',
    softColor: '#bee0e5',
    motto: 'The Crown endures; governments answer to you.',
    tradeStatus: 'Open exchange',
    position: { x: 50, y: 20 },
  },
  {
    id: 'varkand',
    name: 'Varkand',
    shortName: 'Varkand',
    government: 'Military junta',
    economy: 'Arsenal command economy',
    currency: 'Ward (WRD) · hard peg',
    religion: 'Regulated tolerance',
    capital: 'Watchfast',
    population: '846k',
    treasury: 'WRD 52.6m',
    stability: 70,
    color: '#526b68',
    softColor: '#c5d0ce',
    motto: 'Order first. Everything else after.',
    tradeStatus: 'Alert-dependent',
    position: { x: 28, y: 28 },
  },
  {
    id: 'veldwood',
    name: 'Veldwood',
    shortName: 'Veldwood',
    government: 'Federal direct democracy',
    economy: 'Social democracy',
    currency: 'Bough (BGH) · Citizen Dividend',
    religion: 'Secular pluralism',
    capital: 'Ringhall',
    population: '1.04m',
    treasury: 'BGH 76.2m',
    stability: 84,
    color: '#5b8d42',
    softColor: '#c9dcbf',
    motto: 'Every voice, every season.',
    tradeStatus: 'Open exchange',
    position: { x: 14, y: 65 },
  },
  {
    id: 'fulmara',
    name: 'Fulmara',
    shortName: 'Fulmara',
    government: 'Mercantile oligarchic republic',
    economy: 'Chartered-company capitalism',
    currency: 'Charge (CHG) · shareholder bank',
    religion: 'Chartered pluralism',
    capital: 'Arcport',
    population: '1.22m',
    treasury: 'CHG 91.7m',
    stability: 74,
    color: '#6440a0',
    softColor: '#cbbde1',
    motto: 'Fortune is the franchise.',
    tradeStatus: 'Open exchange',
    position: { x: 86, y: 46 },
  },
];

function nationMark(nation: Nation) {
  return nation.currency.match(/\(([^)]+)\)/)?.[1] ?? nation.shortName.slice(0, 2).toUpperCase();
}

function graceDeadlineLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function citizenshipRuleLabel(status: CitizenshipStatus | null) {
  if (!status) return 'One citizen · one nation';
  if (status.canChange) return `One free change available until ${graceDeadlineLabel(status.graceEndsAt)}`;
  if (status.lockedReason === 'political-action') return 'Locked by your first political action';
  if (status.lockedReason === 'change-used') return 'Your one free change has been used';
  if (status.lockedReason === 'grace-expired') return 'The 48-hour grace period has ended';
  return 'One citizen · one nation';
}

const fallbackWorkOrders: WorkOrder[] = [
  { id: 'harvest', nationId: 'kindle', name: 'Support the savanna harvest', detail: '+480 food · resolves in 2h', cost: 4 },
  { id: 'freight', nationId: 'kindle', name: 'Move a foundry convoy', detail: '+210 materials · resolves in 4h', cost: 6 },
  { id: 'archive', nationId: 'kindle', name: 'Catalogue the civic archive', detail: '+95 knowledge · resolves in 3h', cost: 3 },
];

const modeDescriptions: Record<MapMode, string> = {
  sovereignty: 'Recognized borders, national capitals, and sovereign territory',
  trade: 'Commercial access, open corridors, and restricted crossings',
  influence: 'Foreign pressure, public legitimacy, and the civic pull of each region',
};

const fallbackPlanningItems: PlanningTask[] = [
  {
    id: 'capacity',
    title: 'Commit Work Capacity',
    detail: 'Reserve 6 WC for the Forgehaven East harvest crews.',
    meta: '6 WC · before 20:00',
    effects: { capacity: -6, influence: 20, water: 4, stability: 1 },
    outcome: 'Harvest crews reinforce the intake before the storm, protecting tomorrow’s reserve.',
    infrastructureId: 'waterworks',
    householdMemberId: 'citizen',
  },
  {
    id: 'forum',
    title: 'Attend the district forum',
    detail: 'Hear arguments on the eastern waterworks proposal.',
    meta: 'Civic · 21:30',
    effects: { capacity: -2, influence: 80, water: 3, stability: 3 },
    outcome: 'The household joins the forum and keeps emergency repair funding open.',
    infrastructureId: 'council',
    householdMemberId: 'partner',
  },
  {
    id: 'ballot',
    title: 'Review the trade ballot',
    detail: 'Compare the open-corridor and licensed-market measures.',
    meta: 'Vote closes in 2d',
    effects: { capacity: 0, influence: 50, water: 1, stability: 2 },
    outcome: 'The household completes the trade review, improving the route for replacement pump parts.',
    infrastructureId: 'depot',
    householdMemberId: 'apprentice',
  },
];

const fallbackWorldEvents: WorldEvent[] = [
  { id: 1, occurredAt: 'Today · 20:00', headline: 'Capacity grant closes', kind: 'Work', detail: 'Forgehaven closes allocations for tomorrow’s savanna harvest.', location: 'Forgehaven' },
  { id: 2, occurredAt: 'Day 43 · 09:00', headline: 'District assembly session', kind: 'Civic', detail: 'The eastern waterworks proposal enters public debate.', location: 'Forgehaven East' },
  { id: 3, occurredAt: 'Day 45 · 18:00', headline: 'Trade corridor vote', kind: 'Ballot', detail: 'Citizens decide the Kindle-Confluence corridor mandate.', location: 'Kindle Assembly' },
];

const townInfrastructure = [
  {
    id: 'council',
    name: 'Ward Council',
    kind: 'Civic administration',
    status: 'Assembly in session',
    detail: 'Five delegates are reviewing the eastern waterworks allocation.',
    x: '19%',
    y: '20%',
    icon: Bank,
  },
  {
    id: 'cooperative',
    name: 'East Ward Growers',
    kind: 'Food & employment',
    status: 'Shift needs 6 WC',
    detail: 'Savanna crews can secure tomorrow’s harvest before the evening storm.',
    x: '71%',
    y: '22%',
    icon: Warehouse,
  },
  {
    id: 'market',
    name: 'Lantern Market',
    kind: 'Trade & household supply',
    status: 'Open until 22:00',
    detail: 'Staple prices are steady; repair parts are moving quickly.',
    x: '43%',
    y: '46%',
    icon: Storefront,
  },
  {
    id: 'clinic',
    name: 'Public Clinic',
    kind: 'Health & care',
    status: 'Normal capacity',
    detail: 'The ward clinic has medicine and two evening appointments remaining.',
    x: '18%',
    y: '68%',
    icon: FirstAidKit,
  },
  {
    id: 'school',
    name: 'Forge Street School',
    kind: 'Education',
    status: 'Classes resume Day 43',
    detail: 'Apprentice placements will be announced after the district forum.',
    x: '47%',
    y: '72%',
    icon: Student,
  },
  {
    id: 'waterworks',
    name: 'Eastern Waterworks',
    kind: 'Water security',
    status: 'Decision required',
    detail: 'One intake is offline. The ward must choose between repair and reserve storage.',
    x: '79%',
    y: '50%',
    icon: Waves,
  },
  {
    id: 'depot',
    name: 'Eastline Freight Depot',
    kind: 'Trade & transport',
    status: 'Freight due 06:40',
    detail: 'The Confluence materials convoy is expected before first shift.',
    x: '75%',
    y: '78%',
    icon: Train,
  },
] as const;

const householdPortraits = {
  citizen: '/assets/household/leora-vale.webp',
  partner: '/assets/household/toma-vale.webp',
  apprentice: '/assets/household/mika-vale.webp',
  child: '/assets/household/niko-vale.webp',
};

function subscribeToLocation(onStoreChange: () => void) {
  window.addEventListener('popstate', onStoreChange);
  return () => window.removeEventListener('popstate', onStoreChange);
}

function getLocationSearch() {
  return window.location.search;
}

function getServerLocationSearch() {
  return '';
}

type NationDashboardProps = {
  nation: Nation;
  nations: Nation[];
  citizenNation: Nation | undefined;
  capacity: number;
  workOrders: WorkOrder[];
  worldEvents: WorldEvent[];
  onSelectNation: (nationId: string) => void;
  onWorldView: () => void;
  onPlanningView: () => void;
  workPending: boolean;
  workStatus: React.ReactNode;
  onCommitWork: (order: WorkOrder) => void | Promise<void>;
};

function NationDashboard({
  nation,
  nations,
  citizenNation,
  capacity,
  workOrders,
  worldEvents,
  onSelectNation,
  onWorldView,
  onPlanningView,
  onCommitWork,
  workPending,
  workStatus,
}: NationDashboardProps) {
  const nationalSystems = useMemo(() => {
    const base = nation.stability;
    const currencyName = nation.currency.split(' · ')[0];

    return [
      {
        id: 'capital',
        name: `${nation.capital} District`,
        kind: 'Seat of government',
        status: 'Institutions operating normally',
        detail: `${nation.government} is administered from the capital district, where the current national session is in progress.`,
        health: Math.min(96, base + 5),
        x: '47%',
        y: '34%',
        icon: Bank,
      },
      {
        id: 'currency',
        name: `${currencyName} Reserve`,
        kind: 'Currency & settlement',
        status: base >= 80 ? 'Confidence above target' : 'Confidence under review',
        detail: `${nation.currency} anchors domestic exchange in ${nation.shortName}; cross-border access is currently ${nation.tradeStatus.toLowerCase()}.`,
        health: Math.min(94, base + 2),
        x: '70%',
        y: '25%',
        icon: Coins,
      },
      {
        id: 'corridor',
        name: 'National Trade Corridor',
        kind: 'Freight & foreign exchange',
        status: nation.tradeStatus,
        detail: `${nation.tradeStatus} governs the road, sea, rail, and market crossings connecting the nation to the wider Harimu economy.`,
        health: Math.max(54, base - 7),
        x: '76%',
        y: '67%',
        icon: Train,
      },
      {
        id: 'commons',
        name: 'Civic Commons',
        kind: 'Citizen services & assemblies',
        status: 'Public session active',
        detail: `Local councils translate the national mandate into health, education, and household services across ${nation.shortName}.`,
        health: Math.max(58, base - 2),
        x: '26%',
        y: '58%',
        icon: UsersThree,
      },
      {
        id: 'works',
        name: 'Strategic Works Reserve',
        kind: 'Materials & emergency capacity',
        status: 'Mobilization ready',
        detail: `National stores hold equipment and materials for public works, disaster response, and regional maintenance.`,
        health: Math.max(50, base - 10),
        x: '36%',
        y: '78%',
        icon: Warehouse,
      },
    ];
  }, [nation]);
  const [selectedSystemId, setSelectedSystemId] = useState('capital');
  const [selectedAgendaIndex, setSelectedAgendaIndex] = useState(0);
  const selectedSystem = nationalSystems.find((system) => system.id === selectedSystemId) ?? nationalSystems[0];
  const SelectedSystemIcon = selectedSystem.icon;
  const nationalWork = workOrders.filter((order) => !order.nationId || order.nationId === nation.id);
  const agenda = nationalWork.length > 0
    ? nationalWork.slice(0, 3).map((order, index) => ({
        id: order.id,
        label: index === 0 ? 'Active national program' : 'Open public work',
        title: order.name,
        detail: order.detail,
        source: `${order.cost} WC requested`,
        order,
      }))
    : worldEvents.slice(0, 3).map((event) => ({
        id: String(event.id),
        label: event.kind,
        title: event.headline,
        detail: event.detail,
        source: event.location ?? 'World record',
        order: null,
      }));
  const selectedAgenda = agenda[selectedAgendaIndex] ?? agenda[0];
  const isCitizenNation = citizenNation?.id === nation.id;

  return (
    <section
      className="nation-command-view"
      aria-label={`${nation.name} nation view`}
      style={{ '--nation': nation.color, '--nation-soft': nation.softColor } as CSSProperties}
    >
      <aside className="nation-command-rail" aria-label="Choose a nation">
        <div className="nation-rail-title">
          <span>National registry</span>
          <strong>{nations.length} sovereign nations</strong>
        </div>
        <div className="nation-command-list">
          {nations.map((item) => (
            <button
              aria-pressed={item.id === nation.id}
              key={item.id}
              onClick={() => onSelectNation(item.id)}
              style={{ '--item-color': item.color } as CSSProperties}
              type="button"
            >
              <span aria-hidden="true">{nationMark(item)}</span>
              <span><strong>{item.shortName}</strong><small>{item.capital}</small></span>
              <em>{item.stability}%</em>
            </button>
          ))}
        </div>
        <button className="nation-back-button" onClick={onWorldView} type="button">
          <ArrowLeft aria-hidden="true" size={15} /> World atlas
        </button>
      </aside>

      <section className="nation-command-main">
        <header className="nation-command-heading">
          <div className="nation-command-identity">
            <span className="nation-command-sigil" aria-hidden="true">{nationMark(nation)}</span>
            <div>
              <span className="eyebrow">National command · {nation.currency}</span>
              <h1>{nation.name}</h1>
              <p>“{nation.motto}”</p>
            </div>
          </div>
          <dl className="nation-command-metrics">
            <div><dt>Citizens</dt><dd>{nation.population}</dd></div>
            <div><dt>Treasury</dt><dd>{nation.treasury}</dd></div>
            <div><dt>Stability</dt><dd>{nation.stability}%</dd></div>
            <div><dt>Trade</dt><dd>{nation.tradeStatus}</dd></div>
          </dl>
        </header>

        <section className="national-map" aria-label={`${nation.shortName} systems map`}>
          <div className="national-map-shade" aria-hidden="true" />
          <div className="national-map-label">
            <span><MapPin aria-hidden="true" size={14} /> Territorial systems · live</span>
            <strong>{nation.capital} and national regions</strong>
            <small>Select infrastructure to inspect readiness.</small>
          </div>

          {nationalSystems.map((system) => {
            const SystemIcon = system.icon;
            const active = system.id === selectedSystem.id;
            return (
              <button
                aria-label={`${system.name}, ${system.status}`}
                aria-pressed={active}
                className={`national-system-marker ${active ? 'is-active' : ''}`}
                key={system.id}
                onClick={() => setSelectedSystemId(system.id)}
                style={{ '--system-x': system.x, '--system-y': system.y } as CSSProperties}
                type="button"
              >
                <span><SystemIcon aria-hidden="true" size={18} weight={active ? 'fill' : 'duotone'} /></span>
                <em>{system.name}</em>
              </button>
            );
          })}

          <article className="national-system-brief" aria-live="polite">
            <span><SelectedSystemIcon aria-hidden="true" size={22} weight="duotone" /></span>
            <div>
              <small>{selectedSystem.kind}</small>
              <strong>{selectedSystem.name}</strong>
              <p>{selectedSystem.detail}</p>
            </div>
            <div className="system-health">
              <b>{selectedSystem.health}%</b>
              <span><i style={{ width: `${selectedSystem.health}%` }} /></span>
              <small>{selectedSystem.status}</small>
            </div>
          </article>
        </section>

        <section className="national-systems-strip" aria-label="National system health">
          {nationalSystems.slice(1).map((system) => {
            const SystemIcon = system.icon;
            return (
              <button key={system.id} onClick={() => setSelectedSystemId(system.id)} type="button">
                <SystemIcon aria-hidden="true" size={18} weight="duotone" />
                <span><small>{system.kind}</small><strong>{system.health}% · {system.name}</strong></span>
              </button>
            );
          })}
        </section>
      </section>

      <aside className="national-agenda" aria-label="National agenda">
        <div className="national-agenda-heading">
          <div><span className="eyebrow">Day 42 · national agenda</span><h2>What the nation is deciding</h2></div>
          <span className="agenda-live"><i /> Live</span>
        </div>

        <section className="national-institutions">
          <div><Bank aria-hidden="true" size={17} /><span><small>Constitutional order</small><strong>{nation.government}</strong></span></div>
          <div><Scales aria-hidden="true" size={17} /><span><small>Economic model</small><strong>{nation.economy}</strong></span></div>
        </section>

        <div className="national-agenda-list" role="group" aria-label="National priorities">
          {agenda.map((item, index) => (
            <button
              aria-pressed={index === selectedAgendaIndex}
              key={item.id}
              onClick={() => setSelectedAgendaIndex(index)}
              type="button"
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <span><small>{item.label}</small><strong>{item.title}</strong><em>{item.source}</em></span>
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          ))}
        </div>

        {selectedAgenda && (
          <article className="national-priority-brief" aria-live="polite">
            <span>Priority brief</span>
            <h3>{selectedAgenda.title}</h3>
            <p>{selectedAgenda.detail}</p>
            {selectedAgenda.order && isCitizenNation ? (
              <button
                disabled={workPending || capacity < selectedAgenda.order.cost}
                onClick={() => void onCommitWork(selectedAgenda.order as WorkOrder)}
                type="button"
              >
                Commit {selectedAgenda.order.cost} Work Capacity
                <ArrowRight aria-hidden="true" size={16} />
              </button>
            ) : (
              <small>{isCitizenNation ? 'Public record · no citizen action required' : `Observed from ${nation.shortName}`}</small>
            )}
          </article>
        )}

        {isCitizenNation && workStatus}
        <section className="nation-citizen-link">
          <UsersThree aria-hidden="true" size={21} weight="duotone" />
          <div>
            <span>{isCitizenNation ? 'Your citizen layer' : 'Citizen planning'}</span>
            <strong>{isCitizenNation ? `Plan life in ${nation.shortName}` : `You are viewing ${nation.shortName}`}</strong>
            <p>{isCitizenNation ? 'Translate national conditions into household choices.' : 'Private planning opens in your own nation.'}</p>
          </div>
          <button onClick={onPlanningView} type="button">Open planning <ArrowRight aria-hidden="true" size={15} /></button>
        </section>
      </aside>
    </section>
  );
}

type PlanningDashboardProps = {
  citizenName: string;
  nation: Nation;
  capacity: number;
  influence: number;
  waterSecurity: number;
  wardStability: number;
  horizon: PlanHorizon;
  completedPlanIds: string[];
  planSaved: boolean;
  planningItems: PlanningTask[];
  worldEvents: WorldEvent[];
  note: string;
  nationCount: number;
  committedDecision: CitizenDecision | null;
  decisionError: string | null;
  decisionPending: boolean;
  preview?: boolean;
  onHorizonChange: (horizon: PlanHorizon) => void;
  onTogglePlan: (id: string) => void;
  onNoteChange: (note: string) => void;
  onCommitDecision: (input: DecisionCommitInput) => void | Promise<void>;
  onWorldView: () => void;
};

function ClerkAccountControl({ onOpenPlanning }: { onOpenPlanning: () => void }) {
  if (!clerkConfigured) {
    return (
      <button className="account-setup-button" onClick={onOpenPlanning} type="button">
        Connect Clerk
      </button>
    );
  }

  return (
    <div className="account-control">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="account-sign-in" type="button">Sign in</button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <UserButton
          appearance={{
            elements: {
              avatarBox: { width: '36px', height: '36px' },
            },
          }}
        />
      </Show>
    </div>
  );
}

function PlanningDashboard({
  citizenName,
  nation,
  capacity,
  influence,
  waterSecurity,
  wardStability,
  horizon,
  completedPlanIds,
  planSaved,
  planningItems,
  worldEvents,
  note,
  nationCount,
  committedDecision,
  decisionError,
  decisionPending,
  preview = false,
  onHorizonChange,
  onTogglePlan,
  onNoteChange,
  onCommitDecision,
  onWorldView,
}: PlanningDashboardProps) {
  const [selectedInfrastructure, setSelectedInfrastructure] = useState(
    committedDecision?.infrastructureId ?? 'waterworks',
  );
  const [selectedHouseholdMember, setSelectedHouseholdMember] = useState(
    committedDecision?.householdMemberId ?? 'citizen',
  );
  const activeInfrastructure = townInfrastructure.find((place) => place.id === selectedInfrastructure) ?? townInfrastructure[0];
  const ActivePlaceIcon = activeInfrastructure.icon;
  const decisionIcons = [Leaf, UsersThree, Scales];
  const household = [
    {
      id: 'citizen',
      name: citizenName,
      relation: 'You · citizen planner',
      role: 'Cooperative coordinator',
      wellbeing: 86,
      state: 'Ready',
      image: householdPortraits.citizen,
      connection: 'You control the household Work Capacity committed by this plan.',
    },
    {
      id: 'partner',
      name: 'Toma Vale',
      relation: 'Partner · 37',
      role: 'Waterworks mechanic',
      wellbeing: 78,
      state: 'Concerned',
      image: householdPortraits.partner,
      connection: 'Toma maintains the eastern intake and can verify the pump repair.',
    },
    {
      id: 'apprentice',
      name: 'Mika Vale',
      relation: 'Daughter · 16',
      role: 'Engineering apprentice',
      wellbeing: 82,
      state: 'Focused',
      image: householdPortraits.apprentice,
      connection: 'Mika gains practical engineering experience if repairs move forward.',
    },
    {
      id: 'child',
      name: 'Niko Vale',
      relation: 'Son · 10',
      role: 'Forge Street School pupil',
      wellbeing: 73,
      state: 'Tired',
      image: householdPortraits.child,
      connection: 'Niko’s next school day depends on reliable ward water service.',
    },
  ];
  const selectedPerson = household.find((person) => person.id === selectedHouseholdMember) ?? household[0];
  const selectedOption = planningItems.find((item) => completedPlanIds.includes(item.id)) ?? null;
  const showingActiveDecision = activeInfrastructure.id === 'waterworks';

  return (
    <section className="planning-view planning-command" aria-label="Citizen planning view">
      {preview && (
        <div className="clerk-setup-notice" role="status">
          <span>Clerk setup preview</span>
          <p>Add your Clerk keys to activate sign-in and give every citizen a private planning desk.</p>
          <code>.env.local</code>
        </div>
      )}
      <div className="civic-command">
        <header className="civic-command-bar">
          <div className="civic-place">
            <MapPin aria-hidden="true" size={21} weight="duotone" />
            <div>
              <span>Day 42 · Forgehaven East · {nationCount} nation world</span>
              <strong>{nation.capital}, {nation.shortName}</strong>
            </div>
          </div>

          <div className="civic-horizon-tabs" role="group" aria-label="Planning horizon">
            {(['today', 'week', 'season'] as PlanHorizon[]).map((item) => (
              <button
                aria-pressed={horizon === item}
                key={item}
                onClick={() => onHorizonChange(item)}
                type="button"
              >
                {item === 'week' ? '7 days' : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>

          <div className="civic-metrics" aria-label="Citizen resources">
            <div><ClockCountdown aria-hidden="true" size={18} /><span>Capacity<strong>{capacity} WC</strong></span></div>
            <div><Coins aria-hidden="true" size={18} /><span>Influence<strong>{influence.toLocaleString()}</strong></span></div>
            <div><Drop aria-hidden="true" size={18} /><span>Water security<strong>{waterSecurity}%</strong></span></div>
            <div><ShieldCheck aria-hidden="true" size={18} /><span>Ward stability<strong>{wardStability}%</strong></span></div>
          </div>

          <button className="civic-world-button" onClick={onWorldView} type="button">
            <ArrowLeft aria-hidden="true" size={15} />
            World view
          </button>
        </header>

        <div className="civic-command-grid">
          <section className="town-and-household">
            <section className="town-map" aria-label="Forgehaven East infrastructure map">
              <div className="town-map-heading">
                <span><Buildings aria-hidden="true" size={15} /> Town plan · infrastructure</span>
                <strong>Forgehaven East</strong>
                <small>Select a place to inspect its role in your plan.</small>
              </div>

              <div className="town-weather-card">
                <span>21:30</span>
                <div><Leaf aria-hidden="true" size={19} /><strong>Evening storm</strong><small>Savanna crews have 2h remaining</small></div>
              </div>

              {townInfrastructure.map((place) => {
                const PlaceIcon = place.icon;
                const active = place.id === selectedInfrastructure;
                return (
                  <button
                    aria-label={`${place.name}, ${place.status}`}
                    aria-pressed={active}
                    className={`infrastructure-marker ${active ? 'is-active' : ''}`}
                    key={place.id}
                    onClick={() => setSelectedInfrastructure(place.id)}
                    style={{ '--marker-x': place.x, '--marker-y': place.y } as CSSProperties}
                    type="button"
                  >
                    <span><PlaceIcon aria-hidden="true" size={19} weight={active ? 'fill' : 'duotone'} /></span>
                    <em>{place.name}</em>
                  </button>
                );
              })}

              <article className="town-place-card" aria-live="polite">
                <div className="town-place-icon"><ActivePlaceIcon aria-hidden="true" size={22} weight="duotone" /></div>
                <div>
                  <span>{activeInfrastructure.kind}</span>
                  <strong>{activeInfrastructure.name}</strong>
                  <p>{activeInfrastructure.detail}</p>
                </div>
                <small>{activeInfrastructure.status}</small>
              </article>

              <div className="town-map-legend" aria-label="Map legend">
                <span><i className="legend-ready" /> Stable service</span>
                <span><i className="legend-watch" /> Needs attention</span>
                <span><i className="legend-decision" /> Decision point</span>
              </div>
            </section>

            <section className="household-strip" aria-label="Citizen household">
              <div className="household-intro">
                <UsersThree aria-hidden="true" size={22} weight="duotone" />
                <span>Planning together</span>
                <strong>The Vale household</strong>
                <p>Select a family member to keep their work, care, and schooling visible while you decide.</p>
              </div>
              <div className="household-list">
                {household.map((person) => (
                  <button
                    aria-pressed={selectedHouseholdMember === person.id}
                    className={`household-card ${selectedHouseholdMember === person.id ? 'is-focused' : ''}`}
                    key={person.id}
                    onClick={() => setSelectedHouseholdMember(person.id)}
                    type="button"
                  >
                    <Image
                      alt={`Portrait of ${person.name}`}
                      height={320}
                      sizes="(max-width: 700px) 21vw, 10vw"
                      src={person.image}
                      width={320}
                    />
                    <span className="household-copy">
                      <strong>{person.name}</strong>
                      <small>{person.relation}</small>
                      <em>{person.role}</em>
                      <span className="household-state"><Pulse aria-hidden="true" size={12} /> {person.state} · {person.wellbeing}%</span>
                      <span className="trust-meter" aria-label={`${person.wellbeing}% wellbeing`}><i style={{ width: `${person.wellbeing}%` }} /></span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </section>

          <aside className="decision-panel" aria-label="Citizen decision point">
            <div className="decision-panel-heading">
              <div>
                <span className="eyebrow">{showingActiveDecision ? 'Decision point' : activeInfrastructure.kind}</span>
                <h2>{showingActiveDecision ? 'Eastern waterworks allocation' : activeInfrastructure.name}</h2>
              </div>
              <span className="decision-deadline"><CalendarDots aria-hidden="true" size={14} /> {showingActiveDecision ? '2h 18m' : activeInfrastructure.status}</span>
            </div>

            <article className="community-brief">
              <span className="community-avatar">{showingActiveDecision
                ? <Notebook aria-hidden="true" size={19} />
                : <ActivePlaceIcon aria-hidden="true" size={19} />}</span>
              <div>
                <strong>{showingActiveDecision ? 'Ward steward · verified brief' : `${activeInfrastructure.name} · town record`}</strong>
                <small>{showingActiveDecision ? (worldEvents[1]?.occurredAt ?? 'Today · 21:30') : activeInfrastructure.status}</small>
                <p>{showingActiveDecision
                  ? `${worldEvents[1]?.detail ?? 'The eastern waterworks proposal enters public debate.'} Your household’s water access is secure tonight, but the reserve will fall below target tomorrow.`
                  : activeInfrastructure.detail}</p>
              </div>
            </article>

            <div className="decision-context">
              <span>{showingActiveDecision
                ? <Drop aria-hidden="true" size={16} weight="fill" />
                : <ActivePlaceIcon aria-hidden="true" size={16} weight="fill" />}</span>
              <div>
                <small>{showingActiveDecision ? 'Infrastructure at risk' : activeInfrastructure.kind}</small>
                <strong>{showingActiveDecision ? `Eastern intake · ${waterSecurity}% reserve` : activeInfrastructure.status}</strong>
              </div>
              {showingActiveDecision ? <ArrowRight aria-hidden="true" size={18} /> : <Check aria-hidden="true" size={18} />}
            </div>

            <div className="household-impact" aria-live="polite">
              <Image alt="" aria-hidden="true" height={48} src={selectedPerson.image} width={48} />
              <div>
                <span>Household focus · {selectedPerson.role}</span>
                <strong>{selectedPerson.name}</strong>
                <p>{selectedPerson.connection}</p>
              </div>
            </div>

            {showingActiveDecision ? (
              <>
                <div className="decision-options" role="group" aria-label="Choose a civic plan">
                  {planningItems.map((item, index) => {
                    const selected = completedPlanIds.includes(item.id);
                    const DecisionIcon = decisionIcons[index] ?? Check;
                    return (
                      <button
                        aria-pressed={selected}
                        className={selected ? 'is-selected' : ''}
                        disabled={Boolean(committedDecision)}
                        key={item.id}
                        onClick={() => onTogglePlan(item.id)}
                        type="button"
                      >
                        <span className="decision-option-icon"><DecisionIcon aria-hidden="true" size={20} weight="duotone" /></span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{item.detail}</small>
                          <em>{item.meta} · Water +{item.effects.water} · Stability +{item.effects.stability}</em>
                        </span>
                        {selected ? <Check aria-hidden="true" size={18} weight="bold" /> : <ArrowRight aria-hidden="true" size={18} />}
                      </button>
                    );
                  })}
                </div>

                {selectedOption && (
                  <section className="decision-preview" aria-live="polite">
                    <div className="decision-preview-heading">
                      <span>{committedDecision ? 'Recorded outcome' : 'Expected consequence'}</span>
                      <strong>{selectedOption.title}</strong>
                    </div>
                    <div className="decision-deltas">
                      <span><small>Capacity</small><strong>{selectedOption.effects.capacity > 0 ? '+' : ''}{selectedOption.effects.capacity} WC</strong></span>
                      <span><small>Influence</small><strong>+{selectedOption.effects.influence}</strong></span>
                      <span><small>Water</small><strong>+{selectedOption.effects.water}%</strong></span>
                      <span><small>Stability</small><strong>+{selectedOption.effects.stability}%</strong></span>
                    </div>
                    <p>{committedDecision?.outcome ?? selectedOption.outcome}</p>
                  </section>
                )}

                <div className="decision-evidence">
                  <section>
                    <h3><Check aria-hidden="true" size={14} /> What we know</h3>
                    <ul>
                      <li>The eastern intake is operating on one pump.</li>
                      <li>Harvest crews need six Work Capacity tonight.</li>
                      <li>The household reserve covers one full day.</li>
                    </ul>
                  </section>
                  <section>
                    <h3><Info aria-hidden="true" size={14} /> What we assume</h3>
                    <ul>
                      <li>The evening storm will refill district reservoirs.</li>
                      <li>The Confluence parts convoy arrives before first shift.</li>
                      <li>Forum delegates keep the emergency fund open.</li>
                    </ul>
                  </section>
                </div>

                <div className="decision-note">
                  <label htmlFor="citizen-note">Private household note</label>
                  <textarea
                    id="citizen-note"
                    onChange={(event) => onNoteChange(event.target.value)}
                    rows={2}
                    value={note}
                  />
                </div>

                {decisionError && <p className="decision-error" role="alert">{decisionError}</p>}
                <div className="decision-actions">
                  <p>{committedDecision
                    ? `Added to the world record ${new Date(committedDecision.committedAt).toLocaleDateString()}.`
                    : planSaved
                      ? 'Your saved draft is ready to commit.'
                      : 'Only your household can see this draft.'}</p>
                  <button
                    disabled={completedPlanIds.length === 0 || decisionPending || Boolean(committedDecision)}
                    onClick={() => selectedOption && onCommitDecision({
                      optionId: selectedOption.id,
                      infrastructureId: activeInfrastructure.id,
                      householdMemberId: selectedHouseholdMember,
                    })}
                    type="button"
                  >
                    {committedDecision
                      ? <><Check aria-hidden="true" size={15} /> Decision recorded</>
                      : decisionPending
                        ? 'Recording…'
                        : 'Commit this decision'}
                  </button>
                </div>
              </>
            ) : (
              <section className="place-brief">
                <span>No immediate household decision</span>
                <h3>{activeInfrastructure.name} is being monitored.</h3>
                <p>The active civic choice remains at Eastern Waterworks. This place still contributes context to that decision.</p>
                <button onClick={() => setSelectedInfrastructure('waterworks')} type="button">
                  Return to active decision <ArrowRight aria-hidden="true" size={16} />
                </button>
              </section>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}

type CitizenSnapshot = {
  profile: {
    nationId: string | null;
    displayName: string | null;
    capacity: number;
    influence: number;
    standing: string;
    waterSecurity: number;
    wardStability: number;
    citizenship: CitizenshipStatus;
  } | null;
  plan: { horizon: PlanHorizon; note: string; completedIds: string[] } | null;
  decision: CitizenDecision | null;
  shifts: WorkShift[];
};

type CitizenSessionStatus = 'loading' | 'anonymous' | 'ready' | 'error';

function ClerkCitizenSession({
  onHydrate,
  onStatus,
}: {
  onHydrate: (snapshot: CitizenSnapshot) => void;
  onStatus: (status: CitizenSessionStatus) => void;
}) {
  const { isLoaded, user } = useUser();
  const userId = user?.id;

  useEffect(() => {
    if (!isLoaded) {
      onStatus('loading');
      return;
    }
    if (!userId) {
      onStatus('anonymous');
      return;
    }
    const controller = new AbortController();
    onStatus('loading');

    async function loadCitizen() {
      try {
        const response = await fetch('/api/citizen', { signal: controller.signal });
        if (!response.ok) {
          onStatus('error');
          return;
        }
        onHydrate(await response.json() as CitizenSnapshot);
        onStatus('ready');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') onStatus('error');
      }
    }

    void loadCitizen();
    return () => controller.abort();
  }, [isLoaded, onHydrate, onStatus, userId]);

  return null;
}

function SignedInPlanningDashboard(props: Omit<PlanningDashboardProps, 'citizenName' | 'preview'>) {
  const { user } = useUser();
  const citizenName = user?.firstName || user?.fullName || 'Harimu citizen';

  return (
    <PlanningDashboard
      {...props}
      citizenName={citizenName}
      key={props.committedDecision?.committedAt ?? 'draft'}
    />
  );
}

function PlanningSignInGate() {
  return (
    <section className="planning-access" aria-labelledby="planning-access-title">
      <div className="access-map" aria-hidden="true" />
      <div className="access-card">
        <span className="access-seal" aria-hidden="true">H</span>
        <span className="eyebrow">Private citizen space</span>
        <h1 id="planning-access-title">Your world is public.<br />Your plan is yours.</h1>
        <p>Sign in to prepare work, civic commitments, and ballots before they enter the permanent world record.</p>
        <div className="access-actions">
          <SignInButton mode="modal">
            <button className="access-primary" type="button">Sign in to plan</button>
          </SignInButton>
          <SignUpButton mode="modal">
            <button className="access-secondary" type="button">Create a citizen account</button>
          </SignUpButton>
        </div>
        <small>Identity and session security powered by Clerk.</small>
      </div>
    </section>
  );
}

export default function Home() {
  const [worldNations, setWorldNations] = useState<Nation[]>(fallbackNations);
  const [availableWorkOrders, setAvailableWorkOrders] = useState<WorkOrder[]>(fallbackWorkOrders);
  const [availablePlanningItems, setAvailablePlanningItems] = useState<PlanningTask[]>(fallbackPlanningItems);
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>(fallbackWorldEvents);
  const locationSearch = useSyncExternalStore(subscribeToLocation, getLocationSearch, getServerLocationSearch);
  const requestedView = new URLSearchParams(locationSearch).get('view');
  const requestedNationId = new URLSearchParams(locationSearch).get('nation');
  const [viewOverride, setViewOverride] = useState<ViewMode | null>(null);
  const viewMode: ViewMode = viewOverride
    ?? (requestedView === 'planning' ? 'planning' : requestedView === 'nation' ? 'nation' : 'world');
  const designPreview = process.env.NODE_ENV !== 'production'
    && new URLSearchParams(locationSearch).get('preview') === '1';
  const [selectedId, setSelectedId] = useState('kindle');
  const [citizenNationId, setCitizenNationId] = useState<string | null>(null);
  const [citizenshipStatus, setCitizenshipStatus] = useState<CitizenshipStatus | null>(null);
  const [pendingEnrollment, setPendingEnrollment] = useState<string | null>(null);
  const [enrollmentPending, setEnrollmentPending] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>('sovereignty');
  const [capacity, setCapacity] = useState(18);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);
  const [workPending, setWorkPending] = useState(false);
  const [workError, setWorkError] = useState<string | null>(null);
  const workLock = useRef(false);
  const [demoLoaded, setDemoLoaded] = useState(false);
  const hasActiveShift = workShifts.some((shift) => !shift.claimedAt);
  const [influence, setInfluence] = useState(1240);
  const [waterSecurity, setWaterSecurity] = useState(71);
  const [wardStability, setWardStability] = useState(86);
  const [recentAction, setRecentAction] = useState<string | null>(null);
  const [compactView, setCompactView] = useState(false);
  const [horizon, setHorizon] = useState<PlanHorizon>('week');
  const [completedPlanIds, setCompletedPlanIds] = useState<string[]>(['capacity']);
  const [planSaved, setPlanSaved] = useState(false);
  const [planNote, setPlanNote] = useState('Ask the forum how the eastern waterworks will affect Forgehaven East.');
  const [committedDecision, setCommittedDecision] = useState<CitizenDecision | null>(null);
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [citizenSessionStatus, setCitizenSessionStatus] = useState<CitizenSessionStatus>(
    clerkConfigured ? 'loading' : 'anonymous',
  );

  const selected = useMemo(
    () => worldNations.find((nation) => nation.id === (viewOverride === null && requestedNationId
      ? requestedNationId
      : selectedId)) ?? worldNations[0],
    [requestedNationId, selectedId, viewOverride, worldNations],
  );
  const citizenNation = worldNations.find((nation) => nation.id === citizenNationId);
  const pendingNation = worldNations.find((nation) => nation.id === pendingEnrollment);
  const planningNation = citizenNation ?? selected;
  const isCitizenshipChange = Boolean(
    citizenNation && pendingNation && citizenNation.id !== pendingNation.id,
  );

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPendingEnrollment(null);
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadWorld() {
      const response = await fetch('/api/world', { signal: controller.signal });
      if (!response.ok) return;
      const data = await response.json() as {
        nations: Nation[];
        workOrders: WorkOrder[];
        planningTasks: PlanningTask[];
        worldEvents: WorldEvent[];
      };
      if (data.nations.length) setWorldNations(data.nations);
      if (data.workOrders.length) setAvailableWorkOrders(data.workOrders);
      if (data.planningTasks.length) setAvailablePlanningItems(data.planningTasks);
      if (data.worldEvents.length) setWorldEvents(data.worldEvents);
    }

    void loadWorld();
    return () => controller.abort();
  }, []);

  async function runWork(action: 'commit-work' | 'claim-work', order?: WorkOrder, shiftId?: string) {
    if (workLock.current || !citizenNation) return;
    if (action === 'commit-work' && (!order || hasActiveShift || capacity < order.cost)) return;
    workLock.current = true;
    setWorkPending(true);
    setWorkError(null);
    try {
      if (clerkConfigured) {
        const response = await fetch('/api/citizen', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, workOrderId: order?.id, shiftId }),
        });
        const result = await response.json() as { error?: string; shifts?: WorkShift[]; capacity?: number };
        if (result.shifts) setWorkShifts(result.shifts);
        if (typeof result.capacity === 'number') setCapacity(result.capacity);
        if (!response.ok) {
          setWorkError(result.error ?? 'Your shift could not be recorded. Try again to recover its saved state.');
          return;
        }
      } else {
        // Local demo only; authenticated play is persisted by the server.
        if (action === 'commit-work' && order) {
          const rule = shiftRules[order.id];
          if (!rule) throw new Error('Work order unavailable.');
          const startedAt = new Date().toISOString();
          setWorkShifts((current) => [{ id: crypto.randomUUID(), orderName: order.name,
            output: rule.output, capacitySpent: order.cost, startedAt,
            completesAt: new Date(Date.now() + rule.hours * 3600000).toISOString(), claimedAt: null }, ...current]);
          setCapacity((current) => current - order.cost);
        } else {
          setWorkShifts((current) => current.map((shift) => shift.id === shiftId
            && !shift.claimedAt && Date.parse(shift.completesAt) <= Date.now()
            ? { ...shift, claimedAt: new Date().toISOString() } : shift));
        }
      }
      setRecentAction(action === 'commit-work'
        ? `Shift started: ${order?.name}. Work continues while you are away.`
        : 'Completed shift recorded in your contribution history.');
    } catch {
      setWorkError('Connection interrupted. Retry to recover your saved shift.');
    } finally {
      workLock.current = false;
      setWorkPending(false);
    }
  }

  function commitWork(order: WorkOrder) { return runWork('commit-work', order); }
  const workStatus = <WorkShiftBoard shifts={workShifts} pending={workPending}
    error={workError} localDemo={!clerkConfigured} onClaim={(id) => void runWork('claim-work', undefined, id)} />;

  function changeView(nextView: ViewMode) {
    setViewOverride(nextView);
    setCompactView(false);
    const url = new URL(window.location.href);
    if (nextView === 'world') {
      url.searchParams.delete('view');
      url.searchParams.delete('nation');
    } else {
      url.searchParams.set('view', nextView);
      if (nextView === 'nation') url.searchParams.set('nation', selected.id);
      else url.searchParams.delete('nation');
    }
    window.history.replaceState({}, '', url);
  }

  function selectNation(nationId: string) {
    setSelectedId(nationId);
    setViewOverride('nation');
    if (viewMode !== 'nation') return;
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'nation');
    url.searchParams.set('nation', nationId);
    window.history.replaceState({}, '', url);
  }

  function togglePlan(id: string) {
    setCompletedPlanIds((current) => (current.includes(id) ? [] : [id]));
    setPlanSaved(false);
    setDecisionError(null);
  }

  const hydrateCitizen = useCallback((snapshot: CitizenSnapshot) => {
    setWorkShifts(snapshot.shifts ?? []);
    if (snapshot.profile) {
      setCitizenNationId(snapshot.profile.nationId);
      setCitizenshipStatus(snapshot.profile.citizenship);
      setCapacity(snapshot.profile.capacity);
      setInfluence(snapshot.profile.influence);
      setWaterSecurity(snapshot.profile.waterSecurity);
      setWardStability(snapshot.profile.wardStability);
    }
    if (snapshot.plan) {
      setHorizon(snapshot.plan.horizon);
      setCompletedPlanIds(snapshot.plan.completedIds);
      setPlanNote(snapshot.plan.note);
      setPlanSaved(true);
    }
    if (snapshot.decision) {
      setCommittedDecision(snapshot.decision);
      setCompletedPlanIds([snapshot.decision.optionId]);
      setRecentAction(`World record · ${snapshot.decision.outcome}`);
    }
  }, []);

  useEffect(() => {
    if (clerkConfigured) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const saved = window.localStorage.getItem('harimu-citizen-demo-v1');
        if (saved) hydrateCitizen(JSON.parse(saved) as CitizenSnapshot);
      } catch {
        setWorkError('Local demo storage could not be restored.');
      }
      setDemoLoaded(true);
    });
    return () => { cancelled = true; };
  }, [hydrateCitizen]);

  useEffect(() => {
    if (clerkConfigured || !demoLoaded) return;
    try {
      window.localStorage.setItem('harimu-citizen-demo-v1', JSON.stringify({
        shifts: workShifts,
        profile: citizenshipStatus ? { nationId: citizenNationId, capacity, influence,
          waterSecurity, wardStability, citizenship: citizenshipStatus } : null,
        plan: { horizon, note: planNote, completedIds: completedPlanIds },
        decision: committedDecision,
      }));
    } catch {
      queueMicrotask(() => setWorkError('Local demo storage is unavailable; this session will not survive a refresh.'));
    }
  }, [demoLoaded, workShifts, citizenshipStatus, citizenNationId, capacity, influence,
    waterSecurity, wardStability, horizon, planNote, completedPlanIds, committedDecision]);

  async function commitDecision(input: DecisionCommitInput) {
    const selectedOption = availablePlanningItems.find((item) => item.id === input.optionId);
    if (!selectedOption || committedDecision) return;
    setDecisionPending(true);
    setDecisionError(null);

    if (!clerkConfigured) {
      const localDecision: CitizenDecision = {
        decisionId: 'eastern-waterworks-day-42',
        optionId: selectedOption.id,
        infrastructureId: input.infrastructureId,
        householdMemberId: input.householdMemberId,
        effects: selectedOption.effects,
        outcome: selectedOption.outcome,
        committedAt: new Date().toISOString(),
      };
      setCapacity((current) => current + selectedOption.effects.capacity);
      setInfluence((current) => current + selectedOption.effects.influence);
      setWaterSecurity((current) => Math.min(100, current + selectedOption.effects.water));
      setWardStability((current) => Math.min(100, current + selectedOption.effects.stability));
      setCommittedDecision(localDecision);
      setCitizenshipStatus((current) => current ? {
        ...current,
        canChange: false,
        politicalActionTaken: true,
        lockedReason: 'political-action',
      } : current);
      setPlanSaved(true);
      setRecentAction(`World record · ${localDecision.outcome}`);
      setDecisionPending(false);
      return;
    }

    try {
      const response = await fetch('/api/citizen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit-decision',
          optionId: input.optionId,
          infrastructureId: input.infrastructureId,
          householdMemberId: input.householdMemberId,
          horizon,
          note: planNote,
        }),
      });
      const result = await response.json() as {
        error?: string;
        profile?: CitizenSnapshot['profile'];
        decision?: CitizenDecision;
      };
      if (!response.ok || !result.profile || !result.decision) {
        setDecisionError(result.error ?? 'The world record could not save this decision yet.');
        return;
      }

      setCapacity(result.profile.capacity);
      setInfluence(result.profile.influence);
      setWaterSecurity(result.profile.waterSecurity);
      setWardStability(result.profile.wardStability);
      setCommittedDecision(result.decision);
      setCitizenshipStatus(result.profile.citizenship);
      setCompletedPlanIds([result.decision.optionId]);
      setPlanSaved(true);
      setRecentAction(`World record · ${result.decision.outcome}`);
    } catch {
      setDecisionError('The world record could not save this decision yet.');
    } finally {
      setDecisionPending(false);
    }
  }

  async function confirmEnrollment(nation: Nation) {
    setEnrollmentPending(true);
    setEnrollmentError(null);

    if (!clerkConfigured) {
      const changingNation = Boolean(citizenNation && citizenNation.id !== nation.id);
      const now = Date.now();
      setCitizenNationId(nation.id);
      setSelectedId(nation.id);
      setCitizenshipStatus(changingNation ? {
        enrolledAt: citizenshipStatus?.enrolledAt ?? new Date(now).toISOString(),
        graceEndsAt: citizenshipStatus?.graceEndsAt ?? new Date(now + 48 * 60 * 60 * 1000).toISOString(),
        changesRemaining: 0,
        politicalActionTaken: false,
        canChange: false,
        lockedReason: 'change-used',
      } : {
        enrolledAt: new Date(now).toISOString(),
        graceEndsAt: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
        changesRemaining: 1,
        politicalActionTaken: false,
        canChange: true,
        lockedReason: null,
      });
      setPendingEnrollment(null);
      setEnrollmentPending(false);
      return;
    }

    try {
      const response = await fetch('/api/citizen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enroll', nationId: nation.id }),
      });
      const result = await response.json() as {
        error?: string;
        nationId?: string;
        citizenship?: CitizenshipStatus | null;
      };
      if (!response.ok || !result.nationId) {
        if (result.citizenship) setCitizenshipStatus(result.citizenship);
        setEnrollmentError(result.error ?? 'Citizenship could not be recorded yet.');
        return;
      }

      setCitizenNationId(result.nationId);
      setSelectedId(result.nationId);
      if (result.citizenship) setCitizenshipStatus(result.citizenship);
      setPendingEnrollment(null);
    } catch {
      setEnrollmentError('Citizenship could not be recorded yet. Please try again.');
    } finally {
      setEnrollmentPending(false);
    }
  }

  function beginEnrollment(nationId: string) {
    setEnrollmentError(null);
    setPendingEnrollment(nationId);
  }

  const planningProps = {
    nation: planningNation,
    capacity,
    influence,
    waterSecurity,
    wardStability,
    horizon,
    completedPlanIds,
    planSaved,
    planningItems: availablePlanningItems,
    worldEvents,
    note: planNote,
    nationCount: worldNations.length,
    committedDecision,
    decisionError,
    decisionPending,
    onHorizonChange: (nextHorizon: PlanHorizon) => {
      setHorizon(nextHorizon);
      setPlanSaved(false);
    },
    onTogglePlan: togglePlan,
    onNoteChange: (note: string) => {
      setPlanNote(note);
      setPlanSaved(false);
    },
    onCommitDecision: commitDecision,
    onWorldView: () => changeView('world'),
  };

  return (
    <main className={`world-shell view-${viewMode} ${compactView ? 'is-map-focus' : ''}`}>
      {clerkConfigured && (
        <ClerkCitizenSession onHydrate={hydrateCitizen} onStatus={setCitizenSessionStatus} />
      )}
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">H</span>
          <div>
            <p className="brand-name">Harimu</p>
            <p className="brand-kicker">The world continues</p>
          </div>
        </div>

        <nav className="view-switcher" aria-label="Harimu views">
          <button
            aria-pressed={viewMode === 'world'}
            onClick={() => changeView('world')}
            type="button"
          >
            <span>World</span>
            <small>Explore</small>
          </button>
          <button
            aria-pressed={viewMode === 'nation'}
            onClick={() => changeView('nation')}
            type="button"
          >
            <span>Nation</span>
            <small>Govern</small>
          </button>
          <button
            aria-pressed={viewMode === 'planning'}
            onClick={() => changeView('planning')}
            type="button"
          >
            <span>Planning</span>
            <small>My citizen</small>
          </button>
        </nav>

        <div className="world-clock" aria-label="World status">
          <span className="live-dot" />
          <div>
            <span>World year 1 · Day 42</span>
            <strong>18:42 UTC</strong>
          </div>
        </div>

        <div className="citizen-summary">
          <div className="capacity-copy">
            <span>Work capacity</span>
            <strong>{capacity} / 24</strong>
          </div>
          <div className="capacity-meter" aria-label={`${capacity} of 24 Work Capacity available`}>
            <span style={{ width: `${(capacity / 24) * 100}%` }} />
          </div>
          <button
            className="citizen-button"
            onClick={() => {
              if (citizenNation) setSelectedId(citizenNation.id);
              changeView('planning');
            }}
            type="button"
          >
            {citizenNation
              ? citizenNation.shortName
              : citizenSessionStatus === 'loading'
                ? 'Loading citizen…'
                : citizenSessionStatus === 'anonymous'
                  ? 'Citizen planning'
                  : 'Choose citizenship'}
          </button>
          {viewMode === 'world' && (
            <button
              aria-pressed={compactView}
              className="view-button"
              onClick={() => setCompactView((current) => !current)}
              type="button"
            >
              {compactView ? 'Show panels' : 'Map focus'}
            </button>
          )}
          <ClerkAccountControl onOpenPlanning={() => changeView('planning')} />
        </div>
      </header>

      {viewMode === 'world' ? (
      <div className="game-layout">
        <aside className="nation-rail" aria-label="World nations">
          <div className="rail-heading">
            <span>{worldNations.length} nations</span>
            <small>10 fixed systems</small>
          </div>
          <div className="nation-list">
            {worldNations.map((nation) => (
              <button
                className={`nation-row ${selected.id === nation.id ? 'is-selected' : ''}`}
                key={nation.id}
                onClick={() => setSelectedId(nation.id)}
                style={{ '--nation-color': nation.color } as CSSProperties}
                type="button"
              >
                <span className="nation-sigil" aria-hidden="true">{nationMark(nation)}</span>
                <span>
                  <strong>{nation.shortName}</strong>
                  <small>{nation.currency}</small>
                </span>
              </button>
            ))}
          </div>

          <div className="rail-event">
            <span className="event-label">World notice</span>
            <strong>{worldEvents[0]?.headline ?? 'World record synchronized'}</strong>
            <small>{worldEvents[0]?.occurredAt ?? 'Live now'}</small>
          </div>
        </aside>

        <section className={`map-stage mode-${mapMode}`} aria-label="Political world map">
          <div className="map-shade" aria-hidden="true" />
          <div className="map-toolbar">
            <div>
              <span className="eyebrow">Political atlas · live</span>
              <h1>A living world of citizens</h1>
            </div>
            <div className="map-modes" role="group" aria-label="Map mode">
              {(['sovereignty', 'trade', 'influence'] as MapMode[]).map((mode) => (
                <button
                  aria-pressed={mapMode === mode}
                  className={mapMode === mode ? 'active' : ''}
                  key={mode}
                  onClick={() => setMapMode(mode)}
                  type="button"
                >
                  {mode[0].toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="map-hotspots">
            {worldNations.map((nation) => (
              <button
                aria-label={`${nation.name}, capital ${nation.capital}`}
                className={`map-hotspot ${selected.id === nation.id ? 'is-selected' : ''}`}
                key={nation.id}
                onClick={() => setSelectedId(nation.id)}
                style={
                  {
                    '--nation-color': nation.color,
                    '--nation-x': `${nation.position.x}%`,
                    '--nation-y': `${nation.position.y}%`,
                  } as CSSProperties
                }
                type="button"
              >
                <span>{nation.capital}</span>
                <small>{nation.shortName}</small>
              </button>
            ))}
          </div>

          <div className="mode-indicator">
            <span>{mapMode} view</span>
            <strong>{modeDescriptions[mapMode]}</strong>
          </div>

          <div className="world-ticker" aria-label="Recent world events">
            <span className="ticker-status">Live record</span>
            <p>{recentAction ?? <><strong>{worldEvents[0]?.location ?? 'World record'}</strong> {worldEvents[0]?.detail ?? 'The shared record is synchronized.'}</>}</p>
            <time>18:31</time>
            <p><strong>{worldEvents[1]?.location ?? 'World Assembly'}</strong> {worldEvents[1]?.detail ?? 'Citizens are preparing the next session.'}</p>
          </div>
        </section>

        <aside className="nation-panel" style={{ '--selected': selected.color } as CSSProperties}>
          <div className="panel-heading">
            <div className="panel-sigil" aria-hidden="true">{nationMark(selected)}</div>
            <div>
              <span className="eyebrow">{selected.currency}</span>
              <h2>{selected.name}</h2>
            </div>
          </div>
          <p className="nation-motto">“{selected.motto}”</p>

          <div className="institution-block">
            <span>Constitutional order</span>
            <strong>{selected.government}</strong>
          </div>
          <div className="institution-block">
            <span>Economic model</span>
            <strong>{selected.economy}</strong>
          </div>
          <div className="institution-block">
            <span>Official religious stance</span>
            <strong>{selected.religion}</strong>
          </div>

          <dl className="nation-stats">
            <div><dt>Capital</dt><dd>{selected.capital}</dd></div>
            <div><dt>Citizens</dt><dd>{selected.population}</dd></div>
            <div><dt>Treasury</dt><dd>{selected.treasury}</dd></div>
            <div><dt>Foreign trade</dt><dd>{selected.tradeStatus}</dd></div>
          </dl>

          <div className="stability-block">
            <div><span>National stability</span><strong>{selected.stability}%</strong></div>
            <div className="stability-meter"><span style={{ width: `${selected.stability}%` }} /></div>
          </div>

          {citizenNation ? (
            <>
              <div className="enrolled-state">
                <span>Your citizenship</span>
                <strong>{citizenNation.name}</strong>
                <small>{citizenshipRuleLabel(citizenshipStatus)}</small>
              </div>
              {citizenNation.id !== selected.id && (
                citizenshipStatus?.canChange ? (
                  <button
                    className="enroll-button citizenship-change-button"
                    onClick={() => beginEnrollment(selected.id)}
                    type="button"
                  >
                    Change to {selected.shortName}
                    <span>Uses your one grace-period change</span>
                  </button>
                ) : (
                  <div className="citizenship-locked-state">
                    <span>Explore-only nation</span>
                    <strong>Your citizen remains in {citizenNation.shortName}</strong>
                    <small>{citizenshipRuleLabel(citizenshipStatus)}</small>
                  </div>
                )
              )}
              {citizenNation.id === selected.id && (
                <div className="work-board">
                  <div className="work-board-heading">
                    <div>
                      <span className="eyebrow">Citizen work board</span>
                      <strong>Available contributions</strong>
                    </div>
                    <b>{capacity} WC</b>
                  </div>
                  {workStatus}
                  {availableWorkOrders
                    .filter((order) => !order.nationId || order.nationId === citizenNation.id)
                    .map((order) => (
                    <button
                      disabled={workPending || hasActiveShift || capacity < order.cost}
                      key={order.id}
                      onClick={() => void commitWork(order)}
                      type="button"
                    >
                      <span><strong>{order.name}</strong><small>{order.detail}</small></span>
                      <b>{order.cost}</b>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <button
              className="enroll-button"
              onClick={() => beginEnrollment(selected.id)}
              type="button"
            >
              Enroll in {selected.shortName}
              <span>One change in your first 48 hours</span>
            </button>
          )}
        </aside>
      </div>
      ) : viewMode === 'nation' ? (
        <NationDashboard
          capacity={capacity}
          citizenNation={citizenNation}
          key={selected.id}
          nation={selected}
          nations={worldNations}
          workPending={workPending || hasActiveShift}
          workStatus={workStatus}
          onCommitWork={commitWork}
          onPlanningView={() => {
            if (citizenNation) setSelectedId(citizenNation.id);
            changeView('planning');
          }}
          onSelectNation={selectNation}
          onWorldView={() => changeView('world')}
          workOrders={availableWorkOrders}
          worldEvents={worldEvents}
        />
      ) : designPreview ? (
        <PlanningDashboard {...planningProps} citizenName="Leora Vale" />
      ) : clerkConfigured ? (
        <>
          <Show when="signed-out">
            <PlanningSignInGate />
          </Show>
          <Show when="signed-in">
            <SignedInPlanningDashboard {...planningProps} />
          </Show>
        </>
      ) : (
        <PlanningDashboard {...planningProps} citizenName="Citizen 042" preview />
      )}

      {viewMode === 'world' && pendingNation && (
        <div className="dialog-backdrop" onMouseDown={() => setPendingEnrollment(null)} role="presentation">
          <section
            aria-labelledby="enrollment-title"
            aria-modal="true"
            className="enrollment-dialog"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            style={{ '--selected': pendingNation.color } as CSSProperties}
          >
            <div className="dialog-sigil" aria-hidden="true">{nationMark(pendingNation)}</div>
            <span className="eyebrow">
              {isCitizenshipChange ? 'Grace-period change' : 'Founding citizenship'}
            </span>
            <h2 id="enrollment-title">
              {isCitizenshipChange ? `Move to ${pendingNation.name}?` : `Enroll in ${pendingNation.name}?`}
            </h2>
            <p>
              {isCitizenshipChange
                ? `This moves your citizen from ${citizenNation?.name} and uses your one free change. The new citizenship becomes permanent immediately.`
                : 'Your nation controls your political rights, institutions, and daily economy. You may change once in your first 48 hours, until you take a political action.'}
            </p>
            <div className="citizenship-rule" aria-label="Citizenship commitment rule">
              <div><ClockCountdown aria-hidden="true" size={18} /><span><strong>48-hour grace</strong><small>One free nation change</small></span></div>
              <div><ShieldCheck aria-hidden="true" size={18} /><span><strong>Political lock</strong><small>Your first civic act ends the grace period</small></span></div>
            </div>
            <dl>
              <div><dt>Government</dt><dd>{pendingNation.government}</dd></div>
              <div><dt>Economy</dt><dd>{pendingNation.economy}</dd></div>
              <div><dt>Currency</dt><dd>{pendingNation.currency}</dd></div>
              <div><dt>Faith</dt><dd>{pendingNation.religion}</dd></div>
            </dl>
            {enrollmentError && <p className="enrollment-error" role="alert">{enrollmentError}</p>}
            <div className="dialog-actions">
              <button
                className="secondary-action"
                disabled={enrollmentPending}
                onClick={() => setPendingEnrollment(null)}
                type="button"
              >
                Keep exploring
              </button>
              <button
                className="primary-action"
                disabled={enrollmentPending}
                onClick={() => void confirmEnrollment(pendingNation)}
                type="button"
              >
                {enrollmentPending
                  ? 'Recording citizenship…'
                  : isCitizenshipChange
                    ? 'Use my one change'
                    : 'Confirm citizenship'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
