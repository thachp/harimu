import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// #381 (ARC, harimu-docs ui-ux 23.2): ONE rule for every notice. Badge every line that speaks for an AI leader or body: the Crown
// ("Be it known", "By royal decree"), the Korund Chairman and Presidium (State Media lines for the state's own acts), AI hopeful and
// town-hall cards. A bylined report ABOUT an AI body (Kindle Wire Service, Court Gazette world reports, foreign-war State Media) is not
// a line spoken for it. This scan reads every lib/*-copy.ts and lib/press-templates.ts, so a new or wired module cannot drift.
// Modules re-export the shared name cap from './palace-coup-copy' (extensionless for tsc/Next), which Node's type stripping cannot resolve,
// so each module is loaded as tests/war-copy.test.mjs does: rewrite that specifier and transpile.
const dir=mkdtempSync(join(tmpdir(),'ai-badge-'));
const palace=pathToFileURL(resolve('lib/palace-coup-copy.ts')).href;
const load=async name=>{
  const src=readFileSync(`lib/${name}.ts`,'utf8').replaceAll("from './palace-coup-copy'",`from ${JSON.stringify(palace)}`);
  const out=join(dir,`${name}.mjs`); writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  return import(pathToFileURL(out).href);
};
const files=[...readdirSync('lib').filter(f=>/-copy\.ts$/.test(f)).map(f=>f.slice(0,-3)),'press-templates'].sort();
const mods=Object.fromEntries(await Promise.all(files.map(async f=>[f,await load(f)])));

const CROWN=/^(Be it known|By royal decree)/;
const TEXT_FIELDS=['text','body','bodyNoGrievance'];
// Every object that carries an `aiBadge` field, with the lines it speaks and the path it was found at.
const records=(value,path=[],out=[],seen=new Set())=>{
  if(!value||typeof value!=='object'||seen.has(value))return out; seen.add(value);
  if(typeof value.aiBadge==='boolean'){ const lines=TEXT_FIELDS.flatMap(k=>typeof value[k]==='string'?[value[k]]:Array.isArray(value[k])?value[k].filter(x=>typeof x==='string'):[]); out.push({path:path.join('.'),record:value,lines}); }
  for(const [k,v] of Object.entries(value))records(v,[...path,k],out,seen);
  return out;
};
const all=files.flatMap(f=>records(Object.fromEntries(Object.entries(mods[f]).filter(([k])=>!/^[A-Z_]+$/.test(k))),[f]));

test('the scan finds every badged record in every copy module', () => {
  assert.ok(files.length>=15, files.join(','));
  assert.ok(all.length>=60, `only ${all.length} records scanned`);
  for (const f of ['war-copy','diplomacy-copy','embargo-copy','peace-copy','presidium-copy','palace-coup-copy','press-templates','campaign-copy']) assert.ok(all.some(r=>r.path.startsWith(f)), f);
  for (const r of all) assert.equal(typeof r.record.aiBadge,'boolean', r.path);
});
test('rule 1: every Crown decree line is badged, whatever module it is in', () => {
  for (const r of all) if(r.lines.some(l=>CROWN.test(l))) assert.equal(r.record.aiBadge,true, `${r.path}: ${r.lines[0]}`);
});
test('rule 2: no Kindle report, no Gazette report and no foreign-war report is badged as if it were an AI leader', () => {
  for (const r of all) if(/^[\w-]+\.(declarationNotices|mobilizationEndedNotices|embargoPress|peacePress|ratificationNews)/.test(r.path)||r.path.startsWith('press-templates.kindlePress')) {
    if(CROWN.test(r.lines.join(' '))) continue;
    const kindle=/kindle/i.test(r.path)||/\bkindle-/.test(r.record.id??r.record.key??'')||r.record.nationId==='kindle';
    if(kindle) assert.equal(r.record.aiBadge,false, r.path);
  }
});
test('Korund: lines for the state\'s own acts speak for the AI Chairman and Presidium, so they are badged (war, diplomacy, embargo, peace)', () => {
  const war=mods['war-copy'], dip=mods['diplomacy-copy'], emb=mods['embargo-copy'], peace=mods['peace-copy'];
  for (const side of ['ours','against-us']) { assert.equal(war.noticesFor('korund').notices[side].aiBadge,true,`declaration ${side}`); assert.equal(war.endedNoticesFor('korund').notices[side].aiBadge,true,`ended ${side}`); }
  assert.equal(war.noticesFor('korund').notices.world.aiBadge,false); assert.equal(war.endedNoticesFor('korund').notices.world.aiBadge,false);
  assert.equal(dip.ratificationFor('korund:any').aiBadge,true); assert.match(dip.ratificationFor('korund:any').body,/Chairman/);
  // Embargo: `{actor}` can be any nation, so the generic Korund report is not an AI leader speaking; the Chairman's own act is (ARC on #407).
  for (const l of Object.values(emb.pressFor('korund').report)) { assert.equal(l.aiBadge,false); assert.match(l.text,/\{actor\}/); }
  for (const l of Object.values(emb.pressFor('korund').chairman)) { assert.equal(l.aiBadge,true); assert.match(l.text,/the Chairman/); assert.doesNotMatch(l.text,/\{actor\}/); }
  for (const l of Object.values(peace.peacePressFor('korund').report)) assert.equal(l.aiBadge,true);
  // Same Chairman, same answer in every module: no Korund State Media own-act line is left unbadged.
  assert.equal(war.noticesFor('korund').notices.ours.aiBadge, dip.ratificationFor('korund:any').aiBadge);
});
test('Korund presidium-copy: lines speaking for the Presidium or Chairman are badged, rumor lines are not', () => {
  const stages=mods['presidium-copy'].presidiumCopy;
  for (const s of stages) for (const i of s.items) if(/^The Presidium (has|announces)|Chairman \{\w+\} (remains|now)|The Chairman thanks/.test(i.body)) assert.equal(i.aiBadge,true,i.id);
  for (const i of stages.find(s=>s.stage==='session-rumored').items) assert.equal(i.aiBadge,false,i.id);
  assert.equal(mods['presidium-copy'].successorBiography.aiBadge,true);
});
test('Aurelle: Crown lines are badged, Gazette reports are not', () => {
  const war=mods['war-copy'];
  assert.equal(war.noticesFor('aurelle').notices.ours.aiBadge,true); assert.equal(war.noticesFor('aurelle').notices['against-us'].aiBadge,true); assert.equal(war.noticesFor('aurelle').notices.world.aiBadge,false);
  assert.equal(mods['diplomacy-copy'].ratificationFor('aurelle:any').aiBadge,true);
  for (const l of Object.values(mods['embargo-copy'].pressFor('aurelle').report)) assert.equal(l.aiBadge,false);
  for (const l of Object.values(mods['embargo-copy'].pressFor('aurelle').crown)) assert.equal(l.aiBadge,true);
  for (const l of Object.values(mods['peace-copy'].peacePressFor('aurelle').report)) assert.equal(l.aiBadge,false);
  assert.equal(mods['peace-copy'].peacePressFor('aurelle').crown.signed.aiBadge,true);
});
test('campaign hopeful card and town hall keep their badge', () => {
  const c=mods['campaign-copy']; const recs=all.filter(r=>r.path.startsWith('campaign-copy'));
  assert.ok(recs.length>=2); for (const r of recs) assert.equal(r.record.aiBadge,true, r.path);
  assert.ok(c);
});
test('press templates: every template has an explicit badge; Crown decrees and the Presidium notice are badged, nothing else', () => {
  const packs=Object.values(mods['press-templates'].pressPacks);
  const tpls=packs.flatMap(p=>p.templates.map(t=>({nation:p.nationId,...t})));
  assert.ok(tpls.length>=30);
  for (const t of tpls) { assert.equal(typeof t.aiBadge,'boolean',t.id); if(CROWN.test(t.body[0])) assert.equal(t.aiBadge,true,t.id); }
  assert.deepEqual(tpls.filter(t=>t.aiBadge).map(t=>t.id).sort(),['aurelle-debasement','aurelle-decree','korund-presidium-notice']);
  assert.match(tpls.find(t=>t.id==='aurelle-decree').body[0],/^Be it known/); assert.match(tpls.find(t=>t.id==='aurelle-debasement').body[0],/^By royal decree/);
  assert.match(tpls.find(t=>t.id==='korund-presidium-notice').body[0],/^The Presidium has/);
  for (const t of tpls.filter(t=>t.nation==='kindle')) assert.equal(t.aiBadge,false,t.id);
});
test('claimant Crown gazette lines carry an explicit badge flag', () => {
  const stages=mods['claimant-copy'].risingStageCopy;
  assert.equal(stages.length,4);
  for (const s of stages) { assert.equal(typeof s.crownGazetteAiBadge,'boolean',s.stage); assert.equal(s.crownGazetteAiBadge,CROWN.test(s.crownGazette),s.stage); }
  assert.deepEqual(stages.filter(s=>s.crownGazetteAiBadge).map(s=>s.stage),['crisis-window-open','rising-succeeded','rising-failed']);
  assert.equal(stages[0].crownGazetteAiBadge,false);
});
test('palace-coup: the Crown speaks (decrees included), the Gazette reports are not badged', () => {
  for (const s of mods['palace-coup-copy'].palaceCoupCopy) for (const i of s.gazette) { if(CROWN.test(i.body)) assert.equal(i.aiBadge,true,i.id); }
});
