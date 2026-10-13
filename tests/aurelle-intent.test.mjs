/** Execute the actual client command function with isolated session/fetch seams. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import ts from 'typescript';

const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let commandNode;
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='runAurelleCommand')commandNode=node;ts.forEachChild(node,visit);}
visit(tree);assert.ok(commandNode,'Actual client command seam exists');
const commandJS=ts.transpileModule(commandNode.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;

function runtime(fetch) {
  const storage=new Map(),state={},ref=current=>({current});
  const bindings={clerkConfigured:true,citizenSessionStatus:'ready',citizenNation:{id:'aurelle'},workShifts:[],
    marketIntent:ref(null),playerIntent:ref(null),korundIntent:ref(null),aurelleIntent:ref(null),
    workLock:ref(false),citizenEpoch:ref(1),citizenIdentity:ref('alice'),fetch,
    window:{sessionStorage:{setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}},
  };
  for(const name of ['WorkPending','WorkError','AurelleCommand','AurellePlan','WorkShifts','Capacity','RecentAction'])
    bindings[`set${name}`]=value=>{state[name]=value;};
  const run=new Function(...Object.keys(bindings),`${commandJS}; return runAurelleCommand;`)(...Object.values(bindings));
  return {run,bindings,state,storage};
}
const success=()=>Response.json({ok:true,aurellePlan:{walletMinor:500},capacity:14,shifts:[]});

test('uncertain Aurelle action persists original quantity and UUID, blocks replacement, and allows same-intent recovery',async()=>{
  let calls=0;let r;
  r=runtime(async(_url,options)=>{
    calls++;
    const saved=JSON.parse(r.storage.get('harimu-aurelle-intent-v1:alice'));
    assert.deepEqual(JSON.parse(options.body),saved);
    if(calls===1)throw new Error('Fixture connection interrupted');
    return success();
  });
  const command={action:'aurelle-buy-food',requestId:randomUUID(),quantity:2};
  await r.run(command);
  assert.equal(r.bindings.workLock.current,false);assert.equal(r.bindings.aurelleIntent.current,command);
  assert.deepEqual(JSON.parse(r.storage.get('harimu-aurelle-intent-v1:alice')),command);
  assert.match(r.state.WorkError,/Connection interrupted/);
  await r.run({...command,requestId:randomUUID(),quantity:1});assert.equal(calls,1);
  // A recovered session retry uses the stored command, preserving all server-bound terms.
  await r.run(JSON.parse(r.storage.get('harimu-aurelle-intent-v1:alice')));
  assert.equal(calls,2);assert.equal(r.bindings.aurelleIntent.current,null);
  assert.equal(r.storage.has('harimu-aurelle-intent-v1:alice'),false);assert.equal(r.state.Capacity,14);
});

test('late Aurelle response cannot overwrite a different account or clear its pending intent',async()=>{
  let resolveResponse;
  const response=new Promise(resolve=>{resolveResponse=resolve;});
  const r=runtime(()=>response),alice={action:'aurelle-buy-food',requestId:randomUUID(),quantity:2};
  const work=r.run(alice);
  const bob={action:'aurelle-start-work',requestId:randomUUID()};
  r.bindings.citizenEpoch.current++;r.bindings.citizenIdentity.current='bob';
  r.bindings.workLock.current=false;r.bindings.aurelleIntent.current=bob;
  r.state.Capacity=0;r.state.AurellePlan=null;r.state.AurelleCommand=bob;
  r.storage.set('harimu-aurelle-intent-v1:bob',JSON.stringify(bob));
  resolveResponse(success());await work;
  assert.equal(r.state.Capacity,0);assert.equal(r.state.AurellePlan,null);
  assert.equal(r.bindings.aurelleIntent.current,bob);assert.equal(r.state.AurelleCommand,bob);
  assert.deepEqual(JSON.parse(r.storage.get('harimu-aurelle-intent-v1:bob')),bob);
  assert.deepEqual(JSON.parse(r.storage.get('harimu-aurelle-intent-v1:alice')),alice);
});
