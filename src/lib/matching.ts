import type { MatchResult, Sensitivity } from '../types';

// This intentionally stays understandable: normalize typography/noisy modifiers,
// then look for a wanted Pokémon name in the card title.
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

function tokenContains(title: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`, 'i').test(title);
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a.includes(b)) return 1;
  const aTokens = new Set(a.split(' '));
  const bTokens = b.split(' ');
  const matching = bTokens.filter((token) => aTokens.has(token)).length;
  return matching / bTokens.length;
}

export function findWantedMatch(
  recognizedTitle: string,
  wantedList: string[],
  sensitivity: Sensitivity,
): MatchResult | null {
  const title = normalizeForMatch(recognizedTitle);
  if (!title) return null;

  for (const wantedTerm of wantedList) {
    const term = normalizeForMatch(wantedTerm);
    if (tokenContains(title, term)) {
      return { wantedTerm, recognizedTitle, confidence: 'strong' };
    }
  }

  // Demo-friendly possible-match classification. Future OCR can replace this with
  // confidence data from the recognition engine while preserving this UI contract.
  const threshold = sensitivity === 'conservative' ? 0.93 : sensitivity === 'balanced' ? 0.75 : 0.55;
  for (const wantedTerm of wantedList) {
    const score = similarity(title, normalizeForMatch(wantedTerm));
    if (score >= threshold) {
      return { wantedTerm, recognizedTitle, confidence: 'possible' };
    }
  }
  return null;
}
