'use client';

import type { SceneView } from '@/lib/scene-navigation';
import type { MorningBriefSection } from '@/lib/morning-brief';

export function MorningBrief({ nationName, sections, onNavigate, onClose }: {
  nationName: string;
  sections: MorningBriefSection[];
  onNavigate: (view: SceneView) => void;
  onClose: () => void;
}) {
  return <section className="morning-brief" role="dialog" aria-modal="false" aria-labelledby="morning-brief-title">
    <header><h2 id="morning-brief-title">Morning brief · {nationName}</h2><button type="button" onClick={onClose} aria-label="Dismiss morning brief">Dismiss</button></header>
    {sections.map(section => <div key={section.id} className="morning-brief-section">
      <h3>{section.title}</h3>
      <ul>{section.items.map(item => <li key={item.id}><button type="button" onClick={() => { onNavigate(item.target); onClose(); }}><strong>{item.label}</strong><span>{item.detail}</span></button></li>)}</ul>
    </div>)}
  </section>;
}
