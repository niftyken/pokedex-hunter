import { Camera, List } from 'lucide-react';
import type { Screen } from '../types';

const tabs = [
  { id: 'scan' as const, label: 'Scan', icon: Camera },
  { id: 'wanted' as const, label: 'Wanted List', icon: List },
];

export function BottomNav({ active, onChange }: { active: Screen; onChange: (screen: Screen) => void }) {
  return <nav className="bottom-nav" aria-label="Primary navigation">
    {tabs.map(({ id, label, icon: Icon }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => onChange(id)}>
      <Icon size={20} strokeWidth={active === id ? 2.4 : 1.8} /><span>{label}</span>
    </button>)}
  </nav>;
}
