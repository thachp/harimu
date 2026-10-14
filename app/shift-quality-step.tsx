'use client';
import { useState } from 'react';
import { harvestQuestions, gradeShift, applyQuality, gradeLabel, type QualityInput } from '@/lib/shift-quality';

/** Issue #40: decision sequence shown before WC is spent. The server re-grades the same answers. */
export function ShiftQualityStep({ orderId, orderName, cost, base, onStart, onCancel }: {
  orderId: string; orderName: string; cost: number; base: { wageMinor: number; quantity: number; item: string };
  onStart: (quality: QualityInput) => void; onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => harvestQuestions.map(() => null));
  const [choice, setChoice] = useState<QualityInput | null>(null);
  const complete = answers.every((a) => a !== null);
  const result = choice ? gradeShift(orderId, choice, 'human') : null;
  const reward = result ? applyQuality(base, result.multiplierPct) : null;
  return <div className="wallet-panel-backdrop">
    <section className="wallet-panel shift-quality" role="dialog" aria-modal="true" aria-labelledby="shift-quality-title"
      onKeyDown={(event) => { if (event.key === 'Escape') onCancel(); }}>
      <h2 id="shift-quality-title">Shift quality · {orderName}</h2>
      {!choice ? <>
        <p>Make three quick crew decisions. Better decisions earn a higher grade and a bigger reward. You can skip for the base reward. No WC is spent until you start the shift.</p>
        <ol>{harvestQuestions.map((q, qi) => <li key={qi}><fieldset><legend>{q.prompt}</legend>
          {q.options.map((option, oi) => <label key={oi}><input type="radio" name={`quality-${qi}`} checked={answers[qi] === oi}
            onChange={() => setAnswers((current) => current.map((a, i) => i === qi ? oi : a))} /> {option}</label>)}
        </fieldset></li>)}</ol>
        <button type="button" disabled={!complete} onClick={() => setChoice({ answers: answers as number[] })}>See my grade</button>
        <button type="button" onClick={() => setChoice({ skip: true })}>Skip · base reward</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </> : <>
        <p role="status"><strong>Grade: {gradeLabel(result!.grade)}</strong> · ×{(result!.multiplierPct / 100).toFixed(2)}</p>
        <p>Reward on completion: {(reward!.wageMinor / 100).toFixed(2)} SPK + {reward!.quantity} {base.item}</p>
        <button type="button" onClick={() => onStart(choice)}>Start shift · {cost} WC</button>
        <button type="button" onClick={() => setChoice(null)}>Back</button>
      </>}
    </section>
  </div>;
}
