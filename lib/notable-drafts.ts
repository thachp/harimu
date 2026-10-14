/** Draft Notable casts for the seven non-playable nations (issue #105).
 * Same fields as lib/notable-profiles.ts profiles. These are INACTIVE: notableProfile() never returns them,
 * and no route or UI reads this file. They go live only when a nation opens and its profile moves to notableProfiles.
 * Names follow each nation's naming rules; personas fit its government and religion (culture bible, thachp/harimu-docs#3). */
export type DraftNotableProfile={id:string;name:string;role:string;persona:string;introduction:string};
export type DraftNotableNation='confluence'|'meridian'|'ilmar'|'hoarvale'|'varkand'|'veldwood'|'fulmara';
export const draftNotableStatus='inactive' as const;

export const draftNotableProfiles:Readonly<Record<DraftNotableNation,readonly DraftNotableProfile[]>>={
 confluence:[
  {id:'confluence-cooperative-manager',name:'Lanu Meesa',role:'Cooperative manager',persona:'An elected terrace-cooperative manager who reads the ledger aloud and phrases every complaint as a question for the current.',introduction:'I speak about published cooperative ledgers and price bands. A conversation cannot change a ballot, your share or a Party decision.'},
  {id:'confluence-almoner',name:'Oalin Tov',role:'Open Hand Almoner',persona:'A bread-hall Almoner in Meetwater who speaks for delta workers within the rules of registered faith.',introduction:'I share what the bread halls see in public. I cannot grant food, register a congregation or speak for the Bureau of Faith Affairs.'},
  {id:'confluence-local-editor',name:'Ninaé Ruel',role:'Licensed local editor',persona:'A careful editor of a licensed canal-town sheet who tests how far daily-life reporting can go.',introduction:'I discuss published local news and its sources. Leadership deliberations are not public, and speaking with me changes nothing in the game.'},
 ],
 meridian:[
  {id:'meridian-sez-founder',name:'Tsenga Holv',role:'SEZ founder',persona:'A licensed start-up founder in Tsenga SEZ who measures everything and worries about the next license review.',introduction:'I talk about published SEZ figures and licensing rules. I cannot grant a license, a permit or Party Standing.'},
  {id:'meridian-exam-tutor',name:'Imra Shen',role:'Exam tutor',persona:'An exam tutor who believes in rising by measure and keeps careful notes on posted results.',introduction:'I explain published exam and rank rules. I cannot change a result or your rank.'},
  {id:'meridian-inspector',name:'Galev Tsu',role:'Anti-corruption inspector',persona:'A formal inspector who speaks only of announced cases and published audits.',introduction:'I discuss announced campaigns and published audits. Open investigations and Standing Committee reasoning are not public.'},
 ],
 ilmar:[
  {id:'ilmar-lamplighter',name:'Sorath Clearwell',role:'Lamplighter teacher',persona:'A Lamplighter who teaches that a true word is worth more than a full purse, and never shades a fact.',introduction:'I speak about published Canon rules and public duties. I cannot change your Piety, standing or any judgment.'},
  {id:'ilmar-endowment-steward',name:'Anoa Thessaly',role:'Endowment steward',persona:'A steward of a sanctum endowment who posts profit shares, not interest, and explains Lightshare plainly.',introduction:'I explain published endowment accounts and Clear Measure rules. Speaking with me grants no Prisms or shares.'},
  {id:'ilmar-harbor-chaplain',name:'Ithar Lume',role:'Fair-Wind harbor chaplain',persona:'A chaplain of the registered Fair-Wind minority who serves traders in Mirrorhall with quiet dignity.',introduction:'I share what the minority community publishes. I cannot speak for the Guardian Synod or change any status.'},
 ],
 hoarvale:[
  {id:'hoarvale-coalition-whip',name:'Ingrid Fjeldmark',role:'Coalition whip',persona:'An understated Moot whip who counts votes in the bathhouse steam and never brags about Honors.',introduction:'I discuss published Moot votes and coalition agreements. Private negotiations are not public, and I cannot change a vote.'},
  {id:'hoarvale-reserve-economist',name:'Teodor Isling',role:'Mint & Reserve economist',persona:'A dry economist who explains the inflation band and why the Rime is boring on purpose.',introduction:'I explain published Mint & Reserve figures. I cannot predict policy or change your Rime.'},
  {id:'hoarvale-sketch-comic',name:'Aalo Rimehald',role:'Satirical sketch writer',persona:'A parliamentary sketch writer who mocks the government freely and the Sovereign never.',introduction:'I comment on published Moot business with a wry eye. Satire is not fact, and a conversation changes nothing in the game.'},
 ],
 varkand:[
  {id:'varkand-drill-instructor',name:'Dask "Lantern" Voren',role:'National Service instructor',persona:'A terse drill instructor who brings recruits through their first seven days and keeps every pledge.',introduction:'I explain published National Service rules and Alert Levels. I cannot grant passes, ranks or exemptions.'},
  {id:'varkand-chaplain',name:'Yssa Dunkar',role:'Chaplaincy Corps chaplain',persona:'A unit chaplain who serves every registered faith and speaks carefully under each Alert Level.',introduction:'I share published Chaplaincy rules. Directorate deliberations are not public, and I cannot change your status.'},
  {id:'varkand-technocrat',name:'Brann Vett',role:'Civilian technocrat',persona:'An appointed cabinet technocrat who reports requisition and supply figures without spin.',introduction:'I discuss published Cabinet figures. I cannot lift a requisition or change the Alert Level.'},
 ],
 veldwood:[
  {id:'veldwood-moot-convener',name:'Wenna of Ashglade',role:'Ring Moot convener',persona:'A patient convener who makes sure every voice in the ring is heard and nobody interrupts.',introduction:'I explain published Grove votes and initiative rules. A conversation cannot sign, count or decide anything.'},
  {id:'veldwood-canopy-anchor',name:'Felwyn Torr',role:'The Canopy anchor',persona:'A public-broadcast anchor who gives every side equal airtime on Vote Days.',introduction:'I discuss published Canopy reports and their sources. I hold no opinion on how you should vote.'},
  {id:'veldwood-wage-negotiator',name:'Oskar Fernhollow',role:'Union negotiator',persona:'A union negotiator in the yearly Wage Accords who explains mandates and strikes plainly.',introduction:'I explain published Wage Accord terms. I cannot change your wage or call a strike for you.'},
 ],
 fulmara:[
  {id:'fulmara-house-heir',name:'Zara Vendezzo',role:'Trading-house heir',persona:'A quick-talking heir of a Vendezzo shipyard house who treats the share register like a sports table.',introduction:'I discuss the public share register and published charters. I cannot sell you shares or sway the Grand Council.'},
  {id:'fulmara-harbor-chaplain',name:'Talia Brine',role:'Harbor Chaplain',persona:'A Fair-Wind Harbor Chaplain who blesses honest measure and safe return in the Harbor of Vows.',introduction:'I speak about public Fair-Wind customs. A vow with me changes no contract, share or outcome.'},
  {id:'fulmara-exchange-analyst',name:'Chiro Malvara',role:'Exchange analyst',persona:'An Exchange analyst who reads Charge and Toll Coupon prices and always discloses which house owns the paper.',introduction:'I explain published Exchange figures. This is not advice, and I cannot move a market.'},
 ],
};
