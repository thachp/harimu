/** #82 slice 1: the map overlay toggles. Pure rules for the toggle UI only; nothing is drawn on the map yet.
 *  HARIMU_MAP_OVERLAYS_ENABLED ("true" preview, "false" prod) reaches the client as GET /api/citizen flags.mapOverlays. */
export type OverlayId = 'ownership' | 'resources' | 'unrest';
export const MAP_OVERLAYS: readonly { id: OverlayId; label: string }[] = [
  { id: 'ownership', label: 'Ownership' },
  { id: 'resources', label: 'Resources' },
  { id: 'unrest', label: 'Unrest' },
];
/** Listed but not available yet: aria-disabled, still focusable, with the reason as a tooltip. */
export const UNAVAILABLE_OVERLAYS: readonly { id: string; label: string; reason: string }[] = [
  { id: 'armies', label: 'Army positions', reason: 'Not available yet. Army positions are not on the map.' },
  { id: 'fog', label: 'Fog', reason: 'Not available yet. Fog of war is not built.' },
];
/** Ownership and Unrest both tint squares, so turning one on turns the other off. Resources combines with either. */
const EXCLUDES: Record<OverlayId, OverlayId | null> = { ownership: 'unrest', unrest: 'ownership', resources: null };
export const UNREST_SCALE = ['Calm', 'Tense', 'Riot'] as const;
export const LEGEND_TEXT: Record<OverlayId, string> = {
  ownership: 'Nation colors and patterns. Not drawn yet.',
  resources: 'Resource icons. Not drawn yet.',
  unrest: 'Not drawn yet.',
};

/** The active overlays after pressing `id`, in the fixed button order. */
export function toggleOverlay(active: readonly OverlayId[], id: OverlayId): OverlayId[] {
  if (active.includes(id)) return active.filter(other => other !== id);
  const excluded = EXCLUDES[id];
  return MAP_OVERLAYS.map(o => o.id).filter(other => other === id || (active.includes(other) && other !== excluded));
}

export function overlayLabel(id: OverlayId): string { return MAP_OVERLAYS.find(o => o.id === id)?.label ?? id; }
