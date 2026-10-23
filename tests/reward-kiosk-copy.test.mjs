import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// The module re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and transpile.
const src=readFileSync('lib/reward-kiosk-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'reward-kiosk-copy-')),'reward-kiosk-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const K = await import(pathToFileURL(out).href);
const { kioskNationVoice:NV, kioskVoiceFor, kioskClaimable:CL, kioskLabels:LB, kioskClaim:CM, kioskHistory:HS, kioskNotes:NT, KIOSK_NATIONS, KIOSK_PLACEHOLDERS, KIOSK_NAME_MAX, KIOSK_LABEL_MAX, KIOSK_LINE_MAX, KIOSK_BODY_MAX } = K;

const labels=()=>[...KIOSK_NATIONS.map(n=>NV[n].title),CL.label,CL.claimButton,LB.earned,LB.starterGrant,LB.faucet,CM.confirm,CM.cancel,HS.title];
const lines=()=>[CL.claimAccessibleName.text,LB.starterGrantHelp.text,LB.faucetHelp.text,CM.claimed.text,CM.alreadyClaimed.text,HS.empty.text,HS.notOpen.text,NT.sparkStays.text];
const bodies=()=>[...KIOSK_NATIONS.map(n=>NV[n].intro.text),CL.row.text,CM.confirmPrompt.text];
const all=()=>[...labels(),...lines(),...bodies()];
const fill=t=>KIOSK_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(KIOSK_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80/140; two placeholders; three nations', () => {
  assert.equal(KIOSK_NAME_MAX,COUP_NAME_MAX); assert.equal(KIOSK_LABEL_MAX,40); assert.equal(KIOSK_LINE_MAX,80); assert.equal(KIOSK_BODY_MAX,140);
  assert.deepEqual([...KIOSK_PLACEHOLDERS],['{reward}','{work}']); assert.deepEqual([...KIOSK_NATIONS],['kindle','korund','aurelle']); assert.deepEqual(Object.keys(NV).sort(),['aurelle','kindle','korund']);
});
test('covers the #525 list: per-nation title and intro, claimable row, earned / starter grant / not earned labels, claim confirmation, already claimed, empty history, flag-off line, one Spark note; all proposal true and distinct', () => {
  for (const n of KIOSK_NATIONS) { assert.equal(kioskVoiceFor(n),NV[n]); assert.equal(NV[n].proposal,true); assert.equal(NV[n].intro.proposal,true); }
  assert.match(CL.row.text,/\{reward\}/); assert.match(CL.row.text,/\{work\}/); assert.equal(LB.earned,'Earned'); assert.equal(LB.starterGrant,'Starter grant'); assert.match(LB.faucet,/not earned/);
  assert.match(CM.confirmPrompt.text,/\{reward\}/); assert.match(CM.alreadyClaimed.text,/already claimed/); assert.match(HS.empty.text,/^No rewards yet/); assert.match(HS.notOpen.text,/not open yet/); assert.match(NT.sparkStays.text,/^Spark stays in the world/);
  for (const l of [CL.row,CL.claimAccessibleName,LB.starterGrantHelp,LB.faucetHelp,CM.confirmPrompt,CM.claimed,CM.alreadyClaimed,HS.empty,HS.notOpen,NT.sparkStays]) assert.equal(l.proposal,true); for (const o of [CL,LB,CM,HS,NT]) assert.equal(o.proposal,true);
  assert.equal(new Set(all()).size,all().length);
});
test('limits with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=KIOSK_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=KIOSK_LINE_MAX,`${t} (${fill(t).length})`);
  for (const t of bodies()) assert.ok(fill(t).length<=KIOSK_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only {reward} and {work}, and only where an amount or the work is shown', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(KIOSK_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  const withPh=[CL.row.text,CL.claimAccessibleName.text,CM.confirmPrompt.text,CM.claimed.text];
  for (const t of withPh) assert.match(t,/\{reward\}/,t); for (const t of all().filter(x=>!withPh.includes(x))) assert.doesNotMatch(t,/\{/,t);
});
test('no figure, cap or amount is written into any line', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|\b(one|two|three|four|five|six|seven|ten|twice|once|half|daily|weekly|monthly|per day|per week)\b|\b(hours?|days?|weeks?|months?|years?)\b/i,t);
});
test('capped rewards for verified work only: the intros say so; nothing is "free", passive or unconditional', () => {
  for (const n of ['kindle','korund']) assert.match(NV[n].intro.text,/Rewards are capped/);
  assert.match(NV.aurelle.intro.text,/Rewards are capped/); for (const n of KIOSK_NATIONS) assert.match(NV[n].intro.text,/verified|earned/);
  for (const t of all()) assert.doesNotMatch(t,/\b(free|bonus|jackpot|airdrop\w*|passive|holding|owners?|lucky|win\w*|guarantee\w*|promise\w*|always)\b/i,t);
});
test('no buy, convert, exchange, cash-out, real-money, Tessera, chain or NFT wording anywhere', () => {
  for (const t of all()) assert.doesNotMatch(t,/\b(buy\w*|bought|sell\w*|sold|purchase\w*|convert\w*|conversion|exchang\w*|swap\w*|trade\w*|trading|cash\w*|withdraw\w*|redeem\w*|real money|fiat|dollar\w*|crypto\w*|Tessera|TSR|token\w*|on-chain|chain|wallet\w*|NFT\w*|mint\w*|land)\b/i,t);
});
test('earned versus not earned: starter grants and faucets are never called earned', () => {
  for (const t of [LB.starterGrant,LB.faucet,LB.starterGrantHelp.text,LB.faucetHelp.text]) assert.doesNotMatch(t.replace(/not (an )?earned( reward)?/gi,''),/earned/i,t);
  assert.match(LB.starterGrantHelp.text,/not an earned reward/); assert.match(LB.faucetHelp.text,/not an earned reward/);
});
test('nation voice differs for Kindle, Korund and Aurelle, in word choice only', () => {
  assert.equal(new Set(KIOSK_NATIONS.map(n=>NV[n].title)).size,3); assert.equal(new Set(KIOSK_NATIONS.map(n=>NV[n].intro.text)).size,3);
  assert.match(NV.kindle.intro.text,/^Claim what you earned/); assert.match(NV.korund.intro.text,/for all\./); assert.match(NV.aurelle.intro.text,/may be claimed here/);
  for (const t of all()) assert.doesNotMatch(t,/Chairman|Crown|Monarch|President|Plan Commission|Assembly|Privy|Be it known|State Media|Kindle Press|Court Gazette|Notable|@|!/,t);
});
test('system chrome: no byline, no AI badge, no pressure', () => {
  for (const o of [CL,LB,CM,HS,NT,...KIOSK_NATIONS.map(n=>NV[n])]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const t of all()) assert.doesNotMatch(t,/\b(hurry|last chance|must|expire\w*|lose|lost|regret\w*|punish\w*)\b/i,t);
});
test('wired only into the #466 kiosk: just app/wallet-panel.tsx imports reward-kiosk-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('reward-kiosk-copy.ts')&&f!=='app/wallet-panel.tsx') assert.doesNotMatch(readFileSync(f,'utf8'),/reward-kiosk-copy/, f);
  assert.match(readFileSync('app/wallet-panel.tsx','utf8'),/@\/lib\/reward-kiosk-copy/);
});
