import { useEffect, useState, useCallback } from 'react';
import { Folder, File as FileIcon, Download, ChevronRight, Home } from 'lucide-react';
import { api } from '../api/client';

function formatBytes(bytes) {
  if (bytes == null) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

export default function FileExplorer() {
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState([]);
  const [shortcuts, setShortcuts] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.listDir(p);
      setEntries(res.entries);
      setPath(res.path);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load('');
    api.getShortcuts().then(setShortcuts).catch(() => {});
  }, [load]);

  const crumbs = path ? path.split('/').filter(Boolean) : [];

  const goTo = (index) => {
    const newPath = crumbs.slice(0, index + 1).join('/');
    load(newPath);
  };

  const handleEntryClick = (entry) => {
    if (entry.is_dir) {
      load(path ? `${path}/${entry.name}` : entry.name);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Files</h2>

      {shortcuts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {shortcuts.map((s) => (
            <button
              key={s.path}
              onClick={() => load(s.path)}
              className="text-xs px-3 py-1 rounded-full bg-surface border border-border hover:bg-surface-hover"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 text-sm text-gray-400 flex-wrap">
        <button onClick={() => load('')} className="flex items-center gap-1 hover:text-gray-200">
          <Home size={14} /> root
        </button>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={12} />
            <button onClick={() => goTo(i)} className="hover:text-gray-200">{c}</button>
          </span>
        ))}
      </div>

      {error && (
        <div className="text-sm text-bad bg-bad/10 border border-bad/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-500 p-6 text-center">Loading…</div>
      ) : (
        <div className="bg-surface border border-border rounded-xl divide-y divide-border/50">
          {entries.length === 0 && (
            <div className="p-6 text-sm text-gray-500 text-center">Empty folder</div>
          )}
          {entries.map((entry) => (
            <div
              key={entry.name}
              onClick={() => handleEntryClick(entry)}
              className={`flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover ${entry.is_dir ? 'cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {entry.is_dir ? <Folder size={16} className="text-accent flex-shrink-0" /> : <FileIcon size={16} className="text-gray-500 flex-shrink-0" />}
                <span className="text-sm truncate">{entry.name}</span>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {!entry.is_dir && <span className="text-xs text-gray-500">{formatBytes(entry.size_bytes)}</span>}
                {!entry.is_dir && (
                  <a
                    href={api.downloadUrl(path ? `${path}/${entry.name}` : entry.name)}
                    onClick={(e) => e.stopPropagation()}
                    className="p-1.5 rounded hover:bg-black/30 text-gray-400"
                    title="Download"
                  >
                    <Download size={14} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
