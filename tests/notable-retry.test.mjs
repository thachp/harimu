import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {localRuntime} from './helpers/local-runtime.mjs';
// Compile the actual client state machine, excluding React rendering and unrelated imports.
const source=await readFile(new URL('../app/notable-control.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('notable-control.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=tree.statements.filter(node=>(ts.isClassDeclaration(node)&&node.name?.text==='NotableRequest')||(ts.isFunctionDeclaration(node)&&node.name?.text==='notableFailureAcknowledged'));
assert.equal(declarations.length,2);
const compiled=ts.transpileModule(declarations.map(node=>node.getText(tree)).join('\n'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {NotableRequest,notableFailureAcknowledged}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
test('lost response retries the original client intent and reserves only one full inference sequence',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const session=new NotableRequest(),calls=[];
 const fake={async run(model,input){calls.push({model,input});return {response:[JSON.stringify({title:'Public record',summary:'The public ledger records settled work.',claims:['completedShifts']}),'supported','safe'][(calls.length-1)%3]};}};
 const options={enabled:true,priceReviewedUntil:Math.floor(r.now/1000)+3600};
 const first=session.begin('kindle-journalist','news');assert.ok(first);
 assert.equal((await r.answerNotable('alice',first.intent,fake,options)).status,200);
 // The server completed, but the transport discarded its response.
 assert.equal(session.finish(first.epoch,false),true);
 assert.equal(session.begin('kindle-journalist','work'),null);
 const retry=session.begin('kindle-journalist','work',true);assert.deepEqual(retry.intent,first.intent);assert.equal(retry.intent.topic,'news');
 const result=await r.answerNotable('alice',retry.intent,fake,options);assert.equal(result.status,409);assert.equal(calls.length,3);
 assert.equal((await r.db.prepare('SELECT SUM(reserved_micro) AS amount, COUNT(*) AS n FROM harimu_ai_reservations').first()).amount,72400);
 assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM harimu_ai_reservations').first()).n,1);
 assert.equal(session.finish(retry.epoch,true),true);assert.equal(session.intent,null);
 assert.ok(session.begin('kindle-journalist','work'));
});
test('close and reopen retain original intent but reject late response and finalizer',()=>{
 const session=new NotableRequest(),first=session.begin('kindle-journalist','news');session.invalidate();
 assert.equal(session.current(first.epoch),false);assert.equal(session.finish(first.epoch,true),false);assert.deepEqual(session.intent,first.intent);
 assert.equal(session.begin('korund-organizer','work',true),null);
 const reopened=session.begin('kindle-journalist','work',true);assert.deepEqual(reopened.intent,first.intent);
 assert.equal(session.finish(first.epoch,true),false);assert.equal(session.begin('kindle-journalist','news',true),null);
 assert.equal(session.finish(reopened.epoch,false),true);assert.deepEqual(session.intent,first.intent);
});

test('unknown proxy-shaped failures do not acknowledge or release an original intent',()=>{
 const session=new NotableRequest(),attempt=session.begin('kindle-journalist','news');
 for(const status of [400,403,503]){
  assert.equal(notableFailureAcknowledged(status,{error:'Request failed'}),false);
  assert.equal(notableFailureAcknowledged(status,{status:502,error:'Request failed'}),false);
  assert.equal(notableFailureAcknowledged(status,{status,error:42}),false);
  assert.equal(notableFailureAcknowledged(status,{status,error:'Recorded API result'}),true);
 }
 assert.equal(session.finish(attempt.epoch,notableFailureAcknowledged(400,{error:'Proxy error'})),true);
 assert.deepEqual(session.intent,attempt.intent);assert.equal(session.begin('kindle-journalist','work'),null);
});

test('freeform retries preserve the exact question and topic across close and edited inputs',()=>{
 const session=new NotableRequest(),first=session.begin('kindle-journalist','news',false,'What public work is recorded?\nPlease explain.');session.invalidate();
 const retry=session.begin('kindle-journalist','work',true,'Edited replacement question');assert.deepEqual(retry.intent,first.intent);assert.equal(retry.intent.question,'What public work is recorded?\nPlease explain.');assert.equal(retry.intent.topic,'news');assert.equal(session.finish(first.epoch,true),false);session.finish(retry.epoch,false);assert.equal(session.begin('kindle-journalist','work',false,'Another question'),null);
});
