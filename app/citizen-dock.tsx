'use client';
import {useDisplayTimestamp} from './display-preferences';
import {Bell} from '@phosphor-icons/react';
import {createPortal} from 'react-dom';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {KorundPlan} from '../lib/korund';
import type {WorkShift} from '../lib/work-shifts';
import type {ElectionSnapshot} from '../lib/elections';
import type {CollectivePetitions} from '../lib/collective-petitions';
import type {GovernmentSnapshot} from '../lib/government';
import type {SceneView} from '../lib/scene-navigation';
import {civicInbox,markInboxRead,unreadInbox,type InboxItem} from '../lib/civic-inbox';
import {topBarEmblemEnabled} from '../lib/nation-emblem';
import {NationalNewsControl} from './national-news';
import {SquareChat} from './square-chat';
import {DiplomaticHall} from './diplomatic-hall'; // #599
import {hallOpenTo} from '../lib/diplomatic-hall';
import {hallChrome} from '../lib/diplomatic-hall-copy';

export function CivicInboxView({items,onNavigate,onRead}:{items:readonly InboxItem[];onNavigate:(view:SceneView)=>void;onRead:()=>void}){
 const formatTime=useDisplayTimestamp();
 return <section aria-label="Your civic inbox"><p>Work deadlines, your petition records and Korund ration-counter readiness. Kindle ballot and collective-petition alerts use recorded windows and thresholds.</p>
  {!items.length?<p>No recorded work, civic or ration-counter item needs your attention.</p>:<><button type="button" onClick={onRead}>Mark inbox read for this session</button><ul className="civic-inbox-items">{items.map(item=><li key={item.id}><h2>{item.title}</h2><p>{item.text}</p>{item.atLabel&&<span>{item.atLabel}: </span>}<time dateTime={new Date(item.at).toISOString()}>{formatTime(item.at)}</time><button type="button" onClick={()=>onNavigate(item.view)}>{item.view==='workplace'?'Open Work to check':item.view==='market'?'Open ration counter':'Read in Civic'}</button></li>)}</ul></>}
 </section>;
}
export function CitizenDock({diplomaticHall=false,nationId,cityId,cityVisible,session,configured,shifts,government,collectivePetitions,election,korund,onNavigate}:{diplomaticHall?:boolean;nationId:string|null;cityId?:string;cityVisible:boolean;session:'anonymous'|'loading'|'ready'|'error';configured:boolean;shifts:readonly WorkShift[];government:GovernmentSnapshot|null;collectivePetitions?:CollectivePetitions|null;election?:ElectionSnapshot|null;korund?:KorundPlan|null;onNavigate:(view:SceneView)=>void}){
 const [tab,setTab]=useState<'chat'|'hall'|'inbox'|null>(null),[now,setNow]=useState(0),[readIds,setReadIds]=useState<string[]>([]),[header,setHeader]=useState<HTMLElement|null>(null);
 const launcher=useRef<HTMLElement|null>(null),topBar=topBarEmblemEnabled();
 useEffect(()=>{const frame=requestAnimationFrame(()=>setHeader(document.getElementById('game-notification-slot')));const tick=()=>setNow(Date.now());tick();const timer=setInterval(tick,1000);return()=>{cancelAnimationFrame(frame);clearInterval(timer);};},[]);
 const enabled=configured&&session==='ready'&&Boolean(nationId);
 const items=enabled?civicInbox(shifts,government,nationId,now,collectivePetitions,election,korund):[],unread=unreadInbox(items,readIds);
 const read=()=>setReadIds(current=>markInboxRead(items,current));
 const open=(next:'chat'|'hall'|'inbox',element:HTMLElement)=>{launcher.current=element;if(next==='inbox')read();setTab(next);};
 const close=()=>{setTab(null);if(launcher.current?.isConnected)launcher.current.focus();};
 const hallTab=diplomaticHall&&enabled&&hallOpenTo(nationId); // #599: only while the flag is on, signed in and enrolled, and in a nation the hall is open to (never Korund)
 const blocked=!configured?'Local samples have no shared civic inbox. Use the connected preview with citizenship.':session==='loading'?'Loading your citizen before opening the civic inbox…':session==='error'?'Your citizen could not be loaded. Retry loading your citizen.':!enabled?'Sign in and choose citizenship to open your civic inbox.':null;
 return <>
  {header&&createPortal(<><button className={`game-notifications${topBar?' game-notifications-topbar':''}${topBar&&unread>0?' has-unread':''}`} type="button" aria-label={`Notifications, ${unread} unread`} aria-haspopup="dialog" aria-expanded={tab==='inbox'} title={`Open civic inbox · ${unread} unread this session`} onClick={event=>open('inbox',event.currentTarget)}><Bell size={16} aria-hidden="true"/>{(!topBar||unread>0)&&<strong>{unread}</strong>}</button>{topBar&&<span className="game-notifications-live" role="status">{unread>0?`${unread} unread ${unread===1?'notification':'notifications'}`:''}</span>}</>,header)}
  <nav className="citizen-dock" aria-label="Citizen communications"><button type="button" aria-haspopup="dialog" aria-expanded={tab==='chat'} onClick={event=>open('chat',event.currentTarget)}>Chat</button>{hallTab&&<button type="button" aria-haspopup="dialog" aria-expanded={tab==='hall'} onClick={event=>open('hall',event.currentTarget)}>{hallChrome.tabLabel}</button>}<NationalNewsControl nationId={nationId} session={session} configured={configured}/><button type="button" aria-haspopup="dialog" aria-expanded={tab==='inbox'} onClick={event=>open('inbox',event.currentTarget)}>Civic inbox{unread>0&&<strong> · {unread} unread</strong>}</button></nav>
  {tab&&createPortal(<DockDialog title={tab==='chat'?'Nation conversation':tab==='hall'?hallChrome.headerTitle:'Civic inbox'} onClose={close}>{tab==='hall'?(hallTab?<DiplomaticHall/>:null):tab==='chat'?<SquareChat enabled={enabled} configured={configured} session={session} nationId={nationId} cityId={cityId} presenceAllowed={cityVisible}/>:blocked?<p role="status">{blocked}</p>:<CivicInboxView items={items} onRead={read} onNavigate={view=>{close();onNavigate(view);}}/>}</DockDialog>,document.body)}
 </>;
}
function DockDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);const close=()=>{dialog.current?.close();onClose();};
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 return <dialog ref={dialog} className="national-news-dialog citizen-dock-dialog" aria-label={title} onClose={onClose} onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>event.stopPropagation()} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}}}><header><h1>{title}</h1><button type="button" onClick={close}>Close {title==='Civic inbox'?'inbox':'chat'}</button></header>{children}</dialog>;
}
