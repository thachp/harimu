'use client';
import { worldAtlasCard, worldAtlasEnabled, worldAtlasStats, worldExploreEnabled, type WorldAtlasClock, type WorldAtlasDisputes, type WorldAtlasNation } from '@/lib/world-atlas';
import { worldAtlasExploreKicker, worldAtlasIdentityEnabled, worldAtlasIdentityTagline, WORLD_ATLAS_IDENTITY_KICKER, WORLD_ATLAS_IDENTITY_TITLE } from '@/lib/world-atlas-identity';
import { ExplorePrimaryButton } from './explore-primary';
import { NationCrest } from './nation-crest';
import './world-atlas.css';

/** #392 / #1193: world-view side panel header and stat rows. Flag off renders nothing, so the panel stays as it is.
 *  NEXT_PUBLIC_HARIMU_WORLD_EXPLORE: crest, motto (only when the nation has one) and Explore {shortName}. Off: this block is unchanged.
 *  #392 UI 46: NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY restyles this atlas. The heading becomes the large title with the atlas name as the kicker.
 *  A shown motto is the gold italic line. "Explore the world" sits above the existing Explore button. Atlas off still renders nothing. */
export function WorldAtlas({ nations, nation = null, clock = null, disputes = null, onView, enabled = worldAtlasEnabled(), explore = worldExploreEnabled(), identity = worldAtlasIdentityEnabled() }: {
  nations: readonly unknown[];
  nation?: WorldAtlasNation | null;
  clock?: WorldAtlasClock;
  disputes?: WorldAtlasDisputes;
  onView?: (view: 'country') => void;
  enabled?: boolean;
  explore?: boolean;
  identity?: boolean;
}) {
  if (!enabled) return null;
  const stats = worldAtlasStats({ nations, nation, clock, disputes });
  const card = explore ? worldAtlasCard(nation) : null;
  const tagline = identity ? worldAtlasIdentityTagline(nations) : null;
  const exploreButton = card?.explore && onView
    ? <ExplorePrimaryButton label={card.explore.label} ariaLabel={card.explore.ariaLabel} onClick={() => onView('country')} />
    : null;
  const exploreKicker = identity ? worldAtlasExploreKicker(Boolean(exploreButton)) : null;
  return <section className={identity ? 'world-atlas world-atlas-identity' : 'world-atlas'} aria-label="World atlas">
    {identity
      ? <div className="world-atlas-identity-head"><h2>{WORLD_ATLAS_IDENTITY_TITLE}</h2><p className="world-atlas-identity-kicker">{WORLD_ATLAS_IDENTITY_KICKER}</p>{tagline && <p className="world-atlas-identity-tagline">{tagline}</p>}</div>
      : <h2>World atlas</h2>}
    {card && (card.id || card.name || card.motto) && <div className="world-atlas-nation">
      {card.id && <NationCrest id={card.id} size={56} force labelled />}
      {(card.name || card.motto) && <div>
        {card.name && <p className="world-atlas-name">{card.name}</p>}
        {card.motto && <p className="world-atlas-motto">{card.motto}</p>}
      </div>}
    </div>}
    {stats.length > 0 && <dl className="world-atlas-stats">{stats.map(stat => <div key={stat.label}><dt>{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>}
    {exploreButton && (exploreKicker ? <div className="world-atlas-identity-action"><p className="world-atlas-explore-kicker">{exploreKicker}</p>{exploreButton}</div> : exploreButton)}
  </section>;
}
