import type { MatchResult } from '../types';

// Normalization is still useful for typography and familiar card-name variants,
// but matching is deliberately identity-based. Once OCR has resolved a canonical
// Pokémon species, a Wanted List hit must be that same species — never a prefix
// or a merely similar spelling.
const SUFFIXES = /\b(?:ex|gx|v|max|vmax|vstar|break|lv\.?x|legend)\b/gi;
const PREFIXES = /^(?:(?:alolan|galarian|hisuian|paldean|radiant|shining|amazing|mega)\s+|m\s+|(?:blaine|misty|brock|erika|giovanni|rocket|n|team magma|team aqua)['’]s\s+)*/i;

export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[’‘`]/g, "'")
    .replace(/[♀]/g, ' female ')
    .replace(/[♂]/g, ' male ')
    .replace(/[^a-z0-9'\s]/gi, ' ')
    .replace(SUFFIXES, ' ')
    .replace(PREFIXES, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

export function parseWantedList(raw: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const display = line.trim();
    const key = normalizeForMatch(display);
    if (display && key && !seen.has(key)) {
      seen.add(key);
      items.push(display);
    }
  }
  return items;
}

/**
 * Compares canonical identities only. This intentionally prevents root and
 * near-spelling collisions such as Mew ↔ Mewtwo, Latias ↔ Latios, and
 * Nidoran♀ ↔ Nidoran♂. A low-evidence canonical recognition stays yellow;
 * it never becomes a match merely because a shorter wanted name is contained
 * inside it.
 */
export function findWantedMatch(
  recognizedTitle: string,
  wantedList: string[],
  evidence = 100,
): MatchResult | null {
  const recognizedKey = normalizeForMatch(recognizedTitle);
  if (!recognizedKey) return null;

  for (const wantedTerm of wantedList) {
    if (normalizeForMatch(wantedTerm) === recognizedKey) {
      return {
        wantedTerm,
        recognizedTitle,
        confidence: evidence >= 62 ? 'strong' : 'possible',
        isDirectMatch: true,
      };
    }
  }

  return null;
}
