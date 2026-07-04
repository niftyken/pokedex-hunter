import { useEffect, useMemo, useState } from 'react';
import { parseWantedList } from '../lib/matching';
import { formatDexNumber, searchPokemonSpecies, type PokemonSpecies } from '../lib/species';

export function WantedListScreen({ wantedList, onSave }: { wantedList: string[]; onSave: (items: string[]) => void }) {
  const [raw, setRaw] = useState(wantedList.join('\n'));
  const [addQuery, setAddQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addNote, setAddNote] = useState('');
  useEffect(() => setRaw(wantedList.join('\n')), [wantedList]);
  const parsed = parseWantedList(raw);
  const suggestions = useMemo(() => searchPokemonSpecies(addQuery, parsed, 5), [addQuery, parsed]);

  function addSpecies(species: PokemonSpecies) {
    const alreadyPresent = parsed.some((item) => item.toLowerCase() === species.name.toLowerCase());
    if (alreadyPresent) setAddNote(`${species.name} is already listed.`);
    else {
      setRaw((current) => current.trim() ? `${current.trim()}\n${species.name}` : species.name);
      setAddNote(`Added ${species.name} ${formatDexNumber(species.dex)}.`);
    }
    setAddQuery('');
    setAddOpen(false);
  }

  return <main className="content-screen">
    <header className="page-header"><div><p className="eyebrow">Search targets</p><h1>Want List</h1></div><span className="count-badge">{parsed.length} unique</span></header>
    <p className="page-copy">One Pokémon search term per line. Duplicates and blank lines are ignored automatically.</p>
    <section className="wanted-typeahead" aria-label="Add a Pokémon to the Want List">
      <label>Add a Pokémon</label>
      <div className="wanted-add-input">
        <input value={addQuery} onFocus={() => setAddOpen(true)} onChange={(event) => { setAddQuery(event.target.value); setAddOpen(true); setAddNote(''); }} onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (suggestions[0]) addSpecies(suggestions[0]);
        }} placeholder="Start typing a Pokémon name" autoCapitalize="words" spellCheck="false" />
      </div>
      {addOpen && addQuery.trim() && suggestions.length > 0 && <div className="typeahead-menu wanted-menu" role="listbox" aria-label="Pokémon suggestions">
        {suggestions.map((species) => <button key={species.dex} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addSpecies(species)}><span>{species.name}</span><small>{formatDexNumber(species.dex)}</small></button>)}
      </div>}
      {addNote && <p className="add-note">{addNote}</p>}
    </section>

    <textarea className="wanted-editor" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={'Charizard\nPikachu\nVulpix'} spellCheck="false" autoCapitalize="off" />
    <button className="primary-wide" onClick={() => onSave(parsed)}>Done</button>
  </main>;
}
