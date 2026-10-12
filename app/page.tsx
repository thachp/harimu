'use client';

import Image from 'next/image';
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

type Affinity = 'Water' | 'Earth' | 'Fire' | 'Air';
type MapMode = 'sovereignty' | 'trade' | 'influence';
type ViewMode = 'world' | 'planning';
type PlanHorizon = 'today' | 'week' | 'season';

type Nation = {
  id: string;
  name: string;
  shortName: string;
  affinity: Affinity;
  government: string;
  economy: string;
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
    id: 'tidelands',
    name: 'Tidelands Republic',
    shortName: 'Tidelands',
    affinity: 'Water',
    government: 'Federal presidential democracy',
    economy: 'Regulated market capitalism',
    capital: 'Port Meridian',
    population: '1.42m',
    treasury: '₳ 86.4m',
    stability: 78,
    color: '#43a7ad',
    softColor: '#b8dde0',
    motto: 'Many currents, one tide.',
    tradeStatus: 'Open commerce',
    position: { x: 27, y: 29 },
  },
  {
    id: 'delta',
    name: 'Delta Cooperative',
    shortName: 'Delta',
    affinity: 'Water',
    government: 'Council-based socialist republic',
    economy: 'Cooperative mixed economy',
    capital: 'Confluence',
    population: '1.16m',
    treasury: '₳ 61.8m',
    stability: 83,
    color: '#69a9d0',
    softColor: '#c8ddec',
    motto: 'What the river gives, we share.',
    tradeStatus: 'Board approval',
    position: { x: 48, y: 24 },
  },
  {
    id: 'jade',
    name: 'Jade Union',
    shortName: 'Jade Union',
    affinity: 'Earth',
    government: 'Single-party socialist republic',
    economy: 'State-directed market socialism',
    capital: 'Verdant Seat',
    population: '1.87m',
    treasury: '₳ 103.1m',
    stability: 86,
    color: '#5e9f73',
    softColor: '#c7dac5',
    motto: 'Patient stone, enduring harvest.',
    tradeStatus: 'Licensed trade',
    position: { x: 68, y: 30 },
  },
  {
    id: 'terraced',
    name: 'Terraced Crown',
    shortName: 'Terraced Crown',
    affinity: 'Earth',
    government: 'Absolute hereditary monarchy',
    economy: 'Crown-directed market economy',
    capital: 'High Terrace',
    population: '924k',
    treasury: '₳ 74.6m',
    stability: 72,
    color: '#a29558',
    softColor: '#ddd7b6',
    motto: 'From root to summit.',
    tradeStatus: 'Royal charter',
    position: { x: 56, y: 43 },
  },
  {
    id: 'ashen',
    name: 'Ashen Directorate',
    shortName: 'Ashen',
    affinity: 'Fire',
    government: 'Personalist single-party state',
    economy: 'Centrally planned command economy',
    capital: 'Cinderhold',
    population: '1.31m',
    treasury: '₳ 58.2m',
    stability: 68,
    color: '#c25740',
    softColor: '#e2c0b7',
    motto: 'From discipline, strength.',
    tradeStatus: 'State bureau only',
    position: { x: 42, y: 72 },
  },
  {
    id: 'solar',
    name: 'Solar Commonwealth',
    shortName: 'Solar',
    affinity: 'Fire',
    government: 'Parliamentary democracy',
    economy: 'Social-market capitalism',
    capital: 'Dawn Assembly',
    population: '1.09m',
    treasury: '₳ 79.3m',
    stability: 81,
    color: '#d28a45',
    softColor: '#efd2ad',
    motto: 'A brighter day, held in common.',
    tradeStatus: 'Open commerce',
    position: { x: 73, y: 72 },
  },
  {
    id: 'sky',
    name: 'Sky Covenant',
    shortName: 'Sky Covenant',
    affinity: 'Air',
    government: 'Guardian theocracy',
    economy: 'Mixed market and charitable trusts',
    capital: 'Aerie of Accord',
    population: '778k',
    treasury: '₳ 48.9m',
    stability: 75,
    color: '#9b8ac1',
    softColor: '#d8d1e7',
    motto: 'Under one sky, with open eyes.',
    tradeStatus: 'Doctrinal review',
    position: { x: 27, y: 54 },
  },
  {
    id: 'celestial',
    name: 'Celestial See',
    shortName: 'Celestial See',
    affinity: 'Air',
    government: 'Elective theocratic principality',
    economy: 'Temple, guild, and communal economy',
    capital: 'The Quiet Spire',
    population: '642k',
    treasury: '₳ 41.7m',
    stability: 88,
    color: '#8e82a8',
    softColor: '#ded8e5',
    motto: 'Listen above the noise.',
    tradeStatus: 'Approved orders',
    position: { x: 48, y: 54 },
  },
];

const affinityMark: Record<Affinity, string> = {
  Water: 'W',
  Earth: 'E',
  Fire: 'F',
  Air: 'A',
};

const fallbackWorkOrders: WorkOrder[] = [
  { id: 'harvest', name: 'Support the harvest', detail: '+480 food · resolves in 2h', cost: 4 },
  { id: 'freight', name: 'Move a materials convoy', detail: '+210 materials · resolves in 4h', cost: 6 },
  { id: 'archive', name: 'Catalogue the city archive', detail: '+95 knowledge · resolves in 3h', cost: 3 },
];

const modeDescriptions: Record<MapMode, string> = {
  sovereignty: 'Recognized borders, national capitals, and sovereign territory',
  trade: 'Commercial access, open corridors, and restricted crossings',
  influence: 'Affinity, foreign pressure, and the civic pull of each region',
};

const fallbackPlanningItems: PlanningTask[] = [
  {
    id: 'capacity',
    title: 'Commit Work Capacity',
    detail: 'Reserve 6 WC for the Verdant Seat harvest cooperative.',
    meta: '6 WC · before 20:00',
    effects: { capacity: -6, influence: 20, water: 4, stability: 1 },
    outcome: 'Harvest crews reinforce the intake before the rain, protecting tomorrow’s reserve.',
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
  { id: 1, occurredAt: 'Today · 20:00', headline: 'Capacity grant closes', kind: 'Work', detail: 'Verdant Seat closes allocations for tomorrow’s harvest.', location: 'Verdant Seat' },
  { id: 2, occurredAt: 'Day 43 · 09:00', headline: 'District assembly session', kind: 'Civic', detail: 'The eastern waterworks proposal enters public debate.', location: 'Verdant Ward' },
  { id: 3, occurredAt: 'Day 45 · 18:00', headline: 'Trade corridor vote', kind: 'Ballot', detail: 'Citizens decide the Solar–Delta corridor mandate.', location: 'World Assembly' },
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
    name: 'Harvest Cooperative',
    kind: 'Food & employment',
    status: 'Shift needs 6 WC',
    detail: 'Terrace crews can secure tomorrow’s harvest before the evening rain.',
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
    name: 'Canal School',
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
    name: 'River Rail Depot',
    kind: 'Trade & transport',
    status: 'Freight due 06:40',
    detail: 'The Delta materials convoy is expected before first shift.',
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
      role: 'Canal School pupil',
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
              <span>Day 42 · Verdant Ward · {nationCount} nation world</span>
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
            <section className="town-map" aria-label="Verdant Ward infrastructure map">
              <div className="town-map-heading">
                <span><Buildings aria-hidden="true" size={15} /> Town plan · infrastructure</span>
                <strong>Verdant Ward</strong>
                <small>Select a place to inspect its role in your plan.</small>
              </div>

              <div className="town-weather-card">
                <span>21:30</span>
                <div><Leaf aria-hidden="true" size={19} /><strong>Evening rain</strong><small>Terrace crews have 2h remaining</small></div>
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
                      <li>Evening rain will refill terrace channels.</li>
                      <li>The Delta parts convoy arrives before first shift.</li>
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
  } | null;
  plan: { horizon: PlanHorizon; note: string; completedIds: string[] } | null;
  decision: CitizenDecision | null;
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
  const [viewOverride, setViewOverride] = useState<ViewMode | null>(null);
  const viewMode: ViewMode = viewOverride ?? (requestedView === 'planning' ? 'planning' : 'world');
  const designPreview = process.env.NODE_ENV !== 'production'
    && new URLSearchParams(locationSearch).get('preview') === '1';
  const [selectedId, setSelectedId] = useState('jade');
  const [citizenNationId, setCitizenNationId] = useState<string | null>(null);
  const [pendingEnrollment, setPendingEnrollment] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>('sovereignty');
  const [capacity, setCapacity] = useState(18);
  const [influence, setInfluence] = useState(1240);
  const [waterSecurity, setWaterSecurity] = useState(71);
  const [wardStability, setWardStability] = useState(86);
  const [recentAction, setRecentAction] = useState<string | null>(null);
  const [compactView, setCompactView] = useState(false);
  const [horizon, setHorizon] = useState<PlanHorizon>('week');
  const [completedPlanIds, setCompletedPlanIds] = useState<string[]>(['capacity']);
  const [planSaved, setPlanSaved] = useState(false);
  const [planNote, setPlanNote] = useState('Ask the forum how the eastern waterworks will affect Verdant Ward.');
  const [committedDecision, setCommittedDecision] = useState<CitizenDecision | null>(null);
  const [decisionPending, setDecisionPending] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [citizenSessionStatus, setCitizenSessionStatus] = useState<CitizenSessionStatus>(
    clerkConfigured ? 'loading' : 'anonymous',
  );

  const selected = useMemo(
    () => worldNations.find((nation) => nation.id === selectedId) ?? worldNations[0],
    [selectedId, worldNations],
  );
  const citizenNation = worldNations.find((nation) => nation.id === citizenNationId);
  const pendingNation = worldNations.find((nation) => nation.id === pendingEnrollment);
  const planningNation = citizenNation ?? selected;

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

  async function commitWork(order: WorkOrder) {
    if (capacity < order.cost || !citizenNation) return;

    if (clerkConfigured) {
      const response = await fetch('/api/citizen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit-work', workOrderId: order.id }),
      });
      if (!response.ok) {
        setRecentAction(response.status === 401
          ? 'Sign in before committing Work Capacity.'
          : 'Your contribution could not be recorded yet.');
        return;
      }
      const result = await response.json() as { capacity: number };
      setCapacity(result.capacity);
    } else {
      setCapacity((current) => current - order.cost);
    }

    setRecentAction(`${citizenNation.shortName}: you committed ${order.cost} Work Capacity to “${order.name}.”`);
  }

  function changeView(nextView: ViewMode) {
    setViewOverride(nextView);
    setCompactView(false);
    const url = new URL(window.location.href);
    if (nextView === 'planning') url.searchParams.set('view', 'planning');
    else url.searchParams.delete('view');
    window.history.replaceState({}, '', url);
  }

  function togglePlan(id: string) {
    setCompletedPlanIds((current) => (current.includes(id) ? [] : [id]));
    setPlanSaved(false);
    setDecisionError(null);
  }

  const hydrateCitizen = useCallback((snapshot: CitizenSnapshot) => {
    if (snapshot.profile) {
      setCitizenNationId(snapshot.profile.nationId);
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
    setCitizenNationId(nation.id);
    setSelectedId(nation.id);
    setPendingEnrollment(null);

    if (!clerkConfigured) return;
    const response = await fetch('/api/citizen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'enroll', nationId: nation.id }),
    });
    if (!response.ok) {
      setRecentAction(response.status === 401
        ? 'Citizenship is selected locally. Sign in to preserve it in the world record.'
        : 'Citizenship is selected locally but has not reached the world record yet.');
    }
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
            <small>4 affinities</small>
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
                <span className="nation-sigil" aria-hidden="true">{affinityMark[nation.affinity]}</span>
                <span>
                  <strong>{nation.shortName}</strong>
                  <small>{nation.affinity} affinity</small>
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
            <div className="panel-sigil" aria-hidden="true">{affinityMark[selected.affinity]}</div>
            <div>
              <span className="eyebrow">{selected.affinity} affinity</span>
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
                <small>One citizen · one nation</small>
              </div>
              {citizenNation.id === selected.id && (
                <div className="work-board">
                  <div className="work-board-heading">
                    <div>
                      <span className="eyebrow">Citizen work board</span>
                      <strong>Available contributions</strong>
                    </div>
                    <b>{capacity} WC</b>
                  </div>
                  {availableWorkOrders
                    .filter((order) => !order.nationId || order.nationId === citizenNation.id)
                    .map((order) => (
                    <button
                      disabled={capacity < order.cost}
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
              onClick={() => setPendingEnrollment(selected.id)}
              type="button"
            >
              Enroll in {selected.shortName}
              <span>Citizenship is exclusive</span>
            </button>
          )}
        </aside>
      </div>
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
            <div className="dialog-sigil" aria-hidden="true">{affinityMark[pendingNation.affinity]}</div>
            <span className="eyebrow">Exclusive citizenship</span>
            <h2 id="enrollment-title">Enroll in {pendingNation.name}?</h2>
            <p>
              Your citizen may belong to only one nation. Citizenship controls your political rights,
              national institutions, and starting economy.
            </p>
            <dl>
              <div><dt>Government</dt><dd>{pendingNation.government}</dd></div>
              <div><dt>Economy</dt><dd>{pendingNation.economy}</dd></div>
            </dl>
            <div className="dialog-actions">
              <button className="secondary-action" onClick={() => setPendingEnrollment(null)} type="button">
                Keep exploring
              </button>
              <button
                className="primary-action"
                onClick={() => void confirmEnrollment(pendingNation)}
                type="button"
              >
                Confirm citizenship
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
