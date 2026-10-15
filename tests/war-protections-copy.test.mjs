import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// Both modules re-export the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and
// transpile, as tests/war-copy.test.mjs does.
const palace=pathToFileURL(resolve('lib/palace-coup-copy.ts')).href;
const dir=mkdtempSync(join(tmpdir(),'war-protections-'));
const load=async name=>{
  const src=readFileSync(`lib/${name}.ts`,'utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(palace)}`);
  const out=join(dir,`${name}.mjs`); writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  return import(pathToFileURL(out).href);
};
const P=await load('war-protections-copy'); const W=await load('war-copy');
const { safetyReminders:SR, evacuation:EV, housingVoucher:HV, wounded:WD, newcomerShield:NS, foundationTruce:FT, relocationSupport:RS, landBuyout:LB, PROTECTIONS_PLACEHOLDERS, PROTECTIONS_NAME_MAX, PROTECTIONS_LABEL_MAX, PROTECTIONS_LINE_MAX, NEWCOMER_SHIELD_DAYS, FOUNDATION_TRUCE_DAYS } = P;

const labels=()=>[EV.headline,HV.label,WD.label,NS.label,FT.label,RS.label,LB.label];
const lineObjs=()=>[...SR,...EV.notice,EV.belongings,EV.title,EV.relocation,...HV.explainer,...WD.status,WD.returned,NS.banner,NS.explainer,NS.ended,FT.notice,FT.ended,RS.funded,RS.empty,RS.stays,LB.voluntary,LB.currency,LB.decline];
const lines=()=>lineObjs().map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>PROTECTIONS_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(PROTECTIONS_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80; placeholder set; the docs\' two figures', () => {
  assert.equal(PROTECTIONS_NAME_MAX,COUP_NAME_MAX); assert.equal(PROTECTIONS_LABEL_MAX,40); assert.equal(PROTECTIONS_LINE_MAX,80);
  assert.deepEqual([...PROTECTIONS_PLACEHOLDERS],['{city}','{safeCity}','{days}']); assert.equal(NEWCOMER_SHIELD_DAYS,14); assert.equal(FOUNDATION_TRUCE_DAYS,10);
});
test('every key is present; every line is a proposal; all lines are distinct', () => {
  assert.equal(SR.length,2); assert.equal(EV.notice.length,2); assert.equal(HV.explainer.length,2); assert.equal(WD.status.length,2);
  assert.equal(EV.headline,'You were moved to safety'); assert.equal(HV.label,'Housing voucher'); assert.equal(NS.label,'Newcomer shield'); assert.equal(FT.label,'Foundation truce'); assert.equal(WD.label,'Wounded');
  assert.equal(RS.label,'Relocation support'); assert.equal(LB.label,'Land buyout');
  for (const l of lineObjs()) assert.equal(l.proposal,true);
  for (const o of [EV,HV,WD,NS,FT,RS,LB]) assert.equal(o.proposal,true);
  assert.equal(new Set(lines()).size,lines().length);
});
test('limits: labels 40, lines 80, with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=PROTECTIONS_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=PROTECTIONS_LINE_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders, in the right lines', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(PROTECTIONS_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const l of EV.notice) { assert.match(l.text,/\{city\}/); assert.match(l.text,/\{safeCity\}/); }
  assert.doesNotMatch(EV.title.text+EV.relocation.text,/\{/); for (const l of HV.explainer) assert.match(l.text,/\{safeCity\}/);
  for (const l of WD.status) assert.match(l.text,/\{days\}/); assert.doesNotMatch(WD.returned.text,/\{/);
  assert.match(FT.notice.text,/\{city\}/); assert.match(FT.ended.text,/\{city\}/);
  for (const l of [...SR,EV.belongings,EV.title,EV.relocation,NS.banner,NS.explainer,NS.ended,RS.funded,RS.empty,RS.stays,LB.voluntary,LB.currency,LB.decline]) assert.doesNotMatch(l.text,/\{/);
});
test('no invented figures: only 14 real days (newcomer shield) and 10 real days (foundation truce); wounded length only via {days}', () => {
  const shield=[NS.banner.text,NS.explainer.text], truce=[FT.notice.text];
  for (const t of shield) assert.match(t,/\b14 real days\b/); for (const t of truce) assert.match(t,/\b10 real days\b/);
  for (const t of all()) { const bare=t.replace(/\{[^}]*\}/g,'').replace(/\b(14|10) real days\b/g,''); assert.doesNotMatch(bare,/\d|%|percent|\b(one|two|three|four|five|six|seven|twice|once)\b|\bweeks?\b|\bhours?\b|\bmonths?\b|\bcap(ped)?\b/i,t); }
  for (const t of all()) { if (!shield.includes(t)&&!truce.includes(t)) assert.doesNotMatch(t,/\b14\b|\b10\b/,t); }
});
test('Decision 109: no set-share compensation, no percentage, no promised payment; relocation support is only offered and any buyout is voluntary; belongings are never looted', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/%|percent|\b50\b|\b80\b|set share|a share|compensat\w*|\bpaid\b|\bpay(s|ment)?\b|\bwill (receive|get|be)\b|\bguarantee\w*|\bentitled\b|\bowed?\b/i);
  assert.match(EV.relocation.text,/^Relocation support may be offered\./); assert.match(EV.relocation.text,/buyout is voluntary/);
  assert.match(EV.title.text,/land stays yours/); assert.match(EV.title.text,/leases are honored/);
  assert.match(EV.belongings.text,/not looted/); assert.match(EV.belongings.text,/personal items/);
  assert.match(RS.funded.text,/Tessera only/); assert.match(RS.empty.text,/No funds/); assert.match(RS.stays.text,/Tessera only/);
  assert.match(LB.voluntary.text,/voluntary/); assert.match(LB.currency.text,/Tessera only/); assert.match(LB.decline.text,/no penalty/);
  assert.doesNotMatch(readFileSync('lib/war-protections-copy.ts','utf8'),/set share|50-80|50.80%|compensated at|compensates/);
});
test('#470 slice 1: no Spark, exchange, kiosk, cash, digit amount, or compensation in any scanned line', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\bSpark\b/);
    assert.doesNotMatch(t,/\bexchange\b/i);
    assert.doesNotMatch(t,/\bkiosk\b/i);
    assert.doesNotMatch(t,/cash/i);
    assert.doesNotMatch(t,/compensat/i);
    const bare=t.replace(/\{[^}]*\}/g,'').replace(/\b(14|10) real days\b/g,'');
    assert.doesNotMatch(bare,/\d|%/,t);
  }
});
test('never contradicts "never killed" or "never looted": any mention of killed or looted is negated, and lib/war-copy.ts citizenSafety agrees', () => {
  for (const t of all()) { if (/kill|loot/i.test(t)) assert.match(t,/never killed|not killed|never looted|not looted/,t); assert.doesNotMatch(t,/\b(dead|die[sd]?|death|casualt\w*|massacre|slain)\b/i,t); }
  const cs=W.citizenSafety.lines.map(l=>l.text).join(' ');
  assert.match(cs,/never killed/); assert.match(cs,/never looted/); assert.match(cs,/wounded, not killed/);
  assert.match(SR[0].text,/never killed/); assert.match(SR[0].text,/never looted/); assert.match(SR[1].text,/Wounded, not killed/); assert.match(SR[1].text,/gear insurance/);
  for (const l of WD.status) assert.match(l.text,/wounded|Wounded/);
});
test('plain system voice: no byline, no AI badge field, no Notable, no nations, no real-world reference, no violence', () => {
  for (const o of [EV,HV,WD,NS,FT,RS,LB]) assert.equal('aiBadge' in o,false);
  for (const l of [...SR,...EV.notice,...HV.explainer,...WD.status,NS.banner,FT.notice,RS.funded,LB.voluntary]) assert.equal('aiBadge' in l,false);
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(Kindle|Korund|Aurelle|Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b|Court Gazette|State Media|Notable|@/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|England|France|Japan|China|Russia)\b/);
  assert.doesNotMatch(t,/\b(blood|bleed|wound(s)? you|torture|army|armies|troops?|soldiers?)\b/i);
});
test('unwired: nothing in app/, components/ or lib/ imports war-protections-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('war-protections-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/war-protections-copy/, f);
});
