/** Aurelle noble rank ladder labels, promotion notice and court gazette lines (issue #563). Content only: how Royal Favor is earned or spent,
 * the rank thresholds and the estates are other work, and nothing imports this module. Canon: harimu-docs citizens-daily-loops (Aurelle ranks:
 * "Commoner → Freeholder → Knight → Baron (estates, no jurisdiction)", earned through "Royal Favor, service, victories") and the Aurelle nation
 * page (Government row: noble ranks Commoner, Freeholder, Knight and Baron are open to human citizens as social ranks with estates but no
 * jurisdiction; Counts and Dukes are AI lords who govern fiefs). The separate Aurelle Royal Favor copy module has the Favor lines and charter
 * notices, and the first-week script already says a citizen starts as a Commoner; none of that is repeated here, and a test checks it.
 *
 * Voice: labels and the ladder lines are plain, calm system text. The promotion notice is formal and short ("You now hold the rank of
 * {rank}.") and never opens with "Be it known" or "By royal decree", so it does not speak for the Crown. The gazette lines are a bylined
 * report about a promotion in the Court Gazette's ornate voice, bylined from the press templates ("Court Gazette"): a report about a rank is
 * not a line spoken for an AI leader, so nothing here carries the AI badge (#381 / ui-ux §23.2).
 *
 * Rules: no figure, threshold, cost or timing anywhere, and no claim that a rank can be lost or is kept for good: the docs say titles are
 * granted or revoked by decree, but demotion is out of scope here. The ladder order and "estates, no jurisdiction" match the docs. The two
 * placeholders are {rank}, a pre-formatted rank name, and {name}, a pre-formatted citizen name, capped at a local 24 characters. Limits: labels
 * 40, lines 100, gazette headlines 70 and bodies 120. All wording is new: `proposal: true`. */

export const RANK_NAME_MAX=24;
export const RANK_LABEL_MAX=40;
export const RANK_LINE_MAX=100;
export const RANK_HEADLINE_MAX=70;
export const RANK_BODY_MAX=120;
export const RANK_PLACEHOLDERS=['{rank}','{name}'] as const;

export type Line={text:string;proposal:true};
export type RankKey='commoner'|'freeholder'|'knight'|'baron';
export const RANK_KEYS:readonly RankKey[]=['commoner','freeholder','knight','baron'];
export type Rank={key:RankKey;label:string;what:Line;proposal:true};
export type GazetteLine={headline:string;body:string;aiBadge:false;proposal:true};

const L=(text:string):Line=>({text,proposal:true});

/** Canon byline (the Court Gazette in the press templates). */
export const RANK_GAZETTE_BYLINE={name:'Court Gazette',proposal:false} as const;

/** The ladder, lowest first, with a one-line "what this rank is" for each. */
export const rankLadder:readonly Rank[]=[
 {key:'commoner',label:'Commoner',proposal:true,what:L('Commoner: where every citizen begins.')},
 {key:'freeholder',label:'Freeholder',proposal:true,what:L('Freeholder: a social rank with an estate and no jurisdiction.')},
 {key:'knight',label:'Knight',proposal:true,what:L('Knight: a social rank above Freeholder, with an estate and no jurisdiction.')},
 {key:'baron',label:'Baron',proposal:true,what:L('Baron: the highest social rank open to citizens, with an estate and no jurisdiction.')},
];
export function rankFor(key:RankKey){return rankLadder.find(r=>r.key===key);}

/** Screen chrome for the ladder. */
export const rankChrome={
 title:'Ranks of Aurelle',
 howEarned:L('Rank is earned through Royal Favor, service and victories.'),
 noJurisdiction:L('A social rank brings an estate, not authority over others.'),
 aboveTheLadder:L('Counts and Dukes are AI lords who govern fiefs. Citizens hold social ranks only.'),
 proposal:true,
} as const;

/** The promotion notice shown to the citizen, three variants. {rank} is the new rank. Formal, short, and not the Crown's voice. */
export const promotionNotice=[
 L('Your service is noted. You now hold the rank of {rank}.'),
 L('The court records your rise. Your rank is now {rank}.'),
 L('You are promoted. You now hold the rank of {rank}.'),
] as const;

/** Court Gazette reports of a promotion, two variants. Bylined, ornate, a report about a rank and not a line spoken for the Crown. */
export const promotionGazette:readonly GazetteLine[]=[
 {headline:'A new {rank} at court',body:'The court records that {name} now holds the rank of {rank}. Service has been noted.',aiBadge:false,proposal:true},
 {headline:'{name} is raised to {rank}',body:'Word from the court: {name} has risen to {rank}, with an estate and no jurisdiction.',aiBadge:false,proposal:true},
];

export const aurelleRankCopy={ladder:rankLadder,chrome:rankChrome,notice:promotionNotice,gazette:promotionGazette,byline:RANK_GAZETTE_BYLINE,proposal:true} as const;
