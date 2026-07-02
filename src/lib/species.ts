import * as pokemon from 'pokemon';

export interface PokemonSpecies {
  dex: number;
  name: string;
  normalized: string;
  compact: string;
}

export type RecognitionConfidence = 'high' | 'medium';

export interface PokemonRecognition {
  species: PokemonSpecies;
  score: number;
  runnerUp?: PokemonSpecies;
  runnerUpScore: number;
  confidence: RecognitionConfidence;
}

/**
 * The `pokemon` package ships a static, English National Dex list. It is bundled
 * with the app at build time, so recognition remains local/offline after the app
 * has loaded. IDs are 1-based and correspond directly to National Dex numbers.
 */
export const POKEMON_SPECIES: readonly PokemonSpecies[] = pokemon.all('en').map((name, index) => ({
  dex: index + 1,
  name,
  normalized: normalizeSpeciesText(name),
  compact: compactSpeciesText(name),
}));

function normalizeSpeciesText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[’‘`]/g, "'")
    .replace(/♀/g, ' female ')
    .replace(/♂/g, ' male ')
    .replace(/[^a-z0-9'\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function compactSpeciesText(value: string): string {
  return normalizeSpeciesText(value).replace(/[^a-z0-9]/g, '');
}

function levenshteinDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previousDiagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previousDiagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previousDiagonal = saved;
    }
  }
  return row[b.length];
}

function editSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
}

function scoreTokenAgainstSpecies(token: string, species: PokemonSpecies): number {
  if (token === species.compact) return 1;
  if (token.length < 4) return 0;

  // OCR often loses a leading character (e.g. "armander"). A contained fragment
  // may be useful, but it is intentionally capped below a clean full-name read.
  if (species.compact.includes(token) || token.includes(species.compact)) {
    const fragmentRatio = Math.min(token.length, species.compact.length) / Math.max(token.length, species.compact.length);
    return Math.min(0.88, 0.52 + fragmentRatio * 0.42);
  }

  return editSimilarity(token, species.compact);
}

/**
 * Resolves noisy OCR against the closed 1,025-species English lexicon. It returns
 * no result when the best candidate is weak or too close to the runner-up, so the
 * UI does not turn arbitrary card text into a confident Pokémon name.
 */
export function resolvePokemonRecognition(rawOcrText: string): PokemonRecognition | null {
  const normalized = normalizeSpeciesText(rawOcrText);
  const tokens = normalized.split(' ').map(compactSpeciesText).filter((token) => token.length >= 3);
  if (!tokens.length) return null;

  const scored = POKEMON_SPECIES.map((species) => {
    let score = 0;
    for (const token of tokens) score = Math.max(score, scoreTokenAgainstSpecies(token, species));

    // A complete species name embedded in a longer OCR title is especially strong.
    if (normalized.includes(species.normalized)) score = Math.max(score, 0.985);
    return { species, score };
  }).sort((a, b) => b.score - a.score || a.species.dex - b.species.dex);

  const best = scored[0];
  const runnerUp = scored[1];
  if (!best || !runnerUp) return null;

  const margin = best.score - runnerUp.score;
  const exactish = best.score >= 0.96;
  const high = (exactish && margin >= 0.035) || (best.score >= 0.91 && margin >= 0.085);
  const medium = best.score >= 0.78 && margin >= 0.06;
  if (!high && !medium) return null;

  return {
    species: best.species,
    score: best.score,
    runnerUp: runnerUp.species,
    runnerUpScore: runnerUp.score,
    confidence: high ? 'high' : 'medium',
  };
}

export function formatDexNumber(dex: number): string {
  return `#${String(dex).padStart(4, '0')}`;
}
