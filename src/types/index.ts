export type Screen = 'scan' | 'wanted';
export type Signal = 'idle' | 'yellow' | 'green';
export type OcrStatus = 'idle' | 'warming' | 'ready' | 'reading';

export interface OcrZone {
  /** Percentage of the live Scan surface. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppSettings {
  cameraDeviceId: string;
  /** Persisted from the Scan screen's Preview toggle. */
  showOcrDebug: boolean;
  /** When enabled, OCR runs automatically; Capture always remains available. */
  autoScan: boolean;
  /** Operator-adjustable OCR rectangle, saved per device. */
  ocrZone: OcrZone;
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
