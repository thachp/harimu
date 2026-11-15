/** #1422: civic government deadlines list holiday clocks already on the government read (docs §7, §4, §23.1). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { governmentDeadlineRows } from '../lib/government-deadlines.ts';

const read = name => readFileSync(name, 'utf8');
const T = 1_700_000_000_000;

test('#1422: a Kindle snapshot lists Ballot Night, Founders\' Forge Day, and Market Bell from existing keys', () => {
  const rows = governmentDeadlineRows({
    electionClock: { nextBallotNightAt: T + 1, termEndsAt: T + 2, termDays: 150, maxConsecutiveTerms: 2 },
    foundersForgeDay: { nextAt: T + 3, intervalDays: 30, opensFair: false },
    marketBell: { nextAt: T + 4, cycleDays: 30 },
  });
  assert.deepEqual(rows, [
    { label: 'Ballot Night', at: T + 1 },
    { label: "Founders' Forge Day", at: T + 3 },
    { label: 'Market Bell', at: T + 4 },
  ]);
});

test('#1422: existing civic rows keep their labels, and later holiday clocks append when present', () => {
  const rows = governmentDeadlineRows({
    federalCouncil: { nextElectionAt: T + 10, termDays: 120, speakerSeat: 0, speakerRotationDays: 30 },
    voteDayCalendar: { nextAt: T + 11, cycleDays: 15 },
    dividendDay: { nextAt: T + 12, cycleDays: 30 },
    ringMoot: { nextAt: T + 13, cycleDays: 30 },
  });
  assert.deepEqual(rows, [
    { label: 'Council election', at: T + 10 },
    { label: 'Vote Day', at: T + 11 },
    { label: 'Dividend Day', at: T + 12 },
    { label: 'Ring Moot', at: T + 13 },
  ]);
});

test('#1422: Rotation Day and Great Pilgrimage are listed once when both the early and later keys are present', () => {
  const rows = governmentDeadlineRows({
    directorate: { chair: { id: 'chair' }, commands: [], nextRotationAt: T + 20 },
    rotationDay: { nextAt: T + 21, cycleDays: 60 },
    sanctum: { oracleTerm: 'life', councilOfEldersSeats: 12, isStillday: false, nextStilldayAt: T + 22, nextGreatPilgrimageAt: T + 23 },
    greatPilgrimage: { nextAt: T + 24, cycleDays: 30 },
    feastOfFirstLight: { nextAt: T + 25, cycleDays: 15 },
  });
  const labels = rows.map(row => row.label);
  assert.equal(labels.filter(name => name === 'Rotation Day').length, 1);
  assert.equal(labels.filter(name => name === 'Great Pilgrimage').length, 1);
  assert.deepEqual(rows.find(row => row.label === 'Rotation Day'), { label: 'Rotation Day', at: T + 20 });
  assert.deepEqual(rows.find(row => row.label === 'Great Pilgrimage'), { label: 'Great Pilgrimage', at: T + 23 });
  assert.deepEqual(rows.find(row => row.label === 'Next Stillday'), { label: 'Next Stillday', at: T + 22 });
  assert.deepEqual(rows.find(row => row.label === 'Feast of First Light'), { label: 'Feast of First Light', at: T + 25 });
});

test('#1422: canceled Varkand celebrations are omitted; Mandate Plebiscite and directorate Rotation Day stay', () => {
  const rows = governmentDeadlineRows({
    directorate: { chair: { id: 'chair' }, commands: [], nextRotationAt: T + 30 },
    mandatePlebiscite: { nextAt: T + 31, cycleDays: 150 },
    musterDay: { nextAt: T + 32, intervalDays: 30, mustersTroops: false, canceled: true },
    rotationDay: { nextAt: T + 33, cycleDays: 60, canceled: true },
    lanternWatch: { nextAt: T + 34, cycleDays: 30, canceled: true },
  });
  assert.deepEqual(rows, [
    { label: 'Rotation Day', at: T + 30 },
    { label: 'Mandate Plebiscite', at: T + 31 },
  ]);
});

test('#1422: rotationDay and lanternWatch list when they are present and not canceled, and an empty snapshot has no rows', () => {
  const listed = governmentDeadlineRows({
    rotationDay: { nextAt: T + 40, cycleDays: 60 },
    lanternWatch: { nextAt: T + 41, cycleDays: 30 },
    musterDay: { nextAt: T + 42, intervalDays: 30, mustersTroops: false },
  });
  assert.deepEqual(listed, [
    { label: 'Muster Day', at: T + 42 },
    { label: 'Rotation Day', at: T + 40 },
    { label: 'Lantern Watch', at: T + 41 },
  ]);
  assert.deepEqual(governmentDeadlineRows({}), []);
});

test('#1422: Korund, Aurelle, Hoarvale, Fulmara, Meridian, Confluence, and Ilmar extra clocks use documented names', () => {
  const rows = governmentDeadlineRows({
    planCalendar: { currentPlanStartedAt: T, nextPlanDayAt: T + 50, nextQuotaRallyAt: T + 51, planIntervalDays: 150, quotaRalliesPerPlan: 4 },
    chairmanBirthday: { nextAt: T + 52, cycleDays: 30 },
    peoplesCongress: { nextAt: T + 53, cycleDays: 30 },
    coronationDay: { nextAt: T + 54, cycleDays: 30 },
    hearthNight: { nextAt: T + 55, cycleDays: 30 },
    charterFair: { nextAt: T + 56, cycleDays: 30 },
    kiteFestival: { nextAt: T + 57 },
    honorsListDay: { nextAt: T + 58, intervalDays: 30, awardsTitles: false },
    auroraNight: { nextAt: T + 59, cycleDays: 30 },
    mootOpening: { nextAt: T + 60 },
    electionNight: { nextAt: T + 61 },
    exchangeBell: { nextAt: T + 62, cycleDays: 30 },
    grandRegatta: { nextAt: T + 63, intervalDays: 30, hostCity: 'Corvel Isles', holdsRegatta: false },
    charterDay: { nextAt: T + 64, cycleDays: 30 },
    fairWindBlessing: { nextAt: T + 65, cycleDays: 30 },
    dockStrikeRemembrance: { nextAt: T + 66, intervalDays: 30, holdsRemembrance: false },
    congressWeek: { nextAt: T + 67, intervalDays: 150, holdsCongress: false },
    examDay: { nextAt: T + 68, cycleDays: 30 },
    turbineDay: { nextAt: T + 69, cycleDays: 30, host: 'Shen Springs' },
    congressLanterns: { nextAt: T + 70, cycleDays: 150 },
    canalFestival: { nextAt: T + 71, intervalDays: 30, hostCity: 'Lanu Terraces', holdsFestival: false },
    quotaDay: { nextAt: T + 72, cycleDays: 30 },
    assemblyElectionDay: { nextAt: T + 73, cycleDays: 120 },
    clearing: { nextAt: T + 74, cycleDays: 30 },
    longLight: { nextAt: T + 75, cycleDays: 30 },
    greatPilgrimage: { nextAt: T + 76, cycleDays: 30 },
  });
  assert.deepEqual(rows.map(row => row.label), [
    'Congress Lanterns', 'Canal Festival', 'Quota Day',
    'Congress Week', 'Exam Day', 'Turbine Day',
    'Plan Day', 'Quota Rally', "Chairman's Birthday", "People's Congress",
    'Coronation Day', 'Hearth Night', 'Charter Fair', 'Kite Festival',
    'Assembly Election', 'Great Pilgrimage', 'Clearing', 'Long Light',
    'Opening of the Moot', 'Honors List Day', 'Aurora Night', 'Election Night',
    'Exchange Bell', 'Grand Regatta', 'Charter Day', 'Fair-Wind Blessing', 'Dock Strike remembrance',
  ]);
});

test('#1422: the government panel uses the helper; no new flag or migration', () => {
  const panel = read('app/government-panel.tsx');
  const helper = read('lib/government-deadlines.ts');
  assert.match(panel, /governmentDeadlineRows/);
  assert.match(panel, /#1422/);
  assert.doesNotMatch(helper, /HARIMU_GRAY|0131|GRAY 92/);
  assert.doesNotMatch(panel, /HARIMU_GRAY_PACK|0131/);
  assert.match(panel, /countdownDualTimeEnabled\(\)/);
});
