import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { rankLadder as RL, rankFor, rankChrome as C, promotionNotice as PN, promotionGazette as PG, RANK_GAZETTE_BYLINE as BY, RANK_KEYS, RANK_NAME_MAX, RANK_LABEL_MAX, RANK_LINE_MAX, RANK_HEADLINE_MAX, RANK_BODY_MAX, RANK_PLACEHOLDERS } from '../lib/aurelle-rank-copy.ts';
import { aurelleGazette } from '../lib/press-templates.ts';

const labels=()=>[...RL.map(r=>r.label),C.title];
const headlines=()=>PG.map(g=>g.headline);
const lineObjs=()=>[...RL.map(r=>r.what),C.howEarned,C.noJurisdiction,C.aboveTheLadder,...PN];
const lines=()=>lineObjs().map(l=>l.text);
const bodies=()=>PG.map(g=>g.body);
const all=()=>[...labels(),...headlines(),...lines(),...bodies()];
const fill=t=>RANK_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(RANK_NAME_MAX)),t);

test('shape: four ranks in docs order, a "how earned" line, a no-jurisdiction line, three promotion notices and two gazette reports; every line proposal and distinct', () => {
  assert.deepEqual(RL.map(r=>r.label),['Commoner','Freeholder','Knight','Baron']); assert.deepEqual(RL.map(r=>r.key),[...RANK_KEYS]);
  for (const r of RL) { assert.equal(r.proposal,true); assert.equal(rankFor(r.key),r); assert.ok(r.what.text.startsWith(`${r.label}:`),r.key); }
  for (const o of [C]) assert.equal(o.proposal,true);
  for (const l of lineObjs()) { assert.equal(l.proposal,true); assert.ok(l.text.trim().length>0); }
  for (const g of PG) { assert.equal(g.proposal,true); assert.equal(g.aiBadge,false); }
  assert.equal(PN.length,3); assert.equal(PG.length,2); assert.equal(new Set(all()).size,all().length);
});
test('limits: local name cap 24, labels 40, lines 100, gazette headlines 70, bodies 120, with {rank} and {name} filled to 24 characters', () => {
  assert.equal(RANK_NAME_MAX,24); assert.equal(RANK_LABEL_MAX,40); assert.equal(RANK_LINE_MAX,100); assert.equal(RANK_HEADLINE_MAX,70); assert.equal(RANK_BODY_MAX,120);
  for (const t of labels()) assert.ok(fill(t).length<=RANK_LABEL_MAX, `${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=RANK_LINE_MAX, `${t} (${fill(t).length})`);
  for (const t of headlines()) assert.ok(fill(t).length<=RANK_HEADLINE_MAX, `${t} (${fill(t).length})`);
  for (const t of bodies()) assert.ok(fill(t).length<=RANK_BODY_MAX, `${t} (${fill(t).length})`);
});
test('placeholders: only {rank} and {name}; every notice uses {rank}; the gazette uses both; ladder lines use none', () => {
  assert.deepEqual([...RANK_PLACEHOLDERS],['{rank}','{name}']);
  for (const m of all().join(' ').matchAll(/\{[^}]+\}/g)) assert.ok(RANK_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const l of PN) assert.match(l.text,/\{rank\}/);
  for (const g of PG) { assert.match(g.headline+g.body,/\{rank\}/); assert.match(g.headline+g.body,/\{name\}/); }
  for (const t of [...RL.map(r=>r.label),...RL.map(r=>r.what.text),C.title,C.howEarned.text,C.noJurisdiction.text,C.aboveTheLadder.text]) assert.doesNotMatch(t,/\{/,t);
  for (const r of RL) for (const t of [r.label,r.what.text]) assert.ok(!/\{/.test(t));
});
test('the ladder matches the docs: Commoner, Freeholder, Knight, Baron; Freeholder, Knight and Baron have an estate and no jurisdiction; Counts and Dukes are AI lords who govern fiefs', () => {
  for (const k of ['freeholder','knight','baron']) assert.match(rankFor(k).what.text,/with an estate and no jurisdiction\.$/);
  assert.doesNotMatch(rankFor('commoner').what.text,/estate|jurisdiction/);
  assert.match(C.howEarned.text,/Royal Favor, service and victories/); assert.match(C.noJurisdiction.text,/an estate, not authority over others/);
  assert.match(C.aboveTheLadder.text,/Counts and Dukes are AI lords who govern fiefs/); assert.match(C.aboveTheLadder.text,/Citizens hold social ranks only/);
});
test('no threshold, cost, figure or timing, no Royal Favor amount, and nothing about spending Favor, estates income or mechanics', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\d|%|\b(one|two|three|four|five|six|ten|hundred|thousand|half|twice)\b/i,t);
    assert.doesNotMatch(t,/\b(threshold|cost|price|pay|fee|tax|tribute|rent|income|spend|spent|buy|sell|days?|weeks?|hours?|months?|seasons?|soon|later|when|after|before|until)\b/i,t);
  }
});
test('no claim that a rank can be lost or is kept for good; no demotion, succession, claimant or Monarch wording', () => {
  for (const t of all()) assert.doesNotMatch(t,/\b(lose|lost|losing|revoke\w*|strip\w*|demot\w*|forever|permanent\w*|for life|always|never|guarantee\w*|inherit\w*|heir\w*|succe\w*|claimant\w*|Monarch|Duke of|Count of)\b/i,t.replace('Counts and Dukes are AI lords who govern fiefs.',''));
});
test('byline and badge: the gazette byline is the Court Gazette byline from the press templates; only that report is bylined; nothing carries the AI badge or the Crown voice', () => {
  assert.deepEqual(BY,aurelleGazette.byline);
  for (const g of PG) { assert.equal(g.aiBadge,false); assert.equal('byline' in g,false); }
  for (const t of all()) assert.doesNotMatch(t,/^Be it known|By royal decree|\bby decree\b|\bI am an AI\b|["“”]/i,t);
  for (const o of [C]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const l of [...PN]) assert.equal('aiBadge' in l,false);
});
test('the promotion notice is formal and short and does not speak for the Crown; the gazette is ornate and reports, naming no house, noble or claimant', () => {
  for (const l of PN) assert.doesNotMatch(l.text,/\b(Crown|Monarch|Majesty|decree|royal|realm|Herald)\b/i,l.text);
  for (const t of [...bodies(),...PG.map(g=>g.headline)]) assert.doesNotMatch(t,/\b(House|Highspire|Sieran|Vale|Duke|Count|Baroness)\b/,t);
  assert.match(PG[0].body,/The court records/); assert.match(PG[1].body,/Word from the court/);
});
test('calm and neutral: no urgency, pressure or flattery, no real-world peerage, title of honor or dated history', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\b(hurry|urgent|last chance|act now|don't miss|must|congratulations?|well done|glorious|honou?r\w*|proud|Sir|Lord|Lady|Dame|knighted|medieval|Europe|England|Britain|feudal\w*)\b|!/i,t);
  }
  assert.doesNotMatch(all().join(' '),/\b(Earth|real world|Tessera|chain|NFT|token|wallet|Spark)\b/i);
});
test('no string here repeats a string from another lib module', () => {
  const others=readdirSync('lib').filter(f=>/\.ts$/.test(f)&&f!=='aurelle-rank-copy.ts').map(f=>readFileSync(`lib/${f}`,'utf8')).join('\n');
  for (const t of all()) assert.ok(!others.includes(`'${t}'`)&&!others.includes(`"${t}"`)&&!others.includes(`\`${t}\``), t);
  assert.ok(others.includes('Freeholder, Knight and Baron are open to citizens, with estates but no jurisdiction'),'the first-week line this module must not repeat is still there');
});
test('the header names no other lib module path', () => {
  const head=readFileSync('lib/aurelle-rank-copy.ts','utf8').split('*/')[0];
  assert.doesNotMatch(head,/\blib\/|\.ts\b|app\/|components\//);
});
test('unwired: nothing in app/, components/ or lib/ imports aurelle-rank-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('aurelle-rank-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/aurelle-rank-copy/, f);
});
