'use client';
import { Bank, Clock, Coins, Compass, Confetti, Crown, Globe, Grains, Scales, ShieldCheck, Users } from '@phosphor-icons/react';
import { worldAtlasCard, worldAtlasEnabled, worldAtlasStats, worldExploreEnabled, type WorldAtlasClock, type WorldAtlasDisputes, type WorldAtlasNation } from '@/lib/world-atlas';
import { worldAtlasExploreIconsEnabled } from '@/lib/world-atlas-explore-icons';
import { worldAtlasExploreKicker, worldAtlasIdentityEnabled, worldAtlasIdentityTagline, WORLD_ATLAS_IDENTITY_KICKER, WORLD_ATLAS_IDENTITY_TITLE } from '@/lib/world-atlas-identity';
import { worldAtlasIconScaleEnabled } from '@/lib/world-atlas-icon-scale';
import { worldAtlasIconsEnabled, worldAtlasStatIcon, type WorldAtlasIconKey } from '@/lib/world-atlas-icons';
import { iconSizeSyncEnabled } from '@/lib/icon-size-sync';
import { ExplorePrimaryButton } from './explore-primary';
import { NationCrest } from './nation-crest';
import './world-atlas.css';

const factIcons: Record<WorldAtlasIconKey, typeof Crown> = { Globe, Clock, Scales, Users, Bank, Crown, Grains, Coins, Confetti, ShieldCheck };

export function WorldAtlasFactIcon({ label, iconSizeSync = iconSizeSyncEnabled() }: { label: string; iconSizeSync?: boolean }) {
  const mark = worldAtlasStatIcon(label);
  const Icon = mark ? factIcons[mark] : null;
  return Icon ? <Icon size={iconSizeSync ? '1em' : 18} aria-hidden="true" /> : null;
}

/** #392 / #1193: world-view side panel header and stat rows. Flag off renders nothing, so the panel stays as it is.
 *  NEXT_PUBLIC_HARIMU_WORLD_EXPLORE: crest, motto (only when the nation has one) and Explore {shortName}. Off: this block is unchanged.
 *  #392 UI 46: NEXT_PUBLIC_HARIMU_WORLD_ATLAS_IDENTITY restyles this atlas. The heading becomes the large title with the atlas name as the kicker.
 *  A shown motto is the gold italic line. "Explore the world" sits above the existing Explore button. Atlas off still renders nothing.
 *  #392 UI 50: NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICONS paints a decorative gold mark before a known fact label. An unmapped label is unchanged.
 *  #392 UI 51: NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE sizes those marks with the text scale. The class is added only while the fact-icon flag is also on.
 *  #392 UI 52: NEXT_PUBLIC_HARIMU_WORLD_ATLAS_EXPLORE_ICONS adds a compass before the explore kicker and a bank mark plus chevron on the Explore button. Both appear only on a control that already renders.
 *  #392 UI 56: NEXT_PUBLIC_HARIMU_ICON_SIZE_SYNC gives those marks size 1em. Font-size carries the text scale. Flag off keeps size 18. */
export function WorldAtlas({ nations, nation = null, clock = null, disputes = null, onView, enabled = worldAtlasEnabled(), explore = worldExploreEnabled(), identity = worldAtlasIdentityEnabled(), icons = worldAtlasIconsEnabled(), iconScale = worldAtlasIconScaleEnabled(), exploreIcons = worldAtlasExploreIconsEnabled(), iconSizeSync = iconSizeSyncEnabled() }: {
  nations: readonly unknown[];
  nation?: WorldAtlasNation | null;
  clock?: WorldAtlasClock;
  disputes?: WorldAtlasDisputes;
  onView?: (view: 'country') => void;
  enabled?: boolean;
  explore?: boolean;
  identity?: boolean;
  icons?: boolean;
  iconScale?: boolean;
  exploreIcons?: boolean;
  iconSizeSync?: boolean;
}) {
  if (!enabled) return null;
  const stats = worldAtlasStats({ nations, nation, clock, disputes });
  const card = explore ? worldAtlasCard(nation) : null;
  const tagline = identity ? worldAtlasIdentityTagline(nations) : null;
  const markSize = iconSizeSync ? '1em' as const : 18;
  const exploreButton = card?.explore && onView
    ? <ExplorePrimaryButton label={card.explore.label} ariaLabel={card.explore.ariaLabel} onClick={() => onView('country')} {...(exploreIcons ? { chevron: true, leadingIcon: <Bank size={markSize} aria-hidden="true" />, ...(iconSizeSync ? { iconSize: '1em' as const } : {}) } : {})} />
    : null;
  const exploreKicker = identity ? worldAtlasExploreKicker(Boolean(exploreButton)) : null;
  const atlasClass = identity ? 'world-atlas world-atlas-identity' : 'world-atlas';
  const atlasMarked = icons ? `${atlasClass} world-atlas-icons${iconScale ? ' world-atlas-icon-scale' : ''}` : atlasClass;
  const atlasExplored = exploreIcons && exploreButton ? `${atlasMarked} world-atlas-explore-icons` : atlasMarked;
  const atlasShown = iconSizeSync && (icons || Boolean(exploreIcons && exploreButton)) ? `${atlasExplored} world-atlas-icon-size-sync` : atlasExplored;
  const exploreKickerNode = exploreKicker
    ? <p className="world-atlas-explore-kicker">{exploreIcons ? <Compass size={markSize} aria-hidden="true" /> : null}{exploreKicker}</p>
    : null;
  return <section className={atlasShown} aria-label="World atlas">
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
    {stats.length > 0 && <dl className="world-atlas-stats">{stats.map(stat => <div key={stat.label}><dt>{icons ? <WorldAtlasFactIcon label={stat.label} iconSizeSync={iconSizeSync} /> : null}{stat.label}</dt><dd>{stat.value}</dd></div>)}</dl>}
    {exploreButton && (exploreKickerNode ? <div className="world-atlas-identity-action">{exploreKickerNode}{exploreButton}</div> : exploreButton)}
  </section>;
}
