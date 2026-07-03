import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Check, Eye, EyeOff, RotateCcw, X } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useTitleOcr, type ScanRecognition } from '../hooks/useTitleOcr';
import { findWantedMatch } from '../lib/matching';
import { APP_VERSION } from '../lib/appMeta';
import { formatDexNumber, resolvePokemonRecognition } from '../lib/species';
import { DEFAULT_OCR_ZONE } from '../lib/storage';
import type { AppSettings, FrozenFrame, MatchResult, OcrZone, Sensitivity, Signal } from '../types';

const POST_ACTION_COOLDOWN_MS = 1_600;
const MIN_ZONE_WIDTH = 20;
const MIN_ZONE_HEIGHT = 6;
type ZoneHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface ZoneDrag {
  pointerId: number;
  handle: ZoneHandle;
  startX: number;
  startY: number;
  zone: OcrZone;
}

const sensitivityLabels: Record<Sensitivity, string> = {
  conservative: '1',
  balanced: '2',
  sensitive: '3',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveZone(initial: OcrZone, handle: ZoneHandle, dx: number, dy: number): OcrZone {
  if (handle === 'move') {
    return {
      ...initial,
      x: clamp(initial.x + dx, 0, 100 - initial.width),
      y: clamp(initial.y + dy, 0, 100 - initial.height),
    };
  }

  const right = initial.x + initial.width;
  const bottom = initial.y + initial.height;
  let left = initial.x;
  let top = initial.y;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle.includes('w')) left = clamp(initial.x + dx, 0, right - MIN_ZONE_WIDTH);
  if (handle.includes('e')) nextRight = clamp(right + dx, initial.x + MIN_ZONE_WIDTH, 100);
  if (handle.includes('n')) top = clamp(initial.y + dy, 0, bottom - MIN_ZONE_HEIGHT);
  if (handle.includes('s')) nextBottom = clamp(bottom + dy, initial.y + MIN_ZONE_HEIGHT, 100);

  return { x: left, y: top, width: nextRight - left, height: nextBottom - top };
}

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
  const { videoRef, error, isReady, start } = useCamera(settings.cameraDeviceId, true);
  const scanSurfaceRef = useRef<HTMLElement>(null);
  const ocrTargetRef = useRef<HTMLDivElement>(null);
  const zoneDragRef = useRef<ZoneDrag | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [lastRead, setLastRead] = useState('');
  const [pendingRecognition, setPendingRecognition] = useState<ScanRecognition | null>(null);
  const [confirmedNote, setConfirmedNote] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualFeedback, setManualFeedback] = useState('');
  const [signal, setSignal] = useState<Signal>('idle');
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [frozen, setFrozen] = useState<FrozenFrame | null>(null);
  const ignoreResultsUntilRef = useRef(0);

  const remainingLabel = useMemo(() => `${wantedList.length} remaining`, [wantedList.length]);
  const previewVisible = settings.showOcrDebug;
  const isFrozen = Boolean(frozen && match);
  const zone = settings.ocrZone ?? DEFAULT_OCR_ZONE;

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then((all) => setDevices(all.filter((device) => device.kind === 'videoinput')))
      .catch(() => undefined);
  }, [isReady]);

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
    setPendingRecognition(null);
    setConfirmedNote('');
  }, []);

  const openHit = useCallback((nextMatch: MatchResult, recognition: ScanRecognition) => {
    ignoreResultsUntilRef.current = Date.now() + POST_ACTION_COOLDOWN_MS;
    setSignal('green');
    setMatch(nextMatch);
    setFrozen({
      imageUrl: captureFrame(),
      recognizedTitle: recognition.displayText,
      wantedTerm: nextMatch.wantedTerm,
      speciesName: recognition.species?.species.name,
      dex: recognition.species?.species.dex,
    });
  }, [captureFrame]);

  const evaluateRecognition = useCallback((recognition: ScanRecognition) => {
    if (!recognition.rawText.trim() || Date.now() < ignoreResultsUntilRef.current || frozen) return;
    setLastRead(recognition.displayText);
    setConfirmedNote('');

    const canonicalTitle = recognition.species?.species.name ?? recognition.rawText;
    const matchEvidence = recognition.species
      ? (recognition.species.confidence === 'high' ? 100 : 0)
      : recognition.ocrConfidence;
    const nextMatch = findWantedMatch(canonicalTitle, wantedList, settings.sensitivity, matchEvidence);

    // A medium lexicon recognition, or any weak wanted-list read, needs the operator's
    // explicit confirmation. No automatic second-pass guessing is required.
    if (recognition.species?.confidence === 'medium' || nextMatch?.confidence === 'possible') {
      setSignal('yellow');
      setPendingRecognition(recognition);
      return;
    }

    setPendingRecognition(null);
    if (nextMatch) openHit(nextMatch, recognition);
    else setSignal('idle');
  }, [frozen, openHit, settings.sensitivity, wantedList]);

  const { status: ocrStatus, preview, captureSample } = useTitleOcr({
    videoRef,
    cropTargetRef: ocrTargetRef,
    enabled: isReady && !isFrozen,
    previewEnabled: previewVisible,
    onResult: evaluateRecognition,
  });

  const confirmRecognition = useCallback(() => {
    if (!pendingRecognition) return;
    const canonicalTitle = pendingRecognition.species?.species.name ?? pendingRecognition.rawText;
    const nextMatch = findWantedMatch(canonicalTitle, wantedList, settings.sensitivity, 100);
    if (nextMatch) {
      const confirmed = {
        ...pendingRecognition,
        displayText: pendingRecognition.species
          ? `${pendingRecognition.species.species.name} ${formatDexNumber(pendingRecognition.species.species.dex)}`
          : pendingRecognition.displayText.replace(/\s\?$/, ''),
      };
      openHit(nextMatch, confirmed);
      return;
    }
    setSignal('idle');
    setLastRead(pendingRecognition.displayText.replace(/\s\?$/, ''));
    setPendingRecognition(null);
    setConfirmedNote('Confirmed — not on Wanted List');
    ignoreResultsUntilRef.current = Date.now() + 900;
  }, [openHit, pendingRecognition, settings.sensitivity, wantedList]);

  const clearRead = useCallback(() => {
    ignoreResultsUntilRef.current = Date.now() + 700;
    setSignal('idle');
    setLastRead('');
    setPendingRecognition(null);
    setConfirmedNote('');
  }, []);

  const submitManualName = useCallback(() => {
    const typed = manualName.trim();
    if (!typed) return;
    const species = resolvePokemonRecognition(typed);
    const displayText = species
      ? `${species.species.name} ${formatDexNumber(species.species.dex)}`
      : typed;
    const recognition: ScanRecognition = {
      rawText: typed,
      displayText,
      ocrConfidence: 100,
      crop: 'operator-zone',
      species: species ?? undefined,
    };
    const nextMatch = findWantedMatch(species?.species.name ?? typed, wantedList, settings.sensitivity, 100);
    setLastRead(displayText);
    setPendingRecognition(null);
    setManualFeedback('');
    if (nextMatch) {
      openHit(nextMatch, recognition);
      return;
    }
    setSignal('idle');
    setManualFeedback(`${displayText} is not on your Wanted List.`);
  }, [manualName, openHit, settings.sensitivity, wantedList]);

  const clearManualName = useCallback(() => {
    setManualName('');
    setManualFeedback('');
    clearRead();
  }, [clearRead]);

  const beginZoneDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (isFrozen) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-zone-handle]')?.dataset.zoneHandle as ZoneHandle | undefined;
    const actualHandle = handle ?? 'move';
    zoneDragRef.current = { pointerId: event.pointerId, handle: actualHandle, startX: event.clientX, startY: event.clientY, zone };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [isFrozen, zone]);

  const moveZoneDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = zoneDragRef.current;
    const surface = scanSurfaceRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !surface) return;
    const bounds = surface.getBoundingClientRect();
    const dx = ((event.clientX - drag.startX) / bounds.width) * 100;
    const dy = ((event.clientY - drag.startY) / bounds.height) * 100;
    const next = resolveZone(drag.zone, drag.handle, dx, dy);
    onSettingsChange({ ...settings, ocrZone: next });
  }, [onSettingsChange, settings]);

  const endZoneDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (zoneDragRef.current?.pointerId === event.pointerId) zoneDragRef.current = null;
  }, []);

  const isReading = ocrStatus === 'warming' || ocrStatus === 'reading';
  const freezeTitle = frozen?.speciesName
    ? `${frozen.speciesName} ${formatDexNumber(frozen.dex ?? 0)}`
    : match?.wantedTerm;

  return <main ref={scanSurfaceRef} className="scan-screen">
    <video ref={videoRef} className={isFrozen ? 'camera hidden' : 'camera'} muted playsInline autoPlay />
    {frozen?.imageUrl && <img className="frozen-frame" src={frozen.imageUrl} alt="Frozen camera frame" />}
    <div className="camera-vignette" />

    <header className="scan-header">
      <div className="brand"><span className="brand-mark">P</span><span className="brand-copy"><span className="brand-name">Pokedex Hunter</span><span className="build-marker">{APP_VERSION}</span></span></div>
      <span className="remaining-pill" aria-label="Wanted list count">{remainingLabel}</span>
    </header>

    <section className="operator-zone-stage" aria-label="Resizable OCR name scan area">
      <div
        ref={ocrTargetRef}
        className={`operator-ocr-zone ${signal} ${isReading ? 'reading' : ''}`}
        style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%` }}
        onPointerDown={beginZoneDrag}
        onPointerMove={moveZoneDrag}
        onPointerUp={endZoneDrag}
        onPointerCancel={endZoneDrag}
      >
        <div className="operator-zone-label">{signal === 'green' ? 'MATCH FOUND' : signal === 'yellow' ? 'CONFIRM POSSIBLE READ' : 'SCAN POKÉMON NAME HERE'}</div>
        <span className="zone-handle nw" data-zone-handle="nw" aria-hidden="true" />
        <span className="zone-handle ne" data-zone-handle="ne" aria-hidden="true" />
        <span className="zone-handle sw" data-zone-handle="sw" aria-hidden="true" />
        <span className="zone-handle se" data-zone-handle="se" aria-hidden="true" />
      </div>
    </section>

    {lastRead && !isFrozen && <div className="read-pill">Read: <strong>{lastRead}</strong></div>}
    {error && <div className="permission-card"><p>{error}</p><button onClick={() => void start()}>Enable camera</button></div>}

    {!isFrozen && <div className="scan-bottom-stack">
      {previewVisible && <section className="ocr-preview-panel">
        <div className="ocr-preview-header">
          <div>
            <label>OCR preview</label>
            <p>Status: {ocrStatus}{preview ? ` · OCR ${Math.round(preview.ocrConfidence)}%` : ''}</p>
          </div>
          <button onClick={() => void captureSample()}>Capture</button>
        </div>
        <div className="ocr-preview-body">
          <div className="ocr-preview-image">
            {preview ? <img src={preview.imageUrl} alt="Current OCR crop" /> : <div className="ocr-debug-placeholder">Aim the printed name inside the box</div>}
          </div>
          <div className="ocr-preview-details">
            <p className="ocr-preview-read">{preview?.canonicalText ?? 'Waiting for a stable read'}</p>
            {preview && <small>Raw: {preview.rawText}</small>}
            {preview?.speciesScore && <small>Species match {Math.round(preview.speciesScore * 100)}%</small>}
            {preview?.runnerUp && <small>Next: {preview.runnerUp}</small>}
          </div>
        </div>
      </section>}

      {pendingRecognition && <section className="confirmation-strip" aria-live="polite">
        <span>Is this read correct?</span>
        <button className="confirm-read" onClick={confirmRecognition}><Check size={16} /> Yes</button>
        <button className="clear-read" onClick={clearRead}><X size={16} /> Clear</button>
      </section>}
      {confirmedNote && <p className="scan-note">{confirmedNote}</p>}

      <section className="manual-entry" aria-label="Manual Pokémon name entry">
        <input
          value={manualName}
          onChange={(event) => { setManualName(event.target.value); setManualFeedback(''); }}
          onKeyDown={(event) => { if (event.key === 'Enter') submitManualName(); }}
          placeholder="Check a Pokémon name"
          autoCapitalize="words"
          spellCheck="false"
        />
        <button className="manual-submit" onClick={submitManualName}>Check</button>
        <button className="manual-clear" onClick={clearManualName} aria-label="Clear manual entry"><X size={17} /></button>
      </section>
      {manualFeedback && <p className="scan-note">{manualFeedback}</p>}

      <section className="scan-control-dock" aria-label="Scan controls">
        <div className="dock-row">
          <button
            className={`preview-toggle ${previewVisible ? 'active' : ''}`}
            onClick={() => onSettingsChange({ ...settings, showOcrDebug: !previewVisible })}
            aria-pressed={previewVisible}
          >
            {previewVisible ? <Eye size={17} /> : <EyeOff size={17} />}<span>OCR Preview</span>
          </button>
          <div className="sensitivity-control" aria-label="Match sensitivity">
            <span>Sensitivity</span>
            {(['conservative', 'balanced', 'sensitive'] as Sensitivity[]).map((value) => <button key={value} className={settings.sensitivity === value ? 'selected' : ''} onClick={() => onSettingsChange({ ...settings, sensitivity: value })} aria-label={`${value} sensitivity`}>{sensitivityLabels[value]}</button>)}
          </div>
          <button className="reset-zone" onClick={() => onSettingsChange({ ...settings, ocrZone: DEFAULT_OCR_ZONE })}><RotateCcw size={16} /> Reset</button>
        </div>
        <select value={settings.cameraDeviceId} onChange={(event) => onSettingsChange({ ...settings, cameraDeviceId: event.target.value })} aria-label="Camera">
          <option value="">Rear camera (preferred)</option>
          {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Camera'}</option>)}
        </select>
      </section>
    </div>}

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
    </div>}
  </main>;
}
