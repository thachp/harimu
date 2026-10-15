import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { contextStripLabels as Lb, contextStripStatus as S, CONTEXT_STRIP_LABEL_MAX } from '../lib/context-strip-copy.ts';

const states=[false,true].flatMap(guestDemo=>[false,true].flatMap(localDemo=>[false,true].flatMap(country=>[false,true].map(visitor=>({guestDemo,localDemo,country,visitor})))));

test('the five labels: the four existing ones are unchanged and not new wording, the visitor label is new', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(Lb).map(([k,v])=>[k,v.text])),{guestDemo:'Disposable sample',localDemo:'Browser-local demo',country:'Static lore · opt-in presence',citizen:'Citizen snapshot',visitor:'Visitor preview'});
  for (const k of ['guestDemo','localDemo','country','citizen']) assert.equal(Lb[k].proposal,false,k);
  assert.equal(Lb.visitor.proposal,true);
  assert.equal(new Set(Object.values(Lb).map(l=>l.text)).size,5);
  for (const l of Object.values(Lb)) assert.ok(l.text.length<=CONTEXT_STRIP_LABEL_MAX&&l.text.length>0);
});
test('a visitor never sees "Citizen snapshot", in any state', () => {
  for (const s of states.filter(s=>s.visitor)) assert.notEqual(S(s),'Citizen snapshot',JSON.stringify(s));
  assert.equal(S({visitor:true}),'Visitor preview');
});
test('a citizen still sees "Citizen snapshot" and never the visitor label', () => {
  for (const s of states.filter(s=>!s.visitor&&!s.guestDemo&&!s.localDemo&&!s.country)) assert.equal(S(s),'Citizen snapshot');
  assert.equal(S({}),'Citizen snapshot');
  for (const s of states.filter(s=>!s.visitor)) assert.notEqual(S(s),'Visitor preview',JSON.stringify(s));
});
test('the chain keeps the shell order: guest example, then local demo, then the country view, for citizens and visitors alike', () => {
  for (const visitor of [false,true]) {
    assert.equal(S({guestDemo:true,localDemo:true,country:true,visitor}),'Disposable sample');
    assert.equal(S({localDemo:true,country:true,visitor}),'Browser-local demo');
    assert.equal(S({country:true,visitor}),'Static lore · opt-in presence');
  }
});
test('the existing labels still match the shell source, so this module cannot drift from the strip it replaces', () => {
  const shell=readFileSync('app/game-shell.tsx','utf8');
  for (const k of ['guestDemo','localDemo','country','citizen']) assert.ok(shell.includes(`'${Lb[k].text}'`),Lb[k].text);
});
test('the visitor label is plain, has no figure and none of the citizen or demo wording', () => {
  assert.doesNotMatch(Lb.visitor.text,/\d|citizen|snapshot|demo|sample|disposable|guest|sign|account|log ?in|free|trial/i);
  assert.match(Lb.visitor.text,/^Visitor preview$/);
});
test('the header comment says visitor comes from isVisitorSession(...) when wired, and names no other lib module path', () => {
  const head=readFileSync('lib/context-strip-copy.ts','utf8').split('*/')[0];
  assert.match(head,/should come from isVisitorSession\(\.\.\.\) when this is wired/);
  assert.doesNotMatch(head,/\blib\/|\.ts\b|app\/|components\//);
});
test('unwired: nothing in app/, components/ or lib/ imports context-strip-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('context-strip-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/context-strip-copy/, f);
});
