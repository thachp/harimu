import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {newsEditions} from '../lib/news-editions.ts';

const read=(r,user)=>r.call('news',user,undefined,'https://fixture.invalid','');
const FLAG='HARIMU_CONFLUENCE_ENABLED';
const gate=(r,on)=>r.setFixtureEnv(FLAG,on?'true':undefined);

async function insertLedger(r,{table,nationId,userId,count}){
  const iso=new Date(r.now).toISOString(), at=Math.floor(r.now/1000);
  for(let i=0;i<count;i++){
    const id=randomUUID();
    await r.db.prepare('INSERT INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at,claimed_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id,userId,'harvest','Harvest','Harvest',4,iso,iso,iso).run();
    if(table==='nation_wage_settlements'){
      await r.db.prepare('INSERT INTO nation_wage_settlements (shift_id,nation_id,clerk_user_id,job_id,wage_minor,settled_at) VALUES (?,?,?,?,?,?)')
        .bind(id,nationId,userId,'confluence-cooperative-harvest',800,at).run();
    }else{
      await r.db.prepare('INSERT INTO shift_settlements (shift_id,clerk_user_id,wage_minor,item,quantity,settled_at) VALUES (?,?,?,?,?,?)')
        .bind(id,userId,800,'food',4,iso).run();
    }
  }
}

test('Confluence citizen gets The Current Daily when the opening flag is on',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id='alice'").run();
  gate(r,true);
  const res=await read(r,'alice');
  assert.equal(res.status,200);
  assert.equal(res.cache,'private, no-store');
  assert.equal(res.data.nationId,'confluence');
  assert.equal(res.data.title,'The Current Daily');
  assert.equal(res.data.style,'state');
  assert.deepEqual(res.data.statistics,{citizens:1,completedShifts:0,food:0});
  assert.ok(res.data.items.some(i=>i.title==='The canals wait for the next stream'));
  // #1446 QA1: food stays 0 this slice, so the Bread Halls basket template must not appear.
  assert.ok(res.data.items.every(i=>i.title!=='Many streams report a full basket'));
  assert.ok(res.data.items.every(i=>!/Bread Halls/.test(`${i.title} ${i.text}`)));
  // Register template uses the citizen count (acceptance 4); exact #108 wording.
  const register=res.data.items.find(i=>i.title==='New households join the current');
  assert.ok(register, 'register item present');
  assert.match(register.text,/1 citizen registered with a household this period/);
  assert.ok(res.data.items.every(i=>i.source==='deterministic'&&i.kind==='template'));
  assert.doesNotMatch(JSON.stringify(res.data),/Private alice|clerk_user_id/);
});

test('two Confluence citizens get the plural register line from the #108 template',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id IN ('alice','bob')").run();
  gate(r,true);
  const res=await read(r,'alice');
  assert.equal(res.status,200);
  assert.equal(res.data.statistics.citizens,2);
  assert.ok(res.data.items.every(i=>i.title!=='Many streams report a full basket'));
  assert.ok(res.data.items.every(i=>!/Bread Halls/.test(`${i.title} ${i.text}`)));
  const register=res.data.items.find(i=>i.title==='New households join the current');
  assert.ok(register, 'register item present');
  assert.match(register.text,/2 citizens registered with a household this period/);
});

test('Confluence off still 404s, gated as today',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id='alice'").run();
  const unset=await read(r,'alice');
  assert.equal(unset.status,404);
  assert.equal(unset.data.error,'Your nation’s news edition is not built yet.');
  r.setFixtureEnv(FLAG,'false');
  assert.equal((await read(r,'alice')).status,404);
});

test('Kindle, Korund, Aurelle and the other non-MVP editions stay unchanged',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  gate(r,true);
  const kindle=await read(r,'alice');
  assert.equal(kindle.status,200);
  assert.equal(kindle.data.nationId,'kindle');
  assert.equal(kindle.data.title,'Kindle Press');
  for(const [nation,title] of [['korund','Korund State Media'],['aurelle','Aurelle Court Gazette']]){
    await r.db.prepare('UPDATE citizens SET nation_id=? WHERE clerk_user_id=?').bind(nation,'bob').run();
    const res=await read(r,'bob');
    assert.equal(res.status,200,nation);
    assert.equal(res.data.nationId,nation);
    assert.equal(res.data.title,title);
  }
  for(const nation of ['hoarvale','meridian','ilmar','varkand','veldwood','fulmara']){
    await r.db.prepare('UPDATE citizens SET nation_id=? WHERE clerk_user_id=?').bind(nation,'bob').run();
    assert.equal((await read(r,'bob')).status,404,nation);
  }
});

test('shift count comes from nation_wage_settlements, not other ledgers',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id='alice'").run();
  await insertLedger(r,{table:'nation_wage_settlements',nationId:'confluence',userId:'alice',count:3});
  await insertLedger(r,{table:'shift_settlements',nationId:'kindle',userId:'bob',count:5});
  await insertLedger(r,{table:'nation_wage_settlements',nationId:'hoarvale',userId:'bob',count:2});
  gate(r,true);
  const res=await read(r,'alice');
  assert.equal(res.status,200);
  assert.equal(res.data.statistics.completedShifts,3);
  assert.equal(res.data.statistics.food,0);
  const texts=res.data.items.map(i=>`${i.title} ${i.text}`).join(' ');
  assert.match(texts,/3 shifts completed along the canals this period/);
  assert.doesNotMatch(texts,/\b5\b|\b2\b|\b8\b/);
});

test('The Current Daily is the canon Confluence outlet',()=>{
  assert.equal(newsEditions.confluence.outlet,'The Current Daily');
  assert.equal(newsEditions.confluence.canon,true);
  assert.match(readFileSync('lib/news-editions.ts','utf8'),/confluence:\{nationId:'confluence',outlet:'The Current Daily',canon:true,/);
});

test('wiring is Confluence-only, gated on the existing opening flag, and counts nation_wage_settlements',()=>{
  const news=readFileSync('lib/national-news.ts','utf8');
  const route=readFileSync('app/api/news/route.ts','utf8');
  assert.match(news,/if\(nationId==='confluence'\)return options\.confluence\?readConfluenceCurrentDaily\(db,now\):null;/);
  assert.match(news,/SELECT COUNT\(\*\) AS shifts FROM nation_wage_settlements WHERE nation_id=\?/);
  assert.doesNotMatch(news,/editions=\{[^}]*confluence/);
  assert.match(route,/confluence:flagOn\(env,'HARIMU_CONFLUENCE_ENABLED'\)/);
});
