import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// The module re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and transpile.
const src=readFileSync('lib/support-resources-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'support-resources-copy-')),'support-resources-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const S = await import(pathToFileURL(out).href);
const { supportLink:LK, supportPanel:P, aiDistressFallbacks:AI, SUPPORT_NAME_MAX, SUPPORT_PLACEHOLDERS, SUPPORT_LABEL_MAX, SUPPORT_LINE_MAX } = S;

const labels=()=>[LK.label,LK.accessibleName,P.title,P.dismiss];
const panelLines=()=>[P.notTherapy.text,P.pointer.text,P.resource.text];
const aiLines=()=>AI.map(l=>l.text);
const all=()=>[...labels(),...panelLines(),...aiLines()];
const fill=t=>SUPPORT_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(SUPPORT_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/120; one placeholder, the resource slot', () => {
  assert.equal(SUPPORT_NAME_MAX,COUP_NAME_MAX); assert.equal(SUPPORT_LABEL_MAX,40); assert.equal(SUPPORT_LINE_MAX,120); assert.deepEqual([...SUPPORT_PLACEHOLDERS],['{resourceLink}']);
});
test('exports every #538 item: link label and accessible name, panel lines with the {resourceLink} slot, 3 to 5 AI fallback lines, a dismiss label; all proposal true and distinct', () => {
  assert.equal(LK.label,'Need support?'); assert.match(LK.accessibleName,/^Need support\?/); assert.match(P.resource.text,/\{resourceLink\}/); assert.equal(P.dismiss,'Back to the world');
  assert.ok(AI.length>=3&&AI.length<=5);
  for (const l of [P.notTherapy,P.pointer,P.resource,...AI]) assert.equal(l.proposal,true); for (const o of [LK,P]) assert.equal(o.proposal,true);
  assert.equal(new Set(all()).size,all().length);
});
test('limits: labels 40, lines 120, with {resourceLink} filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=SUPPORT_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of [...panelLines(),...aiLines()]) assert.ok(fill(t).length<=SUPPORT_LINE_MAX,`${t} (${fill(t).length})`);
});
test('only {resourceLink}, only in the resource line', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(SUPPORT_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const t of all().filter(x=>x!==P.resource.text)) assert.doesNotMatch(t,/\{/,t);
});
test('no digits, no hotline or organization names or numbers, no links, nothing region-specific written in', () => {
  for (const t of all()) { assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|https?:|www\.|\.com|@/i,t); assert.doesNotMatch(t,/\b(hotline|helpline|lifeline|crisis line|text line|call|dial|text us|emergency|911|112|999|988|samaritans?|suicide|self-harm|hurt yourself)\b/i,t); assert.doesNotMatch(t,/\b(America\w*|Europe\w*|England|France|Japan|China|Russia|United|national)\b/,t); }
});
test('not therapy and no diagnosis: the panel says so; nothing diagnoses, treats, advises or labels a condition', () => {
  assert.match(P.notTherapy.text,/game world/); assert.match(P.notTherapy.text,/does not offer therapy/);
  for (const t of all().filter(x=>x!==P.notTherapy.text)) assert.doesNotMatch(t,/\b(therap\w*|counsel\w*|diagnos\w*|treat\w*|disorder|depress\w*|anxi\w*|mental|illness|condition|symptom\w*|medicat\w*|doctor|clinical|session)\b/i,t);
  for (const t of all()) assert.doesNotMatch(t,/\b(you should|you must|you need to|try to|just|calm down|cheer up|it will be (ok|okay|fine)|everything will)\b/i,t);
});
test('real-world help only, no dependence: points to someone the player trusts or a local service; no promise to remember, follow up or be there; no feelings or friendship claimed', () => {
  assert.match(P.pointer.text,/someone you trust or a local support service/);
  for (const t of aiLines()) assert.match(t,/someone you trust|a person you trust|local service|local support service|support panel/,t);
  for (const t of all()) assert.doesNotMatch(t,/\b(remember\w*|follow up|check in|check on|come back to me|talk to me|i will be here|i am here for you|i'?ll be here|here for you|always|never|promise\w*|guarantee\w*|friend\w*|love|care about you|i care|miss you|lonely)\b/i,t);
});
test('AI fallback lines: each says it is an AI, steps out of character or the story, is badged, and none claims to be human; every other line is an unbadged system line', () => {
  for (const l of AI) { assert.equal(l.aiBadge,true); assert.match(l.text,/\bI am an AI\b/); assert.match(l.text,/out of character|out of the story|cannot replace real support/i); assert.doesNotMatch(l.text,/\b(I'?m|I am) (a )?(human|person|real)\b|\bas a human\b|\bmy (family|body|life)\b|\bwe humans\b/i); }
  for (const o of [LK,P]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const l of [P.notTherapy,P.pointer,P.resource]) assert.equal('aiBadge' in l,false);
  assert.ok(AI.filter(l=>/support panel/.test(l.text)).length>=2);
});
test('no detection or logging language, no urgency, no real-world references beyond "real-world help", no on-chain or Tessera topics', () => {
  for (const t of all()) { assert.doesNotMatch(t,/\b(detect\w*|flag\w*|log\w*|record\w*|monitor\w*|track\w*|profile\w*|notice\w*|we saw|we noticed|report\w*|alert\w*|escalat\w*)\b/i,t); assert.doesNotMatch(t,/!/,t); assert.doesNotMatch(t,/Tessera|NFT|on-chain|token\w*/i,t); }
});
test('unwired: nothing in app/, components/ or lib/ imports support-resources-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('support-resources-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/support-resources-copy/, f);
});
