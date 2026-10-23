"""
Analytics freshness layer.

Why this exists
---------------
Analytics is read far more often than it is written, but a read must never show
a number that is older than the last write to the rows behind it. This module
gives us both: a very cheap cache for the expensive aggregates, invalidated by
the writes themselves instead of by a nightly job.

Two primitives
--------------
``bump(institution_id)``
    Called (automatically, via SQLAlchemy flush hooks) whenever a row that can
    move an analytics number is inserted/updated/deleted. It increments a
    per-institution version counter and drops that institution's cache entries.

``cached(key, producer, ttl, institution_id)``
    Returns the cached payload while the version is unchanged and the TTL has
    not expired, otherwise recomputes and stores it. A concurrent writer that
    lands mid-computation can only cause one extra recompute — never a stale
    result, because the stored entry carries the version it was computed under.

Everything is process-local and thread-safe; with a single Flask process this is
exactly what we want. If the app is ever run multi-process, swap the dict for
Redis behind the same two functions.
"""

import threading
import time
from typing import Any, Callable, Dict, Optional, Tuple

_lock = threading.RLock()

# institution_id -> monotonically increasing version
_versions: Dict[str, int] = {}
# cache key -> (version, computed_at_monotonic, payload)
_entries: Dict[str, Tuple[int, float, Any]] = {}

DEFAULT_TTL = 60.0  # seconds


def _key(institution_id: Optional[str]) -> str:
    return institution_id or '_global'


def version(institution_id: Optional[str] = None) -> int:
    """None returns the global counter (moves on *any* analytics-affecting write)."""
    with _lock:
        if institution_id is None:
            return _versions.get('_global', 0)
        return _versions.get(_key(institution_id), 0)


def bump(institution_id: Optional[str] = None) -> None:
    """Invalidate every cached analytics payload for an institution."""
    k = _key(institution_id)
    with _lock:
        _versions[k] = _versions.get(k, 0) + 1
        # Any analytics-relevant write also advances the global counter so
        # coarse (HTTP-level) caches cannot serve a pre-write payload.
        _versions['_global'] = _versions.get('_global', 0) + 1
        stale = [ck for ck in _entries if ck.startswith(k + '|')]
        for ck in stale:
            _entries.pop(ck, None)


def clear() -> None:
    with _lock:
        _entries.clear()


def cached(
    key: str,
    producer: Callable[[], Any],
    ttl: float = DEFAULT_TTL,
    institution_id: Optional[str] = None,
) -> Any:
    """Version-aware, TTL-bounded memoisation."""
    k = _key(institution_id)
    ck = f'{k}|{key}'
    v = version(institution_id)

    with _lock:
        hit = _entries.get(ck)
        if hit is not None:
            hit_version, computed_at, payload = hit
            if hit_version == v and (time.monotonic() - computed_at) < ttl:
                return payload

    payload = producer()
    with _lock:
        _entries[ck] = (v, time.monotonic(), payload)
    return payload


def stats() -> Dict[str, Any]:
    with _lock:
        return {
            'entries': len(_entries),
            'institutions': {k: v for k, v in _versions.items()},
        }


# ── Automatic invalidation on write ───────────────────────────────────────────
_installed = False

# Any of these changing can move a KPI, a trend, a risk score or a rank.
_WATCHED_TABLES = {
    'grades',
    'session_attendances',
    'proctor_events',
    'code_attempts',
    'concept_mastery',
    'focus_scores',
    'hint_logs',
    'lab_sessions',
    'experiment_submissions',
}


def install_hooks() -> None:
    """
    Attach a flush hook to the SQLAlchemy session so *every* write path — API
    route, background job, CLI script — invalidates analytics without having to
    remember to call ``bump()``.
    """
    global _installed
    if _installed:
        return

    from sqlalchemy import event
    from sqlalchemy.orm import Session

    @event.listens_for(Session, 'after_flush')
    def _after_flush(session, flush_context):  # noqa: ARG001
        touched = set()
        for obj in list(session.new) + list(session.dirty) + list(session.deleted):
            table = getattr(getattr(obj, '__table__', None), 'name', None)
            if table in _WATCHED_TABLES:
                touched.add(getattr(obj, 'institution_id', None))
        for inst_id in touched:
            bump(inst_id)
        # A write we could not attribute to an institution invalidates globally.
        if None in touched:
            bump(None)

    _installed = True


# ── HTTP response cache for analytics endpoints ──────────────────────────────
def init_http_cache(app, ttl: float = 45.0) -> None:
    """
    One hook, no per-route edits: cache GET /api/…/analytics… responses keyed by
    (auth subject, institution, full path + query). Entries carry the freshness
    version they were produced under, so any write to a watched table makes them
    misses immediately.

    Each payload is identical for every reader with the same token, so this only
    ever trades repeated identical work — never correctness.
    """
    import hashlib
    import json as _json
    from flask import request

    _store: Dict[str, Tuple[int, float, Any]] = {}
    _store_lock = threading.RLock()

    def _subject_key() -> str:
        auth = request.headers.get('Authorization', '') or request.cookies.get('access_token', '')
        return hashlib.sha1(auth.encode('utf-8')).hexdigest()[:16] if auth else 'anon'

    def _eligible() -> bool:
        return (
            request.method == 'GET'
            and '/analytics' in request.path
            and not app.config.get('TESTING')
        )

    @app.before_request
    def _analytics_cache_hit():
        if not _eligible():
            return None
        key = f'{_subject_key()}|{request.full_path}'
        v = version(None)
        with _store_lock:
            hit = _store.get(key)
        if hit and hit[0] == v and (time.monotonic() - hit[1]) < ttl:
            from flask import Response
            return Response(hit[2], mimetype='application/json')
        return None

    @app.after_request
    def _analytics_cache_store(response):
        if not _eligible() or response.status_code != 200:
            return response
        if not response.is_json:
            return response
        key = f'{_subject_key()}|{request.full_path}'
        try:
            payload = response.get_data(as_text=True)
        except Exception:
            return response
        with _store_lock:
            if len(_store) > 2000:      # bounded memory
                _store.clear()
            _store[key] = (version(None), time.monotonic(), payload)
        response.headers['X-Analytics-Cache'] = 'stored'
        return response
