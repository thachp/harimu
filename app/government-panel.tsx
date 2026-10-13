'use client';

import type { VerificationState } from '@/lib/verification';
import type { GovernmentSnapshot, PetitionTopic } from '@/lib/government';

export function GovernmentPanel({ verification, snapshot, localDemo, pending, error, onPetition }: {
  verification: VerificationState | null;
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
    {!localDemo && <section aria-label="Civic verification"><h4>Counted civic actions · Tier 1</h4><p role="status">{verification?.reason ?? 'Checking civic eligibility…'}</p></section>}
    <ul>{snapshot.roles.map((role) => <li key={role.name}><strong>{role.name}</strong> · {role.controller}</li>)}</ul>
    <h4>{snapshot.decision.title}</h4>
    <p>{snapshot.decision.reason}</p>
    <p>Spending proposal: {snapshot.decision.proposedSpendMinor} minor units from {snapshot.availableBudgetMinor} available. This preview does not spend treasury funds.</p>
    <p>{snapshot.influenceSummary}</p>
    <p>Ask your government to prioritize a need. Completed UTC days receive one recorded review on the next government visit. The selected topic sets the following UTC day’s policy proposal; other topics are deferred. Food safety emergencies can override that priority. Petitions do not guarantee spending.</p>
    <p>One petition per UTC day. A petition is a political act and ends your citizenship grace period.</p>
    <p>This is a proposal only. Kindle uses the remaining work-programme budget; other prototype nations have no connected programme funding.</p>
    {!localDemo && snapshot.review && <p>Last recorded review: {new Date(snapshot.review.reviewedAt*1000).toUTCString()} · {snapshot.review.petitionCount} petitions. {snapshot.review.active ? `Priority active until ${new Date(snapshot.review.expiresAt*1000).toUTCString()}.` : 'Priority expired; the current proposal uses live needs.'} Review inputs and reasons are saved permanently; live proposal funds are recalculated. No model is called.</p>}
    {!localDemo && <section aria-label="Your petition history">
      <h4>Your petitions</h4>
      {!snapshot.petitions?.length && <p>No petitions recorded for your current nation.</p>}
      <ul>{snapshot.petitions?.map(petition=><li key={petition.requestId}>
        <strong>{petition.topic} · {petition.status}</strong> · {new Date(petition.submittedAt*1000).toUTCString()}
        <p>{petition.reason}</p>
      </li>)}</ul>
    </section>}
    {localDemo && <p>The local demo previews priorities only; recorded daily review and petition history require a signed-in citizen.</p>}
    <div className="market-quotes">{(['food', 'infrastructure', 'work'] as const).map((topic) =>
      <button key={topic} type="button" disabled={pending || (!localDemo && !verification?.countedActionsEligible)} onClick={() => onPetition(topic)}>
        {localDemo ? 'Preview priority for' : 'Petition for'} {topic === 'work' ? 'workplace support' : topic}
      </button>)}</div>
    {pending && <p role="status">Submitting your petition…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
