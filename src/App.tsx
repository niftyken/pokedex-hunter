import { useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { ScanScreen } from './components/ScanScreen';
import { WantedListScreen } from './components/WantedListScreen';
import { loadSettings, loadWantedList, saveSettings, saveWantedList } from './lib/storage';
import type { AppSettings, Screen } from './types';

export default function App() {
  const [screen, setScreen] = useState<Screen>('scan');
  const [wantedList, setWantedList] = useState<string[]>(loadWantedList);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => saveWantedList(wantedList), [wantedList]);
  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    // A manifest orientation locks installed PWAs where the platform allows it.
    // Browsers that do not expose this API receive the landscape interstitial in CSS.
    const orientation = window.screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void>; unlock?: () => void };
    void orientation?.lock?.('portrait').catch(() => undefined);
    return () => { orientation?.unlock?.(); };
  }, []);

  function resolveHit(term: string, action: 'remove' | 'keep' | 'reject') {
    if (action === 'remove') setWantedList((current) => current.filter((item) => item !== term));
  }

  return <div className="app-shell">
    <div className="portrait-lock-message" role="status">Rotate back to portrait to scan cards.</div>
    {screen === 'scan' && <ScanScreen wantedList={wantedList} settings={settings} onSettingsChange={setSettings} onResolveHit={resolveHit} />}
    {screen === 'wanted' && <WantedListScreen wantedList={wantedList} onSave={(items) => { setWantedList(items); setScreen('scan'); }} />}
    <BottomNav active={screen} onChange={setScreen} />
  </div>;
}
