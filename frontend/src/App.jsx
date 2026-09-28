import { useState } from 'react';
import { Gauge, LayoutGrid, FolderOpen } from 'lucide-react';
import ServerPerformance from './components/ServerPerformance';
import AppHub from './components/AppHub';
import FileExplorer from './components/FileExplorer';

const TABS = [
  { id: 'performance', label: 'Server Performance', icon: Gauge },
  { id: 'apps', label: 'Apps', icon: LayoutGrid },
  { id: 'files', label: 'Files', icon: FolderOpen },
];

export default function App() {
  const [tab, setTab] = useState('performance');

  return (
    <div className="min-h-screen bg-bg text-gray-100">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Homelab Dashboard</h1>
          <nav className="flex gap-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  tab === id ? 'bg-accent/20 text-accent' : 'text-gray-400 hover:text-gray-200 hover:bg-surface-hover'
                }`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {tab === 'performance' && <ServerPerformance />}
        {tab === 'apps' && <AppHub />}
        {tab === 'files' && <FileExplorer />}
      </main>
    </div>
  );
}
