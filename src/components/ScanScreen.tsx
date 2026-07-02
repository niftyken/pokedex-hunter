import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ScanLine, Sparkles, X } from 'lucide-react';
import { useCamera } from '../hooks/useCamera';
import { findWantedMatch } from '../lib/matching';
import type { AppSettings, FrozenFrame, MatchResult, Signal } from '../types';

const demoTitles = ['Machop', 'Dark Charizard', "Blaine's Charizard", 'Pikachu & Zekrom-GX', 'Misty\'s Golduck', 'Basic Energy', 'Professor\'s Research', 'Alolan Vulpix VSTAR', "N's Zoroark ex", 'Random Noise'];

export function ScanScreen({
  wantedList, settings, onResolveHit,
}: {
  wantedList: string[];
  settings: AppSettings;
  onResolveHit: (term: string, action: 'remove' | 'keep' | 'reject') => void;
}) {
  const { videoRef, error, isReady, start } = useCamera(settings.cameraDeviceId, true);
  const [demoTitle, setDemoTitle] = useState('Dark Charizard');
  const [lastRead, setLastRead] = useState('');
  const [signal, setSignal] = useState<Signal>('idle');
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [frozen, setFrozen] = useState<FrozenFrame | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const remainingLabel = useMemo(() => `${wantedList.length} remaining`, [wantedList.length]);
  useEffect(() => () => { if (timeoutRef.current) window.clearTimeout(timeoutRef.current); }, []);

  function captureFrame(): string | undefined {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return undefined;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.86);
  }

  function clearTransient() {
    setSignal('idle'); setMatch(null); setFrozen(null); setLastRead('');
  }

  function evaluateTitle(title: string) {
    if (!title.trim()) return;
    setLastRead(title);
    const nextMatch = findWantedMatch(title, wantedList, settings.sensitivity);
    if (!nextMatch) return;

    if (nextMatch.confidence === 'possible') {
      setSignal('yellow');
      timeoutRef.current = window.setTimeout(() => setSignal('idle'), 720);
      return;
    }

    setSignal('green');
    setMatch(nextMatch);
    setFrozen({ imageUrl: captureFrame(), recognizedTitle: title, wantedTerm: nextMatch.wantedTerm });
  }

  const isFrozen = Boolean(frozen && match);
  return <main className="scan-screen">
    <video ref={videoRef} className={isFrozen ? 'camera hidden' : 'camera'} muted playsInline autoPlay />
    {frozen?.imageUrl && <img className="frozen-frame" src={frozen.imageUrl} alt="Frozen camera frame" />}
    <div className="camera-vignette" />

    <header className="scan-header">
      <div className="brand"><span className="brand-mark">P</span><span>Pokedex Hunter</span></div>
      <button className="remaining-pill" aria-label="Wanted list count">{remainingLabel}</button>
    </header>

    <section className="scan-stage" aria-label="Card scan area">
      <div className={`card-guide ${signal}`}>
        <div className="corner c1"/><div className="corner c2"/><div className="corner c3"/><div className="corner c4"/>
        <div className="title-band"><span>{signal === 'green' ? 'MATCH FOUND' : signal === 'yellow' ? 'POSSIBLE HIT' : 'TITLE AREA'}</span></div>
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
        <button onClick={() => evaluateTitle(demoTitle)}>Test</button>
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
