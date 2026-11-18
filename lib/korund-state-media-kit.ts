/** #1469: Korund State Media article kit (docs §18.2). proposal:true copy, ledger placeholders only (#1367). */
import { PRESS_HEADLINE_MAX, PRESS_PARAGRAPH_MAX } from './press-templates.ts';

export const KORUND_STATE_MEDIA_PLACEHOLDERS = ['{output_pct}', '{city}', '{brigade}'] as const;
export type StateMediaEntry = { id: string; headline: string; paragraphs: readonly [string] | readonly [string, string]; proposal: true };

const e = (id: string, headline: string, paragraphs: StateMediaEntry['paragraphs']): StateMediaEntry => ({ id, headline, paragraphs, proposal: true });

export const korundStateMediaKit: readonly StateMediaEntry[] = [
  e('ksm-output', 'Plan output: {output_pct}', ['The brigades report output at {output_pct} of plan.']),
  e('ksm-city', 'The plan in {city}', ['{city} advances the plan, shift by shift.']),
  e('ksm-brigade', 'Brigade {brigade} reports', ['Brigade {brigade} meets the work. Output stands at {output_pct} of plan.']),
  e('ksm-city-output', 'Word from {city}: {output_pct}', ['{city} records output at {output_pct} of plan.']),
  e('ksm-brigade-city', 'Brigades of {city}', ['In {city}, brigade {brigade} keeps to the plan.']),
  e('ksm-quota', 'Quota report: {output_pct}', ['A quota report records output at {output_pct}. Brigade {brigade} stands ready.']),
  e('ksm-holds', '{city} holds the line', ['{city} holds the line. The brigades go on.']),
];

export const korundStateMediaEntry = (id: unknown) => typeof id === 'string' ? korundStateMediaKit.find(entry => entry.id === id) : undefined;
export const kitTextFits = (entry: StateMediaEntry) =>
  entry.headline.length <= PRESS_HEADLINE_MAX && entry.paragraphs.every(p => p.length <= PRESS_PARAGRAPH_MAX);
