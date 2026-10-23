import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { aurelleGazette, kindlePress, korundStateMedia } from '../lib/press-templates.ts';

// lib/aurelle-debasement-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/aurelle-favor-copy.test.mjs does.
const src=readFileSync('lib/aurelle-debasement-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'aurelle-debasement-copy-')),'aurelle-debasement-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const D = await import(pathToFileURL(out).href);
const { crownStrip:S, decrees:DC, gazetteReports:GR, fullWeightRumors:RU, pressReports:PR, pressReportFor, kioskRateMoved:KR, decreeFor, DECREE_KEYS, CONFIDENCE_BANDS, DEBASEMENT_PLACEHOLDERS, DEBASEMENT_NAME_MAX, DEBASEMENT_LABEL_MAX, DEBASEMENT_LINE_MAX, DEBASEMENT_BYLINES } = D;

const decreeList=()=>DECREE_KEYS.map(k=>DC[k]);
const labels=()=>[S.header,S.mintParity,S.confidence,S.confidenceLine,...CONFIDENCE_BANDS.map(b=>S.bandLabels[b]),...decreeList().map(x=>x.headline)];
const lines=()=>[S.readOnly,...GR,...RU,...PR,...KR,...decreeList().map(x=>({text:x.body}))].map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>DEBASEMENT_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(DEBASEMENT_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80; placeholder set', () => {
  assert.equal(DEBASEMENT_NAME_MAX,COUP_NAME_MAX); assert.equal(DEBASEMENT_NAME_MAX,24); assert.equal(DEBASEMENT_LABEL_MAX,40); assert.equal(DEBASEMENT_LINE_MAX,80);
  assert.deepEqual([...DEBASEMENT_PLACEHOLDERS],['{parity}','{rate}','{band}']);
});
test('every key is present: strip labels, three Confidence bands, two decrees, Gazette reports, rumors, Kindle and Korund reports, kiosk notices; every line proposal', () => {
  assert.equal(S.header,'Crown coin'); assert.equal(S.confidence,'Currency Confidence'); assert.deepEqual([...CONFIDENCE_BANDS],['high','middle','low']);
  assert.deepEqual(Object.keys(S.bandLabels).sort(),[...CONFIDENCE_BANDS].sort()); assert.equal(new Set(Object.values(S.bandLabels)).size,3);
  assert.deepEqual([...DECREE_KEYS],['debasement','recoinage']); assert.deepEqual(Object.keys(DC).sort(),[...DECREE_KEYS].sort()); for (const k of DECREE_KEYS) assert.equal(decreeFor(k),DC[k]);
  assert.equal(GR.length,2); assert.equal(RU.length,3); assert.equal(PR.length,2); assert.equal(KR.length,2);
  for (const l of [S.readOnly,...GR,...KR]) assert.equal(l.proposal,true);
  for (const x of decreeList()) { assert.equal(x.proposal,true); assert.equal(typeof x.aiBadge,'boolean'); }
  for (const x of [...RU,...PR]) assert.equal(x.proposal,true);
  assert.equal(S.proposal,true);
});
test('limits: labels 40, lines 80, with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=DEBASEMENT_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=DEBASEMENT_LINE_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders, in the right lines', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(DEBASEMENT_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.match(S.mintParity,/\{parity\}/); assert.match(S.confidenceLine,/\{band\}/);
  for (const x of decreeList()) assert.match(x.body,/\{parity\}/); assert.match(GR[0].text,/\{parity\}/); assert.doesNotMatch(GR[1].text,/\{/);
  for (const l of KR) assert.match(l.text,/\{rate\}/);
  for (const x of [...RU,...PR]) assert.doesNotMatch(x.text,/\{/);
  for (const b of CONFIDENCE_BANDS) assert.doesNotMatch(S.bandLabels[b],/\{/);
});
test('no invented figures: no digits, percent, number words or caps; the 5% band, the 15% cap and thresholds stay in #362', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|percent|\b(one|two|three|four|five|ten|fifteen|hundred|twice|once)\b|\b(days?|hours?|weeks?|months?|years?)\b|\bcap(ped)?\b|\bthreshold/i,t);
});
test('AI badge (#381): Crown decrees are badged; Gazette reports, rumors and Kindle and Korund reports are not', () => {
  for (const x of decreeList()) { assert.match(x.body,/^Be it known/); assert.equal(x.aiBadge,true,x.key); }
  for (const g of GR) assert.match(g.text,/^The Court Gazette/);
  for (const x of [...RU,...PR]) assert.equal(x.aiBadge,false,x.text);
});
test('bylines match lib/press-templates.ts; Kindle and Korund reports carry their own byline', () => {
  assert.deepEqual(DEBASEMENT_BYLINES.gazette,aurelleGazette.byline); assert.deepEqual(DEBASEMENT_BYLINES.kindle,kindlePress.byline); assert.deepEqual(DEBASEMENT_BYLINES.korund,korundStateMedia.byline);
  assert.match(pressReportFor('kindle').text,/^Kindle Press: /); assert.match(pressReportFor('korund').text,/^Korund State Media: /);
  assert.deepEqual(PR.map(x=>x.outlet),['kindle','korund']); for (const x of PR) assert.match(x.text,/Crown/);
});
test('rumors are marked as rumor and never state an official rate', () => {
  for (const x of RU) { assert.equal(x.rumor,true); assert.match(x.text,/rumou?r/i); assert.doesNotMatch(x.text,/Be it known|Court Gazette|decree/i); assert.match(x.text,/full-weight|Heirloom/); }
  assert.match(RU[0].text,/not an official rate/); assert.equal(new Set(RU.map(x=>x.text)).size,RU.length);
});
test('decrees speak the Crown; strip is read-only; kiosk notices are plain system voice with no official', () => {
  assert.match(DC.debasement.body,/royal decree/); assert.match(DC.recoinage.body,/Royal Mint recoins/); assert.deepEqual(decreeList().map(x=>x.headline),['The coinage is reissued','The coinage is recut']);
  assert.match(S.readOnly.text,/royal decree/);
  for (const l of KR) { assert.match(l.text,/^(The )?Crown rate/); assert.match(l.text,/decree/); assert.doesNotMatch(l.text,/Be it known|Monarch|clerk|official said|Chairman|\bAI\b/i); }
});
test('scope: Aurelle debasement only; no other currencies, real-world reference or Notable; no violence', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence|Spark|Labor Note|Tessera|Great Recharter)\b/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|England|France|Japan|China|Russia|Versailles|Louis|Henry|Napoleon)\b|Notable|@/);
  assert.doesNotMatch(t,/\b(kill|blood|behead|hang|prison|punish)\w*/i);
});
test('unwired: nothing in app/, components/ or lib/ imports aurelle-debasement-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('aurelle-debasement-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/aurelle-debasement-copy/, f);
});
