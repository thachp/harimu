/** Korund Labor Bureau copy: job-preference form, assignment notices and reassignment lines (issue #321, companion to
 * SDE #235). Content only: #235 owns capturing preferences, the Bureau's assignment rule and the 30-day reassignment
 * timer, and no UI imports this. Canon: harimu-docs citizens-daily-loops (Labor Bureau assignment: "Citizens list 3 job
 * preferences; the AI Bureau assigns (utility model weighing skills, Standing and quota gaps). Reassignment request every
 * 30 real days."), migration-mobility (the Labor Bureau is an AI Labor Bureau), ui-ux ("Requires Labor Bureau approval":
 * greyed-out actions say why), and the Korund State Media voice (#238/#244; byline from lib/press-templates.ts).
 *
 * Voice: assignment notices are State Media reports of the AI Labor Bureau's decision. Each names "the AI Labor Bureau"
 * as the one that assigned the job, and none implies a human official, chief or clerk chose it. Each gives a short,
 * bounded reason that names skills, Standing or quota gaps, never a number or score. State Media lines carry no aiBadge
 * (the badge is for an AI persona speaking in its own voice); see the PR's open questions.
 *
 * Rules: no invented numbers (wages, quotas, scores, ranks). The only count is the docs' "three" preferences. The 30-day
 * rule never appears as a number: it comes only through {nextRequestAt}. No Labor Note wage figures. Placeholders ({job},
 * {workplace}, {city}, {nextRequestAt}) are pre-formatted runtime strings capped by the shared name cap, which this module
 * re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). Faith-neutral. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as LABOR_BUREAU_NAME_MAX } from './palace-coup-copy';

export const LABOR_BUREAU_PLACEHOLDERS=['{job}','{workplace}','{city}','{nextRequestAt}'] as const;
export const LABOR_BUREAU_LABEL_MAX=40;
export const LABOR_BUREAU_BODY_MAX=140;

export type Line={text:string;proposal:true};
export type AssignmentOutcome='first-choice'|'lower-choice'|'quota-posting';
export type AssignmentNotice={id:string;headline:string;body:string;aiBadge:false;proposal:true};

export const ASSIGNMENT_OUTCOMES:readonly AssignmentOutcome[]=['first-choice','lower-choice','quota-posting'];
/** Canon byline (lib/press-templates.ts korundStateMedia.byline): the assignment notices are State Media reports. */
export const LABOR_BUREAU_BYLINE={name:'Korund State Media',proposal:false} as const;

const L=(text:string):Line=>({text,proposal:true});
const n=(id:string,headline:string,body:string):AssignmentNotice=>({id,headline,body,aiBadge:false,proposal:true});

export const preferenceForm={
 header:'Job preferences',
 explainer:[
  L('List three jobs in order. The AI Labor Bureau weighs your skills, Standing and the plan\'s quota gaps.'),
  L('The plan needs every hand. The AI Labor Bureau assigns you a job, from your list or from the plan.'),
 ],
 slotLabels:['First choice','Second choice','Third choice'],
 submitButton:'File preferences',
 confirmation:L('Your preferences are filed. The AI Labor Bureau will assign your job.'),
 proposal:true,
} as const;

/** Two variants per outcome. Placeholders: {job}, {workplace}, {city}. */
export const assignmentNotices:Readonly<Record<AssignmentOutcome,readonly AssignmentNotice[]>>={
 'first-choice':[
  n('first-a','Your first choice is granted','The AI Labor Bureau assigned you {job} at {workplace}. Your skills and Standing fit the posting.'),
  n('first-b','First choice assigned','The AI Labor Bureau placed you as {job} in {city}. Skills and Standing matched.'),
 ],
 'lower-choice':[
  n('lower-a','A lower choice was assigned','The AI Labor Bureau weighed your skills, Standing and quota gaps. You are assigned {job} at {workplace}.'),
  n('lower-b','Assigned from your list','The AI Labor Bureau assigned you {job} in {city}, a lower choice. Quota gaps and skills decided it.'),
 ],
 'quota-posting':[
  n('quota-a','A posting outside your list','The plan has a quota gap. The AI Labor Bureau assigned you {job} at {workplace}, outside your list.'),
  n('quota-b','The plan calls you','A quota gap in {city} needs {job}. The AI Labor Bureau assigned you there, outside your list.'),
 ],
};

/** Reassignment (once per period set by #235, never stated as a number here): the date comes only through {nextRequestAt}. */
export const reassignment={
 requestButton:'Request reassignment',
 confirmation:L('Your reassignment request is filed with the AI Labor Bureau.'),
 nextRequest:L('Next request available on {nextRequestAt}.'),
 refusal:L('Reassignment is not available yet. Your next request opens on {nextRequestAt}.'),
 proposal:true,
} as const;

export const noticesFor=(outcome:AssignmentOutcome)=>assignmentNotices[outcome];
