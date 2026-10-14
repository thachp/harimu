export type DisplayPreferences = {graphics:'standard'|'low';timeFormat:'24'|'12';motion?:'system'|'reduce'};
export const defaultDisplayPreferences:DisplayPreferences={graphics:'standard',timeFormat:'24',motion:'system'};
export function displayPreferences(value:unknown):DisplayPreferences{
 const source=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return {graphics:source.graphics==='low'?'low':'standard',timeFormat:source.timeFormat==='12'?'12':'24',motion:source.motion==='reduce'?'reduce':'system'};
}
export function graphicsOptions(graphics:DisplayPreferences['graphics'],deviceRatio:number){
 return {antialias:graphics!=='low',shadows:graphics!=='low',pixelRatio:graphics==='low'?1:Math.min(Number.isFinite(deviceRatio)&&deviceRatio>0?deviceRatio:1,2)};
}
export function displayTimestamp(value:string|number,timeFormat:DisplayPreferences['timeFormat']='24'){
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Time unavailable';
 return new Intl.DateTimeFormat('en-GB',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC',hourCycle:timeFormat==='12'?'h12':'h23'}).format(date)+' UTC';
}

/** Reduced motion applies when the player chose Reduce in Settings or the OS prefers reduced motion (#120). */
export function effectiveReducedMotion(motion:DisplayPreferences['motion'],osPrefersReduced:boolean):boolean{return motion==='reduce'||osPrefersReduced;}
