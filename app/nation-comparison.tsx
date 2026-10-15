'use client';
import { type DiscoveryNation, nationIsPreview } from '@/lib/nation-discovery';
import { NationSymbol } from './nation-symbol';
import styles from './nation-comparison.module.css';
export function NationComparison({nations}:{nations:readonly DiscoveryNation[]}){
  return <details className={styles.comparison}><summary>Compare all ten nations</summary><div><table><caption>Read-only comparison · government roles are AI/SI controlled</caption><thead><tr><th scope="col">Nation</th><th scope="col">Power</th><th scope="col">Money</th><th scope="col">Faith</th><th scope="col">Playable economy</th></tr></thead><tbody>{nations.map(nation=><tr key={nation.id}><th scope="row"><NationSymbol id={nation.id} />{nation.name}</th><td>{nation.government}</td><td>{nation.currency}<br />{nation.economy}</td><td>{nation.religion}</td><td>{nationIsPreview(nation.id)?'Preview':'Available'}</td></tr>)}</tbody></table></div></details>;
}
