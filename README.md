# Homelab Dashboard — Setup Guide

Three tabs: **Server Performance** (Grafana, embedded), **Apps** (a launcher grid for your Docker containers), **Files** (read-only browser over your SMB share).

Two things deploy separately:
- **The metrics stack** (Prometheus, Grafana, cAdvisor, node_exporter, a custom Intel GPU exporter) — Docker Compose.
- **The dashboard app itself** (FastAPI backend + built React frontend) — a native systemd service on the host, since it needs direct access to the Docker socket and your mounted SMB share.

---

## 1. Metrics stack (Prometheus + Grafana)

```bash
cd metrics-stack
docker compose up -d --build
```

This builds the GPU exporter image and starts node_exporter, cAdvisor, the GPU exporter, Prometheus, and Grafana. Confirm they're all up:

```bash
docker compose ps
```

**Check Prometheus is actually scraping everything:** open `http://<server-ip>:9090/targets` — all three targets (`node_exporter`, `cadvisor`, `intel_gpu_exporter`) should show as `UP`. If `intel_gpu_exporter` is down, check its logs:

```bash
docker compose logs gpu-exporter
```

The most likely cause is `/dev/dri` not existing or not being accessible — confirm with `ls -la /dev/dri` on the host.

### Set up Grafana

1. Visit `http://<server-ip>:3000`. Anonymous viewer access is enabled by the compose file, so you'll land straight on the Grafana home page. Log in as `admin`/`admin` (you'll be prompted to change it) only when you want to *edit* dashboards.
2. Add Prometheus as a data source: **Connections → Data sources → Add data source → Prometheus**, URL `http://prometheus:9090` (the container name, since Grafana reaches it over the Compose network).
3. Import a community dashboard rather than building from scratch:
   - **Dashboards → New → Import**, enter ID `1860` (Node Exporter Full) for host metrics.
   - Repeat with ID `19792` or `14282` for cAdvisor per-container metrics (check which is current for your Grafana version — IDs occasionally get superseded).
4. For the GPU metric, add a panel to either dashboard querying `intel_gpu_busy_percent` — there's no premade community dashboard for this custom exporter since it doesn't exist elsewhere.
5. Note the dashboard's UID from its URL (`/d/<uid>/...`) — you'll need it in the frontend config below.

---

## 2. Dashboard app backend

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip cifs-utils

cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

### Docker socket access

```bash
sudo usermod -aG docker $USER
# log out/in, or `newgrp docker`, for this to take effect
```

### Mount the SMB share

```bash
sudo mkdir -p /mnt/sbox-photos
```

Add to `/etc/fstab` (adjust to your actual share):

```
//sbox/photos  /mnt/sbox-photos  cifs  credentials=/etc/samba/dashboard-creds,uid=1000,gid=1000,iocharset=utf8,vers=3.0  0  0
```

```bash
sudo tee /etc/samba/dashboard-creds > /dev/null <<'EOF'
username=YOUR_SMB_USER
password=YOUR_SMB_PASSWORD
EOF
sudo chmod 600 /etc/samba/dashboard-creds
sudo mount -a
df -h | grep sbox   # confirm it mounted
```

---

## 3. Frontend build

Set the Grafana URL and dashboard UID before building:

```bash
cd frontend
echo "VITE_GRAFANA_URL=http://<server-ip>:3000" > .env
```

Then edit `src/components/ServerPerformance.jsx` and replace `YOUR_DASHBOARD_UID` with the UID from the Grafana dashboard you imported/built in step 1.

```bash
npm install
npm run build
```

Produces `frontend/dist/`.

---

## 4. Wire the backend to serve the built frontend

Uncomment the bottom of `backend/app/main.py`:

```python
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="frontend")
```

This must stay the **last** thing added to `app` — it's a catch-all for `/` and would otherwise shadow the `/api` routes.

---

## 5. Run the backend as a systemd service

`/etc/systemd/system/homelab-dashboard.service`:

```ini
[Unit]
Description=Homelab Dashboard
After=network.target docker.service

[Service]
Type=simple
User=YOUR_USERNAME
Group=docker
WorkingDirectory=/opt/homelab-dashboard/backend
Environment=DASHBOARD_FILES_ROOT=/mnt/sbox-photos
ExecStart=/opt/homelab-dashboard/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now homelab-dashboard
sudo systemctl status homelab-dashboard
```

Visit `http://<server-ip>:8000`.

---

## 6. Using the Apps tab

Click **Select apps** to open the multi-select dropdown — every Docker container shows up automatically (infra containers from the metrics stack are hidden via their `dashboard.hide=true` label). Checking a single new app opens a small form to set its display name, URL, and icon, since Docker has no way to know an app's web UI address. Checking several apps at once (e.g. via "Select all") auto-guesses each one's URL from its published Docker port — check these guesses and correct any that are wrong, particularly for containers using host networking or a reverse proxy, where the guess will be empty.

Sort the grid by **Name**, **Recently installed** (Docker's container creation time), or **Last opened** — tracked only for opens that go through this dashboard, so an app you usually open by phone bookmark will look stale in that sort.

---

## 7. Using the Files tab

Read-only: browse and download, no create/delete/rename. Folder shortcuts are stored via `/api/config/shortcuts` — there's no settings UI for these yet, so add them directly:

```bash
curl -X PUT http://localhost:8000/api/config/shortcuts \
  -H "Content-Type: application/json" \
  -d '[{"label": "Vacation Photos", "path": "vacation-photos"}]'
```

---

## 8. Deploying changes after initial setup

**On your dev machine:**
```bash
cd frontend && npm run build
git add -A && git commit -m "..." && git push
```

**On the server:**
```bash
cd /opt/homelab-dashboard && git pull
sudo systemctl restart homelab-dashboard
```

Metrics stack changes (e.g. editing `docker-compose.yml`) are rarer — redeploy with:
```bash
cd metrics-stack && docker compose up -d --build
```

---

## Notes / known limitations

- **GPU metrics**: the custom exporter's output format from `intel_gpu_top` can vary by kernel/driver version. If Prometheus shows the target `UP` but the value is always missing, check `docker compose logs gpu-exporter` for parse errors, and run `intel_gpu_top -J -s 1000 -n 1` manually on the host to see its raw output.
- **Security**: LAN-only, unauthenticated by design, per your requirements. Grafana's anonymous Viewer access and the dashboard app itself should not be exposed to the internet without adding auth first.
- **"Last opened" tracking** only counts clicks through this dashboard's Apps tab — it has no way to know about opens via a bookmark or another device.
- **Auto-guessed app URLs** come from a container's first published port and will be wrong or empty for host-networked containers or anything behind a reverse proxy — always double check a bulk-added app's URL.
