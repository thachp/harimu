import {notableProfile,pickNotable} from './notable-profiles';
import {additionalNotableProfiles} from './notable-roster';
export type NationNotable={id:string;name:string;role:string;persona:string;introduction:string};
/** #151: a nation's Notables, primary first, then its content roster (lib/notable-roster.ts). */
export function nationNotables(nation:string|null):readonly NationNotable[]{const primary=notableProfile(nation);return primary?[primary,...(additionalNotableProfiles[nation as keyof typeof additionalNotableProfiles]??[])]:[];}
/** #151: the Notable this citizen meets today. */
export function notableFor(nation:string|null,userId:string,nowSeconds:number):NationNotable|null{return pickNotable(nationNotables(nation),userId,nowSeconds);}
