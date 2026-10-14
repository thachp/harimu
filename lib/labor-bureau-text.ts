// Placeholder Labor Bureau copy (#235). Content's strings (#321 / PR #329, lib/labor-bureau-copy.ts) replace this file's
// exports when they land on dev: keep the same keys (outcome ids, {job}/{nextRequestAt} placeholders) so the swap is mechanical.
import type { BureauOutcome, BureauReason } from './labor-bureau-rules';
export const bureauText = {
  header: 'Labor Bureau · job preferences',
  explainer: "List three jobs in order. The AI Labor Bureau weighs your skills, Standing and the plan's quota gaps, then assigns your job.",
  slotLabels: ['First choice', 'Second choice', 'Third choice'],
  fileButton: 'File preferences',
  filed: 'Your preferences are filed.',
  requestButton: 'Request assignment',
  reassignButton: 'Request reassignment',
  nextRequest: 'Next request available on {nextRequestAt}.',
  refusal: 'Reassignment is not available yet. Your next request opens on {nextRequestAt}.',
  noPreferences: 'File three preferences first.',
} as const;
export const outcomeText: Record<BureauOutcome, string> = {
  'first-choice': 'The AI Labor Bureau assigned you {job}, your first choice.',
  'lower-choice': 'The AI Labor Bureau assigned you {job}, from your list.',
  'quota-posting': 'The AI Labor Bureau assigned you {job}, a posting outside your list, to close a quota gap.',
};
export const reasonText: Record<BureauReason, string> = {
  'listed-first': 'Listed as your first choice',
  'listed-lower': 'Listed on your preferences',
  'not-listed': 'Not on your list, but the plan needs the post filled',
  'skills-meet': 'Your shift experience meets the post',
  'standing-good': 'Your Standing is good',
  'open-seats': 'The plan has open seats',
  fallback: 'No other post was open: the state brigade takes you',
};
export const fillText = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k) => values[k] ?? m);
