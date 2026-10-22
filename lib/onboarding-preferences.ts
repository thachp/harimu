import {liveNations} from './nation-discovery';
export type OnboardingPreferences = {power?: string; money?: string; faith?: string};
// GDD 19.1 power families and money/faith lenses. Equal scores favor playable
// prototype economies Kindle, Korund, Aurelle, then stable catalog order;
// no live population data or citizenship eligibility enters this optional suggestion.
const profiles = [
 {id:'kindle',name:'Kindle',power:'democracy',money:'markets',faith:'free'},
 {id:'hoarvale',name:'Hoarvale',power:'democracy',money:'markets',faith:'free'},
 {id:'veldwood',name:'Veldwood',power:'democracy',money:'markets',faith:'free'},
 {id:'confluence',name:'Confluence',power:'party',money:'managed',faith:'supervised'},
 {id:'meridian',name:'Meridian',power:'party',money:'managed',faith:'supervised'},
 {id:'korund',name:'Korund',power:'party',money:'ration',faith:'none'},
 {id:'aurelle',name:'Aurelle',power:'crown',money:'backed',faith:'state'},
 {id:'ilmar',name:'Ilmar',power:'crown',money:'backed',faith:'state'},
 {id:'varkand',name:'Varkand',power:'bloc',money:'managed',faith:'supervised'},
 {id:'fulmara',name:'Fulmara',power:'bloc',money:'markets',faith:'free'},
] as const;
function tieRank(id: string, index: number): number {
 const playable = (liveNations as readonly string[]).indexOf(id); // #488: the live nations, in list order
 return playable >= 0 ? playable : 3 + index;
}
export function suggestNations(preferences: OnboardingPreferences): string[] {
 return profiles.map((profile,index)=>({id:profile.id,index,score:
   (preferences.power===profile.power?1:0)+(preferences.money===profile.money?1:0)+(preferences.faith===profile.faith?1:0)}))
   .sort((a,b)=>b.score-a.score||tieRank(a.id,a.index)-tieRank(b.id,b.index)).slice(0,3).map(profile=>profile.id);
}
export function suggestedNationNames(ids: string[]): string {
 return ids.map(id=>profiles.find(profile=>profile.id===id)?.name).filter(Boolean).join(', ');
}
