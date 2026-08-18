"""
backend/app/exec_engine/__init__.py
Public API for the Docker execution engine (v2).

Usage:
    from app.exec_engine import run
    result = run(code='print("hi")', language='python', stdin='')
    # result is a flat dict: status_id / status / stdout / stderr / time_ms / memory_kb / …
"""
from app.exec_engine.runner import run  # noqa: F401 — re-exported

__all__ = ['run']
