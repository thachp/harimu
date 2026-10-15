import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// The module re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and transpile.
const src=readFileSync('lib/privacy-controls-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'privacy-controls-copy-')),'privacy-controls-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const P = await import(pathToFileURL(out).href);
const { privacyExplainer:EX, privacyExport:XP, privacyDelete:DL, privacyAiMemory:AM, privacyOptIns:OI, PRIVACY_NAME_MAX, PRIVACY_PLACEHOLDERS, PRIVACY_LABEL_MAX, PRIVACY_LINE_MAX, PRIVACY_EXPLAINER_MAX } = P;

const labels=()=>[EX.title,XP.label,XP.confirm,XP.cancel,DL.label,DL.typedPromptLabel,DL.confirm,DL.cancel,AM.viewLabel,AM.clearLabel,AM.confirm,AM.cancel,OI.aiMemory.label,OI.linkIdentity.label];
const lines=()=>[EX.intro.text,XP.help.text,XP.confirmPrompt.text,DL.help.text,DL.warning.text,AM.help.text,AM.confirmPrompt.text,AM.cleared.text,OI.aiMemory.help.text,OI.linkIdentity.help.text];
const explainerLines=()=>EX.categories.map(c=>c.line.text);
const all=()=>[...labels(),...lines(),...explainerLines()];
const fill=t=>PRIVACY_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(PRIVACY_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/100/140; one placeholder, the typed confirmation word', () => {
  assert.equal(PRIVACY_NAME_MAX,COUP_NAME_MAX); assert.equal(PRIVACY_LABEL_MAX,40); assert.equal(PRIVACY_LINE_MAX,100); assert.equal(PRIVACY_EXPLAINER_MAX,140); assert.deepEqual([...PRIVACY_PLACEHOLDERS],['{confirmWord}']);
});
test('exports every #539 item: the explainer, export, delete (warning, typed prompt), AI memory view and clear, two opt-in toggles; all proposal true', () => {
  assert.deepEqual(EX.categories.map(c=>c.key),['account','citizen','balances','actions','messages']);
  assert.equal(XP.label,'Export my data'); assert.equal(DL.label,'Delete my account'); assert.match(DL.warning.text,/cannot be undone/); assert.match(DL.typedPromptLabel,/\{confirmWord\}/);
  assert.match(AM.viewLabel,/remember/); assert.match(AM.clearLabel,/^Clear /); assert.match(OI.aiMemory.label,/AI memory/); assert.match(OI.linkIdentity.label,/real identity/);
  for (const l of [EX.intro,...EX.categories.map(c=>c.line),XP.help,XP.confirmPrompt,DL.help,DL.warning,AM.help,AM.confirmPrompt,AM.cleared,OI.aiMemory.help,OI.linkIdentity.help]) assert.equal(l.proposal,true); for (const o of [EX,XP,DL,AM,OI]) assert.equal(o.proposal,true);
  assert.equal(new Set([...lines(),...explainerLines()]).size,lines().length+explainerLines().length);
});
test('limits: labels 40, lines 100, explainer lines 140, with {confirmWord} filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=PRIVACY_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=PRIVACY_LINE_MAX,`${t} (${fill(t).length})`);
  for (const t of explainerLines()) assert.ok(fill(t).length<=PRIVACY_EXPLAINER_MAX,`${t} (${fill(t).length})`);
});
test('only {confirmWord}, and only in the typed prompt label', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(PRIVACY_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const t of all().filter(x=>x!==DL.typedPromptLabel)) assert.doesNotMatch(t,/\{/,t);
});
test('no digits and no number words', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|\b(one|two|three|four|five|six|seven|ten|twice|once|half)\b/i,t);
});
test('the explainer states no retention period and makes no timing promise', () => {
  for (const t of [EX.intro.text,...explainerLines()]) assert.doesNotMatch(t,/\b(days?|weeks?|months?|years?|hours?|forever|permanent\w*|indefinite\w*|until|retain\w*|retention|for as long|kept for|deleted after|removed after|erased after|expire\w*|soon|immediately|instantly|within)\b/i,t);
  for (const t of all()) assert.doesNotMatch(t,/\b(forever|permanent\w*|indefinite\w*|retention|retain\w*|within|instantly|immediately|guarantee\w*|promise\w*|always|never)\b/i,t);
});
test('the explainer lists only what the app holds today and each line gives a reason ("so ..."); no reports, no AI conversation memory, no tracking or sale of data', () => {
  for (const t of explainerLines()) { assert.match(t,/, so |^[^,]*, so /,t); assert.doesNotMatch(t,/\b(report\w*|AI|memory|remember\w*|conversation\w*|track\w*|analytic\w*|advertis\w*|sell\w*|sold|share\w*|third part\w*|partners?|location|device|browser|email|phone|real name|identity)\b/i,t); }
  assert.match(EX.categories[2].line.text,/household and wallet balances/); assert.match(EX.categories[4].line.text,/public squares/);
});
test('delete: an irreversible warning, a typed confirmation, a different cancel label; nothing promises what is removed or when', () => {
  assert.match(DL.warning.text,/cannot be undone/); assert.notEqual(DL.confirm,DL.cancel); assert.match(DL.cancel,/^Keep /);
  for (const t of [DL.help.text,DL.warning.text,DL.confirm,DL.cancel]) assert.doesNotMatch(t,/\b(all your data|everything|completely|permanently|erased|wiped|backups?|logs?|records?|legal|law|GDPR)\b/i,t);
});
test('AI memory: view and clear are the player\'s; the toggles say off unless turned on; nothing claims what AI characters currently store', () => {
  for (const t of [OI.aiMemory.help.text,OI.linkIdentity.help.text]) assert.match(t,/^Off unless you turn it on\./,t);
  assert.match(AM.help.text,/clear it if you want to/);
  for (const t of [AM.help.text,AM.cleared.text,OI.aiMemory.help.text]) assert.doesNotMatch(t,/\b(currently|right now|already|stores?|stored|saved|keeps?|kept|knows?|learned)\b/i,t);
  assert.doesNotMatch(OI.linkIdentity.help.text,/World ID|passport|ID card|government|verify|verified|verification|KYC|Tier/i);
});
test('one neutral system voice: no byline, no AI badge, no nation or leader voice, no legal text, no real-world references, no on-chain topics', () => {
  for (const o of [EX,XP,DL,AM,OI]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const t of all()) { assert.doesNotMatch(t,/Republic Wire|State Media|Court Gazette|Be it known|Chairman|Crown|President|Kindle|Korund|Aurelle|AI-generated|Notable|@|!/,t); assert.doesNotMatch(t,/\b(Earth|America\w*|Europe\w*|England|France|Japan|China|Russia|Tessera|NFT|on-chain|token\w*|privacy policy|terms|consent form|hereby|pursuant)\b/i,t); }
});
test('unwired: nothing in app/, components/ or lib/ imports privacy-controls-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('privacy-controls-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/privacy-controls-copy/, f);
});
