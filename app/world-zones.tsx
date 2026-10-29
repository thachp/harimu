'use client';
import { useEffect, useState } from 'react';
import { acquisitionRules, zoneLabels, zoneOrder, type Zone } from '@/lib/map-zone-labels';
import type { WorldSquare } from '@/lib/map-zones';
import { zoneTooltips } from '@/lib/land-copy';
import styles from './world-zones.module.css';

export const zoneOverlayKey = 'harimu:zone-overlay';

export const zoneColors: Record<Zone, string> = { heartland: '#c9893a', frontier: '#d9c46a', wildlands: '#6f9a6b', commons: '#8a6fb8' };
type Payload = { width: number; height: number; squares: WorldSquare[] };
const ownerName = (owner: string | null, names: Record<string, string>) => owner ? names[owner] ?? owner : 'Unclaimed';

/** #1017: build flag NEXT_PUBLIC_HARIMU_ZONE_LEGEND ("true" in preview, "false" in production). */
export const zoneLegendEnabled = (value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_ZONE_LEGEND) => value === 'true';

/** Zone legend (#66). With #1017 on, each zone also says what it means (docs §6.1, copy from lib/land-copy.ts #338) and the
 *  grid's ★/▲ markers get a key, so the legend never relies on color alone (§23.2). Off: the #66 markup, unchanged. */
export function ZoneLegend({ explained = zoneLegendEnabled() }: { explained?: boolean }) {
  if (!explained) return <ul className={styles.legend} aria-label="Zone legend">{zoneOrder.map(z => <li key={z}><span style={{ background: zoneColors[z] }} aria-hidden="true" />{zoneLabels[z]}</li>)}</ul>;
  return <ul className={`${styles.legend} ${styles.legendExplained}`} aria-label="Zone legend">
    {zoneOrder.map(z => <li key={z}><span style={{ background: zoneColors[z] }} aria-hidden="true" /><strong>{zoneLabels[z]}</strong><small>{zoneTooltips[z].text}</small></li>)}
    <li><b aria-hidden="true">★</b><strong>Capital</strong></li>
    <li><b aria-hidden="true">▲</b><strong>Border outpost</strong></li>
  </ul>;
}

/** Plain-words inspector fields for one square (#66). */
export function squareInspection(square: WorldSquare, names: Record<string, string> = {}) {
  return [
    ['Zone', zoneLabels[square.zone]], ['Owner', ownerName(square.owner, names)], ['Terrain', square.terrain],
    ['Resource', square.resource ?? 'None'], ['Acquisition', acquisitionRules[square.zone]],
  ] as const;
}

export function WorldZones({ nationNames = {} }: { nationNames?: Record<string, string> }) {
  const [show, setShowState] = useState(false);
  // #189: remember the Zone overlay choice for the session so it survives leaving and returning to Country.
  useEffect(() => { try { if (sessionStorage.getItem(zoneOverlayKey) === '1') queueMicrotask(() => setShowState(true)); } catch {} }, []);
  const setShow = (value: boolean) => { setShowState(value); try { sessionStorage.setItem(zoneOverlayKey, value ? '1' : '0'); } catch {} };
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<WorldSquare | null>(null);
  useEffect(() => {
    if (!show || data) return;
    let active = true;
    queueMicrotask(() => { if (active) setError(false); });
    fetch('/api/world/squares').then(r => r.ok ? r.json() as Promise<Payload> : Promise.reject())
      .then(v => { if (active) { setData(v); setError(false); } }, () => { if (active) setError(true); });
    return () => { active = false; };
  }, [show, data]);
  return <section className={styles.zones} aria-label="World map zones">
    <label className={styles.toggle}><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} /> Zone overlay</label>
    {show && <>
      <ZoneLegend />
      {error && <p role="alert">World squares are unavailable right now.</p>}
      {!data && !error && <p role="status">Loading world squares…</p>}
      {data && <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${data.width}, 1fr)` }} role="group" aria-label={`World squares, ${data.width} by ${data.height}`}>
        {data.squares.map(s => <button key={`${s.x},${s.y}`} type="button" className={styles.square} style={{ background: zoneColors[s.zone] }}
          aria-pressed={selected?.x === s.x && selected?.y === s.y} onClick={() => setSelected(s)}
          aria-label={`Square ${s.x}, ${s.y}: ${zoneLabels[s.zone]}${s.feature ? `, ${s.feature}` : ''}`}>{s.feature === 'capital' ? '★' : s.feature === 'border outpost' ? '▲' : ''}</button>)}
      </div>}
      {selected && <section className={styles.inspector} aria-live="polite" aria-label="Square inspector">
        <h3>Square {selected.x}, {selected.y}{selected.feature ? ` · ${selected.feature}` : ''}</h3>
        <dl>{squareInspection(selected, nationNames).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <button type="button" onClick={() => setSelected(null)}>Close</button>
      </section>}
      <small>Reduced-scale preview map · read-only. Buying, founding cities and war are not available yet.</small>
    </>}
  </section>;
}
