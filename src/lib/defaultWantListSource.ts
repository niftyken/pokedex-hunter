import { POKEMON_SPECIES } from './species';

/**
 * User-editable published Google Sheet CSV. The app only reads this URL when
 * the operator explicitly chooses Restore default Want List in Settings.
 */
export const DEFAULT_WANT_LIST_SOURCE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQaHcUS7fQkelEREQMSY38llULNR4fQ7kvZgY3bGaZRzg6PBKiu55h1Q2mjAY2qXjQcBS4kWVfrcM3S/pub?gid=0&single=true&output=csv';

const HEADER_VALUES = new Set(['pokemon', 'pokémon', 'name', 'want list', 'wanted list', 'pokemon name', 'pokémon name']);

function normalize(value: string): string {
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

function firstPopulatedCsvCell(line: string): string {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim());
  return cells.find(Boolean) ?? '';
}

/**
 * Parses a simple one-name-per-row CSV and keeps only exact built-in National
 * Dex identities. Headers, blanks, duplicates, and unknown text are skipped.
 */
export function parseWantListCsv(csv: string): { items: string[]; skipped: number } {
  const speciesByNormalized = new Map(POKEMON_SPECIES.map((species) => [species.normalized, species]));
  const unique = new Set<string>();
  let skipped = 0;

  for (const line of csv.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const cell = firstPopulatedCsvCell(line);
    if (!cell) continue;
    const key = normalize(cell);
    if (HEADER_VALUES.has(key)) continue;
    const species = speciesByNormalized.get(key);
    if (!species) {
      skipped += 1;
      continue;
    }
    unique.add(species.name);
  }

  return { items: [...unique], skipped };
}
