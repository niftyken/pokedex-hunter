import { DEFAULT_WANTED_LIST } from './defaultWantedList';
import type { AppSettings } from '../types';

const WANTED_KEY = 'pokedex-hunter:wanted-list:v1';
const SETTINGS_KEY = 'pokedex-hunter:settings:v1';

export const DEFAULT_SETTINGS: AppSettings = {
  sensitivity: 'balanced',
  demoMode: false,
  cameraDeviceId: '',
  // Early field testing is easier when the operator can see exactly what OCR sees.
  showOcrDebug: true,
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

export function loadSettings(): AppSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
