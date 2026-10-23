// #243: filler wire stories under their in-world byline (NEXT_PUBLIC_HARIMU_WIRE_BYLINES). Flag off and on run the same edition assertions; with the flag on
// the nation's pack follows the recorded articles, each story reading headline, byline, body; it gives way once a player paper publishes.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {pressPacks} from '../lib/press-templates.ts';
import {wireBylinesEnabled,wireFiller} from '../lib/wire-bylines.ts';
const require=createRequire(import.meta.url);
const compile=async file=>ts.transpileModule(await readFile(new URL(`../app/${file}`,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
const tags={};new Function('exports','require',await compile('ai-disclosure.tsx'))(tags,require);
const documents={};new Function('exports','require',await compile('nation-document.tsx'))(documents,name=>name==='../lib/nation-themes'?require('../lib/nation-themes.ts'):require(name));
const wire={};new Function('exports','require',await compile('wire-stories.tsx'))(wire,name=>name==='./ai-disclosure'?tags:require(name));
const source=await compile('national-news.tsx');
const real={};new Function('exports','require',source)(real,name=>name==='./wire-stories'?wire:name==='../lib/wire-bylines'?require('../lib/wire-bylines.ts'):name==='../lib/press-templates'?require('../lib/press-templates.ts'):name==='../lib/news-intro-copy'?require('../lib/news-intro-copy.ts'):name==='../lib/kill-switch-copy'?require('../lib/kill-switch-copy.ts'):name==='../lib/morning-brief'?require('../lib/morning-brief.ts'):name==='./nation-document'?documents:name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./weekly-addresses'?{WeeklyAddresses:()=>null}:name==='./ai-disclosure'?tags:require(name));
const edition=nationId=>({nationId,title:{kindle:'Kindle Press',korund:'Korund State Media',aurelle:'Aurelle Court Gazette'}[nationId],style:{kindle:'press',korund:'state',aurelle:'court'}[nationId],fetchedAt:1768489200000,statistics:{citizens:2,completedShifts:1,food:4},items:[{id:'record',title:'Work recorded',text:'4 food recorded',source:'system',occurredAt:1768489200000},{id:'policy',title:'Statement',text:'A bounded proposal.',source:'deterministic',occurredAt:1768489200000}]});
const render=nationId=>renderToStaticMarkup(React.createElement(real.NewsEdition,{news:edition(nationId)}));
const nations=['kindle','korund','aurelle'];

test('flag: only the exact string "true"; filler only for a nation with a pack, and it gives way once a player paper publishes',()=>{
 assert.equal(wireBylinesEnabled('true'),true);for(const v of [undefined,'','false','TRUE'])assert.equal(wireBylinesEnabled(v),false);
 for(const id of nations){assert.equal(wireFiller(id,pressPacks,0,true),pressPacks[id]);assert.equal(wireFiller(id,pressPacks,1,true),null,'a player paper replaces the filler');assert.equal(wireFiller(id,pressPacks,0,false),null);}
 for(const id of [null,undefined,'','ilmar'])assert.equal(wireFiller(id,pressPacks,0,true),null);
});

for(const flag of ['false','true'])test(`National news edition with NEXT_PUBLIC_HARIMU_WIRE_BYLINES=${flag}: edition unchanged; wire stories only when on`,()=>{
 process.env.NEXT_PUBLIC_HARIMU_WIRE_BYLINES=flag;
 try{for(const id of nations){
  const html=render(id),pack=pressPacks[id],news=edition(id);
  assert.match(html,new RegExp(news.title));assert.match(html,/Registered citizens/);assert.match(html,/System record/);
  process.env.NEXT_PUBLIC_HARIMU_WIRE_BYLINES='false';const plain=render(id);process.env.NEXT_PUBLIC_HARIMU_WIRE_BYLINES=flag;
  if(flag==='false'){assert.equal(html,plain);assert.doesNotMatch(html,/wire-stories/);continue;}
  assert.ok(html.startsWith(plain.slice(0,plain.indexOf('</ol>')+5)),'the recorded articles come first, unchanged');
  assert.match(html,new RegExp(`class="wire-stories wire-${pack.outlet}" aria-labelledby="wire-${id}"><h3 id="wire-${id}">${pack.byline.name}</h3>`));
  for(const story of pack.templates){
   const at=html.indexOf(`id="${story.id}-h"`);assert.ok(at>0,story.id);const art=html.slice(at,html.indexOf('</article>',at));
   const h=art.indexOf(story.headline.replace(/'/g,'&#x27;')),b=art.indexOf(`class="wire-byline">${pack.byline.name}`),p=art.indexOf(story.body[0].replace(/'/g,'&#x27;').replace(/"/g,'&quot;'));
   assert.ok(h>=0&&b>h&&p>b,`${story.id}: headline, then byline, then body`);
   assert.equal(/AI generated|aria-label="AI"|ai-badge/i.test(art.slice(b,p)),story.aiBadge,`${story.id}: AI badge only on Crown/Presidium voices`);
  }
 }}finally{delete process.env.NEXT_PUBLIC_HARIMU_WIRE_BYLINES;}
});

test('byline CSS: text keeps the document ink (no color set), outlets differ by rule shape, not color alone',()=>{
 const css=readFileSync(new URL('../app/game-shell.css',import.meta.url),'utf8'),block=css.slice(css.indexOf('/* #243:'),css.indexOf('/* #243:')+3000).split('\n').filter(l=>l.startsWith('.wire-')).join('\n');
 assert.doesNotMatch(block,/(^|[;{])color:/m,'no text color: contrast is the nation document ink on its paper');
 for(const [outlet,shape] of [['free-press',/border-top:1px solid/],['state-media',/dashed/],['court-gazette',/double/]])assert.match(block.split('\n').find(l=>l.startsWith(`.wire-${outlet}`))??'',shape,outlet);
});
