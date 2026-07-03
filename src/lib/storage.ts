import { DEFAULT_WANTED_LIST } from './defaultWantedList';
import type { AppSettings, OcrZone } from '../types';

const WANTED_KEY = 'pokedex-hunter:wanted-list:v1';
const SETTINGS_KEY = 'pokedex-hunter:settings:v1';

export const DEFAULT_OCR_ZONE: OcrZone = {
  x: 8,
  y: 21,
  width: 84,
  height: 11.8,
};

export const DEFAULT_SETTINGS: AppSettings = {
  sensitivity: 'balanced',
  cameraDeviceId: '',
  showOcrDebug: true,
  ocrZone: DEFAULT_OCR_ZONE,
};

export function loadWantedList(): string[] {
  try {
    const raw = localStorage.getItem(WANTED_KEY);
    // Only a truly first-time browser gets the bundled 392-item list. An existing
    // user's intentional empty list or personal edits remain untouched.
    if (raw === null) return [...DEFAULT_WANTED_LIST];
    const saved = JSON.parse(raw);
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [...DEFAULT_WANTED_LIST];
  }
}

export function saveWantedList(items: string[]) {
  localStorage.setItem(WANTED_KEY, JSON.stringify(items));
}

function validZone(value: unknown): OcrZone | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<OcrZone>;
  const values = [candidate.x, candidate.y, candidate.width, candidate.height];
  return values.every((item) => typeof item === 'number' && Number.isFinite(item))
    ? candidate as OcrZone
    : null;
}

export function loadSettings(): AppSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      // Stored settings from older releases did not contain an OCR zone.
      ocrZone: validZone(saved.ocrZone) ?? DEFAULT_OCR_ZONE,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
