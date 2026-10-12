'use client';

import type { GovernmentSnapshot, PetitionTopic } from '@/lib/government';

export function GovernmentPanel({ snapshot, localDemo, pending, error, onPetition }: {
  snapshot: GovernmentSnapshot | null;
  localDemo: boolean;
  pending: boolean;
  error: string | null;
  onPetition: (topic: PetitionTopic) => void;
}) {
  if (!snapshot) return null;
  return <section className="citizen-market" aria-label="Government decisions and citizen petitions" aria-busy={pending}>
    <h3>Government and citizen voice</h3>
    <p>Rule-bound simulation · all government offices are controlled by AI/SI roles for the first release. These decisions use deterministic rules, not a connected AI model.</p>
    {localDemo && <p>Local demo · petitions and decisions stay in this browser.</p>}
    <ul>{snapshot.roles.map((role) => <li key={role.name}><strong>{role.name}</strong> · {role.controller}</li>)}</ul>
    <h4>{snapshot.decision.title}</h4>
    <p>{snapshot.decision.reason}</p>
    <p>Spending proposal: {snapshot.decision.proposedSpendMinor} minor units from {snapshot.availableBudgetMinor} available. This preview does not spend treasury funds.</p>
    <p>{snapshot.influenceSummary}</p>
    <p>Ask your government to prioritize a need. Petitions influence proposals; they do not guarantee an allocation.</p>
    <p>One petition per UTC day. A petition is a political act and ends your citizenship grace period.</p>
    <p>This is a proposal only. Kindle uses the remaining work-programme budget; other prototype nations have no connected programme funding.</p>
    <div className="market-quotes">{(['food', 'infrastructure', 'work'] as const).map((topic) =>
      <button key={topic} type="button" disabled={pending} onClick={() => onPetition(topic)}>
        Petition for {topic === 'work' ? 'workplace support' : topic}
      </button>)}</div>
    {pending && <p role="status">Submitting your petition…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
