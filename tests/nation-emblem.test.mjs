import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {nationEmblem,identityStatus,topBarEmblemEnabled} from '../lib/nation-emblem.ts';
import {nationTheme} from '../lib/nation-themes.ts';

test('emblem has an accessible name and uses the nation theme symbol and accent (#78)',()=>{
 const kindle=nationEmblem(nationTheme('kindle'),'Kindle Republic');
 assert.equal(kindle.label,'Kindle Republic emblem');assert.equal(kindle.symbol,nationTheme('kindle').symbol);assert.equal(kindle.accent,nationTheme('kindle').accent);assert.equal(kindle.fallback,false);
 for(const id of ['kindle','korund','aurelle'])assert.notEqual(nationEmblem(nationTheme(id),id).symbol,'','themed nations never render blank');
});
test('nations without a theme fall back to their initial instead of a blank box',()=>{
 const e=nationEmblem(nationTheme('varkand'),'Varkand');
 assert.deepEqual({symbol:e.symbol,accent:e.accent,fallback:e.fallback,label:e.label},{symbol:'V',accent:null,fallback:true,label:'Varkand emblem'});
 assert.equal(nationEmblem(null,'  ').symbol,'?');
});
test('visitors see "Visiting" only with the emblem flag on; other states keep their wording',()=>{
 const visitor={guestDemo:false,localDemo:false,hasCitizenNation:false};
 assert.equal(identityStatus(visitor,true),'Visiting');assert.equal(identityStatus(visitor,false),'Nation preview');
 assert.equal(identityStatus({...visitor,hasCitizenNation:true},true),'Your citizen');
 assert.equal(identityStatus({...visitor,localDemo:true},true),'Local demo');assert.equal(identityStatus({...visitor,guestDemo:true,localDemo:true},true),'Guest example');
});
test('the emblem flag is exactly "true" and is on in preview wrangler.jsonc and off in wrangler.prod.jsonc',async()=>{
 assert.equal(topBarEmblemEnabled('true'),true);for(const v of [undefined,'false','','1','TRUE'])assert.equal(topBarEmblemEnabled(v),false);
 assert.match(await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'),/"NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM": "true"/);
 assert.match(await readFile(new URL('../wrangler.prod.jsonc',import.meta.url),'utf8'),/"NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM": "false"/);
});
test('top-bar notifications button names the unread count and still opens the civic inbox (#78)',async()=>{
 const dock=await readFile(new URL('../app/citizen-dock.tsx',import.meta.url),'utf8');
 assert.match(dock,/className=\{`game-notifications[^`]*`\}[^>]*aria-label=\{`Notifications, \$\{unread\} unread`\}/);
 assert.match(dock,/aria-haspopup="dialog"[^>]*aria-expanded=\{tab==='inbox'\}[^>]*onClick=\{event=>open\('inbox',event\.currentTarget\)\}/);
});
test('flagged top-bar bell: badge only when unread, polite live count, 44px phone target, same unread source (#78)',async()=>{
 const dock=await readFile(new URL('../app/citizen-dock.tsx',import.meta.url),'utf8'),css=await readFile(new URL('../app/game-shell.css',import.meta.url),'utf8');
 assert.match(dock,/topBar=topBarEmblemEnabled\(\)/);
 assert.match(dock,/\(!topBar\|\|unread>0\)&&<strong>\{unread\}<\/strong>/);
 assert.match(dock,/topBar&&<span className="game-notifications-live" role="status">/);
 assert.equal((dock.match(/unreadInbox\(/g)||[]).length,1,'one unread source feeds the bell, the dock button and the live region');
 assert.match(css,/@media\(max-width:760px\)\{\.game-notifications-topbar\{min-height:44px;min-width:44px\}\.game-notifications-topbar\{flex-shrink:0;white-space:nowrap;box-sizing:border-box;width:44px;max-width:44px;padding:0\}\.game-notifications-topbar>svg\{display:block;flex:none;width:16px;height:16px\}\}/);
});
test('the phone identity-width rule only applies with the emblem on, so the flag-off top bar is unchanged (#78 review)',async()=>{
 const css=await readFile(new URL('../app/game-shell.css',import.meta.url),'utf8'),own=css.slice(css.indexOf('/* #78 nation emblem'));
 assert.ok(own.length>200);
 assert.match(own,/\.game-hud>\.game-identity:has\(\.nation-emblem\)\{flex:1 0 auto/);
 assert.doesNotMatch(own,/\.game-hud>\.game-identity\{/);
});
