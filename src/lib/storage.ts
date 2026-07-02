import type { AppSettings } from '../types';

const WANTED_KEY = 'pokedex-hunter:wanted-list:v1';
const SETTINGS_KEY = 'pokedex-hunter:settings:v1';

export const DEFAULT_SETTINGS: AppSettings = {
  sensitivity: 'balanced',
  showDetectedTitle: true,
  demoMode: true,
  cameraDeviceId: '',
};

export function loadWantedList(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(WANTED_KEY) ?? '[]');
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
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
