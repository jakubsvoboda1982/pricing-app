"""
Vercel Python entrypoint.

Vercel runtime @vercel/python detekuje ASGI `app` a obslouží jím požadavky.
Rewrite v `vercel.json` směruje všechny `/api/*` cesty sem; routery v
backendu mají prefix `/api/...`, takže cesty sedí 1:1.
"""

import os
import sys

# Přidej backend do sys.path, ať jde importovat balíček `app`
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.main import app  # noqa: E402,F401
