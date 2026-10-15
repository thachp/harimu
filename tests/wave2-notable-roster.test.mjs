import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { wave2NotableProfiles, wave2Notables, wave2NotableRosterStatus, WAVE2_NOTABLE_NATIONS, WAVE2_NOTABLE_MIN_PER_NATION, WAVE2_NOTABLE_MAX_PER_NATION, WAVE2_NOTABLE_PERSONA_MAX, WAVE2_NOTABLE_INTRO_MAX } from '../lib/wave2-notable-roster.ts';
import { additionalNotableProfiles } from '../lib/notable-roster.ts';
import { notableProfiles } from '../lib/notable-profiles.ts';
import { nationNotableTopics } from '../lib/nation-notable-topics.ts';
import { citizenNameLists } from '../lib/citizen-names.ts';

const all=Object.values(wave2NotableProfiles).flat();
const mvp=[...Object.values(notableProfiles),...Object.values(additionalNotableProfiles).flat()];
const wordsOf=n=>n.split(/\s+/);

test('Confluence and Hoarvale only, inactive, 3-6 profiles each, correct field shape', () => {
  assert.equal(wave2NotableRosterStatus,'inactive');
  assert.deepEqual(Object.keys(wave2NotableProfiles).sort(),['confluence','hoarvale']); assert.deepEqual([...WAVE2_NOTABLE_NATIONS].sort(),['confluence','hoarvale']);
  for (const n of WAVE2_NOTABLE_NATIONS) { const ps=wave2Notables(n); assert.ok(ps.length>=WAVE2_NOTABLE_MIN_PER_NATION&&ps.length<=WAVE2_NOTABLE_MAX_PER_NATION, n);
    for (const p of ps) { assert.deepEqual(Object.keys(p).sort(),['id','introduction','name','persona','role']); assert.ok(p.id.startsWith(`${n}-`), p.id);
      for (const v of Object.values(p)) assert.ok(typeof v==='string'&&v.trim()===v&&v.length>0, p.id);
      assert.ok(p.persona.length<=WAVE2_NOTABLE_PERSONA_MAX, `${p.id}: persona ${p.persona.length}`); assert.ok(p.introduction.length<=WAVE2_NOTABLE_INTRO_MAX, `${p.id}: intro ${p.introduction.length}`); } }
  for (const n of ['kindle','korund','aurelle','varkand','meridian','unknown']) assert.deepEqual(wave2Notables(n),[]);
});
test('unique ids, names and roles; no collision with MVP Notables', () => {
  for (const key of ['id','name','role']) assert.equal(new Set(all.map(p=>p[key])).size, all.length, key);
  const mvpIds=new Set(mvp.map(p=>p.id)), mvpNames=new Set(mvp.map(p=>p.name)), mvpRoles=new Set(mvp.map(p=>p.role));
  for (const p of all) { assert.ok(!mvpIds.has(p.id)&&!mvpNames.has(p.name)&&!mvpRoles.has(p.role), p.id); }
});
test('culture bible casts: every listed role has a profile', () => {
  const roles=Object.fromEntries(WAVE2_NOTABLE_NATIONS.map(n=>[n,wave2Notables(n).map(p=>p.role.toLowerCase()).join('|')]));
  for (const r of [/cooperative manager/,/almoner/,/faith affairs registrar/,/canal-racing captain/,/local-outlet editor/,/party cadre/]) assert.match(roles.confluence,r);
  for (const r of [/coalition whip/,/trading house board observer/,/mint & reserve economist/,/bathhouse keeper/,/sketch comedian/,/crown house herald/]) assert.match(roles.hoarvale,r);
});
test('names follow the nation rules and collide with no citizen name', () => {
  const lists=Object.values(citizenNameLists).flatMap(l=>[...l.given,...l.family]); const taken=new Set(lists);
  for (const p of all) for (const w of wordsOf(p.name)) assert.ok(!taken.has(w), `${p.id}: ${w} is a citizen name`);
  for (const p of wave2Notables('confluence')) { const [given,family,...rest]=wordsOf(p.name); assert.ok(given&&family&&rest.length===0, `${p.id}: two-part name`);
    assert.match(p.name,/aa|ee|ii|oo|uu/i, `${p.id}: doubled vowel`); assert.match(p.name,/[lmn]/i); assert.doesNotMatch(p.name,/[öø]/i); }
  for (const p of wave2Notables('hoarvale')) { const [given,family,...rest]=wordsOf(p.name); assert.ok(given&&family&&rest.length===0, `${p.id}: two-part name`);
    assert.match(family,/(hald|mark)$/, `${p.id}: family name ends -hald or -mark`); assert.match(p.name,/ö|aa/i, `${p.id}: ö or aa`); }
  assert.ok(wave2Notables('hoarvale').some(p=>/rk/.test(p.name)) && wave2Notables('hoarvale').some(p=>/ld/.test(p.name)));
});
test('every introduction states a conversation limit and promises nothing secret or decided', () => {
  for (const p of all) { assert.match(p.introduction,/cannot|not public|not advice|not fact/, p.id); assert.match(p.introduction,/^I /, p.id);
    assert.doesNotMatch(p.introduction,/\d|will (win|pass)|guarantee|I (can|will) (grant|change|promise|reveal)/i, p.id); }
  assert.ok(all.filter(p=>/not public|cannot tell/.test(p.introduction)).length>=3, 'some state what stays private');
});
test('no figures, no real-world references, no "Notable" as a rank, no one outside the AI cast', () => {
  const real=['earth','europe','asia','africa','america','china','japan','russia','london','paris','moscow','dollar','euro','vietnam','thailand','stalin','lenin','mao','trump','biden','putin','christmas','easter','ramadan'];
  for (const p of all) { const t=[p.name,p.role,p.persona,p.introduction].join(' '); assert.doesNotMatch(t,/\d/, p.id); assert.doesNotMatch(t,/\bNotable\b/, p.id);
    for (const r of real) assert.ok(!new RegExp(`\\b${r}\\b`,'i').test(t), `${p.id} mentions ${r}`); }
});
test('Confluence never mocks the Four Pillars; Hoarvale never insults the Sovereign', () => {
  const c=wave2Notables('confluence').map(p=>[p.persona,p.introduction].join(' ')).join(' ');
  assert.doesNotMatch(c,/Four Pillars|Pillar|Politburo|mock|fool|puppet|useless|ridicul|corrupt|rigged|stupid|the leadership (heeds|listens)/i);
  assert.doesNotMatch(c,/Moot|Sovereign|Prime Minister|Honors|Trading House|Kinward/);
  const h=wave2Notables('hoarvale').map(p=>[p.persona,p.introduction].join(' ')).join(' ');
  assert.doesNotMatch(h,/mock|fool|puppet|useless|ridicul|insult|idle|figurehead|parasite|stupid|overpaid/i);
  assert.doesNotMatch(h,/Four Pillars|cooperative|Party\b|Guidance Plan|Congress|Bureau|Almoner/);
  for (const p of wave2Notables('hoarvale')) if (/Sovereign/.test(p.persona)) assert.match(p.persona,/ceremony/, p.id);
});
test('personas fit government and religion: the faith roles stay neutral, the cadre and editor stay indirect', () => {
  const by=Object.fromEntries(all.map(p=>[p.id,p]));
  assert.match(by['confluence-faith-registrar'].persona,/never says which faith is better/); assert.match(by['confluence-faith-registrar'].introduction,/favor a faith/);
  assert.match(by['confluence-local-editor'].persona,/question for the current/); assert.match(by['confluence-party-cadre'].persona,/indirectly/);
  assert.doesNotMatch(JSON.stringify(wave2NotableProfiles),/prayer|divine|blessed be|heretic|infidel|sacred|god\b/i);
});
test('nation topics for both nations already exist (#111) and this roster adds speakers only', () => {
  for (const n of WAVE2_NOTABLE_NATIONS) assert.ok(Object.keys(nationNotableTopics[n]).length>=2, n);
  for (const p of all) assert.equal(Object.hasOwn(p,'topics'),false);
});
test('unwired: nothing in app/ or components/ imports wave2-notable-roster, and the live roster does not read it', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('wave2-notable-roster.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/wave2-notable-roster/, f);
});
