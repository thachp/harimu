'use client';

import { useEffect, useRef, type KeyboardEvent } from 'react';

import type { SceneView } from '@/lib/scene-navigation';
import type { MorningBriefSection } from '@/lib/morning-brief';

export const MORNING_BRIEF_TRIGGER_ID = 'morning-brief-trigger';

export function MorningBrief({ nationName, sections, onNavigate, onClose }: {
  nationName: string;
  sections: MorningBriefSection[];
  onNavigate: (view: SceneView) => void;
  onClose: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  // Move focus into the card when it opens; hand it back to the Brief trigger when it closes.
  useEffect(() => {
    card.current?.focus();
    return () => { requestAnimationFrame(() => document.getElementById(MORNING_BRIEF_TRIGGER_ID)?.focus()); };
  }, []);
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
  return <section ref={card} id="morning-brief" tabIndex={-1} className="morning-brief" role="dialog" aria-modal="false" aria-labelledby="morning-brief-title" onKeyDown={onKeyDown}>
    <header><h2 id="morning-brief-title">Morning brief · {nationName}</h2><button type="button" onClick={onClose} aria-label="Dismiss morning brief">Dismiss</button></header>
    {sections.map(section => <div key={section.id} className="morning-brief-section">
      <h3>{section.title}</h3>
      <ul>{section.items.map(item => <li key={item.id}><button type="button" onClick={() => { onNavigate(item.target); onClose(); }}><strong>{item.label}</strong><span>{item.detail}</span></button></li>)}</ul>
    </div>)}
  </section>;
}
