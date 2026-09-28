"""
Read-only file browser over the //sbox/photos share, mounted into the host
filesystem (see README for the /etc/fstab CIFS mount setup). No write,
rename or delete endpoints exist -- this router can only list directories
and stream file downloads.

SECURITY NOTE: even read-only, every client-supplied path is resolved and
checked against ROOT_DIR before touching the filesystem. Without this, a
request for `../../etc/passwd` would let anyone on your LAN read arbitrary
files on the server -- read-only lowers the stakes of a bug here, it doesn't
remove the need for the check.
"""

import logging
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

logger = logging.getLogger("dashboard.files")
router = APIRouter()

# Must match wherever you mount the CIFS share -- see README.
ROOT_DIR = Path(os.environ.get("DASHBOARD_FILES_ROOT", "/mnt/sbox-photos")).resolve()


def _resolve_safe_path(relative: str) -> Path:
    """
    Resolves a client-supplied relative path against ROOT_DIR and rejects
    anything that escapes it (via `..` segments or a symlink inside the
    share pointing outside it -- .resolve() follows symlinks before the
    containment check runs).
    """
    candidate = (ROOT_DIR / relative.lstrip("/")).resolve()
    if candidate != ROOT_DIR and ROOT_DIR not in candidate.parents:
        raise HTTPException(status_code=400, detail="Path escapes root directory")
    return candidate


@router.get("/list")
def list_dir(path: str = ""):
    target = _resolve_safe_path(path)
    try:
        if not target.exists():
            raise HTTPException(status_code=404, detail="Path not found")
        if not target.is_dir():
            raise HTTPException(status_code=400, detail="Not a directory")

        entries = []
        for entry in sorted(target.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower())):
            stat = entry.stat()
            entries.append({
                "name": entry.name,
                "is_dir": entry.is_dir(),
                "size_bytes": stat.st_size if entry.is_file() else None,
                "modified": stat.st_mtime,
            })
    except OSError as e:
        # Covers a dead/unreachable SMB mount (share offline, network blip)
        # so a stale mount hangs the browser tab with a clear error instead
        # of silently timing out.
        logger.error("Filesystem error listing %s: %s", target, e)
        raise HTTPException(status_code=503, detail="File share unavailable")

    return {"path": path, "entries": entries}


@router.get("/download")
def download_file(path: str):
    target = _resolve_safe_path(path)
    if not target.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(target, filename=target.name)
