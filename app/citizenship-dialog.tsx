'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import styles from './citizenship-dialog.module.css';

type CitizenshipNation = { id: string; name: string; government: string; economy: string; currency: string; color: string };
export type CitizenshipDialogProps = {
  nation: CitizenshipNation;
  reviewStorageKey?: string;
  currentNationName?: string;
  expectedNationId: string | null;
  session: 'loading' | 'anonymous' | 'ready' | 'error';
  pending: boolean;
  error: string | null;
  signInControl: ReactNode;
  onRetrySession: () => void;
  onConfirm: () => void;
  onClose: () => void;
};

const buttonStyle = { minHeight: 44, whiteSpace: 'normal' } as const;
const focusableSelector = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

export function CitizenshipDialog({ nation, reviewStorageKey, currentNationName, expectedNationId, session, pending, error, signInControl, onRetrySession, onConfirm, onClose }: CitizenshipDialogProps) {
  const dialog = useRef<HTMLElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [acceptedFor, setAcceptedFor] = useState<string | null>(null);
  const oathKey = `${expectedNationId ?? 'new'}:${nation.id}`;
  const [reviewedFor, setReviewedFor] = useState<string | null>(null);
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  const stepStorageKey = reviewStorageKey ? `${reviewStorageKey}:step:${oathKey}` : null;
  // Restore only this account and exact original nation-change intent. The oath
  // checkbox is deliberately never persisted: submission needs fresh consent.
  useEffect(() => {
    if (!stepStorageKey) return;
    let active = true;
    queueMicrotask(() => {
      try {
        if (active && window.sessionStorage.getItem(stepStorageKey) === 'oath') setRestoredKey(stepStorageKey);
      } catch { /* Review remains usable when browser storage is unavailable. */ }
    });
    return () => { active = false; };
  }, [stepStorageKey]);
  const atOath = reviewedFor === oathKey || (stepStorageKey !== null && restoredKey === stepStorageKey);
  const accepted = atOath && acceptedFor === oathKey;
  function reviewNation() {
    setReviewedFor(oathKey);
    if (stepStorageKey) {
      try { window.sessionStorage.setItem(stepStorageKey, 'oath'); } catch { /* Optional recovery only. */ }
    }
    title.current?.focus();
  }
  const backToReview = useCallback(() => {
    setReviewedFor(null); setRestoredKey(null); setAcceptedFor(null);
    if (stepStorageKey) {
      try { window.sessionStorage.removeItem(stepStorageKey); } catch { /* Optional recovery only. */ }
    }
    title.current?.focus();
  }, [stepStorageKey]);
  const cancelReview = useCallback(() => {
    backToReview(); onClose();
  }, [backToReview, onClose]);
  const changing = expectedNationId !== null && expectedNationId !== nation.id;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    title.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      // Clerk renders its dialogs in portals outside this modal. Its own focus
      // trap and Escape behavior must take precedence while authenticating.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('.cl-modalContent,.cl-userButtonPopoverCard') || document.querySelector('.cl-modalContent')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!pending) cancelReview();
        return;
      }
      if (event.key !== 'Tab' || !dialog.current) return;
      const elements = [...dialog.current.querySelectorAll<HTMLElement>(focusableSelector)].filter(element => element.getClientRects().length > 0);
      if (!elements.length) { event.preventDefault(); title.current?.focus(); return; }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !elements.includes(active as HTMLElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (active === last || !elements.includes(active as HTMLElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey, true);
    return () => document.removeEventListener('keydown', handleKey, true);
  }, [pending, cancelReview]);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (!pending && event.target === event.currentTarget) cancelReview(); }}>
    <section ref={dialog} className="enrollment-dialog" role="dialog" aria-modal="true" aria-labelledby="enrollment-title" aria-describedby="enrollment-rule" aria-busy={pending} style={{ '--selected': nation.color } as CSSProperties}>
      <span className="eyebrow">{atOath ? 'Step 2 of 2 · Oath of citizenship' : 'Step 1 of 2 · Review your nation'}</span>
      <h2 ref={title} id="enrollment-title" tabIndex={-1}>{atOath ? (changing ? `Move to ${nation.name}?` : `Join ${nation.name}?`) : `Review ${nation.name}`}</h2>
      <p id="enrollment-rule">{changing
        ? `Moving from ${currentNationName ?? 'your current nation'} uses your one free change, available within 48 real hours before any political action. Existing balances stay in their original currencies; they are not converted.`
        : 'You may change nation once within your first 48 real hours, before any political action.'} After {changing ? 'this change' : 'the grace period or your first political action'}, your citizenship is locked. Further immigration is not implemented.</p>
      <p className="enrollment-disclosure">Government offices are AI/SI controlled; this release uses deterministic simulation.</p>
      <dl><div><dt>Government</dt><dd>{nation.government}</dd></div><div><dt>Economy</dt><dd>{nation.economy}</dd></div><div><dt>Currency</dt><dd>{nation.currency}</dd></div></dl>
      {atOath && (session === 'anonymous' ? <div className={`enrollment-session ${styles.session}`}><p>Sign in to record your citizenship. Your nation choice stays here for review.</p>{signInControl}</div>
        : session === 'loading' ? <p role="status">Loading your citizen account…</p>
          : session === 'error' ? <div className="enrollment-session"><p role="alert">Your citizen account could not be loaded.</p><button type="button" style={buttonStyle} onClick={onRetrySession}>Retry loading citizen</button></div>
            : <label className="enrollment-oath" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: '16px 0', minHeight: 44 }}><input type="checkbox" checked={accepted} disabled={pending} onChange={event => setAcceptedFor(event.target.checked ? oathKey : null)} /><span>I choose {nation.name} and understand the citizenship rules above.</span></label>)}
      {error && <p className="enrollment-error" role="alert">{error}</p>}
      <div className="dialog-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
        <button className="secondary-action" type="button" style={{ ...buttonStyle, flex: '1 1 140px' }} disabled={pending} onClick={cancelReview}>Keep exploring</button>
        {!atOath && <button className="primary-action" type="button" style={{ ...buttonStyle, flex: '1 1 140px' }} disabled={pending} onClick={reviewNation}>Continue to oath</button>}
        {atOath && <button className="secondary-action" type="button" style={buttonStyle} disabled={pending} onClick={backToReview}>Back to review</button>}
        {atOath && session === 'ready' && <button className="primary-action" type="button" style={{ ...buttonStyle, flex: '1 1 140px' }} disabled={pending || !accepted} onClick={onConfirm}>{pending ? 'Recording citizenship…' : changing ? 'Use my one change' : 'Confirm citizenship'}</button>}
      </div>
    </section>
  </div>;
}

export default CitizenshipDialog;
