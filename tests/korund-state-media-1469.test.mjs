/** #1469: Korund State Media writers, kit-only articles (docs §18.2). Flag HARIMU_KORUND_STATE_MEDIA_WRITERS_ENABLED, GRAY 95. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';
import {localRuntime} from './helpers/local-runtime.mjs';
import {FLAG_PACKS,flagOn} from '../lib/flag-pack.mjs';
import {korundStateMediaKit,korundStateMediaEntry,kitTextFits} from '../lib/korund-state-media-kit.ts';

const FLAG='HARIMU_KORUND_STATE_MEDIA_WRITERS_ENABLED';
const flagOffError='Korund State Media writers are not available yet.';
const nationError='Only a Korund citizen can file a State Media article.';
const kitError='That article is not in the State Media kit.';
const figureError='That article needs a ledger figure that is not available yet.';
const rateError='You can file one State Media article every 24 hours.';
const reusedError='That request id was already used for a different State Media article.';
const WINDOW=24*60*60;
const get=(r,user)=>r.call('news',user,undefined,'https://fixture.invalid','');
const post=(r,user,body)=>r.call('news',user,body);
const on=r=>r.setFixtureEnv(FLAG,'true');
const iso=ms=>new Date(Math.floor(ms/1000)*1000).toISOString().replace(/\.\d{3}Z$/,'Z');
const sec=r=>Math.floor(r.now/1000);
async function settleFood(r,user,food,id){
  const at=iso(r.now);
  await r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id,user,'korund-food-production','Fixture brigade','fixture',4,at,at,at).run();
  await r.db.prepare('INSERT INTO korund_settlements(shift_id,clerk_user_id,wage_minor,food_output,settled_at) VALUES (?,?,800,?,?)').bind(id,user,food,sec(r)).run();
}
async function setup(t,backend,users=['ava']){
  const r=await localRuntime({backend}); t.after(()=>r.close());
  const at=iso(r.now);
  for(const u of users) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'korund',?,18,0,'Good standing',?,?)").bind(u,u,at,at).run();
  return r;
}
async function spy(r,fn){const prepare=r.db.prepare.bind(r.db),seen={sql:[]};r.db.prepare=q=>{seen.sql.push(q);return prepare(q);};try{seen.result=await fn();}finally{r.db.prepare=prepare;}return seen;}

test('flag is preview true, production false, GRAY 95 at index 94, and the pack length goes up by 1',()=>{
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_AURELLE_RANKS_ENABLED'),93);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG),94);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length,97);
  const preview=JSON.parse(readFileSync('wrangler.jsonc','utf8').replace(/^\s*\/\/.*$/gm,''));
  const prod=JSON.parse(readFileSync('wrangler.prod.jsonc','utf8').replace(/^\s*\/\/.*$/gm,''));
  assert.equal(preview.vars[FLAG],undefined);
  assert.equal(prod.vars[FLAG],undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG],'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG],'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG),94);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).length,97);
  assert.equal(flagOn({HARIMU_GRAY_PACK:preview.vars.HARIMU_GRAY_PACK},FLAG),true);
  assert.equal(flagOn({HARIMU_GRAY_PACK:prod.vars.HARIMU_GRAY_PACK},FLAG),false);
});

test('migration 0134 is additive and matches the test schema',()=>{
  const d1=readFileSync('drizzle/0134_korund_state_media_articles.sql','utf8');
  const pg=readFileSync('db/postgres/0134_korund_state_media_articles.sql','utf8');
  const lib=readFileSync('lib/korund-state-media.ts','utf8');
  for(const src of [d1,pg,lib]){
    assert.match(src,/CREATE TABLE IF NOT EXISTS korund_state_media_articles/);
    assert.match(src,/request_id TEXT[^\n]*NOT NULL UNIQUE/);
    assert.match(src,/approval_status/);
    assert.match(src,/approver/);
    assert.match(src,/approval_rule_id/);
    assert.doesNotMatch(src,/DROP TABLE|ALTER TABLE .*DROP/i);
  }
  assert.match(pg,/COLLATE "C"/);
  assert.match(pg,/published_at BIGINT/);
  assert.match(lib,/KORUND_STATE_MEDIA_FILING_WINDOW_SECONDS = 24 \* 60 \* 60/);
  assert.match(lib,/KORUND_STATE_MEDIA_APPROVER = 'directorate'/);
  assert.match(lib,/KORUND_STATE_MEDIA_APPROVAL_RULE_ID = 'kit-only'/);
  assert.match(lib,/ORDER BY a\.published_at DESC, a\.id DESC LIMIT 6/);
  assert.match(lib,/fillPosterText|readPosterFills/);
  assert.match(lib,/from '\.\/square-posters\.ts'/);
  assert.match(lib,/if \(prior\.author_user_id !== userId\) return \{ status: 409 as const, error: korundStateMediaRequestReusedError \}/);
});

test('the kit is 6–8 proposal:true templates that fit the press limits and use only #1367 placeholders',()=>{
  assert.ok(korundStateMediaKit.length>=6 && korundStateMediaKit.length<=8);
  for(const entry of korundStateMediaKit){
    assert.equal(entry.proposal,true);
    assert.ok(kitTextFits(entry),entry.id);
    const text=[entry.headline,...entry.paragraphs].join('\n');
    for(const m of text.matchAll(/\{[^}]+\}/g)) assert.ok(['{output_pct}','{city}','{brigade}'].includes(m[0]),m[0]);
    assert.doesNotMatch(text,/\d+%/);
  }
  assert.ok(korundStateMediaEntry('ksm-output'));
  assert.equal(korundStateMediaEntry('not-a-kit'),undefined);
  assert.ok(korundStateMediaKit.some(e=>[e.headline,...e.paragraphs].join('').includes('{output_pct}')));
});

for(const backend of ['sqlite','postgres']) test(`#1469 ${backend}: flag off refuses the action, GET is unchanged, and the table is not queried`,async t=>{
  const r=await setup(t,backend,['ava']);
  const before=await get(r,'ava');
  assert.equal(before.status,200);
  assert.ok(before.data.items.every(i=>i.paperName!=='Korund State Media'&&i.kind!=='player-article'));
  const seen=await spy(r,async()=>{
    const filed=await post(r,'ava',{action:'file-state-media',requestId:randomUUID(),entryId:'ksm-city'});
    assert.equal(filed.status,404);
    assert.equal(filed.data.error,flagOffError);
    const after=await get(r,'ava');
    assert.equal(after.status,200);
    assert.deepEqual(after.data,before.data);
    return after;
  });
  assert.equal(seen.sql.some(q=>/korund_state_media_articles/.test(q)),false);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM korund_state_media_articles').first()).n,0);
});

for(const backend of ['sqlite','postgres']) test(`#1469 ${backend}: filing, approval record, replay bind, rate limit, off-kit, missing output_pct, non-Korund 403, LIMIT 6`,async t=>{
  const r=await setup(t,backend,['ava','nia']);
  on(r);
  await r.db.prepare("UPDATE citizens SET display_name='Ava Shore' WHERE clerk_user_id='ava'").run();
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  const missing=await post(r,'ava',{action:'file-state-media',requestId:randomUUID(),entryId:'ksm-output'});
  assert.equal(missing.status,409);
  assert.equal(missing.data.error,figureError);
  assert.doesNotMatch(JSON.stringify(missing.data),/"0%"/);
  await settleFood(r,'ava',44,'settle-1');
  const requestId=randomUUID();
  const filed=await post(r,'ava',{action:'file-state-media',requestId,entryId:'ksm-output'});
  assert.equal(filed.status,200,filed.data.error);
  assert.equal(filed.data.article.headline,'Plan output: 110%');
  assert.deepEqual(filed.data.article.approval,{status:'approved',approver:'directorate',ruleId:'kit-only'});
  const row=await r.db.prepare('SELECT approval_status,approver,approval_rule_id FROM korund_state_media_articles WHERE request_id=?').bind(requestId).first();
  assert.equal(row.approval_status,'approved');
  assert.equal(row.approver,'directorate');
  assert.equal(row.approval_rule_id,'kit-only');
  const replay=await post(r,'ava',{action:'file-state-media',requestId,entryId:'ksm-output'});
  assert.equal(replay.status,200);
  assert.equal(replay.data.article.id,filed.data.article.id);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM korund_state_media_articles').first()).n,1);
  const stolen=await post(r,'nia',{action:'file-state-media',requestId,entryId:'ksm-output'});
  assert.equal(stolen.status,409);
  assert.equal(stolen.data.error,reusedError);
  assert.equal(stolen.data.article,undefined);
  const edition=await get(r,'nia');
  assert.equal(edition.status,200);
  const players=edition.data.items.filter(i=>i.kind==='player-article');
  assert.equal(players.length,1);
  assert.equal(players[0].paperName,'Korund State Media');
  assert.equal(players[0].source,'player');
  assert.equal(players[0].title,'Plan output: 110%');
  assert.equal(players[0].authorName,'Ava Shore');
  assert.ok(players.every(i=>!/AI-generated|ai-text-tag/.test(JSON.stringify(i))));
  assert.ok(players.every(i=>!i.title.includes('{')&&!i.text.includes('{')));
  await settleFood(r,'ava',4,'settle-2'); // 48/40=120%
  const updated=await get(r,'nia');
  assert.ok(updated.data.items.some(i=>i.kind==='player-article'&&i.title==='Plan output: 120%'));
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE',`ava@${iso(r.now-60_000)}`);
  const others=await get(r,'nia');
  assert.equal(others.data.items.some(i=>i.kind==='player-article'&&i.authorName==='Ava Shore'),false);
  const mine=await get(r,'ava');
  assert.ok(mine.data.items.some(i=>i.kind==='player-article'&&i.authorName==='Ava Shore'));
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE',undefined);
  const second=await post(r,'ava',{action:'file-state-media',requestId:randomUUID(),entryId:'ksm-city'});
  assert.equal(second.status,409);
  assert.equal(second.data.error,rateError);
  r.setNow(r.now+(WINDOW-1)*1000);
  assert.equal((await post(r,'ava',{action:'file-state-media',requestId:randomUUID(),entryId:'ksm-city'})).status,409);
  r.setNow(r.now+1000);
  const afterWindow=await post(r,'ava',{action:'file-state-media',requestId:randomUUID(),entryId:'ksm-city'});
  assert.equal(afterWindow.status,200,afterWindow.data.error);
  const unknown=await post(r,'ava',{action:'file-state-media',requestId:randomUUID(),entryId:'not-a-kit'});
  assert.equal(unknown.status,400);
  assert.equal(unknown.data.error,kitError);
  const freeText=await post(r,'nia',{action:'file-state-media',requestId:randomUUID(),entryId:'ksm-city',headline:'Free text'});
  assert.equal(freeText.status,400);
  assert.equal(freeText.data.error,kitError);
  const kindle=await post(r,'alice',{action:'file-state-media',requestId:randomUUID(),entryId:'ksm-city'});
  assert.equal(kindle.status,403);
  assert.equal(kindle.data.error,nationError);
  const kindleGet=await get(r,'alice');
  assert.ok(kindleGet.data.items.every(i=>i.kind!=='player-article'||i.paperName!=='Korund State Media'));
  const published=sec(r);
  for(let i=0;i<6;i++){
    await r.db.prepare('INSERT INTO korund_state_media_articles (id,author_user_id,entry_id,published_at,request_id,approval_status,approver,approval_rule_id) VALUES (?,?,?,?,?,?,?,?)')
      .bind(`extra-${i}`,'nia','ksm-city',published+i,randomUUID(),'approved','directorate','kit-only').run();
  }
  const latest=await get(r,'nia');
  assert.equal(latest.data.items.filter(i=>i.kind==='player-article').length,6);
});

const mutate=(file,find,replace)=>{
  const original=readFileSync(file,'utf8');
  const next=original.replace(find,replace);
  assert.notEqual(next,original,`mutant did not apply in ${file}: ${find}`);
  writeFileSync(file,next);
  return ()=>writeFileSync(file,original);
};
const run=(files,pattern)=>{
  const env={...process.env}; delete env.NODE_TEST_CONTEXT;
  return spawnSync('node',['--experimental-strip-types','--test','--test-concurrency=1','--test-name-pattern',pattern,...files],{encoding:'utf8',cwd:new URL('..',import.meta.url).pathname,env});
};

test('#1469 mutations: replay bind, 24h boundary, off-kit, output_pct, flag gate, LIMIT, and approval record all fail',()=>{
  const file='tests/korund-state-media-1469.test.mjs';
  const cases=[
    {file:'lib/korund-state-media.ts',find:'if (prior.author_user_id !== userId) return { status: 409 as const, error: korundStateMediaRequestReusedError };',replace:'if (false) return { status: 409 as const, error: korundStateMediaRequestReusedError };',pattern:'replay bind'},
    {file:'lib/korund-state-media.ts',find:'KORUND_STATE_MEDIA_FILING_WINDOW_SECONDS = 24 * 60 * 60',replace:'KORUND_STATE_MEDIA_FILING_WINDOW_SECONDS = 23 * 60 * 60',pattern:'rate limit'},
    {file:'lib/korund-state-media.ts',find:'if (!korundStateMediaEntry(body.entryId)) return { error: korundStateMediaKitError };',replace:'if (false && !korundStateMediaEntry(body.entryId)) return { error: korundStateMediaKitError };',pattern:'off-kit'},
    {file:'lib/korund-state-media.ts',find:'if (!filled) return { status: 409 as const, error: korundStateMediaFigureError };',replace:'if (false && !filled) return { status: 409 as const, error: korundStateMediaFigureError };',pattern:'missing output_pct'},
    {file:'app/api/news/route.ts',find:'if(!flagOn(env,KORUND_STATE_MEDIA_FLAG))return privateJson({error:korundStateMediaFlagOffError},404);',replace:'if(false&&!flagOn(env,KORUND_STATE_MEDIA_FLAG))return privateJson({error:korundStateMediaFlagOffError},404);',pattern:'flag off refuses'},
    {file:'lib/korund-state-media.ts',find:'ORDER BY a.published_at DESC, a.id DESC LIMIT 6',replace:'ORDER BY a.published_at DESC, a.id DESC LIMIT 7',pattern:'LIMIT 6'},
    {file:'lib/korund-state-media.ts',find:"KORUND_STATE_MEDIA_APPROVER = 'directorate'",replace:"KORUND_STATE_MEDIA_APPROVER = 'chairman'",pattern:'approval record'},
  ];
  for(const c of cases){
    const restore=mutate(c.file,c.find,c.replace);
    try{
      const result=run([file],c.pattern);
      assert.notEqual(result.status,0,`mutant survived (${c.find}):\n${result.stdout}\n${result.stderr}`);
    }finally{restore();}
  }
});
