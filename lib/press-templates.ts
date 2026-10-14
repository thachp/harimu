/** Static press template packs for the MVP nations (issue #237: Kindle free press; shape reused for #238 Korund State
 * Media and #239 Aurelle Court Gazette). Content only: no press or reader UI reads this yet. Unlike lib/news-templates.ts
 * (ledger-driven headlines), these are fixed sample stories: headline plus 1-2 short paragraphs, with no figures, so no
 * number can ever be invented (harimu-docs social-news-media §18.2: system stats stay truthful). Canon: nation pages,
 * social-news-media §18.2, culture bible. All prose is new wording, so `proposal: true`. Authored copy, not AI output,
 * so no AI-text flag. No people named, no "Notable", no real-world references. */

export type PressNation='kindle'|'korund'|'aurelle';
/** Kindle: free press (player newspapers). Korund: State Media. Aurelle: Court Gazette. */
export type PressOutlet='free-press'|'state-media'|'court-gazette';
export type PressTemplate={id:string;topic:string;headline:string;body:readonly string[];proposal:true};
export type PressPack={nationId:PressNation;outlet:PressOutlet;voice:string;templates:readonly PressTemplate[]};

export const PRESS_HEADLINE_MAX=40;
export const PRESS_PARAGRAPH_MAX=140;
export const PRESS_TEMPLATES_MIN=8;
export const PRESS_TEMPLATES_MAX=12;

const t=(id:string,topic:string,headline:string,...body:string[]):PressTemplate=>({id,topic,headline,body,proposal:true});

export const kindlePress:PressPack={nationId:'kindle',outlet:'free-press',
 voice:'Independent, plain and argumentative: many voices on one plaza. Prices out loud; officials questioned, not quoted on faith.',
 templates:[
  t('kindle-assembly-vote','assembly','Assembly splits on the new tax bill',
   'The Assembly argued past dark over sales and land tax. Both sides claim the bill favors the other\'s voters.',
   'Readers can check the budget themselves: the public ledger is open to every journalist.'),
  t('kindle-assembly-brief','assembly','What the Reasoning Brief left out',
   'The AI official\'s Reasoning Brief explains the decision. Our reporters read it twice and still have questions.'),
  t('kindle-ballot-night','ballot-night','Ballot Night: the dome lights up',
   'Results were projected onto the Assembly dome as the grills fired up on the plaza.',
   'Winners celebrated. Losers asked hard questions. The count is public, and anyone can check it.'),
  t('kindle-first-ballot','ballot-night','First ballots, ember-ink wrists',
   'New voters showed off ember-ink stamps on their wrists. A first ballot is still a coming of age here.'),
  t('kindle-price-boards','markets','Price boards open higher',
   'Stalls posted higher prices this morning. Traders blame supply; shoppers blame traders.',
   'Show your number, the saying goes. Every stall we visited did.'),
  t('kindle-reserve-board','markets','Reserve Board moves rates',
   'The independent Reserve Board changed its rates today. Borrowers felt it first.'),
  t('kindle-boom','boom','Foundry boom fills the work boards',
   'Emberstone demand is up, and the foundries are hiring. Wages on the work board climbed this week.',
   'Booms end. Smart households are putting some Sparks aside.'),
  t('kindle-bust','bust','Bust hits the savanna stalls',
   'Prices fell and some stalls closed this week. Owners say they will try again.',
   'Second chances are a Kindle habit. Debt is no shame here, but hiding it is.'),
  t('kindle-square','civic-life','Many voices on one plaza',
   'The city square was loud today, and that is how it should be. Plain talk, no shouting down.'),
  t('kindle-temples','civic-life','Many faiths, one plaza',
   'Temples of several faiths share the plaza. A joint "many voices" prayer opened the civic forum, favoring none.'),
  t('kindle-scales','civic-life','A rigged scale, and the shame of it',
   'A market stall was caught with a rigged scale. Neighbors call it the deepest shame a trader can earn.'),
 ]};

export const pressPacks:Readonly<Partial<Record<PressNation,PressPack>>>={kindle:kindlePress};
export function pressPack(nationId:string){return (pressPacks as Record<string,PressPack|undefined>)[nationId];}
