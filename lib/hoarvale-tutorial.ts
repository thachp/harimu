/** First-week tutorial script for Hoarvale, a Wave 2 Early Access nation (issue #361). Content only: no tutorial runner reads this
 * yet, and nothing in app/ or components/ imports it. Same day shape as lib/first-week-scripts.ts (#227/#228/#230) and
 * lib/varkand-national-service.ts (#112), so one runner can play any nation; it is a separate module because the MVP script table is
 * typed for the three MVP nations. Canon (harimu-docs): world/nations/hoarvale (Rimehall, the Moot, the Sovereign and the Crown chapel,
 * Trading Houses, tenure contracts, Rime, the Kinward Rite as the Crown's Rite, Crown Etiquette), citizens-daily-loops §11.2 shared
 * core loop, §11.4 Hoarvale daily loop, §11.5 Coalition Agreements and tenure contracts, §11.6 Hoarvale ladder, onboarding §19.1 (three
 * guided days, then optional tips), culture bible voice ("Keep the hearth, share the warmth"). Humans are citizens, not officeholders:
 * the Sovereign, the Moot, the Cabinet and the Trading House boards are AI. No figures are written (the docs' terms and bands are
 * [ASSUMPTION]). The voice is dry, patient and understated, not a rename of Aurelle: the Crown is ceremonial and criticizing the
 * government is free. No real-world places or parties, no "Notable", no personal names. All lines are new wording, so `proposal: true`.
 * Lines are authored system copy, so they carry no AI-text flag. */

import type { TutorialDay } from './first-week-scripts';

export type HoarvaleFirstWeek={nationId:'hoarvale';voice:string;days:readonly TutorialDay[]};

const GUIDED=3;
const d=(day:TutorialDay['day'],title:string,objective:string,briefing:readonly string[],completion:string,fallback?:string):TutorialDay=>({day,kind:day<=GUIDED?'guided':'optional-tip',title,objective,briefing,completion,...(fallback?{fallback}:{}),proposal:true});

/** Canon names this script may use. Tests check every capitalized place or institution term against this list. */
export const HOARVALE_CANON_TERMS=['Hoarvale','Rimehall','Moot','Moot Hall','Sovereign','Prime Minister','Crown','Crown chapel','Trading House','Trading Houses',
 'Coalition Agreement','Question Time','Honors','Kinward Rite','Work Capacity','Rime','Junior','Associate','Senior','Honors List Day','Mint and Reserve'] as const;

export const hoarvaleFirstWeek:HoarvaleFirstWeek={nationId:'hoarvale',
 voice:'Dry, patient and understated: "Keep the hearth, share the warmth." Wait your turn, say it plainly, and do not brag.',
 days:[
  d(1,'Welcome to Rimehall','Enter the register and find the Moot Hall.',
   ['Welcome to Hoarvale. Your name goes in the register at Rimehall, under the aurora and the vaulted roof of the Moot Hall.',
    'The Sovereign is an AI, and so are the Moot, the Prime Minister and the boards of the Trading Houses.',
    'No one is hurrying you here, and missing a day costs you nothing. Wait your turn.'],
   'Registered. You are on the roll at Rimehall.'),
  d(2,'A Shift in a Trading House','Start a work shift in a Trading House.',
   ['Trading Houses are large firms run by AI boards. Humans work in them, hold shares and found smaller firms.',
    'A shift costs Work Capacity. It refills once a day while you are away.',
    'Breakfast at the bathhouse counts as a good start. Take your time.'],
   'Shift started. The House has you on its books.'),
  d(3,'Tenure and Seniority','Read your tenure contract and your seniority step.',
   ['Tenure contracts give seniority pay steps and job security. Dismissal needs cause and goes before an AI tribunal.',
    'Switching Houses resets your seniority. Think it over before you move.',
    'Prices are in Rime, which is held steady by an independent Mint and Reserve.'],
   'Contract read. You know what staying is worth.',
   'No contract to read yet? Look over the sample tenure terms posted at the House.'),
  d(4,'Reading the Papers','Read two papers, then post in the national chat.',
   ['Hoarvale has a free press and free speech. Criticizing the government is completely free.',
    'Insulting the Sovereign in the national chat is a fine-level offense. Keep it civil.',
    'Dry wit is welcome. Bragging about Honors is not.'],
   'Papers read, post made. You know where the line is.'),
  d(5,'The Moot and the Coalition','Look at the Moot and the current Coalition Agreement.',
   ['The Moot is elected by regional party lists. The Prime Minister is whoever wins an investiture vote.',
    'Governments are usually coalitions bound by a Coalition Agreement. You may join an AI party and vote.',
    'Coalitions water down promises. That is the price of stability.'],
   'Moot read. You know who governs, and how they agreed to.'),
  d(6,'Question Time','Put one question to the government at Question Time.',
   ['Question Time is where citizens put questions to the government. Keep yours short and fair.',
    'Waiting your turn is part of it. Good questions get noticed.'],
   'Question submitted. Now, as everyone does, wait your turn.'),
  d(7,'Keep the Hearth','Look over your week and your place on the ladder.',
   ['Your career runs Junior, Associate, then Senior. Honors are cosmetic, and most come from the Prime Minister\'s list.',
    'The Kinward Rite is the Crown\'s Rite and blesses the opening of the Moot. Every faith is free, and no office needs membership.',
    'Seniority beats speed here. Missed a step? Come back when you like.'],
   'First week done. The hearth is kept.'),
 ]};
