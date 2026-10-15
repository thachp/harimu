'use client';
import type { PublicTreaty } from '@/lib/diplomacy';
import type { PublicEmbargo } from '@/lib/embargo';
import { foreignAffairsPanel, treatyKinds as treatyKindCopy, treatyStatusLines } from '@/lib/diplomacy-copy';
import { embargoPress, embargoPrivate } from '@/lib/embargo-copy'; // #363
import { isTreatyNation, treatyKindNames, treatyNationNames } from '@/lib/diplomacy-rules';
import { useDisplayTimestamp } from './display-preferences';

/** #308: public "Foreign affairs" list on the nation's government view (HARIMU_DIPLOMACY_ENABLED; the server sends no treaties while it is off, so nothing renders).
 *  Presentation only: shows this nation's treaties (in force, proposed, expired, broken) with their terms. Copy comes from lib/diplomacy-copy.ts (#313). Every negotiator and ratifier is an AI. */
export function ForeignAffairsPanel({ treaties, embargoes, nationId }: { treaties: PublicTreaty[] | undefined; embargoes?: PublicEmbargo[] | undefined; nationId: string }) {
  const formatTime = useDisplayTimestamp();
  if ((!treaties && !embargoes) || !isTreatyNation(nationId)) return null;
  const press = embargoPress.find(item => item.nationId === nationId);
  const embargoesMine = (embargoes ?? []).filter(item => item.status === 'in-force' && (item.actor === nationId || item.target === nationId));
  const mine = (treaties ?? []).filter(treaty => treaty.proposer === nationId || treaty.other === nationId);
  const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
  return <section aria-label="Foreign affairs">
    <h4>{foreignAffairsPanel.header}</h4>
    <p>{foreignAffairsPanel.aiNote.text}</p>
    {mine.length === 0 && embargoesMine.length === 0 ? <p>{foreignAffairsPanel.emptyState}</p> : <ul>{mine.map(treaty => {
      const other = treaty.proposer === nationId ? treaty.other : treaty.proposer;
      const values = { nationA: treatyNationNames[nationId], nationB: treatyNationNames[other], treaty: treatyKindNames[treaty.kind], endsAt: treaty.endsAt === null ? '' : formatTime(treaty.endsAt * 1000) };
      return <li key={treaty.id} aria-label={`${treatyKindNames[treaty.kind]} with ${values.nationB}`}>
        <strong>{fill(treatyStatusLines[treaty.status][0].text, values)}</strong> <span>{treatyKindCopy[treaty.kind].effect.text}</span>
      </li>;
    })}</ul>}
    {embargoesMine.length > 0 && <ul aria-label="Embargoes">{embargoesMine.map(item => {
      const ours = item.actor === nationId, values = { nation: treatyNationNames[item.target], actor: treatyNationNames[item.actor], target: treatyNationNames[item.target] };
      return <li key={item.id}>{ours ? fill(embargoPrivate.imposed.text, values) : fill(press?.report.imposed.text ?? '', values)}</li>;
    })}</ul>}
  </section>;
}
