import { useEffect, useState, useCallback, useMemo } from 'react';
import { ArrowUpDown, Pencil } from 'lucide-react';
import { api } from '../api/client';
import AppMultiSelect from './AppMultiSelect';
import AppEditForm from './AppEditForm';

const SORT_OPTIONS = [
  { id: 'name', label: 'Name' },
  { id: 'installed', label: 'Recently installed' },
  { id: 'opened', label: 'Last opened' },
];

/**
 * Guesses a URL from a container's published Docker ports, e.g.
 * "0.0.0.0:8096->8096/tcp" -> "http://<server-ip>:8096". Works for the
 * common case (a single published port); fails silently (empty guess) for
 * apps with no published port, host networking, or a reverse proxy in
 * front -- those need the URL typed in by hand in AppEditForm.
 */
function guessUrlFromPorts(ports) {
  const entries = Object.values(ports || {}).flat().filter(Boolean);
  if (entries.length === 0) return '';
  const hostPort = entries[0]?.HostPort;
  if (!hostPort) return '';
  return `http://${window.location.hostname}:${hostPort}`;
}

function AppTile({ app, container, onOpen, onEdit }) {
  const isRunning = container?.status === 'running';
  return (
    <div className="relative group">
      <button
        onClick={() => onOpen(app)}
        className="w-full bg-surface border border-border rounded-xl p-4 flex flex-col items-center gap-2 hover:bg-surface-hover transition-colors text-left"
      >
        <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden">
          {app.icon ? (
            <img src={app.icon} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-gray-400">{app.display_name?.[0] ?? '?'}</span>
          )}
        </div>
        <div className="text-sm font-medium text-center">{app.display_name}</div>
        <div className={`text-xs flex items-center gap-1 ${isRunning ? 'text-good' : 'text-gray-500'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-good' : 'bg-gray-600'}`} />
          {container ? container.status : 'unlinked'}
        </div>
      </button>
      {/* Edit button: hidden until hover so it doesn't clutter the grid,
          stopPropagation so clicking it doesn't also trigger onOpen since
          it sits on top of the tile's own click handler. */}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(app); }}
        title="Edit"
        className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/40 text-gray-400 opacity-0 group-hover:opacity-100 hover:text-accent hover:bg-black/60 transition-opacity"
      >
        <Pencil size={12} />
      </button>
    </div>
  );
}

export default function AppHub() {
  const [apps, setApps] = useState([]);
  const [containers, setContainers] = useState([]);
  const [sortBy, setSortBy] = useState('name');
  const [pendingSetup, setPendingSetup] = useState(null); // container_name awaiting url/name (new app)
  const [editingApp, setEditingApp] = useState(null); // container_name currently being edited (existing app)
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [appsData, containersData] = await Promise.all([api.getApps(), api.listContainers()]);
      setApps(appsData);
      setContainers(containersData);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10000); // container status can change independent of this UI
    return () => clearInterval(interval);
  }, [refresh]);

  const containerFor = (name) => containers.find((c) => c.name === name);

  // Which containers are currently checked in the multi-select.
  const visibleNames = useMemo(
    () => apps.filter((a) => a.visible).map((a) => a.container_name),
    [apps]
  );

  const handleSelectionChange = async (newVisibleNames) => {
    const newlyAdded = newVisibleNames.filter((n) => !apps.some((a) => a.container_name === n));

    // Existing apps: just flip their visible flag.
    let updated = apps.map((a) => ({ ...a, visible: newVisibleNames.includes(a.container_name) }));

    // Brand-new selections have no config entry yet -- if there's exactly
    // one, prompt for its URL before adding it to the grid. If several were
    // just bulk-selected (e.g. via "Select all"), auto-fill all of them from
    // their Docker ports so the UI doesn't stack multiple setup forms.
    if (newlyAdded.length === 1) {
      setPendingSetup(newlyAdded[0]);
      updated = updated; // don't add it to config until the form is submitted
    } else if (newlyAdded.length > 1) {
      for (const name of newlyAdded) {
        const container = containerFor(name);
        updated.push({
          container_name: name,
          display_name: name,
          url: guessUrlFromPorts(container?.ports),
          icon: null,
          visible: true,
          last_opened: null,
        });
      }
    }

    setApps(updated);
    await api.setApps(updated);
  };

  const handleSetupSave = async ({ display_name, url, icon }) => {
    const container = containerFor(pendingSetup);
    const updated = [
      ...apps,
      {
        container_name: pendingSetup,
        display_name,
        url,
        icon,
        visible: true,
        last_opened: null,
      },
    ];
    setApps(updated);
    await api.setApps(updated);
    setPendingSetup(null);
  };

  const handleEditSave = async ({ display_name, url, icon }) => {
    // Update in place: same container_name, everything else replaced with
    // the form's current values. visible/last_opened carry over unchanged
    // since this form never touches them.
    const updated = apps.map((a) =>
      a.container_name === editingApp
        ? { ...a, display_name, url, icon }
        : a
    );
    setApps(updated);
    await api.setApps(updated);
    setEditingApp(null);
  };

  const handleOpen = async (app) => {
    // Open first, track second: browsers can block a popup that isn't
    // triggered synchronously by the click, so don't await the tracking
    // call before calling window.open.
    window.open(app.url, '_blank', 'noopener,noreferrer');
    try {
      await api.markAppOpened(app.container_name);
      setApps((prev) =>
        prev.map((a) =>
          a.container_name === app.container_name
            ? { ...a, last_opened: new Date().toISOString() }
            : a
        )
      );
    } catch {
      // Tracking is a side effect, not a requirement -- the app already
      // opened, so a failed tracking call shouldn't surface as an error.
    }
  };

  const sortedVisibleApps = useMemo(() => {
    const visible = apps.filter((a) => a.visible);
    const withContainer = visible.map((a) => ({ app: a, container: containerFor(a.container_name) }));

    switch (sortBy) {
      case 'installed':
        // Newest first. Missing timestamps sort last.
        return withContainer.sort((a, b) => {
          const ta = a.container?.created ? new Date(a.container.created).getTime() : -Infinity;
          const tb = b.container?.created ? new Date(b.container.created).getTime() : -Infinity;
          return tb - ta;
        });
      case 'opened':
        // Most recently opened first; never-opened apps sort last.
        return withContainer.sort((a, b) => {
          const ta = a.app.last_opened ? new Date(a.app.last_opened).getTime() : -Infinity;
          const tb = b.app.last_opened ? new Date(b.app.last_opened).getTime() : -Infinity;
          return tb - ta;
        });
      case 'name':
      default:
        return withContainer.sort((a, b) =>
          a.app.display_name.localeCompare(b.app.display_name, undefined, { sensitivity: 'base' })
        );
    }
  }, [apps, containers, sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Apps</h2>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <ArrowUpDown size={14} />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-gray-200"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </div>
          <AppMultiSelect
            containers={containers}
            visibleNames={visibleNames}
            onChange={handleSelectionChange}
          />
        </div>
      </div>

      {error && <div className="text-sm text-bad">{error}</div>}

      {pendingSetup && (
        <AppEditForm
          containerName={pendingSetup}
          guessedUrl={guessUrlFromPorts(containerFor(pendingSetup)?.ports)}
          onSave={handleSetupSave}
          onCancel={() => setPendingSetup(null)}
        />
      )}

      {editingApp && (
        <AppEditForm
          containerName={editingApp}
          initialValues={apps.find((a) => a.container_name === editingApp)}
          onSave={handleEditSave}
          onCancel={() => setEditingApp(null)}
        />
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {sortedVisibleApps.map(({ app, container }) => (
          <AppTile
            key={app.container_name}
            app={app}
            container={container}
            onOpen={handleOpen}
            onEdit={(a) => setEditingApp(a.container_name)}
          />
        ))}
      </div>

      {sortedVisibleApps.length === 0 && !pendingSetup && (
        <div className="text-sm text-gray-500 text-center py-8">
          No apps selected yet. Use "Select apps" to add containers to your grid.
        </div>
      )}
    </div>
  );
}
