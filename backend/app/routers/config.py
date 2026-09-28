"""
Docker knows a container's name, image and creation time -- it doesn't know
whether that container has a web UI, what URL it lives at, whether you want
it in your grid, or when you last clicked it. That's all tracked here in a
small JSON file, edited through these endpoints (and, day to day, through
the Apps tab's UI -- not by hand).

Deliberately a flat JSON file, not a database: this is a single-user LAN
dashboard, so a DB would be overkill.
"""

import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger("dashboard.config")
router = APIRouter()

CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
APPS_FILE = CONFIG_DIR / "apps.json"
SHORTCUTS_FILE = CONFIG_DIR / "shortcuts.json"

CONFIG_DIR.mkdir(parents=True, exist_ok=True)


class AppEntry(BaseModel):
    container_name: str  # must match the Docker container name exactly
    display_name: str
    url: str              # e.g. "http://192.168.1.50:8096" for Jellyfin
    icon: str | None = None
    visible: bool = True
    last_opened: str | None = None  # ISO 8601 UTC timestamp, set via /apps/{name}/opened


class ShortcutEntry(BaseModel):
    label: str
    path: str  # path relative to the file explorer root


def _load(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        logger.error("Corrupt config file %s, returning default", path)
        return default


def _save_atomic(path: Path, data):
    """
    Writes to a temp file in the same directory, then renames over the
    original. The rename is atomic, so a crash or power loss mid-write
    can't leave a half-written, unparseable config file -- you either get
    the old version or the new one, never a corrupt in-between.
    """
    fd, tmp_path = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, path)
    except Exception:
        os.unlink(tmp_path)
        raise


@router.get("/apps")
def get_apps() -> list[dict]:
    return _load(APPS_FILE, [])


@router.put("/apps")
def set_apps(apps: list[AppEntry]):
    """Frontend sends the full list back after any edit (visibility toggle, add, remove)."""
    data = [a.model_dump() for a in apps]
    _save_atomic(APPS_FILE, data)
    return data


@router.post("/apps/{container_name}/opened")
def mark_app_opened(container_name: str):
    """
    Called by the frontend the moment an app tile is clicked. Uses the
    server's clock (not the browser's) so timestamps agree across devices
    regardless of client clock drift.
    """
    apps = _load(APPS_FILE, [])
    found = False
    for app in apps:
        if app["container_name"] == container_name:
            app["last_opened"] = datetime.now(timezone.utc).isoformat()
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="App not found in config")
    _save_atomic(APPS_FILE, apps)
    return {"status": "ok"}


@router.get("/shortcuts")
def get_shortcuts() -> list[dict]:
    return _load(SHORTCUTS_FILE, [])


@router.put("/shortcuts")
def set_shortcuts(shortcuts: list[ShortcutEntry]):
    data = [s.model_dump() for s in shortcuts]
    _save_atomic(SHORTCUTS_FILE, data)
    return data
