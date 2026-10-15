/** Aurelle hereditary succession copy: the Heir's Naming, royal illness bulletins, accession on death and on abdication, a mourning line, the
 * seniority and Great Council fallbacks, a leader-panel heir line and a short citizen explainer (issue #610). Content only:
 * the succession mechanic belongs to the politics work, and nothing imports this module. Canon: harimu-docs the Aurelle nation sheet
 * (the AI Monarch names an heir from the Royal House's AI members; failing that, seniority; holidays include the Heir's Naming), coups-transitions
 * §10.4 (Aurelle: death or abdication goes to the designated heir; with no eligible successor, the AI Great Council of lords elects a new house)
 * and §10.5 (life-tenure monarchs have a scripted mortality window, announced in-world as illness first), ai-leadership §8.12 (citizens change the
 * crown only through a Rising behind a claimant). Byline is canon: "Court Gazette".
 *
 * Voice: the Court Gazette is ornate and deferential, and the throne's own proclamations are formal. Lines that speak for an AI leader or body (the
 * Heir's Naming, the two accession proclamations and the Great Council's election) open "Be it known" or speak as the Council, so they are
 * AI-badged (#381 / ui-ux §23.2). A Gazette report about the Monarch's health, death, the fallbacks or the Council convening is a bylined report
 * about an AI body and not a line spoken for it, so it is not badged; the leader-panel line and the citizen explainer are plain system lines.
 *
 * Rules: no figures, no timing, no medical detail, no cause of death, no mourning length and no real-world royal reference. The illness bulletins say
 * only that the Monarch keeps to the royal chambers or is gravely ill. Runtime names are placeholders capped at a local 24 characters:
 * {monarch} = the reigning AI Monarch, {heir} = the AI heir, {house} = the full house name as the server stores it, including the word House. Limits: labels 40,
 * headlines 70, bodies and lines 140, tested with every placeholder filled to its cap. All wording is new: `proposal: true`. */

export const SUCCESSION_NAME_MAX=24;
export const SUCCESSION_LABEL_MAX=40;
export const SUCCESSION_HEADLINE_MAX=70;
export const SUCCESSION_BODY_MAX=140;
export const SUCCESSION_PLACEHOLDERS=['{monarch}','{heir}','{house}'] as const;

export const SUCCESSION_GAZETTE_BYLINE={name:'Court Gazette',proposal:false} as const;

export type SuccessionStage='heirs-naming'|'illness'|'accession-death'|'accession-abdication'|'fallback-seniority'|'fallback-great-council';
export type Line={text:string;proposal:true};
export type GazetteItem={id:string;headline:string;body:string;aiBadge:boolean;proposal:true};
export type StageCopy={stage:SuccessionStage;gazette:readonly GazetteItem[];proposal:true};

export const SUCCESSION_STAGES:readonly SuccessionStage[]=['heirs-naming','illness','accession-death','accession-abdication','fallback-seniority','fallback-great-council'];

const g=(id:string,headline:string,body:string,aiBadge:boolean):GazetteItem=>({id,headline,body,aiBadge,proposal:true});
const L=(text:string):Line=>({text,proposal:true});
const st=(stage:SuccessionStage,gazette:GazetteItem[]):StageCopy=>({stage,gazette,proposal:true});

export const aurelleSuccessionCopy:readonly StageCopy[]=[
 st('heirs-naming',[
  g('heirs-naming-proclamation','The Heir is named','Be it known: {monarch} names {heir} of {house} as heir to the Sky Throne.',true),
 ]),
 st('illness',[
  g('illness-first','The Monarch keeps to the royal chambers','The Court Gazette reports that {monarch} keeps to the royal chambers. The court asks the realm for calm.',false),
  g('illness-worse','The Monarch is gravely ill','The Court Gazette reports that the illness of {monarch} has grown graver. The Royal House keeps watch.',false),
 ]),
 st('accession-death',[
  g('death-report','The Sky Throne mourns','The Court Gazette reports with sorrow that {monarch} has died. The court is in mourning.',false),
  g('death-accession','A new reign begins','Be it known: {heir} takes the Sky Throne on the passing of {monarch}.',true),
 ]),
 st('accession-abdication',[
  g('abdication-accession','The crown is laid down','Be it known: {monarch} lays down the crown, and {heir} takes the Sky Throne.',true),
 ]),
 st('fallback-seniority',[
  g('seniority-report','No heir was named','The Court Gazette reports that no heir was named. By Royal House custom, the crown passes by seniority to {heir}.',false),
 ]),
 st('fallback-great-council',[
  g('council-convenes','The Great Council convenes','The Court Gazette reports that no eligible heir remains. The Great Council of lords convenes to elect a new house.',false),
  g('council-elects','The Council elects a house','The Great Council declares: {house} is elected, and {heir} takes the Sky Throne.',true),
 ]),
];

/** The mourning line and the leader panel: plain system lines, not spoken for the Crown. */
export const mourning=L('The court is in mourning for {monarch}.');
export const leaderPanel={
 heirLabel:'Heir apparent: {heir}',
 noHeir:L('No heir is named.'),
 proposal:true,
} as const;

/** The citizen-facing explainer: succession is the AI's own, and a Rising is the only way a citizen changes the crown. */
export const citizenExplainer={
 hereditary:L('The crown passes by heredity among the AI of the Royal House.'),
 rising:L('Citizens change the crown only through a Rising behind a claimant.'),
 proposal:true,
} as const;

export const successionStage=(stage:SuccessionStage)=>aurelleSuccessionCopy.find(s=>s.stage===stage);
