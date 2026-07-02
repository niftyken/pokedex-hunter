import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ScanLine, Sparkles, X } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { useTitleOcr, type ScanRecognition } from '../hooks/useTitleOcr';
import { findWantedMatch } from '../lib/matching';
import type { AppSettings, FrozenFrame, MatchResult, Signal } from '../types';

const demoTitles = ['Machop', 'Dark Charizard', "Blaine's Charizard", 'Pikachu & Zekrom-GX', "Misty's Golduck", 'Basic Energy', "Professor's Research", 'Alolan Vulpix VSTAR', "N's Zoroark ex", 'Random Noise'];
const POST_ACTION_COOLDOWN_MS = 1_600;
const DIRECT_CONFIRM_WINDOW_MS = 3_600;

export function ScanScreen({
  wantedList, settings, onResolveHit,
}: {
  wantedList: string[];
  settings: AppSettings;
  onResolveHit: (term: string, action: 'remove' | 'keep' | 'reject') => void;
}) {
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
    // A high-confidence closed-lexicon result can trigger normally. A medium
    // candidate is deliberately treated as weak evidence and needs a second
    // agreeing stable read before it can interrupt with a green hit.
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
    setFrozen({ imageUrl: captureFrame(), recognizedTitle: recognition.displayText, wantedTerm: nextMatch.wantedTerm });
  }, [captureFrame, frozen, settings.sensitivity, wantedList]);

  const evaluateDemoTitle = useCallback((title: string) => {
    evaluateRecognition({
      rawText: title,
      displayText: title,
      ocrConfidence: 100,
      crop: 'demo',
    });
  }, [evaluateRecognition]);


  const isFrozen = Boolean(frozen && match);
  const { status: ocrStatus, debugCandidates, lastResult, captureSample } = useTitleOcr({
    videoRef,
    cropTargetRef: ocrTargetRef,
    enabled: isReady && !settings.demoMode && !isFrozen,
    debugEnabled: settings.showOcrDebug,
    wantedList,
    sensitivity: settings.sensitivity,
    onResult: evaluateRecognition,
  });

  const isReading = !settings.demoMode && (ocrStatus === 'warming' || ocrStatus === 'reading');

  return <main className="scan-screen">
    <video ref={videoRef} className={isFrozen ? 'camera hidden' : 'camera'} muted playsInline autoPlay />
    {frozen?.imageUrl && <img className="frozen-frame" src={frozen.imageUrl} alt="Frozen camera frame" />}
    <div className="camera-vignette" />

    <header className="scan-header">
      <div className="brand"><span className="brand-mark">P</span><span>Pokedex Hunter</span></div>
      <button className="remaining-pill" aria-label="Wanted list count">{remainingLabel}</button>
    </header>

    <section className="scan-stage" aria-label="Card scan area">
      <div className={`card-guide ${signal} ${isReading ? 'reading' : ''}`}>
        <div className="corner c1" /><div className="corner c2" /><div className="corner c3" /><div className="corner c4" />
        <div className="title-band"><span>{signal === 'green' ? 'MATCH FOUND' : signal === 'yellow' ? 'POSSIBLE HIT' : 'TITLE AREA'}</span></div>
        <div
          ref={ocrTargetRef}
          className={`ocr-target-zone ${settings.showOcrDebug ? 'visible' : ''}`}
          aria-hidden="true"
          title={settings.showOcrDebug ? 'OCR title crop' : undefined}
        />
        <div className="art-area"><ScanLine size={26} /></div>
        <div className="detail-area"><span>ALIGN CARD INSIDE GUIDE</span></div>
      </div>
    </section>

    <div className="scan-hint"><Sparkles size={15} /> Hold a face-up card inside the guide</div>
    {settings.showDetectedTitle && lastRead && !isFrozen && <div className="read-pill">Read: <strong>{lastRead}</strong></div>}
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

    {!settings.demoMode && settings.showOcrDebug && !isFrozen && <section className="ocr-debug-panel">
      <div className="ocr-debug-header">
        <div>
          <label>OCR crop preview</label>
          <p>Status: {ocrStatus}{lastResult ? ` · OCR ${Math.round(lastResult.ocrConfidence)}% · ${lastResult.crop} crop` : ''}</p>
        </div>
        <button onClick={() => void captureSample()}>Capture OCR sample</button>
      </div>
      <div className="ocr-debug-body">
        <div className="ocr-candidate-grid">
          {debugCandidates.length ? debugCandidates.map((candidate) => (
            <article key={candidate.label} className={`ocr-candidate ${candidate.selected ? 'selected' : ''}`}>
              <div className="ocr-candidate-meta">
                <strong>{candidate.label}</strong>
                {candidate.selected && <span>selected</span>}
              </div>
              <div className="ocr-debug-preview">
                <img src={candidate.imageUrl} alt={`${candidate.label} OCR crop`} />
              </div>
              <p className="ocr-candidate-result">{candidate.canonicalText ?? candidate.text}</p>
              <small>OCR {Math.round(candidate.confidence)}%{candidate.speciesScore ? ` · species ${Math.round(candidate.speciesScore * 100)}%` : ''}{candidate.directWantedMatch ? ' · Wanted match' : ''}</small>
              {candidate.runnerUp && <small className="ocr-runner-up">Next: {candidate.runnerUp}</small>}
              {candidate.canonicalText && <small className="ocr-raw-text">Raw: {candidate.text}</small>}
            </article>
          )) : <div className="ocr-debug-placeholder">No crop yet</div>}
        </div>
        <div className="ocr-debug-copy">
          <p>All three title strips are shown. Canonical names come from the local 1,025-species English lexicon. “Selected” prefers a plausible species, and an active Wanted List match still outranks generic OCR confidence. A ? means the species match is plausible but not yet high-confidence.</p>
        </div>
      </div>
    </section>}

    {isFrozen && match && <div className="hit-sheet" role="dialog" aria-modal="true" aria-label="Possible match">
      <button className="sheet-close" onClick={clearTransient} aria-label="Close"><X size={21} /></button>
      <p className="eyebrow">Possible match</p>
      <h1>{match.wantedTerm}</h1>
      <p className="recognized">Read: {match.recognizedTitle}</p>
      <div className="hit-actions">
        <button className="remove" onClick={() => { onResolveHit(match.wantedTerm, 'remove'); clearTransient(); }}>Remove from List</button>
        <button className="keep" onClick={() => { onResolveHit(match.wantedTerm, 'keep'); clearTransient(); }}>Keep on List</button>
        <button className="reject" onClick={() => { onResolveHit(match.wantedTerm, 'reject'); clearTransient(); }}>Reject</button>
      </div>
      <p className="action-note"><ChevronDown size={14} /> Keep = another copy may matter. Reject = this read was wrong.</p>
    </div>}
  </main>;
}
