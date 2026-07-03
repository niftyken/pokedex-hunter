export type Screen = 'scan' | 'wanted' | 'settings';
export type Sensitivity = 'conservative' | 'balanced' | 'sensitive';
export type Signal = 'idle' | 'yellow' | 'green';
export type OcrStatus = 'idle' | 'warming' | 'ready' | 'reading';

export interface AppSettings {
  sensitivity: Sensitivity;
  demoMode: boolean;
  cameraDeviceId: string;
  /** Persisted from the Scan screen's preview toggle. */
  showOcrDebug: boolean;
}

export interface MatchResult {
  wantedTerm: string;
  recognizedTitle: string;
  confidence: 'possible' | 'strong';
  /** A complete wanted-term token was present in the recognized title. */
  isDirectMatch: boolean;
}

export interface FrozenFrame {
  imageUrl?: string;
  recognizedTitle: string;
  wantedTerm: string;
  speciesName?: string;
  dex?: number;
}
