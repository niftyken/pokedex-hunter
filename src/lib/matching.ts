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
  return bTokens.filter((token) => aTokens.has(token)).length / bTokens.length;
}

// Tesseract's confidence applies to the *whole* title crop. A clear wanted
// name followed by noisy HP/type text can have a lower global confidence even
// though the wanted-term token itself is reliable. Direct matches therefore
// use a lower immediate-green threshold; weaker direct reads need a second
// stable confirmation in ScanScreen.
function directGreenThreshold(sensitivity: Sensitivity): number {
  return sensitivity === 'conservative' ? 58 : sensitivity === 'balanced' ? 34 : 18;
}

export function findWantedMatch(
  recognizedTitle: string,
  wantedList: string[],
  sensitivity: Sensitivity,
  ocrConfidence = 100,
): MatchResult | null {
  const title = normalizeForMatch(recognizedTitle);
  if (!title) return null;

  for (const wantedTerm of wantedList) {
    const term = normalizeForMatch(wantedTerm);
    if (tokenContains(title, term)) {
      return {
        wantedTerm,
        recognizedTitle,
        confidence: ocrConfidence >= directGreenThreshold(sensitivity) ? 'strong' : 'possible',
        isDirectMatch: true,
      };
    }
  }

  // Fuzzy title similarity never produces a blocking green result. It is only
  // a quick yellow cue for a human to look again at an imperfect OCR read.
  const threshold = sensitivity === 'conservative' ? 0.93 : sensitivity === 'balanced' ? 0.75 : 0.55;
  for (const wantedTerm of wantedList) {
    if (similarity(title, normalizeForMatch(wantedTerm)) >= threshold) {
      return { wantedTerm, recognizedTitle, confidence: 'possible', isDirectMatch: false };
    }
  }
  return null;
}
