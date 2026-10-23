/** Static press template packs for the Wave 2 Early Access nations (issue #372: Confluence and Hoarvale; companion to #361 and in the
 * shape of #237/#238/#239 in lib/press-templates.ts). Content only: no press or reader UI reads this yet, and nothing in app/ or
 * components/ imports it. Fixed sample stories: a headline plus one or two short paragraphs, with no figures, so no number can
 * ever be invented (harimu-docs social-news-media §18.2: system stats stay truthful). Canon: the nation pages (The Confluence:
 * one official newspaper plus licensed local outlets, Freedoms row; Hoarvale: free press, Freedoms row) and culture bible §2 and §7
 * (News voice). All prose is new wording, so `proposal: true`. Authored copy, not AI output, so no AI-text flag. No people named, no
 * "Notable", no real-world references.
 * FILLER ONLY (as in #237-#239): a pack is shown only when no player paper has published in that nation. Bylines: the MVP bylines
 * (Kindle Press, Korund State Media, Court Gazette) are unchanged and not used here. The culture bible's working names are
 * new proposals, so both bylines are `proposal: true`: The Current Daily (Confluence, calm, collective and target-focused) and The
 * Rimehall Ledger (Hoarvale, sober, wry and polite). Confluence copy never mocks the Four Pillars (§2 Voice) and Hoarvale copy never
 * insults the Sovereign (Crown Etiquette). The mid-term and satirical Hoarvale weekly is out of scope. */

import type { PressTemplate, WireByline } from './press-templates';

export type Wave2PressNation='confluence'|'hoarvale';
/** Confluence: the one official paper. Hoarvale: free press. */
export type Wave2PressOutlet='official-paper'|'free-press';
export type Wave2PressPack={nationId:Wave2PressNation;outlet:Wave2PressOutlet;voice:string;byline:WireByline;templates:readonly PressTemplate[]};

export const WAVE2_PRESS_HEADLINE_MAX=40;
export const WAVE2_PRESS_PARAGRAPH_MAX=140;
export const WAVE2_PRESS_TEMPLATES_MIN=8;
export const WAVE2_PRESS_TEMPLATES_MAX=12;

const t=(id:string,topic:string,headline:string,...body:string[]):PressTemplate=>({id,topic,headline,body,aiBadge:false,proposal:true});

/** The Confluence: one official paper, calm, collective and target-focused ("Guidance Plan on course"). Soft "we", water metaphors,
 * indirect criticism at most; the Four Pillars are never mocked or even named. Registered faiths are named only as registered. */
export const confluencePress:Wave2PressPack={nationId:'confluence',outlet:'official-paper',
 byline:{name:'The Current Daily',proposal:true},
 voice:'Calm, collective and practical: "Many streams, one current." We, not I; targets, not quotas; criticism only as a question for the current.',
 templates:[
  t('confluence-plan-on-course','guidance-plan','Guidance Plan on course',
   'The Guidance Plan is on course. It sets targets, not quotas, and each cooperative finds its own way to them.'),
  t('confluence-coop-meeting','cooperatives','Cooperatives meet at the common bowl',
   'Members read the profit shares aloud at the common bowl. Then they voted on how much to share and how much to reinvest.'),
  t('confluence-harvest','cooperatives','Harvest comes in on the terraces',
   'The terrace cooperatives report that the harvest is in. The shared bowls will be filled from it.'),
  t('confluence-price-board','markets','Price board holds steady',
   'Staples stayed inside their bands at the market boards. Prices may move, but only within the band.'),
  t('confluence-current','markets','The Current holds its band',
   'The Current kept within its band this week. The State Bank watches the band, and the markets keep to it.'),
  t('confluence-quota-day','festivals','Quota Day: cooperatives show output',
   'Cooperatives set out their output on Quota Day. Neighbors came to read the ledgers and stayed to share a meal.'),
  t('confluence-canal-festival','festivals','Canal Festival after the harvest',
   'Lanterns and long boats will fill the canals for the Canal Festival. The racing crews are already training.'),
  t('confluence-lanterns','festivals','Congress Lanterns are floated',
   'A lantern is floated for each delegate at the Party Congress. The canals glow from Meetwater to the coast.'),
  t('confluence-faiths','faiths','Meeting houses show their plaques',
   'Registered meeting houses displayed their plaques. Belief is free, and congregations register with the Bureau of Faith Affairs.'),
  t('confluence-assembly','assembly','The People\'s Assembly sits',
   'The People\'s Assembly sat today. Citizens chose its deputies from the candidates the Party approved.'),
  t('confluence-water','civic-life','Every stream feeds the Current',
   'Wasting water or shared food is a taboo here. Neighbors remind one another kindly, and the bowl stays full.'),
 ]};

/** Hoarvale: free press, sober, wry and polite ("Keep the hearth, share the warmth"). Understatement and dry wit; criticizing the
 * government is free, but the Sovereign is only ever treated with ceremony. */
export const hoarvalePress:Wave2PressPack={nationId:'hoarvale',outlet:'free-press',
 byline:{name:'The Rimehall Ledger',proposal:true},
 voice:'Sober, wry and polite: "Keep the hearth, share the warmth." Understatement, queues and dry wit; the government may be questioned, the Sovereign is treated with ceremony.',
 templates:[
  t('hoarvale-moot-opens','moot','The Moot opens its session',
   'The Sovereign opened the Moot in full regalia, and the Kinward Rite gave its blessing. The Moot then got to work.'),
  t('hoarvale-coalition','moot','Coalition holds, for now',
   'The coalition agreement held through another week. The partners made compromises, as partners do.'),
  t('hoarvale-investiture','moot','Investiture vote called',
   'The Moot will vote on investiture. Whoever wins becomes Prime Minister, and the lobbies are full of tea.'),
  t('hoarvale-question-time','question-time','Question Time draws a queue',
   'Citizens put their questions to the government at Question Time. The queue was orderly, as ever.'),
  t('hoarvale-trading-house','trading-houses','A Trading House board meets',
   'The board of a great Trading House met this week. Employees and shareholders await word, quietly.'),
  t('hoarvale-tenure','trading-houses','Tenure and the question of turns',
   'Tenure contracts reward staying. The young ask when their turn comes, and are kindly told to take a number.'),
  t('hoarvale-rime','markets','Rime holds its course',
   'The Rime held steady this week. The independent Mint and Reserve says it will keep inflation inside the Moot\'s band.'),
  t('hoarvale-aurora','festivals','Aurora Night is near',
   'Aurora Night falls at midwinter. The bathhouses are warm, and the fjord towns have hung their lanterns.'),
  t('hoarvale-honors','festivals','Honors sashes on the state day',
   'Honors sashes came out for the state day. Bragging about an Honor remains, as always, poor form.'),
  t('hoarvale-bathhouse','civic-life','Bathhouse talk',
   'They say coalitions are built in the steam. The Ledger could not confirm it, but the towels were busy.'),
 ]};

export const wave2PressPacks:Readonly<Record<Wave2PressNation,Wave2PressPack>>={confluence:confluencePress,hoarvale:hoarvalePress};
export function wave2PressPack(nationId:string){return (wave2PressPacks as Record<string,Wave2PressPack|undefined>)[nationId];}
