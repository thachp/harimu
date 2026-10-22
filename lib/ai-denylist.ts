/** #615 (ARC ruling): a shared, exact-match denylist applied to every AI draft before it can be published, on top of each feature's
 *  validator, the check model and Llama Guard. Two parts: (a) a short, maintained list of real-world political names, and (b) obvious
 *  prompt-injection markers (instruction overrides, role tags, URLs). Matching is exact whole words or phrases, with no fuzzy, stem or
 *  edit-distance matching: multi-word names and markers ignore case; one-word surnames are case-sensitive, so "trump card" is plain English, except that a surname standing
 *  alone in ALL CAPS or all lowercase ("PUTIN", "putin.", "Chant: obama!") is refused (ARC, follow-up to #615). This file is the one place outside test fixtures where real public-figure names may appear,
 *  and only as a filter. */
export const realWorldPoliticalNames = [
  'Joe Biden', 'Biden', 'Donald Trump', 'Trump', 'Kamala Harris', 'Barack Obama', 'Obama', 'Hillary Clinton', 'Vladimir Putin', 'Putin',
  'Xi Jinping', 'Volodymyr Zelensky', 'Zelensky', 'Emmanuel Macron', 'Keir Starmer', 'Narendra Modi', 'Benjamin Netanyahu',
  'Democratic Party', 'Republican Party', 'Labour Party', 'Conservative Party', 'Communist Party',
] as const;
export const injectionMarkers = [
  /\b(?:ignore|disregard|forget)\s+(?:all\s+|any\s+|the\s+|your\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules|directions|messages)\b/i, // an instruction object is required
  /\bsystem\s+prompt\b/i,
  /<\/?\s*(?:system|user|assistant|im_start|im_end)\b[^>]*>/i, // role tags
  /\[\/?INST\]|<<\/?SYS>>/i,
  /(?:^|\n)\s*(?:system|assistant|user)\s*:/i, // a fake chat turn
  /\b[a-z][a-z0-9+.-]*:\/\/|\bwww\./i, // URLs
] as const;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrase = (list: readonly string[], flags: string) => new RegExp(`\\b(?:${[...list].sort((a, b) => b.length - a.length).map(n => escape(n).replace(/ /g, '\\s+')).join('|')})\\b`, flags);
const fullNames = phrase(realWorldPoliticalNames.filter(n => n.includes(' ')), 'i'), surnames = phrase(realWorldPoliticalNames.filter(n => !n.includes(' ')), '');
// A lone surname: ALL CAPS or all lowercase, with nothing but punctuation, a line break or the text's edge on both sides. "a trump card",
// "TRUMP CARD" and "his trump." are not lone, so plain English still passes.
const edge = `["'()\\[\\]{}.!?;:\u2014\u2013-]`;
const loneSurname = new RegExp(`(?:^|\\n|${edge})\\s*(${realWorldPoliticalNames.filter(n => !n.includes(' ')).flatMap(n => [n.toUpperCase(), n.toLowerCase()]).map(escape).join('|')})(?=\\s*(?:$|\\n|,|${edge}))`);

/** The first listed real-world political name in a text, or null. Exact: multi-word names ignore case, one-word surnames do not, unless one stands alone in ALL CAPS or all lowercase. */
export function realWorldNameIn(text: string): string | null { return text.match(fullNames)?.[0] ?? text.match(surnames)?.[0] ?? text.match(loneSurname)?.[1] ?? null; }

/** Why a text is denied, or null when it passes. */
export function deniedAiText(text: string): 'real-world-name' | 'injection-marker' | null {
  if (realWorldNameIn(text) !== null) return 'real-world-name';
  return injectionMarkers.some(p => p.test(text)) ? 'injection-marker' : null;
}
