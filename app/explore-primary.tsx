'use client';
import type { ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';

/** #392 UI 38 gold Explore button. World atlas and the Nation overview action row share this class (world-atlas.css).
 *  #392 UI 52: optional leading icon. When it is omitted, the button is the label and, when asked, the trailing chevron.
 *  #392 UI 56: iconSize stays 18 unless the caller passes 1em. */
export function ExplorePrimaryButton({ label, ariaLabel, onClick, chevron = false, leadingIcon = null, iconSize = 18 }: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  chevron?: boolean;
  leadingIcon?: ReactNode;
  iconSize?: number | '1em';
}) {
  const text = leadingIcon ? <span className="world-atlas-primary-label">{label}</span> : label;
  return <button type="button" className="world-atlas-primary" aria-label={ariaLabel} onClick={onClick}>{leadingIcon}{text}{chevron ? <CaretRight size={iconSize} aria-hidden="true" /> : null}</button>;
}
