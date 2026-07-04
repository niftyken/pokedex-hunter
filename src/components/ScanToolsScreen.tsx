import { useEffect, useState } from 'react';
import { Camera, CloudDownload, RotateCcw, Wrench } from 'lucide-react';
import { DEFAULT_OCR_ZONE } from '../lib/storage';
import { DEFAULT_WANT_LIST_SOURCE_URL, parseWantListCsv } from '../lib/defaultWantListSource';
import type { AppSettings } from '../types';

export function ScanToolsScreen({
  settings,
  onSettingsChange,
  onRestoreWantList,
}: {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onRestoreWantList: (items: string[]) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [restoreState, setRestoreState] = useState('');
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices()
      .then((all) => setDevices(all.filter((device) => device.kind === 'videoinput')))
      .catch(() => undefined);
  }, []);

  function resetScanSetup() {
    onSettingsChange({
      ...settings,
      showOcrDebug: true,
      autoScan: true,
      ocrZone: DEFAULT_OCR_ZONE,
    });
  }

  async function restoreDefaultWantList() {
    const source = settings.defaultWantListUrl.trim() || DEFAULT_WANT_LIST_SOURCE_URL;
    if (!window.confirm('Replace the current Want List with the published default list?')) return;
    setRestoring(true);
    setRestoreState('Loading published list…');
    try {
      const response = await fetch(source, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { items, skipped } = parseWantListCsv(await response.text());
      if (!items.length) throw new Error('No recognized Pokémon names were found');
      onRestoreWantList(items);
      setRestoreState(`Loaded ${items.length} Pokémon into the Want List${skipped ? `; skipped ${skipped} unrecognized row${skipped === 1 ? '' : 's'}` : ''}.`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setRestoreState(`Could not restore the list: ${detail}. Check the published CSV URL and try again.`);
    } finally {
      setRestoring(false);
    }
  }

  return <main className="content-screen tools-screen">
    <header className="page-header">
      <div>
        <p className="tools-eyebrow"><Wrench size={15} /> Settings</p>
        <h1>Camera & defaults</h1>
      </div>
    </header>
    <p className="page-copy">Keep Scan focused on cards. Use these controls when changing camera hardware or restoring the recommended scan setup.</p>

    <section className="tools-card" aria-label="Camera selection">
      <div className="tools-card-heading"><Camera size={18} /><div><h2>Camera</h2><p>Choose the lens used on the Scan screen.</p></div></div>
      <label className="camera-picker-label">
        <span>Active camera</span>
        <select value={settings.cameraDeviceId} onChange={(event) => onSettingsChange({ ...settings, cameraDeviceId: event.target.value })} aria-label="Camera">
          <option value="">Rear camera (preferred)</option>
          {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Camera'}</option>)}
        </select>
      </label>
    </section>


    <section className="tools-card" aria-label="Default Want List source">
      <div className="tools-card-heading"><CloudDownload size={18} /><div><h2>Default Want List</h2><p>Use a published CSV when you want to refresh this device without rebuilding the app.</p></div></div>
      <label className="camera-picker-label">
        <span>Published CSV URL</span>
        <input
          value={settings.defaultWantListUrl}
          onChange={(event) => onSettingsChange({ ...settings, defaultWantListUrl: event.target.value })}
          placeholder={DEFAULT_WANT_LIST_SOURCE_URL}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
        />
      </label>
      <button className="primary-wide restore-want-list-button" disabled={restoring} onClick={() => void restoreDefaultWantList()}><CloudDownload size={17} /> {restoring ? 'Restoring…' : 'Restore default Want List'}</button>
      {restoreState && <p className="restore-note" role="status">{restoreState}</p>}
    </section>

    <section className="tools-card" aria-label="Scan setup reset">
      <div className="tools-card-heading"><RotateCcw size={18} /><div><h2>Reset scan setup</h2><p>Restores the default OCR region and turns OCR Preview and Auto Scanning on.</p></div></div>
      <button className="primary-wide reset-scan-button" onClick={resetScanSetup}><RotateCcw size={17} /> Reset scan setup</button>
    </section>
  </main>;
}
