'use client';

import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useUser,
} from '@clerk/nextjs';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
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

const nations: Nation[] = [
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

const workOrders = [
  { id: 'harvest', name: 'Support the harvest', detail: '+480 food · resolves in 2h', cost: 4 },
  { id: 'freight', name: 'Move a materials convoy', detail: '+210 materials · resolves in 4h', cost: 6 },
  { id: 'archive', name: 'Catalogue the city archive', detail: '+95 knowledge · resolves in 3h', cost: 3 },
];

const modeDescriptions: Record<MapMode, string> = {
  sovereignty: 'Recognized borders, national capitals, and sovereign territory',
  trade: 'Commercial access, open corridors, and restricted crossings',
  influence: 'Affinity, foreign pressure, and the civic pull of each region',
};

const planningItems = [
  {
    id: 'capacity',
    title: 'Commit Work Capacity',
    detail: 'Reserve 6 WC for the Verdant Seat harvest cooperative.',
    meta: '6 WC · before 20:00',
  },
  {
    id: 'forum',
    title: 'Attend the district forum',
    detail: 'Hear arguments on the eastern waterworks proposal.',
    meta: 'Civic · 21:30',
  },
  {
    id: 'ballot',
    title: 'Review the trade ballot',
    detail: 'Compare the open-corridor and licensed-market measures.',
    meta: 'Vote closes in 2d',
  },
];

const horizonMoments = [
  { day: 'Today', time: '20:00', title: 'Capacity grant closes', kind: 'Work' },
  { day: 'Day 43', time: '09:00', title: 'District assembly session', kind: 'Civic' },
  { day: 'Day 45', time: '18:00', title: 'Trade corridor vote', kind: 'Ballot' },
];

type PlanningDashboardProps = {
  citizenName: string;
  nation: Nation;
  capacity: number;
  horizon: PlanHorizon;
  completedPlanIds: string[];
  planSaved: boolean;
  preview?: boolean;
  onHorizonChange: (horizon: PlanHorizon) => void;
  onTogglePlan: (id: string) => void;
  onSavePlan: () => void;
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
  horizon,
  completedPlanIds,
  planSaved,
  preview = false,
  onHorizonChange,
  onTogglePlan,
  onSavePlan,
  onWorldView,
}: PlanningDashboardProps) {
  const completedCount = completedPlanIds.length;

  return (
    <section className="planning-view" aria-label="Citizen planning view">
      <div className="planning-atmosphere" aria-hidden="true" />
      {preview && (
        <div className="clerk-setup-notice" role="status">
          <span>Clerk setup preview</span>
          <p>Add your Clerk keys to activate sign-in and give every citizen a private planning desk.</p>
          <code>.env.local</code>
        </div>
      )}

      <div className="planning-heading">
        <div>
          <span className="eyebrow">Citizen planning desk · Day 42</span>
          <h1>Shape your week before the world moves.</h1>
          <p>Turn civic intent into a clear plan across work, community, and national decisions.</p>
        </div>
        <button className="return-world-button" onClick={onWorldView} type="button">
          View the world
        </button>
      </div>

      <div className="planning-grid">
        <aside className="citizen-card">
          <div className="citizen-monogram" aria-hidden="true">
            {citizenName.slice(0, 1).toUpperCase()}
          </div>
          <span className="eyebrow">Citizen record</span>
          <h2>{citizenName}</h2>
          <p className="citizen-residence">Verdant Ward · {nation.capital}</p>

          <dl className="citizen-vitals">
            <div><dt>Citizenship</dt><dd>{nation.shortName}</dd></div>
            <div><dt>Standing</dt><dd>Good standing</dd></div>
            <div><dt>Influence</dt><dd>1,240 civic</dd></div>
          </dl>

          <div className="capacity-ledger">
            <div>
              <span>Available capacity</span>
              <strong>{capacity}<small> / 24 WC</small></strong>
            </div>
            <div className="capacity-ledger-track" aria-label={`${capacity} of 24 capacity available`}>
              <span style={{ width: `${(capacity / 24) * 100}%` }} />
            </div>
            <p>Capacity renews at the start of Day 43.</p>
          </div>

          <div className="citizen-principle">
            <span>Citizen principle</span>
            <p>“What I choose today becomes part of our shared history.”</p>
          </div>
        </aside>

        <section className="planning-board">
          <div className="planning-board-head">
            <div>
              <span className="eyebrow">Your commitments</span>
              <h2>Plan the horizon</h2>
            </div>
            <span className="plan-progress">{completedCount} / {planningItems.length} ready</span>
          </div>

          <div className="horizon-tabs" role="group" aria-label="Planning horizon">
            {(['today', 'week', 'season'] as PlanHorizon[]).map((item) => (
              <button
                aria-pressed={horizon === item}
                className={horizon === item ? 'active' : ''}
                key={item}
                onClick={() => onHorizonChange(item)}
                type="button"
              >
                {item === 'week' ? '7 days' : item[0].toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>

          <div className="plan-list">
            {planningItems.map((item, index) => {
              const done = completedPlanIds.includes(item.id);
              return (
                <button
                  aria-pressed={done}
                  className={`plan-item ${done ? 'is-complete' : ''}`}
                  key={item.id}
                  onClick={() => onTogglePlan(item.id)}
                  type="button"
                >
                  <span className="plan-index">{done ? '✓' : String(index + 1).padStart(2, '0')}</span>
                  <span className="plan-copy">
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span className="plan-meta">{item.meta}</span>
                </button>
              );
            })}
          </div>

          <div className="planning-note">
            <label htmlFor="citizen-note">Private note</label>
            <textarea
              defaultValue="Ask the forum how the eastern waterworks will affect Verdant Ward."
              id="citizen-note"
              rows={3}
            />
          </div>

          <div className="planning-actions">
            <p>{planSaved ? 'Plan saved to this citizen’s record.' : 'Your choices remain private until you commit them.'}</p>
            <button className="save-plan-button" onClick={onSavePlan} type="button">
              {planSaved ? 'Plan saved' : 'Save citizen plan'}
            </button>
          </div>
        </section>

        <aside className="horizon-card">
          <span className="eyebrow">World horizon</span>
          <h2>What happens next</h2>
          <div className="horizon-list">
            {horizonMoments.map((moment) => (
              <article key={moment.title}>
                <div>
                  <span>{moment.day}</span>
                  <time>{moment.time}</time>
                </div>
                <div>
                  <small>{moment.kind}</small>
                  <strong>{moment.title}</strong>
                </div>
              </article>
            ))}
          </div>

          <div className="world-pulse-card">
            <span>World pulse</span>
            <strong>8 nations · 9.2m citizens</strong>
            <p>Trade activity is rising while regional stability remains steady.</p>
            <div>
              <i style={{ height: '34%' }} />
              <i style={{ height: '48%' }} />
              <i style={{ height: '43%' }} />
              <i style={{ height: '66%' }} />
              <i style={{ height: '58%' }} />
              <i style={{ height: '78%' }} />
              <i style={{ height: '71%' }} />
              <i style={{ height: '88%' }} />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SignedInPlanningDashboard(props: Omit<PlanningDashboardProps, 'citizenName' | 'preview'>) {
  const { user } = useUser();
  const citizenName = user?.firstName || user?.fullName || 'Harimu citizen';
  return <PlanningDashboard {...props} citizenName={citizenName} />;
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
  const [viewMode, setViewMode] = useState<ViewMode>('world');
  const [selectedId, setSelectedId] = useState('jade');
  const [citizenNationId, setCitizenNationId] = useState<string | null>(null);
  const [pendingEnrollment, setPendingEnrollment] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>('sovereignty');
  const [capacity, setCapacity] = useState(18);
  const [recentAction, setRecentAction] = useState<string | null>(null);
  const [compactView, setCompactView] = useState(false);
  const [horizon, setHorizon] = useState<PlanHorizon>('week');
  const [completedPlanIds, setCompletedPlanIds] = useState<string[]>(['capacity']);
  const [planSaved, setPlanSaved] = useState(false);

  const selected = useMemo(
    () => nations.find((nation) => nation.id === selectedId) ?? nations[0],
    [selectedId],
  );
  const citizenNation = nations.find((nation) => nation.id === citizenNationId);
  const pendingNation = nations.find((nation) => nation.id === pendingEnrollment);
  const planningNation = citizenNation ?? selected;

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setPendingEnrollment(null);
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);

  function commitWork(name: string, cost: number) {
    if (capacity < cost || !citizenNation) return;
    setCapacity((current) => current - cost);
    setRecentAction(`${citizenNation.shortName}: you committed ${cost} Work Capacity to “${name}.”`);
  }

  function changeView(nextView: ViewMode) {
    setViewMode(nextView);
    setCompactView(false);
    const url = new URL(window.location.href);
    if (nextView === 'planning') url.searchParams.set('view', 'planning');
    else url.searchParams.delete('view');
    window.history.replaceState({}, '', url);
  }

  function togglePlan(id: string) {
    setCompletedPlanIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
    setPlanSaved(false);
  }

  const planningProps = {
    nation: planningNation,
    capacity,
    horizon,
    completedPlanIds,
    planSaved,
    onHorizonChange: (nextHorizon: PlanHorizon) => {
      setHorizon(nextHorizon);
      setPlanSaved(false);
    },
    onTogglePlan: togglePlan,
    onSavePlan: () => setPlanSaved(true),
    onWorldView: () => changeView('world'),
  };

  return (
    <main className={`world-shell view-${viewMode} ${compactView ? 'is-map-focus' : ''}`}>
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
            {citizenNation ? citizenNation.shortName : 'Unenrolled citizen'}
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
            <span>Eight nations</span>
            <small>4 affinities</small>
          </div>
          <div className="nation-list">
            {nations.map((nation) => (
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
            <strong>Solar–Delta trade corridor ratified</strong>
            <small>Effective in 05h 18m</small>
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
            {nations.map((nation) => (
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
            <p>{recentAction ?? <><strong>Verdant Seat</strong> completed 12,480 units of food production.</>}</p>
            <time>18:31</time>
            <p><strong>Terraced Crown</strong> opened bids for an eastern materials route.</p>
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
                  {workOrders.map((order) => (
                    <button
                      disabled={capacity < order.cost}
                      key={order.id}
                      onClick={() => commitWork(order.name, order.cost)}
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
                onClick={() => {
                  setCitizenNationId(pendingNation.id);
                  setSelectedId(pendingNation.id);
                  setPendingEnrollment(null);
                }}
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
