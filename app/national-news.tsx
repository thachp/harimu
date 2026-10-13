'use client';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import type { NationalNews } from '../lib/national-news';
import { AiTextTag } from './ai-disclosure';

export function NewsEdition({news}:{news:NationalNews}) {
 return <section className={`national-news news-${news.style}`} aria-label={news.title}>
  <h2>{news.title}</h2><p>National edition · recorded events and rule-bound statements. No live AI writer is connected.</p>
  <section className="news-statistics" aria-label="Verified system statistics"><h3>System statistics</h3><dl><div><dt>Registered citizens</dt><dd>{news.statistics.citizens}</dd></div><div><dt>Completed paid shifts</dt><dd>{news.statistics.completedShifts}</dd></div><div><dt>{news.nationId==='kindle'?'Food earned by citizens':'Food contributed to public supply'}</dt><dd>{news.statistics.food}</dd></div></dl><small>Durable ledger totals · as of <time dateTime={new Date(news.fetchedAt).toISOString()}>{new Date(news.fetchedAt).toUTCString()}</time>. These figures count completed settlements; they do not measure progress against a production quota.</small></section>
  {!news.items.length && <p>No recorded national articles yet. Your statistics above are current; sample city noticeboard stories are separate.</p>}
  <ol className="national-news-items">{news.items.map(item=><li key={item.id}><article><h3>{item.title}</h3>{item.source==='system'?<small className="news-source">System record</small>:<AiTextTag provenance={item.source==='model'?'model':'deterministic'}/>}<p>{item.text}</p><time dateTime={new Date(item.occurredAt).toISOString()}>{new Date(item.occurredAt).toUTCString()}</time></article></li>)}</ol>
 </section>;
}

export function NationalNewsControl({nationId,session,configured=true}:{nationId:string|null;session:'anonymous'|'loading'|'ready'|'error';configured?:boolean}) {
 const [open,setOpen]=useState(false);
 const trigger=useRef<HTMLButtonElement>(null);
 return <><button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)} aria-label="Open national news"><span aria-hidden="true">▤</span><span>News</span></button>{open&&createPortal(<NewsDialog nationId={nationId} session={session} configured={configured} onClose={()=>{setOpen(false);trigger.current?.focus();}}/>,document.body)}</>;
}
function NewsDialog({nationId,session,configured,onClose}:{nationId:string|null;session:'anonymous'|'loading'|'ready'|'error';configured:boolean;onClose:()=>void}) {
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
 const blocked=!configured?'Local samples do not publish national news. Use the connected preview with citizenship.':session==='loading'?'Loading your citizen before reading national news…':session==='error'?'Your citizen account could not be loaded. Retry loading your citizen.':session==='anonymous'?'Sign in and choose citizenship to read your nation’s news.':!nationId?'Choose citizenship to read your nation’s news.':null;
 return <dialog ref={dialog} className="national-news-dialog" aria-labelledby="national-news-title" onClose={onClose} onCancel={event=>{event.preventDefault();event.stopPropagation();close();}} onKeyDown={event=>event.stopPropagation()} onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)close();}}}>
  <header><h1 id="national-news-title">National news</h1><button type="button" onClick={close}>Close news</button></header>
  {blocked?<p role="status">{blocked}</p>:<>{loading&&<p role="status">Loading national news…</p>}{error&&<p role="alert">{error}</p>}{news&&news.nationId===nationId&&<NewsEdition news={news}/>}<button type="button" disabled={loading} aria-describedby={loading?'news-refresh-reason':undefined} onClick={()=>{setLoading(true);setRefresh(value=>value+1);}}>Refresh national news</button>{loading&&<small id="news-refresh-reason">The national feed is being loaded. Please wait before refreshing again.</small>}</>}
 </dialog>;
}
