import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {localRuntime} from './helpers/local-runtime.mjs';
import {quoteTessera, summarizeWallet, formatMinor, sparkToTesseraRate, describeTransaction} from '../lib/wallet.ts';
const require=createRequire(import.meta.url);

test('SPK is quoted in TSR at the fixed placeholder rate and TSR defaults to zero',()=>{
 assert.equal(sparkToTesseraRate,0.25);assert.equal(quoteTessera(1000),250);assert.equal(quoteTessera(3),0,'quotes round down');
 const w=summarizeWallet(1234);assert.equal(w.tesseraMinor,0);assert.deepEqual(w.quote.from+w.quote.to,'SPKTSR');assert.deepEqual(w.transactions,[]);
 assert.equal(formatMinor(-350),'−3.50');assert.equal(formatMinor(800,true),'+8.00');assert.equal(formatMinor(0,true),'0.00');
 assert.equal(describeTransaction({kind:'market-buy',item:'food',quantity:2}),'Market purchase · 2 food');
});

test('every wage and market purchase appears in history and reconciles with the server balance',async t=>{
 const r=await localRuntime();t.after(()=>r.close());
 await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'});
 const shift=(await r.call('citizen','alice')).data.shifts[0];r.setNow(Date.parse(shift.completesAt));
 const claimed=await r.call('citizen','alice',{action:'claim-work',shiftId:shift.id});assert.equal(claimed.status,200);
 assert.equal(claimed.data.economy.tesseraMinor,0);
 assert.deepEqual(claimed.data.economy.transactions.map(x=>[x.kind,x.amountMinor]),[['wage',800]]);
 assert.match(claimed.data.economy.transactions[0].reason,/^Wage · /);
 const sum=e=>e.transactions.reduce((a,x)=>a+x.amountMinor,0);
 assert.equal(sum(claimed.data.economy),claimed.data.economy.walletMinor,'balance after shift matches history');
 const bought=await r.call('citizen','alice',{action:'market-trade',requestId:randomUUID(),side:'buy',item:'food',quantity:1});assert.equal(bought.status,200,bought.data.error);
 const e=bought.data.economy;assert.equal(e.walletMinor,650);
 assert.equal(e.transactions[0].kind,'market-buy');assert.equal(e.transactions[0].amountMinor,-150);assert.equal(e.transactions[0].reason,'Market purchase · 1 food');
 assert.equal(sum(e),e.walletMinor,'balance after purchase matches history');
 assert.ok(e.transactions.every(x=>!Number.isNaN(Date.parse(x.occurredAt))));
 r.reopen();const read=(await r.call('citizen','alice')).data.economy;assert.deepEqual(read.transactions,e.transactions);assert.equal(read.walletMinor,650);
 // Food bought for a meal is a market purchase and must be listed; eating stored food moves no SPK and adds no row.
 await r.db.prepare('UPDATE citizens SET capacity=10 WHERE clerk_user_id=?').bind('alice').run();
 r.setNow(r.now+60000);const mealFood=await r.call('citizen','alice',{action:'market-trade',requestId:randomUUID(),side:'buy',item:'food',quantity:2});assert.equal(mealFood.status,200,mealFood.data.error);
 const meal=await r.call('citizen','alice',{action:'household-meal',requestId:randomUUID()});assert.equal(meal.status,200,meal.data.error);
 const m=meal.data.economy;assert.deepEqual(m.transactions.map(x=>[x.kind,x.amountMinor,x.reason]),[['market-buy',-300,'Market purchase · 2 food'],['market-buy',-150,'Market purchase · 1 food'],['wage',800,m.transactions[2].reason]]);
 assert.equal(sum(m),m.walletMinor,'balance after buying meal food and eating matches history');
});

const compile=async file=>ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const nodes=node=>!node||typeof node!=='object'?[node]:typeof node.type==='function'&&node.type.name==='HudHelp'?nodes(node.type(node.props)):[node,...[node.props?.children].flat(Infinity).flatMap(nodes)];
const text=tree=>tree.filter(n=>typeof n==='string'||typeof n==='number').join(' ');

test('clicking SPK in the top bar opens the wallet; other currencies keep the help tip',async()=>{
 const exports={};new Function('exports','require',await compile('../app/game-shell.tsx'))(exports,name=>name==='@/lib/hud-help'?require('../lib/hud-help.ts'):name==='@/lib/notice-scope'?require('../lib/notice-scope.ts'):name==='@/lib/action-reasons'?require('../lib/action-reasons.ts'):name==='./game-settings'?{GameSettings:()=>null}:name==='./game-timer'?{GameTimer:()=>null}:name==='react'?{useEffect(){},useState:i=>[i,()=>{}]}:name==='./nation-strip-filters'?{NationStripFilters:()=>null}:name==='@/lib/nation-discovery'?require('../lib/nation-discovery.ts'):name==='@phosphor-icons/react'?new Proxy({},{get:(_,k)=>String(k)}):name.endsWith('.css')?{}:name==='./game-viewport'?{default:()=>null}:require(name));
 const nation={id:'kindle',name:'Kindle'};let opened=0;
 const tree=nodes(exports.GameShell({view:'square',nation,citizenNation:nation,nations:[],capacity:18,localDemo:false,panel:null,onNavigate(){},walletMinor:650,onOpenWallet:()=>opened++}));
 const button=tree.find(n=>n?.props?.className==='game-wallet-button');assert.ok(button);assert.equal(button.props['aria-label'],'Open wallet · 6.50 SPK');button.props.onClick();assert.equal(opened,1);
 const korund=nodes(exports.GameShell({view:'square',nation,citizenNation:nation,nations:[],capacity:18,localDemo:false,panel:null,onNavigate(){},walletMinor:650,currencyCode:'LN',onOpenWallet:()=>opened++}));
 assert.equal(korund.some(n=>n?.props?.className==='game-wallet-button'),false);
});

test('wallet panel shows SPK and TSR balances, the quote and each transaction',async()=>{
 const exports={};new Function('exports','require',await compile('../app/wallet-panel.tsx'))(exports,name=>name==='@phosphor-icons/react'?{X:()=>null}:name==='@/lib/wallet'?require('../lib/wallet.ts'):require(name));
 let closed=false;
 const tree=nodes(exports.WalletPanel({sparkMinor:650,transactions:[{id:'wage:1',kind:'wage',amountMinor:800,reason:'Wage · Harvest',occurredAt:'2026-10-14T10:00:00.000Z'},{id:'market:2',kind:'market-buy',amountMinor:-150,reason:'Market purchase · 1 food',occurredAt:'2026-10-14T11:00:00.000Z'}],onClose:()=>{closed=true;}}));
 const t=text(tree);
 for(const expected of [/6\.50\s+SPK/,/0\.00\s+TSR/,/1 SPK =\s+0\.25\s+TSR/,/1\.62\s+TSR/,/Wage · Harvest/,/\+8\.00/,/Market purchase · 1 food/,/−1\.50/])assert.match(t,expected);
 assert.equal(tree.find(n=>n?.props?.role==='dialog').props['aria-modal'],'true');
 tree.find(n=>n?.props?.['aria-label']==='Close wallet').props.onClick();assert.equal(closed,true);
 assert.match(text(nodes(exports.WalletPanel({onClose(){}}))),/Loading/);
 assert.match(text(nodes(exports.WalletPanel({sparkMinor:0,transactions:[],onClose(){}}))),/No wages, purchases or fees/);
});

test('review fixes: history comes from the balance snapshot, demo hides the wallet, Tab stays in the dialog',async()=>{
 const economy=await readFile(new URL('../lib/economy.ts',import.meta.url),'utf8');
 assert.match(economy,/AS history_json/);assert.match(economy,/prepare\(economyWalletSnapshotSql\)/);assert.doesNotMatch(economy.match(/export const economySnapshotSql = `[^`]+`/)[0],/\$\{/,'snapshot SQL literal has no interpolation');assert.doesNotMatch(economy,/prepare\(walletHistorySql\)/);
 const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.match(page,/onOpenWallet=\{clerkConfigured && !guestActive/);
 const exports={};new Function('exports','require',await compile('../app/wallet-panel.tsx'))(exports,name=>name==='@phosphor-icons/react'?{X:()=>null}:name==='@/lib/wallet'?require('../lib/wallet.ts'):require(name));
 const tree=nodes(exports.WalletPanel({sparkMinor:0,transactions:[],onClose(){}}));const dialog=tree.find(n=>n?.props?.role==='dialog');
 let prevented=false,focused=false;dialog.props.onKeyDown({key:'Tab',preventDefault(){prevented=true;},currentTarget:{querySelector:()=>({focus(){focused=true;}})}});
 assert.equal(prevented,true);assert.equal(focused,true);
 const {sortHistory}=await import('../lib/wallet.ts');
 assert.deepEqual(sortHistory([{id:'a',kind:'wage',occurred_at:5},{id:'b',kind:'market-buy',occurred_at:5},{id:'c',kind:'market-buy',occurred_at:9}]).map(r=>r.id),['c','b','a']);
});
