/** #392: a soft gold border around the selected nation on the world globe (?view=world).
 *  NEXT_PUBLIC_HARIMU_SELECTED_NATION_GLOW is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. Only the exact string "true" enables it.
 *
 *  The ring sits on the same coast the procedural land uses (dot 0.91 in createRegionWorld),
 *  so it traces that nation's land and stays clear of the other capitals.
 *  Gold is the existing tokens: --gold #d3aa5b (app/globals.css), atlas gold #f1d58a, crest edge #d0ad54.
 *  The ring does not animate, so it never starts a render loop. Reduced motion hides the soft halo
 *  and keeps the crisp edge; the label's double border stays in either case. */
export const SELECTED_NATION_GLOW_FLAG = 'NEXT_PUBLIC_HARIMU_SELECTED_NATION_GLOW';
/** --gold in app/globals.css. */
export const GLOW_GOLD = '#d3aa5b';
/** World atlas and nation overview gold. */
export const GLOW_HALO = '#f1d58a';
/** crestEdge in lib/nation-crests.ts. The label's reduced-motion ring uses it. */
export const GLOW_EDGE = '#d0ad54';
/** Same coast dot createRegionWorld uses (`proximity - .91`). */
export const NATION_COAST_DOT = 0.91;

export function selectedNationGlowFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_SELECTED_NATION_GLOW; }
  catch { return undefined; }
}
export function selectedNationGlowEnabled(value: string | undefined = selectedNationGlowFlag()): boolean {
  return value === 'true';
}

export type NationGlowPose = {
  center: readonly [number, number, number];
  /** Unit axis from the globe centre through the nation marker. TorusGeometry's +Z maps onto this. */
  axis: readonly [number, number, number];
  ringRadius: number;
  edgeTube: number;
  haloTube: number;
  /** Distance from the globe centre to the ring, just clear of the surface. */
  lift: number;
  haloOpacity: number;
};

/** Ring pose for a nation marker position. Null when the position has no direction. */
export function nationGlowPose(position: { x: number; y: number; z: number }, globeRadius = 7, coastDot = NATION_COAST_DOT): NationGlowPose | null {
  const len = Math.hypot(position.x, position.y, position.z);
  if (!(len > 0) || !Number.isFinite(len)) return null;
  const axis = [position.x / len, position.y / len, position.z / len] as const;
  const dot = Math.min(1, Math.max(-1, coastDot));
  const theta = Math.acos(dot);
  const lift = globeRadius + 0.08;
  return {
    axis,
    center: [axis[0] * lift * Math.cos(theta), axis[1] * lift * Math.cos(theta), axis[2] * lift * Math.cos(theta)],
    ringRadius: lift * Math.sin(theta),
    edgeTube: 0.08,
    haloTube: 0.32,
    lift,
    haloOpacity: 0.32,
  };
}

/** One point on the ring, `angle` radians around the axis. Distance from the origin is `lift`. */
export function nationGlowPoint(pose: NationGlowPose, angle: number): readonly [number, number, number] {
  const [ax, ay, az] = pose.axis;
  const hint: readonly [number, number, number] = Math.abs(ax) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let rx = ay * hint[2] - az * hint[1], ry = az * hint[0] - ax * hint[2], rz = ax * hint[1] - ay * hint[0];
  const rl = Math.hypot(rx, ry, rz) || 1;
  rx /= rl; ry /= rl; rz /= rl;
  const ux = ay * rz - az * ry, uy = az * rx - ax * rz, uz = ax * ry - ay * rx;
  const c = Math.cos(angle), s = Math.sin(angle);
  return [
    pose.center[0] + pose.ringRadius * (rx * c + ux * s),
    pose.center[1] + pose.ringRadius * (ry * c + uy * s),
    pose.center[2] + pose.ringRadius * (rz * c + uz * s),
  ];
}

/** Reduced motion keeps the crisp edge and drops the soft halo. Nothing animates in either case. */
export function glowShowsHalo(reducedMotion: boolean): boolean {
  return reducedMotion !== true;
}
