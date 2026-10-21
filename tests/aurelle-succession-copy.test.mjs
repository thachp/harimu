import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { aurelleSuccessionCopy as SC, mourning as MO, leaderPanel as LP, citizenExplainer as CE, successionStage, SUCCESSION_STAGES, SUCCESSION_PLACEHOLDERS, SUCCESSION_NAME_MAX, SUCCESSION_LABEL_MAX, SUCCESSION_HEADLINE_MAX, SUCCESSION_BODY_MAX, SUCCESSION_GAZETTE_BYLINE } from '../lib/aurelle-succession-copy.ts';

const items=()=>SC.flatMap(s=>s.gazette);
const lines=()=>[MO.text,LP.noHeir.text,CE.hereditary.text,CE.rising.text];
const all=()=>[...items().flatMap(i=>[i.headline,i.body]),LP.heirLabel,...lines()];
const fill=t=>SUCCESSION_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(SUCCESSION_NAME_MAX)),t);
const byId=id=>items().find(i=>i.id===id);

test('shape: six stages in order, every item proposal with a unique id and a boolean badge, canon byline', () => {
  assert.deepEqual(SC.map(s=>s.stage),[...SUCCESSION_STAGES]);
  assert.deepEqual([...SUCCESSION_STAGES],['heirs-naming','illness','accession-death','accession-abdication','fallback-seniority','fallback-great-council']);
  assert.deepEqual(SUCCESSION_GAZETTE_BYLINE,{name:'Court Gazette',proposal:false});
  const ids=new Set();
  for (const s of SC) { assert.equal(s.proposal,true); assert.equal(successionStage(s.stage),s); assert.ok(s.gazette.length>=1&&s.gazette.length<=2,s.stage);
    for (const i of s.gazette) { assert.equal(i.proposal,true); assert.equal(typeof i.aiBadge,'boolean'); assert.ok(!ids.has(i.id),i.id); ids.add(i.id); } }
  for (const o of [LP,CE]) assert.equal(o.proposal,true);
  for (const l of [MO,LP.noHeir,CE.hereditary,CE.rising]) assert.equal(l.proposal,true);
  assert.equal(successionStage('nope'),undefined); assert.equal(new Set(all()).size,all().length);
});
test('limits: local name cap 24, labels 40, headlines 70, bodies and lines 140, with every placeholder filled to 24', () => {
  assert.equal(SUCCESSION_NAME_MAX,24); assert.equal(SUCCESSION_LABEL_MAX,40); assert.equal(SUCCESSION_HEADLINE_MAX,70); assert.equal(SUCCESSION_BODY_MAX,140);
  for (const i of items()) { assert.ok(fill(i.headline).length<=SUCCESSION_HEADLINE_MAX,i.headline); assert.ok(fill(i.body).length<=SUCCESSION_BODY_MAX,`${i.body} (${fill(i.body).length})`); }
  assert.ok(fill(LP.heirLabel).length<=SUCCESSION_LABEL_MAX,LP.heirLabel);
  for (const t of lines()) assert.ok(fill(t).length<=SUCCESSION_BODY_MAX,t);
});
test('placeholders: only {monarch}, {heir} and {house}, each used, and none in a headline', () => {
  assert.deepEqual([...SUCCESSION_PLACEHOLDERS],['{monarch}','{heir}','{house}']);
  const t=all().join(' '); for (const m of t.matchAll(/\{[^}]*\}/g)) assert.ok(SUCCESSION_PLACEHOLDERS.includes(m[0]),m[0]);
  for (const p of SUCCESSION_PLACEHOLDERS) assert.ok(t.includes(p),p);
  for (const i of items()) assert.doesNotMatch(i.headline,/\{/,i.headline);
  assert.match(LP.heirLabel,/^Heir apparent: \{heir\}$/); assert.doesNotMatch(LP.noHeir.text,/\{/);
  for (const l of [CE.hereditary.text,CE.rising.text]) assert.doesNotMatch(l,/\{/);
});
test('no figures, timing, medical detail, cause of death or mourning length: no digits, number words, durations, illness names or injury', () => {
  for (const t of all()) { assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|\b(one|two|three|four|five|six|seven|ten|twice|half|hundred|thousand)\b|\b(hours?|days?|weeks?|months?|years?|decades?|soon|within)\b/i,t);
    assert.doesNotMatch(t,/\b(fever|cancer|plague|poison\w*|stroke|heart|blood|wound\w*|dying|murder\w*|assassin\w*|cough\w*|pain|fragile|frail|doctor\w*|physician\w*|medicine|dead body|funeral|buried|burial|tomb)\b/i,t); }
});
test('AI badge (#381 / §23.2): the Heir\'s Naming, both accession proclamations and the Great Council\'s election are badged; Gazette reports and system lines are not', () => {
  for (const id of ['heirs-naming-proclamation','death-accession','abdication-accession','council-elects']) assert.equal(byId(id).aiBadge,true,id);
  for (const id of ['illness-first','illness-worse','death-report','seniority-report','council-convenes']) assert.equal(byId(id).aiBadge,false,id);
  for (const i of items()) { if (/^Be it known|^By royal decree|^The Great Council declares/.test(i.body)) assert.equal(i.aiBadge,true,i.id); else assert.equal(i.aiBadge,false,i.id); }
  for (const o of [MO,LP,CE]) assert.equal('aiBadge' in o,false);
  for (const i of items()) assert.doesNotMatch(i.body,/\bI am an AI\b|["“”]/,i.id);
  for (const i of items().filter(x=>!x.aiBadge)) assert.match(i.body,/^The Court Gazette reports/,i.id);
});
test('docs facts: the Monarch names the heir, then seniority, then the Great Council elects a new house; citizens change the crown only through a Rising', () => {
  assert.match(byId('heirs-naming-proclamation').body,/names \{heir\} of \{house\} as heir/);
  assert.match(byId('seniority-report').body,/no heir was named/); assert.match(byId('seniority-report').body,/seniority/);
  assert.match(byId('council-convenes').body,/no eligible heir remains/); assert.match(byId('council-convenes').body,/Great Council of lords convenes to elect a new house/);
  assert.match(byId('council-elects').body,/^The Great Council declares: \{house\} is elected/);
  assert.match(byId('death-accession').body,/takes the Sky Throne on the passing of \{monarch\}/); assert.match(byId('abdication-accession').body,/lays down the crown/);
  assert.match(CE.hereditary.text,/heredity among the AI of the Royal House/); assert.match(CE.rising.text,/only through a Rising behind a claimant/);
  assert.equal(LP.noHeir.text,'No heir is named.'); assert.match(MO.text,/mourning for \{monarch\}/);
});
test('the Great Council is the last resort, not the first: the seniority line never mentions it, and no line says an heir is guaranteed', () => {
  assert.doesNotMatch(byId('seniority-report').body,/Council/);
  for (const t of all()) assert.doesNotMatch(t,/\b(guarantee\w*|certain\w*|always|forever|inevitabl\w*|cannot fail|rightful)\b/i,t);
});
test('citizen explainer is plain: no Rising promise of success, no pledge threshold, no pressure to rebel', () => {
  for (const t of [CE.hereditary.text,CE.rising.text]) assert.doesNotMatch(t,/\b(pledge\w*|threshold|succeed\w*|win|overthrow|topple|rebel\w*|join|revolt\w*|rise up|must|should)\b/i,t);
});
test('no real-world royal reference, no reward, badge, prize or XP wording, nothing on-chain', () => {
  for (const t of all()) { assert.doesNotMatch(t,/\b(Saudi|Thai\w*|Windsor|Elizabeth|Charles|Queen Victoria|Habsburg|Tudor|Britain|British|England|Japan\w*|Versailles|Louis)\b/,t);
    assert.doesNotMatch(t,/reward|\bbadge|prize|\bXP\b|bonus|points?\b|Spark|score/i,t); assert.doesNotMatch(t,/Tessera|\bTSR\b|\bchain\b|NFT|token|wallet|\bland\b|\bdeed\b/i,t); }
});
test('Aurelle voice: the Gazette reports and the throne proclaims; no other nation, no State Media, no commoner address', () => {
  for (const t of all()) { assert.doesNotMatch(t,/Kindle|Korund|Varkand|Meridian|Ilmar|Fulmara|Hoarvale|Confluence|State Media|Wire Service|Presidium|Chairman|comrade/i,t); }
  assert.match(byId('heirs-naming-proclamation').body,/Sky Throne/);
});
test('no string here repeats a string from another lib module', () => {
  const others=readdirSync('lib').filter(f=>/\.ts$/.test(f)&&f!=='aurelle-succession-copy.ts').map(f=>readFileSync(`lib/${f}`,'utf8')).join('\n');
  for (const t of all()) assert.ok(!others.includes(`'${t}'`)&&!others.includes(`"${t}"`)&&!others.includes(`\`${t}\``),t);
});
test('the header names no other lib module path', () => {
  const head=readFileSync('lib/aurelle-succession-copy.ts','utf8').split('*/')[0];
  assert.doesNotMatch(head,/\blib\/|\.ts\b|app\/|components\//);
});
test('unwired: nothing in app/, components/ or lib/ imports aurelle-succession-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('aurelle-succession-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/aurelle-succession-copy/,f);
});
