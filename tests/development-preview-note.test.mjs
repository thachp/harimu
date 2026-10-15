import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const {renderToStaticMarkup}=require('react-dom/server');
const source=await readFile(new URL('../app/development-preview-note.tsx',import.meta.url),'utf8');
const exports={};new Function('exports','require',ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(exports,require);
const flag='NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW';
const render=value=>{const before=process.env[flag];if(value===undefined)delete process.env[flag];else process.env[flag]=value;try{return renderToStaticMarkup(exports.DevelopmentPreviewNote());}finally{if(before===undefined)delete process.env[flag];else process.env[flag]=before;}};

test('the development-preview note renders only when the preview flag is exactly "true"',()=>{
 const on=render('true');assert.match(on,/class="development-preview-note"/);assert.match(on,/Development preview/);assert.match(on,/Fresh development world\. Production progress is separate\./);
 for(const value of [undefined,'false','','1','TRUE'])assert.equal(render(value),'',`flag ${JSON.stringify(value)} must render nothing`);
});

test('the note has a single mount point in the settings dialog and is gone from the top bar',async()=>{
 const settings=await readFile(new URL('../app/game-settings.tsx',import.meta.url),'utf8');
 assert.equal(settings.match(/<DevelopmentPreviewNote\/>/g)?.length,1,'one mount point');
 const dialog=settings.slice(settings.indexOf('<dialog'));assert.ok(dialog.includes('<DevelopmentPreviewNote/>'),'mounted inside the settings dialog');
 for(const file of ['page.tsx','game-shell.tsx','globals.css']){const text=await readFile(new URL(`../app/${file}`,import.meta.url),'utf8');
  assert.ok(!/Development preview|development-preview-label/.test(text),`${file} must not carry the old top-bar label`);}
});
