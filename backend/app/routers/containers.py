"""
Container listing for the Apps tab.

Every container Docker knows about is a candidate app -- this is what backs
the multi-select dropdown (pick which ones show in the grid) and the
"installed recency" sort (Docker's container Created timestamp).

Containers you never want to see in that dropdown (Prometheus, cAdvisor,
node_exporter, your GPU exporter) can be hidden by adding a Docker label:

    labels:
      - "dashboard.hide=true"

in their compose service definition. This filters them out server-side so
they never clutter the picker.
"""

import logging
from fastapi import APIRouter, HTTPException
import docker

from app.services.docker_client import get_docker_client

logger = logging.getLogger("dashboard.containers")
router = APIRouter()

_installed_images_cache: list[dict] = []


def refresh_installed_images():
    global _installed_images_cache
    client = get_docker_client()
    images = client.images.list()
    _installed_images_cache = [
        {
            "id": img.short_id,
            "tags": img.tags,
            "size_bytes": img.attrs.get("Size"),
            "created": img.attrs.get("Created"),
        }
        for img in images
    ]
    return _installed_images_cache


@router.on_event("startup")
def _startup_refresh():
    try:
        refresh_installed_images()
    except Exception:
        logger.exception("Failed to load installed images on startup")


@router.get("/installed")
def list_installed_images():
    """All images present on the host -- refreshed at startup, or on demand below."""
    return _installed_images_cache


@router.post("/installed/refresh")
def refresh_installed_images_endpoint():
    return refresh_installed_images()


@router.get("/")
def list_containers(include_hidden: bool = False):
    """
    All containers (running + stopped), with name/image/status/created --
    backs the Apps tab's multi-select dropdown and "installed recency" sort.

    Containers labeled dashboard.hide=true (your metrics-stack infra) are
    excluded by default; pass include_hidden=true to see everything.
    """
    client = get_docker_client()
    containers = client.containers.list(all=True)
    results = []
    for c in containers:
        labels = c.labels or {}
        if not include_hidden and labels.get("dashboard.hide") == "true":
            continue
        results.append({
            "id": c.short_id,
            "name": c.name,
            "image": c.image.tags[0] if c.image.tags else c.image.short_id,
            "status": c.status,
            "created": c.attrs.get("Created"),
            "ports": c.attrs.get("NetworkSettings", {}).get("Ports", {}),
        })
    return results


@router.post("/{container_id}/start")
def start_container(container_id: str):
    client = get_docker_client()
    try:
        client.containers.get(container_id).start()
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    return {"status": "started"}


@router.post("/{container_id}/stop")
def stop_container(container_id: str):
    client = get_docker_client()
    try:
        client.containers.get(container_id).stop()
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    return {"status": "stopped"}


@router.post("/{container_id}/restart")
def restart_container(container_id: str):
    client = get_docker_client()
    try:
        client.containers.get(container_id).restart()
    except docker.errors.NotFound:
        raise HTTPException(status_code=404, detail="Container not found")
    return {"status": "restarted"}
