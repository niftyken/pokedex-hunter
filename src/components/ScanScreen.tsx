import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Eye, EyeOff, ScanLine, Sparkles, X } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useTitleOcr, type ScanRecognition } from '../hooks/useTitleOcr';
import { findWantedMatch } from '../lib/matching';
import { APP_VERSION } from '../lib/appMeta';
import { formatDexNumber } from '../lib/species';
import type { AppSettings, FrozenFrame, MatchResult, Signal } from '../types';

const demoTitles = ['Machop', 'Dark Charizard', "Blaine's Charizard", 'Pikachu & Zekrom-GX', "Misty's Golduck", 'Basic Energy', "Professor's Research", 'Alolan Vulpix VSTAR', "N's Zoroark ex", 'Random Noise'];
const POST_ACTION_COOLDOWN_MS = 1_600;
const DIRECT_CONFIRM_WINDOW_MS = 3_600;

export function ScanScreen({
  wantedList,
  settings,
  onSettingsChange,
  onResolveHit,
}: {
  wantedList: string[];
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onResolveHit: (term: string, action: 'remove' | 'keep' | 'reject') => void;
}) {
  // ScanScreen is mounted only on the Scan tab. Its hook cleanup stops all camera
  // tracks immediately whenever the user opens Wanted List or Settings.
  const { videoRef, error, isReady, start } = useCamera(settings.cameraDeviceId, true);
  const ocrTargetRef = useRef<HTMLDivElement>(null);
  const [demoTitle, setDemoTitle] = useState('Dark Charizard');
  const [lastRead, setLastRead] = useState('');
  const [signal, setSignal] = useState<Signal>('idle');
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [frozen, setFrozen] = useState<FrozenFrame | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const ignoreResultsUntilRef = useRef(0);
  const pendingDirectRef = useRef<{ term: string; count: number; lastSeenAt: number } | null>(null);

  const remainingLabel = useMemo(() => `${wantedList.length} remaining`, [wantedList.length]);
  const previewVisible = settings.showOcrDebug;

  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
  }, []);

  const captureFrame = useCallback((): string | undefined => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.86);
  }, [videoRef]);

  const clearTransient = useCallback(() => {
    ignoreResultsUntilRef.current = Date.now() + POST_ACTION_COOLDOWN_MS;
    setSignal('idle');
    setMatch(null);
    setFrozen(null);
    pendingDirectRef.current = null;
  }, []);

  const evaluateRecognition = useCallback((recognition: ScanRecognition) => {
    if (!recognition.rawText.trim() || Date.now() < ignoreResultsUntilRef.current || frozen) return;
    setLastRead(recognition.displayText);

    const canonicalTitle = recognition.species?.species.name ?? recognition.rawText;
    const matchEvidence = recognition.species
      ? (recognition.species.confidence === 'high' ? 100 : 0)
      : recognition.ocrConfidence;
    const nextMatch = findWantedMatch(canonicalTitle, wantedList, settings.sensitivity, matchEvidence);
    if (!nextMatch) return;

    const now = Date.now();
    const pending = pendingDirectRef.current;
    const hasSecondDirectConfirmation = nextMatch.isDirectMatch
      && pending?.term === nextMatch.wantedTerm
      && now - pending.lastSeenAt <= DIRECT_CONFIRM_WINDOW_MS
      && pending.count >= 1;

    if (nextMatch.confidence === 'possible' && !hasSecondDirectConfirmation) {
      if (nextMatch.isDirectMatch) {
        pendingDirectRef.current = pending?.term === nextMatch.wantedTerm
          && now - pending.lastSeenAt <= DIRECT_CONFIRM_WINDOW_MS
          ? { term: nextMatch.wantedTerm, count: pending.count + 1, lastSeenAt: now }
          : { term: nextMatch.wantedTerm, count: 1, lastSeenAt: now };
      } else {
        pendingDirectRef.current = null;
      }
      setSignal('yellow');
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setSignal('idle'), 720);
      return;
    }

    pendingDirectRef.current = null;
    setSignal('green');
    setMatch(nextMatch);
    setFrozen({
      imageUrl: captureFrame(),
      recognizedTitle: recognition.displayText,
      wantedTerm: nextMatch.wantedTerm,
      speciesName: recognition.species?.species.name,
      dex: recognition.species?.species.dex,
    });
  }, [captureFrame, frozen, settings.sensitivity, wantedList]);

  const evaluateDemoTitle = useCallback((title: string) => {
    evaluateRecognition({ rawText: title, displayText: title, ocrConfidence: 100, crop: 'operator-zone' });
  }, [evaluateRecognition]);

  const isFrozen = Boolean(frozen && match);
  const { status: ocrStatus, preview, captureSample } = useTitleOcr({
    videoRef,
    cropTargetRef: ocrTargetRef,
    enabled: isReady && !settings.demoMode && !isFrozen,
    previewEnabled: previewVisible,
    onResult: evaluateRecognition,
  });

  const isReading = !settings.demoMode && (ocrStatus === 'warming' || ocrStatus === 'reading');
  const freezeTitle = frozen?.speciesName
    ? `${frozen.speciesName} ${formatDexNumber(frozen.dex ?? 0)}`
    : match?.wantedTerm;

  return <main className="scan-screen">
    <video ref={videoRef} className={isFrozen ? 'camera hidden' : 'camera'} muted playsInline autoPlay />
    {frozen?.imageUrl && <img className="frozen-frame" src={frozen.imageUrl} alt="Frozen camera frame" />}
    <div className="camera-vignette" />

    <header className="scan-header">
      <div className="brand"><span className="brand-mark">P</span><span className="brand-copy"><span className="brand-name">Pokedex Hunter</span><span className="build-marker">{APP_VERSION}</span></span></div>
      <div className="header-actions">
        <button
          className={`preview-toggle ${previewVisible ? 'active' : ''}`}
          onClick={() => onSettingsChange({ ...settings, showOcrDebug: !previewVisible })}
          aria-pressed={previewVisible}
          aria-label={previewVisible ? 'Hide OCR preview' : 'Show OCR preview'}
        >
          {previewVisible ? <Eye size={18} /> : <EyeOff size={18} />}<span>Preview</span>
        </button>
        <button className="remaining-pill" aria-label="Wanted list count">{remainingLabel}</button>
      </div>
    </header>

    <section className="operator-zone-stage" aria-label="OCR name scan area">
      <div ref={ocrTargetRef} className={`operator-ocr-zone ${signal} ${isReading ? 'reading' : ''}`}>
        <div className="operator-zone-label">{signal === 'green' ? 'MATCH FOUND' : signal === 'yellow' ? 'POSSIBLE HIT' : 'PLACE POKÉMON NAME HERE'}</div>
        <div className="operator-zone-corners"><i /><i /><i /><i /></div>
      </div>
    </section>

    <div className="scan-hint"><Sparkles size={15} /> Align the printed name inside the rectangle</div>
    {lastRead && !isFrozen && <div className="read-pill">Read: <strong>{lastRead}</strong></div>}
    {error && <div className="permission-card"><p>{error}</p><button onClick={() => void start()}>Enable camera</button></div>}

    {settings.demoMode && !isFrozen && <section className="demo-console">
      <label htmlFor="demo-title">Demo OCR</label>
      <div className="demo-row">
        <select id="demo-title" value={demoTitle} onChange={(e) => setDemoTitle(e.target.value)}>
          {demoTitles.map((title) => <option key={title}>{title}</option>)}
        </select>
        <button onClick={() => evaluateDemoTitle(demoTitle)}>Test</button>
      </div>
    </section>}

    {!settings.demoMode && previewVisible && !isFrozen && <section className="ocr-preview-panel">
      <div className="ocr-preview-header">
        <div>
          <label>OCR preview</label>
          <p>Status: {ocrStatus}{preview ? ` · OCR ${Math.round(preview.ocrConfidence)}%` : ''}</p>
        </div>
        <button onClick={() => void captureSample()}>Capture</button>
      </div>
      <div className="ocr-preview-body">
        <div className="ocr-preview-image">
          {preview ? <img src={preview.imageUrl} alt="Current OCR crop" /> : <div className="ocr-debug-placeholder">Aim a name inside the rectangle</div>}
        </div>
        <div className="ocr-preview-details">
          <p className="ocr-preview-read">{preview?.canonicalText ?? 'Waiting for a stable read'}</p>
          {preview && <small>Raw: {preview.rawText}</small>}
          {preview?.speciesScore && <small>Species match {Math.round(preview.speciesScore * 100)}%</small>}
          {preview?.runnerUp && <small>Next: {preview.runnerUp}</small>}
        </div>
      </div>
    </section>}

    {isFrozen && match && <div className="hit-sheet" role="dialog" aria-modal="true" aria-label="Possible match">
      <button className="sheet-close" onClick={clearTransient} aria-label="Close"><X size={21} /></button>
      <p className="eyebrow">Possible match</p>
      <h1>{freezeTitle}</h1>
      <p className="recognized">Read: {frozen?.recognizedTitle}</p>
      <div className="hit-actions">
        <button className="remove" onClick={() => { onResolveHit(match.wantedTerm, 'remove'); clearTransient(); }}>Remove from List</button>
        <button className="keep" onClick={() => { onResolveHit(match.wantedTerm, 'keep'); clearTransient(); }}>Keep on List</button>
        <button className="reject" onClick={() => { onResolveHit(match.wantedTerm, 'reject'); clearTransient(); }}>Reject</button>
      </div>
      <p className="action-note"><ChevronDown size={14} /> Keep = another copy may matter. Reject = this read was wrong.</p>
    </div>}
  </main>;
}
