import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
import * as validation from '../lib/square-chat-validation.ts';
const require=createRequire(import.meta.url);
const compiled=ts.transpileModule(await readFile(new URL('../app/square-chat.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
function harness({text='',busy=false,uncertain=false,pendingIntent=null,cityId='city'}={}){
 const state={nationId:'kindle',cityId:'city',present:0,messages:[{id:'message',mine:true,handle:'Citizen',body:'A message',postedAt:0}]};
 const slots=[state,text,'',busy,false,uncertain,[]], refs=[{current:pendingIntent},{current:0}], requests=[];
 let cursor=0,refCursor=0;
 const react={useState(){const i=cursor++;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}];},useRef(){return refs[refCursor++];},useCallback(fn){return fn;},useEffect(){}};
 const exports={};
 new Function('exports','require','fetch',compiled)(exports,name=>name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='react'?react:name.endsWith('.css')?{}:name==='../lib/square-chat-validation'?validation:require(name),async(url,options)=>{requests.push({url,...options});return {ok:true,status:200,json:async()=>state};});
 function render(){cursor=0;refCursor=0;const wrapper=exports.SquareChat({enabled:true,nationId:'kindle',cityId,session:'ready'});return wrapper.type(wrapper.props);}
 const all=node=>[node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child=>typeof child==='object'?all(child):[child])];
 return {render,all,requests,slots};
}
test('empty chat, missing city and pending edits show visible descriptions',()=>{
 const h=harness();
 const html=h.all(h.render());
 const send=html.find(node=>node?.type==='button'&&node.props.children==='Send message');
 assert.equal(send.props.disabled,true);
 assert.equal(send.props['aria-describedby'],'city-message-send-reason');
 assert.ok(html.some(node=>node?.props?.id==='city-message-send-reason'));
 const missing=harness({cityId:null});const nodes=missing.all(missing.render());
 const presence=nodes.find(node=>node?.type==='input');
 assert.equal(presence.props.disabled,true);assert.equal(presence.props.checked,false);
 assert.equal(presence.props['aria-describedby'],'city-presence-reason');
});
test('busy or invalid chat submission performs no request even if invoked directly',()=>{
 for(const props of [{busy:true,text:'Hello'},{text:' '},{text:'x'.repeat(281)},{text:'Hello\u0000'}]){
  const h=harness(props);h.all(h.render()).find(node=>node?.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(h.requests.length,0);
 }
});
test('uncertain chat preserves the original retry and blocks deleting or editing',async()=>{
 const original={id:'same-request',text:'Original message'};
 const h=harness({text:'Original message',uncertain:true,pendingIntent:original});const nodes=h.all(h.render());
 const remove=nodes.find(node=>node?.type==='button'&&node.props.children==='Remove my message');
 assert.equal(remove.props.disabled,true);assert.equal(remove.props['aria-describedby'],'city-message-edit-reason');
 remove.props.onClick();assert.equal(h.requests.length,0);
 const input=nodes.find(node=>node?.type==='textarea');input.props.onChange({target:{value:'Changed'}});assert.equal(h.slots[1],'Original message');
 nodes.find(node=>node?.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(h.requests.length,1);assert.deepEqual(JSON.parse(h.requests[0].body),{action:'post',id:original.id,text:original.text});
 await Promise.resolve();
});
