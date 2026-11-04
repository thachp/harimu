'use client';
import { useEffect, useState } from 'react';
import { countdownIntervalMs } from '@/lib/topbar-countdown';
import { veldwoodWalletDividend, veldwoodWalletDividendEnabled, type VeldwoodDividendLine } from '@/lib/veldwood-wallet-dividend';

function motionReduced(): boolean {
  return document.documentElement.hasAttribute('data-harimu-reduced-motion') || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** #1063: per-nation wallet sub-line. Veldwood Dividend Day only; anything else renders nothing.
 *  The visible words update in place. This component sets no accessible name and no live region:
 *  the wallet chip's one HudHelp name carries the label, and that name changes at most once a minute. */
export function VeldwoodWalletDividend({ nationId, dividendDayAt, epochSeconds, nowMs, onLine }: {
  nationId?: string; dividendDayAt?: number | null; epochSeconds?: number; nowMs?: number; onLine?: (line: VeldwoodDividendLine | null) => void;
}) {
  const pinned = typeof nowMs === 'number';
  const active = !pinned && nationId === 'veldwood' && typeof dividendDayAt === 'number' && veldwoodWalletDividendEnabled();
  const [now, setNow] = useState<number | null>(pinned ? nowMs : null);
  useEffect(() => {
    if (!active) return;
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
  }, [active]);
  const line = veldwoodWalletDividend(nationId, dividendDayAt, now, epochSeconds);
  const bucket = line?.bucket ?? '';
  useEffect(() => { if (!pinned) onLine?.(line); }, [bucket, pinned, onLine, line]);
  if (!line) return null;
  const parts = ['·', ...line.text.split(' ')];
  return <>{parts.map((word, index) => <span key={index} className="game-wallet-dividend-word">{` ${word}`}</span>)}</>;
}
