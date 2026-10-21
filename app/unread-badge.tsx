/** #682 follow-up: the bell's visible unread count. Counts over 99 show "99+" so the badge never clips at 150% text; the accessible label keeps the exact count. */
export const unreadBadgeText = (unread: number): string => unread > 99 ? '99+' : String(Math.max(0, Math.trunc(unread) || 0));
export function UnreadBadge({ unread }: { unread: number }) {
  return <strong>{unreadBadgeText(unread)}</strong>;
}
