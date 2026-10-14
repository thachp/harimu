import test from 'node:test';
import assert from 'node:assert/strict';
import { nationNotableTopics, nationTopicsStatus } from '../lib/nation-notable-topics.ts';
import { proposedNationTopics } from '../lib/notable-roster.ts';
import { notableTopics, validNotableCommand } from '../lib/notable-profiles.ts';

const nations = ['aurelle','confluence','fulmara','hoarvale','ilmar','kindle','korund','meridian','varkand','veldwood'];

test('every nation has 2–3 well-formed, public-facts topics', () => {
  assert.equal(nationTopicsStatus, 'inactive');
  assert.deepEqual(Object.keys(nationNotableTopics).sort(), nations);
  for (const [nation, topics] of Object.entries(nationNotableTopics)) {
    const entries = Object.entries(topics);
    assert.ok(entries.length >= 2 && entries.length <= 3, nation);
    const labels = new Set();
    for (const [key, topic] of entries) {
      assert.match(key, /^[a-z]+(-[a-z]+)*$/);
      assert.ok(!Object.hasOwn(notableTopics, key), key);
      assert.deepEqual(Object.keys(topic).sort(), ['authored','label','question']);
      assert.ok(topic.question.endsWith('?'));
      assert.ok(!labels.has(topic.label)); labels.add(topic.label);
      assert.match(topic.authored, /publish|public/i, `${nation}.${key} cites public facts`);
      assert.match(topic.authored, /cannot|not public|not advice|no conversation can|grants no|nobody can/i, `${nation}.${key} states a limit`);
      assert.doesNotMatch(topic.authored, /\d/);
    }
  }
});

test('topics stay inactive and respect canon', () => {
  const key = Object.keys(nationNotableTopics.korund)[0];
  assert.equal(validNotableCommand({requestId:'00000000-0000-4000-8000-000000000000',notableId:'x',topic:key}), false);
  const text = JSON.stringify(nationNotableTopics);
  assert.doesNotMatch(text, /Notable rank|→ Notable/);
  assert.match(text, /Emberwarden/);
  for (const [nation, topics] of Object.entries(proposedNationTopics))
    for (const [key, topic] of Object.entries(topics)) assert.deepEqual(nationNotableTopics[nation][key], topic);
});
