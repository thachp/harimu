'use client';
/** #781: "Make this my home city" for the city you are standing in. Renders nothing while HARIMU_HOME_CITY_MOVE_ENABLED is off (the route 404s). */
import { useEffect, useState } from 'react';
import { cityForNation } from '@/lib/cities';
type HomeInfo = { homeCityId: string; feeMinor: number; currency: string | null; nextMoveAt: number | null };
const refusals: Record<string, string> = {
  cooldown: 'You moved recently. Your next move opens on the date shown.',
  funds: 'Not enough money in your wallet to pay the moving fee.',
  not_your_nation: 'You can only move within your own nation.',
  already_home: 'This is already your home city.',
  not_open_yet: 'Home moves are not open in your nation yet.',
};
const money = (minor: number, currency: string) => `${(minor / 100).toFixed(2)} ${currency}`;
const day = (s: number) => new Date(s * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
export function HomeMoveCard({ nationId, currentCityId, homeCityId }: { nationId: string; currentCityId: string | null; homeCityId: string | null }) {
  const [info, setInfo] = useState<HomeInfo | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch('/api/city/home', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(d => { if (live) setInfo(d as HomeInfo | null); }).catch(() => undefined);
    return () => { live = false; };
  }, [nationId, homeCityId]);
  const city = currentCityId ? cityForNation(nationId, currentCityId) : undefined;
  const home = info?.homeCityId ?? homeCityId;
  if (!info || !info.currency || !city || city.id === home) return null;
  const now = Date.now() / 1000;
  const waiting = info.nextMoveAt !== null && now < info.nextMoveAt;
  async function move() {
    if (!city) return;
    setPending(true); setNote(null);
    try {
      const res = await fetch('/api/city/home', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cityId: city.id, requestId: crypto.randomUUID() }) });
      const data = (await res.json().catch(() => ({}))) as { homeCityId: string; feeMinor: number; nextMoveAt: number; reason?: string };
      if (res.ok) { setInfo({ homeCityId: data.homeCityId, feeMinor: data.feeMinor, currency: info!.currency, nextMoveAt: data.nextMoveAt }); setNote(`${city.name} is now your home city.`); }
      else { setNote(refusals[data.reason ?? ''] ?? 'The move could not be completed.'); if (data.nextMoveAt) setInfo({ ...info!, nextMoveAt: data.nextMoveAt }); }
    } finally { setPending(false); }
  }
  return <section className="home-move-card" aria-label="Home city">
    <p>Moving fee: {money(info.feeMinor, info.currency)}. After a move you can move again in 7 days.</p>
    {waiting && info.nextMoveAt !== null ? <p>Next move available {day(info.nextMoveAt)}.</p> : null}
    <button type="button" disabled={pending || waiting} onClick={() => void move()}>Make this my home city</button>
    {note ? <p role="status">{note}</p> : null}
  </section>;
}
