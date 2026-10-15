import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress, aurelleGazette } from '../lib/press-templates.ts';
import { invitationCopy, cooldownNotices, hostPermissionNotices } from '../lib/missionary-copy.ts';

// lib/missionary-notice-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next). Node's
// type stripping cannot resolve that, so load it as tests/war-copy.test.mjs does: rewrite the specifier and transpile.
const src=readFileSync('lib/missionary-notice-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'missionary-notice-')),'missionary-notice-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const { missionaryInvite:I, missionaryOutcomes:O, missionaryCooldowns:C, missionaryFeed:F, FEED_NATIONS, MISSIONARY_PLACEHOLDERS, MISSIONARY_NAME_MAX, MISSIONARY_LABEL_MAX, MISSIONARY_LINE_MAX } = await import(pathToFileURL(out).href);

const labels=()=>[I.accept,I.notNow];
const lineObjs=()=>[I.prompt,O.success,O.declined,O.failure,C.invitation,C.faithChange];
const lineTexts=()=>[...lineObjs().map(l=>l.text),...Object.values(F).map(l=>l.text)];
const fill=t=>MISSIONARY_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(MISSIONARY_NAME_MAX)),t);

test('shape: invite, accept/decline, success, failure, cooldown and feed lines exist; every line proposal', () => {
  for (const o of [I,O,C]) assert.equal(o.proposal,true);
  for (const l of lineObjs()) { assert.equal(l.proposal,true); assert.ok(l.text.length>0); }
  assert.deepEqual(labels(),['Accept','Not now']);
  // #383: the generic prompt and the per-faith cards offer the same two labels for the same invitation.
  for (const i of Object.values(invitationCopy)) { assert.equal(i.buttons.accept,I.accept); assert.equal(i.buttons.notNow,I.notNow); }
  assert.equal(Object.hasOwn(I,'decline'),false);
  assert.deepEqual(Object.keys(F),[...FEED_NATIONS]); assert.deepEqual([...FEED_NATIONS],['kindle','aurelle']);
  for (const l of Object.values(F)) { assert.equal(l.proposal,true); assert.equal(typeof l.aiBadge,'boolean'); }
});
test('Accept matches the existing buttons in lib/missionary-copy.ts; the existing cards and notices still exist', () => {
  for (const c of Object.values(invitationCopy)) assert.equal(c.buttons.accept,I.accept);
  assert.ok(cooldownNotices.invitationRecent&&cooldownNotices.faithChangeLocked&&hostPermissionNotices.korund);
});
test('re-exports the shared name cap; labels 40, lines 80, with every placeholder filled to 24 characters', () => {
  assert.equal(MISSIONARY_NAME_MAX,COUP_NAME_MAX); assert.equal(MISSIONARY_NAME_MAX,24);
  assert.equal(MISSIONARY_LABEL_MAX,40); assert.equal(MISSIONARY_LINE_MAX,80);
  for (const t of labels()) assert.ok(fill(t).length<=MISSIONARY_LABEL_MAX, t);
  for (const t of lineTexts()) assert.ok(fill(t).length<=MISSIONARY_LINE_MAX, `${t} (${fill(t).length})`);
});
test('placeholders: only {readyAt}, {faith}, {city}; each used in the right lines', () => {
  assert.deepEqual([...MISSIONARY_PLACEHOLDERS],['{readyAt}','{faith}','{city}']);
  const all=lineTexts().join(' ');
  for (const m of all.matchAll(/\{[^}]+\}/g)) assert.ok(MISSIONARY_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const p of MISSIONARY_PLACEHOLDERS) assert.ok(all.includes(p), p);
  for (const l of [C.invitation,C.faithChange]) assert.deepEqual(l.text.match(/\{[^}]*\}/g),['{readyAt}']);
  for (const l of [I.prompt,O.success]) assert.deepEqual(l.text.match(/\{[^}]*\}/g),['{faith}']);
  for (const l of Object.values(F)) assert.deepEqual(l.text.match(/\{[^}]*\}/g),['{faith}','{city}']);
  for (const l of [O.declined,O.failure]) assert.doesNotMatch(l.text,/\{/);
});
test('no invented figures: no digits or number and duration words; cooldown time only through {readyAt}', () => {
  for (const t of lineTexts()) {
    assert.doesNotMatch(t,/\d|%|percent/i, t);
    assert.doesNotMatch(t,/\b(one|two|three|four|five|six|seven|ten|dozen|many|several|days?|weeks?|hours?|minutes?|months?|years?)\b/i, t.replace(/The choice is yours alone/,''));
  }
  assert.doesNotMatch(C.invitation.text+C.faithChange.text,/\b(UTC|GMT)\b|\b(AM|PM)\b/);
});
test('private lines are nation-neutral and faith-neutral: the faith comes only through {faith}', () => {
  for (const l of [I.prompt,O.success,O.declined,O.failure,C.invitation,C.faithChange]) {
    assert.doesNotMatch(l.text,/Kindle|Korund|Aurelle|Republic|Crown|Chairman|State Media|Gazette/, l.text);
    assert.doesNotMatch(l.text,/Kinward|Fair-Wind|Open Hand|Lumen|Quiet Path|Round/i, l.text);
  }
});
test('only the player chooses: no coercion, no state or missionary changing faith, no blame on failure', () => {
  for (const t of lineTexts()) {
    assert.doesNotMatch(t,/\b(must|forced?|required|compulsory|obey|last chance|act now|hurry|don't miss|only chance|should|will be converted|converts you)\b/i, t);
    assert.doesNotMatch(t,/(state|missionary|Crown|Monarch|Chairman) (changes|converts|will change)/i, t);
  }
  assert.match(I.prompt.text,/The choice is yours alone\./); assert.match(O.success.text,/The choice was yours\./);
  assert.match(O.declined.text,/Nothing about your faith has changed/); assert.match(O.failure.text,/Your faith has not changed/);
  assert.doesNotMatch(O.failure.text,/\byou (failed|refused|did not)\b|your fault/i);
});
test('feed lines: never name a player or say who converted; bylines are canon; no AI badge on reports', () => {
  assert.deepEqual(F.kindle.byline,kindlePress.byline); assert.deepEqual(F.aurelle.byline,aurelleGazette.byline);
  assert.notEqual(F.kindle.text,F.aurelle.text); assert.doesNotMatch(F.kindle.text+F.aurelle.text,/State Media|Be it known/);
  for (const l of Object.values(F)) {
    assert.equal(l.aiBadge,false); assert.doesNotMatch(l.text,/Be it known/);
    assert.doesNotMatch(l.text,/\b(you|your|citizen|player|member|convert\w*|joined|follower|flock|souls?)\b/i, l.text);
  }
});
test('Korund has no public line (preaching is banned, §14.8); private lines name no faith', () => {
  assert.ok(!('korund' in F)); assert.ok(!FEED_NATIONS.includes('korund'));
  assert.match(hostPermissionNotices.korund[0].text,/banned/);
});
test('faith-neutral and social tone: no tiers, gating or posture verbs; no real-world religion terms; no Notable', () => {
  for (const t of lineTexts()) {
    assert.doesNotMatch(t,/production|output|yield|combat|bonus|boost|wages?|profit|income|faster/i, t);
    assert.doesNotMatch(t,/\b(Devotion|Newcomer|Devoted|Pillar|clergy|office|tier|threshold|unlock\w*)\b/i, t);
    assert.doesNotMatch(t,/\b(kneel\w*|bow\w*|stand\w*|sit\w*|prostrat\w*)\b/i, t);
    assert.doesNotMatch(t,/\b(church|mosque|temple|synagogue|priest|imam|rabbi|monk|bishop|pope|christ\w*|islam\w*|jew\w*|buddh\w*|hindu\w*|bible|quran|torah|god|pray\w*|evangel\w*|bapti\w*)\b/i, t);
    assert.doesNotMatch(t,/Notable/);
  }
});
test('unwired: nothing in app/ or components/ imports missionary-notice-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/missionary-notice-copy/, f);
});
