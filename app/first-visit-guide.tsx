'use client';

import {useState} from 'react';
import styles from './first-visit-guide.module.css';

export type FirstVisitStage = 'arrival' | 'government' | 'explore';
type Props = {
  onTryGuest: () => void;
  onDismiss: () => void;
  initialStage?: FirstVisitStage;
};

/** Optional introduction only. Account, citizenship and guest state belong to the caller. */
export function FirstVisitGuide({onTryGuest, onDismiss, initialStage = 'arrival'}: Props) {
  const [stage, setStage] = useState<FirstVisitStage>(initialStage);
  return <section className={styles.guide} aria-labelledby="first-visit-title">
    <div className={styles.top}><span className={styles.eyebrow}>Optional introduction · {stage === 'arrival' ? 1 : stage === 'government' ? 2 : 3}/3</span><button type="button" onClick={onDismiss} aria-label="Close first-visit guide">Close</button></div>
    <div aria-live="polite">
      <h2 id="first-visit-title">{stage === 'arrival' ? 'Welcome to Harimu' : stage === 'government' ? 'You are a citizen' : 'Explore before you choose'}</h2>
      {stage === 'arrival' && <><p>Ten nations share one world. Each has its own government, economy and way of life. You will belong to one as a citizen.</p><p>Look around and try a sample day before making your citizenship choice. This development preview is still being built.</p></>}
      {stage === 'government' && <><p>Every government office is computer-controlled. AI/SI means artificial or simulated intelligence; humans play citizens and never hold office.</p><p>Today, leaders follow fixed game rules: the same situation produces the same decision. No live AI model is connected. A wider AI population and named characters are planned.</p><p>Citizen influence follows each nation’s institutions. In this preview, you can read supported policy decisions; petitions are unavailable until phone verification is set up. Elections and protests are not open yet.</p></>}
      {stage === 'explore' && <><p>Use the nation strip at the bottom, or click a name on the globe, to explore any of the ten nations. Selecting one brings it into view and shows its rules; it does not change citizenship.</p><p>Try a sample work → food → meal loop without signing in. Sample actions are disposable and do not affect the shared world.</p><p>When you are ready, choose citizenship from the nation’s profile. Review comes first, then the oath; sign-in is required at the oath. One nation change is allowed within 48 real hours before any political action.</p></>}
    </div>
    <div className={styles.actions}>
      <button type="button" onClick={onDismiss}>Skip guide · explore</button>
      {stage !== 'arrival' && <button type="button" onClick={() => setStage(stage === 'explore' ? 'government' : 'arrival')}>Back</button>}
      {stage === 'arrival' && <button type="button" className={styles.primary} onClick={() => setStage('government')}>About government</button>}
      {stage === 'government' && <button type="button" className={styles.primary} onClick={() => setStage('explore')}>How to explore</button>}
      {stage === 'explore' && <button type="button" className={styles.primary} onClick={onTryGuest}>Try a sample day</button>}
    </div>
  </section>;
}
