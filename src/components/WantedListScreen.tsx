import { useEffect, useState } from 'react';
import { parseWantedList } from '../lib/matching';

export function WantedListScreen({ wantedList, onSave }: { wantedList: string[]; onSave: (items: string[]) => void }) {
  const [raw, setRaw] = useState(wantedList.join('\n'));
  useEffect(() => setRaw(wantedList.join('\n')), [wantedList]);
  const parsed = parseWantedList(raw);
  return <main className="content-screen">
    <header className="page-header"><div><p className="eyebrow">Search targets</p><h1>Wanted List</h1></div><span className="count-badge">{parsed.length} unique</span></header>
    <p className="page-copy">One Pokémon search term per line. Duplicates and blank lines are ignored automatically.</p>
    <textarea className="wanted-editor" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={'Charizard\nPikachu\nVulpix'} spellCheck="false" autoCapitalize="off" />
    <button className="primary-wide" onClick={() => onSave(parsed)}>Done</button>
  </main>;
}
