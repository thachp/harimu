/** Actual client confirmation + actual local route, with a lost-response seam. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';

const tree=ts.createSourceFile('page.tsx',await readFile(new URL('../app/page.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let node;const find=current=>{if(ts.isFunctionDeclaration(current)&&current.name?.text==='confirmEnrollment')node=current;ts.forEachChild(current,find);};
find(tree);assert.ok(node);
const js=ts.transpileModule(node.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function client(fetch){
  const state={CitizenNationId:'kindle',PendingEnrollment:'korund'},ref=current=>({current});
  const bindings={clerkConfigured:true,citizenSessionStatus:'ready',citizenNation:{id:'kindle'},citizenNationId:'kindle',
    enrollmentPending:false,enrollmentLock:ref(false),enrollmentExpectedNation:'kindle',workLock:ref(false),marketIntent:ref(null),playerIntent:ref(null),korundIntent:ref(null),aurelleIntent:ref(null),
    citizenEpoch:ref(1),fetch,changeView:view=>{state.Scene=view;},closeEnrollmentReview:()=>{state.PendingEnrollment=null;}};
  for(const name of ['EnrollmentError','EnrollmentPending','CitizenNationId','SelectedId','KorundPlan','AurellePlan',
    'CitizenshipStatus','Economy','Market','PlayerMarket','PendingEnrollment'])bindings[`set${name}`]=value=>{state[name]=value;};
  return {state,bindings,confirm:new Function(...Object.keys(bindings),`${js};return confirmEnrollment;`)(...Object.values(bindings))};
}

test('lost enrollment response retries original expected citizenship and records one change, with reopen recovery',async t=>{
  const r=await localRuntime();t.after(()=>r.close());let attempts=0;const sent=[];
  const c=client(async(_url,options)=>{
    const command=JSON.parse(options.body);sent.push(command);
    assert.equal(command.expectedNationId,'kindle');
    const response=await r.call('citizen','alice',command);
    if(++attempts===1){assert.equal(response.status,200);throw new Error('Fixture response lost after commit');}
    return Response.json(response.data,{status:response.status});
  });
  await c.confirm({id:'korund'});
  assert.ok(c.state.EnrollmentError);assert.equal(c.state.CitizenNationId,'kindle');
  assert.equal(c.state.EnrollmentPending,false);
  assert.equal((await r.call('citizen','alice')).data.profile.nationId,'korund');
  await c.confirm({id:'korund'});
  assert.equal(attempts,2);assert.deepEqual(sent[0],sent[1]);assert.equal(c.state.CitizenNationId,'korund');
  assert.equal(c.state.PendingEnrollment,null);
  assert.equal(c.state.Scene,'workplace');assert.equal(c.bindings.enrollmentLock.current,false);
  r.reopen();
  const row=await r.db.prepare('SELECT nation_id,nation_changes FROM citizens WHERE clerk_user_id=?').bind('alice').first();
  assert.equal(row.nation_id,'korund');assert.equal(row.nation_changes,1);
});

test('late enrollment response cannot replace the next account and pending economic intents block confirmation',async()=>{
  let resolve;const response=new Promise(done=>{resolve=done;});const c=client(()=>response);
  const pending=c.confirm({id:'korund'});c.bindings.citizenEpoch.current++;
  c.state.CitizenNationId='aurelle';c.state.PendingEnrollment=null;
  resolve(Response.json({ok:true,nationId:'korund',citizenship:{changesRemaining:0}}));await pending;
  assert.equal(c.state.CitizenNationId,'aurelle');assert.equal(c.state.PendingEnrollment,null);
  let calls=0;const blocked=client(async()=>{calls++;return Response.json({ok:true});});
  blocked.bindings.aurelleIntent.current={action:'aurelle-buy-food'};
  await blocked.confirm({id:'korund'});assert.equal(calls,0);assert.match(blocked.state.EnrollmentError,/pending economic action/);
});

test('repeated confirmation shares the pending lock and pending signup cannot submit',async()=>{
  let finish,calls=0;
  const response=new Promise(resolve=>{finish=resolve;});
  const c=client(()=>{calls++;return response;});
  const first=c.confirm({id:'korund'});
  const repeated=c.confirm({id:'korund'});
  finish(Response.json({ok:true,nationId:'korund',citizenship:{changesRemaining:0}}));
  await Promise.all([first,repeated]);
  assert.equal(calls,1);
  assert.equal(c.bindings.enrollmentLock.current,false);
  const signup=client(()=>{throw new Error('Pending signup must not send enrollment');});
  signup.bindings.citizenSessionStatus='pending-signup';
  // Reconstruct the captured function with the pending auth state.
  signup.confirm=new Function(...Object.keys(signup.bindings),`${js};return confirmEnrollment;`)(...Object.values(signup.bindings));
  await signup.confirm({id:'korund'});
  assert.equal(signup.state.CitizenNationId,'kindle');
});

test('pending enrollment review survives refresh for its account and rejects invalid or foreign state',()=>{
  const names=['enrollmentReviewKey','readEnrollmentReview','writeEnrollmentReview'];
  const statements=tree.statements.filter(statement=>
    (ts.isFunctionDeclaration(statement)&&names.includes(statement.name?.text))||
    (ts.isVariableStatement(statement)&&statement.declarationList.declarations.some(declaration=>names.includes(declaration.name.getText(tree)))));
  assert.equal(statements.length,3);
  const compiled=ts.transpileModule(statements.map(statement=>statement.getText(tree)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const entries=new Map();
  const storage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
  const load=()=>new Function('window','fallbackNations',`${compiled};return {readEnrollmentReview,writeEnrollmentReview,enrollmentReviewKey};`)({sessionStorage:storage},['kindle','korund','aurelle'].map(id=>({id})));
  const helpers=load(),review={nationId:'korund',expectedNationId:'kindle'};
  helpers.writeEnrollmentReview('alice',review);
  assert.deepEqual(load().readEnrollmentReview('alice'),review);
  assert.equal(helpers.readEnrollmentReview('bob'),null);
  assert.equal(helpers.readEnrollmentReview(null),null);
  for(const invalid of ['not json',JSON.stringify({nationId:'unknown',expectedNationId:null}),JSON.stringify({nationId:'korund',expectedNationId:'foreign'}),JSON.stringify({nationId:'korund',expectedNationId:42}),JSON.stringify({nationId:'korund'})]) {
    entries.set(helpers.enrollmentReviewKey('alice'),invalid);
    assert.equal(helpers.readEnrollmentReview('alice'),null);
  }
  helpers.writeEnrollmentReview('alice',null);assert.equal(entries.size,0);
});
