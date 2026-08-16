"""
backend/app/exec_engine/__init__.py
Public API for the Docker execution engine (v2).

Usage:
    from app.exec_engine import run
    result = run(code='print("hi")', language='python', stdin='')
    # result is the same dict shape as _shape_result() in execution/routes.py
"""
from app.exec_engine.runner import run  # noqa: F401 — re-exported

__all__ = ['run']
