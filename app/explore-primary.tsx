'use client';
import { CaretRight } from '@phosphor-icons/react';

/** #392 UI 38 gold Explore button. World atlas and the Nation overview action row share this class (world-atlas.css). */
export function ExplorePrimaryButton({ label, ariaLabel, onClick, chevron = false }: {
  label: string;
  ariaLabel: string;
  onClick: () => void;
  chevron?: boolean;
}) {
  return <button type="button" className="world-atlas-primary" aria-label={ariaLabel} onClick={onClick}>{label}{chevron ? <CaretRight size={18} aria-hidden="true" /> : null}</button>;
}
