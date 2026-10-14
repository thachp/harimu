'use client';
import {Gear} from '@phosphor-icons/react';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {displayTimestamp,textScales,type TextScale} from '../lib/display-preferences';
import {useDisplayPreferences} from './display-preferences';
export function GameSettings(){
 const [open,setOpen]=useState(false);const launcher=useRef<HTMLButtonElement>(null);
 return <><button ref={launcher} type="button" className="game-settings-button" aria-label="Game settings" aria-haspopup="dialog" onClick={()=>setOpen(true)}><Gear size={17} aria-hidden="true"/></button>{open&&createPortal(<SettingsDialog onClose={()=>{setOpen(false);launcher.current?.focus();}}/>,document.body)}</>;
}
function SettingsDialog({onClose}:{onClose:()=>void}){
 const node=useRef<HTMLDialogElement>(null);const {preferences,save,storageAvailable}=useDisplayPreferences();
 const close=()=>{node.current?.close();onClose();};
 useEffect(()=>{const dialog=node.current;dialog?.showModal();return()=>dialog?.close();},[]);
 return <dialog ref={node} className="national-news-dialog game-settings-dialog" aria-label="Game settings" onClose={onClose} onCancel={event=>{event.preventDefault();close();}} onKeyDown={event=>event.stopPropagation()} onClick={event=>{if(event.target===event.currentTarget){const r=event.currentTarget.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)close();}}}><header><h1>Game settings</h1><button type="button" onClick={close}>Close settings</button></header>
 <p>Display preferences apply on this browser. They do not change game deadlines or citizen records.</p>
 <label>Graphics <select value={preferences.graphics} onChange={event=>save({...preferences,graphics:event.target.value==='low'?'low':'standard'})}><option value="standard">Standard</option><option value="low">Low</option></select></label><p>Low uses one render pixel per CSS pixel, disables shadows and edge smoothing, and keeps all map controls.</p>
 <label>Text size <select value={String(preferences.textScale??100)} onChange={event=>save({...preferences,textScale:Number(event.target.value) as TextScale})}>{textScales.map(scale=><option key={scale} value={scale}>{scale}%</option>)}</select></label><p>Scales text in the top bar, panels, dock and dialogs. Browser zoom also works and keeps every action reachable.</p>
 <label>Motion <select value={preferences.motion??'system'} onChange={event=>save({...preferences,motion:event.target.value==='reduce'?'reduce':'system'})}><option value="system">Follow device preference</option><option value="reduce">Reduced</option></select></label><p>Reduced stops automatic globe tour steps and interface animations. Manual map controls remain available. Device-level reduced motion is always respected.</p>
 <label>Time format <select value={preferences.timeFormat} onChange={event=>save({...preferences,timeFormat:event.target.value==='12'?'12':'24'})}><option value="24">24-hour</option><option value="12">12-hour</option></select></label><p>All dated game records use UTC. Example: <time dateTime="2026-01-01T17:30:00Z">{displayTimestamp('2026-01-01T17:30:00Z',preferences.timeFormat)}</time>. Countdown durations are unchanged.</p>
 <label>Audio <select disabled aria-describedby="settings-audio-reason" value="off" onChange={()=>{}}><option value="off">Off</option></select></label><p id="settings-audio-reason">This preview has no music or sound effects.</p>
 <label>Language <select disabled aria-describedby="settings-language-reason" value="en" onChange={()=>{}}><option value="en">English</option></select></label><p id="settings-language-reason">English is the only translated language available in this preview.</p>
 {!storageAvailable&&<p role="status">Browser storage is unavailable. Changes apply for this visit and may not survive reload.</p>}
 </dialog>;
}
