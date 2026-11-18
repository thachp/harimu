import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {FLAG_PACKS} from '../lib/flag-pack.mjs';
import {PRESS_HEADLINE_MAX,PRESS_PARAGRAPH_MAX} from '../lib/press-templates.ts';

const FLAG='HARIMU_KINDLE_NEWSPAPERS_ENABLED';
const kindleNewspaperFlagOffError='Kindle newspapers are not available yet.';
const kindleNewspaperNationError='Only a Kindle citizen can found a newspaper or publish an article.';
const kindleNewspaperExistsError='You already founded a newspaper.';
const kindleNewspaperMissingError='Found a newspaper before publishing an article.';
const kindleNewspaperRequestReusedError='That request id was already used for a different newspaper or article.';
const kindleNewspaperTextError=`The newspaper name and headline must be 1–${PRESS_HEADLINE_MAX} characters, without control characters.`;
const kindleNewspaperParagraphError=`Publish one or two paragraphs, each 1–${PRESS_PARAGRAPH_MAX} characters, without control characters.`;
const get=(r,user)=>r.call('news',user,undefined,'https://fixture.invalid','');
const post=(r,user,body)=>r.call('news',user,body);
const on=(r)=>r.setFixtureEnv(FLAG,'true');
const iso=ms=>new Date(Math.floor(ms/1000)*1000).toISOString().replace(/\.\d{3}Z$/,'Z');

test('flag is preview true, production false, GRAY 93 at index 92',()=>{
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG),92);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.length,93);
  const preview=JSON.parse(readFileSync('wrangler.jsonc','utf8').replace(/^\s*\/\/.*$/gm,''));
  const prod=JSON.parse(readFileSync('wrangler.prod.jsonc','utf8').replace(/^\s*\/\/.*$/gm,''));
  assert.equal(preview.vars[FLAG],undefined);
  assert.equal(prod.vars[FLAG],undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG],'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG],'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG),92);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(FLAG),92);
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).length,93);
});

test('migration 0132 is additive and matches the test schema',()=>{
  const d1=readFileSync('drizzle/0132_kindle_newspapers.sql','utf8');
  const pg=readFileSync('db/postgres/0132_kindle_newspapers.sql','utf8');
  const lib=readFileSync('lib/kindle-newspapers.ts','utf8');
  for(const src of [d1,pg,lib]){
    assert.match(src,/CREATE TABLE IF NOT EXISTS kindle_newspapers/);
    assert.match(src,/request_id TEXT[^\n]*NOT NULL UNIQUE/);
    assert.match(src,/CREATE UNIQUE INDEX IF NOT EXISTS kindle_newspapers_founder/);
    assert.match(src,/CREATE TABLE IF NOT EXISTS kindle_articles/);
    assert.doesNotMatch(src,/DROP TABLE|ALTER TABLE .*DROP/i);
  }
  assert.match(pg,/COLLATE "C"/);
  assert.match(pg,/founded_at BIGINT/);
  assert.match(d1,/founded_at INTEGER/);
});

test('flag off refuses both actions, leaves GET unchanged, and does not query the new tables',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  const before=await get(r,'alice');
  assert.equal(before.status,200);
  assert.ok(before.data.items.every(i=>i.kind!=='player-article'&&i.source!=='player'));
  assert.equal((await post(r,null,{action:'found-paper',requestId:randomUUID(),name:'Harbor Ledger'})).status,401);
  const found=await post(r,'alice',{action:'found-paper',requestId:randomUUID(),name:'Harbor Ledger'});
  assert.equal(found.status,404);
  assert.equal(found.data.error,kindleNewspaperFlagOffError);
  const published=await post(r,'alice',{action:'publish',requestId:randomUUID(),headline:'Shifts posted',paragraphs:['One paragraph of news.']});
  assert.equal(published.status,404);
  assert.equal(published.data.error,kindleNewspaperFlagOffError);
  const after=await get(r,'alice');
  assert.equal(after.status,200);
  assert.deepEqual(after.data.items.map(i=>({id:i.id,kind:i.kind,source:i.source,title:i.title})),before.data.items.map(i=>({id:i.id,kind:i.kind,source:i.source,title:i.title})));
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM kindle_newspapers').first()).n,0);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM kindle_articles').first()).n,0);
});

test('a Kindle citizen founds a paper and another reader sees the bylined article',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  on(r);
  await r.db.prepare("UPDATE citizens SET display_name='Ada Shore' WHERE clerk_user_id='alice'").run();
  const requestId=randomUUID();
  const founded=await post(r,'alice',{action:'found-paper',requestId,name:'Harbor Ledger'});
  assert.equal(founded.status,200,founded.data.error);
  assert.equal(founded.data.paper.name,'Harbor Ledger');
  const replay=await post(r,'alice',{action:'found-paper',requestId,name:'Harbor Ledger'});
  assert.equal(replay.status,200);
  assert.equal(replay.data.paper.id,founded.data.paper.id);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM kindle_newspapers').first()).n,1);
  const stolen=await post(r,'bob',{action:'found-paper',requestId,name:'Harbor Ledger'});
  assert.equal(stolen.status,409);
  assert.equal(stolen.data.error,kindleNewspaperRequestReusedError);
  assert.equal(stolen.data.paper,undefined);
  assert.doesNotMatch(JSON.stringify(stolen.data),/Harbor Ledger|${founded.data.paper.id}/);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM kindle_newspapers').first()).n,1);
  const second=await post(r,'alice',{action:'found-paper',requestId:randomUUID(),name:'Second Sheet'});
  assert.equal(second.status,403);
  assert.equal(second.data.error,kindleNewspaperExistsError);
  const pubId=randomUUID();
  const published=await post(r,'alice',{action:'publish',requestId:pubId,headline:'Shifts posted',paragraphs:['Twelve shifts cleared at the yard.','Wages are on the board.']});
  assert.equal(published.status,200,published.data.error);
  const again=await post(r,'alice',{action:'publish',requestId:pubId,headline:'Shifts posted',paragraphs:['Twelve shifts cleared at the yard.','Wages are on the board.']});
  assert.equal(again.status,200);
  assert.equal(again.data.article.id,published.data.article.id);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM kindle_articles').first()).n,1);
  const grabbed=await post(r,'bob',{action:'publish',requestId:pubId,headline:'Shifts posted',paragraphs:['Twelve shifts cleared at the yard.','Wages are on the board.']});
  assert.equal(grabbed.status,409);
  assert.equal(grabbed.data.error,kindleNewspaperRequestReusedError);
  assert.equal(grabbed.data.article,undefined);
  assert.doesNotMatch(JSON.stringify(grabbed.data),/Shifts posted|Harbor Ledger|${published.data.article.id}/);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM kindle_articles').first()).n,1);
  const bob=await get(r,'bob');
  assert.equal(bob.status,200);
  const item=bob.data.items.find(i=>i.kind==='player-article');
  assert.ok(item);
  assert.equal(item.source,'player');
  assert.equal(item.paperName,'Harbor Ledger');
  assert.equal(item.title,'Shifts posted');
  assert.deepEqual(item.paragraphs,['Twelve shifts cleared at the yard.','Wages are on the board.']);
  assert.equal(item.authorName,'Ada Shore');
  assert.doesNotMatch(JSON.stringify(item),/AI-generated|ai-generated/i);
});

test('a missing display name is shown as A citizen',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  on(r);
  await r.db.prepare("UPDATE citizens SET display_name=NULL WHERE clerk_user_id='alice'").run();
  assert.equal((await post(r,'alice',{action:'found-paper',requestId:randomUUID(),name:'Plain Record'})).status,200);
  assert.equal((await post(r,'alice',{action:'publish',requestId:randomUUID(),headline:'A quiet day',paragraphs:['The yard is still.']})).status,200);
  const item=(await get(r,'bob')).data.items.find(i=>i.kind==='player-article');
  assert.equal(item.authorName,'A citizen');
});

test('Korund and Aurelle actions are refused and their editions have no player articles',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  on(r);
  for(const nation of ['korund','aurelle']){
    await r.db.prepare('UPDATE citizens SET nation_id=? WHERE clerk_user_id=?').bind(nation,'bob').run();
    const found=await post(r,'bob',{action:'found-paper',requestId:randomUUID(),name:'Harbor Ledger'});
    assert.equal(found.status,403,nation);
    assert.equal(found.data.error,kindleNewspaperNationError);
    const published=await post(r,'bob',{action:'publish',requestId:randomUUID(),headline:'Shifts posted',paragraphs:['One paragraph of news.']});
    assert.equal(published.status,403,nation);
    const edition=await get(r,'bob');
    assert.equal(edition.status,200,nation);
    assert.ok(edition.data.items.every(i=>i.kind!=='player-article'),nation);
    assert.notEqual(edition.data.nationId,'kindle');
  }
});

test('over-long text, paragraph counts and control characters are refused',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  on(r);
  const longName='N'.repeat(PRESS_HEADLINE_MAX+1);
  const name=await post(r,'alice',{action:'found-paper',requestId:randomUUID(),name:longName});
  assert.equal(name.status,400);
  assert.equal(name.data.error,kindleNewspaperTextError);
  const ctrl=await post(r,'alice',{action:'found-paper',requestId:randomUUID(),name:'Bad\u0007name'});
  assert.equal(ctrl.status,400);
  assert.equal((await post(r,'alice',{action:'found-paper',requestId:randomUUID(),name:'Harbor Ledger'})).status,200);
  const longHead=await post(r,'alice',{action:'publish',requestId:randomUUID(),headline:'H'.repeat(PRESS_HEADLINE_MAX+1),paragraphs:['Ok.']});
  assert.equal(longHead.status,400);
  const none=await post(r,'alice',{action:'publish',requestId:randomUUID(),headline:'Shifts posted',paragraphs:[]});
  assert.equal(none.status,400);
  assert.equal(none.data.error,kindleNewspaperParagraphError);
  const three=await post(r,'alice',{action:'publish',requestId:randomUUID(),headline:'Shifts posted',paragraphs:['One.','Two.','Three.']});
  assert.equal(three.status,400);
  const longP=await post(r,'alice',{action:'publish',requestId:randomUUID(),headline:'Shifts posted',paragraphs:['P'.repeat(PRESS_PARAGRAPH_MAX+1)]});
  assert.equal(longP.status,400);
  const nul=await post(r,'alice',{action:'publish',requestId:randomUUID(),headline:'Shifts posted',paragraphs:['Has\u0000null']});
  assert.equal(nul.status,400);
});

test('a shadow-muted author is hidden from other readers and visible to themselves',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  on(r);
  assert.equal((await post(r,'alice',{action:'found-paper',requestId:randomUUID(),name:'Harbor Ledger'})).status,200);
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE',`alice@${iso(r.now-60_000)}`);
  assert.equal((await post(r,'alice',{action:'publish',requestId:randomUUID(),headline:'Muted dispatch',paragraphs:['Only the author should see this.']})).status,200);
  const mine=(await get(r,'alice')).data.items.find(i=>i.kind==='player-article'&&i.title==='Muted dispatch');
  assert.ok(mine);
  const others=(await get(r,'bob')).data.items.filter(i=>i.kind==='player-article');
  assert.equal(others.length,0);
});

test('signed-out POST is 401 and wiring stays behind the existing opening pack flag',()=>{
  const route=readFileSync('app/api/news/route.ts','utf8');
  const news=readFileSync('lib/national-news.ts','utf8');
  assert.match(route,/\.\.\.\(flagOn\(env,KINDLE_NEWSPAPERS_FLAG\)\?\{kindleNewspapers:true,readerId:userId/);
  assert.match(route,/if\(!flagOn\(env,KINDLE_NEWSPAPERS_FLAG\)\)return privateJson\(\{error:kindleNewspaperFlagOffError\},404\)/);
  assert.match(news,/nationId==='kindle'&&options\.kindleNewspapers&&options\.readerId/);
  assert.match(news,/source:'system'\|'deterministic'\|'model'\|'player'/);
  const lib=readFileSync('lib/kindle-newspapers.ts','utf8');
  assert.match(lib,/const mine = await db\.prepare\('SELECT id FROM kindle_newspapers WHERE founder_user_id=\?'\)\.bind\(userId\)\.first\(\);\s*if \(mine\) return \{ status: 403 as const, error: kindleNewspaperExistsError \}/);
  assert.match(lib,/if \(prior\.founder_user_id !== userId\) return \{ status: 409 as const, error: kindleNewspaperRequestReusedError \}/);
  assert.match(lib,/if \(prior\.author_user_id !== userId\) return \{ status: 409 as const, error: kindleNewspaperRequestReusedError \}/);
  assert.match(lib,/SELECT id,name FROM kindle_newspapers WHERE founder_user_id=\?/);
  assert.match(lib,/ORDER BY a\.published_at DESC, a\.id DESC LIMIT 6/);
});

test('only the founder can publish to their paper',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  on(r);
  assert.equal((await post(r,'alice',{action:'found-paper',requestId:randomUUID(),name:'Harbor Ledger'})).status,200);
  const published=await post(r,'bob',{action:'publish',requestId:randomUUID(),headline:'Shifts posted',paragraphs:['One paragraph of news.']});
  assert.equal(published.status,403);
  assert.equal(published.data.error,kindleNewspaperMissingError);
  assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM kindle_articles WHERE author_user_id='bob'").first()).n,0);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM kindle_articles').first()).n,0);
});

test('the Kindle edition shows only the latest six player articles',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  on(r);
  assert.equal((await post(r,'alice',{action:'found-paper',requestId:randomUUID(),name:'Harbor Ledger'})).status,200);
  const headlines=[];
  for(let i=1;i<=7;i++){
    r.setNow(r.now+60_000);
    const headline=`Dispatch ${i}`;
    headlines.push(headline);
    assert.equal((await post(r,'alice',{action:'publish',requestId:randomUUID(),headline,paragraphs:['One paragraph of news.']})).status,200);
  }
  const items=(await get(r,'bob')).data.items.filter(i=>i.kind==='player-article');
  assert.equal(items.length,6);
  assert.deepEqual(items.map(i=>i.title),[...headlines].slice(1).reverse());
});

