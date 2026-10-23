'use client';
// #743 slice 1: the out-of-character Report control for a city chat message or a Notable reply. All text comes from lib/report-copy.ts.
import {useEffect,useRef,useState} from 'react';
import {reasonsFor,reportActions,reportHeader,reportNote,reportStates,reportTargetFor} from '../lib/report-copy';

export type ReportKind='citizen-message'|'notable-reply';
type Status='idle'|'sending'|'sent'|'duplicate'|'failed';

export function ReportButton({kind,targetId}:{kind:ReportKind;targetId:string}){
 const target=reportTargetFor(kind)!;const reasons=reasonsFor(kind);
 const [open,setOpen]=useState(false),[reason,setReason]=useState(''),[note,setNote]=useState(''),[status,setStatus]=useState<Status>('idle');
 // One request id per dialog, reused on retry so a lost response cannot file the report twice.
 const requestId=useRef<string|null>(null),first=useRef<HTMLInputElement|null>(null);
 useEffect(()=>{if(open)first.current?.focus();},[open]);
 const titleId=`report-${kind}-${targetId}-title`;
 if(status==='sent'||status==='duplicate')return <p role="status" className="report-state">{(status==='sent'?reportStates.sent:reportStates.duplicate).text}</p>;
 async function submit(){
  if(!reason)return;requestId.current??=crypto.randomUUID();setStatus('sending');
  try{const response=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:requestId.current,targetKind:kind,targetId,reasonId:reason,...(note.trim()?{note:note.trim()}:{})})});
   const data=await response.json().catch(()=>({}));
   setStatus(response.status===201?'sent':response.status===409&&data?.duplicate===true?'duplicate':'failed');}
  catch{setStatus('failed');}
 }
 if(!open)return <button type="button" className="report-entry" aria-label={target.accessibleName} onClick={()=>setOpen(true)}>{target.entryLabel}</button>;
 return <div role="dialog" aria-modal="false" aria-labelledby={titleId} className="report-dialog" onKeyDown={event=>{if(event.key==='Escape'){setOpen(false);setStatus('idle');}}}>
  <h3 id={titleId}>{reportHeader.title}</h3><p>{reportHeader.line.text}</p>
  <fieldset><legend>Reason</legend>{reasons.map((r,i)=><label key={r.id}><input ref={i===0?first:undefined} type="radio" name={titleId} value={r.id} checked={reason===r.id} onChange={()=>setReason(r.id)}/> {r.label}</label>)}</fieldset>
  <label>{reportNote.label}<textarea maxLength={280} placeholder={reportNote.placeholder.text} value={note} onChange={event=>setNote(event.target.value)}/></label>
  {status==='failed'&&<p role="alert">{reportStates.failed.text}</p>}
  <button type="button" disabled={!reason||status==='sending'} onClick={()=>void submit()}>{status==='failed'?reportActions.retry:reportActions.submit}</button>
  <button type="button" onClick={()=>{setOpen(false);setStatus('idle');}}>{reportActions.cancel}</button>
 </div>;
}
