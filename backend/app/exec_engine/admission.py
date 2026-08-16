"""
backend/app/exec_engine/admission.py
Concurrency guard for the Docker execution engine (§13.2).

Prevents:
  - More than MAX_CONCURRENT_RUNS containers alive at once
  - More than PER_USER_CONCURRENT runs from the same user
  - Unbounded queue growth (RUN_QUEUE_MAX)

429 responses include a Retry-After header so the client can back off.
"""
import threading
from contextlib import contextmanager
from flask import current_app


class _UserCounter:
    """Thread-safe per-user run counter."""
    def __init__(self):
        self._lock = threading.Lock()
        self._counts: dict[str, int] = {}

    def acquire(self, user_id: str, limit: int) -> bool:
        with self._lock:
            n = self._counts.get(user_id, 0)
            if n >= limit:
                return False
            self._counts[user_id] = n + 1
            return True

    def release(self, user_id: str):
        with self._lock:
            n = self._counts.get(user_id, 0)
            if n > 0:
                self._counts[user_id] = n - 1


class AdmissionControl:
    """
    Singleton-ish — one instance per app, created in reaper.py init.
    Uses a semaphore for total concurrency and a bounded wait queue.
    """
    def __init__(self, max_concurrent: int, queue_max: int,
                 per_user: int, wait_timeout: int):
        self._sem         = threading.Semaphore(max_concurrent)
        self._queue_lock  = threading.Lock()
        self._queue_size  = 0
        self._queue_max   = queue_max
        self._per_user    = per_user
        self._wait_timeout = wait_timeout
        self._user_counter = _UserCounter()

    @contextmanager
    def acquire(self, user_id: str):
        """
        Context manager — yields inside the guard, raises AdmissionError on failure.
        """
        # Per-user cap
        if not self._user_counter.acquire(user_id, self._per_user):
            raise AdmissionError(
                f"You already have {self._per_user} run(s) in progress. "
                "Wait for one to finish before submitting again.",
                retry_after=5
            )
        try:
            # Global queue cap
            with self._queue_lock:
                if self._queue_size >= self._queue_max:
                    raise AdmissionError(
                        "The lab is busy. Please try again in a few seconds.",
                        retry_after=10
                    )
                self._queue_size += 1
            try:
                # Wait for a concurrency slot
                acquired = self._sem.acquire(timeout=self._wait_timeout)
                if not acquired:
                    raise AdmissionError(
                        "The lab is busy. Please try again in a few seconds.",
                        retry_after=self._wait_timeout
                    )
                try:
                    yield
                finally:
                    self._sem.release()
            finally:
                with self._queue_lock:
                    self._queue_size -= 1
        finally:
            self._user_counter.release(user_id)


class AdmissionError(Exception):
    def __init__(self, message: str, retry_after: int = 10):
        super().__init__(message)
        self.retry_after = retry_after


# Module-level singleton, initialised by reaper.init_app()
_admission: AdmissionControl | None = None


def get() -> AdmissionControl:
    if _admission is None:
        raise RuntimeError("AdmissionControl not initialised — call admission.init_app(app) first")
    return _admission


def init_app(app):
    """Call once from app/__init__.py after config is loaded."""
    global _admission
    with app.app_context():
        _admission = AdmissionControl(
            max_concurrent=app.config.get('EXEC_MAX_CONCURRENT_RUNS', 4),
            queue_max=app.config.get('EXEC_RUN_QUEUE_MAX', 12),
            per_user=app.config.get('EXEC_PER_USER_CONCURRENT', 2),
            wait_timeout=app.config.get('EXEC_QUEUE_WAIT_TIMEOUT', 20),
        )
