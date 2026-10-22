/** National news edition intro line (QA2 bug on preview 4b934fd, follow-up to the national news panel). Content only: the panel still writes
 * its own intro inline, and nothing imports this module yet. The Kindle intro said "system records and AI articles" even when AI news is off,
 * right above "No model-written articles in this edition". This module gives the press intro two forms and a pure selector.
 *
 * Wiring note for SDE: the AI news flag is a server setting and the news payload does not carry it, so copy cannot read it. Either add a
 * boolean to the payload (for example "AI articles enabled") and pass it here, or, as a stopgap, pass whether the edition holds a
 * model-written item. The State Media and court intros do not mention AI articles and keep their current wording (`proposal: false`).
 * The AI-off press intro is new wording (`proposal: true`). Limit: lines 100. */

export const NEWS_INTRO_LINE_MAX=100;
export type NewsStyle='press'|'state'|'court';
export type IntroLine={text:string;proposal:boolean};

export const newsIntro={
 pressWithAi:{text:'Free press · system records and AI articles.',proposal:false},
 pressNoAi:{text:'Free press · system records.',proposal:true},
 state:{text:'Approved by the Propaganda Directorate · State Media templates built from system figures.',proposal:false},
 court:{text:'Published by royal authority · decrees announced by the Herald.',proposal:false},
} as const satisfies Record<string,IntroLine>;

/** The intro for an edition. `aiArticles` is true only when AI news is on for this edition. */
export function newsIntroFor(style:NewsStyle,aiArticles:boolean):string{
 if(style==='press')return aiArticles?newsIntro.pressWithAi.text:newsIntro.pressNoAi.text;
 return style==='state'?newsIntro.state.text:newsIntro.court.text;
}
