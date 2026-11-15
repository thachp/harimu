/** #1426: civic government deadlines list non-holiday civic clocks already on the government read (docs §23.1, §7). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { governmentDeadlineRows } from '../lib/government-deadlines.ts';

const T = 1_700_000_000_000;

const party = { pillars: ['general_secretary', 'president', 'premier', 'assembly_chair'], termLimitCongresses: 2, nextCongressAt: T + 100, congressIntervalDays: 150 };
const partyState = { paramountLeaderRoles: ['general_secretary', 'state_chair'], standingCommitteeSeats: 7, nextCongressAt: T + 101, congressIntervalDays: 150, termLimitsSuspendable: true, suspendSupermajority: '2/3' };
const assemblyElection = { cycleStartedAt: T, nextElectionAt: T + 102, intervalDays: 150, ballotOpen: false, leadershipHeedsResult: false };
const grandCouncil = {
  councilOfTenNextElectionAt: T + 103, councilOfTenTermDays: 30,
  lodestarNextElectionAt: T + 104, lodestarTermDays: 90, lodestarConsecutiveReelection: false,
  tribuneSessionEndsAt: T + 105, tribuneVetoesPerSession: 1,
};
const crownCalendar = { reignStartedAt: T, nextGreatCouncilWindowAt: T + 106, reignDisplayDays: 30 };
const electionClock = { nextBallotNightAt: T + 107, termEndsAt: T + 108, termDays: 120, maxConsecutiveTerms: 2 };

const civicLabels = [
  'Party Congress',
  "People's Assembly election",
  'Council of Ten election',
  'Lodestar election',
  'Tribune session',
  'Great Council window',
  'Presidential term end',
];

const presentCases = [
  ['Party Congress', { party }, [{ label: 'Party Congress', at: T + 100 }]],
  ['Party Congress from partyState', { partyState }, [{ label: 'Party Congress', at: T + 101 }]],
  ["People's Assembly election", { assemblyElection }, [{ label: "People's Assembly election", at: T + 102 }]],
  ['Council of Ten election', { grandCouncil }, [
    { label: 'Council of Ten election', at: T + 103 },
    { label: 'Lodestar election', at: T + 104 },
    { label: 'Tribune session', at: T + 105 },
  ]],
  ['Great Council window', { crownCalendar }, [{ label: 'Great Council window', at: T + 106 }]],
  ['Presidential term end', { electionClock }, [
    { label: 'Ballot Night', at: T + 107 },
    { label: 'Presidential term end', at: T + 108 },
  ]],
];

for (const [name, snapshot, expected] of presentCases) {
  test(`#1426: ${name} is listed when its snapshot key is present`, () => {
    assert.deepEqual(governmentDeadlineRows(snapshot), expected);
  });
}

test('#1426: every new civic clock is listed from existing snapshot keys, once, with documented names', () => {
  const rows = governmentDeadlineRows({ party, partyState, assemblyElection, grandCouncil, crownCalendar, electionClock });
  assert.deepEqual(rows, [
    { label: 'Ballot Night', at: T + 107 },
    { label: 'Party Congress', at: T + 100 },
    { label: "People's Assembly election", at: T + 102 },
    { label: 'Council of Ten election', at: T + 103 },
    { label: 'Lodestar election', at: T + 104 },
    { label: 'Tribune session', at: T + 105 },
    { label: 'Great Council window', at: T + 106 },
    { label: 'Presidential term end', at: T + 108 },
  ]);
  for (const label of civicLabels) {
    assert.equal(rows.filter(row => row.label === label).length, 1, label);
  }
});

test('#1426: Party Congress from party and partyState is listed once, using the first key', () => {
  const rows = governmentDeadlineRows({ party, partyState });
  assert.deepEqual(rows, [{ label: 'Party Congress', at: T + 100 }]);
  assert.equal(rows.filter(row => row.label === 'Party Congress').length, 1);
});

test('#1426: missing civic keys show no civic rows, and a holiday-only snapshot stays holiday-only', () => {
  assert.deepEqual(governmentDeadlineRows({}), []);
  const holidays = governmentDeadlineRows({
    foundersForgeDay: { nextAt: T + 3, intervalDays: 30, opensFair: false },
    marketBell: { nextAt: T + 4, cycleDays: 30 },
  });
  assert.deepEqual(holidays, [
    { label: "Founders' Forge Day", at: T + 3 },
    { label: 'Market Bell', at: T + 4 },
  ]);
  for (const label of civicLabels) {
    assert.equal(holidays.some(row => row.label === label), false, label);
    assert.equal(governmentDeadlineRows({}).some(row => row.label === label), false, label);
  }
});

test('#1426: each civic row is absent when only a different civic key is present', () => {
  const onlyParty = governmentDeadlineRows({ party });
  assert.deepEqual(onlyParty, [{ label: 'Party Congress', at: T + 100 }]);
  for (const label of civicLabels.filter(name => name !== 'Party Congress')) {
    assert.equal(onlyParty.some(row => row.label === label), false, label);
  }
  const onlyWindow = governmentDeadlineRows({ crownCalendar });
  assert.deepEqual(onlyWindow, [{ label: 'Great Council window', at: T + 106 }]);
  for (const label of civicLabels.filter(name => name !== 'Great Council window')) {
    assert.equal(onlyWindow.some(row => row.label === label), false, label);
  }
});

test('#1426: Varkand Red Alert behavior is unchanged — Plebiscite and directorate Rotation Day stay, canceled celebrations stay omitted', () => {
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
