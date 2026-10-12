'use client';

import { useMemo, useState, type CSSProperties } from 'react';

type Affinity = 'Water' | 'Earth' | 'Fire' | 'Air';
type MapMode = 'sovereignty' | 'trade' | 'influence';

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
    color: '#176f83',
    softColor: '#b8dde0',
    motto: 'Many currents, one tide.',
    tradeStatus: 'Open commerce',
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
    color: '#397aa4',
    softColor: '#c8ddec',
    motto: 'What the river gives, we share.',
    tradeStatus: 'Board approval',
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
    color: '#397453',
    softColor: '#c7dac5',
    motto: 'Patient stone, enduring harvest.',
    tradeStatus: 'Licensed trade',
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
    color: '#6f6942',
    softColor: '#ddd7b6',
    motto: 'From root to summit.',
    tradeStatus: 'Royal charter',
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
    color: '#8c3f35',
    softColor: '#e2c0b7',
    motto: 'From discipline, strength.',
    tradeStatus: 'State bureau only',
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
    color: '#b55d2d',
    softColor: '#efd2ad',
    motto: 'A brighter day, held in common.',
    tradeStatus: 'Open commerce',
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
    color: '#6c648d',
    softColor: '#d8d1e7',
    motto: 'Under one sky, with open eyes.',
    tradeStatus: 'Doctrinal review',
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
    color: '#847796',
    softColor: '#ded8e5',
    motto: 'Listen above the noise.',
    tradeStatus: 'Approved orders',
  },
];

const mapRows = [
  ['tidelands', 'tidelands', 'tidelands', 'delta', 'delta', 'jade', 'jade'],
  ['tidelands', 'tidelands', 'delta', 'delta', 'jade', 'jade', 'terraced', 'terraced'],
  ['tidelands', 'delta', 'delta', 'jade', 'jade', 'terraced', 'terraced', 'terraced'],
  ['solar', 'solar', 'ashen', 'ashen', 'jade', 'terraced', 'sky', 'sky'],
  ['solar', 'solar', 'solar', 'ashen', 'ashen', 'sky', 'sky', 'celestial'],
  ['solar', 'solar', 'ashen', 'ashen', 'sky', 'sky', 'celestial', 'celestial'],
  ['solar', 'ashen', 'ashen', 'sky', 'celestial', 'celestial', 'celestial'],
];

const capitalTiles: Record<string, string> = {
  '1-0': 'Port Meridian',
  '1-3': 'Confluence',
  '1-5': 'Verdant Seat',
  '2-7': 'High Terrace',
  '4-3': 'Cinderhold',
  '5-0': 'Dawn Assembly',
  '4-6': 'Aerie of Accord',
  '5-7': 'The Quiet Spire',
};

const affinityMark: Record<Affinity, string> = {
  Water: '≈',
  Earth: '◆',
  Fire: '▲',
  Air: '○',
};

const workOrders = [
  { id: 'harvest', name: 'Support the harvest', detail: '+480 food · resolves in 2h', cost: 4 },
  { id: 'freight', name: 'Move a materials convoy', detail: '+210 materials · resolves in 4h', cost: 6 },
  { id: 'archive', name: 'Catalogue the city archive', detail: '+95 knowledge · resolves in 3h', cost: 3 },
];

const modeDescriptions: Record<MapMode, string> = {
  sovereignty: 'Recognized borders and national capitals',
  trade: 'Active corridors, border access, and route exposure',
  influence: 'Local affinity, foreign influence, and civic pressure',
};

export default function Home() {
  const [selectedId, setSelectedId] = useState('jade');
  const [citizenNationId, setCitizenNationId] = useState<string | null>(null);
  const [pendingEnrollment, setPendingEnrollment] = useState<string | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>('sovereignty');
  const [capacity, setCapacity] = useState(18);
  const [recentAction, setRecentAction] = useState<string | null>(null);

  const selected = useMemo(
    () => nations.find((nation) => nation.id === selectedId) ?? nations[0],
    [selectedId],
  );
  const citizenNation = nations.find((nation) => nation.id === citizenNationId);
  const pendingNation = nations.find((nation) => nation.id === pendingEnrollment);

  function commitWork(name: string, cost: number) {
    if (capacity < cost || !citizenNation) return;
    setCapacity((current) => current - cost);
    setRecentAction(`${citizenNation.shortName}: you committed ${cost} Work Capacity to “${name}.”`);
  }

  return (
    <main className="world-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">H</span>
          <div>
            <p className="brand-name">Harimu</p>
            <p className="brand-kicker">The world continues</p>
          </div>
        </div>

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
            onClick={() => citizenNation && setSelectedId(citizenNation.id)}
            type="button"
          >
            {citizenNation ? citizenNation.shortName : 'Unenrolled citizen'}
          </button>
        </div>
      </header>

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
                type="button"
              >
                <span
                  className="nation-sigil"
                  style={{ '--nation-color': nation.color } as CSSProperties}
                  aria-hidden="true"
                >
                  {affinityMark[nation.affinity]}
                </span>
                <span>
                  <strong>{nation.shortName}</strong>
                  <small>{nation.affinity}</small>
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

        <section className="map-stage" aria-label="Political world map">
          <div className="map-toolbar">
            <div>
              <span className="eyebrow">Political map</span>
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

          <div className={`map-frame mode-${mapMode}`}>
            <div className="map-atmosphere map-atmosphere-one" />
            <div className="map-atmosphere map-atmosphere-two" />
            <div className="trade-route route-one" aria-hidden="true" />
            <div className="trade-route route-two" aria-hidden="true" />
            <div className="mode-indicator">
              <span>{mapMode}</span>
              <strong>{modeDescriptions[mapMode]}</strong>
            </div>

            <div className="hex-map">
              {mapRows.map((row, rowIndex) => (
                <div className="hex-row" key={`row-${rowIndex}`}>
                  {row.map((nationId, columnIndex) => {
                    const nation = nations.find((item) => item.id === nationId)!;
                    const tileKey = `${rowIndex}-${columnIndex}`;
                    const capital = capitalTiles[tileKey];
                    return (
                      <button
                        aria-label={`${nation.name}${capital ? `, capital ${capital}` : ''}`}
                        className={`hex-tile ${selectedId === nationId ? 'is-highlighted' : ''}`}
                        key={tileKey}
                        onClick={() => setSelectedId(nationId)}
                        style={
                          {
                            '--nation-color': nation.color,
                            '--nation-soft': nation.softColor,
                          } as CSSProperties
                        }
                        type="button"
                      >
                        {capital && (
                          <span className="capital-marker" title={capital}>
                            <i />
                            <b>{capital}</b>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="map-legend">
              <span><i className="legend-capital" /> Capital</span>
              <span><i className="legend-route" /> Active trade route</span>
              <span><i className="legend-border" /> Sovereign border</span>
            </div>
          </div>

          <div className="world-ticker" aria-label="Recent world events">
            <span>Now</span>
            <p>{recentAction ?? <><strong>Verdant Seat</strong> completed 12,480 units of food production.</>}</p>
            <span>18:31</span>
            <p><strong>Terraced Crown</strong> opened bids for an eastern materials route.</p>
            <span>18:22</span>
            <p><strong>Sky Covenant</strong> began doctrinal review of the Meridian treaty.</p>
          </div>
        </section>

        <aside className="nation-panel" style={{ '--selected': selected.color } as CSSProperties}>
          <div className="panel-sigil" aria-hidden="true">{affinityMark[selected.affinity]}</div>
          <span className="eyebrow">{selected.affinity} affinity</span>
          <h2>{selected.name}</h2>
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

      {pendingNation && (
        <div className="dialog-backdrop" role="presentation">
          <section aria-labelledby="enrollment-title" aria-modal="true" className="enrollment-dialog" role="dialog">
            <div
              className="dialog-sigil"
              style={{ '--selected': pendingNation.color } as CSSProperties}
              aria-hidden="true"
            >
              {affinityMark[pendingNation.affinity]}
            </div>
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
