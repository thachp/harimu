'use client';
import { useEffect, useState } from 'react';
import { helpIdOf } from '@/lib/hud-help';
import { compactCountdown, countdownAccessName, countdownIntervalMs, countdownTip, nextNationEvent, topbarCountdownEnabled, type CountdownInput } from '@/lib/topbar-countdown';

function motionReduced(): boolean {
  return document.documentElement.hasAttribute('data-harimu-reduced-motion') || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** #969: compact countdown beside the world clock. Nothing when the flag is off, or when no future event is known.
 *  The summary stays a button. The digits are a timer with aria-live off, so a screen reader is not told every second.
 *  The name (real time and game time) changes at most once a minute. Reduced motion repaints on that same minute. */
export function TopbarCountdown({ input, open, epochSeconds }: { input: Omit<CountdownInput, 'now'>; open: boolean; epochSeconds?: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    let id = 0;
    const arm = () => { window.clearInterval(id); id = window.setInterval(tick, countdownIntervalMs(motionReduced())); };
    arm();
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    media?.addEventListener?.('change', arm);
    const observer = new MutationObserver(arm);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-harimu-reduced-motion'] });
    return () => { window.clearInterval(id); media?.removeEventListener?.('change', arm); observer.disconnect(); };
  }, []);
  if (!topbarCountdownEnabled()) return null;
  const mark = now == null ? null : nextNationEvent({ ...input, now: Math.floor(now / 1000) });
  const compact = mark && now != null ? compactCountdown(mark.at * 1000 - now) : null;
  if (!mark || !compact || now == null) return null;
  const helpId = helpIdOf('Next event'), tip = countdownTip(mark, now, epochSeconds), name = countdownAccessName(mark, now, epochSeconds);
  return <details className="game-hud-help" data-help-id={helpId} open={open}><summary aria-describedby={helpId}><span className="game-countdown" role="timer" aria-live="off" aria-label={name}><span aria-hidden="true"><span className="game-countdown-name">{mark.label} in </span>{compact}</span></span></summary><div id={helpId} className="game-hud-tip">{tip}</div></details>;
}
