import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {localRuntime} from './helpers/local-runtime.mjs';
// #769: preview gateway logs, same Kindle facts, temperature 0. Both replies failed validatedNewsIntroduction,
// so the UTC day published nothing. The draft call must not be shown those values. No live AI is used.
const source=(await readFile(new URL('../lib/ai-news.ts',import.meta.url),'utf8')).replace("'./ai-budget'",JSON.stringify(new URL('../lib/ai-budget.ts',import.meta.url).href)).replace("'./ai-denylist'",JSON.stringify(new URL('../lib/ai-denylist.ts',import.meta.url).href)).replace("'./ai-kill-switch'",JSON.stringify(new URL('../lib/ai-kill-switch.ts',import.meta.url).href)).replace('30000','5');
const {prepareAiNews,validatedNewsIntroduction,readAiNews}=await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`);
const now=Date.UTC(2026,9,24,12,0,0)/1000,budget={dailyBudgetMicro:970000,gatewayId:'harimu-test'};
const facts={citizens:2,completedShifts:11,food:24};
const news={nationId:'kindle',title:'Kindle Press',style:'press',fetchedAt:now*1000,statistics:facts,items:[]};
const captured=[
 {title:'National Ledger Update',summary:'The nation of Kindle has recorded 2 citizens, 11 completed shifts, and 24 units of food.',claims:['citizens','completedShifts','food']},
 {title:'National Ledger Update',summary:'The nation of Kindle has recorded a total of citizens, completed shifts, and food, as reflected in its national ledger.',claims:['citizens','completedShifts','food']},
];
const good={title:'National ledger record',summary:'The public ledger records registered citizens, completed paid shifts and food.',claims:['citizens','completedShifts','food']};

test('#769 captured preview drafts are rejected; the prompt example is accepted',()=>{
 for(const draft of captured)assert.equal(validatedNewsIntroduction(draft),null,draft.summary);
 assert.ok(validatedNewsIntroduction(good));
});
test('#769 the draft call names the measures and contains no digits; verification still gets the ledger values',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const calls=[];
 const ai={async run(_model,input){calls.push(input);return {response:[JSON.stringify(good),JSON.stringify({supported:true}),'safe'][calls.length-1]};}};
 await prepareAiNews(r.db,news,now,ai,{enabled:true,budget});
 assert.equal(calls.length,3);
 const draftMessages=JSON.stringify(calls[0].messages);
 assert.doesNotMatch(draftMessages,/\d/,'draft prompt must not contain the ledger values');
 assert.deepEqual(JSON.parse(calls[0].messages[1].content),{nationId:'kindle',available:['citizens','completedShifts','food'],note:'The server shows the values of these counts after your summary.'});
 assert.match(calls[0].messages[0].content,/An acceptable summary is: The public ledger records registered citizens, completed paid shifts and food\./);
 assert.match(calls[0].messages[0].content,/a total of/);
 assert.deepEqual(JSON.parse(calls[1].messages[1].content).facts,{nationId:'kindle',...facts});
 const items=await readAiNews(r.db,'kindle');
 assert.equal(items.length,1);
 assert.match(items[0].text,/2 registered citizens/);
 assert.match(items[0].text,/11 completed paid shifts/);
 assert.match(items[0].text,/24 food earned/);
 assert.doesNotMatch(items[0].text,/a total of/);
});
