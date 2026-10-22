'use client';
// #82 slice 1: the Overlays toggle group next to the zoom cluster. Rendering on the map is a no-op in this slice.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { MAP_OVERLAYS, UNAVAILABLE_OVERLAYS, UNREST_SCALE, LEGEND_TEXT, toggleOverlay, overlayLabel, phonePopoverPlacement, type OverlayId } from '../lib/map-overlays';

/** Renders nothing unless the server sent flags.mapOverlays === true. */
export function MapOverlaysControl({ enabled }: { enabled: boolean }) {
  return enabled ? <MapOverlays /> : null;
}

export function MapOverlays() {
  const [active, setActive] = useState<OverlayId[]>([]); // all off at start; not persisted (UX)
  const [open, setOpen] = useState(false); // the phone popover (390px and below)
  const [placement, setPlacement] = useState<CSSProperties>({});
  const [announcement, setAnnouncement] = useState('');
  const rootRef = useRef<HTMLDivElement>(null), triggerRef = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const toggle = (id: OverlayId) => {
    const next = toggleOverlay(active, id);
    setActive(next);
    setAnnouncement(next.length ? `Overlays on: ${next.map(overlayLabel).join(', ')}` : 'All overlays off');
  };
  // UX: the phone popover never overlaps the top-left "World" chip. Right-anchored beside it when it fits, else a bottom sheet below it.
  useLayoutEffect(() => {
    const root = rootRef.current, bar = root?.closest('.viewport-controls');
    if (!open || !root || !bar || getComputedStyle(triggerRef.current!).display === 'none') { setPlacement({}); return; }
    const chip = (root.closest('.harimu-game') ?? document).querySelector('.game-breadcrumbs')?.getBoundingClientRect();
    setPlacement(phonePopoverPlacement({ width: document.documentElement.clientWidth, height: window.innerHeight }, bar.getBoundingClientRect(), chip ? { right: chip.right, bottom: chip.bottom } : null));
  }, [open, active.length]);
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
          {id === 'unrest' ? <ol className="map-overlays-scale">{UNREST_SCALE.map(step => <li key={step}>{step}</li>)}</ol> : null}
          <span>{LEGEND_TEXT[id]}</span>
        </section>)}
      </div>}
      <div role="group" aria-label="Overlays" className="map-overlays-group">
        <span className="map-overlays-title" aria-hidden="true">Overlays</span>
        {MAP_OVERLAYS.map(({ id, label }) => <button key={id} type="button" aria-pressed={active.includes(id)} onClick={() => toggle(id)}>{label}</button>)}
        {UNAVAILABLE_OVERLAYS.map(({ id, label, reason }) => <span key={id} className="map-overlays-unavailable">
          <button type="button" aria-disabled="true" aria-describedby={`map-overlay-${id}-reason`} onClick={event => event.preventDefault()}>{label}</button>
          <span role="tooltip" id={`map-overlay-${id}-reason`}>{reason}</span>
        </span>)}
      </div>
    </div>
    <span className="map-overlays-status" aria-live="polite">{announcement}</span>
  </div>;
}
