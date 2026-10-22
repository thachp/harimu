'use client';
import {NationDocument} from './nation-document';
import {WeeklyAddresses} from './weekly-addresses';
import {useDisplayTimestamp} from './display-preferences';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import type { NationalNews } from '../lib/national-news';
import { openNewsEvent } from '../lib/morning-brief';
import { AiTextTag } from './ai-disclosure';
import { templateMode } from '../lib/kill-switch-copy'; // #742: footer for editions in templates-only mode
import { newsIntroFor } from '../lib/news-intro-copy'; // #688: AI wording only when this edition holds a model-written item (the server never writes one with HARIMU_AI_NEWS_ENABLED off)

export function NewsEdition({news}:{news:NationalNews}) {
 const formatTime=useDisplayTimestamp();
 return <NationDocument nationId={news.nationId} className={`national-news news-${news.style}`} label={news.title} documentLabel={news.style==='press'?'National press':news.style==='state'?'State Media':'Court gazette'}>
  <h2>{news.title}</h2><p>{newsIntroFor(news.style,news.items.some(item=>item.source==='model'))} Recorded events and rule-bound statements. {news.items.some(item=>item.source==='model')?'Model-written articles are labeled AI-generated.':'No model-written articles in this edition.'}</p>
  <section className="news-statistics" aria-label="Verified system statistics"><h3>{news.style==='state'?'System statistics · truthful':'System statistics'}</h3>{news.style==='state'&&<p className="news-truth-note">These figures come straight from the system ledger. State Media can spin the words in its templates, but it cannot change these numbers.</p>}<dl><div><dt>Registered citizens</dt><dd>{news.statistics.citizens}</dd></div><div><dt>Completed paid shifts</dt><dd>{news.statistics.completedShifts}</dd></div><div><dt>{news.nationId==='kindle'?'Food earned by citizens':'Food contributed to public supply'}</dt><dd>{news.statistics.food}</dd></div></dl><small>Durable ledger totals · as of <time dateTime={new Date(news.fetchedAt).toISOString()}>{formatTime(news.fetchedAt)}</time>. These figures count completed settlements; they do not measure progress against a production quota.</small></section>
  {news.templatesOnly&&<p className="news-template-mode" data-template-mode="true">{templateMode.footer.text}</p>}
  {!news.items.length && <p>No recorded national articles yet. Your statistics above are current; sample city noticeboard stories are separate.</p>}
  <ol className="national-news-items">{news.items.map(item=><li key={item.id} data-news-id={item.id} tabIndex={-1}><article><h3>{item.title}</h3>{item.source==='system'?<small className="news-source">System record</small>:<AiTextTag provenance={item.source==='model'?'model':'deterministic'}/>}{item.kind==='template'&&<small className="news-source">State Media template</small>}{item.kind==='decree'&&<small className="news-source">Court gazette · decree</small>}<p>{item.text}</p>{news.templatesOnly&&item.source!=='system'&&<small className="news-source news-template-mode">{templateMode.footer.text}</small>}<time dateTime={new Date(item.occurredAt).toISOString()}>{formatTime(item.occurredAt)}</time></article></li>)}</ol>
 </NationDocument>;
}

export function NationalNewsControl({nationId,session,configured=true}:{nationId:string|null;session:'anonymous'|'loading'|'ready'|'error';configured?:boolean}) {
 const [open,setOpen]=useState(false),[focusId,setFocusId]=useState<string|null>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 // #73: a Morning brief headline opens this panel on that story.
 useEffect(()=>{const onOpen=(event:Event)=>{const id=(event as CustomEvent<{id?:unknown}>).detail?.id;setFocusId(typeof id==='string'?id:null);setOpen(true);};window.addEventListener(openNewsEvent,onOpen);return()=>window.removeEventListener(openNewsEvent,onOpen);},[]);
 return <><button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setFocusId(null);setOpen(true);}} aria-label="Open national news"><span aria-hidden="true">▤</span><span>News</span></button>{open&&createPortal(<NewsDialog nationId={nationId} session={session} configured={configured} focusId={focusId} onClose={()=>{setOpen(false);setFocusId(null);trigger.current?.focus();}}/>,document.body)}</>;
}
function NewsDialog({nationId,session,configured,focusId=null,onClose}:{nationId:string|null;session:'anonymous'|'loading'|'ready'|'error';configured:boolean;focusId?:string|null;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const close=()=>{dialog.current?.close();onClose();};
 const [news,setNews]=useState<NationalNews|null>(null),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 useEffect(()=>{
  if(!configured||session!=='ready'||!nationId)return;
  const controller=new AbortController();let current=true;
  const load=async()=>{
   try{const response=await fetch('/api/news',{cache:'no-store',signal:controller.signal});const data=await response.json() as NationalNews&{error?:string};if(!current)return;if(!response.ok)throw Error(data.error??'National news unavailable.');if(data.nationId!==nationId)throw Error('Citizenship changed. Close news and refresh your citizen.');setNews(data);setError('');}
   catch(e){if(current)setError(e instanceof Error?e.message:'National news unavailable.');}
   finally{if(current)setLoading(false);}
  };void load();return()=>{current=false;controller.abort();};
 },[configured,session,nationId,refresh]);
 // #73: once the edition is loaded, scroll to and focus the story picked in the Morning brief.
 useEffect(()=>{if(!focusId||!news)return;const item=[...(dialog.current?.querySelectorAll<HTMLElement>('[data-news-id]')??[])].find(node=>node.dataset.newsId===focusId);if(item){item.scrollIntoView({block:'center'});item.focus();}},[focusId,news]);
 const blocked=!configured?'Local samples do not publish national news. Use the connected preview with citizenship.':session==='loading'?'Loading your citizen before reading national news…':session==='error'?'Your citizen account could not be loaded. Retry loading your citizen.':session==='anonymous'?'Sign in and choose citizenship to read your nation’s news.':!nationId?'Choose citizenship to read your nation’s news.':null;
 return <dialog ref={dialog} className="national-news-dialog" aria-labelledby="national-news-title" onClose={onClose} onCancel={event=>{event.preventDefault();event.stopPropagation();close();}} onKeyDown={event=>event.stopPropagation()} onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close();}}}>
  <header><h1 id="national-news-title">National news</h1><button type="button" onClick={close}>Close news</button></header>
  {blocked?<p role="status">{blocked}</p>:<>{loading&&<p role="status">Loading national news…</p>}{error&&<p role="alert">{error}</p>}{news&&news.nationId===nationId&&<><NewsEdition news={news}/><WeeklyAddresses key={nationId} nationId={nationId!}/></>}<button type="button" disabled={loading} aria-describedby={loading?'news-refresh-reason':undefined} onClick={()=>{setLoading(true);setRefresh(value=>value+1);}}>Refresh national news</button>{loading&&<small id="news-refresh-reason">The national feed is being loaded. Please wait before refreshing again.</small>}</>}
 </dialog>;
}
