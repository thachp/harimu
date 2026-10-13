'use client';
import { GameTimer } from './game-timer';

import type { SimulationState } from '@/lib/world-simulation';
import type { VerificationState } from '@/lib/verification';
import type { GovernmentSnapshot, PetitionTopic } from '@/lib/government';

export function GovernmentPanel({ simulation, verification, snapshot, localDemo, pending, error, onPetition, nationId, onRetry }: {
  nationId?: string;
  onRetry?: () => void;
  simulation?: SimulationState;
  verification: VerificationState | null;
  snapshot: GovernmentSnapshot | null;
  localDemo: boolean;
  pending: boolean;
  error: string | null;
  onPetition: (topic: PetitionTopic) => void;
}) {
  if (!snapshot) return <section className="citizen-market" aria-label="Government preview status">{['kindle','korund','aurelle'].includes(nationId ?? '') ? <><h3>Government preview unavailable</h3><p role="status">Your nation has a policy preview, but its saved decisions have not loaded. No policy or petition count is shown until the server record is available.</p>{onRetry && <button type="button" onClick={onRetry}>Retry government preview</button>}</> : <><h3>Civic play coming soon</h3><p>This nation’s government preview and civic actions are not built yet.</p></>}</section>;
  return <section className="citizen-market" aria-label="Government decisions and citizen petitions" aria-busy={pending}>
    <h3>Government and citizen voice</h3>
    <p>Computer-controlled leaders hold all government offices. AI/SI means artificial or simulated intelligence. Here they follow fixed game rules: the same situation produces the same decision. No live AI model is connected.</p>
    {localDemo && <p>Local demo · petitions and decisions stay in this browser.</p>}
    {!localDemo && <section aria-label="Civic verification"><h4>Phone verification for petitions</h4><p>Petitions need a verified phone number to help protect each citizen’s voice. You can read policy previews while petition submission is unavailable.</p><p role="status">{verification?.reason ?? 'Checking whether your petitions can count…'}</p></section>}
    <ul>{snapshot.roles.map((role) => <li key={role.name}><strong>{role.name}</strong> · {role.controller}</li>)}</ul>
    {!localDemo && simulation && <section aria-label="Durable world simulation">
      <h4>World day {simulation.clock.gameDay} · 12× time</h4>
      <p>Saved tick {simulation.clock.latestTick}. Routine decisions run every two real hours (one game day); server visits process up to three overdue ticks. {simulation.clock.pendingTicks ? `${simulation.clock.pendingTicks} ticks remain to process on later visits.` : 'The saved simulation is caught up.'} There is no background scheduler or connected AI model.</p>
      {snapshot.nationId === 'kindle' && <p>Kindle’s food programme can restock the starter market from a finite public supplier when food stock is below 20. Each allocation moves at most 10 food, costs 1 SPK per food, and shares the finite work-programme budget with wages. At most two allocations per real UTC day. No goods or money are created by this transfer.</p>}
      {snapshot.nationId === 'kindle' ? <>
        <p>Supplier reserve: {simulation.supplierFoodRemaining} food. Supplier receipts: {(simulation.supplierCashMinor / 100).toFixed(2)} SPK.</p>
        {simulation.latestExecution ? <p>Last saved allocation: +{simulation.latestExecution.foodQuantity} market food for {(simulation.latestExecution.spendMinor / 100).toFixed(2)} SPK · tick {simulation.latestExecution.tick} · {new Date(simulation.latestExecution.executedAt * 1000).toUTCString()}. Retries reuse this receipt; they do not spend again.</p> : <p>No food allocation has executed yet. Stock, reserve, budget and policy must all allow it; visiting does not guarantee spending.</p>}
      </> : <p>{snapshot.nationId === 'korund' ? 'Korund’s assigned work fills its separate ration store; your Household and State store show current food and coupons. Automatic government policy spending is not implemented here.' : 'This nation receives saved rule-bound proposals; policy spending and economic execution are not implemented here yet.'}</p>}
    </section>}
    <h4>{snapshot.decision.title}</h4>
    <p>{snapshot.decision.reason}</p>
    <p>Spending proposal: {snapshot.decision.proposedSpendMinor} minor units from {snapshot.availableBudgetMinor} available. This proposal itself does not spend funds; executed Kindle allocations are recorded separately above.</p>
    <p>{snapshot.influenceSummary}</p>
    <p>Ask your government to prioritize a need. Completed UTC days receive one recorded review on the next government visit. The selected topic sets the following UTC day’s policy proposal; other topics are deferred. Food safety emergencies can override that priority. Petitions do not guarantee spending.</p>
    <p>One petition per UTC day. A petition is a political act and ends your citizenship grace period.</p>
    <p>Kindle proposals and executed allocations use the remaining work-programme budget; other prototype nations have no automatic policy-appropriation fund.</p>
    {!localDemo && snapshot.review && <p>Last recorded review: {new Date(snapshot.review.reviewedAt*1000).toUTCString()} · {snapshot.review.petitionCount} petitions. {snapshot.review.active ? `Priority active until ${new Date(snapshot.review.expiresAt*1000).toUTCString()}.` : 'Priority expired; the current proposal uses live needs.'} Review inputs and reasons are saved permanently; live proposal funds are recalculated. No model is called.</p>}
    {!localDemo && snapshot.review?.active && <GameTimer endsAt={snapshot.review.expiresAt * 1000} label="Policy priority expires" />}
    {!localDemo && <section aria-label="Your petition history">
      <h4>Your petitions</h4>
      {!snapshot.petitions?.length && <p>No petitions recorded for your current nation.</p>}
      <ul>{snapshot.petitions?.map(petition=><li key={petition.requestId}>
        <strong>{petition.topic} · {petition.status}</strong> · {new Date(petition.submittedAt*1000).toUTCString()}
        <p>{petition.reason}</p>
      </li>)}</ul>
    </section>}
    {localDemo && <p>The local demo previews priorities only; recorded daily review and petition history require a signed-in citizen.</p>}
    <p id="petition-action-reason" role="status">{pending ? 'An action is being saved. Please wait before submitting a petition.' : !localDemo && !verification?.countedActionsEligible ? verification?.reason ?? 'Checking phone verification before petitions can count.' : ''}</p>
    <div className="market-quotes">{(['food', 'infrastructure', 'work'] as const).map((topic) =>
      <button key={topic} type="button" disabled={pending || (!localDemo && !verification?.countedActionsEligible)} aria-describedby={pending || (!localDemo && !verification?.countedActionsEligible) ? "petition-action-reason" : undefined} onClick={() => onPetition(topic)}>
        {localDemo ? 'Preview priority for' : 'Petition for'} {topic === 'work' ? 'workplace support' : topic}
      </button>)}</div>
    {pending && <p role="status">Submitting your petition…</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
