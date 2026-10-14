/** Per-nation welcome and first-loop copy (issue #103). Text only: it never grants rewards or changes state.
 * Source: culture bible "Starter moment" and voice notes, thachp/harimu-docs#3 (content/world/culture-bible.mdx).
 * Kindle, Korund and Aurelle are playable; the other seven are drafts used once those nations open. */
export type StarterSteps = {begin:string;underway:string;collect:string;food:string;meal:string};
export type StarterCopy = {nationId:string;status:'live'|'draft';welcome:string;steps:StarterSteps};

const copy=(nationId:string,status:'live'|'draft',welcome:string,steps:StarterSteps):StarterCopy=>({nationId,status,welcome,steps});

export const starterCopy:readonly StarterCopy[]=[
 copy('kindle','live','Welcome to Forgehaven. The Republic doesn\'t owe you a living. It owes you a fair count. Strike your own spark: earn, trade, vote, and rise from Citizen to Emberwarden.',
  {begin:'Clock in for your first shift in Work. Your wage posts at the price you were promised',underway:'Shift underway. The foundry pays when the work is done, so return to Work when ready',collect:'Collect your Sparks in Work. A fair count, as promised',food:'Get food in Market. Check the posted price boards',meal:'Prepare a meal in Household. Fuel for the next deal'}),
 copy('korund','live','Welcome to Stonehearth, comrade. Your coupon book is your promise from the plan. Your quota is your promise back. One hammer, one heart.',
  {begin:'Report to your brigade in Work. Today\'s quota awaits',underway:'Your brigade is at work. Return to Work when the shift is complete',collect:'Record your output and collect your Labor Notes in Work',food:'Redeem food coupons in Market. The plan provides',meal:'Prepare a meal in Household. Strength for tomorrow\'s quota'}),
 copy('aurelle','live','Welcome to Highspire. You have sworn your oath to the Crown. Find your thread, and keep it in its place.',
  {begin:'Enter royal estate service in Work, by leave of the Crown',underway:'Your service is underway. Return to Work when the bell is rung',collect:'Receive your Crowns for service in Work',food:'Purchase provisions at the chartered market in Market',meal:'Prepare a meal in Household. Keep your hearth as your house keeps its name'}),
 copy('confluence','draft','Welcome to Meetwater. Your household registration bears the lantern stamp. You join a stream that was flowing before you.',
  {begin:'Join your cooperative\'s first shift in Work',underway:'The cooperative is at work. Return to Work when the shift is done',collect:'Collect your share in Work. The ledger is read for all',food:'Get food in Market. Staples sell within the price band',meal:'Prepare a meal in Household. Share the common bowl'}),
 copy('meridian','draft','Welcome to Steamgate. Choose your gauge: the champion\'s ladder or the zone\'s gamble. Rise by measure.',
  {begin:'Begin your first shift in Work. Every measure counts toward your rank',underway:'Shift underway. Return to Work on time',collect:'Collect your Gauge in Work',food:'Get food in Market',meal:'Prepare a meal in Household. Rest well before the next measure'}),
 copy('ilmar','draft','Welcome to Mirrorhall. Here, a true word is worth more than a full purse. Be a clear vessel.',
  {begin:'Begin honest work in Work',underway:'Your work is underway. Return to Work when it is complete',collect:'Receive your Prisms in Work, fairly measured',food:'Get food in Market at fair-light prices',meal:'Prepare a meal in Household. Remember: Stillday meals are made the day before'}),
 copy('hoarvale','draft','Welcome to Rimehall. Take a number, take your time. Everyone gets their turn at the hearth.',
  {begin:'Begin your first shift at a Trading House in Work',underway:'Shift underway. Return to Work in good time',collect:'Collect your Rime in Work',food:'Get food in Market. Kindly queue',meal:'Prepare a meal in Household. Keep the hearth, share the warmth'}),
 copy('varkand','draft','Recruit, your first watch begins. Seven days, and the fog will know your name. Hold the line.',
  {begin:'Report for your first National Service duty in Work',underway:'Duty underway. Report back to Work when relieved',collect:'Draw your pay in Work',food:'Draw provisions in Market',meal:'Prepare a meal in Household. Eat; the next watch is coming'}),
 copy('veldwood','draft','Welcome to Ringhall. Your voice joins the ring in seven days. Until then, listen well.',
  {begin:'Begin your first shift in Work',underway:'Shift underway. Return to Work when it\'s done',collect:'Collect your Boughs in Work',food:'Get food in Market',meal:'Prepare a meal in Household. Every voice in the ring needs feeding'}),
 copy('fulmara','draft','Welcome to Arcport. Everything here has a price, including your first share. Earn it. Ride the storm, own the wind.',
  {begin:'Sign on for your first shift in Work',underway:'Shift underway. Return to Work when the bell rings',collect:'Collect your Charge in Work. A contract honored',food:'Get food in Market. Haggle hard but fairly',meal:'Prepare a meal in Household. Fair winds for tomorrow'}),
];

export function starterCopyFor(nationId:string):StarterCopy|null{return starterCopy.find(entry=>entry.nationId===nationId)??null;}
