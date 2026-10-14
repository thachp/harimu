import test from 'node:test';
import assert from 'node:assert/strict';
import { draftNotableProfiles, draftNotableStatus } from '../lib/notable-drafts.ts';
import { notableProfiles, notableProfile } from '../lib/notable-profiles.ts';

test('draft Notables cover the seven non-playable nations and stay inactive', () => {
  assert.equal(draftNotableStatus, 'inactive');
  assert.deepEqual(Object.keys(draftNotableProfiles).sort(), ['confluence','fulmara','hoarvale','ilmar','meridian','varkand','veldwood']);
  const liveIds = new Set(Object.values(notableProfiles).map(profile=>profile.id));
  const ids = new Set(), names = new Set();
  for (const [nation, profiles] of Object.entries(draftNotableProfiles)) {
    assert.ok(profiles.length >= 3, nation);
    assert.equal(notableProfile(nation), null, `${nation} must not be live`);
    for (const profile of profiles) {
      assert.deepEqual(Object.keys(profile).sort(), ['id','introduction','name','persona','role']);
      assert.ok(profile.id.startsWith(`${nation}-`));
      assert.ok(!ids.has(profile.id) && !liveIds.has(profile.id)); ids.add(profile.id);
      assert.ok(!names.has(profile.name)); names.add(profile.name);
      assert.match(profile.introduction, /cannot|not public|changes nothing|not advice|no opinion|grants no|changes no/);
      assert.ok(profile.persona.length > 30 && profile.introduction.length <= 200, profile.id);
    }
  }
});
