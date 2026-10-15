// Issue #40: a light quality step before a shift starts. One Kindle job (the savanna harvest) has a
// three-question decision sequence; the number of good decisions sets a grade and a reward multiplier.
// Client-safe module: questions and grade table only. The answer key and grading live in the server-only
// lib/shift-quality-key.ts (QA1 #125 review): the server grades exactly once at commit-work, and the grade is
// revealed only once the shift is complete.
export const qualityWorkOrderId = 'harvest';

export type QualityGrade = 'poor' | 'fair' | 'good' | 'excellent';
export type QualityQuestion = { prompt: string; options: readonly string[] };

export const harvestQuestions: readonly QualityQuestion[] = [
  { prompt: 'Dawn crew briefing: which rows do you harvest first?', options: ['Whatever is closest to the gate', 'The ripest rows before the midday heat', 'The rows the last crew skipped'] },
  { prompt: 'A cart axle is cracked. What do you do?', options: ['Load it fully and hope', 'Split the load across two carts', 'Stop the whole crew until a repair team arrives'] },
  { prompt: 'Grain is damp at the scales. How do you record it?', options: ['Weigh it as is', 'Discard it', 'Set it to dry and weigh it at the end of the shift'] },
];

/** Grade table. Poor equals the base reward, so playing never pays less than skipping. */
export const qualityGrades: Record<QualityGrade, { label: string; multiplierPct: number }> = {
  poor: { label: 'Poor', multiplierPct: 100 },
  fair: { label: 'Fair', multiplierPct: 110 },
  good: { label: 'Good', multiplierPct: 125 },
  excellent: { label: 'Excellent', multiplierPct: 150 },
};
export const gradeByScore: readonly QualityGrade[] = ['poor', 'fair', 'good', 'excellent'];

/** What the step component returns; the page adds the server-issued ticket (#252). */
export type QualityChoice = { answers: number[] } | { skip: true };
/** commit-work body: answers are indices into the per-shift option order the ticket was issued with. */
export type QualityInput = { answers: number[]; ticket: string } | { skip: true };
/** Server-issued step for one future shift: a signed ticket and the questions in that shift's option order. */
export type QualityTicket = { ticket: string; questions: QualityQuestion[] };
export type QualityResult = { grade: QualityGrade | null; multiplierPct: number; correct: number | null };

export function validQualityInput(value: unknown): value is QualityInput {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.skip === true) return Object.keys(v).length === 1;
  return Array.isArray(v.answers) && typeof v.ticket === 'string' && v.ticket.length <= 128 && Object.keys(v).length === 2 && v.answers.length === harvestQuestions.length
    && v.answers.every((a, i) => Number.isInteger(a) && a >= 0 && a < harvestQuestions[i].options.length);
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
