'use client';
import {NationDocument} from './nation-document';
import {WeeklyAddresses} from './weekly-addresses';
import {useDisplayTimestamp} from './display-preferences';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { NationalNews } from '../lib/national-news';
import { openNewsEvent } from '../lib/morning-brief';
import { AiTextTag } from './ai-disclosure';
import { personaMuted, templateMode } from '../lib/kill-switch-copy'; // #742 template footer, #764 muted news desk
import { WireStories } from './wire-stories'; // #243
import { wireFiller } from '../lib/wire-bylines';
import { pressPacks } from '../lib/press-templates';
import { newsIntroFor } from '../lib/news-intro-copy'; // #688: AI wording only when this edition holds a model-written item (the server never writes one with HARIMU_AI_NEWS_ENABLED off)
import { PRESS_HEADLINE_MAX, PRESS_PARAGRAPH_MAX, aurelleBroadsheetCopy, kindleNewspaperExistsError } from '../lib/kindle-newspapers'; // #1465 writer limits; #1475 broadsheet labels


const isPlayerArticle=(item:NationalNews['items'][number])=>item.source==='player'||item.kind==='player-article';
const playerAuthor=(name:unknown)=>typeof name==='string'&&name.trim()?name.trim():'A citizen';

export function NewsEdition({news}:{news:NationalNews}) {
 const formatTime=useDisplayTimestamp();
 return <NationDocument nationId={news.nationId} className={`national-news news-${news.style}`} label={news.title} documentLabel={news.style==='press'?'National press':news.style==='state'?'State Media':'Court gazette'}>
  <h2>{news.title}</h2><p>{newsIntroFor(news.style,news.items.some(item=>item.source==='model'))} Recorded events and rule-bound statements. {news.items.some(item=>item.source==='model')?'Model-written articles are labeled AI-generated.':'No model-written articles in this edition.'}</p>
  <section className="news-statistics" aria-label="Verified system statistics"><h3>{news.style==='state'?'System statistics · truthful':'System statistics'}</h3>{news.style==='state'&&<p className="news-truth-note">These figures come straight from the system ledger. State Media can spin the words in its templates, but it cannot change these numbers.</p>}<dl><div><dt>Registered citizens</dt><dd>{news.statistics.citizens}</dd></div><div><dt>Completed paid shifts</dt><dd>{news.statistics.completedShifts}</dd></div><div><dt>{news.nationId==='kindle'?'Food earned by citizens':'Food contributed to public supply'}</dt><dd>{news.statistics.food}</dd></div></dl><small>Durable ledger totals · as of <time dateTime={new Date(news.fetchedAt).toISOString()}>{formatTime(news.fetchedAt)}</time>. These figures count completed settlements; they do not measure progress against a production quota.</small></section>
  {news.planStat && <p className="news-plan-stat" role="status">{news.planStat.line}</p>}
  {news.templatesOnly&&<p className="news-template-mode" data-template-mode="true">{templateMode.footer.text}</p>}
  {news.personaMuted&&<p className="news-persona-muted" data-persona-muted="true">{personaMuted.notice.text}</p>}
  {!news.items.length && <p>No recorded national articles yet. Your statistics above are current; sample city noticeboard stories are separate.</p>}
  <ol className="national-news-items">{news.items.map(item=>{const player=isPlayerArticle(item);return <li key={item.id} data-news-id={item.id} data-news-kind={player?'player-article':undefined} tabIndex={-1}><article><h3>{item.title}</h3><time className="news-dateline" dateTime={new Date(item.occurredAt).toISOString()}>{formatTime(item.occurredAt)}</time>{player?<><p className="news-paper-name">{item.paperName}</p><p className="news-byline">{playerAuthor(item.authorName)}</p>{item.tag?<small className="news-broadsheet-tag">{item.tag}</small>:null}{(item.paragraphs?.length?item.paragraphs:[item.text]).map((paragraph,index)=><p key={index}>{paragraph}</p>)}</>:<>{item.source==='system'?<small className="news-source">System record</small>:<AiTextTag provenance={item.source==='model'?'model':'deterministic'}/>}{item.kind==='template'&&<small className="news-source">State Media template</small>}{item.kind==='decree'&&<small className="news-source">Court gazette · decree</small>}<p>{item.text}</p>{news.templatesOnly&&item.source!=='system'&&<small className="news-source news-template-mode">{templateMode.footer.text}</small>}</>}</article></li>;})}</ol>
  {(()=>{const pack=wireFiller(news.nationId,pressPacks);return pack&&<WireStories pack={pack} />;})()}
 </NationDocument>;
}

export function NationalNewsControl({nationId,session,configured=true,kindleNewspapers=false,aurelleBroadsheets=false}:{nationId:string|null;session:'anonymous'|'loading'|'ready'|'error';configured?:boolean;kindleNewspapers?:boolean;aurelleBroadsheets?:boolean}) {
 const [open,setOpen]=useState(false),[focusId,setFocusId]=useState<string|null>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 // #73: a Morning brief headline opens this panel on that story.
 useEffect(()=>{const onOpen=(event:Event)=>{const id=(event as CustomEvent<{id?:unknown}>).detail?.id;setFocusId(typeof id==='string'?id:null);setOpen(true);};window.addEventListener(openNewsEvent,onOpen);return()=>window.removeEventListener(openNewsEvent,onOpen);},[]);
 return <><button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>{setFocusId(null);setOpen(true);}} aria-label="Open national news"><span aria-hidden="true">▤</span><span>News</span></button>{open&&createPortal(<NewsDialog nationId={nationId} session={session} configured={configured} kindleNewspapers={kindleNewspapers} aurelleBroadsheets={aurelleBroadsheets} focusId={focusId} onClose={()=>{setOpen(false);setFocusId(null);trigger.current?.focus();}}/>,document.body)}</>;
}
function NewsDialog({nationId,session,configured,kindleNewspapers=false,aurelleBroadsheets=false,focusId=null,onClose}:{nationId:string|null;session:'anonymous'|'loading'|'ready'|'error';configured:boolean;kindleNewspapers?:boolean;aurelleBroadsheets?:boolean;focusId?:string|null;onClose:()=>void}) {
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
  {blocked?<p role="status">{blocked}</p>:<>{loading&&<p role="status">Loading national news…</p>}{error&&<p role="alert">{error}</p>}{(kindleNewspapers&&nationId==='kindle'||aurelleBroadsheets&&nationId==='aurelle')&&<NewspaperWriter broadsheet={nationId==='aurelle'} onPublished={()=>{setLoading(true);setRefresh(value=>value+1);}}/>}{news&&news.nationId===nationId&&<><NewsEdition news={news}/><WeeklyAddresses key={nationId} nationId={nationId!}/></>}<button type="button" disabled={loading} aria-describedby={loading?'news-refresh-reason':undefined} onClick={()=>{setLoading(true);setRefresh(value=>value+1);}}>Refresh national news</button>{loading&&<small id="news-refresh-reason">The national feed is being loaded. Please wait before refreshing again.</small>}</>}
 </dialog>;
}
export function NewspaperWriter({onPublished,broadsheet=false}:{onPublished:()=>void;broadsheet?:boolean}) {
 const [name,setName]=useState(''),[paperName,setPaperName]=useState<string|null>(null),[founded,setFounded]=useState(false),[headline,setHeadline]=useState(''),[p1,setP1]=useState(''),[p2,setP2]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [foundIntent,setFoundIntent]=useState<{name:string,requestId:string}|null>(null);
 const [publishIntent,setPublishIntent]=useState<{key:string,requestId:string}|null>(null);
 const post=async(body:object)=>{
  const response=await fetch('/api/news',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json() as {error?:string;paper?:{name:string}};
  return {ok:response.ok,data};
 };
 const found=async(event:FormEvent)=>{
  event.preventDefault();
  const trimmed=name.trim();
  const requestId=foundIntent&&foundIntent.name===trimmed?foundIntent.requestId:crypto.randomUUID();
  if(!foundIntent||foundIntent.name!==trimmed)setFoundIntent({name:trimmed,requestId});
  setBusy(true);setError('');
  try{
   const res=await post({action:'found-paper',requestId,name:trimmed});
   if(res.ok&&res.data.paper){setPaperName(res.data.paper.name);setFounded(true);setError('');}
   else{
    const reason=res.data.error??'The newspaper could not be founded.';
    setError(reason);
    if(reason===kindleNewspaperExistsError)setFounded(true);
   }
  }catch{setError('The newspaper could not be founded.');}
  finally{setBusy(false);}
 };
 const publish=async(event:FormEvent)=>{
  event.preventDefault();
  const paragraphs=[p1,p2].map(s=>s.trim()).filter(Boolean);
  const key=JSON.stringify({headline:headline.trim(),paragraphs});
  const requestId=publishIntent&&publishIntent.key===key?publishIntent.requestId:crypto.randomUUID();
  if(!publishIntent||publishIntent.key!==key)setPublishIntent({key,requestId});
  setBusy(true);setError('');
  try{
   const res=await post({action:'publish',requestId,headline:headline.trim(),paragraphs});
   if(res.ok){setError('');setHeadline('');setP1('');setP2('');setPublishIntent(null);onPublished();}
   else setError(res.data.error??'The article could not be published.');
  }catch{setError('The article could not be published.');}
  finally{setBusy(false);}
 };
 return <section className="news-writer" aria-label="Newspaper writer">
  {error&&<p role="alert">{error}</p>}
  {!founded?<form onSubmit={found}><h2>{broadsheet?aurelleBroadsheetCopy.found:'Found a newspaper'}</h2><label>Newspaper name<input value={name} onChange={event=>setName(event.target.value)} maxLength={PRESS_HEADLINE_MAX} autoComplete="off" required/></label><button type="submit" disabled={busy}>Found paper</button></form>
  :<form onSubmit={publish}><h2>{broadsheet?aurelleBroadsheetCopy.publish:paperName?<>Publish in {paperName}</>:'Publish an article'}</h2><label>Headline<input value={headline} onChange={event=>setHeadline(event.target.value)} maxLength={PRESS_HEADLINE_MAX} autoComplete="off" required/></label><label>First paragraph<textarea value={p1} onChange={event=>setP1(event.target.value)} maxLength={PRESS_PARAGRAPH_MAX} required rows={3}/></label><label>Second paragraph<textarea value={p2} onChange={event=>setP2(event.target.value)} maxLength={PRESS_PARAGRAPH_MAX} rows={3}/></label><button type="submit" disabled={busy}>Publish article</button></form>}
 </section>;
}
