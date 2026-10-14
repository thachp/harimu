'use client';
import {useDisplayTimestamp} from './display-preferences';
import {useCallback,useEffect,useRef,useState} from 'react';
import './square-chat.css';
import {validSquareText} from '../lib/square-chat-validation';
type SquareState={nationId:string;cityId:string;messages:{id:string;handle:string;body:string;postedAt:number;mine:boolean}[];present:number};
type SquareAccess={enabled:boolean;nationId:string|null;cityId?:string;configured?:boolean;presenceAllowed?:boolean;session?:'anonymous'|'loading'|'error'|'ready'};
export function SquareChat(props:SquareAccess) { return <SquareChatSession key={`${props.enabled}:${props.nationId}:${props.cityId}:${props.presenceAllowed??true}`} {...props}/>; }
function SquareChatSession({enabled,nationId,cityId,configured=true,presenceAllowed=true,session='anonymous'}:SquareAccess) {
 const formatTime=useDisplayTimestamp();
  const [state,setState]=useState<SquareState|null>(null),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[presence,setPresence]=useState(false),[uncertain,setUncertain]=useState(false);
  const [muted,setMuted]=useState<string[]>([]);
  const intent=useRef<{id:string;text:string}|null>(null);
  const generation=useRef(0),readVersion=useRef(0),commandActive=useRef(false);
  const refresh=useCallback(async()=>{
    if(commandActive.current)return;
    const current=generation.current,version=++readVersion.current;
    try{const response=await fetch('/api/square',{cache:'no-store'});const data=await response.json() as SquareState & {error?:string};if(current!==generation.current||version!==readVersion.current||commandActive.current)return;if(!response.ok)throw Error(data.error);if(data.nationId!==nationId)throw Error('Citizenship changed. Refresh your citizen before reopening chat.');setState(data);setError('');}catch(e){if(current===generation.current&&version===readVersion.current&&!commandActive.current)setError(e instanceof Error?e.message:'City conversation unavailable.');}
  },[nationId]);
  useEffect(()=>{const current=++generation.current;if(!enabled)return;const initial=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>{if(!document.hidden)void refresh();},15000);return()=>{generation.current=current+1;clearTimeout(initial);clearInterval(timer);};},[enabled,nationId,cityId,refresh]);
  useEffect(()=>{
    if(!enabled||!presence||!cityId||!presenceAllowed)return;
    const ping=(active:boolean)=>{void fetch('/api/square',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'presence',active,expectedCityId:cityId,expectedNationId:nationId}),keepalive:true}).catch(()=>{});};
    const visibility=()=>ping(!document.hidden);
    const leave=()=>ping(false);visibility();document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',leave);
    const timer=setInterval(visibility,30000);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',leave);ping(false);};
  },[enabled,presence,nationId,cityId,presenceAllowed]);
  async function command(payload:Record<string,unknown>,posted=false){
    if(!enabled||busy||commandActive.current||(!posted&&uncertain))return;commandActive.current=true;++readVersion.current;setBusy(true);setError('');const current=generation.current;
    try{const response=await fetch('/api/square',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,expectedNationId:nationId})});const data=await response.json() as SquareState & {error?:string};if(current!==generation.current)return;if(!response.ok){if(posted&&response.status<500){intent.current=null;setUncertain(false);}throw Error(data.error);}if(data.nationId!==nationId)throw Error('Citizenship changed. Refresh your citizen before reopening chat.');setState(data);if(posted){intent.current=null;setUncertain(false);setText('');}}
    catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Connection uncertain. Retry the same message.');}finally{if(current===generation.current){commandActive.current=false;++readVersion.current;setBusy(false);}}
  }
  const sendingReason=busy?'An action is being saved. Please wait.':!validSquareText(text)?'Enter a plain-text message of 1–280 characters.':null;
  const editingReason=busy?'An action is being saved. Please wait.':uncertain?'Retry the same message before editing or removing messages.':null;
  return <section className="square-chat" aria-labelledby="square-chat-title"><h3 id="square-chat-title">City conversation</h3><p>Nation-only, plain-text messages. Last 50 shown; visible for 7 days; expired messages are deleted on the next city conversation access. One message per 10 seconds, 20 per hour. Use your random citizen handle; avoid personal details. You can remove your own messages.</p>
    {!enabled?<p role={session === 'loading' ? 'status' : undefined}>{!configured ? 'Local demo has no chat or presence. Use the connected preview to join other citizens.' : session === 'loading' ? 'Loading your citizen account before opening the conversation…' : session === 'error' ? 'Your citizen account could not be loaded. Retry loading your citizen before joining the conversation.' : session === 'ready' ? 'You are signed in. Choose a nation and confirm citizenship to join its conversation.' : 'Sign in, then choose citizenship to join your nation’s conversation.'}</p>:<>
      <label><input type="checkbox" disabled={!cityId||!presenceAllowed} aria-describedby={!cityId||!presenceAllowed ? "city-presence-reason" : undefined} checked={presence&&presenceAllowed} onChange={e=>{if(cityId&&presenceAllowed)setPresence(e.target.checked);}}/> Share my presence while this city is visible</label>{(!cityId||!presenceAllowed)&&<small id="city-presence-reason">{!presenceAllowed?'Open your current City view before sharing presence. Leaving City or closing chat turns sharing off.':'Your current city must load before you can share presence.'}</small>}<p>{state && state.cityId === cityId ? `${state.present} citizens sharing presence in this city recently · includes you while sharing; expires within 90 seconds.` : 'Loading presence for this city…'}</p><p>Conversation is nation-wide. Presence counts only citizens in your current city who chose to share it; sharing turns off when you travel.</p>
      <button type="button" onClick={()=>void refresh()}>Refresh conversation</button>
      {muted.length>0&&<div><p>Muted in this city conversation session only. Messages remain visible to other citizens.</p>{muted.map(handle=><button key={handle} type="button" onClick={()=>setMuted(handles=>handles.filter(value=>value!==handle))}>Unmute {handle}</button>)}</div>}
      <ol aria-label="Recent citizen messages">{state?.messages.filter(message=>!muted.includes(message.handle)).map(message=><li key={message.id}><div><strong>{message.handle}</strong> <time dateTime={new Date(message.postedAt*1000).toISOString()}>{formatTime(message.postedAt*1000)}</time></div><p>{message.body}</p>{!message.mine&&<button type="button" onClick={()=>setMuted(handles=>[...handles,message.handle])}>Mute this citizen locally</button>}{message.mine&&<button type="button" disabled={busy||uncertain} aria-describedby={editingReason ? "city-message-edit-reason" : undefined} onClick={()=>void command({action:'delete',id:message.id})}>Remove my message</button>}</li>)}</ol>
      {state&&!state.messages.length&&<p>No recent messages. Start a conversation with your fellow citizens.</p>}
      <form onSubmit={e=>{e.preventDefault();if(!enabled||busy||!validSquareText(text)||(uncertain&&!intent.current))return;const pending=intent.current??{id:crypto.randomUUID(),text:text.trim()};intent.current=pending;setUncertain(true);void command({action:'post',id:pending.id,text:pending.text},true);}}><label htmlFor="square-message">Message ({text.length}/280)</label><textarea id="square-message" maxLength={280} value={text} disabled={busy||uncertain} aria-describedby={editingReason ? "city-message-edit-reason" : undefined} onChange={e=>{if(!busy&&!uncertain)setText(e.target.value);}}/><button disabled={Boolean(sendingReason)} aria-describedby={sendingReason ? "city-message-send-reason" : undefined}>{busy?'Sending…':uncertain?'Retry same message':'Send message'}</button>{sendingReason&&<small id="city-message-send-reason">{sendingReason}</small>}{editingReason&&<small id="city-message-edit-reason">{editingReason}</small>}</form>
      {error&&<p role="alert">{error}</p>}
    </>}
  </section>;
}
