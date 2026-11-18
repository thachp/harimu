/** #1422 / #1426 / #1432: civic government deadline rows from holiday and non-holiday civic clocks
 *  already on the government read. Pure: no new flag, no migration, no invented dates.
 *  Labels match the docs / atlas names; the five rows already shown in GovernmentDeadlines keep
 *  their existing labels. #1426 appends Party Congress, People's Assembly election, Council of Ten
 *  election, Lodestar election, Tribune session, Great Council window, and Presidential term end.
 *  #1432 appends Moot term and Investiture deadline, converting snapshot seconds to ms instants. */
import type { GovernmentSnapshot } from './government.ts';

export type GovernmentDeadlineRow = { label: string; at: number };

function push(rows: GovernmentDeadlineRow[], seen: Set<string>, label: string, at: number | undefined): void {
  if (at == null || !Number.isSafeInteger(at) || seen.has(label)) return;
  seen.add(label);
  rows.push({ label, at });
}

function celebrationCanceled(clock?: { canceled?: true }): boolean {
  return clock?.canceled === true;
}

/** Term and holiday instants already present on the snapshot. Absent keys stay omitted. */
export function governmentDeadlineRows(snapshot: GovernmentSnapshot): GovernmentDeadlineRow[] {
  const rows: GovernmentDeadlineRow[] = [];
  const seen = new Set<string>();
  // Keep the five existing civic rows, in the current order and with the current labels.
  if (snapshot.federalCouncil) push(rows, seen, 'Council election', snapshot.federalCouncil.nextElectionAt);
  if (snapshot.directorate) push(rows, seen, 'Rotation Day', snapshot.directorate.nextRotationAt);
  if (snapshot.mandatePlebiscite) push(rows, seen, 'Mandate Plebiscite', snapshot.mandatePlebiscite.nextAt);
  if (snapshot.sanctum) {
    push(rows, seen, 'Next Stillday', snapshot.sanctum.nextStilldayAt);
    push(rows, seen, 'Great Pilgrimage', snapshot.sanctum.nextGreatPilgrimageAt);
  }
  // Remaining §7 / §4 holiday clocks, in atlas order. Dedup skips Rotation Day and Great Pilgrimage
  // when the earlier directorate / sanctum row already listed them. #1220: skip canceled Varkand celebrations.
  if (snapshot.electionClock) push(rows, seen, 'Ballot Night', snapshot.electionClock.nextBallotNightAt);
  if (snapshot.foundersForgeDay) push(rows, seen, "Founders' Forge Day", snapshot.foundersForgeDay.nextAt);
  if (snapshot.marketBell) push(rows, seen, 'Market Bell', snapshot.marketBell.nextAt);
  if (snapshot.congressLanterns) push(rows, seen, 'Congress Lanterns', snapshot.congressLanterns.nextAt);
  if (snapshot.canalFestival) push(rows, seen, 'Canal Festival', snapshot.canalFestival.nextAt);
  if (snapshot.quotaDay) push(rows, seen, 'Quota Day', snapshot.quotaDay.nextAt);
  if (snapshot.congressWeek) push(rows, seen, 'Congress Week', snapshot.congressWeek.nextAt);
  if (snapshot.examDay) push(rows, seen, 'Exam Day', snapshot.examDay.nextAt);
  if (snapshot.turbineDay) push(rows, seen, 'Turbine Day', snapshot.turbineDay.nextAt);
  if (snapshot.planCalendar) {
    push(rows, seen, 'Plan Day', snapshot.planCalendar.nextPlanDayAt);
    push(rows, seen, 'Quota Rally', snapshot.planCalendar.nextQuotaRallyAt);
  }
  if (snapshot.chairmanBirthday) push(rows, seen, "Chairman's Birthday", snapshot.chairmanBirthday.nextAt);
  if (snapshot.peoplesCongress) push(rows, seen, "People's Congress", snapshot.peoplesCongress.nextAt);
  if (snapshot.coronationDay) push(rows, seen, 'Coronation Day', snapshot.coronationDay.nextAt);
  if (snapshot.hearthNight) push(rows, seen, 'Hearth Night', snapshot.hearthNight.nextAt);
  if (snapshot.charterFair) push(rows, seen, 'Charter Fair', snapshot.charterFair.nextAt);
  if (snapshot.kiteFestival) push(rows, seen, 'Kite Festival', snapshot.kiteFestival.nextAt);
  if (snapshot.feastOfFirstLight) push(rows, seen, 'Feast of First Light', snapshot.feastOfFirstLight.nextAt);
  if (snapshot.assemblyElectionDay) push(rows, seen, 'Assembly Election', snapshot.assemblyElectionDay.nextAt);
  if (snapshot.greatPilgrimage) push(rows, seen, 'Great Pilgrimage', snapshot.greatPilgrimage.nextAt);
  if (snapshot.clearing) push(rows, seen, 'Clearing', snapshot.clearing.nextAt);
  if (snapshot.longLight) push(rows, seen, 'Long Light', snapshot.longLight.nextAt);
  if (snapshot.mootOpening) push(rows, seen, 'Opening of the Moot', snapshot.mootOpening.nextAt);
  if (snapshot.honorsListDay) push(rows, seen, 'Honors List Day', snapshot.honorsListDay.nextAt);
  if (snapshot.auroraNight) push(rows, seen, 'Aurora Night', snapshot.auroraNight.nextAt);
  if (snapshot.electionNight) push(rows, seen, 'Election Night', snapshot.electionNight.nextAt);
  if (!celebrationCanceled(snapshot.musterDay) && snapshot.musterDay) push(rows, seen, 'Muster Day', snapshot.musterDay.nextAt);
  if (!celebrationCanceled(snapshot.rotationDay) && snapshot.rotationDay) push(rows, seen, 'Rotation Day', snapshot.rotationDay.nextAt);
  if (snapshot.lanternWatch && !celebrationCanceled(snapshot.lanternWatch)) push(rows, seen, 'Lantern Watch', snapshot.lanternWatch.nextAt);
  if (snapshot.voteDayCalendar) push(rows, seen, 'Vote Day', snapshot.voteDayCalendar.nextAt);
  if (snapshot.dividendDay) push(rows, seen, 'Dividend Day', snapshot.dividendDay.nextAt);
  if (snapshot.ringMoot) push(rows, seen, 'Ring Moot', snapshot.ringMoot.nextAt);
  if (snapshot.exchangeBell) push(rows, seen, 'Exchange Bell', snapshot.exchangeBell.nextAt);
  if (snapshot.grandRegatta) push(rows, seen, 'Grand Regatta', snapshot.grandRegatta.nextAt);
  if (snapshot.charterDay) push(rows, seen, 'Charter Day', snapshot.charterDay.nextAt);
  if (snapshot.fairWindBlessing) push(rows, seen, 'Fair-Wind Blessing', snapshot.fairWindBlessing.nextAt);
  if (snapshot.dockStrikeRemembrance) push(rows, seen, 'Dock Strike remembrance', snapshot.dockStrikeRemembrance.nextAt);
  // #1426: non-holiday civic clocks already on the snapshot. Party Congress from party and
  // partyState shares one label, so the first present key wins. Missing keys stay omitted.
  if (snapshot.party) push(rows, seen, 'Party Congress', snapshot.party.nextCongressAt);
  if (snapshot.partyState) push(rows, seen, 'Party Congress', snapshot.partyState.nextCongressAt);
  if (snapshot.assemblyElection) push(rows, seen, "People's Assembly election", snapshot.assemblyElection.nextElectionAt);
  if (snapshot.grandCouncil) {
    push(rows, seen, 'Council of Ten election', snapshot.grandCouncil.councilOfTenNextElectionAt);
    push(rows, seen, 'Lodestar election', snapshot.grandCouncil.lodestarNextElectionAt);
    push(rows, seen, 'Tribune session', snapshot.grandCouncil.tribuneSessionEndsAt);
  }
  if (snapshot.crownCalendar) push(rows, seen, 'Great Council window', snapshot.crownCalendar.nextGreatCouncilWindowAt);
  if (snapshot.electionClock) push(rows, seen, 'Presidential term end', snapshot.electionClock.termEndsAt);
  // #1432: Hoarvale moot.dissolvesBy and investitureDeadline are integer seconds
  // on the snapshot (docs §7.7, #1096). Convert to epoch milliseconds only here
  // so GameTimer receives instants, not 1970 dates. Producers and other
  // consumers stay in seconds.
  if (snapshot.moot) {
    push(rows, seen, 'Moot term', snapshot.moot.dissolvesBy * 1000);
    push(rows, seen, 'Investiture deadline', snapshot.moot.investitureDeadline * 1000);
  }
  return rows;
}
