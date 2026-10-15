import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress, korundStateMedia, aurelleGazette } from '../lib/press-templates.ts';

// lib/diplomacy-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/diplomacy-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'diplomacy-copy-')),'diplomacy-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const D = await import(pathToFileURL(out).href);
const { foreignAffairsPanel:P, treatyKinds:K, treatyStatusLines:S, brokenPactLine, ratificationNews:R, ratificationHeadlines:H, ratificationFor, TREATY_STATUSES, RATIFICATION_KEYS, DIPLOMACY_PLACEHOLDERS, DIPLOMACY_NAME_MAX, DIPLOMACY_LABEL_MAX, DIPLOMACY_BODY_MAX, DIPLOMACY_BYLINES } = D;

const statusLines=()=>TREATY_STATUSES.flatMap(s=>S[s].map(l=>l.text));
const bodies=()=>[...statusLines(),brokenPactLine.text,...R.map(x=>x.body),...Object.values(K).map(k=>k.effect.text),P.aiNote.text];
const heads=()=>[P.header,P.emptyState,...Object.values(H)];
const all=()=>[...heads(),...bodies(),...Object.values(K).map(k=>k.name)];
const fill=t=>DIPLOMACY_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(DIPLOMACY_NAME_MAX)),t);
const docFigures=t=>t.replaceAll('two-thirds','').replaceAll('simple majority','');

test('shared name cap is re-exported from the coup module; limits are 40/140', () => {
  assert.equal(DIPLOMACY_NAME_MAX,COUP_NAME_MAX); assert.equal(DIPLOMACY_NAME_MAX,24);
  assert.equal(DIPLOMACY_LABEL_MAX,40); assert.equal(DIPLOMACY_BODY_MAX,140);
});
test('shape: five statuses with 2 variants, two treaty kinds, four ratification keys, everything proposal', () => {
  assert.deepEqual(Object.keys(S).sort(),[...TREATY_STATUSES].sort()); assert.deepEqual(TREATY_STATUSES,['proposed','ratified','in-force','expired','broken']);
  for (const s of TREATY_STATUSES) { assert.equal(S[s].length,2,s); for (const l of S[s]) assert.equal(l.proposal,true); }
  assert.deepEqual(Object.keys(K).sort(),['non-aggression','trade']); for (const k of Object.values(K)) { assert.equal(k.effect.proposal,true); assert.ok(k.name); }
  assert.equal(brokenPactLine.proposal,true); assert.equal(P.proposal,true); assert.equal(P.aiNote.proposal,true);
  assert.deepEqual(R.map(x=>x.key),[...RATIFICATION_KEYS]); assert.deepEqual(Object.keys(H).sort(),[...RATIFICATION_KEYS].sort());
  for (const x of R) { assert.equal(x.proposal,true); assert.equal(typeof x.aiBadge,'boolean'); assert.equal(ratificationFor(x.key),x); }
});
test('panel: Foreign affairs header, "No treaties in force" empty state, AI note', () => {
  assert.equal(P.header,'Foreign affairs'); assert.equal(P.emptyState,'No treaties in force'); assert.match(P.aiNote.text,/Every negotiator and ratifying body is an AI/);
});
test('40/140 limits hold with every placeholder filled to 24 characters', () => {
  for (const t of heads()) assert.ok(fill(t).length<=DIPLOMACY_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of bodies()) assert.ok(fill(t).length<=DIPLOMACY_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders; {endsAt} only where a term is stated; every status names both nations', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(DIPLOMACY_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const t of all()) assert.doesNotMatch(t,/\b(UTC|GMT)\b|\d{1,2}:\d{2}/);
  for (const t of statusLines().concat(brokenPactLine.text)) { assert.match(t,/\{nationA\}/,t); assert.match(t,/\{nationB\}/,t); }
  for (const s of TREATY_STATUSES) for (const l of S[s]) if (s!=='in-force'&&!(s==='expired'&&l.text.startsWith('Expired'))) assert.doesNotMatch(l.text,/\{endsAt\}/,l.text);
  assert.ok(S['in-force'].every(l=>/until \{endsAt\}/.test(l.text)));
  for (const t of statusLines()) if (!/^The |^\{nationA\} has proposed/.test(t)) assert.match(t,/^(Proposed|Ratified|In force|Expired|Broken)/,t);
});
test('ratifying-body mapping: Kindle Assembly (2/3 treaty, simple-majority trade), Korund Chairman alone, Aurelle royal decree', () => {
  const g=k=>ratificationFor(k).body;
  assert.match(g('kindle:treaty'),/^The Assembly ratified/); assert.match(g('kindle:treaty'),/two-thirds vote/); assert.doesNotMatch(g('kindle:treaty'),/simple majority/);
  assert.match(g('kindle:trade'),/^The Assembly ratified/); assert.match(g('kindle:trade'),/simple majority/); assert.doesNotMatch(g('kindle:trade'),/two-thirds/);
  assert.match(g('korund:any'),/the Chairman has ratified/); assert.doesNotMatch(g('korund:any'),/Assembly|Crown|royal|vote|majority/i);
  assert.match(g('aurelle:any'),/the Crown ratifies/); assert.match(g('aurelle:any'),/by royal decree/); assert.doesNotMatch(g('aurelle:any'),/Assembly|Chairman|vote|majority/i);
  assert.match(g('kindle:treaty')+g('kindle:trade'),/Assembly/); assert.doesNotMatch(g('kindle:treaty')+g('kindle:trade'),/Chairman|Crown|royal/);
  assert.deepEqual(R.map(x=>[x.nationId,x.ratifier]),[['kindle','Assembly'],['kindle','Assembly'],['korund','Chairman'],['aurelle','Crown']]);
  assert.match(H['kindle:treaty'],/Assembly/); assert.match(H['kindle:trade'],/Assembly/); assert.match(H['korund:any'],/Chairman/); assert.match(H['aurelle:any'],/royal decree/);
});
test('bylines reuse the three press packs; Crown and Chairman ratifications are AI-badged (#381), the Assembly report is not', () => {
  assert.deepEqual(DIPLOMACY_BYLINES.kindle,kindlePress.byline); assert.deepEqual(DIPLOMACY_BYLINES.korund,korundStateMedia.byline); assert.deepEqual(DIPLOMACY_BYLINES.aurelle,aurelleGazette.byline);
  assert.equal(ratificationFor('aurelle:any').aiBadge,true); assert.match(ratificationFor('aurelle:any').body,/^Be it known/);
  for (const k of ['kindle:treaty','kindle:trade']) assert.equal(ratificationFor(k).aiBadge,false);
  assert.equal(ratificationFor('korund:any').aiBadge,true, '#381: the Chairman ratifies, an AI leader speaks');
  assert.match(ratificationFor('korund:any').body,/^Korund State Media reports/);
});
test('broken pact line names Legitimacy and global Reputation with no number', () => {
  assert.match(brokenPactLine.text,/Breaking it costs Legitimacy and global Reputation\./); assert.doesNotMatch(brokenPactLine.text,/\d|%|point|percent/i);
});
test('treaty kinds follow §13.2 and carry no term, count or penalty figure', () => {
  assert.equal(K['non-aggression'].name,'non-aggression pact'); assert.equal(K.trade.name,'trade agreement');
  assert.match(K['non-aggression'].effect.text,/No war declarations/); assert.match(K.trade.effect.text,/Tariff reductions, quotas and guaranteed supply/);
  for (const t of all()) { assert.doesNotMatch(docFigures(t),/\d|%|percent|\b(one|two|three|four|five|ten|twelve|hundred|years?|months?|days?|hours?|weeks?)\b/i,t); }
  for (const t of all()) assert.doesNotMatch(t,/\bterm of\b|\bfor a\b.*\bterm\b/i);
});
test('no implication that human citizens vote; "vote" and "majority" only for the Assembly lines', () => {
  for (const t of all()) assert.doesNotMatch(t,/\b(citizens?|players?|people|public|referendum|poll|ballot|you)\b/i,t);
  for (const t of all()) if (/vote|majority/i.test(t)) assert.match(t,/^The Assembly ratified/,t);
});
test('no violence, no real-world treaties/countries/leaders, no Notable, no embargo or sanction scope creep', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\bwars\b|kill|battle|army|troops|glor|triumph|crush|punish|doom|beware/i);
  assert.doesNotMatch(t,/\b(Earth|America|Russia|China|Ukraine|Germany|Britain|England|France|Japan|Israel|Iran|NATO|EU|UN|Hitler|Napoleon|Stalin|Caesar|Versailles|Geneva|Yalta|World War|Cold War|EVE)\b/);
  assert.doesNotMatch(t,/Notable|embargo|sanction|cession|embassy|peace treaty|ceasefire|@/i);
});
test('nation voices stay distinct', () => {
  assert.doesNotMatch(ratificationFor('kindle:treaty').body,/Be it known|State Media/); assert.doesNotMatch(ratificationFor('korund:any').body,/Be it known|Wire Service/); assert.doesNotMatch(ratificationFor('aurelle:any').body,/State Media|Wire Service|reports/);
});
test('wired by #308 only: the Foreign affairs panel is the one app/ importer of diplomacy-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f) && f !== 'app/foreign-affairs-panel.tsx') assert.doesNotMatch(readFileSync(f,'utf8'),/diplomacy-copy/, f);
});
