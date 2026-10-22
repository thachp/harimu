import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dormancyStatuses as ST, welcomeBack as WB, jobReleased as JR, savingsShield as SS, WELCOME_BACK_TITLE as TITLE, dormancyCopy as C, dormancyStatusFor, welcomeBackFor, jobReleasedFor, DORMANCY_STATUS_KEYS, DORMANCY_NATIONS, DORMANCY_PLACEHOLDERS, DORMANCY_NAME_MAX, DORMANCY_NUMBER_MAX, DORMANCY_LABEL_MAX, DORMANCY_LINE_MAX } from '../lib/dormancy-copy.ts';

const labels=()=>[...ST.map(s=>s.label),TITLE];
const lineObjs=()=>[...ST.flatMap(s=>[s.when,...s.kept,...s.paused]),...WB.flatMap(w=>[w.greeting,w.news]),...JR.map(j=>j.line),SS];
const lines=()=>lineObjs().map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>t.replaceAll('{daysAway}','W'.repeat(DORMANCY_NAME_MAX)).replaceAll('{headlineCount}','9'.repeat(DORMANCY_NUMBER_MAX));
const noPh=t=>t.replace(/\{[^}]*\}/g,'');

test('shape: three statuses in docs order, a Welcome back frame and a job-released line for each MVP nation, and one shield line; every line proposal and distinct', () => {
  assert.deepEqual([...DORMANCY_STATUS_KEYS],['away','dormant','archived']); assert.deepEqual(ST.map(s=>s.key),[...DORMANCY_STATUS_KEYS]);
  assert.deepEqual(ST.map(s=>s.label),['Away','Dormant','Archived']); assert.equal(TITLE,'Welcome back');
  assert.deepEqual([...DORMANCY_NATIONS],['kindle','korund','aurelle']); assert.deepEqual(WB.map(w=>w.nationId),[...DORMANCY_NATIONS]); assert.deepEqual(JR.map(j=>j.nationId),[...DORMANCY_NATIONS]);
  for (const s of ST) { assert.equal(s.proposal,true); assert.equal(dormancyStatusFor(s.key),s); assert.ok(s.kept.length>=1&&s.paused.length>=1); }
  for (const w of WB) { assert.equal(w.proposal,true); assert.equal(welcomeBackFor(w.nationId),w); }
  for (const j of JR) { assert.equal(j.proposal,true); assert.equal(jobReleasedFor(j.nationId),j); }
  for (const l of lineObjs()) { assert.equal(l.proposal,true); assert.ok(l.text.trim().length>0); }
  assert.equal(C.proposal,true); assert.equal(dormancyStatusFor('nope'),undefined); assert.equal(new Set(all()).size,all().length);
});
test('limits: local caps 24 and 6, labels 40, lines 100, with {daysAway} filled to 24 and {headlineCount} to six characters', () => {
  assert.equal(DORMANCY_NAME_MAX,24); assert.equal(DORMANCY_NUMBER_MAX,6); assert.equal(DORMANCY_LABEL_MAX,40); assert.equal(DORMANCY_LINE_MAX,100);
  for (const t of labels()) assert.ok(fill(t).length<=DORMANCY_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=DORMANCY_LINE_MAX,`${t} (${fill(t).length})`);
});
test('placeholders: only {daysAway} and {headlineCount}, each used, and only in the Welcome back frames', () => {
  assert.deepEqual([...DORMANCY_PLACEHOLDERS],['{daysAway}','{headlineCount}']);
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(DORMANCY_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const w of WB) { assert.match(w.greeting.text,/\{daysAway\}/); assert.match(w.news.text,/\{headlineCount\}/); }
  for (const t of [...ST.flatMap(s=>[s.when,...s.kept,...s.paused]).map(l=>l.text),...JR.map(j=>j.line.text),SS.text]) assert.doesNotMatch(t,/\{/,t);
});
test('figures: only the docs\' 7, 30 and 180 real days, once each, in the status "when" lines; no amount, rate, cap or percent anywhere else', () => {
  assert.deepEqual(ST.map(s=>s.when.text),['Away begins after 7 real days offline.','Dormant begins after 30 real days offline.','Archived begins after 180 real days offline.']);
  const rest=all().filter(t=>!ST.some(s=>s.when.text===t));
  for (const t of rest) assert.doesNotMatch(noPh(t),/\d|%|percent|\b(one|two|three|four|five|six|seven|ten|twice|half|hundred|thousand)\b|\b(days?|weeks?|months?|years?)\b|\bcap\b|\brate\b|\bamount\b|\bmedian\b|\bwage\b/i,t);
  assert.match(SS.text,/Dormant Savings Shield helps protect small home-currency savings/);
});
test('each status says what is kept and what pauses, in the docs\' terms (§17.4)', () => {
  const s=Object.fromEntries(ST.map(x=>[x.key,x])); const j=x=>[...x.kept,...x.paused].map(l=>l.text).join(' ');
  assert.match(j(s.away),/job slot is held/); assert.match(j(s.away),/off conscription and quotas/);
  assert.match(j(s.dormant),/home and items are kept/); assert.match(j(s.dormant),/no upkeep is charged/); assert.match(j(s.dormant),/not counted in quorums or turnout/); assert.match(j(s.dormant),/job slot is released/);
  assert.match(j(s.archived),/sleeps in their home city/); assert.match(j(s.archived),/never deleted while your account exists/); assert.match(j(s.archived),/return instantly/); assert.match(j(s.archived),/Welcome back briefing/);
  assert.doesNotMatch(j(s.away),/released/);
});
test('never a penalty: no streak, loss, missed, guilt, pressure or consequence wording anywhere', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\bstreaks?\b|\blost\b|\bloss\w*|\bmiss\w*|missed out|penalt\w*|punish\w*|forfeit\w*|\bexpir\w*|\boverdue\b|\bbehind\b|\bguilt\w*|\bshame\w*|\bfailed?\b|\bfall(en)? behind\b|\bhurry\b|\bsoon\b|\bnow or\b|\bdon't\b|\bwaiting for you\b|\bwe (missed|need) you\b|\bdecay\w*|\bwither\w*|\bneglect\w*|\babandon\w*|!/i,t);
    assert.doesNotMatch(t,/\b(must|have to|need to|should|better)\b/i,t);
  }
  for (const t of all()) assert.doesNotMatch(t,/\b(staff|odds|chances?)\b/i,t); // ARC (#662): no staff, odds or chance wording
});
test('Welcome back frames: a plain civic voice for Kindle, State Media for Korund, the court and Court Gazette for Aurelle; none is badged, none speaks for an AI body or the Crown', () => {
  const w=Object.fromEntries(WB.map(x=>[x.nationId,x]));
  assert.equal(w.kindle.byline,null); assert.deepEqual(w.korund.byline,{name:'Korund State Media',proposal:false}); assert.deepEqual(w.aurelle.byline,{name:'Court Gazette',proposal:false});
  assert.match(w.korund.greeting.text,/^Korund State Media: Welcome back, citizen\./); assert.match(w.korund.news.text,/^Korund State Media: /);
  assert.match(w.aurelle.greeting.text,/^The court welcomes you back\./); assert.match(w.aurelle.news.text,/^Court Gazette: /);
  for (const x of WB) { assert.equal(x.aiBadge,false); assert.equal('aiBadge' in x.greeting,false); }
  for (const t of WB.flatMap(x=>[x.greeting.text,x.news.text])) assert.doesNotMatch(t,/^Be it known|By royal decree|\b(Crown|Monarch|Majesty|decree|Chairman|Presidium|Herald)\b|\bI am an AI\b|["“”]/i,t);
  assert.doesNotMatch(w.kindle.greeting.text+w.kindle.news.text,/State Media|Court|court|Crown|Chairman/);
});
test('job-released lines: one per nation, in its own words (job board, Labor Bureau, a guild or the chartered markets), each saying the slot was released and how to find work again', () => {
  const j=Object.fromEntries(JR.map(x=>[x.nationId,x.line.text]));
  assert.match(j.kindle,/job board/); assert.match(j.korund,/Labor Bureau/); assert.match(j.aurelle,/a guild or in the chartered markets/); assert.doesNotMatch(j.aurelle,/charter work/);
  for (const t of Object.values(j)) assert.match(t,/^Your job slot was released\. /);
  assert.equal(new Set(Object.values(j)).size,3);
  assert.doesNotMatch(j.kindle,/Labor Bureau|charter|court/i); assert.doesNotMatch(j.aurelle,/job board|Bureau/i);
});
test('no real-world names, no reward, badge, prize or XP wording, nothing on-chain, no persistence promised beyond the docs', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/reward|\bbadge|prize|\bXP\b|bonus|points?\b|Spark|score/i,t);
    assert.doesNotMatch(t,/Tessera|\bTSR\b|\bchain\b|NFT|token|wallet|\bland\b|\bdeed\b|\bTSR\b/i,t);
    assert.doesNotMatch(t,/\b(Earth|America|Europe|Russia|China|Soviet|Windsor)\b/,t);
    assert.doesNotMatch(t,/\b(forever|permanent\w*|always|guarantee\w*|promise\w*|safe\w*|backed up|saved)\b/i,t);
  }
});
test('no string here repeats a string from another lib module', () => {
  const others=readdirSync('lib').filter(f=>/\.ts$/.test(f)&&f!=='dormancy-copy.ts').map(f=>readFileSync(`lib/${f}`,'utf8')).join('\n');
  for (const t of all()) assert.ok(!others.includes(`'${t}'`)&&!others.includes(`"${t}"`)&&!others.includes(`\`${t}\``), t);
});
test('the header names no other lib module path', () => {
  const head=readFileSync('lib/dormancy-copy.ts','utf8').split('*/')[0];
  assert.doesNotMatch(head,/\blib\/|\.ts\b|app\/|components\//);
});
test('unwired: nothing in app/, components/ or lib/ imports dormancy-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('dormancy-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/dormancy-copy/, f);
});
