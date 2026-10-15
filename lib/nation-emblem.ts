/** #78: the small nation emblem shown in the top bar. Nations with a presentation theme use its symbol and accent
 *  (see #79 for the other seven); any other nation falls back to the initial of its name, so the emblem never renders blank. */
export type NationEmblemSpec={symbol:string;accent:string|null;label:string;fallback:boolean};
/** `theme` is `nationTheme(id)` from lib/nation-themes (passed in so this file stays dependency-free). */
export function nationEmblem(theme:{symbol:string;accent:string}|null,nationName:string):NationEmblemSpec{
 const label=`${nationName} emblem`;
 if(theme)return{symbol:theme.symbol,accent:theme.accent,label,fallback:false};
 return{symbol:(nationName.trim().charAt(0)||'?').toUpperCase(),accent:null,label,fallback:true};
}
/** Build-time switch (wrangler.jsonc var NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM), off by default. #392 S2: the UI v2 top bar flag turns the same emblem, "Visiting" label and live-count bell on
 *  (one code path, not a copy), so `NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR=true` implies it; the emblem flag still works alone. */
export function topBarEmblemEnabled(value:string|undefined=process.env.NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM,v2:string|undefined=process.env.NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR):boolean{return value==='true'||v2==='true';}
/** Build-time flag NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR (UI v2, stage S2): the restyled top bar ships off until QA turns it on. Only the exact string "true" enables it. */
export function uiV2TopbarEnabled(value:string|undefined=process.env.NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR):boolean{return value==='true';}
/** The line under HARIMU: visitors are told they are visiting; the other states keep their existing wording. */
export function identityStatus(state:{guestDemo:boolean;localDemo:boolean;hasCitizenNation:boolean},emblemOn:boolean):string{
 if(state.guestDemo)return 'Guest example';
 if(state.localDemo)return 'Local demo';
 if(state.hasCitizenNation)return 'Your citizen';
 return emblemOn?'Visiting':'Nation preview';
}
