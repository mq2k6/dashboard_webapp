import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import containers, files, config as config_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("dashboard")

app = FastAPI(title="Homelab Dashboard API")

# LAN-only deployment: CORS wide open is fine here since this never leaves your network.
# If you ever expose this beyond your LAN, lock allow_origins down to your actual frontend origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(containers.router, prefix="/api/containers", tags=["containers"])
app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(config_router.router, prefix="/api/config", tags=["config"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Serving the built frontend: uncomment once you've run `npm run build` in
# frontend/ and have a frontend/dist directory. Must stay LAST in this file --
# it's a catch-all mount for "/" and would shadow the /api routes above if
# added before them.
#
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="../frontend/dist", html=True), name="frontend")
