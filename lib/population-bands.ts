/** Visible population bands (#81, docs §19.2 "Visible population" and "Pioneer incentives").
 * Players see a band, never exact counts. Bands compare a nation's citizen enrollments with the shard average
 * (all nations, zeros included). Thresholds are [ASSUMPTION – tune in alpha] per the spec, so they are configurable. */
export type PopulationBand='thriving'|'growing'|'needs-citizens'|'coming-soon';
export type PopulationBandThresholds={needsBelow:number;thrivingFrom:number};
/** Below 80% of the shard average = Needs citizens (spec). From 130% (the spec's soft-cap point) = Thriving. */
export const populationBandThresholds:PopulationBandThresholds={needsBelow:0.8,thrivingFrom:1.3};

export const populationBandLabel:Record<PopulationBand,string>={thriving:'Thriving','growing':'Growing','needs-citizens':'Needs citizens','coming-soon':'Coming soon'};
/** Pioneer incentives from the spec. Not active in this preview, so the copy says "planned". */
export const pioneerNote='Pioneer nation: planned starting bonuses for new citizens here are better starting housing, a Pioneer title and faster early rank gain. They are cosmetic and convenience only, with no long-term power, and are not active in this preview yet.';

export function populationBand(count:number,average:number,t:PopulationBandThresholds=populationBandThresholds):PopulationBand{
 if(!(average>0))return 'growing';
 const ratio=Math.max(0,Number.isFinite(count)?count:0)/average;
 if(ratio<t.needsBelow)return 'needs-citizens';
 if(ratio>=t.thrivingFrom)return 'thriving';
 return 'growing';
}

/** Bands for every nation id. Counts for unknown ids are ignored; missing ids count as zero.
 * Nations that are not playable yet are 'coming-soon' (never 'needs-citizens', so no Pioneer nudge)
 * and are left out of the average so they don't drag playable nations up a band. */
export function populationBands(nationIds:readonly string[],counts:Readonly<Record<string,number>>,t:PopulationBandThresholds=populationBandThresholds,playable:(id:string)=>boolean=()=>true):Record<string,PopulationBand>{
 if(!nationIds.length)return {};
 const value=(id:string)=>{const n=counts[id];return Number.isFinite(n)&&n>0?n:0;};
 const open=nationIds.filter(playable);
 const average=open.length?open.reduce((sum,id)=>sum+value(id),0)/open.length:0;
 return Object.fromEntries(nationIds.map(id=>[id,playable(id)?populationBand(value(id),average,t):'coming-soon']));
}
