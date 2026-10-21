/** #688 follow-up: the "Kindle only" trading note under the market panel. Hidden for Confluence citizens, who have their own read-only price board (#487). */
export function KindleTradingNote({ nationId, available }: { nationId: string; available: boolean | undefined }) {
  if (available || nationId === 'confluence') return null;
  return <p>Trading is currently supported in Kindle. Other nation markets are planned.</p>;
}
