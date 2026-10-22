'use client';
// #82 slice 1: the Overlays toggle group next to the zoom cluster. Rendering on the map is a no-op in this slice.
import { useState } from 'react';
import { MAP_OVERLAYS, UNAVAILABLE_OVERLAYS, UNREST_SCALE, LEGEND_TEXT, toggleOverlay, overlayLabel, type OverlayId } from '../lib/map-overlays';

/** Renders nothing unless the server sent flags.mapOverlays === true. */
export function MapOverlaysControl({ enabled }: { enabled: boolean }) {
  return enabled ? <MapOverlays /> : null;
}

export function MapOverlays() {
  const [active, setActive] = useState<OverlayId[]>([]); // all off at start; not persisted (UX)
  const [open, setOpen] = useState(false); // the phone popover (390px and below)
  const [announcement, setAnnouncement] = useState('');
  const toggle = (id: OverlayId) => {
    const next = toggleOverlay(active, id);
    setActive(next);
    setAnnouncement(next.length ? `Overlays on: ${next.map(overlayLabel).join(', ')}` : 'All overlays off');
  };
  return <div className="map-overlays" data-open={open ? 'true' : 'false'} onKeyDown={event => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); } }}>
    <button type="button" className="map-overlays-trigger" aria-expanded={open} aria-controls="map-overlays-panel" onClick={() => setOpen(value => !value)}>Overlays</button>
    <div id="map-overlays-panel" className="map-overlays-panel">
      {active.length > 0 && <div className="map-overlays-legend" aria-label="Overlay legend">
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
