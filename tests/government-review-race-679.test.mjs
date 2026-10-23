/** #679 (QA1 on #837): readGovernment must not return a review older than its own petition-days read. A concurrent latch that lands just before the
 *  days query runs leaves no unreviewed day, so the review the read returns has to be that latched one (the serial read order guarantees it). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';

test(`#679 ${backend}: a review latched just before the petition-days query is the one readGovernment returns`, async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('citizen', 'alice'); await r.db.prepare("UPDATE citizens SET nation_id='kindle'").run();
  r.setVerification('alice', { userId: 'alice', emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
  assert.equal((await r.call('citizen', 'alice', { action: 'government-petition', topic: 'work', requestId: randomUUID() })).status, 200);
  r.setNow(r.now + 86400000); // the petition's day is now complete and unreviewed
  const { readGovernment, latchGovernmentReviews } = await r.importModule('lib/government-state.ts');
  const now = Math.floor(r.now / 1000), real = r.db;
  let raced = false;
  const racing = new Proxy(real, { get(target, key) {
    if (key !== 'prepare') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
    return sql => {
      const statement = target.prepare(sql);
      if (!/SELECT DISTINCT p\.period_start FROM government_petitions/.test(sql)) return statement;
      return new Proxy(statement, { get(s, k) {
        const v = s[k]; if (typeof v !== 'function') return v;
        if (k === 'bind') return (...args) => { const bound = v.apply(s, args); return { ...bound, all: async () => { if (!raced) { raced = true; await latchGovernmentReviews(real, 'kindle', now); } return bound.all(); }, first: (...a) => bound.first(...a) }; };
        return v.bind(s);
      } });
    };
  } });
  const government = await readGovernment(racing, 'kindle', now, undefined, { readOnly: true });
  assert.ok(raced, 'the latch ran before the days query');
  const fresh = await readGovernment(real, 'kindle', now, undefined, { readOnly: true });
  assert.ok(fresh.review, 'the latch wrote a review');
  assert.deepEqual(government.review, fresh.review);
});
