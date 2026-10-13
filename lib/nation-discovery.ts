/** Discovery groupings from official GDD 19.1; filters never select a nation. */
export const nationFamilies = [
  {id:'all',label:'All nations',members:[]},
  {id:'democracies',label:'Democracies',members:['kindle','hoarvale','veldwood']},
  {id:'party',label:'Party states',members:['confluence','meridian','korund']},
  {id:'crown',label:'Crown & Canon',members:['aurelle','ilmar']},
  {id:'power',label:'Power blocs',members:['varkand','fulmara']},
] as const;
export type NationFamily = typeof nationFamilies[number]['id'];
export type NationLens = 'power' | 'money' | 'faith';
export type DiscoveryNation = {id:string;name:string;government?:string;economy?:string;currency?:string;religion?:string};
const lensGroups = [['kindle','hoarvale','veldwood','fulmara'],['confluence','meridian','varkand'],['aurelle','ilmar'],['korund']];
const labels = {money:['Free floating','Managed or pegged','Gold or faith rules','No market money'],faith:['Free faith','Registered or supervised','State faith','No faith allowed']};
export function nationLensLabel(id:string,lens:NationLens){if(lens==='power')return '';const index=lensGroups.findIndex(group=>group.includes(id));return index<0?'':labels[lens][index];}
export function discoverNations<T extends {id:string}>(nations:readonly T[],family:NationFamily,lens:NationLens):T[]{
  const members:readonly string[]=nationFamilies.find(group=>group.id===family)?.members ?? [];
  const filtered=nations.filter(nation=>!members.length||members.includes(nation.id));
  if(lens==='power')return filtered;
  const rank=(id:string)=>{const index=lensGroups.flat().indexOf(id);return index<0?Number.MAX_SAFE_INTEGER:index;};
  return filtered.toSorted((a,b)=>rank(a.id)-rank(b.id));
}
export function nationIsPreview(id:string){return !['kindle','korund','aurelle'].includes(id);}
