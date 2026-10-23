import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress, korundStateMedia, aurelleGazette } from '../lib/press-templates.ts';
import { treatyAiLeaders, treatyKindNames, treatyNationNames } from '../lib/diplomacy-rules.ts';

// lib/ai-treaty-proposal-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/ai-treaty-proposal-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'ai-treaty-proposal-copy-')),'ai-treaty-proposal-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const A = await import(pathToFileURL(out).href);
const { proposedBy:PB, aiProposalNews:AN, aiProposalNewsFor, PROPOSAL_NATIONS, PROPOSAL_KINDS, PROPOSAL_ROLES, AI_PROPOSAL_PLACEHOLDERS, AI_PROPOSAL_NAME_MAX, AI_PROPOSAL_LABEL_MAX, AI_PROPOSAL_LINE_MAX, AI_PROPOSAL_BODY_MAX } = A;

const news=()=>AN.flatMap(n=>PROPOSAL_ROLES.flatMap(r=>PROPOSAL_KINDS.map(k=>({nation:n.nationId,role:r,kind:k,n:n.notices[r][k]}))));
const labels=()=>[PB.label,...news().map(x=>x.n.headline)];
const lines=()=>[PB.line.text];
const bodies=()=>news().map(x=>x.n.body);
const all=()=>[...labels(),...lines(),...bodies()];
const fill=t=>AI_PROPOSAL_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(AI_PROPOSAL_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80/140; placeholder set', () => {
  assert.equal(AI_PROPOSAL_NAME_MAX,COUP_NAME_MAX); assert.equal(AI_PROPOSAL_LABEL_MAX,40); assert.equal(AI_PROPOSAL_LINE_MAX,80); assert.equal(AI_PROPOSAL_BODY_MAX,140);
  assert.deepEqual([...AI_PROPOSAL_PLACEHOLDERS],['{proposer}','{other}','{treaty}','{leader}']);
});
test('covers all three MVP nations, both treaty kinds and both roles, matching the server (lib/diplomacy-rules.ts)', () => {
  assert.deepEqual([...PROPOSAL_NATIONS],['kindle','korund','aurelle']); assert.deepEqual([...PROPOSAL_KINDS],['non-aggression','trade']); assert.deepEqual([...PROPOSAL_ROLES],['proposer','recipient']);
  assert.deepEqual(Object.keys(treatyKindNames).sort(),[...PROPOSAL_KINDS].sort()); assert.deepEqual(Object.keys(treatyNationNames).sort(),[...PROPOSAL_NATIONS].sort()); assert.deepEqual(Object.keys(treatyAiLeaders).sort(),[...PROPOSAL_NATIONS].sort());
  assert.deepEqual(AN.map(x=>x.nationId),[...PROPOSAL_NATIONS]);
  for (const n of AN) { assert.equal(n.proposal,true); assert.equal(aiProposalNewsFor(n.nationId),n); assert.deepEqual(Object.keys(n.notices).sort(),['proposer','recipient']); for (const r of PROPOSAL_ROLES) assert.deepEqual(Object.keys(n.notices[r]).sort(),[...PROPOSAL_KINDS].sort()); }
});
test('every notice is a proposal with a unique id and a boolean badge; system lines are proposals', () => {
  assert.equal(news().length,12); assert.equal(new Set(news().map(x=>x.n.id)).size,12);
  for (const x of news()) { assert.equal(x.n.proposal,true); assert.equal(typeof x.n.aiBadge,'boolean'); assert.equal(x.n.id,`${x.nation}-${x.role}-${x.kind}`); }
  assert.equal(PB.proposal,true); assert.equal(PB.line.proposal,true); assert.equal(new Set(labels().filter(t=>!/^Proposed/.test(t))).size>=6,true);
});
test('limits: labels and headlines 40, lines 80, news bodies 140, with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=AI_PROPOSAL_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=AI_PROPOSAL_LINE_MAX,`${t} (${fill(t).length})`);
  for (const t of bodies()) assert.ok(fill(t).length<=AI_PROPOSAL_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders, in the right lines: proposer lines name {other}, recipient lines name {proposer}, every body names {treaty}', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(AI_PROPOSAL_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const x of news()) { assert.match(x.n.body,x.role==='proposer'?/\{other\}/:/\{proposer\}/,x.n.id); assert.match(x.n.body,/\{treaty\}/,x.n.id); assert.doesNotMatch(x.n.body,x.role==='proposer'?/\{proposer\}/:/\{other\}/,x.n.id); }
  assert.match(PB.line.text,/\{leader\}/); for (const t of [PB.label,...news().map(x=>x.n.headline)]) assert.doesNotMatch(t,/\{/,t);
});
test('no numbers, no penalties or costs, and no promise of the outcome', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|percent|\b(one|two|three|four|five|six|ten|twice|once|half)\b|\b(hours?|days?|weeks?|months?|years?)\b|\bcap(ped)?\b/i,t);
  for (const t of all()) assert.doesNotMatch(t,/Legitimacy|Reputation|penalt\w*|\bcosts?\b/,t);
  for (const t of all()) assert.doesNotMatch(t,/\b(will (be )?(accept|ratif|sign|agree)\w*|has (accepted|agreed|signed)|certain|guarantee\w*|promise\w*)\b/i,t);
  for (const x of news()) if (x.role==='recipient') assert.match(x.n.body,/awaits ratification/,x.n.id);
});
test('scope: proposals only; no break, ended or war-declaration wording (#435 owns break notices)', () => {
  for (const t of all()) assert.doesNotMatch(t,/\b(break|breaks|breaking|broke|broken|ends?|ended|declar\w*|revok\w*|rumou?rs?)\b/i,t);
  for (const x of news()) assert.match(x.n.body,/propos|offer/i,x.n.id);
});
test('voices: Kindle\'s President and Secretary of State (docs 13.1 negotiators) speak plainly; Korund State Media reports the Chairman\'s own act; Aurelle opens "Be it known" for the Crown; recipients are reported with a byline', () => {
  for (const k of PROPOSAL_KINDS) {
    assert.match(aiProposalNewsFor('kindle').notices.proposer[k].body,/^President and Secretary of State: we propose/); assert.match(aiProposalNewsFor('kindle').notices.recipient[k].body,/^Kindle Press: /);
    assert.match(aiProposalNewsFor('korund').notices.proposer[k].body,/^Korund State Media reports: the Chairman offers/); assert.match(aiProposalNewsFor('korund').notices.recipient[k].body,/^Korund State Media reports: /);
    assert.match(aiProposalNewsFor('aurelle').notices.proposer[k].body,/^Be it known: the Crown offers/); assert.match(aiProposalNewsFor('aurelle').notices.recipient[k].body,/^The Court Gazette reports that /);
  }
  for (const k of PROPOSAL_KINDS) assert.doesNotMatch(aiProposalNewsFor('kindle').notices.proposer[k].body+aiProposalNewsFor('kindle').notices.recipient[k].body,/Cabinet/);
  assert.match(aiProposalNewsFor('kindle').notices.proposer['non-aggression'].headline,/The President proposes a pact/);
  assert.match(aiProposalNewsFor('korund').notices.proposer['non-aggression'].body,/bar war/); assert.match(aiProposalNewsFor('korund').notices.proposer.trade.body,/open trade/);
  assert.match(aiProposalNewsFor('aurelle').notices.proposer['non-aggression'].body,/war may be barred/); assert.match(aiProposalNewsFor('aurelle').notices.proposer.trade.body,/trade may flow/);
});
test('AI badge (#381, ui-ux 23.2): every proposer line (the leader speaks) is badged; recipient reports and the system line are not', () => {
  for (const x of news()) assert.equal(x.n.aiBadge,x.role==='proposer',x.n.id);
  for (const x of news()) if (/^Be it known/.test(x.n.body)) assert.equal(x.n.aiBadge,true,x.n.id);
  assert.equal('aiBadge' in PB,false); assert.equal('aiBadge' in PB.line,false);
});
test('bylines match lib/press-templates.ts', () => {
  const by=Object.fromEntries(AN.map(n=>[n.nationId,n.byline]));
  assert.deepEqual(by.kindle,kindlePress.byline); assert.deepEqual(by.korund,korundStateMedia.byline); assert.deepEqual(by.aurelle,aurelleGazette.byline);
});
test('does not repeat the existing lines in lib/diplomacy-copy.ts or lib/treaty-break-copy.ts', () => {
  const dip=readFileSync('lib/diplomacy-copy.ts','utf8');
  for (const t of [...lines(),...bodies()]) assert.ok(!dip.includes(`'${t}'`),t);
});
test('tone: no violence or glory, no Notable, no other nations, no real-world reference', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(kill\w*|blood|betray\w*|traitor\w*|treacher\w*|revenge|glor\w*)\b/i);
  assert.doesNotMatch(t,/Notable|@|\b(Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|England|France|Japan|China|Russia)\b/);
});
test('unwired: nothing in app/, components/ or lib/ imports ai-treaty-proposal-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('ai-treaty-proposal-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/ai-treaty-proposal-copy/, f);
});
