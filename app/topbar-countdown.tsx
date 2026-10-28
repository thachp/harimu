'use client';
import { useEffect, useState } from 'react';
import { helpIdOf } from '@/lib/hud-help';
import { compactCountdown, countdownTip, nextNationEvent, topbarCountdownEnabled, type CountdownInput } from '@/lib/topbar-countdown';

/** #969: compact countdown beside the world clock. Renders nothing when the flag is off, or when no future event is known. */
export function TopbarCountdown({ input, open, epochSeconds }: { input: Omit<CountdownInput, 'now'>; open: boolean; epochSeconds?: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!topbarCountdownEnabled()) return null;
  const mark = now == null ? null : nextNationEvent({ ...input, now: Math.floor(now / 1000) });
  const compact = mark && now != null ? compactCountdown(mark.at * 1000 - now) : null;
  if (!mark || !compact || now == null) return null;
  const helpId = helpIdOf('Next event'), tip = countdownTip(mark, now, epochSeconds);
  return <details className="game-hud-help" data-help-id={helpId} open={open}><summary aria-describedby={helpId}><span className="game-countdown"><span className="game-countdown-name">{mark.label} in </span>{compact}</span></summary><div id={helpId} className="game-hud-tip">{tip}</div></details>;
}
