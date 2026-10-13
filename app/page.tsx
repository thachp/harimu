'use client';

import { readCitizenIntents, writeCitizenIntents } from '@/lib/citizen-session';
import { isSceneTraversal, sceneHistoryState, sceneFromSearch, sceneUrl, type SceneView } from '@/lib/scene-navigation';
import { useRef } from 'react';
import { SceneNews } from './world-scene';
import { GameShell } from './game-shell';
import { SquareChat } from './square-chat';
import { DailyBriefing } from './daily-briefing';
import { GovernmentPanel } from './government-panel';
import { simulateGovernment, type GovernmentSnapshot, type PetitionTopic } from '@/lib/government';
import { PlayerMarket } from './player-market';
import { validPlayerCommand, type PlayerCommand, type PlayerMarketState } from '@/lib/player-market';
import { CitizenMarket } from './citizen-market';
import { marketSeeds, validMarketCommand, type MarketState, type MarketCommand } from '@/lib/market';
import { WorkShiftBoard } from './work-shift-board';
import { shiftRules, type WorkShift } from '@/lib/work-shifts';
import { rewards, recoverySeconds, maximumCapacity, type Economy } from '@/lib/economy';
import {
  Show,
  SignInButton,
  UserButton,
  useUser,
} from '@clerk/nextjs';
import {
  ArrowLeft,
  ArrowRight,
  Bank,
  ClockCountdown,
  Coins,
  MapPin,
  Scales,
  ShieldCheck,
  Train,
  UsersThree,
  Warehouse,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { clerkConfigured } from './providers';

type ViewMode = SceneView;
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

function subscribeToLocation(onStoreChange: () => void) {
  const pathname = window.location.pathname;
  // These query-only entries belong to the game, not the framework's RSC router.
  // Restoring an RSC snapshot here remounts the citizen session and the viewport.
  if (!isSceneTraversal(window.history.state, pathname)) {
    window.history.replaceState(sceneHistoryState(window.history.state, pathname), '');
  }
  const onPopState = (event: PopStateEvent) => {
    if (window.location.pathname === pathname && isSceneTraversal(event.state, pathname)) {
      event.stopImmediatePropagation();
      window.dispatchEvent(new Event('harimu-scenechange'));
    } else onStoreChange();
  };
  window.addEventListener('popstate', onPopState, true);
  window.addEventListener('harimu-scenechange', onStoreChange);
  return () => { window.removeEventListener('popstate', onPopState, true); window.removeEventListener('harimu-scenechange', onStoreChange); };
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
          <ArrowLeft aria-hidden="true" size={15} /> World globe
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
            {selectedAgenda.order && rewards[selectedAgenda.order.id] && <p>
              Shift reward: {(rewards[selectedAgenda.order.id].wageMinor / 100).toFixed(2)} SPK + {rewards[selectedAgenda.order.id].quantity} {rewards[selectedAgenda.order.id].item}
            </p>}
            {selectedAgenda.order && isCitizenNation ? (
              <button
                disabled={workPending || capacity < selectedAgenda.order.cost}
                onClick={() => void onCommitWork(selectedAgenda.order as WorkOrder)}
                type="button"
              >
                Start shift · {selectedAgenda.order.cost} Work Capacity
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
            <strong>{isCitizenNation ? `Household in ${nation.shortName}` : `You are viewing ${nation.shortName}`}</strong>
            <p>{isCitizenNation ? 'Translate national conditions into household choices.' : 'Your household belongs to your own nation.'}</p>
          </div>
          <button onClick={onPlanningView} type="button">Open household <ArrowRight aria-hidden="true" size={15} /></button>
        </section>
      </aside>
    </section>
  );
}

function ClerkAccountControl() {
  if (!clerkConfigured) return <span className="account-demo-label">Local demo</span>;

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
              avatarBox: { width: '28px', height: '28px' },
            },
          }}
        />
      </Show>
    </div>
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
  economy?: Economy;
  market?: MarketState;
  playerMarket?: PlayerMarketState;
  government?: GovernmentSnapshot | null;
  demoGovernment?: { period: number; counts: Record<string, number> };
  demoReceipts?: string[];
  demoStarterGranted?: boolean;
};

type CitizenSessionStatus = 'loading' | 'anonymous' | 'ready' | 'error';

function ClerkCitizenSession({
  onHydrate,
  onStatus,
  onIdentity,
}: {
  onHydrate: (snapshot: CitizenSnapshot) => void;
  onStatus: (status: CitizenSessionStatus) => void;
  onIdentity: (userId: string | null) => void;
}) {
  const { isLoaded, user } = useUser();
  const userId = user?.id;

  useLayoutEffect(() => {
    if (!isLoaded) {
      onStatus('loading');
      return;
    }
    onIdentity(userId ?? null);
    if (!userId) {
      onStatus('anonymous');
      return;
    }
    const controller = new AbortController();
    onStatus('loading');

    async function loadCitizen() {
      try {
        const response = await fetch('/api/citizen', { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          onStatus('error');
          return;
        }
        const snapshot = await response.json() as CitizenSnapshot;
        if (controller.signal.aborted) return;
        onHydrate(snapshot);
        onStatus('ready');
      } catch (error) {
        if (!controller.signal.aborted && (error as Error).name !== 'AbortError') onStatus('error');
      }
    }

    void loadCitizen();
    return () => controller.abort();
  }, [isLoaded, onHydrate, onStatus, onIdentity, userId]);

  return null;
}

export default function Home() {
  const [worldNations, setWorldNations] = useState<Nation[]>(fallbackNations);
  const [availableWorkOrders, setAvailableWorkOrders] = useState<WorkOrder[]>(fallbackWorkOrders);
  const [availablePlanningItems, setAvailablePlanningItems] = useState<PlanningTask[]>(fallbackPlanningItems);
  const [worldEvents, setWorldEvents] = useState<WorldEvent[]>(fallbackWorldEvents);
  const locationSearch = useSyncExternalStore(subscribeToLocation, getLocationSearch, getServerLocationSearch);
  const requestedNationId = new URLSearchParams(locationSearch).get('nation');
  const viewMode = sceneFromSearch(locationSearch);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const heading = document.getElementById('game-panel-title') ?? document.querySelector<HTMLElement>('main h1');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [locationSearch]);
  const [selectedId, setSelectedId] = useState('kindle');
  const [citizenNationId, setCitizenNationId] = useState<string | null>(null);
  const [citizenshipStatus, setCitizenshipStatus] = useState<CitizenshipStatus | null>(null);
  const [pendingEnrollment, setPendingEnrollment] = useState<string | null>(null);
  const [enrollmentPending, setEnrollmentPending] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState<string | null>(null);
  const [capacity, setCapacity] = useState(18);
  const [governmentSnapshot, setGovernment] = useState<GovernmentSnapshot | null>(null);
  const [governmentError, setGovernmentError] = useState<string | null>(null);
  const [governmentPending, setGovernmentPending] = useState(false);
  const governmentIntent = useRef<{ topic: PetitionTopic; requestId: string } | null>(null);
  const [demoGovernment, setDemoGovernment] = useState({ period: 0, counts: {} as Record<string, number> });
  const [playerMarket, setPlayerMarket] = useState<PlayerMarketState | null>(null);
  const [playerCommand, setPlayerCommand] = useState<PlayerCommand | null>(null);
  const playerIntent = useRef<PlayerCommand | null>(null);
  const [market, setMarket] = useState<MarketState | null>(null);
  const marketIntent = useRef<MarketCommand | null>(null);
  const [marketCommand, setMarketCommand] = useState<MarketCommand | null>(null);
  const [demoReceipts, setDemoReceipts] = useState<string[]>([]);
  const [demoStarterGranted, setDemoStarterGranted] = useState(false);
  const [economy, setEconomy] = useState<Economy | null>(null);
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

  const citizenIdentity = useRef<string | null>(null);
  const citizenEpoch = useRef(0);
  const persistIntents = useCallback(() => {
    if (!clerkConfigured || !citizenIdentity.current) return;
    try { writeCitizenIntents(window.sessionStorage, citizenIdentity.current, {
      market: marketIntent.current, player: playerIntent.current, government: governmentIntent.current,
    }); } catch { /* Storage may be disabled; preserve in-memory retry. */ }
  }, []);
  const changeCitizenIdentity = useCallback((userId: string | null) => {
    if (citizenIdentity.current === userId) return;
    citizenIdentity.current = userId;
    citizenEpoch.current++;
    workLock.current = false;
    setCitizenNationId(null); setCitizenshipStatus(null); setPendingEnrollment(null);
    setCapacity(0); setInfluence(0); setWaterSecurity(0); setWardStability(0);
    setEconomy(null); setMarket(null); setPlayerMarket(null); setGovernment(null); setWorkShifts([]);
    setPlanNote(''); setCompletedPlanIds([]); setPlanSaved(false); setHorizon('week'); setCommittedDecision(null);
    setRecentAction(null); setWorkError(null); setGovernmentError(null); setDecisionError(null); setEnrollmentError(null);
    setWorkPending(false); setGovernmentPending(false); setDecisionPending(false); setEnrollmentPending(false);
    let saved: ReturnType<typeof readCitizenIntents> = null;
    try { saved = userId ? readCitizenIntents(window.sessionStorage, userId) : null; } catch { /* Disabled session storage. */ }
    marketIntent.current = saved?.market ?? null; playerIntent.current = saved?.player ?? null;
    governmentIntent.current = saved?.government ?? null;
    setMarketCommand(marketIntent.current); setPlayerCommand(playerIntent.current);
  }, []);

  const selected = useMemo(
    () => worldNations.find((nation) => nation.id === (requestedNationId
      ? requestedNationId
      : selectedId)) ?? worldNations[0],
    [requestedNationId, selectedId, worldNations],
  );
  const citizenNation = worldNations.find((nation) => nation.id === citizenNationId);
  const demoGovernmentSnapshot = useMemo(() => citizenNation ? simulateGovernment({
    nationId: citizenNation.id, availableBudgetMinor: 100000,
    foodSecurity: (economy?.inventory.find((entry) => entry.item === 'food')?.quantity ?? 0) >= 2 ? 100 : 0,
    petitionCounts: demoGovernment.counts,
  }) : null, [citizenNation, economy, demoGovernment]);
  const government = clerkConfigured ? governmentSnapshot : demoGovernmentSnapshot;
  const pendingNation = worldNations.find((nation) => nation.id === pendingEnrollment);
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

  async function runWork(action: 'commit-work' | 'claim-work' | 'refresh-work', order?: WorkOrder, shiftId?: string) {
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    const epoch = citizenEpoch.current;
    if (workLock.current || !citizenNation) return;
    if (action === 'commit-work' && (!order || hasActiveShift || capacity < order.cost)) return;
    workLock.current = true;
    setWorkPending(true);
    setWorkError(null);
    try {
      if (clerkConfigured) {
        const response = await fetch('/api/citizen', {
          method: action === 'refresh-work' ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' },
          body: action === 'refresh-work' ? undefined : JSON.stringify({ action, workOrderId: order?.id, shiftId }),
        });
        const result = await response.json() as { error?: string; shifts?: WorkShift[]; capacity?: number; economy?: Economy; market?: MarketState; playerMarket?: PlayerMarketState; government?: GovernmentSnapshot | null; profile?: CitizenSnapshot['profile'] };
      if (epoch !== citizenEpoch.current) return;
        if (result.shifts) setWorkShifts(result.shifts);
        if (result.economy) setEconomy(result.economy);
        if (result.market) setMarket(result.market);
        if (result.playerMarket) setPlayerMarket(result.playerMarket);
        if ('government' in result) setGovernment(result.government ?? null);
        if (result.profile) setCapacity(result.profile.capacity);
        if (typeof result.capacity === 'number') setCapacity(result.capacity);
        if (!response.ok) {
          setWorkError(result.error ?? 'Your shift could not be recorded. Try again to recover its saved state.');
          return;
        }
      } else {
        // Local demo only; authenticated play is persisted by the server.
        if (action === 'refresh-work') {
          const refreshedAt = new Date().getTime();
          if (economy && refreshedAt >= Date.parse(economy.nextRecoveryAt)) {
            const periods = 1 + Math.floor((refreshedAt - Date.parse(economy.nextRecoveryAt)) / (recoverySeconds * 1000));
            setCapacity((current) => Math.min(maximumCapacity, current + periods * maximumCapacity));
            setEconomy({ ...economy, nextRecoveryAt: new Date(Date.parse(economy.nextRecoveryAt) + periods * recoverySeconds * 1000).toISOString() });
          }
        } else if (action === 'commit-work' && order) {
          const rule = shiftRules[order.id];
          if (!rule) throw new Error('Work order unavailable.');
          const startedAt = new Date().toISOString();
          setWorkShifts((current) => [{ id: crypto.randomUUID(), orderName: order.name,
            output: rule.output, capacitySpent: order.cost, startedAt,
            wageMinor: rewards[order.id]?.wageMinor, rewardItem: rewards[order.id]?.item, rewardQuantity: rewards[order.id]?.quantity,
            completesAt: new Date(Date.now() + rule.hours * 3600000).toISOString(), claimedAt: null }, ...current]);
          setCapacity((current) => current - order.cost);
        } else {
          const eligible = workShifts.find((shift) => shift.id === shiftId && !shift.claimedAt && Date.parse(shift.completesAt) <= Date.now());
          if (eligible && economy) {
            const item = eligible.rewardItem;
            const inventory = economy.inventory.filter((entry) => entry.item !== item);
            if (item) inventory.push({ item, quantity: (economy.inventory.find((entry) => entry.item === item)?.quantity ?? 0) + (eligible.rewardQuantity ?? 0) });
            setEconomy({ ...economy, walletMinor: economy.walletMinor + (eligible.wageMinor ?? 0), inventory });
          }
          setWorkShifts((current) => current.map((shift) => shift.id === shiftId
            && !shift.claimedAt && Date.parse(shift.completesAt) <= Date.now()
            ? { ...shift, claimedAt: new Date().toISOString() } : shift));
        }
      }
      setRecentAction(action === 'commit-work'
        ? `Shift started: ${order?.name}. Work continues while you are away.`
        : action === 'refresh-work' ? 'Citizen account refreshed.' : 'Shift settled: wages and goods recorded in your citizen account.');
    } catch {
      if (epoch !== citizenEpoch.current) return;
      setWorkError('Connection interrupted. Retry to recover your saved shift.');
    } finally {
      if (epoch !== citizenEpoch.current) return;
      workLock.current = false;
      setWorkPending(false);
    }
  }

  async function runMarket(command: MarketCommand) {
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    const epoch = citizenEpoch.current;
    if (workLock.current || citizenNation?.id !== 'kindle' || !economy || !market) return;
    if (playerIntent.current || !validMarketCommand(command) || (marketIntent.current && marketIntent.current.requestId !== command.requestId)) return;
    marketIntent.current = command; persistIntents();
    workLock.current = true;
    setWorkPending(true);
    setWorkError(null);
    setMarketCommand(command);
    try {
      if (clerkConfigured) {
        const response = await fetch('/api/citizen', { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
        const result = await response.json() as { error?: string; economy?: Economy; market?: MarketState; playerMarket?: PlayerMarketState; capacity?: number };
      if (epoch !== citizenEpoch.current) return;
        if (response.status >= 500) throw new Error('Server response needs confirmation.');
        if (response.ok && (!result.economy || !result.market || typeof result.capacity !== 'number')) throw new Error('Incomplete transaction response.');
        if (result.economy) setEconomy(result.economy);
        if (result.market) setMarket(result.market);
        if (result.playerMarket) setPlayerMarket(result.playerMarket);
        if (typeof result.capacity === 'number') setCapacity(result.capacity);
        if (!response.ok) {
          setWorkError(result.error ?? 'Transaction refused. Refresh your account and check balances.');
          marketIntent.current = null; persistIntents(); setMarketCommand(null);
          return;
        }
      } else if (!demoReceipts.includes(command.requestId)) {
        const item = command.action === 'household-meal' ? 'food' : command.item!;
        const owned = economy.inventory.find((entry) => entry.item === item)?.quantity ?? 0;
        const next = { ...economy, inventory: economy.inventory.filter((entry) => entry.item !== item) };
        if (command.action === 'household-meal') {
          const now = new Date().getTime();
          if (owned < 2 || capacity >= 24 || (market.mealReadyAt && Date.parse(market.mealReadyAt) > now)) {
            setWorkError('Check food, capacity and the household meal timer.'); marketIntent.current = null; persistIntents(); setMarketCommand(null); return;
          }
          next.inventory.push({ item, quantity: owned - 2 });
          setCapacity((current) => Math.min(24, current + 4));
          setMarket({ ...market, mealReadyAt: new Date(now + recoverySeconds * 1000).toISOString() });
        } else {
          const quote = market.quotes.find((entry) => entry.item === item);
          const quantity = command.quantity!;
          if (!quote || (command.side === 'buy' ? economy.walletMinor < quote.buyMinor * quantity || quote.stock < quantity
            : owned < quantity || market.merchantCashMinor < quote.sellMinor * quantity)) {
            setWorkError('Not enough funds or goods for this trade.'); marketIntent.current = null; persistIntents(); setMarketCommand(null); return;
          }
          const cash = command.side === 'buy' ? -quote.buyMinor * quantity : quote.sellMinor * quantity;
          const goods = command.side === 'buy' ? quantity : -quantity;
          next.walletMinor += cash;
          next.inventory.push({ item, quantity: owned + goods });
          setMarket({ ...market, merchantCashMinor: market.merchantCashMinor - cash,
            quotes: market.quotes.map((entry) => entry.item === item ? { ...entry, stock: entry.stock - goods } : entry) });
        }
        setEconomy(next);
        setDemoReceipts((current) => [...current, command.requestId]);
      }
      marketIntent.current = null; persistIntents(); setMarketCommand(null);
      setRecentAction(command.action === 'household-meal'
        ? 'Household fed: 2 food consumed, up to 4 Work Capacity restored.' : `Market ${command.side}: ${command.quantity} ${command.item} settled.`);
    } catch {
      if (epoch !== citizenEpoch.current) return;
      setWorkError('Connection interrupted. Retry the previous transaction to confirm its saved result.');
    } finally {
      if (epoch !== citizenEpoch.current) return;
      workLock.current = false;
      setWorkPending(false);
    }
  }

  async function runPlayerCommand(command: PlayerCommand) {
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    const epoch = citizenEpoch.current;
    if (!clerkConfigured || workLock.current || !citizenNation || !validPlayerCommand(command)
      || (playerIntent.current && playerIntent.current.requestId !== command.requestId) || marketIntent.current) return;
    playerIntent.current = command; persistIntents();
    workLock.current = true;
    setWorkPending(true); setWorkError(null); setPlayerCommand(command);
    try {
      const response = await fetch('/api/citizen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      const result = await response.json() as { error?: string; economy?: Economy; playerMarket?: PlayerMarketState };
      if (epoch !== citizenEpoch.current) return;
      if (response.status >= 500 || (response.ok && (!result.economy || !result.playerMarket))) throw new Error('Response needs confirmation.');
      if (result.economy) setEconomy(result.economy);
      if (result.playerMarket) setPlayerMarket(result.playerMarket);
      playerIntent.current = null; persistIntents(); setPlayerCommand(null);
      if (!response.ok) { setWorkError(result.error ?? 'Listing action refused. Refresh your account.'); return; }
      setRecentAction(command.action === 'create-listing' ? 'Citizen listing created: goods reserved.'
        : command.action === 'buy-listing' ? 'Citizen purchase settled: payment and goods transferred.' : 'Listing cancelled: reserved goods returned.');
    } catch {
      if (epoch !== citizenEpoch.current) return;
      setWorkError('Connection interrupted. Retry the previous listing action to confirm its saved result.');
    } finally {
      if (epoch !== citizenEpoch.current) return; workLock.current = false; setWorkPending(false); }
  }

  async function petitionGovernment(topic: PetitionTopic) {
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    const epoch = citizenEpoch.current;
    if (workLock.current || !citizenNation || !government || marketIntent.current || playerIntent.current) return;
    if (governmentIntent.current && governmentIntent.current.topic !== topic) {
      setGovernmentError(`Retry the previous ${governmentIntent.current.topic} petition before choosing another topic.`); return;
    }
    const intent = governmentIntent.current ?? { topic, requestId: crypto.randomUUID() };
    governmentIntent.current = intent; persistIntents();
    workLock.current = true; setGovernmentPending(true); setGovernmentError(null);
    try {
      if (clerkConfigured) {
        const response = await fetch('/api/citizen', { method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ action:'government-petition', ...intent }) });
        const result = await response.json() as { error?:string; government?:GovernmentSnapshot|null; citizenship?:CitizenshipStatus };
      if (epoch !== citizenEpoch.current) return;
        if (response.status >= 500 || (response.ok && !result.citizenship)) throw new Error('Petition response needs confirmation.');
        governmentIntent.current = null; persistIntents();
        if (!response.ok) { setGovernmentError(result.error ?? 'Petition refused.'); return; }
        setGovernment(result.government ?? null);
        if (result.citizenship) setCitizenshipStatus(result.citizenship);
      } else {
        const period = Math.floor(new Date().getTime()/86400000)*86400;
        if (demoGovernment.period === period) { governmentIntent.current=null; persistIntents(); setGovernmentError('One petition per citizen per UTC day.'); return; }
        setDemoGovernment({ period, counts: { ...demoGovernment.counts, [topic]: (demoGovernment.counts[topic] ?? 0)+1 } });
        setCitizenshipStatus((current) => current ? { ...current, politicalActionTaken:true, canChange:false, lockedReason:'political-action' } : current);
        governmentIntent.current=null; persistIntents();
      }
      setRecentAction('Citizen petition recorded; the rule-bound government proposal reflects public priorities.');
    } catch {
      if (epoch !== citizenEpoch.current) return; setGovernmentError('Connection interrupted. Retry the same petition topic to confirm its saved result.'); }
    finally {
      if (epoch !== citizenEpoch.current) return; workLock.current=false; setGovernmentPending(false); }
  }

  function commitWork(order: WorkOrder) { return runWork('commit-work', order); }
  const workStatus = <section className="scene-daily-links" aria-label="Citizen daily loop">
    <p>Your daily life continues across the city.</p>
    <button type="button" onClick={() => changeView('household')}>Household · briefing and food</button>
    <button type="button" onClick={() => changeView('workplace')}>Workplace · shifts and earnings</button>
    <button type="button" onClick={() => changeView('market')}>Market · goods and listings</button>
    <button type="button" onClick={() => changeView('government')}>Government · policies and petitions</button>
  </section>;

  function changeView(nextView: ViewMode) {
    const href = sceneUrl(window.location.href, nextView, selected.id);
    if (href !== window.location.href) window.history.pushState(sceneHistoryState(window.history.state, window.location.pathname), '', href);
    window.dispatchEvent(new Event('harimu-scenechange'));
  }

  function selectNation(nationId: string) {
    setSelectedId(nationId);
    if (viewMode !== 'nation') return;
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'nation');
    url.searchParams.set('nation', nationId);
    if (url.href !== window.location.href) window.history.pushState(sceneHistoryState(window.history.state, window.location.pathname), '', url);
    window.dispatchEvent(new Event('harimu-scenechange'));
  }

  function togglePlan(id: string) {
    setCompletedPlanIds((current) => (current.includes(id) ? [] : [id]));
    setPlanSaved(false);
    setDecisionError(null);
  }

  async function saveHouseholdPlan() {
    if (decisionPending || (clerkConfigured && citizenSessionStatus !== 'ready')) return;
    if (!clerkConfigured) { setPlanSaved(true); return; }
    const epoch = citizenEpoch.current;
    setDecisionPending(true); setDecisionError(null);
    try {
      const response = await fetch('/api/citizen', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save-plan', horizon, note: planNote, completedIds: completedPlanIds }) });
      const result = await response.json() as { error?: string; ok?: boolean };
      if (epoch !== citizenEpoch.current) return;
      if (!response.ok || !result.ok) { setDecisionError(result.error ?? 'Household draft could not be saved.'); return; }
      setPlanSaved(true);
    } catch { if (epoch === citizenEpoch.current) setDecisionError('Connection interrupted. Your draft is still here; try saving again.'); }
    finally { if (epoch === citizenEpoch.current) setDecisionPending(false); }
  }

  const hydrateCitizen = useCallback((snapshot: CitizenSnapshot) => {
    setWorkShifts(snapshot.shifts ?? []);
    if (snapshot.market) setMarket(snapshot.market);
    if (snapshot.playerMarket) setPlayerMarket(snapshot.playerMarket);
    if ('government' in snapshot) setGovernment(snapshot.government ?? null);
    if (snapshot.demoGovernment) setDemoGovernment(snapshot.demoGovernment);
    setDemoReceipts(snapshot.demoReceipts ?? []);
    setDemoStarterGranted(snapshot.demoStarterGranted ?? false);
    if (snapshot.economy) setEconomy(snapshot.economy);
    else if (!clerkConfigured) setEconomy({ walletMinor: 0, inventory: [], nextRecoveryAt: new Date(new Date().getTime() + recoverySeconds * 1000).toISOString() });
    if (!clerkConfigured && snapshot.profile?.nationId === 'kindle' && !snapshot.market) {
      setMarket({ available: true, merchantCashMinor: 100000, mealReadyAt: null, mealFood: 2, mealCapacity: 4, mealIntervalSeconds: recoverySeconds,
        quotes: marketSeeds.map(([item, label, buyMinor, sellMinor, stock]) => ({ item, label, buyMinor, sellMinor, stock })) });
      if (!snapshot.demoStarterGranted) {
        setDemoStarterGranted(true);
        setEconomy((current) => current ? { ...current, inventory: [{ item: 'food', quantity: (current.inventory.find((entry) => entry.item === 'food')?.quantity ?? 0) + 2 }, ...current.inventory.filter((entry) => entry.item !== 'food')] } : current);
      }
    }
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
        shifts: workShifts, economy, market, demoReceipts, demoStarterGranted, demoGovernment,
        profile: citizenshipStatus ? { nationId: citizenNationId, capacity, influence,
          waterSecurity, wardStability, citizenship: citizenshipStatus } : null,
        plan: { horizon, note: planNote, completedIds: completedPlanIds },
        decision: committedDecision,
      }));
    } catch {
      queueMicrotask(() => setWorkError('Local demo storage is unavailable; this session will not survive a refresh.'));
    }
  }, [demoLoaded, workShifts, economy, market, demoReceipts, demoStarterGranted, demoGovernment, citizenshipStatus, citizenNationId, capacity, influence,
    waterSecurity, wardStability, horizon, planNote, completedPlanIds, committedDecision]);

  async function commitDecision(input: DecisionCommitInput) {
    if (decisionPending) return;
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    const epoch = citizenEpoch.current;
    const selectedOption = availablePlanningItems.find((item) => item.id === input.optionId);
    if (!selectedOption || committedDecision) return;
    if (capacity + selectedOption.effects.capacity < 0) { setDecisionError('Not enough Work Capacity for this commitment.'); return; }
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
      if (epoch !== citizenEpoch.current) return;
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
      if (epoch !== citizenEpoch.current) return;
      setDecisionError('The world record could not save this decision yet.');
    } finally {
      if (epoch !== citizenEpoch.current) return;
      setDecisionPending(false);
    }
  }

  async function confirmEnrollment(nation: Nation) {
    if (clerkConfigured && citizenSessionStatus !== 'ready') return;
    const epoch = citizenEpoch.current;
    setEnrollmentPending(true);
    setEnrollmentError(null);

    if (!clerkConfigured) {
      if (!economy) setEconomy({ walletMinor: 0, inventory: [], nextRecoveryAt: new Date(Date.now() + recoverySeconds * 1000).toISOString() });
      setMarket((current) => current ? { ...current, available: nation.id === 'kindle' } : {
        available: nation.id === 'kindle', merchantCashMinor: 100000, mealReadyAt: null, mealFood: 2, mealCapacity: 4, mealIntervalSeconds: recoverySeconds,
        quotes: marketSeeds.map(([item, label, buyMinor, sellMinor, stock]) => ({ item, label, buyMinor, sellMinor, stock })),
      });
      if (nation.id === 'kindle' && !demoStarterGranted) {
        setDemoStarterGranted(true);
        setEconomy((current) => ({ walletMinor: current?.walletMinor ?? 0,
          nextRecoveryAt: current?.nextRecoveryAt ?? new Date(new Date().getTime() + recoverySeconds * 1000).toISOString(),
          inventory: [{ item: 'food', quantity: (current?.inventory.find((entry) => entry.item === 'food')?.quantity ?? 0) + 2 },
            ...(current?.inventory.filter((entry) => entry.item !== 'food') ?? [])] }));
      }
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
        economy?: Economy;
        market?: MarketState;
        playerMarket?: PlayerMarketState;
      };
      if (epoch !== citizenEpoch.current) return;
      if (!response.ok || !result.nationId) {
        if (result.citizenship) setCitizenshipStatus(result.citizenship);
        setEnrollmentError(result.error ?? 'Citizenship could not be recorded yet.');
        return;
      }

      setCitizenNationId(result.nationId);
      setSelectedId(result.nationId);
      if (result.citizenship) setCitizenshipStatus(result.citizenship);
      if (result.economy) setEconomy(result.economy);
      if (result.market) setMarket(result.market);
      if (result.playerMarket) setPlayerMarket(result.playerMarket);
      setPendingEnrollment(null);
    } catch {
      if (epoch !== citizenEpoch.current) return;
      setEnrollmentError('Citizenship could not be recorded yet. Please try again.');
    } finally {
      if (epoch !== citizenEpoch.current) return;
      setEnrollmentPending(false);
    }
  }

  function beginEnrollment(nationId: string) {
    setEnrollmentError(null);
    setPendingEnrollment(nationId);
  }

  const citizenScene = <section className={`citizen-scene scene-${viewMode}`} aria-label="Citizen location actions">
    {!citizenNation ? <div className="scene-access"><p>{clerkConfigured && citizenSessionStatus === 'loading' ? 'Loading your citizen…' : 'Choose citizenship to begin your daily life. Explore the world and its national rules before enrolling.'}</p>
      <button type="button" onClick={() => changeView('world')}>Explore nations and enroll</button>
      {clerkConfigured && citizenSessionStatus === 'anonymous' && <SignInButton mode="modal"><button type="button">Sign in</button></SignInButton>}
    </div> : <>
      {viewMode === 'household' && <>
        <DailyBriefing economy={economy} shifts={workShifts} capacity={capacity} market={market} government={government}
          citizenNationName={citizenNation.shortName} localDemo={!clerkConfigured} onRefresh={() => void runWork('refresh-work')}
          onOpenWork={() => changeView('workplace')} onOpenMarket={() => changeView('market')} />
        <section className="scene-belongings"><h2>Belongings and recovery</h2><p>{capacity} / 24 WC · {((economy?.walletMinor ?? 0) / 100).toFixed(2)} SPK</p>
          <ul>{economy?.inventory.map((entry) => <li key={entry.item}>{entry.item}: {entry.quantity} available</li>)}</ul>
          <p>Listed goods remain reserved at the market. Capacity recovers while you are away.</p>
          {economy?.nextRecoveryAt && <p>Next recovery: {new Date(economy.nextRecoveryAt).toLocaleString()}</p>}
        </section>
        <CitizenMarket showTrading={false} market={market} economy={economy} capacity={capacity} busy={workPending || Boolean(playerCommand)} uncertain={Boolean(marketCommand)}
          onTrade={(side, item, quantity) => void runMarket({ requestId: crypto.randomUUID(), action: 'market-trade', side, item, quantity })}
          onMeal={() => void runMarket({ requestId: crypto.randomUUID(), action: 'household-meal' })} onRetry={() => { if (marketCommand) void runMarket(marketCommand); }} />
        {!market?.available && <p>Household meals are currently supported for Kindle citizens. Other national economies are planned.</p>}
        <details className="household-planning"><summary>Household notes and commitments</summary>
          <p>Keep a private draft for household choices. Recording a civic commitment applies its effects and ends the citizenship grace period.</p>
          <label htmlFor="household-horizon">Planning horizon</label>
          <select id="household-horizon" disabled={decisionPending} value={horizon} onChange={event => { setHorizon(event.target.value as PlanHorizon); setPlanSaved(false); }}>
            <option value="today">Today</option><option value="week">This week</option><option value="season">This season</option>
          </select>
          <label htmlFor="household-note">Private household note</label>
          <textarea id="household-note" disabled={decisionPending} rows={3} maxLength={2000} value={planNote} onChange={event => { setPlanNote(event.target.value); setPlanSaved(false); }} />
          <button type="button" disabled={decisionPending} onClick={() => void saveHouseholdPlan()}>{decisionPending ? 'Saving…' : planSaved ? 'Draft saved' : 'Save household draft'}</button>
          {committedDecision ? <p>Recorded commitment: {committedDecision.outcome} · {new Date(committedDecision.committedAt).toLocaleDateString()}</p> : <>
            <p>Prototype civic choices · distinct from paid workplace shifts.</p>
            {availablePlanningItems.map(task => <button key={task.id} type="button" disabled={decisionPending} aria-pressed={completedPlanIds.includes(task.id)} onClick={() => togglePlan(task.id)}>
              <strong>{task.title}</strong><span>{task.detail} · Capacity {task.effects.capacity >= 0 ? '+' : ''}{task.effects.capacity} · Influence +{task.effects.influence}</span>
            </button>)}
            <button type="button" disabled={decisionPending || !completedPlanIds.length} onClick={() => {
              const task = availablePlanningItems.find(item => completedPlanIds.includes(item.id));
              if (task) void commitDecision({ optionId: task.id, infrastructureId: task.infrastructureId, householdMemberId: task.householdMemberId });
            }}>Record selected civic commitment</button>
          </>}
          {decisionError && <p role="alert">{decisionError}</p>}
        </details>
      </>}
      {viewMode === 'workplace' && <>
        <WorkShiftBoard shifts={workShifts} pending={workPending} error={workError} localDemo={!clerkConfigured} economy={economy}
          onRefresh={() => void runWork('refresh-work')} onClaim={(id) => void runWork('claim-work', undefined, id)} />
        <section className="scene-work-orders"><h2>Available contributions</h2>
          {availableWorkOrders.filter((order) => !order.nationId || order.nationId === citizenNation.id).map((order) => <button key={order.id} type="button"
            disabled={workPending || hasActiveShift || capacity < order.cost} onClick={() => void commitWork(order)}>
            <strong>{order.name}</strong><span>{order.detail} · {order.cost} WC{rewards[order.id] ? ` · ${(rewards[order.id].wageMinor / 100).toFixed(2)} SPK + ${rewards[order.id].quantity} ${rewards[order.id].item}` : ''}</span></button>)}
        {availableWorkOrders.filter((order) => !order.nationId || order.nationId === citizenNation.id).length === 0 && <p>No shifts are available for this nation yet. Kindle has the first supported work and wage programme; other national workplaces are planned.</p>}
        </section><button type="button" onClick={() => changeView('market')}>Take your earnings to market</button>
      </>}
      {viewMode === 'market' && <>
        <CitizenMarket showMeal={false} market={market} economy={economy} capacity={capacity} busy={workPending || Boolean(playerCommand)} uncertain={Boolean(marketCommand)}
          onTrade={(side, item, quantity) => void runMarket({ requestId: crypto.randomUUID(), action: 'market-trade', side, item, quantity })}
          onMeal={() => void runMarket({ requestId: crypto.randomUUID(), action: 'household-meal' })} onRetry={() => { if (marketCommand) void runMarket(marketCommand); }} />
        <PlayerMarket state={playerMarket} economy={economy} demo={!clerkConfigured} busy={workPending || Boolean(marketCommand)} uncertain={Boolean(playerCommand)}
          onCommand={(command) => void runPlayerCommand({ ...command, requestId: crypto.randomUUID() })} onRetry={() => { if (playerCommand) void runPlayerCommand(playerCommand); }} />
        {!market?.available && <p>Trading is currently supported in Kindle. Other nation markets are planned.</p>}
        <button type="button" onClick={() => changeView('household')}>Return to household</button>
      </>}
      {viewMode === 'government' && <>
        <h2>{citizenNation.government}</h2><p>{citizenNation.name} follows its own institutions. All government offices are AI/SI controlled in this release.</p>
        <GovernmentPanel snapshot={government} localDemo={!clerkConfigured} pending={governmentPending} error={governmentError} onPetition={(topic) => void petitionGovernment(topic)} />
        {!government && <p>Policy simulation and petitions are currently available for Kindle, Korund and Aurelle. This nation’s civic implementation is planned.</p>}
        <p>Elections, protests and public opinion systems are planned and will follow each nation’s rules. No election or protest is currently open here.</p>
      </>}
    </>}
  </section>;

  const worldPanel = <section className="game-national-context" aria-label="Nation exploration and citizenship">
    <p>Fictional globe geography · nation rules are fixed. Square ownership and cross-border trade are not simulated yet.</p>
    <div className="game-nation-choices">{worldNations.map(nation => <button key={nation.id} type="button" aria-pressed={selected.id===nation.id} onClick={()=>setSelectedId(nation.id)}>{nation.shortName}</button>)}</div>
    <h2>{selected.name}</h2><p>{selected.motto}</p>
    <dl><dt>Capital</dt><dd>{selected.capital}</dd><dt>Government</dt><dd>{selected.government}</dd><dt>Economy</dt><dd>{selected.economy}</dd><dt>Currency</dt><dd>{selected.currency}</dd><dt>Religion</dt><dd>{selected.religion}</dd></dl>
    {citizenNation ? <><p>Your citizen: {citizenNation.name}. {citizenshipRuleLabel(citizenshipStatus)}</p>
      {citizenNation.id!==selected.id && citizenshipStatus?.canChange && <button type="button" onClick={()=>beginEnrollment(selected.id)}>Change citizenship to {selected.shortName}</button>}</> : <button type="button" onClick={()=>beginEnrollment(selected.id)}>Enroll in {selected.shortName}</button>}
    <button type="button" onClick={()=>changeView('nation')}>Inspect national institutions</button>
    <SceneNews events={worldEvents} title="Regional notices" />
  </section>;
  const gamePanel = viewMode==='world' ? worldPanel : viewMode==='square' ? <>
    <p>{citizenNation?.capital ?? 'The city'} · A citizen’s daily life runs through home, work, market and civic institutions.</p>
    <SquareChat key={`${citizenEpoch.current}:${citizenNationId}`} enabled={clerkConfigured && citizenSessionStatus==='ready' && Boolean(citizenNationId)} nationId={citizenNationId} />
    <SceneNews events={worldEvents} title="City noticeboard" />
  </> : ['household','workplace','market','government'].includes(viewMode) ? citizenScene : viewMode==='nation' ?
    <NationDashboard capacity={capacity} citizenNation={citizenNation} key={selected.id} nation={selected} nations={worldNations}
      workPending={workPending||hasActiveShift} workStatus={workStatus} onCommitWork={commitWork}
      onPlanningView={()=>changeView('household')} onSelectNation={selectNation} onWorldView={()=>changeView('world')}
      workOrders={availableWorkOrders} worldEvents={worldEvents} /> : citizenScene;
  const activeShift = workShifts.find(shift=>!shift.claimedAt);
  const goods = (item:string)=>economy?.inventory.find(entry=>entry.item===item)?.quantity ?? 0;
  const contextItems: { id: string; label: string; detail: string; onSelect?: () => void }[] =
    viewMode === 'household' ? (economy?.inventory ?? []).map(entry => ({
      id: entry.item, label: entry.item[0].toUpperCase() + entry.item.slice(1), detail: `${entry.quantity} available`,
    })) : viewMode === 'workplace' ? availableWorkOrders
      .filter(order => Boolean(citizenNation) && (!order.nationId || order.nationId === citizenNation?.id))
      .map(order => ({ id: order.id, label: order.name,
        detail: `${order.cost} WC · ${order.detail}${rewards[order.id] ? ` · ${(rewards[order.id].wageMinor / 100).toFixed(2)} SPK + ${rewards[order.id].quantity} ${rewards[order.id].item}` : ''}${hasActiveShift ? ' · Shift in progress' : capacity < order.cost ? ' · More capacity needed' : ''}`,
      })) : viewMode === 'market' ? [
        ...(market?.quotes ?? []).map(quote => ({ id: quote.item, label: quote.label,
          detail: `Buy ${(quote.buyMinor / 100).toFixed(2)} · Sell ${(quote.sellMinor / 100).toFixed(2)} SPK · ${quote.stock} in stock`,
        })),
        { id: 'listings', label: 'Citizen listings', detail: `${playerMarket?.listings.filter(lot => lot.status === 'open').length ?? 0} open listings${playerMarket?.available ? '' : ' · Trading unavailable'}` },
      ] : viewMode === 'government' ? (government?.roles ?? []).map(role => ({
        id: role.name, label: role.name, detail: role.controller,
      })) : viewMode === 'world' || viewMode === 'nation' ? worldNations.map(nation => ({
        id: nation.id, label: nation.shortName, detail: `${nation.capital} · Stability ${nation.stability}`, onSelect: () => selectNation(nation.id),
      })) : viewMode === 'square' ? [
        { id: 'household', label: 'Household', detail: 'Belongings and recovery', onSelect: () => changeView('household') },
        { id: 'workplace', label: 'Workplace', detail: 'Contributions and earnings', onSelect: () => changeView('workplace') },
        { id: 'market', label: 'Market', detail: 'Goods and citizen listings', onSelect: () => changeView('market') },
        { id: 'government', label: 'Government', detail: 'Policy and petitions', onSelect: () => changeView('government') },
      ] : [];
  const contextTitle = viewMode === 'household' ? 'Belongings' : viewMode === 'workplace' ? 'Available jobs'
    : viewMode === 'market' ? 'Goods and listings' : viewMode === 'government' ? 'Government offices'
      : viewMode === 'world' || viewMode === 'nation' ? 'Nations' : viewMode === 'square' ? 'City destinations' : 'Household';
  return <>
    {clerkConfigured && <ClerkCitizenSession onHydrate={hydrateCitizen} onStatus={setCitizenSessionStatus} onIdentity={changeCitizenIdentity} />}
    <GameShell view={viewMode} nation={citizenNation ?? selected} nations={worldNations} capacity={capacity}
      walletMinor={economy?.walletMinor} inventory={economy ? {food:goods('food'),materials:goods('materials'),knowledge:goods('knowledge')} : undefined}
      shiftSummary={activeShift ? {title:activeShift.orderName,endsAt:Date.parse(activeShift.completesAt)/1000} : undefined}
      localDemo={!clerkConfigured} notice={workError ?? governmentError ?? recentAction ?? undefined} panel={gamePanel}
      contextItems={contextItems} contextTitle={contextTitle}
      onNavigate={changeView} onSelectNation={id=>setSelectedId(id)}
      accountControls={<ClerkAccountControl />} />
      {pendingNation && (
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
  </>;
}
