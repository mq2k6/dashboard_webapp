import { useState, useMemo } from 'react';
import { Listbox } from '@headlessui/react';
import { Check, ChevronDown, Search } from 'lucide-react';

/**
 * Multi-select dropdown listing every container Docker knows about.
 * Checked = shown in the Apps grid. Backed by @headlessui/react's Listbox
 * in multiple-select mode, which handles keyboard nav, focus and
 * outside-click closing so we don't have to build that by hand.
 */
export default function AppMultiSelect({ containers, visibleNames, onChange }) {
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return containers;
    return containers.filter((c) => c.name.toLowerCase().includes(q));
  }, [containers, filter]);

  return (
    <Listbox value={visibleNames} onChange={onChange} multiple>
      <div className="relative">
        <Listbox.Button className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-surface-hover">
          Select apps ({visibleNames.length} shown)
          <ChevronDown size={14} />
        </Listbox.Button>
        <Listbox.Options className="absolute z-10 mt-2 w-72 max-h-96 overflow-auto bg-surface border border-border rounded-lg shadow-lg p-2">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1 border-b border-border">
            <Search size={14} className="text-gray-500" />
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder="Filter containers..."
              className="bg-transparent text-sm outline-none w-full"
            />
          </div>
          <div className="flex gap-2 px-2 py-1 text-xs text-accent">
            <button onClick={() => onChange(containers.map((c) => c.name))}>Select all</button>
            <span className="text-gray-600">·</span>
            <button onClick={() => onChange([])}>Clear all</button>
          </div>
          {filtered.length === 0 && (
            <div className="px-2 py-4 text-sm text-gray-500 text-center">No containers match</div>
          )}
          {filtered.map((container) => (
            <Listbox.Option
              key={container.name}
              value={container.name}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-surface-hover text-sm"
            >
              {({ selected }) => (
                <>
                  <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${selected ? 'bg-accent border-accent' : 'border-border'}`}>
                    {selected && <Check size={12} className="text-black" />}
                  </span>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${container.status === 'running' ? 'bg-good' : 'bg-gray-600'}`} />
                  <span className="truncate">{container.name}</span>
                </>
              )}
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </div>
    </Listbox>
  );
}
