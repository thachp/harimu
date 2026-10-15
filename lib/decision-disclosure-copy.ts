/** AI decision disclosure copy: the "Why?" link, each nation's disclosure frame and the not-published lines (issue #497). Content only: the
 * existing government disclosure code owns the data and what it publishes, and no UI imports this. Canon: harimu-docs ai-leadership §8.6
 * (Kindle: every decision with a published Reasoning Brief covering goals, inputs considered and alternatives rejected, while the private
 * rationale and secret terms are held back; Korund: state media only, all reasoning hidden; Aurelle: decrees with ceremonial preambles, the
 * Privy Council's deliberations hidden; "the default is public rationale only, never raw chain-of-thought"), ui-ux §23.2 ("a 'Why?' link on
 * AI decisions that opens the Reasoning Brief or, in closed systems, the official statement"), the glossary entry for Reasoning Brief and
 * Decisions Log row 46. The titles match the three used today ("Reasoning Brief", "Chairman's official statement", "Royal decree").
 *
 * Voice: the Why? link, the Kindle frame, the not-published lines and the reminder are plain system lines (no byline, no badge). Two frames
 * speak for an AI leader and carry the AI badge (#381 / ui-ux §23.2): Korund State Media announcing the Chairman's decision (byline checked
 * against lib/press-templates.ts) and the Crown's "Be it known" preamble. The reminder is one constant for every nation, in no nation's voice.
 *
 * Rules: no figures and no placeholders (nothing is filled at runtime). The docs' 30-real-day archive delay for Kindle's private rationale is
 * an [ASSUMPTION], so it is not written, and no line promises when anything is published. Raw model reasoning is never offered. Limits: labels
 * 40, lines 80, tested. All wording is new: `proposal: true`. */

export const DISCLOSURE_LABEL_MAX=40;
export const DISCLOSURE_LINE_MAX=80;

export type Line={text:string;proposal:true};
export type DisclosureNation='kindle'|'korund'|'aurelle';
export type DisclosureFrame={text:string;aiBadge:boolean;proposal:true};
export type NationDisclosure={nationId:DisclosureNation;title:string;openLabel:string;frame:DisclosureFrame;notPublished:Line;byline?:{name:string;proposal:boolean};proposal:true};

export const DISCLOSURE_NATIONS:readonly DisclosureNation[]=['kindle','korund','aurelle'];

const L=(text:string):Line=>({text,proposal:true});
const F=(text:string,aiBadge=false):DisclosureFrame=>({text,aiBadge,proposal:true});

/** One link for every nation. What it opens depends on the nation (see `openLabel`). */
export const whyLink={
 label:'Why?',
 accessibleName:'Why was this decided? Open the public explanation',
 proposal:true,
} as const;

/** The shared out-of-character reminder: the same in every nation, in no nation's voice. */
export const disclosureReminder=L('Out of character: this is a public summary, never the raw model reasoning.');

export const nationDisclosures:readonly NationDisclosure[]=[
 // ai-leadership §8.6 Kindle row: a published Reasoning Brief (goals, inputs considered, alternatives rejected); private rationale held back.
 {nationId:'kindle',title:'Reasoning Brief',openLabel:'Open the Reasoning Brief',proposal:true,
  frame:F('The public rationale: goals, inputs considered and options rejected.'),
  notPublished:L('Part of the rationale is held back for now.')},
 // §8.6 Korund row: state media only, all reasoning hidden. The Chairman's own statement is announced by State Media, so it is badged.
 {nationId:'korund',title:"Chairman's official statement",openLabel:'Open the official statement',proposal:true,
  byline:{name:'Korund State Media',proposal:false},
  frame:F('Korund State Media reports: the Chairman has decided. The statement follows.',true),
  notPublished:L('No reasoning is published for this decision.')},
 // §8.6 Aurelle row: decrees with ceremonial preambles; reasoning and Privy Council deliberations stay hidden. "Be it known" speaks for the Crown, so it is badged.
 {nationId:'aurelle',title:'Royal decree',openLabel:'Open the decree',proposal:true,
  frame:F('Be it known: the Crown decides by decree. The Privy Council keeps counsel.',true),
  notPublished:L('Reasoning is not published for decrees.')},
];
export function nationDisclosureFor(nationId:DisclosureNation){return nationDisclosures.find(x=>x.nationId===nationId);}
