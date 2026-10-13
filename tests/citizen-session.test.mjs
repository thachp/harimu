import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
// Transpile only this helper for Node, resolving its normal bundler imports.
const source = (await readFile(new URL('../lib/citizen-session.ts',import.meta.url),'utf8'))
  .replace("'./player-market'", JSON.stringify(new URL('../lib/player-market.ts',import.meta.url).href))
  .replace("'./market'", JSON.stringify(new URL('../lib/market.ts',import.meta.url).href));
const js = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { readCitizenIntents, writeCitizenIntents } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const map = new Map();
const storage = { getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key) };
const command = {action:'buy-listing',requestId:'10000000-0000-4000-8000-000000000001',listingId:'20000000-0000-4000-8000-000000000002'};
const pending = {player:command,market:null,government:null};
writeCitizenIntents(storage,'alice',pending);
assert.deepEqual(readCitizenIntents(storage,'alice'),pending,'same account restores original UUID after remount/reload');
assert.equal(readCitizenIntents(storage,'bob'),null,'new account cannot inherit previous pending transaction');
assert.equal(map.size,1);
assert.ok(!JSON.stringify([...map.values()]).includes('token'));
writeCitizenIntents(storage,'alice',{player:null,market:null,government:null});
assert.equal(readCitizenIntents(storage,'alice'),null,'confirmed intents are removed');
map.set('harimu-pending-intents-v1:alice','not json');
assert.equal(readCitizenIntents(storage,'alice'),null);
map.set('harimu-pending-intents-v1:alice',JSON.stringify({player:{...command,requestId:'invalid'},government:{topic:'unknown',requestId:command.requestId}}));
assert.deepEqual(readCitizenIntents(storage,'alice'),{player:null,market:null,government:null});
const disabled={getItem(){throw new Error('disabled');},setItem(){throw new Error('disabled');},removeItem(){throw new Error('disabled');}};
assert.equal(readCitizenIntents(disabled,'alice'),null);
assert.doesNotThrow(()=>writeCitizenIntents(disabled,'alice',pending));
console.log('Citizen intent recovery: reload UUID preservation, account isolation, clear, invalid/disabled storage passed');
