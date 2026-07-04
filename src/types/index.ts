export type Screen = 'scan' | 'wanted' | 'tools';
export type Signal = 'idle' | 'yellow' | 'green' | 'not-wanted';
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
  /** Published CSV used only by the explicit restore action in Settings. */
  defaultWantListUrl: string;
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
