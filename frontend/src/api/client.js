const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      // response wasn't JSON; fall back to statusText
    }
    throw new Error(detail);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return res;
}

export const api = {
  // containers
  listContainers: () => request('/containers/'),
  startContainer: (id) => request(`/containers/${id}/start`, { method: 'POST' }),
  stopContainer: (id) => request(`/containers/${id}/stop`, { method: 'POST' }),
  restartContainer: (id) => request(`/containers/${id}/restart`, { method: 'POST' }),

  // app hub config
  getApps: () => request('/config/apps'),
  setApps: (apps) => request('/config/apps', { method: 'PUT', body: JSON.stringify(apps) }),
  markAppOpened: (containerName) => request(`/config/apps/${containerName}/opened`, { method: 'POST' }),
  getShortcuts: () => request('/config/shortcuts'),
  setShortcuts: (shortcuts) => request('/config/shortcuts', { method: 'PUT', body: JSON.stringify(shortcuts) }),

  // files (read-only)
  listDir: (path = '') => request(`/files/list?path=${encodeURIComponent(path)}`),
  downloadUrl: (path) => `${BASE}/files/download?path=${encodeURIComponent(path)}`,
};
