'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import './square-chat.css';
type SquareState={nationId:string;messages:{id:string;handle:string;body:string;postedAt:number;mine:boolean}[];present:number};
type SquareAccess={enabled:boolean;nationId:string|null;configured?:boolean;session?:'anonymous'|'loading'|'error'|'ready'};
export function SquareChat(props:SquareAccess) { return <SquareChatSession key={`${props.enabled}:${props.nationId}`} {...props}/>; }
function SquareChatSession({enabled,nationId,configured=true,session='anonymous'}:SquareAccess) {
  const [state,setState]=useState<SquareState|null>(null),[text,setText]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[presence,setPresence]=useState(false),[uncertain,setUncertain]=useState(false);
  const [muted,setMuted]=useState<string[]>([]);
  const intent=useRef<{id:string;text:string}|null>(null);
  const generation=useRef(0);
  const refresh=useCallback(async()=>{
    const current=generation.current;
    try{const response=await fetch('/api/square',{cache:'no-store'});const data=await response.json() as SquareState & {error?:string};if(current!==generation.current)return;if(!response.ok)throw Error(data.error);setState(data);setError('');}catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Square unavailable.');}
  },[]);
  useEffect(()=>{const current=++generation.current;if(!enabled)return;const initial=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>{if(!document.hidden)void refresh();},15000);return()=>{generation.current=current+1;clearTimeout(initial);clearInterval(timer);};},[enabled,nationId,refresh]);
  useEffect(()=>{
    if(!enabled||!presence)return;
    const ping=(active:boolean)=>{void fetch('/api/square',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'presence',active}),keepalive:true}).catch(()=>{});};
    const visibility=()=>ping(!document.hidden);
    const leave=()=>ping(false);visibility();document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',leave);
    const timer=setInterval(visibility,30000);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',leave);ping(false);};
  },[enabled,presence,nationId]);
  async function command(payload:unknown,posted=false){
    if(busy)return;setBusy(true);setError('');const current=generation.current;
    try{const response=await fetch('/api/square',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json() as SquareState & {error?:string};if(current!==generation.current)return;if(!response.ok){if(posted&&response.status<500){intent.current=null;setUncertain(false);}throw Error(data.error);}setState(data);if(posted){intent.current=null;setUncertain(false);setText('');}}
    catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Connection uncertain. Retry the same message.');}finally{if(current===generation.current)setBusy(false);}
  }
  return <section className="square-chat" aria-labelledby="square-chat-title"><h3 id="square-chat-title">Citizen conversation</h3><p>Nation-only, plain-text messages. Last 50 shown; visible for 7 days; expired messages are deleted on the next square access. One message per 10 seconds, 20 per hour. Use your random citizen handle; avoid personal details. You can remove your own messages.</p>
    {!enabled?<p role={session === 'loading' ? 'status' : undefined}>{!configured ? 'Local demo has no chat or presence. Use the connected preview to join other citizens.' : session === 'loading' ? 'Loading your citizen account before opening the conversation…' : session === 'error' ? 'Your citizen account could not be loaded. Retry loading your citizen before joining the conversation.' : session === 'ready' ? 'You are signed in. Choose a nation and confirm citizenship to join its conversation.' : 'Sign in, then choose citizenship to join your nation’s conversation.'}</p>:<>
      <label><input type="checkbox" checked={presence} onChange={e=>setPresence(e.target.checked)}/> Share my presence while this square is visible</label><p>{state?.present??0} citizens sharing presence recently · expires within 90 seconds.</p>
      <button type="button" onClick={()=>void refresh()}>Refresh conversation</button>
      {muted.length>0&&<div><p>Muted in this square session only. Messages remain visible to other citizens.</p>{muted.map(handle=><button key={handle} type="button" onClick={()=>setMuted(handles=>handles.filter(value=>value!==handle))}>Unmute {handle}</button>)}</div>}
      <ol aria-label="Recent citizen messages">{state?.messages.filter(message=>!muted.includes(message.handle)).map(message=><li key={message.id}><div><strong>{message.handle}</strong> <time dateTime={new Date(message.postedAt*1000).toISOString()}>{new Date(message.postedAt*1000).toLocaleString()}</time></div><p>{message.body}</p>{!message.mine&&<button type="button" onClick={()=>setMuted(handles=>[...handles,message.handle])}>Mute this citizen locally</button>}{message.mine&&<button type="button" disabled={busy} onClick={()=>void command({action:'delete',id:message.id})}>Remove my message</button>}</li>)}</ol>
      {state&&!state.messages.length&&<p>No recent messages. Start a conversation with your fellow citizens.</p>}
      <form onSubmit={e=>{e.preventDefault();if(!text.trim())return;const pending=intent.current??{id:crypto.randomUUID(),text:text.trim()};intent.current=pending;setUncertain(true);void command({action:'post',id:pending.id,text:pending.text},true);}}><label htmlFor="square-message">Message ({text.length}/280)</label><textarea id="square-message" maxLength={280} value={text} disabled={busy||uncertain} onChange={e=>setText(e.target.value)}/><button disabled={busy||!text.trim()}>{busy?'Sending…':uncertain?'Retry same message':'Send message'}</button></form>
      {error&&<p role="alert">{error}</p>}
    </>}
  </section>;
}
