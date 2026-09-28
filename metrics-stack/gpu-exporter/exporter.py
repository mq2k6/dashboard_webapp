"""
Minimal Prometheus exporter for Intel GPU utilization.

Intel doesn't have a mature Prometheus exporter the way NVIDIA does
(nvidia-smi -> dcgm-exporter is well-trodden; Intel's equivalent is much
rougher), so this shells out to `intel_gpu_top -J` and re-exposes the
result in Prometheus's plain-text exposition format on /metrics, the same
convention node_exporter and cAdvisor use -- so Prometheus scrapes this
exactly like the other two, no special-casing needed in prometheus.yml.

Runs as its own container with /dev/dri passed through (see
docker-compose.yml) since intel_gpu_top needs direct access to the GPU
device node.
"""

import asyncio
import json
import logging
from http.server import BaseHTTPRequestHandler, HTTPServer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gpu-exporter")

PORT = 9200


async def read_gpu_busy_percent() -> float | None:
    try:
        proc = await asyncio.create_subprocess_exec(
            "intel_gpu_top", "-J", "-s", "1000", "-n", "1",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=5)
        if proc.returncode != 0:
            logger.warning("intel_gpu_top exited %s: %s", proc.returncode, stderr.decode(errors="ignore"))
            return None

        text = stdout.decode(errors="ignore").strip()
        data = json.loads(text)
        if isinstance(data, list):
            data = data[-1]

        engines = data.get("engines", {})
        for name, stats in engines.items():
            if "Render" in name or "3D" in name:
                return float(stats.get("busy", 0))
        return None
    except FileNotFoundError:
        logger.error("intel_gpu_top not found -- is intel-gpu-tools installed in this container/host?")
        return None
    except (asyncio.TimeoutError, json.JSONDecodeError, ValueError) as e:
        logger.warning("Failed to read GPU stats: %s", e)
        return None


class MetricsHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != "/metrics":
            self.send_response(404)
            self.end_headers()
            return

        busy = asyncio.run(read_gpu_busy_percent())
        lines = [
            "# HELP intel_gpu_busy_percent Intel GPU render engine busy percentage",
            "# TYPE intel_gpu_busy_percent gauge",
        ]
        if busy is not None:
            lines.append(f"intel_gpu_busy_percent {busy}")
        # If busy is None (tool unavailable/failed), we emit no sample rather
        # than a fake 0 -- Grafana should show "no data" not "0% busy",
        # which would misleadingly look like an idle-but-working GPU.
        body = "\n".join(lines) + "\n"

        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, format, *args):
        pass  # quiet -- Prometheus scrapes this every ~15s, no need to log each hit


if __name__ == "__main__":
    logger.info("GPU exporter listening on :%d/metrics", PORT)
    HTTPServer(("0.0.0.0", PORT), MetricsHandler).serve_forever()
