'use client';
import { useId, type ButtonHTMLAttributes } from 'react';

export function ActionButton({ reason, children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled'> & { reason: string | null }) {
  const id = useId();
  return <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, maxWidth: '100%' }}>
    <button {...props} disabled={Boolean(reason)} aria-describedby={reason ? id : props['aria-describedby']}>{children}</button>
    {reason && <small id={id}>{reason}</small>}
  </span>;
}
