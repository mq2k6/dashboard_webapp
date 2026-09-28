"""
Collects host-level and per-container metrics.

CPU/RAM/network/uptime -> psutil (reliable, cross-platform, no external deps).
GPU (Intel) -> parses `intel_gpu_top` JSON output. This requires the
   `intel-gpu-tools` package: `sudo apt install intel-gpu-tools`.
   Intel doesn't expose a clean "nvidia-smi equivalent" the way NVIDIA does,
   so this is the closest reliable option, but it needs to run with
   appropriate permissions (root, or add the service user to the right group).
Per-container stats -> Docker Engine API via the `docker` python SDK, which
   gives CPU%, memory, and network I/O per container natively -- this is
   what maps to "app by app breakdown of usage" since every app is a container.
"""

import asyncio
import json
import logging
import time

import psutil
import docker

logger = logging.getLogger("dashboard.metrics")

_docker_client = None
_boot_time = psutil.boot_time()

# Track prior per-container CPU counters so we can compute % usage
# between polls (Docker's raw stats are cumulative counters, not %).
_prev_container_stats: dict[str, dict] = {}


def get_docker_client():
    global _docker_client
    if _docker_client is None:
        _docker_client = docker.from_env()
    return _docker_client


async def collect_all() -> dict:
    cpu, ram, net = _collect_host_basic()
    uptime_seconds = time.time() - _boot_time

    gpu_task = asyncio.create_task(_collect_gpu())
    containers_task = asyncio.create_task(_collect_container_stats())

    gpu, containers = await asyncio.gather(gpu_task, containers_task)

    return {
        "timestamp": time.time(),
        "host": {
            "cpu_percent": cpu,
            "ram": ram,
            "network": net,
            "uptime_seconds": uptime_seconds,
            "gpu": gpu,
        },
        "containers": containers,
    }


def _collect_host_basic():
    cpu = psutil.cpu_percent(interval=None)  # non-blocking; first call may read 0.0, subsequent calls are accurate
    vm = psutil.virtual_memory()
    ram = {
        "total_bytes": vm.total,
        "used_bytes": vm.used,
        "percent": vm.percent,
    }
    io = psutil.net_io_counters()
    net = {
        "bytes_sent": io.bytes_sent,
        "bytes_recv": io.bytes_recv,
    }
    return cpu, ram, net


async def _collect_gpu() -> dict | None:
    """
    Runs `intel_gpu_top -J -s 1000` for a single sample and parses the JSON.
    Returns None if the tool isn't installed or fails -- the frontend should
    treat a null gpu field as "unavailable" rather than erroring.
    """
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
        # intel_gpu_top -n 1 -J sometimes emits a bare object, sometimes wraps
        # in an array depending on version -- handle both.
        data = json.loads(text if not text.startswith("[") else text)
        if isinstance(data, list):
            data = data[-1]

        engines = data.get("engines", {})
        render_busy = None
        for name, stats in engines.items():
            if "Render" in name or "3D" in name:
                render_busy = stats.get("busy")
                break

        return {
            "busy_percent": render_busy,
            "raw_engines": {k: v.get("busy") for k, v in engines.items()},
        }
    except FileNotFoundError:
        logger.info("intel_gpu_top not installed; GPU metrics disabled. Install `intel-gpu-tools`.")
        return None
    except (asyncio.TimeoutError, json.JSONDecodeError) as e:
        logger.warning("Failed to read GPU stats: %s", e)
        return None


async def _collect_container_stats() -> list[dict]:
    """
    Pulls one-shot (non-streaming) stats per running container and computes
    CPU% the same way `docker stats` does internally: delta of container CPU
    usage over delta of system CPU usage, scaled by core count.
    """
    client = get_docker_client()
    loop = asyncio.get_event_loop()

    def _sync_collect():
        results = []
        try:
            containers = client.containers.list()
        except Exception:
            logger.exception("Failed to list containers")
            return results

        for c in containers:
            try:
                stats = c.stats(stream=False)
                cpu_percent = _calc_cpu_percent(stats)
                mem_usage = stats.get("memory_stats", {}).get("usage", 0)
                mem_limit = stats.get("memory_stats", {}).get("limit", 1)

                results.append({
                    "id": c.short_id,
                    "name": c.name,
                    "image": c.image.tags[0] if c.image.tags else c.image.short_id,
                    "status": c.status,
                    "cpu_percent": cpu_percent,
                    "mem_usage_bytes": mem_usage,
                    "mem_limit_bytes": mem_limit,
                    "mem_percent": round((mem_usage / mem_limit) * 100, 2) if mem_limit else 0,
                })
            except Exception:
                logger.exception("Failed to collect stats for container %s", c.name)
        return results

    return await loop.run_in_executor(None, _sync_collect)


def _calc_cpu_percent(stats: dict) -> float:
    try:
        cpu_delta = (
            stats["cpu_stats"]["cpu_usage"]["total_usage"]
            - stats["precpu_stats"]["cpu_usage"]["total_usage"]
        )
        system_delta = (
            stats["cpu_stats"]["system_cpu_usage"]
            - stats["precpu_stats"]["system_cpu_usage"]
        )
        num_cpus = stats["cpu_stats"].get("online_cpus") or len(
            stats["cpu_stats"]["cpu_usage"].get("percpu_usage", [1])
        )
        if system_delta > 0 and cpu_delta > 0:
            return round((cpu_delta / system_delta) * num_cpus * 100.0, 2)
    except (KeyError, ZeroDivisionError, TypeError):
        pass
    return 0.0
