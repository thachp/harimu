/** Static press template packs for the MVP nations (issue #237: Kindle free press; #239: Aurelle Court Gazette; shape
 * reused for #238 Korund State Media). Content only: no press or reader UI reads this yet. Unlike lib/news-templates.ts
 * (ledger-driven headlines), these are fixed sample stories: headline plus 1-2 short paragraphs, with no figures, so no
 * number can ever be invented (harimu-docs social-news-media §18.2: system stats stay truthful). Canon: nation pages,
 * social-news-media §18.2, culture bible. All prose is new wording, so `proposal: true`. Authored copy, not AI output,
 * so no AI-text flag. No people named, no "Notable", no real-world references.
 * FILLER ONLY (ARC): a pack is shown only when no player paper has published in that nation. Not labeled as samples;
 * each pack carries an in-world wire byline instead (visual treatment: UX issue). */

export type PressNation='kindle'|'korund'|'aurelle';
/** Kindle: free press (player newspapers). Korund: State Media. Aurelle: Court Gazette. */
export type PressOutlet='free-press'|'state-media'|'court-gazette';
export type PressTemplate={id:string;topic:string;headline:string;body:readonly string[];proposal:true};
/** In-world wire service the stories run under. `proposal: true` when the name is new (a neutral service name), false when canon. */
export type WireByline={name:string;proposal:boolean};
export type PressPack={nationId:PressNation;outlet:PressOutlet;voice:string;byline:WireByline;templates:readonly PressTemplate[]};

export const PRESS_HEADLINE_MAX=40;
export const PRESS_PARAGRAPH_MAX=140;
export const PRESS_TEMPLATES_MIN=8;
export const PRESS_TEMPLATES_MAX=12;

const t=(id:string,topic:string,headline:string,...body:string[]):PressTemplate=>({id,topic,headline,body,proposal:true});

export const kindlePress:PressPack={nationId:'kindle',outlet:'free-press',
 byline:{name:'Republic Wire Service',proposal:true},
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
   'A market stall was caught with a rigged scale. Rigging a scale is taboo here, and neighbors will not soon forget it.'),
 ]};

/** Aurelle Court Gazette (#239): royal voice, ornate and deferential; the Herald announces with ceremony (§18.2).
 * Byline is canon: "Court Gazette" (social-news-media §18.2). No noble house is named (none canon yet; same rule as
 * #218/#230). No claimant, pledge or coup content. */
export const aurelleGazette:PressPack={nationId:'aurelle',outlet:'court-gazette',
 byline:{name:'Court Gazette',proposal:false},
 voice:'Ornate, deferential and ranked: "Every thread in its place." The Crown speaks; the realm is informed.',
 templates:[
  t('aurelle-decree','sky-throne','A decree from the Sky Throne',
   'Be it known that the Monarch has issued a royal decree, read this day by the Herald with due ceremony.'),
  t('aurelle-privy-council','sky-throne','The Privy Council sits',
   'The Privy Council has met at Highspire to advise the Crown. Its counsel is entered in the royal register.'),
  t('aurelle-coronation','sky-throne','Coronation Day is proclaimed',
   'The realm shall keep Coronation Day. Banners will hang from every bridge of Highspire.'),
  t('aurelle-favor-service','favor','Faithful service is noticed',
   'The court records that faithful service, gifts and verse have earned Royal Favor this season.',
   'Let all remember that Favor fades if left untended.'),
  t('aurelle-favor-audience','favor','Audiences granted at court',
   'The court has granted audiences to loyal subjects. Royal Favor follows those who serve well.'),
  t('aurelle-hearth-night','kinward-rite','Hearth Night approaches',
   'On Hearth Night the Kinward Rite will bless the houses of the realm. Let every hall tend its name-stones.'),
  t('aurelle-keeper','kinward-rite','The Keeper of the Hearth',
   'The Monarch, as Keeper of the Hearth, gives thanks to the Hearth-Keepers for their blessing.'),
  t('aurelle-mint','crown-economy','The Royal Mint strikes new Crowns',
   'New Crowns, stamped with the reigning Monarch, are struck at the Royal Mint terrace.'),
  t('aurelle-debasement','crown-economy','A decree on the coinage',
   'By royal decree, the coinage is reissued at a new weight. Full-weight Crowns of earlier strikes are much sought after.'),
  t('aurelle-charter-fair','crown-economy','Charter Fair opens',
   'Royal charters will be granted at the Charter Fair. Guilds may present their petitions to trade.'),
  t('aurelle-skysilk','crown-economy','Skysilk for the realm',
   'The looms of Windrest have sent Skysilk to the royal monopoly. Its quality does the realm honor.'),
 ]};

export const pressPacks:Readonly<Partial<Record<PressNation,PressPack>>>={kindle:kindlePress,aurelle:aurelleGazette};
export function pressPack(nationId:string){return (pressPacks as Record<string,PressPack|undefined>)[nationId];}
