/** First-week tutorial script for the Confluence, a Wave 2 Early Access nation (issue #361). Content only: no tutorial runner reads
 * this yet, and nothing in app/ or components/ imports it. Same day shape as lib/first-week-scripts.ts (#227/#228/#230) and
 * lib/varkand-national-service.ts (#112), so one runner can play any nation; it is a separate module because the MVP script table is
 * typed for the three MVP nations. Canon (harimu-docs): world/nations/the-confluence (Meetwater, cooperatives, the banded-price market,
 * the Current, Guidance Plans, the Four Pillars, the People's Assembly, the Bureau of Faith Affairs), citizens-daily-loops §11.2
 * shared core loop, §11.4 Confluence daily loop, §11.5 cooperatives, §11.6 Confluence ladder, onboarding §19.1 (three guided days, then
 * optional tips), culture bible voice ("Many streams, one current"). Humans are citizens, not officeholders: every office is AI.
 * No figures are written (the docs' band, term and registration numbers are [ASSUMPTION]/[PROPOSAL]). The voice is quiet, collective and
 * pragmatic, not a rename of Korund or Kindle. No real-world places or parties, no "Notable", no personal names. All lines are
 * new wording, so `proposal: true`. Lines are authored system copy, so they carry no AI-text flag. */

import type { TutorialDay } from './first-week-scripts';

export type ConfluenceFirstWeek={nationId:'confluence';voice:string;days:readonly TutorialDay[]};

const GUIDED=3;
const d=(day:TutorialDay['day'],title:string,objective:string,briefing:readonly string[],completion:string,fallback?:string):TutorialDay=>({day,kind:day<=GUIDED?'guided':'optional-tip',title,objective,briefing,completion,...(fallback?{fallback}:{}),proposal:true});

/** Canon names this script may use. Tests check every capitalized place or institution term against this list. */
export const CONFLUENCE_CANON_TERMS=['Confluence','Meetwater','Congress Hall','Current','Party of the Confluence','Party','Four Pillars','People\'s Assembly',
 'Guidance Plan','Guidance Plans','Party Congress','Congress Lanterns','Quota Day','Canal Festival','State Bank','Bureau of Faith Affairs','Work Capacity',
 'Worker','Member','Model Member','Honored Delegate','Lanu Terraces','Oalin Harbor','Ruel Works','Meesa Ford'] as const;

export const confluenceFirstWeek:ConfluenceFirstWeek={nationId:'confluence',
 voice:'Quiet, collective and practical: "Many streams, one current." The group is named before the self, and disagreement is indirect.',
 days:[
  d(1,'Registered at Meetwater','Enter your household in the register and meet your cooperative.',
   ['Welcome to the Confluence. Your household is entered in the register at Meetwater, under the blue roof of Congress Hall.',
    'The Party of the Confluence is the only legal party. The Four Pillars lead together, and every one of them is AI.',
    'Nothing is due today. Your cooperative keeps your place, and missing a day costs you nothing.'],
   'Registered. Your household has joined the register.'),
  d(2,'Cooperative Meeting','Sit in on your cooperative\'s meeting and start a work shift.',
   ['Most farms, workshops and housing here are cooperatives. Members own shares and share the profit.',
    'Members vote on how much profit is shared and how much is reinvested. The managers are AI.',
    'A shift costs Work Capacity. It refills once a day while you are away.'],
   'Meeting attended, shift started. You have a share and a say.'),
  d(3,'The Price Board','Read the price of one staple on a banded-price market board.',
   ['Staples are priced inside bands set by the state. Prices move, but only within the band.',
    'The currency is the Current. It floats inside a band around a central value that the State Bank sets each quarter.',
    'Shop at the floating market or a household stall, and compare.'],
   'Price read. You know what the band holds steady.',
   'No stall open today? Read the banded price board in the market instead.'),
  d(4,'Many Voices, One Paper','Read the official paper, then a licensed local paper.',
   ['There is one official newspaper and a set of licensed local papers. Speech about daily life is free.',
    'Speech about the Party\'s leadership is restricted, and open criticism of it has consequences.',
    'Speak of the group before yourself, and disagree in a way that leaves the other person room.'],
   'Both papers read. You know where plain speech ends.'),
  d(5,'The Guidance Plan','Read this term\'s Guidance Plan and your cooperative\'s target.',
   ['Five-year Guidance Plans set targets, not quotas. Your cooperative shows its output on Quota Day.',
    'Party factions contest every Congress. The one that rises is the one that your work and loyalty reward.',
    'Waste of water or shared food is a taboo here. Keep to the common bowl.'],
   'Plan read. You can see where your output goes.'),
  d(6,'Who Governs the Current','Look at the People\'s Assembly and the candidates the Party approved.',
   ['Citizens elect the People\'s Assembly from candidates the Party approved. The candidates are AI.',
    'The leadership does not have to heed that ballot. Your weight here comes from work, service and Party standing.',
    'Every Party Congress floats a lantern for each delegate on the canals.'],
   'Assembly read. You know what a ballot can and cannot do here.'),
  d(7,'From Worker to Delegate','Look over your week and your place on the ladder.',
   ['Your ladder runs Worker, Member, Model Member, then Honored Delegate, who has no vote. Every office above it is AI.',
    'Faiths are free to practice, but congregations, clergy and missions register with the Bureau of Faith Affairs.',
    'Missed a step this week? Come back when you like. The Current keeps flowing.'],
   'First week done. Your stream has joined the Current.'),
 ]};
