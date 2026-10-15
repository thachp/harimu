export type DisplayPreferences = {graphics:'standard'|'low';timeFormat:'24'|'12';motion?:'system'|'reduce';textScale?:TextScale};
/** Text size (#80): applied as the root --text-scale CSS variable. */
export const textScales=[100,125,150] as const;
export type TextScale=typeof textScales[number];
export const defaultDisplayPreferences:DisplayPreferences={graphics:'standard',timeFormat:'24',motion:'system',textScale:100};
export function displayPreferences(value:unknown):DisplayPreferences{
 const source=value&&typeof value==='object'?value as Record<string,unknown>:{};
 return {graphics:source.graphics==='low'?'low':'standard',timeFormat:source.timeFormat==='12'?'12':'24',motion:source.motion==='reduce'?'reduce':'system',textScale:textScales.includes(source.textScale as TextScale)?source.textScale as TextScale:100};
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

/** #346: Clerk derives its whole type scale from one base size (14px at 100% text), so scaling that one value scales its menus and
 *  forms in step with the Text size setting. Never use calc()/var() here: Clerk does its own math with the value. */
export const clerkBaseFontPx=14;
export function clerkFontSize(scale:number|undefined):string{
 const percent=textScales.includes(scale as TextScale)?scale as number:100;
 return `${Math.round(clerkBaseFontPx*percent)/100}px`;
}
