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
 * The `pokemon` package ships a static English National Dex list. It is bundled
 * with the app at build time, so recognition remains local/offline after loading.
 */
export const POKEMON_SPECIES: readonly PokemonSpecies[] = pokemon.all('en').map((name, index) => ({
  dex: index + 1,
  name,
  normalized: normalizeSpeciesText(name),
  compact: compactSpeciesText(name),
}));

const CARD_METADATA = new Set([
  'basic', 'stage', 'restored', 'rapid', 'strike', 'single', 'fusion', 'ancient',
  'future', 'pokemon', 'trainer', 'supporter', 'item', 'energy', 'rule',
]);

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
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previousDiagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      previousDiagonal = saved;
    }
  }
  return row[b.length];
}

function editSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - levenshteinDistance(a, b) / Math.max(a.length, b.length);
}

/**
 * OCR often clips or confuses one character in card metadata. Treat words such
 * as `asic`, `baslc`, and `stag` as metadata too, so they cannot compete with
 * the actual Pokémon name in a shared scan box.
 */
function isCardMetadataToken(token: string): boolean {
  if (CARD_METADATA.has(token)) return true;
  return [...CARD_METADATA].some((metadata) => {
    if (token.length < 3 || Math.abs(token.length - metadata.length) > 1) return false;
    const maxDistance = metadata.length <= 5 ? 1 : Math.max(1, Math.floor(metadata.length * 0.18));
    return levenshteinDistance(token, metadata) <= maxDistance;
  });
}

function scoreTokenAgainstSpecies(token: string, species: PokemonSpecies): number {
  if (token === species.compact) return 1;
  if (token.length < 4) return 0;
  if (species.compact.includes(token) || token.includes(species.compact)) {
    const fragmentRatio = Math.min(token.length, species.compact.length) / Math.max(token.length, species.compact.length);
    return Math.min(0.88, 0.52 + fragmentRatio * 0.42);
  }
  return editSimilarity(token, species.compact);
}

function isNidoranSpecies(species: PokemonSpecies): boolean {
  return /^nidoran/i.test(species.name);
}

function normalizedPreferredNames(preferredNames: readonly string[]): Set<string> {
  return new Set(preferredNames.map(normalizeSpeciesText));
}

/**
 * Resolves noisy OCR against the closed 1,025-species English lexicon. It does
 * not convert arbitrary graphics into Pokémon names: a candidate still needs a
 * strong score and a margin over its runner-up. Known card metadata — including
 * one-character OCR damage such as `asic` for `Basic` — is removed before
 * scoring.
 */
export function resolvePokemonRecognition(rawOcrText: string, preferredNames: readonly string[] = []): PokemonRecognition | null {
  const normalized = normalizeSpeciesText(rawOcrText);
  const rawTokens = normalized.split(' ').map(compactSpeciesText).filter((token) => token.length >= 3);
  const tokens = rawTokens.filter((token) => !isCardMetadataToken(token));
  if (!tokens.length) return null;

  const hasBareNidoran = tokens.includes('nidoran') && !tokens.includes('male') && !tokens.includes('female');
  const preferredKeys = normalizedPreferredNames(preferredNames);
  const wantedNidorans = POKEMON_SPECIES.filter((species) => isNidoranSpecies(species) && preferredKeys.has(species.normalized));

  // The gender glyph is a meaningful part of the identity. A bare Nidoran is
  // usable only when the current Wanted List leaves exactly one form possible;
  // it is still medium confidence and must be confirmed by the operator.
  if (hasBareNidoran && wantedNidorans.length !== 1) return null;

  const scored = POKEMON_SPECIES.map((species) => {
    let score = 0;
    for (const token of tokens) score = Math.max(score, scoreTokenAgainstSpecies(token, species));
    if (normalized.includes(species.normalized)) score = Math.max(score, 0.985);
    if (hasBareNidoran && species.dex === wantedNidorans[0]?.dex) score = Math.max(score, 0.83);
    return { species, score: Math.min(1, score) };
  }).sort((a, b) => b.score - a.score || a.species.dex - b.species.dex);

  const best = scored[0];
  const runnerUp = scored[1];
  if (!best || !runnerUp) return null;

  if (hasBareNidoran && best.species.dex === wantedNidorans[0]?.dex) {
    return {
      species: best.species,
      score: best.score,
      runnerUp: runnerUp.species,
      runnerUpScore: runnerUp.score,
      confidence: 'medium',
    };
  }

  const margin = best.score - runnerUp.score;
  const exactish = best.score >= 0.96;
  const high = (exactish && margin >= 0.035) || (best.score >= 0.91 && margin >= 0.085);
  const medium = best.score >= 0.78 && margin >= 0.045;
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

/**
 * Compact type-ahead search for manual checks and Wanted List editing. Results
 * favor exact/prefix matches and items already present in the Wanted List.
 */
export function searchPokemonSpecies(
  query: string,
  preferredNames: readonly string[] = [],
  limit = 5,
): PokemonSpecies[] {
  const normalizedQuery = normalizeSpeciesText(query);
  const compactQuery = compactSpeciesText(query);
  if (!compactQuery) return [];
  const preferred = normalizedPreferredNames(preferredNames);

  return POKEMON_SPECIES
    .map((species) => {
      const nameStarts = species.compact.startsWith(compactQuery);
      const wordStarts = species.normalized.split(' ').some((word) => word.startsWith(compactQuery));
      const contains = species.compact.includes(compactQuery) || species.normalized.includes(normalizedQuery);
      if (!nameStarts && !wordStarts && !contains) return null;
      const matchRank = nameStarts ? 0 : wordStarts ? 1 : 2;
      const wantedRank = preferred.has(species.normalized) ? 0 : 1;
      return { species, matchRank, wantedRank };
    })
    .filter((value): value is { species: PokemonSpecies; matchRank: number; wantedRank: number } => Boolean(value))
    .sort((a, b) => a.wantedRank - b.wantedRank || a.matchRank - b.matchRank || a.species.name.localeCompare(b.species.name))
    .slice(0, limit)
    .map(({ species }) => species);
}
