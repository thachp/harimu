'use client';
import { worldAtlasCard, worldAtlasEnabled, worldAtlasStats, worldExploreEnabled, type WorldAtlasClock, type WorldAtlasDisputes, type WorldAtlasNation } from '@/lib/world-atlas';
import { ExplorePrimaryButton } from './explore-primary';
import { NationCrest } from './nation-crest';
import './world-atlas.css';

/** #392 / #1193: world-view side panel header and stat rows. Flag off renders nothing, so the panel stays as it is.
 *  NEXT_PUBLIC_HARIMU_WORLD_EXPLORE: crest, motto (only when the nation has one) and Explore {shortName}. Off: this block is unchanged. */
export function WorldAtlas({ nations, nation = null, clock = null, disputes = null, onView, enabled = worldAtlasEnabled(), explore = worldExploreEnabled() }: {
  nations: readonly unknown[];
  nation?: WorldAtlasNation | null;
  clock?: WorldAtlasClock;
  disputes?: WorldAtlasDisputes;
  onView?: (view: 'country') => void;
  enabled?: boolean;
  explore?: boolean;
}) {
  if (!enabled) return null;
  const stats = worldAtlasStats({ nations, nation, clock, disputes });
  const card = explore ? worldAtlasCard(nation) : null;
  return <section className="world-atlas" aria-label="World atlas">
    <h2>World atlas</h2>
    {card && (card.id || card.name || card.motto) && <div className="world-atlas-nation">
      {card.id && <NationCrest id={card.id} size={56} force labelled />}
      {(card.name || card.motto) && <div>
        {card.name && <p className="world-atlas-name">{card.name}</p>}
        {card.motto && <p className="world-atlas-motto">{card.motto}</p>}
      </div>}
    </div>}
    {stats.length > 0 && <dl className="world-atlas-stats">{stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>}
    {card?.explore && onView && <ExplorePrimaryButton label={card.explore.label} ariaLabel={card.explore.ariaLabel} onClick={() => onView('country')} />}
  </section>;
}
