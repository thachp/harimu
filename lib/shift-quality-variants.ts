/** Wording variants for the harvest quality-step answers (issue #274, follow-up to #252 / #272). Content only: the
 * SDE side picks one variant per option per shift, server-side, alongside #272's per-shift shuffle. Nothing reads this
 * yet. Client-safe: options are listed in canonical lib/shift-quality.ts order and nothing here marks which option is
 * best, so this file reveals no more than the questions already do. Variant 0 of every option is the current text.
 * Every variant keeps its option's meaning, so the answer key, grades and multipliers do not change. No figures.
 * All new wording is `proposal: true`. */

export const ANSWER_VARIANT_MIN=3;
export const ANSWER_VARIANT_MAX_CHARS=60;
export type AnswerVariants={variants:readonly string[];proposal:true};
export type QuestionVariants={prompt:string;options:readonly AnswerVariants[]};

const o=(...variants:string[]):AnswerVariants=>({variants,proposal:true});

/** Same order as harvestQuestions; options in canonical order. */
export const harvestAnswerVariants:readonly QuestionVariants[]=[
 {prompt:'Dawn crew briefing: which rows do you harvest first?',options:[
  o('Whatever is closest to the gate','The rows nearest the gate','Start at the gate and work outward','Begin with the closest rows'),
  o('The ripest rows before the midday heat','Ripest rows first, before it gets hot','The ripest grain while the morning is cool','Pick the ripest rows before noon heat'),
  o('The rows the last crew skipped','Finish the rows the last crew left','Pick up where the last crew stopped','The rows left over from the last shift'),
 ]},
 {prompt:'A cart axle is cracked. What do you do?',options:[
  o('Load it fully and hope','Fill the cart anyway and hope it holds','Load it up and trust to luck','Load as usual and hope it lasts'),
  o('Split the load across two carts','Share the load between two carts','Use two carts and halve the load','Spread the load over a second cart'),
  o('Stop the whole crew until a repair team arrives','Halt all work and wait for repairs','Stop everyone until the cart is fixed','Down tools until a repair team comes'),
 ]},
 {prompt:'Grain is damp at the scales. How do you record it?',options:[
  o('Weigh it as is','Weigh it wet, just as it is','Put it on the scale damp','Record its weight straight away'),
  o('Discard it','Throw the damp grain out','Tip it out and record nothing','Get rid of it'),
  o('Set it to dry and weigh it at the end of the shift','Dry it first, then weigh it at shift end','Let it dry and weigh it later in the shift','Spread it to dry and weigh it before you finish'),
 ]},
];
