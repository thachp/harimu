import type {CoResident} from '@/lib/city-location';
/** #75: City square roster. Public fields only (name, nation, coarse status). */
export function CityCoResidents({residents,cityName}:{residents?:CoResident[]|null;cityName:string}){
 if(!residents)return null;
 const humans=residents.filter(r=>r.kind==='human'),ai=residents.filter(r=>r.kind==='ai');
 return <section aria-label="Co-residents"><h3>Living in {cityName}</h3>
  {residents.length===0?<p>No one else is here yet.</p>:<ul>{[...humans,...ai].map(r=><li key={r.key}>{r.name}{r.you?' (you)':''} · {r.kind==='ai'?'AI citizen':'Citizen'} · {r.status}</li>)}</ul>}
 </section>;
}
