/** #1359: Aurelle noble ranks from lifetime earned Royal Favor (docs §11.6). Flag HARIMU_AURELLE_RANKS_ENABLED, GRAY 94. */
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {localRuntime} from './helpers/local-runtime.mjs';
import {FLAG_PACKS} from '../lib/flag-pack.mjs';
import {flagOn} from '../lib/flag-pack.mjs';
import {aurelleRankAt,aurelleRankThresholds,AURELLE_RANKS_FLAG} from '../lib/aurelle-rank-rules.ts';
import {royalFavorBalance} from '../lib/aurelle.ts';
import {civicRank} from '../lib/civic-rank-rules.ts';
import {rankChrome,rankFor} from '../lib/aurelle-rank-copy.ts';
const require=createRequire(import.meta.url);
const loadCard=()=>{const source=ts.transpileModule(readFileSync(new URL('../app/aurelle-rank-card.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;const exp={};new Function('exports','require',source)(exp,name=>name==='react'?React:name==='react/jsx-runtime'?require('react/jsx-runtime'):name.startsWith('@/lib/')?require(new URL('../lib/'+name.slice(6)+'.ts',import.meta.url).pathname):require(name));return exp.AurelleRankCard;};

const FLAG=AURELLE_RANKS_FLAG;
const iso=ms=>new Date(ms).toISOString();
const on=r=>r.setFixtureEnv(FLAG,'true');
async function setup(t,backend,users=['ava']){
  const r=await localRuntime({backend}); t.after(()=>r.close());
  const at=iso(r.now);
  for(const u of users) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'aurelle',?,18,0,'Good standing',?,?)").bind(u,u,at,at).run();
  return r;
}
async function earn(r,user,points,settledAt=r.now){
  assert.equal(points%2,0,'settlements grant 2 Favor each');
  const at=iso(r.now);
  for(let n=0;n<points/2;n++){
    const id=randomUUID();
    await r.db.batch([
      r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id,user,'aurelle-food-estate','Estate fixture','4 state food',4,at,at,at),
      r.db.prepare('INSERT INTO aurelle_settlements VALUES (?,?,?,?,?,?)').bind(id,user,800,4,2,Math.floor(settledAt/1000)),
    ]);
  }
}
const spend=(r,user,amount,spentAt=r.now)=>r.db.prepare("INSERT INTO aurelle_favor_spends (request_id,clerk_user_id,amount,reason,spent_at) VALUES (?,?,?,'leave-kinward',?)").bind(randomUUID(),user,amount,Math.floor(spentAt/1000)).run();

test('flag is preview true, production false, GRAY 94 at index 93',()=>{
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_KINDLE_NEWSPAPERS_ENABLED'),92);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG),93); // indexOf by name; pack length is not pinned
  const preview=JSON.parse(readFileSync('wrangler.jsonc','utf8').replace(/^\s*\/\/.*$/gm,''));
  const prod=JSON.parse(readFileSync('wrangler.prod.jsonc','utf8').replace(/^\s*\/\/.*$/gm,''));
  assert.equal(preview.vars[FLAG],undefined);
  assert.equal(prod.vars[FLAG],undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG],'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG],'false');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG),93);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(FLAG),93);
  assert.equal(flagOn({HARIMU_GRAY_PACK:preview.vars.HARIMU_GRAY_PACK},FLAG),true);
  assert.equal(flagOn({HARIMU_GRAY_PACK:prod.vars.HARIMU_GRAY_PACK},FLAG),false);
  assert.equal(flagOn({HARIMU_GRAY_PACK:preview.vars.HARIMU_GRAY_PACK,[FLAG]:'false'},FLAG),false,'a direct string wins over the pack');
});

test('thresholds: Commoner 0, Freeholder 6, Knight 20, Baron 50; boundaries 5/6, 19/20, 49/50',()=>{
  assert.deepEqual(aurelleRankThresholds.map(s=>[s.key,s.earned]),[['commoner',0],['freeholder',6],['knight',20],['baron',50]]);
  const at=(n,key,next,needs)=>{const r=aurelleRankAt(n);assert.deepEqual({key:r.key,earned:r.earned,next:r.next,needs:r.needs},{key,earned:n,next,needs},n);}
  at(0,'commoner','freeholder',6);
  at(5,'commoner','freeholder',6);
  at(6,'freeholder','knight',20);
  at(19,'freeholder','knight',20);
  at(20,'knight','baron',50);
  at(49,'knight','baron',50);
  at(50,'baron',null,null);
  at(80,'baron',null,null);
});

test('#741 pin: civicRank stays null for Aurelle',()=>{
  assert.equal(civicRank('aurelle',{shifts:99,civicActs:99,walletMinor:1e9}),null);
});

test('the card uses #563 copy as text nodes, hides when there is no payload, and wraps at 375px',()=>{
  const AurelleRankCard=loadCard();
  assert.equal(renderToStaticMarkup(React.createElement(AurelleRankCard,{aurelleRank:null})),'');
  const html=renderToStaticMarkup(React.createElement(AurelleRankCard,{aurelleRank:{rank:'Commoner',earned:0,next:'Freeholder',needs:6}}));
  assert.match(html,new RegExp(rankChrome.title));
  assert.match(html,/: Commoner</);
  assert.match(html,/Toward Freeholder: 0 of 6/);
  assert.match(html,new RegExp(rankChrome.howEarned.text));
  assert.match(html,new RegExp(rankChrome.noJurisdiction.text));
  assert.doesNotMatch(html,/dangerouslySetInnerHTML|<script/);
  const baron=renderToStaticMarkup(React.createElement(AurelleRankCard,{aurelleRank:{rank:'Baron',earned:50,next:null,needs:null}}));
  assert.match(baron,new RegExp(rankFor('baron').what.text));
  const css=readFileSync('app/game-shell.css','utf8');
  assert.match(css,/\.aurelle-rank-card\{[^}]*overflow-wrap:anywhere/);
});

test('page wiring: Aurelle card is gated on nation and payload; flag key is packed only while on',()=>{
  const page=readFileSync('app/page.tsx','utf8');
  const route=readFileSync('app/api/citizen/route.ts','utf8');
  const read=readFileSync('lib/aurelle-rank.ts','utf8');
  assert.match(page,/citizenNation\?\.id === 'aurelle' && <AurelleRankCard aurelleRank=\{aurelleRank\}/);
  assert.match(page,/setAurelleRank\(snapshot\.aurelleRank \?\? null\)/);
  assert.match(route,/\.\.\.\(aurelleRank \? \{ aurelleRank \} : \{\}\)/);
  assert.match(route,/\.\.\.\(flagOn\(env, AURELLE_RANKS_FLAG\) \? \{ aurelleRanks: true \} : \{\}\)/);
  assert.match(route,/aurelleRanksOn && profile\?\.nation_id === 'aurelle' \? readAurelleRank/);
  assert.match(read,/SELECT COALESCE\(SUM\(favor\),0\) AS earned FROM aurelle_settlements WHERE clerk_user_id=\?/);
  assert.doesNotMatch(read,/aurelleRankEarnedSql = '.*aurelle_favor_spends|aurelleRankEarnedSql = '.*royalFavorSql/);
});

for(const backend of ['sqlite','postgres']) test(`#1359 GET /api/citizen: flag off has no field; earned Favor sets the rank; spends do not demote (${backend})`,async t=>{
  const r=await setup(t,backend,['ava']);
  const off=(await r.call('citizen','ava')).data;
  assert.equal('aurelleRank' in off,false);
  assert.equal('aurelleRanks' in off.flags,false);
  on(r);
  const zero=(await r.call('citizen','ava')).data;
  assert.equal(zero.flags.aurelleRanks,true);
  assert.deepEqual(zero.aurelleRank,{rank:'Commoner',earned:0,next:'Freeholder',needs:6});
  await earn(r,'ava',4); // 5/6 boundary: 4 stays Commoner; 6 crosses
  assert.equal((await r.call('citizen','ava')).data.aurelleRank.rank,'Commoner');
  await earn(r,'ava',2); // total 6
  assert.deepEqual((await r.call('citizen','ava')).data.aurelleRank,{rank:'Freeholder',earned:6,next:'Knight',needs:20});
  await earn(r,'ava',14); // total 20
  assert.deepEqual((await r.call('citizen','ava')).data.aurelleRank,{rank:'Knight',earned:20,next:'Baron',needs:50});
  await spend(r,'ava',14);
  const afterSpend=(await r.call('citizen','ava')).data.aurelleRank;
  assert.deepEqual(afterSpend,{rank:'Knight',earned:20,next:'Baron',needs:50},'spends never demote');
  assert.equal(await royalFavorBalance(r.db,'ava'),6,'current balance is 6, not the earned 20');
  assert.notEqual(afterSpend.earned,await royalFavorBalance(r.db,'ava'),'rank uses earned, not the spendable balance');
  await earn(r,'ava',30); // total 50
  assert.deepEqual((await r.call('citizen','ava')).data.aurelleRank,{rank:'Baron',earned:50,next:null,needs:null});
  const kindle=(await r.call('citizen','alice')).data;
  assert.equal('aurelleRank' in kindle,false,'Kindle civic rank path is unchanged: no aurelleRank');
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  const korund=(await r.call('citizen','bob')).data;
  assert.equal('aurelleRank' in korund,false,'Korund Standing path is unchanged: no aurelleRank');
  r.setFixtureEnv(FLAG,'false');
  const offAgain=(await r.call('citizen','ava')).data;
  assert.equal('aurelleRank' in offAgain,false);
  assert.equal('aurelleRanks' in offAgain.flags,false);
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

test('#1359 mutations: threshold boundaries, earned-vs-balance source, and the flag gate all fail',()=>{
  const file='tests/aurelle-ranks-1359.test.mjs';
  const cases=[
    {file:'lib/aurelle-rank-rules.ts',find:'earned: 6',replace:'earned: 5',files:[file],pattern:'thresholds: Commoner 0'},
    {file:'lib/aurelle-rank-rules.ts',find:'earned: 20',replace:'earned: 19',files:[file],pattern:'thresholds: Commoner 0'},
    {file:'lib/aurelle-rank-rules.ts',find:'earned: 50',replace:'earned: 49',files:[file],pattern:'thresholds: Commoner 0'},
    {file:'lib/aurelle-rank.ts',find:'SELECT COALESCE(SUM(favor),0) AS earned FROM aurelle_settlements WHERE clerk_user_id=?',replace:"SELECT MAX(0,COALESCE((SELECT SUM(favor) FROM aurelle_settlements WHERE clerk_user_id=?),0)-COALESCE((SELECT SUM(amount) FROM aurelle_favor_spends WHERE clerk_user_id=?),0)) AS earned",files:[file],pattern:'spends do not demote'},
    {file:'app/api/citizen/route.ts',find:'aurelleRanksOn && profile?.nation_id === \'aurelle\' ? readAurelleRank(database, userId, profile.nation_id) : null',replace:'profile?.nation_id === \'aurelle\' ? readAurelleRank(database, userId, profile.nation_id) : null',files:[file],pattern:'flag off has no field'},
  ];
  for(const c of cases){
    const restore=mutate(c.file,c.find,c.replace);
    try{
      const result=run(c.files,c.pattern);
      assert.notEqual(result.status,0,`mutant survived (${c.find} -> ${c.replace}):\n${result.stdout}\n${result.stderr}`);
    }finally{restore();}
  }
});
