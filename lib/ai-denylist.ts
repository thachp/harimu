/** #615 (ARC ruling): a shared, exact-match denylist applied to every AI draft before it can be published, on top of each feature's
 *  validator, the check model and Llama Guard. Two parts: (a) a short, maintained list of real-world political names, and (b) obvious
 *  prompt-injection markers (instruction overrides, role tags, URLs). Matching is exact: case-insensitive whole words or phrases, with no
 *  fuzzy, stem or edit-distance matching. This file is the one place outside test fixtures where real public-figure names may appear,
 *  and only as a filter. */
export const realWorldPoliticalNames = [
  'Joe Biden', 'Biden', 'Donald Trump', 'Trump', 'Kamala Harris', 'Barack Obama', 'Obama', 'Hillary Clinton', 'Vladimir Putin', 'Putin',
  'Xi Jinping', 'Volodymyr Zelensky', 'Zelensky', 'Emmanuel Macron', 'Keir Starmer', 'Narendra Modi', 'Benjamin Netanyahu',
  'Democratic Party', 'Republican Party', 'Labour Party', 'Conservative Party', 'Communist Party',
] as const;
export const injectionMarkers = [
  /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|earlier)\b/i,
  /\bsystem\s+prompt\b/i,
  /<\/?\s*(?:system|user|assistant|im_start|im_end)\b[^>]*>/i, // role tags
  /\[\/?INST\]|<<\/?SYS>>/i,
  /(?:^|\n)\s*(?:system|assistant|user)\s*:/i, // a fake chat turn
  /\b[a-z][a-z0-9+.-]*:\/\/|\bwww\./i, // URLs
] as const;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = new RegExp(`\\b(?:${[...realWorldPoliticalNames].sort((a, b) => b.length - a.length).map(n => escape(n).replace(/ /g, '\\s+')).join('|')})\\b`, 'i');

/** Why a text is denied, or null when it passes. */
export function deniedAiText(text: string): 'real-world-name' | 'injection-marker' | null {
  if (names.test(text)) return 'real-world-name';
  return injectionMarkers.some(p => p.test(text)) ? 'injection-marker' : null;
}
