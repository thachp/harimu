import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
const entry=`import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
 window.mountShell=props=>{window.__root?.unmount();window.__root=createRoot(document.getElementById('root'));window.__root.render(<GameShell {...props} onNavigate={()=>{}} accountControls={<><button type="button" className="game-glossary" aria-label="Open morning brief"><span>Brief</span></button><button type="button" className="account-menu-trigger"></button></>} />);};`;
const css=(await readFile('app/globals.css','utf8')).replace(/@import[^;]+;/g,'')+(await readFile('app/game-shell.css','utf8'));
const pre='*,::before,::after{box-sizing:border-box;margin:0;padding:0;border:0 solid}button{background:none;font:inherit;color:inherit}svg{display:block}';
const script=await bundleShell(entry);
const b=await chromium.launch({args:['--disable-gpu']});
const props={...shellProps,view:'country',shiftSummary:{title:'Support the savanna harvest',endsAt:Math.floor(Date.now()/1000)+7000},citizenNation:shellProps.nation,localDemo:false};

for(const [w,h] of [[320,568],[360,740],[390,844],[480,800],[640,400],[760,500],[761,500],[900,500],[1024,600],[1280,800]])for(const sc of [1,1.25,1.5]){const p=await b.newPage({viewport:{width:w,height:h}});
 await p.setContent(`<!doctype html><html style="--text-scale:${sc}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${pre}${css}</style></head><body><div id="root"></div></body></html>`);
 await p.addScriptTag({content:script});await p.evaluate(pr=>window.mountShell(pr),props);await p.waitForSelector('.game-hud');
 await p.evaluate(()=>{const slot=document.getElementById('game-notification-slot');if(slot)slot.innerHTML='<button class="game-notifications" type="button"><svg width="16" height="16"></svg><strong>0</strong></button>';});
 const m=await p.evaluate(()=>{const vw=document.documentElement.clientWidth;const hud=document.querySelector('.game-hud');const off=[...hud.querySelectorAll('button,summary')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&(r.right>vw+.5||r.left<-.5)}).map(e=>(e.textContent.trim().slice(0,10)||e.className));return {docW:document.documentElement.scrollWidth-vw,off}});
 if(m.docW>1||m.off.length)console.log('OVERFLOW',w,h,sc,JSON.stringify(m));
 if(w===761||w===900||w===320)await p.screenshot({path:`/tmp/s346/rep-${w}x${h}-${sc*100}.png`});}
await b.close();console.log('done');
