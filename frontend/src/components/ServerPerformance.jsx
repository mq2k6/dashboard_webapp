// Grafana base URL, e.g. "http://192.168.1.100:3000" -- this must be an
// address your BROWSER can reach, not the server's own localhost, since the
// iframe is loaded client-side. Set it once here or wire up an env var.
const GRAFANA_BASE_URL = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3000';

// The dashboard UID + slug from Grafana's own "Share" panel, in kiosk mode
// (hides Grafana's nav chrome so only the panels show). Replace this with
// your actual imported dashboard's UID once you've set it up in Grafana --
// see README for the node_exporter / cAdvisor dashboard import steps.
const DASHBOARD_PATH = '/d/YOUR_DASHBOARD_UID/server-overview';

const IFRAME_URL = `${GRAFANA_BASE_URL}${DASHBOARD_PATH}?orgId=1&kiosk&theme=dark&refresh=10s`;

export default function ServerPerformance() {
  return (
    <div className="h-[calc(100vh-88px)] -mx-6 -mb-6">
      <iframe
        title="Grafana dashboard"
        src={IFRAME_URL}
        className="w-full h-full border-0"
        // Grafana needs to run with GF_SECURITY_ALLOW_EMBEDDING=true and
        // anonymous Viewer access enabled, or this will show a login page
        // instead of your panels. See README.
      />
    </div>
  );
}
