import test from 'node:test';
import assert from 'node:assert/strict';
import { additionalNotableProfiles, proposedNationTopics, notableRosterStatus } from '../lib/notable-roster.ts';
import { notableProfiles, notableProfile, notableTopics } from '../lib/notable-profiles.ts';

test('additional Notables are active (#151) and do not replace the primary profile', () => {
  assert.equal(notableRosterStatus, 'active');
  assert.deepEqual(Object.keys(additionalNotableProfiles).sort(), ['aurelle','kindle','korund']);
  const ids = new Set(Object.values(notableProfiles).map(profile=>profile.id));
  for (const [nation, profiles] of Object.entries(additionalNotableProfiles)) {
    assert.ok(profiles.length >= 2 && profiles.length <= 4, nation);
    assert.equal(notableProfile(nation).id, notableProfiles[nation].id);
    const roles = new Set([notableProfiles[nation].role]);
    for (const profile of profiles) {
      assert.deepEqual(Object.keys(profile).sort(), ['id','introduction','name','persona','role']);
      assert.ok(profile.id.startsWith(`${nation}-`) && !ids.has(profile.id)); ids.add(profile.id);
      assert.ok(!roles.has(profile.role)); roles.add(profile.role);
      assert.match(profile.introduction, /cannot|not public|not advice|grants no/);
    }
  }
});
test('proposed topics follow notableTopics shape and do not collide', () => {
  for (const topics of Object.values(proposedNationTopics)) for (const [key, topic] of Object.entries(topics)) {
    assert.ok(!Object.hasOwn(notableTopics, key));
    assert.deepEqual(Object.keys(topic).sort(), ['authored','label','question']);
  }
  assert.doesNotMatch(JSON.stringify(proposedNationTopics), /Notable rank|→ Notable/);
});
