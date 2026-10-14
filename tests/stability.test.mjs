import assert from 'node:assert/strict';
import {test} from 'node:test';
import {localRuntime} from './helpers/local-runtime.mjs';
import {computeStability,foodTerms,workTerms,promiseTerms,petitionTerms,publicStability,unrestAtOrAbove,stabilityStatements,korundApprovedFloor} from '../lib/stability.ts';

const sum=terms=>terms.reduce((t,x)=>t+x.points,0);
test('each input is bounded and monotonic',()=>{
 assert.deepEqual(foodTerms(10,10),{stability:15,unrest:0,coverage:100});assert.deepEqual(foodTerms(0,10),{stability:-15,unrest:40,coverage:0});
 assert.deepEqual(foodTerms(0,0),{stability:0,unrest:20,coverage:50},'no citizens is neutral');assert.equal(foodTerms(99,10).coverage,100,'fed is capped by citizens');
 assert.deepEqual(workTerms(4,4),{stability:10,unrest:0,share:100});assert.deepEqual(workTerms(0,4),{stability:-10,unrest:15,share:0});
 assert.deepEqual(promiseTerms(0,0),{stability:0,unrest:0,rate:null});assert.deepEqual(promiseTerms(3,0),{stability:10,unrest:0,rate:100});assert.deepEqual(promiseTerms(0,2),{stability:-10,unrest:15,rate:0});
 assert.deepEqual(petitionTerms(0,10),{stability:-0,unrest:0,share:0});assert.deepEqual(petitionTerms(50,10),{stability:-15,unrest:20,share:100});assert.deepEqual(petitionTerms(5,0),{stability:-0,unrest:0,share:0});
 for(let n=0;n<=10;n++){assert.ok(foodTerms(n+1,11).stability>=foodTerms(n,11).stability);assert.ok(workTerms(n+1,11).unrest<=workTerms(n,11).unrest);}
});
test('breakdown sums to the score and scores stay within 0..100 at the extremes',()=>{
 const worst=computeStability({citizens:10,fed:0,worked:0,promisesKept:0,promisesBroken:5,petitionBacklog:20});
 const best=computeStability({citizens:10,fed:10,worked:10,promisesKept:5,promisesBroken:0,petitionBacklog:0});
 assert.equal(worst.stability,0);assert.equal(worst.unrest,100);assert.equal(best.stability,85);assert.equal(best.unrest,10);
 for(const s of [worst,best,computeStability({}),computeStability({citizens:7,fed:3,worked:5,promisesKept:1,promisesBroken:2,petitionBacklog:1}),computeStability({citizens:-1,fed:Number.NaN})]){
  assert.equal(sum(s.breakdown.stability),s.stability);assert.equal(sum(s.breakdown.unrest),s.unrest);assert.ok(s.stability>=0&&s.stability<=100&&s.unrest>=0&&s.unrest<=100);
  assert.deepEqual(s.breakdown.stability.map(t=>t.input),['baseline','food','work','promises','petitions']);}
});
test('Korund publishes only the state-approved figure and truthful system stats',()=>{
 const score=computeStability({citizens:4,fed:1,worked:2,petitionBacklog:1});
 const row={nationId:'korund',tick:3,scheduledAt:1,inputs:{citizens:4,fed:1,worked:2,promisesKept:0,promisesBroken:0,petitionBacklog:1},...score};
 const view=publicStability(row);assert.equal(view.kind,'state-approved');assert.equal(view.approvedStability,korundApprovedFloor);
 assert.deepEqual(view.systemStats,{citizens:4,fedPercent:25,workedPercent:50,petitionBacklog:1});assert.equal('unrest' in view,false);assert.equal('breakdown' in view,false);
 assert.equal(publicStability({...row,nationId:'kindle'}).kind,'measured');
});
test('world ticks record one score per nation per game day, idempotently across retries',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 const first=await r.call('world',null);const epoch=first.data.simulation.clock.epochSeconds;assert.deepEqual(first.data.simulation.stability,[]);
 await r.call('citizen','alice');await r.call('citizen','bob');
 r.setNow((epoch+7200*2)*1000);const second=await r.call('world',null);
 const rows=(await r.db.prepare('SELECT nation_id,tick,stability,unrest,breakdown_json FROM nation_stability_scores ORDER BY tick,nation_id').all()).results;
 assert.deepEqual(rows.map(x=>`${x.tick}:${x.nation_id}`),['1:aurelle','1:kindle','1:korund','2:aurelle','2:kindle','2:korund']);
 for(const row of rows){const b=JSON.parse(row.breakdown_json);assert.equal(sum(b.stability),Number(row.stability));assert.equal(sum(b.unrest),Number(row.unrest));}
 const views=second.data.simulation.stability;assert.deepEqual(views.map(v=>v.nationId),['kindle','korund','aurelle']);assert.equal(views[1].kind,'state-approved');assert.equal(views[0].tick,2);
 // A retried job for an already-recorded game day is a no-op, even if inputs changed meanwhile.
 await r.db.prepare("UPDATE citizens SET nation_id='kindle'").run();
 await r.db.batch(await stabilityStatements(r.db,2,epoch+7200*2,epoch+7200*2+5));
 r.reopen();await r.call('world',null);
 const again=(await r.db.prepare('SELECT nation_id,tick,stability,unrest,breakdown_json FROM nation_stability_scores ORDER BY tick,nation_id').all()).results;
 assert.deepEqual(again,rows);
});
test('history answers "days Unrest >= 65 in the last 7 real days" and sustained hours',async t=>{
 const r=await localRuntime();t.after(()=>r.close());await r.call('world',null);
 const day=86400,start=Date.UTC(2026,0,1)/1000;let tick=1;
 const put=(nation,at,unrest)=>r.db.prepare("INSERT INTO nation_stability_scores (nation_id,tick,scheduled_at,computed_at,stability,unrest,inputs_json,breakdown_json) VALUES (?,?,?,?,?,?,'{}','{}')").bind(nation,tick++,at,at,100-unrest,unrest).run();
 // Korund: 9 real days, 12 scores per day; day index 4 has one dip below 65.
 for(let d=0;d<9;d++)for(let h=0;h<12;h++)await put('korund',start+d*day+h*7200,d===4&&h===6?64:70);
 await put('aurelle',start+8*day,90);
 const now=start+9*day-1;
 const korund=await unrestAtOrAbove(r.db,'korund',65,now,7);assert.equal(korund.recordedDays,7);assert.equal(korund.days,6);
 assert.equal(korund.sustainedSeconds,(start+8*day+11*7200)-(start+4*day+7*7200));
 assert.equal((await unrestAtOrAbove(r.db,'korund',71,now,7)).days,0);
 assert.deepEqual(await unrestAtOrAbove(r.db,'kindle',65,now,7),{days:0,recordedDays:0,sustainedSeconds:0});
 assert.equal((await unrestAtOrAbove(r.db,'aurelle',65,now,7)).days,1);
});
test('inputs are read from saved shifts, meals and petitions',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const epoch=(await r.call('world',null)).data.simulation.clock.epochSeconds;
 await r.call('citizen','alice');await r.call('citizen','bob');
 const nation=(await r.db.prepare("SELECT nation_id FROM citizens WHERE clerk_user_id='alice'").first()).nation_id;
 assert.equal((await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'})).status,200);
 await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES ('m1','bob','meal','food',-2,0,?)").bind(epoch+60).run();
 await r.db.prepare("INSERT INTO government_petitions (request_id,clerk_user_id,nation_id,topic,period_start,occurred_at) VALUES ('p1','bob',?,'food',?,?)").bind(nation,epoch,epoch+60).run();
 r.setNow((epoch+7200)*1000);await r.call('world',null);
 const row=await r.db.prepare('SELECT inputs_json FROM nation_stability_scores WHERE nation_id=? AND tick=1').bind(nation).first();
 assert.deepEqual(JSON.parse(row.inputs_json),{citizens:2,fed:nation==='kindle'?1:0,worked:1,promisesKept:0,promisesBroken:0,petitionBacklog:1});
});
test('stability panel shows the breakdown, but only the approved figure for Korund',async()=>{
 const ts=(await import('typescript')).default,{readFile}=await import('node:fs/promises'),{createRequire}=await import('node:module'),{renderToStaticMarkup}=await import('react-dom/server');
 const require=createRequire(import.meta.url);const src=await readFile(new URL('../app/stability-panel.tsx',import.meta.url),'utf8');
 const exports={};new Function('exports','require',ts.transpileModule(src,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText)(exports,require);
 const score=computeStability({citizens:4,fed:2,worked:1,petitionBacklog:1});const base={tick:2,scheduledAt:1,inputs:{citizens:4,fed:2,worked:1,promisesKept:0,promisesBroken:0,petitionBacklog:1},...score};
 const kindle=renderToStaticMarkup(exports.StabilityPanel({score:publicStability({...base,nationId:'kindle'})}));
 assert.match(kindle,new RegExp(`Stability ${score.stability}/100 · Unrest ${score.unrest}/100`));assert.match(kindle,/What moved them today/);
 const korund=renderToStaticMarkup(exports.StabilityPanel({score:publicStability({...base,nationId:'korund'})}));
 assert.match(korund,/State-approved Stability: 92\/100/);assert.doesNotMatch(korund,/Unrest/);
 assert.match(renderToStaticMarkup(exports.StabilityPanel({score:undefined})),/No daily score/);
});
