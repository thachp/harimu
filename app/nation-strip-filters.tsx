'use client';
import { type DiscoveryNation, nationIsPreview } from '@/lib/nation-discovery';
import styles from './nation-strip-filters.module.css';
/** The first-visit shortlist toggle (only when a shortlist exists). The nation filter and sort rows were removed: ten nations always show in default order. */
export function NationShortlistToggle({hiddenSelection,shortlistCount,shortlistActive,onShortlist}:{hiddenSelection?:string;shortlistCount:number;shortlistActive:boolean;onShortlist:()=>void}){
  if(shortlistCount<=0)return null;
  return <div className={`nation-shortlist ${styles.filters}`}><div className={styles.controls}><button type="button" aria-pressed={shortlistActive} onClick={onShortlist}>Shortlist · {shortlistCount}</button></div>{hiddenSelection&&<small role="status">{hiddenSelection} remains selected outside the shortlist. Turn the shortlist off to show every nation again.</small>}</div>;
}
export function NationComparison({nations}:{nations:readonly DiscoveryNation[]}){
  return <details className={styles.comparison}><summary>Compare all ten nations</summary><div><table><caption>Read-only comparison · government roles are AI/SI controlled</caption><thead><tr><th scope="col">Nation</th><th scope="col">Power</th><th scope="col">Money</th><th scope="col">Faith</th><th scope="col">Playable economy</th></tr></thead><tbody>{nations.map(nation=><tr key={nation.id}><th scope="row">{nation.name}</th><td>{nation.government}</td><td>{nation.currency}<br />{nation.economy}</td><td>{nation.religion}</td><td>{nationIsPreview(nation.id)?'Preview':'Available'}</td></tr>)}</tbody></table></div></details>;
}
