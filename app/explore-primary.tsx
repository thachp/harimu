'use client';
import type { ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';

/** #392 UI 38 gold Explore button. World atlas and the Nation overview action row share this class (world-atlas.css).
 *  #392 UI 52: optional leading icon. When it is omitted, the button is the label and, when asked, the trailing chevron. */
export function ExplorePrimaryButton({ label, ariaLabel, onClick, chevron = false, leadingIcon = null }: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  chevron?: boolean;
  leadingIcon?: ReactNode;
}) {
  const text = leadingIcon ? <span className="world-atlas-primary-label">{label}</span> : label;
  return <button type="button" className="world-atlas-primary" aria-label={ariaLabel} onClick={onClick}>{leadingIcon}{text}{chevron ? <CaretRight size={18} aria-hidden="true" /> : null}</button>;
}
