import test from 'node:test';
import assert from 'node:assert/strict';
import { draftLeaderPersonas, draftLeaderStatus, aurelleClaimantHouses } from '../lib/leader-drafts.ts';
import { leaderPersonas } from '../lib/leader-personas.ts';

const offices={confluence:['General Secretary','President','Premier',"Chair of the People's Assembly"],meridian:['Paramount Leader'],ilmar:['Supreme Oracle'],hoarvale:['Sovereign','Prime Minister'],varkand:['Chair of the Directorate'],veldwood:['Council Speaker'],fulmara:['Lodestar','Tribune of the Docks']};
test('draft leaders cover seven nations with canon offices and stay inactive', () => {
  assert.equal(draftLeaderStatus, 'inactive');
  assert.deepEqual(Object.keys(draftLeaderPersonas).sort(), Object.keys(offices).sort());
  for (const nation of Object.keys(offices)) assert.equal(Object.hasOwn(leaderPersonas, nation), false);
  const names = new Set(Object.values(leaderPersonas).map(persona=>persona.name));
  for (const [nation, personas] of Object.entries(draftLeaderPersonas)) {
    assert.deepEqual(personas.map(persona=>persona.office), offices[nation]);
    for (const persona of personas) {
      assert.deepEqual(Object.keys(persona).sort(), ['affiliation','biography','color','name','office']);
      assert.match(persona.color, /^#[0-9a-f]{6}$/);
      assert.ok(!names.has(persona.name)); names.add(persona.name);
    }
  }
});
test('Aurelle has at least two claimant houses distinct from the reigning house', () => {
  assert.ok(aurelleClaimantHouses.length >= 2);
  for (const house of aurelleClaimantHouses) {
    assert.notEqual(house.house, leaderPersonas.aurelle.affiliation);
    assert.ok(house.claim && house.promise && /^#[0-9a-f]{6}$/.test(house.color));
  }
});
