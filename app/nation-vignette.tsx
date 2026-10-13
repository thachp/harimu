'use client';
import {useState} from 'react';
import {nationVignette,vignetteOutcome} from '@/lib/nation-vignettes';
import styles from './nation-vignette.module.css';
export function NationVignette({nationId}:{nationId:string}){
 const example=nationVignette(nationId);
 const [selection,setSelection]=useState<{nationId:string;choice:number}|null>(null);
 const choice=selection?.nationId===example.id?selection.choice:null;
 return <section className={styles.vignette} aria-label={`${example.nation} illustrative sample`}>
  <small>Illustrative sample · no real votes, resources, receipts or world changes</small>
  <h3>{example.nation}: {example.title}</h3>
  <p>{example.prompt}</p>
  <p>Learn a national rule here. These examples do not promise that its political or economic systems are playable in the current preview.</p>
  {choice===null?<div className={styles.choices}>{example.choices.map((option,index)=><button key={option.label} type="button" onClick={()=>setSelection({nationId:example.id,choice:index})}>{option.label}</button>)}</div>:<>
   <p role="status">{vignetteOutcome(example.id,choice)}</p>
   <button type="button" onClick={()=>setSelection(null)}>Back to sample choices</button>
  </>}
  <button type="button" onClick={()=>setSelection(null)}>Reset national sample</button>
  <small>Choices are discarded when this panel closes. <a href={example.source} target="_blank" rel="noreferrer">Read the official nation rules</a></small>
 </section>;
}
