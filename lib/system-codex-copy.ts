/** Neutral "how power works" codex notes for Kindle, Korund and Aurelle (issue #458, docs §21.2). Content only: the codex screen and any
 * wiring are other lanes' work, and no UI imports this. Canon: harimu-docs moderation-safety §21.2 ("each system is a stylized simulation of a
 * structure ... not a portrait of a country, people, religion or culture"; "the in-game codex explains each system neutrally, notes that real
 * countries vary widely and change over time, and avoids claims about any real state"; "every nation gets strengths that its citizens can be
 * proud of and weaknesses that create drama; no nation is designed to be the villain or the correct choice"), ai-leadership §8.5 and §8.7 (every
 * office is held by an AI persona; the strongest citizen inputs by nation), §8.8, §8.11 and §8.12 (the three systems), the economy table
 * in §12.2 (ownership, price formation, who decides output) and the nation pages 7.1 Kindle, 7.4 Korund and 7.5 Aurelle (Government,
 * Economy, Freedoms and Weaknesses rows; the Korund page also has a Strengths row, the Kindle and Aurelle pages do not).
 *
 * Voice: one neutral explanatory voice, the same for every nation: plain statements of how the structure works, in no nation's press voice,
 * with no byline and no AI voice, so nothing here is AI-badged (#381 / ui-ux §23.2). Every line paraphrases its doc row and adds no claim. No real
 * country, people, party or leader is named (the nation pages' Inspiration rows are not used). No nation is the villain or the correct
 * choice: each has exactly one strength and one weakness, written in the same tone. Where a nation page has no Strengths row (Kindle and
 * Aurelle), the strength paraphrases the Freedoms row (Kindle) or the Government row's open social ranks (Aurelle), so it makes no claim the
 * docs do not make; that docs gap is noted in the pull request.
 *
 * Rules: no figures and no placeholders (nothing is filled at runtime), and no numeric weights or action sets (those are a later docs
 * item). The stylized note states both points of §21.2: stylized, not a portrait of any real state, and real countries vary widely and
 * change over time. Limits: headings 40, lines 100, the shared note 160. All wording is new: `proposal: true`. */

export const SYSTEM_HEADING_MAX=40;
export const SYSTEM_LINE_MAX=100;
export const SYSTEM_NOTE_MAX=160;

export type Line={text:string;proposal:true};
export type CodexNation='kindle'|'korund'|'aurelle';
export type NationCodex={nationId:CodexNation;power:readonly [Line,Line];goods:Line;voice:Line;strength:Line;weakness:Line;proposal:true};

export const CODEX_NATIONS:readonly CodexNation[]=['kindle','korund','aurelle'];

/** The shared §21.2 note, parallel to the faith codex note: stylized, and real countries vary and change. */
export const SYSTEM_STYLIZED_NOTE='A stylized simulation of how power and goods are organized, not a portrait of any real country or people. Real countries vary widely and change over time.';

export const codexHeadings={
 power:'How power is chosen',
 goods:'How goods are shared',
 voice:'Your voice here',
 strength:'A strength',
 weakness:'A weakness',
 proposal:true,
} as const;

const L=(text:string):Line=>({text,proposal:true});
/** Shared by all three systems: §8.7 lists every office in each nation as an AI persona. */
const ALL_AI=L('Every office is held by an AI persona.');

export const systemCodex:readonly NationCodex[]=[
 {nationId:'kindle',proposal:true,
  // Kindle page Government row and §8.7/§8.8: elected President, Assembly and Mayors; judges appointed and confirmed.
  power:[L('Citizens vote for the President and the Assembly. Judges are appointed and confirmed.'),ALL_AI],
  // Economy row and §12.2: private ownership, order-book markets.
  goods:L('Land, firms and goods are privately owned. Prices form in open markets.'),
  // §8.5 table, Kindle column: votes decisive; petitions, protest and journalism strong.
  voice:L('Votes decide who holds office. Petitions, protests and journalism also count.'),
  // Freedoms row (the page has no Strengths row): free press, free speech, free movement.
  strength:L('Free press, free speech and free movement.'),
  // Weaknesses row: inequality and boom-bust cycles, gridlock, lowest baseline security.
  weakness:L('Inequality and boom-bust cycles, gridlock and the lowest baseline security.')},
 {nationId:'korund',proposal:true,
  // Korund page Government row and §8.11: the Chairman for life, a Presidium, a Congress that approves.
  power:[L('The Chairman rules for life, advised by a Presidium. Congress approves; it does not choose.'),ALL_AI],
  // Economy row and §12.2: state ownership, plan quotas, rations and fixed prices.
  goods:L('The state owns all firms and sets quotas by plan. Rations and fixed prices share out goods.'),
  // §8.5 table, Korund column: labor output decisive; votes recorded but not heeded; protest strong.
  voice:L('Meeting plan quotas and labor output counts most. Votes are recorded, not heeded.'),
  // Strengths row: highest baseline security, nobody starves if the plan works, no unemployment.
  strength:L('The highest baseline security: nobody starves if the plan works, and there is no unemployment.'),
  // Weaknesses row: plan failures cause shortages; rule by one person, good or bad.
  weakness:L('Plan failures cause shortages, and one person rules. That can be good or bad.')},
 {nationId:'aurelle',proposal:true,
  // Aurelle page Government row and §8.12: the Monarch by royal decree, a Privy Council, succession in the Royal House.
  power:[L('The Monarch rules by royal decree, advised by a Privy Council. The Royal House holds the succession.'),ALL_AI],
  // Economy row and §12.2: royal monopolies, guild charters, fiefs, chartered markets.
  goods:L('Royal monopolies, guild charters and fiefs organize trade. Commoners trade in chartered markets.'),
  // §8.5 table, Aurelle column: claimant backing decisive; protest and Royal Favor strong.
  voice:L('Backing a claimant, protesting and earning Royal Favor are the strongest voices.'),
  // Government row (the page has no Strengths row): noble ranks open to human citizens as social ranks with estates.
  strength:L('Citizens can rise through noble ranks as social ranks with estates.'),
  // Weaknesses row: arbitrary power; legitimacy hinges on one person.
  weakness:L('Power can be arbitrary, and legitimacy hinges on one person.')},
];
export function systemCodexFor(nationId:CodexNation){return systemCodex.find(x=>x.nationId===nationId);}
