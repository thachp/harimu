'use client';
// #782: cosmetic "I Voted" badge on the citizen's own Civic view. Hidden unless GET /api/citizen/i-voted answers (flag on) with a badge.
import { useEffect, useState } from 'react';
import { voteKindLabels, type IVotedBadge as Badge } from '@/lib/i-voted';

export function IVotedBadge() {
  const [badge, setBadge] = useState<Badge | null>(null);
  useEffect(() => { fetch('/api/citizen/i-voted').then(r => r.ok ? r.json() as Promise<{ badges?: Badge[] }> : null).then(d => setBadge(d?.badges?.[0] ?? null)).catch(() => setBadge(null)); }, []);
  if (!badge) return null;
  return <p className="i-voted-badge" role="status" aria-label="I Voted badge"><strong>I Voted</strong> You voted in {voteKindLabels[badge.kind]}. A badge only: no currency or reward.</p>;
}
