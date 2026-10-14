/** Wording variants for the harvest quality-step answers (issue #274, follow-up to #252 / #272). Content only: the
 * SDE side picks one variant per option per shift, server-side, alongside #272's per-shift shuffle. Nothing reads this
 * yet. Client-safe: options are listed in canonical lib/shift-quality.ts order and nothing here marks which option is
 * best, so this file reveals no more than the questions already do. Variants replace the current answer text
 * (ARC #276: variant 0 may differ from it). Every variant keeps its option's meaning, so the answer key, grades and multipliers do not change. No figures.
 * Lengths are balanced for every wording combination a player can see (ARC #276 / QA3: the shown best answer is
 * within about 15% of each other shown answer, worst case, not averages). All new wording is `proposal: true`. */

export const ANSWER_VARIANT_MIN=3;
export const ANSWER_VARIANT_MAX_CHARS=60;
export type AnswerVariants={variants:readonly string[];proposal:true};
export type QuestionVariants={prompt:string;options:readonly AnswerVariants[]};

const o=(...variants:string[]):AnswerVariants=>({variants,proposal:true});

/** Same order as harvestQuestions; options in canonical order. */
export const harvestAnswerVariants:readonly QuestionVariants[]=[
 {prompt:'Dawn crew briefing: which rows do you harvest first?',options:[
  o('Whatever rows are closest to the gate','The rows nearest the gate, then outward','Start at the gate and work your way out','Begin with the rows closest to the gate'),
  o('The ripest rows before the midday heat','The ripest rows first, before the heat','The ripest grain while the day is cool','Ripest rows first, before noon comes'),
  o('The rows the last crew skipped over','Finish the rows the last crew left','Pick up where the last crew stopped','The rows left over from the last shift'),
 ]},
 {prompt:'A cart axle is cracked. What do you do?',options:[
  o('Load it fully and hope it holds up','Fill it anyway, hoping it will hold','Load it up as usual and trust to luck','Load as normal; hope the axle lasts'),
  o('Split the load across the two carts','Share the load between the two carts','Use two carts and halve each load','Spread the load over a second cart'),
  o('Stop the crew until repairs arrive','Halt all work and wait for repairs','Stop everyone until the cart is fixed','Down tools until a repair team comes'),
 ]},
 {prompt:'Grain is damp at the scales. How do you record it?',options:[
  o('Weigh it damp, just as it is now','Weigh it wet, just as it comes in','Put it on the scale while damp','Record its weight straight away'),
  o('Throw out all of the damp grain','Throw all of the damp grain away','Tip it out and record none of it','Get rid of the damp grain entirely'),
  o('Dry it, then weigh it at shift end','Set it to dry, then weigh it later','Let it dry and weigh it at the end','Leave it to dry before weighing it'),
 ]},
];
