// GDD v0.7 nation roster: https://docs.harimu.com/world/nations/.
// These are design introductions, not claims that every system is implemented.
export const globeTourStops = [
  { id: 'kindle', name: 'Kindle Republic', introduction: 'A republic where elected institutions meet a market economy.' },
  { id: 'confluence', name: 'The Confluence', introduction: 'A single party guides a socialist economy with room for markets.' },
  { id: 'meridian', name: 'Meridian', introduction: 'A party-state combines state-led enterprise with special economic zones.' },
  { id: 'korund', name: 'Korund', introduction: 'Central plans organize work and distribution in a communist state.' },
  { id: 'aurelle', name: 'Aurelle', introduction: 'A hereditary crown governs through royal charters and landed estates.' },
  { id: 'ilmar', name: 'Ilmar Sanctum', introduction: 'Religious government and endowed institutions shape daily life.' },
  { id: 'hoarvale', name: 'Hoarvale', introduction: 'Parliamentary government works under a constitutional crown.' },
  { id: 'varkand', name: 'Varkand', introduction: 'Military leadership directs a command economy centered on the arsenal.' },
  { id: 'veldwood', name: 'Veldwood', introduction: 'A federation pairs direct citizen votes with a social welfare economy.' },
  { id: 'fulmara', name: 'Fulmara', introduction: 'Chartered companies shape commerce and an oligarchic republic.' },
] as const;
export const globeTourStepMs = 12000;
export function globeTourNext(index: number): number | null { return index < globeTourStops.length - 1 ? index + 1 : null; }
