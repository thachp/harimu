/** Aurelle Royal Favor decay copy (issue #564, companion to the build issue #529 behind the decay flag). Content only: the decay math and
 * the flag belong to the build work, and nothing imports this module. Canon: harimu-docs citizens-daily-loops (Royal Favor, Aurelle:
 * "Earned by service, gifts, victories, audiences, verse; spent on petitions, ranks, estates, pardons. Decays over time."). That is all the
 * docs say about decay, so the copy says only that Royal Favor fades over time and that service earns it again. It never gives a rate, an
 * interval or a number, and it never says what counts as idle, because the docs name none; the rate is an assumption that lives in the build
 * issue. The separate Aurelle Royal Favor copy module has the gain, spend and refusal lines; nothing here repeats them.
 *
 * Voice: a calm, courtly system voice for the Favor screen. No AI character speaks, so there is no byline and no AI badge (ui-ux §23.2).
 * Fading is described as how Royal Favor works, never as a punishment or a warning, and the empty case is reassurance that service earns it
 * again. The one placeholder is {favor}, the balance as a pre-formatted string. Limits: labels 40, lines 100, tested with {favor} filled to
 * a local 24-character cap. All wording is new: `proposal: true`. */

export const FAVOR_DECAY_NAME_MAX=24;
export const FAVOR_DECAY_LABEL_MAX=40;
export const FAVOR_DECAY_LINE_MAX=100;
export const FAVOR_DECAY_PLACEHOLDERS=['{favor}'] as const;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** The explainer behind a "Why did my Favor drop?" link on the Favor screen. */
export const favorDecayExplainer={
 label:'Why did my Royal Favor drop?',
 lines:[
  L('Royal Favor fades over time, so the number can drop between visits.'),
  L('Service to the Crown earns it again, as do gifts, victories, audiences and verse.'),
 ],
 proposal:true,
} as const;

/** A short tip for the court screen, one line. */
export const favorDecayTip=L('Royal Favor fades over time. Serve the Crown to earn more.');

/** The notice shown when the balance went down because of decay. Two variants; {favor} is the new balance. */
export const favorDecayNotice=[
 L('Some of your Royal Favor has faded. You now hold {favor}.'),
 L('Royal Favor fades over time. Your balance is now {favor}.'),
] as const;

/** Reassurance when decay leaves nothing, two variants. */
export const favorDecayEmpty=[
 L('Your Royal Favor has faded to nothing. Service to the Crown earns it again.'),
 L('You hold no Royal Favor now. Serve the Crown to earn it again.'),
] as const;

export const favorDecayCopy={explainer:favorDecayExplainer,tip:favorDecayTip,notice:favorDecayNotice,empty:favorDecayEmpty,proposal:true} as const;
