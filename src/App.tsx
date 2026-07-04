import { useEffect, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { ScanScreen } from './components/ScanScreen';
import { ScanToolsScreen } from './components/ScanToolsScreen';
import { WantedListScreen } from './components/WantedListScreen';
import { loadSettings, loadWantedList, saveSettings, saveWantedList } from './lib/storage';
import type { AppSettings, Screen } from './types';

export default function App() {
  const [screen, setScreen] = useState<Screen>('scan');
  const [wantedList, setWantedList] = useState<string[]>(loadWantedList);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => saveWantedList(wantedList), [wantedList]);
  useEffect(() => saveSettings(settings), [settings]);

  function resolveHit(term: string, action: 'remove' | 'keep' | 'reject') {
    if (action === 'remove') setWantedList((current) => current.filter((item) => item !== term));
  }

  return <div className="app-shell">
    {screen === 'scan' && <ScanScreen wantedList={wantedList} settings={settings} onSettingsChange={setSettings} onResolveHit={resolveHit} />}
    {screen === 'wanted' && <WantedListScreen wantedList={wantedList} onSave={(items) => { setWantedList(items); setScreen('scan'); }} />}
    {screen === 'tools' && <ScanToolsScreen settings={settings} onSettingsChange={setSettings} onRestoreWantList={setWantedList} />}
    <BottomNav active={screen} onChange={setScreen} />
  </div>;
}
