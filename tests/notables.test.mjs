import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID,createHash} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {reserveAiSequence} from '../lib/ai-budget.ts';
import {notableProfile,validNotableCommand,notableDailyLimit,notableTopics} from '../lib/notable-profiles.ts';
const command=(nation='kindle')=>({requestId:randomUUID(),notableId:notableProfile(nation).id,topic:'news'});
const draft={title:'Public record',summary:'The public ledger records settled work.',claims:['completedShifts']};
const binding=()=>{const calls=[];return {calls,async run(model,input){calls.push({model,input});return {response:[JSON.stringify(draft),'supported','safe'][(calls.length-1)%3]};}};};
const options=()=>({enabled:true,budget:{dailyBudgetMicro:970000,gatewayId:'harimu-test'}});
test('Notable routes authorize own nation and disabled POST causes no reservation or model call',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const fake=binding();r.setFixtureAiBinding(fake);assert.equal((await r.call('notables',null)).status,401);
 const own=await r.call('notables','alice',undefined,undefined,'?nation=aurelle');assert.ok(['kindle-journalist','kindle-union-organizer','kindle-emberball-owner','kindle-cartoonist'].includes(own.data.profile.id),'#151: one of Kindle\'s Notables');assert.equal(own.data.source,'authored');assert.equal(own.data.enabled,false);assert.equal(own.cache,'private, no-store');assert.equal(own.data.dailyLimit,20);
 assert.equal((await r.call('notables','alice',command('aurelle'))).status,403);
 assert.equal((await r.call('notables','alice',command())).status,503);assert.equal(fake.calls.length,0);
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM harimu_ai_reservations').first()).n,0);
 assert.equal((await r.call('notables','alice',{...command(),message:'private draft'})).status,400);
});
test('public topics reject citizen text and unknown profiles instead of quoting private material',()=>{
 assert.equal(notableDailyLimit,20);assert.equal(notableProfile('__proto__'),null);
 assert.ok(validNotableCommand(command()));for(const extra of [{topic:'private-chat'},{text:'private text'},{nationId:'aurelle'},{requestId:'bad'}])assert.equal(validNotableCommand({...command(),...extra}),false);
});
test('one global reservation covers generation verification moderation; owner-bound repeated submissions make no new calls',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const fake=binding(),c=command();
 const results=await Promise.all([r.answerNotable('alice',c,fake,options(r)),r.answerNotable('alice',c,fake,options(r))]);assert.equal(results.filter(x=>x.status===200).length,1);assert.equal(fake.calls.length,3);
 assert.equal((await r.answerNotable('alice',{...c,topic:'work'},fake,options(r))).status,409);assert.equal(fake.calls.length,3);
 assert.equal((await r.answerNotable('bob',c,fake,options(r))).status,200);assert.equal(fake.calls.length,6);
 const row=await r.db.prepare('SELECT SUM(reserved_micro) AS n FROM harimu_ai_reservations').first();assert.equal(row.n,144800);
 const prompts=JSON.stringify(fake.calls);assert.doesNotMatch(prompts,/Private alice|Private bob|clerk_user_id|private household|"alice"|"bob"/);assert.match(prompts,/Civic|reporter|public/i);
 assert.equal((await r.answerNotable('alice',command('korund'),fake,options(r))).status,403);assert.equal(fake.calls.length,6);
});
test('shared news budget exhaustion stops the entire Notable sequence before first inference',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const now=Math.floor(r.now/1000);for(let i=0;i<13;i++)assert.equal(await reserveAiSequence(r.db,randomUUID(),now,{dailyBudgetMicro:970000,gatewayId:'harimu-test'}),true);
 const fake=binding();assert.equal((await r.answerNotable('alice',command(),fake,options(r))).status,429);assert.equal(fake.calls.length,0);
});
test('atomic equal account quota and another account isolation use the same reservation ledger',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const now=Math.floor(r.now/1000),prefix='notable:'+createHash('sha256').update('alice').digest('hex')+':';
 const results=await Promise.all(Array.from({length:3},()=>reserveAiSequence(r.db,prefix+randomUUID(),now,{dailyBudgetMicro:970000,gatewayId:'harimu-test'},{ownerPrefix:prefix,dailyLimit:2})));assert.equal(results.filter(Boolean).length,2);
 const other='notable:'+createHash('sha256').update('bob').digest('hex')+':';assert.equal(await reserveAiSequence(r.db,other+randomUUID(),now,{dailyBudgetMicro:970000,gatewayId:'harimu-test'},{ownerPrefix:other,dailyLimit:2}),true);
 assert.equal(await reserveAiSequence(r.db,prefix+randomUUID(),now,{dailyBudgetMicro:970000,gatewayId:'harimu-test'},{ownerPrefix:prefix,dailyLimit:21}),false);
});
test('unsafe, truncated, unknown moderation and provider failures never expose responses or refund reservations',async t=>{
 const r=await localRuntime();t.after(()=>r.close());for(const response of [{response:'unsafe'},{response:'safe',finish_reason:'length'},{response:'perhaps safe'}]){let n=0;const fake={async run(){return n++===0?{response:JSON.stringify(draft)}:n===2?{response:'supported'}:response;}};const result=await r.answerNotable('alice',command(),fake,options(r));assert.equal(result.status,200);assert.equal(result.source,'authored');assert.equal(result.reply,notableTopics.news.authored);} // #139 fallback; model text never exposed
 const c=command();const result=await r.answerNotable('alice',c,{async run(){throw {code:5016,message:'private provider detail'};}},options(r));assert.equal(result.status,503);assert.equal(result.failureCode,'model-terms-5016:@cf/meta/llama-3.2-3b-instruct');assert.doesNotMatch(JSON.stringify(result),/private provider/);
 assert.equal((await r.db.prepare('SELECT SUM(reserved_micro) AS n FROM harimu_ai_reservations').first()).n,289600);
});

test('citizenship changes during inference discard the old nation response',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const fake=binding();const run=fake.run.bind(fake);fake.run=async(model,input)=>{const value=await run(model,input);if(fake.calls.length===1)await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();return value;};
 const result=await r.answerNotable('alice',command(),fake,options(r));assert.equal(result.status,503);assert.equal(result.reply,undefined);
});

test('Notable launcher mounts in the actual City branch rather than another location panel',async()=>{
 const {readFile}=await import('node:fs/promises');const {default:ts}=await import('typescript');const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const mounts=[];
 const visit=node=>{if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(tree)==='NotableControl')mounts.push(node);ts.forEachChild(node,visit);};visit(tree);assert.equal(mounts.length,1);let parent=mounts[0].parent;while(parent&&!ts.isConditionalExpression(parent))parent=parent.parent;assert.ok(parent);assert.equal(parent.condition.getText(tree),"viewMode==='square'");
});

test('fulfilled invalid Notable response settles to the answered call cost (#141) and is a known failure rather than transport uncertainty',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const result=await r.answerNotable('alice',command(),{async run(){return {response:42};}},options(r));assert.equal(result.status,200);assert.equal(result.source,'authored');assert.equal(result.reply,notableTopics.news.authored); // #139 fallback
 const row=await r.db.prepare('SELECT reserved_micro,status FROM harimu_ai_reservations').first();assert.equal(row.reserved_micro,4200);assert.equal(row.status,'finished');
});
