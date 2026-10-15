import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress } from '../lib/press-templates.ts';
import { kindleParties } from '../lib/kindle-parties.ts';

// lib/kindle-primary-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next). Node's type
// stripping cannot resolve that, so load it as tests/campaign-copy.test.mjs does: rewrite the specifier and transpile.
const src=readFileSync('lib/kindle-primary-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'kindle-primary-')),'kindle-primary-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const { partyMembershipCopy:M, primaryBallotCopy:B, primaryResultCopy:R, PRIMARY_PLACEHOLDERS, PRIMARY_NAME_MAX, PRIMARY_LABEL_MAX, PRIMARY_LINE_MAX } = await import(pathToFileURL(out).href);

const labels=()=>[M.joinButton,M.leaveButton,B.title,B.submitButton,R.headline];
const lineObjs=()=>[M.joinConfirm,M.leaveConfirm,M.joined,M.left,M.alreadyMember,M.notMember,M.inOtherParty,B.scope,B.instructions,B.submitConfirm,B.locked,B.notMemberBlock,B.otherPartyBlock,R.summary];
const lines=()=>lineObjs().map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>PRIMARY_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(PRIMARY_NAME_MAX)),t);

test('shape: join/leave, already/not a member, ballot chrome and a result headline exist; every line proposal', () => {
  for (const o of [M,B,R]) assert.equal(o.proposal,true);
  for (const l of lineObjs()) { assert.equal(l.proposal,true); assert.ok(l.text.length>0); }
  assert.equal(M.joinButton,'Join {party}'); assert.equal(M.leaveButton,'Leave {party}'); assert.equal(B.submitButton,'Submit ranking');
  assert.match(M.alreadyMember.text,/already a member/); assert.match(M.notMember.text,/not a member/);
  assert.match(B.locked.text,/locked/); assert.match(B.submitConfirm.text,/cannot change it after/); assert.match(B.instructions.text,/first choice at the top/);
  assert.equal(R.aiBadge,false);
});
test('re-exports the shared name cap; labels 40, lines 80, with every placeholder filled to 24 characters', () => {
  assert.equal(PRIMARY_NAME_MAX,COUP_NAME_MAX); assert.equal(PRIMARY_NAME_MAX,24);
  assert.equal(PRIMARY_LABEL_MAX,40); assert.equal(PRIMARY_LINE_MAX,80);
  for (const t of labels()) assert.ok(fill(t).length<=PRIMARY_LABEL_MAX, `${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=PRIMARY_LINE_MAX, `${t} (${fill(t).length})`);
});
test('placeholders: only {party} and {district}; {district} only where a district is the point; party only via {party}', () => {
  assert.deepEqual([...PRIMARY_PLACEHOLDERS],['{party}','{district}']);
  const t=all().join(' ');
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(PRIMARY_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const p of PRIMARY_PLACEHOLDERS) assert.ok(t.includes(p), p);
  assert.deepEqual(all().filter(x=>x.includes('{district}')),[B.scope.text,R.summary.text]);
  for (const p of kindleParties) { assert.ok(!t.includes(p.name), p.name); assert.ok(!t.includes(p.id)); }
  assert.doesNotMatch(M.inOtherParty.text,/\{/); assert.doesNotMatch(B.otherPartyBlock.text,/\{/);
});
test('no invented figures: no digits, counts, shares, turnout or winner in the result headline', () => {
  for (const t of all()) assert.doesNotMatch(t.replace('one party at a time',''),/\d|%|percent|\b(one|two|three|four|five|six|ten|first round|round|rounds)\b|\bvotes\b|turnout|margin|landslide|majority|plurality|dues/i, t.replace('one party at a time',''));
  assert.doesNotMatch(R.headline+R.summary.text,/\{(hopeful|candidate)\}|wins?\b|won\b|elected|defeat/i);
});
test('Republic Wire Service headline: canon byline, plain wire report, no quotes or AI persona', () => {
  assert.deepEqual(R.byline,kindlePress.byline);
  for (const t of [R.headline,R.summary.text]) { assert.doesNotMatch(t,/["“”]|\bsaid\b|\bsays\b|Be it known|State Media|Gazette/i, t); }
  assert.ok(R.headline.includes('{party}')); assert.ok(R.summary.text.includes('{party}')&&R.summary.text.includes('{district}'));
});
test('members only: non-members and other parties are refused with reasons; AI citizens are not named as voters', () => {
  assert.match(B.notMemberBlock.text,/Only \{party\} members/); assert.match(B.otherPartyBlock.text,/your own party's primary/);
  for (const t of all()) assert.doesNotMatch(t,/AI citizens? (can|may|will) vote/i, t);
  assert.match(M.joinConfirm.text,/one party at a time/); assert.match(M.inOtherParty.text,/already belong to a party/);
});
test('no count method, dues, rewards or campaign money; no pressure to join', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/instant|runoff|ranked-choice|elimination/i, t);
    assert.doesNotMatch(t,/dues|fee|donat|reward|earn|bonus|prize|coin|Spark|Crown|currency|money|payout|\bpay\b|campaign fund/i, t);
    assert.doesNotMatch(t,/\b(must|forced?|required|hurry|last chance|act now|don't miss|should)\b/i, t);
  }
});
test('no endorsing body, no Notable, no real-world references', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/endors|journalist|union|guild|church|bank/i); assert.doesNotMatch(t,/Notable/);
  assert.doesNotMatch(t,/\b(Earth|America|Congress|Senate|Parliament|Democrat|Republican|Labour|Tory|London|Washington)\b/);
});
test('unwired: nothing in app/ or components/ imports kindle-primary-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/kindle-primary-copy/, f);
});
