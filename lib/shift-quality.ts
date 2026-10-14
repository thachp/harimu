// Issue #40: a light quality step before a shift starts. One Kindle job (the savanna harvest) has a
// three-question decision sequence; the number of good decisions sets a grade and a reward multiplier.
// The server grades the submitted answers itself and snapshots grade + multiplier with the shift.
export const qualityWorkOrderId = 'harvest';

export type QualityGrade = 'poor' | 'fair' | 'good' | 'excellent';
export type QualityQuestion = { prompt: string; options: readonly string[]; best: number };

export const harvestQuestions: readonly QualityQuestion[] = [
  { prompt: 'Dawn crew briefing: which rows do you harvest first?', options: ['Whatever is closest to the gate', 'The ripest rows before the midday heat', 'The rows the last crew skipped'], best: 1 },
  { prompt: 'A cart axle is cracked. What do you do?', options: ['Load it fully and hope', 'Split the load across two carts', 'Stop the whole crew until a repair team arrives'], best: 1 },
  { prompt: 'Grain is damp at the scales. How do you record it?', options: ['Weigh it as is', 'Discard it', 'Set it to dry and weigh it at the end of the shift'], best: 2 },
];

/** Grade table. Poor equals the base reward, so playing never pays less than skipping. */
export const qualityGrades: Record<QualityGrade, { label: string; multiplierPct: number }> = {
  poor: { label: 'Poor', multiplierPct: 100 },
  fair: { label: 'Fair', multiplierPct: 110 },
  good: { label: 'Good', multiplierPct: 125 },
  excellent: { label: 'Excellent', multiplierPct: 150 },
};
const byScore: QualityGrade[] = ['poor', 'fair', 'good', 'excellent'];

export type QualityInput = { answers: number[] } | { skip: true };
export type QualityResult = { grade: QualityGrade | null; multiplierPct: number; correct: number | null };

export function validQualityInput(value: unknown): value is QualityInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.skip === true) return Object.keys(v).length === 1;
  return Array.isArray(v.answers) && Object.keys(v).length === 1 && v.answers.length === harvestQuestions.length
    && v.answers.every((a, i) => Number.isInteger(a) && a >= 0 && a < harvestQuestions[i].options.length);
}

/**
 * Grade a quality step. Only signed-in human citizens playing the quality job get a bonus;
 * skipping, other jobs and any AI/background actor always receive the base (100%) reward.
 */
export function gradeShift(workOrderId: string, input: QualityInput | undefined, actor: 'human' | 'ai'): QualityResult {
  if (actor !== 'human' || workOrderId !== qualityWorkOrderId || !input || 'skip' in input) return { grade: null, multiplierPct: 100, correct: null };
  const correct = input.answers.filter((a, i) => a === harvestQuestions[i].best).length;
  const grade = byScore[correct];
  return { grade, multiplierPct: qualityGrades[grade].multiplierPct, correct };
}

/** Apply a multiplier to the snapshotted reward; rounds down so a bonus never overpays. */
export function applyQuality(reward: { wageMinor: number; quantity: number }, multiplierPct: number) {
  return { wageMinor: Math.floor(reward.wageMinor * multiplierPct / 100), quantity: Math.floor(reward.quantity * multiplierPct / 100) };
}

export function gradeLabel(grade: QualityGrade | null | undefined) { return grade ? qualityGrades[grade].label : 'Base (step skipped)'; }

export const shiftQualitySchema = `CREATE TABLE IF NOT EXISTS shift_quality (
  shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id),
  grade TEXT CHECK(grade IS NULL OR grade IN ('poor','fair','good','excellent')),
  multiplier_pct INTEGER NOT NULL CHECK(multiplier_pct IN (100,110,125,150)),
  correct INTEGER CHECK(correct IS NULL OR correct BETWEEN 0 AND 3)
)`;
