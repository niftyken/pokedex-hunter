export type Screen = 'scan' | 'wanted' | 'settings';
export type Sensitivity = 'conservative' | 'balanced' | 'sensitive';
export type Signal = 'idle' | 'yellow' | 'green';

export interface AppSettings {
  sensitivity: Sensitivity;
  showDetectedTitle: boolean;
  demoMode: boolean;
  cameraDeviceId: string;
}

export interface MatchResult {
  wantedTerm: string;
  recognizedTitle: string;
  confidence: 'possible' | 'strong';
}

export interface FrozenFrame {
  imageUrl?: string;
  recognizedTitle: string;
  wantedTerm: string;
}
