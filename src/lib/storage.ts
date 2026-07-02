import type { AppSettings } from '../types';

const WANTED_KEY = 'pokedex-hunter:wanted-list:v1';
const SETTINGS_KEY = 'pokedex-hunter:settings:v1';

// Seed only a browser that has never stored a Wanted List. An intentional empty
// list remains empty, and an existing user's list is never replaced on update.
const FIRST_LAUNCH_WANTED_LIST = ['Charizard', 'Pikachu', 'Vulpix', 'Zoroark', 'Mr. Mime'];

export const DEFAULT_SETTINGS: AppSettings = {
  sensitivity: 'balanced',
  showDetectedTitle: true,
  demoMode: true,
  cameraDeviceId: '',
  showOcrDebug: false,
};

export function loadWantedList(): string[] {
  try {
    const raw = localStorage.getItem(WANTED_KEY);
    if (raw === null) return FIRST_LAUNCH_WANTED_LIST;
    const saved = JSON.parse(raw);
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
