'use client';
import { useEffect, useState } from 'react';
import { globeTourNext, globeTourStepMs, globeTourStops } from '../lib/globe-tour';
import styles from './globe-tour.module.css';

/** Mounted only after an explicit start. Camera sightseeing never selects citizenship. */
export function GlobeTour({ onFocus, onClose }: { onFocus: (id: string | null) => void; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [automatic, setAutomatic] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { setReducedMotion(preference.matches); if (preference.matches) setAutomatic(false); };
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { apply(); setAutomatic(!preference.matches); } });
    preference.addEventListener('change', apply);
    return () => { cancelled = true; preference.removeEventListener('change', apply); };
  }, []);
  useEffect(() => { onFocus(globeTourStops[step].id); }, [step, onFocus]);
  useEffect(() => {
    if (!automatic || reducedMotion) return;
    const timer = window.setTimeout(() => {
      const next = globeTourNext(step);
      if (next === null) { onFocus(null); onClose(); } else setStep(next);
    }, globeTourStepMs);
    return () => window.clearTimeout(timer);
  }, [automatic, reducedMotion, step, onFocus, onClose]);
  const close = () => { onFocus(null); onClose(); };
  const next = () => { const index = globeTourNext(step); if (index === null) close(); else setStep(index); };
  const stop = globeTourStops[step];
  return <section className={styles.tour} aria-label="Optional globe tour">
    <div role="status" aria-live="polite" aria-atomic="true"><small>Globe tour · {step + 1} / {globeTourStops.length}</small><strong>{stop.name}</strong><p>{stop.introduction}</p></div>
    <small>Design overview · your nation choice stays unchanged. {reducedMotion ? 'Manual steps respect your reduced-motion preference.' : automatic ? 'About 2 minutes · 12 seconds per nation.' : 'Paused · explore at your own pace.'}</small>
    <nav aria-label="Globe tour controls">
      <button type="button" disabled={step === 0} onClick={() => setStep(Math.max(0, step - 1))}>Back</button>
      <button type="button" onClick={next}>{step === globeTourStops.length - 1 ? 'Finish tour' : 'Next'}</button>
      {!reducedMotion && <button type="button" onClick={() => setAutomatic(!automatic)}>{automatic ? 'Pause' : 'Play automatically'}</button>}
      <button type="button" onClick={close}>Stop tour</button>
      <button type="button" onClick={close}>Skip tour</button>
    </nav>
  </section>;
}
