'use client';

import {useEffect, useRef, useState} from 'react';
import {suggestNations, suggestedNationNames, type OnboardingPreferences} from '../lib/onboarding-preferences';
import styles from './first-visit-guide.module.css';

export type FirstVisitStage = 'arrival' | 'government' | 'preferences' | 'explore';
type Props = {
  onTryGuest: () => void;
  onDismiss: () => void;
  initialStage?: FirstVisitStage;
  stage?: FirstVisitStage;
  onStageChange?: (stage: FirstVisitStage) => void;
  onShortlist?: (ids: string[]) => void;
  onStartTour?: () => void;
};

/** Optional introduction only. Account, citizenship and guest state belong to the caller. */
export function FirstVisitGuide({onTryGuest, onDismiss, initialStage = 'arrival', stage: controlledStage, onStageChange, onShortlist, onStartTour}: Props) {
  const [localStage, setLocalStage] = useState<FirstVisitStage>(initialStage);
  const [preferences, setPreferences] = useState<OnboardingPreferences>({});
  const [shortlist, setShortlist] = useState<string[]>([]);
  const stage = controlledStage ?? localStage;
  const heading = useRef<HTMLHeadingElement>(null);
  // A tour returns by mounting at government; restore focus from its removed controls.
  // Default arrival leaves the page’s initial focus untouched.
  const previousStage = useRef<FirstVisitStage>('arrival');
  useEffect(() => {
    if (previousStage.current === stage) return;
    previousStage.current = stage;
    heading.current?.focus();
  }, [stage]);
  function setStage(next: FirstVisitStage) { setLocalStage(next); onStageChange?.(next); }
  function makeShortlist() { const ids = suggestNations(preferences); setShortlist(ids); onShortlist?.(ids); setStage('explore'); }
  return <section className={styles.guide} aria-labelledby="first-visit-title">
    <div className={styles.top}><span className={styles.eyebrow}>Optional introduction · {stage === 'arrival' ? 1 : stage === 'government' ? 2 : stage === 'preferences' ? 3 : 4}/4</span><button type="button" onClick={onDismiss} aria-label="Close first-visit guide">Close</button></div>
    <div aria-live="polite">
      <h2 ref={heading} id="first-visit-title" tabIndex={-1}>{stage === 'arrival' ? 'Welcome to Harimu' : stage === 'government' ? 'Who runs the government' : stage === 'preferences' ? 'What interests you?' : 'Explore before you choose'}</h2>
      {stage === 'arrival' && <><p>Ten nations share one world. Each has its own government, economy and way of life. Three of them (Kindle, Korund and Aurelle) are playable in this preview; the other seven are previews you can read about but not yet join. You are visiting: you become a citizen only when you choose a nation and confirm the Oath of Citizenship, which is permanent.</p><p>Look around and try a sample day before making your citizenship choice. This development preview is still being built.</p></>}
      {stage === 'government' && <><p>Every government office is computer-controlled. AI/SI means artificial or simulated intelligence; humans play citizens and never hold office.</p><p>Today, leaders follow fixed game rules: the same situation produces the same decision. No live AI model is connected. A wider AI population and named characters are planned.</p><p>Citizen influence follows each nation’s institutions. In this preview, you can read supported policy decisions; petitions are unavailable until phone verification is set up. Elections and protests are not open yet.</p></>}
      {stage === 'preferences' && <><p>Three optional questions suggest places to explore. This shortened guide matches your interests to the documented nation rules; it does not use live population data or decide citizenship. Equal matches favor Kindle, Korund and Aurelle, whose prototype economies are playable.</p>
        <label className={styles.question}>How would you like power to work?<select value={preferences.power ?? ''} onChange={event => setPreferences(current => ({...current, power: event.target.value}))}><option value="">No preference</option><option value="democracy">Citizen voting and assemblies</option><option value="party">Party leadership and collective plans</option><option value="crown">Royal or religious authority</option><option value="bloc">Military or commercial leadership</option></select></label>
        <label className={styles.question}>What economy interests you?<select value={preferences.money ?? ''} onChange={event => setPreferences(current => ({...current, money: event.target.value}))}><option value="">No preference</option><option value="markets">Trading with freely floating money</option><option value="managed">Managed or pegged money</option><option value="backed">Money tied to gold or faith rules</option><option value="ration">Rations rather than market money</option></select></label>
        <label className={styles.question}>What place should faith have?<select value={preferences.faith ?? ''} onChange={event => setPreferences(current => ({...current, faith: event.target.value}))}><option value="">No preference</option><option value="free">Free choice of faith</option><option value="supervised">Registered or supervised faith</option><option value="state">An official state faith</option><option value="none">Faith prohibited by the state</option></select></label></>}
      {stage === 'explore' && <>{shortlist.length > 0 && <p>Suggested for exploration: {suggestedNationNames(shortlist)}. Find these in the existing nation strip; all ten remain available. Suggestions do not mean every nation’s gameplay is complete.</p>}<p>Use the nation strip at the bottom, or click a name on the globe, to explore any of the ten nations. Selecting one brings it into view and shows its rules; it does not change citizenship.</p><p>Try a sample work → food → meal loop without signing in. Sample actions are disposable and do not affect the shared world.</p><p>When you are ready, choose citizenship from the nation’s profile. Review comes first, then the oath; sign-in is required at the oath. One nation change is allowed within 48 real hours before any political action.</p></>}
    </div>
    <div className={styles.actions}>
      <button type="button" onClick={onDismiss}>Skip guide · explore</button>
      {stage !== 'arrival' && <button type="button" onClick={() => setStage(stage === 'explore' ? 'preferences' : stage === 'preferences' ? 'government' : 'arrival')}>Back</button>}
      {stage === 'arrival' && <button type="button" className={styles.primary} onClick={() => setStage('government')}>About government</button>}
      {stage === 'government' && <button type="button" className={styles.primary} onClick={() => setStage('preferences')}>Optional interests</button>}
      {stage === 'preferences' && <><button type="button" onClick={() => { setShortlist([]); onShortlist?.([]); setStage('explore'); }}>Skip questions</button><button type="button" className={styles.primary} onClick={makeShortlist}>Suggest three nations</button></>}
      {stage === 'arrival' && onStartTour && <button type="button" onClick={onStartTour}>Tour the globe</button>}
      {stage === 'explore' && <button type="button" className={styles.primary} onClick={onTryGuest}>Try a sample day</button>}
    </div>
  </section>;
}
