/** Success notices belong to the view where they fired: leaving the view dismisses them for good,
 *  so a fallback or a return within the timeout cannot resurrect them. Errors persist until dismissed. */
export type NoticeScope = { view: string; notice?: string; kind: 'success' | 'error'; dismiss?: string };
export function scopeNotice(previous: NoticeScope, next: Omit<NoticeScope, 'dismiss'>): NoticeScope {
  if (previous.view === next.view && previous.notice === next.notice && previous.kind === next.kind) return previous;
  const dismiss = previous.view !== next.view && next.notice && next.kind === 'success' ? next.notice : undefined;
  return { ...next, dismiss };
}
