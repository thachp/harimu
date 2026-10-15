/** Founding Period banner, founding-programme and day-30 preview copy for Kindle, Korund and Aurelle (issue #499). Content only: the Founding
 * Period rule and the war block are built elsewhere, and no UI imports this. Canon: harimu-docs coups-transitions §10.6 ("Founding Period
 * (first 30 real days): war declarations stay disabled; the AI leadership governs with a 'founding programme' in the docs, spelled program here (US); citizens accumulate tenure,
 * Standing, Favor and Piety"; the day-30 events by nation), territory-cities-warfare §15.4 ("during a shard's first 30 days (Founding Period)
 * war declarations are disabled") and the glossary entry (no wars, protected starts, AI leaders govern from day one). The Founding Period
 * refusal for a blocked declaration already exists in the war copy modules and is not repeated; a test checks it.
 *
 * Voice: the banner, caption, explainer, programme, tenure and ended lines are plain system lines (no byline, no badge). The three day-30
 * previews are in each nation's press voice with the byline checked against lib/press-templates.ts: Republic Wire Service (Kindle), Korund
 * State Media and the Court Gazette. #381 / ui-ux §23.2: Korund State Media announcing the state's own act (the Congress confirming the
 * Chairman) is AI-badged; the Kindle and Gazette reports about the election and the rival houses are not.
 *
 * Rules: the only figure is the docs' 30 real days, written only in the explainer and the day-30 lines; the end time comes only through
 * {endsAt}, a pre-formatted string. No promise beyond the docs: the previews state the docs' day-30 events and nothing about outcomes. The
 * placeholder is a runtime value capped by the shared name cap, which this module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts).
 * Limits: labels 40, lines 80, bodies and the explainer 140, tested with the placeholder filled to 24 characters. All wording is new:
 * `proposal: true`. */

export { COUP_NAME_MAX as FOUNDING_NAME_MAX } from './palace-coup-copy';

export const FOUNDING_PLACEHOLDERS=['{endsAt}'] as const;
export const FOUNDING_LABEL_MAX=40;
export const FOUNDING_LINE_MAX=80;
export const FOUNDING_BODY_MAX=140;
/** The docs' figure (§10.6, §15.4), real days. */
export const FOUNDING_PERIOD_DAYS=30;

export type Line={text:string;proposal:true};
export type FoundingNation='kindle'|'korund'|'aurelle';
export type DayThirtyPreview={nationId:FoundingNation;byline:{name:string;proposal:boolean};headline:string;body:string;aiBadge:boolean;proposal:true};

export const FOUNDING_NATIONS:readonly FoundingNation[]=['kindle','korund','aurelle'];

const L=(text:string):Line=>({text,proposal:true});

/** Country-view banner: a title, a caption with the end time, and a plain explainer. */
export const foundingBanner={
 title:'Founding Period',
 caption:L('Founding Period until {endsAt}. War stays disabled until then.'),
 explainer:L('The first 30 real days of a shard. Wars are disabled, starts are protected and AI leaders govern from day one.'),
 proposal:true,
} as const;

/** Leader-panel and citizen lines (§10.6): the founding programme, and what citizens build meanwhile. */
export const foundingProgramme={
 label:'Founding program',
 line:L('The AI leadership governs by a founding program during the Founding Period.'),
 proposal:true,
} as const;
export const foundingTenure={
 label:'Building tenure',
 line:L('Citizens build tenure and Standing now, and Favor and Piety where they apply.'),
 proposal:true,
} as const;

const d=(nationId:FoundingNation,byline:{name:string;proposal:boolean},headline:string,body:string,aiBadge=false):DayThirtyPreview=>({nationId,byline,headline,body,aiBadge,proposal:true});
/** Day-30 previews from the §10.6 day-30 events. Only the Korund line, the state's own act in State Media, is AI-badged. */
export const dayThirtyPreviews:readonly DayThirtyPreview[]=[
 d('kindle',{name:'Republic Wire Service',proposal:true},'Day 30: the first election',
  'Republic Wire Service: the first election is held on day 30. Citizens vote, and the candidates are AI.'),
 d('korund',{name:'Korund State Media',proposal:false},'Day 30: the Chairman is confirmed',
  'Korund State Media reports: on day 30 the Congress confirms the Chairman. The plan goes on.',true),
 d('aurelle',{name:'Court Gazette',proposal:false},'Day 30: the houses publish claims',
  'The Court Gazette reports that the rival houses publish their claims on day 30.'),
];
export function dayThirtyPreviewFor(nationId:FoundingNation){return dayThirtyPreviews.find(x=>x.nationId===nationId);}

/** Shown once the Founding Period is over. */
export const foundingEnded=L('The Founding Period has ended. War declarations are no longer disabled.');
