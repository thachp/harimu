import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
import {firstActionReason,pendingActionReason} from '../lib/action-reasons.ts';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function control(label,scope){
 let found;function visit(node){if(ts.isJsxElement(node)&&node.children.some(child=>ts.isJsxText(child)&&child.text.trim().startsWith(label)))found=node;ts.forEachChild(node,visit);}visit(ast);assert.ok(found,`Actual ${label} control`);
 const js=ts.transpileModule(`const control = (${found.getText(ast)});`,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
 const bindings={exports:{},require,ActionButton:()=>null,firstActionReason,pendingActionReason,...scope};
 return new Function(...Object.keys(bindings),`${js};return control;`)(...Object.values(bindings));
}
test('citizenship entry explains loading and failure and guards direct activation',()=>{
 for(const status of ['loading','error']){
  let entered=0;const node=control('Choose citizenship',{clerkConfigured:true,citizenSessionStatus:status,selected:{id:'kindle',shortName:'Kindle'},beginEnrollment(){entered++;}});
  assert.match(node.props.reason,status==='loading'?/account is loading/:/could not load/);node.props.onClick();assert.equal(entered,0);
 }
 let entered=0;const node=control('Choose citizenship',{clerkConfigured:true,citizenSessionStatus:'anonymous',selected:{id:'kindle',shortName:'Kindle'},beginEnrollment(){entered++;}});
 assert.equal(node.props.reason,null);node.props.onClick();assert.equal(entered,1);
});
test('previous nation action confirmation explains saving and cannot resubmit while busy',()=>{
 for(const [nation,label] of [['aurelle','Aurelle'],['korund','Korund']]){
  let called=0;const node=control(`Confirm previous ${label} action`,{workPending:true,[`${nation}Intent`]:{current:{}},[nation==='aurelle'?'runAurelleCommand':'runKorundCommand'](){called++;}});
  assert.match(node.props.reason,/action is being saved/);node.props.onClick();assert.equal(called,0);
 }
});
