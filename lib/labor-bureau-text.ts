// Korund Labor Bureau copy wiring (#235). Strings are Content's #329 / issue #321 (lib/labor-bureau-copy.ts), in their exact
// wording; this module only maps them onto the panel and fills the pre-formatted placeholders ({job}, {workplace}, {city},
// {nextRequestAt}, each within LABOR_BUREAU_NAME_MAX). Lines #329 does not have stay here, marked [not in #329].
import { preferenceForm, assignmentNotices, reassignment } from './labor-bureau-copy';
import type { BureauOutcome, BureauReason } from './labor-bureau-rules';

export const bureauText = {
  header: preferenceForm.header,
  explainer: preferenceForm.explainer[0].text,
  slotLabels: preferenceForm.slotLabels,
  fileButton: preferenceForm.submitButton,
  filed: preferenceForm.confirmation.text,
  reassignButton: reassignment.requestButton,
  nextRequest: reassignment.nextRequest.text,
  refusal: reassignment.refusal.text,
  // [not in #329] The first assignment is a separate request from filing preferences in this build; see the PR's open questions.
  requestButton: 'Request assignment',
  noPreferences: 'File three preferences first.',
} as const;

/** Where each post is and the Korund city the notices name ("at {workplace}", "in {city}"). Pre-formatted, within the 24-character cap. */
export const workplaceFor: Readonly<Record<string, string>> = {
  'korund-food-production': 'the State Granary',
  'korund-quarry-gang': 'Stonehearth Quarry',
  'korund-foundry-hand': 'the Plan Foundry',
  'korund-rail-crew': 'the Rail Depot',
  'korund-plan-clerk': 'the Plan Archive',
};
export const bureauCity = 'Stonehearth';

export const fillText = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k) => values[k] ?? m);

/** Notice for an assignment: #329's first variant for the outcome, headline and body. */
export function outcomeNotice(outcome: BureauOutcome, job: { id: string; name: string }): { headline: string; body: string } {
  const notice = assignmentNotices[outcome][0];
  const values = { job: job.name, workplace: workplaceFor[job.id] ?? bureauCity, city: bureauCity };
  return { headline: fillText(notice.headline, values), body: fillText(notice.body, values) };
}

// [not in #329] #329's bodies carry one bounded reason each; the panel also lists the reasons the rule actually used.
export const reasonText: Record<BureauReason, string> = {
  'listed-first': 'Listed as your first choice',
  'listed-lower': 'Listed on your preferences',
  'not-listed': 'Not on your list, but the plan needs the post filled',
  'skills-meet': 'Your shift experience meets the post',
  'standing-good': 'Your Standing is good',
  'open-seats': 'The plan has open seats',
  fallback: 'No other post was open: the state brigade takes you',
};
