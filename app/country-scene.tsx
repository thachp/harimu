'use client';
import { useState } from 'react';
import { citiesForNation, cityForNation } from '../lib/cities';
import styles from './country-scene.module.css';

export function CountryScene({ nationId, currentCityId, homeCityId, onTravel, pending = false, presence, travelEnabled = true, preview = false }: {
  nationId: string; currentCityId: string | null; homeCityId: string | null;
  onTravel: (cityId: string) => void; pending?: boolean;
  travelEnabled?: boolean; preview?: boolean;
  presence?: readonly { cityId: string; present: number }[];
}) {
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const cities = citiesForNation(nationId);
  const destination = destinationId ? cityForNation(nationId, destinationId) : undefined;
  const current = currentCityId ? cityForNation(nationId, currentCityId) : undefined;
  const home = homeCityId ? cityForNation(nationId, homeCityId) : undefined;
  const pins = [{x:50,y:32},{x:26,y:76},{x:76,y:76}];
  return <section className={styles.country} aria-labelledby="country-scene-title">
    <h2 id="country-scene-title">Country map</h2>
    <p>{preview ? 'Sample visit · no citizen changes. ' : ''}Free, instant travel within this nation · home city unchanged.</p>
    <p>Current city: <strong>{current?.name ?? 'Not yet set'}</strong> · Home city: <strong>{home?.name ?? 'Not yet set'}</strong></p>
    <div className={styles.map} aria-label="Illustrative country map">
      <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M14 20 38 9 62 15 88 30 83 58 92 77 68 90 45 82 23 89 9 62 18 42Z"/><path className={styles.routes} d="M26 64 50 40 76 64"/></svg>
      {cities.map((city, index) => {
        const count = presence?.find(entry => entry.cityId === city.id)?.present;
        const knownCount = Number.isInteger(count) && count! >= 0;
        return <button type="button" key={city.id} className={styles.pin}
        style={{left:`${pins[index].x}%`,top:`${pins[index].y}%`}} aria-pressed={destination?.id === city.id}
        onClick={() => setDestinationId(city.id)} disabled={pending}>
        <span>{city.name}</span><small>{[city.capital ? 'Capital' : '',city.id === currentCityId ? 'Current' : '',city.id === homeCityId ? 'Home' : ''].filter(Boolean).join(' · ')}</small>
        <small>{knownCount ? `${count} sharing presence` : 'Online count unavailable'}</small>
      </button>; })}
    </div>
    <small>Static lore and illustrative geography · jobs and markets are shared. Presence is opt-in (90-second expiry, refreshed every 15 seconds, may include you).</small>
    {destination && <section className={styles.destination} aria-label="Travel destination" aria-live="polite">
      <h3>{destination.name}</h3><p>{destination.description}</p>
      {destination.id === currentCityId ? <p>You are already in this city.</p> : <><p>Travel confirmation: 0 cost · instant arrival · home city unchanged.</p>
        <button type="button" disabled={pending || !travelEnabled} onClick={() => onTravel(destination.id)}>{pending ? 'Travelling…' : `Travel to ${destination.name}`}</button></>}
      <button type="button" disabled={pending} onClick={() => setDestinationId(null)}>Cancel</button>
    </section>}
    {!travelEnabled && <p>Travel requires your citizen’s own nation and a loaded city account.</p>}
    {!cities.length && <p>City travel is unavailable for this nation.</p>}
  </section>;
}
