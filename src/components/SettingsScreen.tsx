import { useEffect, useState } from 'react';
import type { AppSettings, Sensitivity } from '../types';

export function SettingsScreen({ settings, onChange }: { settings: AppSettings; onChange: (settings: AppSettings) => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => { navigator.mediaDevices?.enumerateDevices().then((all) => setDevices(all.filter((d) => d.kind === 'videoinput'))).catch(() => undefined); }, []);
  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => onChange({ ...settings, [key]: value });
  return <main className="content-screen">
    <header className="page-header"><div><p className="eyebrow">Preferences</p><h1>Settings</h1></div></header>
    <section className="settings-group"><h2>Match Sensitivity</h2><p>Controls how readily uncertain reads receive a brief yellow signal.</p>
      <div className="segmented">{(['conservative', 'balanced', 'sensitive'] as Sensitivity[]).map((value) => <button key={value} className={settings.sensitivity === value ? 'selected' : ''} onClick={() => update('sensitivity', value)}>{value}</button>)}</div>
    </section>
    <section className="settings-group"><h2>Camera</h2>
      <select value={settings.cameraDeviceId} onChange={(e) => update('cameraDeviceId', e.target.value)}><option value="">Rear camera (preferred)</option>{devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label || 'Camera'}</option>)}</select>
    </section>
    <section className="settings-group inline-setting"><div><h2>Show detected title</h2><p>Briefly display recognized title text on Scan.</p></div><input type="checkbox" checked={settings.showDetectedTitle} onChange={(e) => update('showDetectedTitle', e.target.checked)} /></section>
    <section className="settings-group inline-setting"><div><h2>Developer demo OCR</h2><p>Show simulated card-title controls on Scan.</p></div><input type="checkbox" checked={settings.demoMode} onChange={(e) => update('demoMode', e.target.checked)} /></section>
    <p className="offline-note">All list data and settings stay on this device.</p>
  </main>;
}
