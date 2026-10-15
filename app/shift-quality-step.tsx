'use client';
import { useRef, useState } from 'react';
import type { QualityChoice, QualityQuestion } from '@/lib/shift-quality';

/**
 * Issue #40: decision sequence shown before WC is spent. The client never sees the answer key and never grades:
 * the server grades once when the shift starts and reveals the grade on completion (QA1 #125 review).
 */
export function ShiftQualityStep({ orderName, cost, base, questions, onStart, onCancel }: {
  orderName: string; cost: number; base: { wageMinor: number; quantity: number; item: string };
  /** #252: this shift's questions in the server-seeded option order. */
  questions: readonly QualityQuestion[];
  onStart: (quality: QualityChoice) => void; onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null));
  const [sent, setSent] = useState(false);
  const lock = useRef(false); // synchronous guard: a double click before re-render still submits once
  const complete = answers.every((a) => a !== null);
  const start = (quality: QualityChoice) => { if (lock.current) return; lock.current = true; setSent(true); onStart(quality); };
  return <div className="wallet-panel-backdrop">
    <section className="wallet-panel shift-quality" role="dialog" aria-modal="true" aria-labelledby="shift-quality-title"
      onKeyDown={(event) => { if (event.key === 'Escape' && !sent) onCancel(); }}>
      <h2 id="shift-quality-title">Shift quality · {orderName}</h2>
      <p className="shift-quality-intro">Make three quick crew decisions. Better decisions earn a higher grade and a bigger reward, up to ×1.50. Your answers are final once the shift starts, and the grade is revealed when the shift completes. Skip for the base reward ({(base.wageMinor / 100).toFixed(2)} SPK + {base.quantity} {base.item}).</p>
      <ol className="shift-quality-questions">{questions.map((q, qi) => <li key={qi}><fieldset><legend>{q.prompt}</legend>
        {q.options.map((option, oi) => <label key={oi} className={answers[qi] === oi ? 'is-selected' : undefined}><input type="radio" name={`quality-${qi}`} checked={answers[qi] === oi} disabled={sent}
          onChange={() => setAnswers((current) => current.map((a, i) => i === qi ? oi : a))} /> {option}</label>)}
      </fieldset></li>)}</ol>
      <div className="shift-quality-actions">
      <button type="button" className="shift-quality-start" disabled={!complete || sent} onClick={() => start({ answers: answers as number[] })}>Start shift · {cost} WC</button>
      <button type="button" className="shift-quality-skip" disabled={sent} onClick={() => start({ skip: true })}>Skip · base reward · {cost} WC</button>
      <button type="button" className="shift-quality-cancel" disabled={sent} onClick={onCancel}>Cancel</button>
      </div>
    </section>
  </div>;
}
