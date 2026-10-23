'use client';
// #82: the Overlays toggle group next to the zoom cluster. Slice 2 draws Ownership; Resources and Unrest are still placeholders.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { nationMark } from '../lib/nation-themes';
import type { OwnershipMap } from '../lib/map-ownership';
import { bandMark, NO_DATA, unpublishedLabel, type UnrestMap } from '../lib/map-unrest';
import { resourceIcon, resourceName, type ResourceMap } from '../lib/map-resources';
import type { ArmyPosition } from '../lib/army-map';
import { WORLD_GRID } from '../lib/globe-mapping';
import { ARMY_OVERLAY, MAP_OVERLAYS, UNAVAILABLE_OVERLAYS, UNREST_SCALE, LEGEND_TEXT, toggleOverlay, overlayLabel, phonePopoverPlacement, readSessionOverlays, writeSessionOverlays, type OverlayId } from '../lib/map-overlays';

/** Renders nothing unless the server sent flags.mapOverlays === true. */
/** mapLayer: the view draws world squares (the globe); false in the city view, where the Ownership layer is hidden. */
export function MapOverlaysControl({ enabled, armies = false, lowGraphics = false, mapLayer = true }: { enabled: boolean; armies?: boolean; lowGraphics?: boolean; mapLayer?: boolean }) {
  return enabled ? <MapOverlays lowGraphics={lowGraphics} mapLayer={mapLayer} armies={armies} /> : null;
}
const session = () => { try { return window.sessionStorage; } catch { return undefined; } };

/** #800: rareMarker (NEXT_PUBLIC_HARIMU_RARE_MARKER) draws rare resource nodes as a filled, gold-rimmed badge (shape and fill, not color alone), the same badge in the legend. */
export function MapOverlays({ lowGraphics = false, mapLayer = true, armies = false, rareMarker = process.env.NEXT_PUBLIC_HARIMU_RARE_MARKER === 'true' }: { lowGraphics?: boolean; mapLayer?: boolean; armies?: boolean; rareMarker?: boolean }) {
  const [active, setActive] = useState<OverlayId[]>(() => readSessionOverlays(session()).filter(id => armies || id !== 'armies')); // ARC: remembered for the browser session, off in a new one; #738 slice 4: a remembered Army toggle is dropped while the flag is off
  const [units, setUnits] = useState<ArmyPosition[] | null>(null);
  const [ownership, setOwnership] = useState<OwnershipMap | null>(null);
  const [unrest, setUnrest] = useState<UnrestMap | null>(null);
  const [resources, setResources] = useState<ResourceMap | null>(null);
  const [open, setOpen] = useState(false); // the phone popover (390px and below)
  const [placement, setPlacement] = useState<CSSProperties>({});
  const [announcement, setAnnouncement] = useState('');
  const rootRef = useRef<HTMLDivElement>(null), triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const toggle = (id: OverlayId) => {
    const next = toggleOverlay(active, id);
    setActive(next); writeSessionOverlays(session(), next);
    setAnnouncement(next.length ? `Overlays on: ${next.map(overlayLabel).join(', ')}` : 'All overlays off');
  };
  // UX: the phone popover never overlaps the top-left "World" chip. Right-anchored beside it when it fits, else a bottom sheet below it.
  useLayoutEffect(() => {
    const root = rootRef.current, bar = root?.closest('.viewport-controls');
    if (!open || !root || !bar || getComputedStyle(triggerRef.current!).display === 'none') { setPlacement({}); return; }
    const chip = (root.closest('.harimu-game') ?? document).querySelector('.game-breadcrumbs')?.getBoundingClientRect();
    setPlacement(phonePopoverPlacement({ width: document.documentElement.clientWidth, height: window.innerHeight }, bar.getBoundingClientRect(), chip ? { right: chip.right, bottom: chip.bottom } : null));
  }, [open, active.length]);
  const ownershipOn = active.includes('ownership');
  useEffect(() => { // the only ownership read: while the overlay is on, once per mount; nothing is fetched while it is off (or the flag is off)
    if (!ownershipOn || ownership) return;
    let live = true;
    fetch('/api/world/ownership').then(r => (r.ok ? r.json() : null) as Promise<OwnershipMap | null>).then(data => { if (live && data?.cells) setOwnership(data); }).catch(() => {});
    return () => { live = false; };
  }, [ownershipOn, ownership]);
  const unrestOn = active.includes('unrest');
  useEffect(() => { // #82 slice 4: same rule for Unrest bands: read only while Unrest is on, once per mount
    if (!unrestOn || unrest) return;
    let live = true;
    fetch('/api/world/unrest').then(r => (r.ok ? r.json() : null) as Promise<UnrestMap | null>).then(data => { if (live && data?.cells) setUnrest(data); }).catch(() => {});
    return () => { live = false; };
  }, [unrestOn, unrest]);
  const resourcesOn = active.includes('resources');
  useEffect(() => { // #82 slice 3: same rule for resource nodes: read only while Resources is on, once per mount
    if (!resourcesOn || resources) return;
    let live = true;
    fetch('/api/world/resources').then(r => (r.ok ? r.json() : null) as Promise<ResourceMap | null>).then(data => { if (live && data?.cells) setResources(data); }).catch(() => {});
    return () => { live = false; };
  }, [resourcesOn, resources]);
  const armiesOn = armies && active.includes('armies');
  useEffect(() => { // #738 slice 4: same rule: read only while Army positions is on, once per mount; never while the flag is off
    if (!armiesOn || units) return;
    let live = true;
    fetch('/api/army/positions').then(r => (r.ok ? r.json() : null) as Promise<{ units?: ArmyPosition[] } | null>).then(data => { if (live && data?.units) setUnits(data.units); }).catch(() => {});
    return () => { live = false; };
  }, [armiesOn, units]);
  const [viewport, setViewport] = useState<Element | null>(null); // the layer's portal target, found after mount
  useEffect(() => { setViewport(rootRef.current?.closest('.game-viewport') ?? null); }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) close(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return <div ref={rootRef} className="map-overlays" data-open={open ? 'true' : 'false'} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); close(); } }}>
    <button ref={triggerRef} type="button" className="map-overlays-trigger" aria-expanded={open} aria-controls="map-overlays-panel" onClick={() => setOpen(value => !value)}>Overlays</button>
    <div id="map-overlays-panel" className="map-overlays-panel" data-sheet={placement.position === 'fixed' ? 'true' : undefined} style={placement}>
      {active.length > 0 && <div className="map-overlays-legend" role="region" tabIndex={0} aria-label="Overlay legend">
        {active.map(id => <section key={id}>
          <strong>{overlayLabel(id)}</strong>
          {id === 'unrest' ? <ol className="map-overlays-scale">{UNREST_SCALE.map(step => <li key={step}><span aria-hidden="true">{bandMark(step).symbol}</span> {step}</li>)}</ol> : null}
          {id === 'armies' && units ? <ul className="map-ownership-key">{units.map(u => <li key={u.unitId}><span aria-hidden="true">{ARMY_MARK}</span> {armyLegendLine(u)}{u.supply?.cut ? ` · supply line cut, strength down ${u.supply.strengthLossPct}%` : ''}</li>)}</ul> : null}
          {id === 'unrest' && unrest ? <ul className="map-ownership-key">{unrest.nations.map(({ nationId, unrest: score, band }) => <li key={nationId}><span aria-hidden="true">{bandMark(band).symbol}</span> {nationMark(nationId)?.name ?? nationId}: {band} ({score})</li>)}
            {unrest.unpublished.map(id => <li key={id}>{unpublishedLabel(nationMark(id)?.name ?? id)}</li>)}<li>{NO_DATA}</li></ul> : null}
          {id === 'resources' && resources ? <ul className="map-ownership-key">{resources.totals.map(({ resource, squares }) => <li key={resource}><span aria-hidden="true" className={rareMarker && resourceIcon(resource).rare ? 'map-rare-key' : undefined}>{resourceIcon(resource).symbol}</span> {resourceName(resource)}{resourceIcon(resource).rare ? ' (rare)' : ''}: {squares} {squares === 1 ? 'square' : 'squares'}</li>)}</ul>
            : id === 'ownership' && ownership ? <ul className="map-ownership-key">{ownership.totals.map(({ nationId, squares }) => { const mark = nationMark(nationId); return <li key={nationId}><span aria-hidden="true" style={{ color: mark?.accent }}>{mark?.symbol ?? '■'}</span> {mark?.name ?? nationId}: {squares} {squares === 1 ? 'square' : 'squares'}</li>; })}</ul>
            : id === 'armies' && units ? null : <span>{id === 'armies' ? 'Loading army positions.' : id === 'ownership' ? 'Loading owners.' : id === 'resources' ? 'Loading resources.' : id === 'unrest' && !unrest ? 'Loading unrest.' : LEGEND_TEXT[id]}</span>}
        </section>)}
      </div>}
      <div role="group" aria-label="Overlays" className="map-overlays-group">
        <span className="map-overlays-title" aria-hidden="true">Overlays</span>
        {[...MAP_OVERLAYS, ...(armies ? [ARMY_OVERLAY] : [])].map(({ id, label }) => <button key={id} type="button" aria-pressed={active.includes(id)} onClick={() => toggle(id)}>{label}</button>)}
        {UNAVAILABLE_OVERLAYS.filter(o => !armies || o.id !== 'armies').map(({ id, label, reason }) => <span key={id} className="map-overlays-unavailable">
          <button type="button" aria-disabled="true" aria-describedby={`map-overlay-${id}-reason`} onClick={event => event.preventDefault()}>{label}</button>
          <span role="tooltip" id={`map-overlay-${id}-reason`}>{reason}</span>
        </span>)}
      </div>
    </div>
    <span className="map-overlays-status" aria-live="polite">{announcement}</span>
    {ownershipOn && mapLayer && ownership && viewport ? createPortal(<OwnershipLayer map={ownership} lowGraphics={lowGraphics} />, viewport) : null}
    {resourcesOn && mapLayer && resources && viewport ? createPortal(<ResourcesLayer map={resources} lowGraphics={lowGraphics} rareMarker={rareMarker} />, viewport) : null}
    {armiesOn && mapLayer && units && viewport ? createPortal(<ArmiesLayer units={units} />, viewport) : null}
    {unrestOn && mapLayer && unrest && viewport ? createPortal(<UnrestLayer map={unrest} lowGraphics={lowGraphics} />, viewport) : null}
  </div>;
}

/** Owned squares, each its nation's symbol (not color alone), tinted unless graphics are low. GameViewport places every cell on its globe square each frame
 *  (projectOwnershipCells); until then they stay hidden. Decorative; the legend carries the text. */
function OwnershipLayer({ map, lowGraphics }: { map: OwnershipMap; lowGraphics: boolean }) {
  return <div className="map-ownership" data-low-graphics={lowGraphics ? 'true' : undefined} data-width={map.width} data-height={map.height} aria-hidden="true">
    {map.cells.map(([x, y, nationId]) => { const mark = nationMark(nationId); return <span key={`${x},${y}`} hidden data-nation={nationId} data-x={x} data-y={y} style={{ color: mark?.accent, ...(lowGraphics ? {} : { backgroundColor: `${mark?.accent ?? '#888888'}55` }) }}>{mark?.symbol ?? '■'}</span>; })}
  </div>;
}

/** #82 slice 3: resource node icons on their globe squares (GameViewport places them, like Ownership). Static: no animation or transition, so reduced motion needs nothing. */
function ResourcesLayer({ map, lowGraphics, rareMarker }: { map: ResourceMap; lowGraphics: boolean; rareMarker: boolean }) {
  return <div className="map-resources" data-low-graphics={lowGraphics ? 'true' : undefined} data-rare-marker={rareMarker ? 'true' : undefined} data-width={map.width} data-height={map.height} aria-hidden="true">
    {map.cells.map(([x, y, resource]) => { const icon = resourceIcon(resource); return <span key={`${x},${y}`} hidden data-resource={resource} data-rare={icon.rare ? 'true' : undefined} data-x={x} data-y={y}>{icon.symbol}</span>; })}
  </div>;
}

/** #82 slice 4: each scored nation's squares in its Unrest band: a band symbol (not color alone) on the band's heat tint; low graphics: symbols only, no tint.
 *  GameViewport places them on the globe squares, like Ownership (the two are exclusive). Decorative; the legend carries the text. */
function UnrestLayer({ map, lowGraphics }: { map: UnrestMap; lowGraphics: boolean }) {
  return <div className="map-ownership map-unrest" data-low-graphics={lowGraphics ? 'true' : undefined} data-width={map.width} data-height={map.height} aria-hidden="true">
    {map.cells.map(([x, y, band]) => { const mark = bandMark(band); return <span key={`${x},${y}`} hidden data-band={band} data-x={x} data-y={y} style={{ color: '#f3ecd6', ...(lowGraphics ? {} : { backgroundColor: `${mark.color}cc` }) }}>{mark.symbol}</span>; })}
  </div>;
}

/** #738 slice 4 (placeholder copy, marked for Content): one marker per unit (a symbol, not color alone); the legend carries the text. GameViewport places them like Ownership. */
const ARMY_MARK = '⚑';
const armyLegendLine = (u: ArmyPosition) => `${u.name}: ${u.status === 'home' ? 'at home' : u.status === 'marching' ? `marching toward ${nationMark(u.towardNationId ?? '')?.name ?? u.towardNationId}` : `staged near ${nationMark(u.towardNationId ?? '')?.name ?? u.towardNationId}`}`;
function ArmiesLayer({ units }: { units: readonly ArmyPosition[] }) {
  return <div className="map-resources map-armies" data-width={WORLD_GRID.width} data-height={WORLD_GRID.height} aria-hidden="true">
    {units.map(u => <span key={u.unitId} hidden data-nation={u.nationId} data-status={u.status} data-x={u.x} data-y={u.y} style={{ color: nationMark(u.nationId)?.accent }}>{ARMY_MARK}</span>)}
  </div>;
}
