import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { korundStateMedia } from '../lib/press-templates.ts';

// lib/decision-disclosure-copy.ts has no imports: transpile it to a temporary .mjs (Node type-stripping needs extensions on imports).
const src=readFileSync('lib/decision-disclosure-copy.ts','utf8');
const out=join(mkdtempSync(join(tmpdir(),'decision-disclosure-copy-')),'decision-disclosure-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const D = await import(pathToFileURL(out).href);
const { whyLink:WL, disclosureReminder:RM, nationDisclosures:ND, nationDisclosureFor, DISCLOSURE_NATIONS, DISCLOSURE_LABEL_MAX, DISCLOSURE_LINE_MAX } = D;

const labels=()=>[WL.label,...ND.flatMap(n=>[n.title,n.openLabel])];
const lines=()=>[WL.accessibleName,RM.text,...ND.flatMap(n=>[n.frame.text,n.notPublished.text])];
const all=()=>[...labels(),...lines()];

test('limits: labels 40 and lines 80; no placeholders', () => {
  assert.equal(DISCLOSURE_LABEL_MAX,40); assert.equal(DISCLOSURE_LINE_MAX,80);
  for (const t of labels()) assert.ok(t.length<=DISCLOSURE_LABEL_MAX,`${t} (${t.length})`);
  for (const t of lines()) assert.ok(t.length<=DISCLOSURE_LINE_MAX,`${t} (${t.length})`);
  for (const t of all()) assert.doesNotMatch(t,/\{|\}/,t);
});
test('one Why? link and accessible name for every nation; each nation has a title, open label, frame and not-published line; every line a proposal', () => {
  assert.equal(WL.label,'Why?'); assert.equal(WL.proposal,true); assert.match(WL.accessibleName,/public explanation/);
  assert.deepEqual([...DISCLOSURE_NATIONS],['kindle','korund','aurelle']); assert.deepEqual(ND.map(n=>n.nationId),[...DISCLOSURE_NATIONS]);
  for (const n of ND) { assert.equal(n.proposal,true); assert.equal(nationDisclosureFor(n.nationId),n); assert.equal(n.frame.proposal,true); assert.equal(typeof n.frame.aiBadge,'boolean'); assert.equal(n.notPublished.proposal,true); assert.ok(n.title&&n.openLabel); }
  assert.equal(RM.proposal,true); assert.equal(new Set(all()).size,all().length);
});
test('titles and open labels match 8.6 and the 23.2 wording: Reasoning Brief (Kindle), official statement (Korund), decree (Aurelle)', () => {
  const k=nationDisclosureFor('kindle'), r=nationDisclosureFor('korund'), a=nationDisclosureFor('aurelle');
  assert.equal(k.title,'Reasoning Brief'); assert.equal(r.title,"Chairman's official statement"); assert.equal(a.title,'Royal decree');
  assert.match(k.openLabel,/Reasoning Brief/); assert.match(r.openLabel,/official statement/); assert.match(a.openLabel,/decree/);
  assert.match(k.frame.text,/goals, inputs considered and options rejected/); assert.match(r.notPublished.text,/No reasoning is published/); assert.match(a.frame.text,/Privy Council keeps counsel/); assert.match(a.notPublished.text,/not published for decrees/);
});
test('the reminder is one constant: out of character, a public summary, never raw reasoning, in no nation\'s voice', () => {
  assert.match(RM.text,/^Out of character: /); assert.match(RM.text,/public summary/); assert.match(RM.text,/never the raw model reasoning/);
  assert.doesNotMatch(RM.text,/\b(Kindle|Korund|Aurelle|Republic|Chairman|Crown|Privy|Assembly|State Media)\b|Be it known/);
  assert.equal(Object.keys(RM).sort().join(),'proposal,text');
});
test('no figures and no publication promise: no digits or number words, no 30-day archive delay, no "will be published"', () => {
  for (const t of all()) assert.doesNotMatch(t,/\d|%|\b(one|two|three|four|five|six|ten|twice|once|half)\b|\b(hours?|days?|weeks?|months?|years?)\b|\b(will be|within|soon|later|archive\w*|guarantee\w*|always)\b/i,t);
  for (const t of all()) assert.doesNotMatch(t,/chain-of-thought|\bprompt\w*|\bmodel\b(?!\s+reasoning)/i,t);
});
test('AI badge (#381, ui-ux 23.2): the Chairman\'s State Media frame and the Crown\'s "Be it known" frame are badged; the Why? link, Kindle frame, not-published lines and reminder are not', () => {
  assert.equal(nationDisclosureFor('kindle').frame.aiBadge,false); assert.equal(nationDisclosureFor('korund').frame.aiBadge,true); assert.equal(nationDisclosureFor('aurelle').frame.aiBadge,true);
  for (const n of ND) { if (/^Be it known/.test(n.frame.text)) assert.equal(n.frame.aiBadge,true); assert.equal('aiBadge' in n.notPublished,false); assert.equal('aiBadge' in n,false); }
  assert.equal('aiBadge' in WL,false); assert.equal('aiBadge' in RM,false);
});
test('byline: Korund\'s frame is State Media and matches lib/press-templates.ts; no other nation carries a byline', () => {
  assert.deepEqual(nationDisclosureFor('korund').byline,korundStateMedia.byline); assert.match(nationDisclosureFor('korund').frame.text,/^Korund State Media reports: /);
  assert.equal('byline' in nationDisclosureFor('kindle'),false); assert.equal('byline' in nationDisclosureFor('aurelle'),false);
  for (const t of [WL.accessibleName,RM.text,...ND.map(n=>n.notPublished.text)]) assert.doesNotMatch(t,/State Media|Kindle Press|Court Gazette|Be it known/,t);
});
test('tone: no real-world names, no other nations, no Notable, no blame', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(Earth|America\w*|Europe\w*|England|France|Japan|China|Russia\w*)\b/); assert.doesNotMatch(t,/Notable|@|\b(Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/);
  assert.doesNotMatch(t,/\b(lie|lies|hid|hiding|cover\w*|secret\w*|censor\w*)\b/i);
});
test('wired only into the Kindle Policy Ledger panel (#985)', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  const hits=[...walk('app'),...walk('components'),...walk('lib')].filter(f=>/\.(t|j)sx?$/.test(f)&&!f.endsWith('decision-disclosure-copy.ts')&&/decision-disclosure-copy/.test(readFileSync(f,'utf8')));
  assert.deepEqual(hits, ['app/leader-panel.tsx']);
});
