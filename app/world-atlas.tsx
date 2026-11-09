'use client';
import { worldAtlasEnabled, worldAtlasStats, type WorldAtlasClock, type WorldAtlasDisputes, type WorldAtlasNation } from '@/lib/world-atlas';
import './world-atlas.css';

/** #392 / #1193: world-view side panel header and stat rows. Flag off renders nothing, so the panel stays as it is. */
export function WorldAtlas({ nations, nation = null, clock = null, disputes = null, enabled = worldAtlasEnabled() }: {
  nations: readonly unknown[];
  nation?: WorldAtlasNation | null;
  clock?: WorldAtlasClock;
  disputes?: WorldAtlasDisputes;
  enabled?: boolean;
}) {
  if (!enabled) return null;
  const stats = worldAtlasStats({ nations, nation, clock, disputes });
  return <section className="world-atlas" aria-label="World atlas">
    <h2>World atlas</h2>
    {stats.length > 0 && <dl className="world-atlas-stats">{stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>}
  </section>;
}
