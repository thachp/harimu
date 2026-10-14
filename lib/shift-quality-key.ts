// Server-only (#40, QA1 review on #125): the answer key and grading. Never import this from app/ client components;
// tests/shift-quality.test.mjs checks that no client module or API payload carries it.
// Type-only import keeps this file loadable without a bundler; the grade table below mirrors lib/shift-quality.ts
// (tests/shift-quality.test.mjs asserts they agree).
import type { QualityGrade, QualityInput, QualityResult } from './shift-quality';
const qualityWorkOrderId = 'harvest';
const gradeByScore: readonly QualityGrade[] = ['poor', 'fair', 'good', 'excellent'];
const multiplierPct: Record<QualityGrade, number> = { poor: 100, fair: 110, good: 125, excellent: 150 };

/** Index of the best option for each harvest question, in question order. */
const harvestAnswerKey: readonly number[] = [1, 1, 2];

/**
 * Grade a quality step once, at commit-work. Only signed-in human citizens playing the quality job get a bonus;
 * skipping, other jobs and any AI/background actor always receive the base (100%) reward.
 */
export function gradeShift(workOrderId: string, input: QualityInput | undefined, actor: 'human' | 'ai'): QualityResult {
  if (actor !== 'human' || workOrderId !== qualityWorkOrderId || !input || 'skip' in input) return { grade: null, multiplierPct: 100, correct: null };
  const correct = input.answers.filter((a, i) => a === harvestAnswerKey[i]).length;
  const grade = gradeByScore[correct];
  return { grade, multiplierPct: multiplierPct[grade], correct };
}
