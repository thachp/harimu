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
  ownership: 'Nation symbols and colors.',
  resources: 'Resource node icons.',
  unrest: 'Not drawn yet.',
};

/** The active overlays after pressing `id`, in the fixed button order. */
export function toggleOverlay(active: readonly OverlayId[], id: OverlayId): OverlayId[] {
  if (active.includes(id)) return active.filter(other => other !== id);
  const excluded = EXCLUDES[id];
  return MAP_OVERLAYS.map(o => o.id).filter(other => other === id || (active.includes(other) && other !== excluded));
}

export function overlayLabel(id: OverlayId): string { return MAP_OVERLAYS.find(o => o.id === id)?.label ?? id; }

export const POPOVER_GAP = 8, POPOVER_MIN_WIDTH = 260;
type Box = { right: number };
/** Phone popover placement. Beside the chip, right-anchored to the camera bar, when at least POPOVER_MIN_WIDTH fits right of it;
 *  otherwise a bottom sheet fixed to the bottom of the screen whose top stays below the chip. Either way it never overlaps the chip. */
export function phonePopoverPlacement(viewport: { width: number; height: number }, bar: Box, chip: { right: number; bottom: number } | null) {
  const besideWidth = viewport.width - (chip ? chip.right : 0) - 2 * POPOVER_GAP;
  if (!chip || besideWidth >= POPOVER_MIN_WIDTH) return { right: Math.max(0, bar.right - viewport.width) + POPOVER_GAP, maxWidth: besideWidth };
  return { position: 'fixed' as const, left: POPOVER_GAP, right: POPOVER_GAP, bottom: POPOVER_GAP, maxWidth: 'none', maxHeight: Math.max(0, viewport.height - Math.max(0, chip.bottom) - 2 * POPOVER_GAP) };
}

/** ARC: the toggles are remembered for the browser session (sessionStorage), never across sessions. */
export const OVERLAYS_SESSION_KEY = 'harimu.mapOverlays';
export function readSessionOverlays(storage: Pick<Storage, 'getItem'> | undefined): OverlayId[] {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(OVERLAYS_SESSION_KEY) ?? '[]');
    if (!Array.isArray(saved)) return [];
    const known = new Set<string>(MAP_OVERLAYS.map(o => o.id));
    return saved.filter((id): id is OverlayId => typeof id === 'string' && known.has(id)).reduce<OverlayId[]>((on, id) => on.includes(id) ? on : toggleOverlay(on, id), []); // replays the presses, so a tampered value keeps the Ownership/Unrest rule
  } catch { return []; }
}
export function writeSessionOverlays(storage: Pick<Storage, 'setItem'> | undefined, active: readonly OverlayId[]) {
  try { storage?.setItem(OVERLAYS_SESSION_KEY, JSON.stringify(active)); } catch { /* storage full or blocked: the toggles still work for this view */ }
}
