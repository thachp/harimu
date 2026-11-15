/** #1432: civic deadlines list Hoarvale Moot term and investiture deadline, converting snapshot seconds to ms instants (docs §7.7, §23.1). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { INVESTITURE_DEADLINE_SECONDS, MOOT_TERM_SECONDS, hoarvaleMoot } from '../lib/government.ts';
import { governmentDeadlineRows } from '../lib/government-deadlines.ts';

// Seconds fixture already used by tests/zzzzzzzzzzzzz-world-atlas-reads-1193.test.mjs.
const electedAt = 1_700_000_000;
const moot = hoarvaleMoot(electedAt, null, electedAt);
const dissolvesByMs = moot.dissolvesBy * 1000;
const investitureDeadlineMs = moot.investitureDeadline * 1000;
const mootLabels = ['Moot term', 'Investiture deadline'];

test('#1432: producers still expose integer seconds, and the 1096 cadence is unchanged', () => {
  assert.equal(MOOT_TERM_SECONDS, 120 * 86_400);
  assert.equal(INVESTITURE_DEADLINE_SECONDS, 7 * 86_400);
  assert.equal(moot.dissolvesBy, electedAt + MOOT_TERM_SECONDS);
  assert.equal(moot.investitureDeadline, electedAt + INVESTITURE_DEADLINE_SECONDS);
  assert.ok(Number.isSafeInteger(moot.dissolvesBy));
  assert.ok(Number.isSafeInteger(moot.investitureDeadline));
  assert.equal(new Date(moot.dissolvesBy).getUTCFullYear(), 1970);
  assert.equal(new Date(moot.investitureDeadline).getUTCFullYear(), 1970);
});

test('#1432: seconds in become millisecond instants, with no double conversion, in the current game era', () => {
  const rows = governmentDeadlineRows({ moot });
  assert.deepEqual(rows, [
    { label: 'Moot term', at: dissolvesByMs },
    { label: 'Investiture deadline', at: investitureDeadlineMs },
  ]);
  const term = rows.find(row => row.label === 'Moot term');
  const investiture = rows.find(row => row.label === 'Investiture deadline');
  assert.equal(term.at, moot.dissolvesBy * 1000);
  assert.equal(investiture.at, moot.investitureDeadline * 1000);
  assert.notEqual(term.at, moot.dissolvesBy, 'Moot term is not left as seconds');
  assert.notEqual(investiture.at, moot.investitureDeadline, 'Investiture deadline is not left as seconds');
  assert.notEqual(term.at, moot.dissolvesBy * 1000 * 1000, 'Moot term is not converted twice');
  assert.notEqual(investiture.at, moot.investitureDeadline * 1000 * 1000, 'Investiture deadline is not converted twice');
  assert.notEqual(term.at, investitureDeadlineMs, 'Moot term is not the investiture field');
  assert.notEqual(investiture.at, dissolvesByMs, 'Investiture deadline is not the term field');
  assert.notEqual(new Date(term.at).getUTCFullYear(), 1970);
  assert.notEqual(new Date(investiture.at).getUTCFullYear(), 1970);
  assert.equal(new Date(term.at).getTime(), dissolvesByMs);
  assert.equal(new Date(investiture.at).getTime(), investitureDeadlineMs);
});

test('#1432: missing moot or a missing field shows no row for that clock', () => {
  assert.deepEqual(governmentDeadlineRows({}), []);
  for (const label of mootLabels) {
    assert.equal(governmentDeadlineRows({}).some(row => row.label === label), false, label);
  }
  const onlyTerm = governmentDeadlineRows({ moot: { electedAt, dissolvesBy: moot.dissolvesBy, primeMinisterInvestedAt: null, reservePowersAvailable: false } });
  assert.deepEqual(onlyTerm, [{ label: 'Moot term', at: dissolvesByMs }]);
  assert.equal(onlyTerm.some(row => row.label === 'Investiture deadline'), false);
  const onlyInvestiture = governmentDeadlineRows({ moot: { electedAt, primeMinisterInvestedAt: null, investitureDeadline: moot.investitureDeadline, reservePowersAvailable: false } });
  assert.deepEqual(onlyInvestiture, [{ label: 'Investiture deadline', at: investitureDeadlineMs }]);
  assert.equal(onlyInvestiture.some(row => row.label === 'Moot term'), false);
});

test('#1432: Opening of the Moot and Election Night stay millisecond instants; moot clocks append', () => {
  const T = 1_700_000_000_000;
  const rows = governmentDeadlineRows({
    mootOpening: { nextAt: T + 60 },
    electionNight: { nextAt: T + 61 },
    moot,
  });
  assert.deepEqual(rows, [
    { label: 'Opening of the Moot', at: T + 60 },
    { label: 'Election Night', at: T + 61 },
    { label: 'Moot term', at: dissolvesByMs },
    { label: 'Investiture deadline', at: investitureDeadlineMs },
  ]);
});
