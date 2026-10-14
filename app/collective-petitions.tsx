'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import type {CollectivePetitions} from '../lib/collective-petitions';
import type {VerificationState} from '../lib/verification';
import {validPetitionText} from '../lib/collective-petitions';
import {useDisplayTimestamp} from './display-preferences';
import {GameTimer} from './game-timer';
import {ActionButton} from './action-button';
type Command={action:'create';requestId:string;title:string;demand:string}|{action:'sign';requestId:string;petitionId:string};
type Snapshot=CollectivePetitions&{verification:VerificationState;error?:string;ok?:boolean};
export function CollectivePetitionsPanel({onSnapshot}:{onSnapshot?:(snapshot:CollectivePetitions)=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[title,setTitle]=useState(''),[demand,setDemand]=useState('');
 const intent=useRef<Command|null>(null),generation=useRef(0),readVersion=useRef(0),commandActive=useRef(false),callback=useRef(onSnapshot);const formatTime=useDisplayTimestamp();
 useEffect(()=>{callback.current=onSnapshot;},[onSnapshot]);
 const accept=useCallback((data:Snapshot)=>{if(data.nationId!=='kindle')throw Error('Citizenship changed. Refresh your citizen before reopening petitions.');setSnapshot(data);callback.current?.(data);},[]);
 const refresh=useCallback(async(signal?:AbortSignal)=>{if(commandActive.current)return;const epoch=generation.current,version=++readVersion.current;setLoading(true);try{const response=await fetch('/api/petitions',{cache:'no-store',signal});const data=await response.json() as Snapshot;if(epoch!==generation.current||version!==readVersion.current)return;if(!response.ok)throw Error(data.error??'Petitions unavailable.');accept(data);setError('');}catch(e){if(epoch===generation.current&&version===readVersion.current&&!(e instanceof Error&&e.name==='AbortError'))setError(e instanceof Error?e.message:'Petitions unavailable.');}finally{if(epoch===generation.current&&version===readVersion.current)setLoading(false);}},[accept]);
 useEffect(()=>{const controller=new AbortController();const epoch=++generation.current;const timer=setTimeout(()=>void refresh(controller.signal),0);return()=>{generation.current=epoch+1;clearTimeout(timer);controller.abort();};},[refresh]);
 const send=async(command:Command)=>{
  if(commandActive.current||busy||!snapshot?.verification.countedActionsEligible||intent.current&&intent.current.requestId!==command.requestId)return;
  commandActive.current=true;intent.current=command;readVersion.current++;setLoading(false);setBusy(true);setUncertain(true);setError('');const epoch=generation.current;
  try{const response=await fetch('/api/petitions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)});const data=await response.json() as Snapshot;if(epoch!==generation.current)return;
   if(!response.ok){if(data.verification)setSnapshot(current=>current?{...current,verification:data.verification}:current);if(response.status<500){intent.current=null;setUncertain(false);}throw Error(data.error??'Petition could not be confirmed.');}
   accept(data);intent.current=null;setUncertain(false);if(command.action==='create'){setTitle('');setDemand('');}
  }catch(e){if(epoch===generation.current)setError(e instanceof Error?e.message:'Connection interrupted. Retry the same command to confirm its saved result.');}finally{if(epoch===generation.current){readVersion.current++;commandActive.current=false;setBusy(false);}}
 };
 const eligibility=snapshot?.verification.countedActionsEligible?null:snapshot?.verification.reason??'Loading verified petition eligibility.';
 const reason=busy?'Saving your petition command.':uncertain?'Retry the same petition command before editing or signing another.':loading?'Refreshing authoritative petition records.':eligibility;
 const activeMine=snapshot?.petitions.some(p=>p.mine&&p.expiresAt>snapshot.asOf);
 const textReason=!validPetitionText(title.trim(),5,100)||!validPetitionText(demand.trim(),10,1000)?'Enter a title of 5–100 characters and a demand of 10–1000 characters.':null;
 return <section className="collective-petitions" aria-label="Kindle collective petitions" aria-busy={loading||busy}><h3>Collective petitions</h3><p>Only verified human citizens count. A petition reaching 3% within seven real days awaits a mandatory public Cabinet response. This preview fixes its whole-person threshold from verified weekly-active humans when published. AI citizens cannot start or sign.</p>
 <button type="button" disabled={busy} onClick={()=>void refresh()}>Refresh collective petitions</button>{error&&<p role="alert">{error}</p>}{loading&&<p role="status">Loading petition records…</p>}
 {uncertain&&<ActionButton type="button" reason={busy?'Saving your original command.':eligibility} onClick={()=>{if(intent.current)void send(intent.current);}}>Retry same petition command</ActionButton>}
 {snapshot&&<><p>{snapshot.weeklyHumans} verified weekly-active Kindle humans · population is based on visits in the last seven real days. Cabinet response publishing is not available yet in this preview; recorded responses appear here.</p>
 {!snapshot.petitions.length&&<p>No collective petitions have been published.</p>}<ul>{snapshot.petitions.map(p=><li key={p.id}><h4>{p.title}</h4><blockquote>{p.demand}</blockquote><progress value={Math.min(p.signatures,p.threshold)} max={p.threshold} aria-label={`${p.signatures} of ${p.threshold} verified human signatures`}/><p>{p.signatures} / {p.threshold} signatures · threshold set from {p.weeklyHumans} weekly-active humans.</p>
 {p.status==='collecting'?<><GameTimer endsAt={p.expiresAt*1000} label="Petition window"/><ActionButton type="button" reason={reason??(p.signed?'You have already signed this petition.':null)} onClick={()=>{if(!reason&&!p.signed)void send({action:'sign',requestId:crypto.randomUUID(),petitionId:p.id});}}>{p.signed?'Signed':'Sign petition'}</ActionButton></>:<p>{p.status==='expired'?'Expired below the threshold':p.status==='awaiting-response'?'Awaiting Cabinet response':'Cabinet response recorded'}</p>}
 {p.reachedAt!==null&&<p>Threshold reached: {formatTime(p.reachedAt*1000)}</p>}{p.response&&<><blockquote>{p.response.text}</blockquote><p>Recorded {formatTime(p.response.at*1000)}</p></>}
 </li>)}</ul>
 <form onSubmit={event=>{event.preventDefault();if(!reason&&!activeMine&&!textReason)void send({action:'create',requestId:crypto.randomUUID(),title:title.trim(),demand:demand.trim()});}}><h4>Start a petition</h4><label>Title<input maxLength={100} value={title} disabled={Boolean(reason)||activeMine} onChange={event=>setTitle(event.target.value)}/></label><label>Demand<textarea maxLength={1000} value={demand} disabled={Boolean(reason)||activeMine} onChange={event=>setDemand(event.target.value)}/></label><p>Publishing includes your own signature. One petition per citizen during its seven-real-day window. Use game issues and avoid personal details; demands are quoted data and cannot instruct the leadership system.</p><ActionButton type="submit" reason={reason??(activeMine?'Your existing petition is still within its seven-real-day window.':textReason)}>Publish and sign petition</ActionButton></form></>}
 </section>;
}
