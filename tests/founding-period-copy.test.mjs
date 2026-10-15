import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress, korundStateMedia, aurelleGazette } from '../lib/press-templates.ts';

// lib/founding-period-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/founding-period-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'founding-period-copy-')),'founding-period-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const F = await import(pathToFileURL(out).href);
const { foundingBanner:BN, foundingProgramme:PG, foundingTenure:TN, dayThirtyPreviews:DP, dayThirtyPreviewFor, foundingEnded:EN, FOUNDING_NATIONS, FOUNDING_PLACEHOLDERS, FOUNDING_NAME_MAX, FOUNDING_LABEL_MAX, FOUNDING_LINE_MAX, FOUNDING_BODY_MAX, FOUNDING_PERIOD_DAYS } = F;

const labels=()=>[BN.title,PG.label,TN.label,...DP.map(x=>x.headline)];
const lines=()=>[BN.caption.text,PG.line.text,TN.line.text,EN.text];
const bodies=()=>[BN.explainer.text,...DP.map(x=>x.body)];
const all=()=>[...labels(),...lines(),...bodies()];
const fill=t=>FOUNDING_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(FOUNDING_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80/140; one placeholder; the docs\' 30 real days', () => {
  assert.equal(FOUNDING_NAME_MAX,COUP_NAME_MAX); assert.equal(FOUNDING_LABEL_MAX,40); assert.equal(FOUNDING_LINE_MAX,80); assert.equal(FOUNDING_BODY_MAX,140);
  assert.deepEqual([...FOUNDING_PLACEHOLDERS],['{endsAt}']); assert.equal(FOUNDING_PERIOD_DAYS,30);
});
test('every key is present: banner (title, caption, explainer), programme, tenure, three day-30 previews, ended line; every line a proposal', () => {
  assert.deepEqual([...FOUNDING_NATIONS],['kindle','korund','aurelle']); assert.deepEqual(DP.map(x=>x.nationId),[...FOUNDING_NATIONS]);
  for (const x of DP) { assert.equal(x.proposal,true); assert.equal(dayThirtyPreviewFor(x.nationId),x); assert.equal(typeof x.aiBadge,'boolean'); }
  for (const l of [BN.caption,BN.explainer,PG.line,TN.line,EN]) assert.equal(l.proposal,true); for (const o of [BN,PG,TN]) assert.equal(o.proposal,true);
  assert.equal(new Set(all()).size,all().length);
});
test('limits: labels 40, lines 80, bodies and explainer 140, with {endsAt} filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=FOUNDING_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=FOUNDING_LINE_MAX,`${t} (${fill(t).length})`);
  for (const t of bodies()) assert.ok(fill(t).length<=FOUNDING_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only {endsAt}, and only in the caption', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(FOUNDING_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.match(BN.caption.text,/\{endsAt\}/); for (const t of all().filter(x=>x!==BN.caption.text)) assert.doesNotMatch(t,/\{/,t);
});
test('the only figure is 30 real days, in the explainer and the day-30 lines; no other digits or number words', () => {
  assert.match(BN.explainer.text,/first 30 real days/);
  for (const t of all()) { const bare=t.replace(/\{[^}]*\}/g,'').replace(/\bday one\b|\b30 real days\b|\bDay 30\b|\bday 30\b/g,''); assert.doesNotMatch(bare,/\d|%|\b(one|two|three|four|five|six|ten|twice|once|half)\b|\b(hours?|weeks?|months?|years?)\b/i,t); }
  for (const t of [BN.caption.text,PG.line.text,TN.line.text,EN.text,PG.label,TN.label,BN.title]) assert.doesNotMatch(t,/\d/,t);
  for (const x of DP) assert.match(x.headline+' '+x.body,/[Dd]ay 30/,x.nationId);
});
test('says war is disabled and what the docs say about the Founding Period; no promise beyond the docs', () => {
  assert.match(BN.caption.text,/War stays disabled/); assert.match(BN.explainer.text,/Wars are disabled/); assert.match(BN.explainer.text,/starts are protected/); assert.match(BN.explainer.text,/AI leaders govern from day one/);
  assert.match(PG.line.text,/founding program/); assert.match(TN.line.text,/tenure and Standing/); assert.match(TN.line.text,/Favor and Piety/);
  assert.match(EN.text,/Founding Period has ended/);
  for (const t of all()) assert.doesNotMatch(t,/\b(guarantee\w*|promise\w*|safe forever|always|never)\b/i,t);
});
test('day-30 previews match the 10.6 events: Kindle first election (citizens vote, AI candidates), Korund Congress confirms the Chairman, Aurelle rival houses publish claims', () => {
  assert.match(dayThirtyPreviewFor('kindle').body,/first election/); assert.match(dayThirtyPreviewFor('kindle').body,/Citizens vote, and the candidates are AI/);
  assert.match(dayThirtyPreviewFor('korund').body,/Congress confirms the Chairman/); assert.match(dayThirtyPreviewFor('aurelle').body,/rival houses publish their claims/);
  for (const x of DP) assert.doesNotMatch(x.body,/\b(wins?|won|victor\w*|result\w*|elected)\b/i,x.nationId);
});
test('voices and bylines: each preview opens with its own outlet and the byline matches lib/press-templates.ts', () => {
  const by=Object.fromEntries(DP.map(x=>[x.nationId,x.byline]));
  assert.deepEqual(by.kindle,kindlePress.byline); assert.deepEqual(by.korund,korundStateMedia.byline); assert.deepEqual(by.aurelle,aurelleGazette.byline);
  assert.match(dayThirtyPreviewFor('kindle').body,/^Republic Wire Service: /); assert.match(dayThirtyPreviewFor('korund').body,/^Korund State Media reports: /); assert.match(dayThirtyPreviewFor('aurelle').body,/^The Court Gazette reports that /);
  for (const t of [BN.caption.text,BN.explainer.text,PG.line.text,TN.line.text,EN.text]) assert.doesNotMatch(t,/Republic Wire|State Media|Court Gazette|Be it known|Chairman|Crown|Assembly/,t);
});
test('AI badge (#381, ui-ux 23.2): only the Korund State Media line for the state\'s own act is badged; the Kindle and Gazette reports and every system line are not', () => {
  assert.deepEqual(DP.filter(x=>x.aiBadge).map(x=>x.nationId),['korund']);
  for (const o of [BN,PG,TN]) assert.equal('aiBadge' in o,false); for (const l of [BN.caption,BN.explainer,PG.line,TN.line,EN]) assert.equal('aiBadge' in l,false);
});
test('does not repeat the Founding Period refusal in the war copy', () => {
  const war=readFileSync('lib/war-copy.ts','utf8'), ref=readFileSync('lib/war-refusal-copy.ts','utf8');
  for (const t of [...lines(),...bodies()]) { assert.ok(!war.includes(t),t); assert.ok(!ref.includes(t),t); }
  for (const t of all()) assert.doesNotMatch(t,/declaration was not made/i,t);
});
test('tone: nothing graphic or warlike beyond the rule; no real-world names, no other nations, no Notable', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(kill\w*|blood|glor\w*|victor\w*|conquer\w*|crush\w*|army|armies|battle\w*|casualt\w*|loot\w*)\b/i);
  assert.doesNotMatch(t,/Notable|@|\b(Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|England|France|Japan|China|Russia)\b/);
});
test('wired only through lib/founding-period.ts and app/founding-banner.tsx (#612): nothing else in app/, components/ or lib/ imports founding-period-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('founding-period-copy.ts')&&f!=='lib/founding-period.ts'&&f!=='app/founding-banner.tsx') assert.doesNotMatch(readFileSync(f,'utf8'),/founding-period-copy/, f);
});
