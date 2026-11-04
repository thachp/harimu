import type { ReactNode } from 'react';
import { nationMark } from '../lib/nation-themes';
import { NationCrest } from './nation-crest';

/** #1091: Ilmar edicts as illuminated glass panels (docs §23.2). Build flag
 *  NEXT_PUBLIC_HARIMU_ILMAR_GLASS_EDICTS ("true" in preview, "false" in production),
 *  carried in HARIMU_UI_PACK. Layout bundles that omit the define have no `process`. */
export function ilmarGlassEdictsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_ILMAR_GLASS_EDICTS; }
  catch { return undefined; }
}
export function ilmarGlassEdictsEnabled(value: string | undefined = ilmarGlassEdictsFlag()): boolean {
  return value === 'true';
}

/** Translucent glass around the edict the civic screen already shows. No new copy. */
export function IlmarGlassEdict({ children }: { children: ReactNode }) {
  const mark = nationMark('ilmar');
  return <article className="ilmar-glass-edict" aria-label="Ilmar edict" data-nation-pattern={mark?.pattern ?? 'dots'} tabIndex={0}>
    <header className="ilmar-glass-band">
      <span className="nation-symbol ilmar-glass-mark" data-nation-pattern={mark?.pattern ?? 'dots'} aria-hidden="true">{mark?.symbol}</span>
      <NationCrest id="ilmar" size={32} force labelled />
    </header>
    <div className="ilmar-glass-body">{children}</div>
  </article>;
}
