import { useEffect, useState } from 'react';
import { Camera, RotateCcw, Wrench } from 'lucide-react';
import { DEFAULT_OCR_ZONE } from '../lib/storage';
import type { AppSettings } from '../types';

export function ScanToolsScreen({
  settings,
  onSettingsChange,
}: {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

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

  return <main className="content-screen tools-screen">
    <header className="page-header">
      <div>
        <p className="tools-eyebrow"><Wrench size={15} /> Scan tools</p>
        <h1>Camera & setup</h1>
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

    <section className="tools-card" aria-label="Scan setup reset">
      <div className="tools-card-heading"><RotateCcw size={18} /><div><h2>Reset scan setup</h2><p>Restores the default OCR region and turns OCR Preview and Auto Scanning on.</p></div></div>
      <button className="primary-wide reset-scan-button" onClick={resetScanSetup}><RotateCcw size={17} /> Reset scan setup</button>
    </section>
  </main>;
}
