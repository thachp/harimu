'use client';
// #620: small read-only siege panel on the government view while HARIMU_WAR_ENABLED is on (the server sends `simulation.sieges` only then; flag off renders nothing).
// Shows the sieges against and by the viewer's nation: city, assault days counted, when the next assault could count, captured or not. Lines come from the siege copy module (lib/siege-copy.ts).
import { useDisplayTimestamp } from './display-preferences';
import { nationMark } from '../lib/nation-themes';
import { siegeRules, siegeStrip } from '../lib/siege-copy';

export type SiegeItem = { id: string; cityKey: string; cityKind: 'outpost' | 'founded'; cityName: string | null; attacker: string; defender: string; days: number; needed: number; capturedAt: number | null; nextWindowAt: number | null };
const nationName = (id: string) => nationMark(id)?.name ?? id;
const cityLabel = (s: SiegeItem) => s.cityKind === 'outpost' ? `${nationName(s.cityKey.slice('outpost:'.length))} outpost` : s.cityName ?? 'A founded city';
export function SiegePanel({ sieges, nationId }: { sieges?: SiegeItem[] | null; nationId: string }) {
  const formatTime = useDisplayTimestamp();
  const mine = (sieges ?? []).filter(s => s.attacker === nationId || s.defender === nationId);
  if (!mine.length) return null;
  return <section className="siege-panel" aria-label="Sieges">
    <h4>Sieges</h4>
    <ul>{mine.map(s => <li key={s.id}>
      <strong>{cityLabel(s)}</strong> · {s.attacker === nationId ? `Your nation is besieging ${nationName(s.defender)}` : `${nationName(s.attacker)} is besieging your nation`}
      <p>{siegeStrip.caption.text.replace('{city}', cityLabel(s)).replace('{n}', String(s.days))}</p>
      <p>{s.capturedAt !== null ? `Captured ${formatTime(s.capturedAt * 1000)}.` : s.nextWindowAt !== null ? `Next assault that counts: ${formatTime(s.nextWindowAt * 1000)}.` : 'Not captured.'}</p>
    </li>)}</ul>
    <small>{siegeRules.lines[0].text}</small>
  </section>;
}
