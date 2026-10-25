"""
app/services/storage.py — pluggable file storage facade (local | cloudinary | gdrive).

Callers (certificates, exports, generated docs, uploads) use:

    from app.services.storage import store_bytes, store_file
    result = store_file('/path/cert.pdf', 'certificates/cert_123.pdf')
    # -> {'backend': 'gdrive', 'url': 'https://drive.google.com/...?', 'key': ...}

Selection: env STORAGE_BACKEND = local (default) | cloudinary | gdrive.
If the chosen cloud backend is unconfigured or errors, the local copy is
always written first and returned as a graceful fallback — nothing 500s.
"""
import hashlib
import json
import mimetypes
import os
import time
from pathlib import Path

import requests
from flask import current_app

UPLOAD_ROOT = Path(os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads')).resolve()

_gdrive_cache = {'access_token': None, 'expires_at': 0}


# ── local (always runs — fallback + default) ────────────────────────────────

def _local_save(key: str, data: bytes) -> str:
    path = (UPLOAD_ROOT / key).resolve()
    if not str(path).startswith(str(UPLOAD_ROOT)):
        raise ValueError('storage key escapes uploads root')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return str(path)


# ── Cloudinary (signed REST upload — no SDK dependency) ─────────────────────

def _cloudinary_save(key: str, data: bytes, content_type: str) -> dict | None:
    cloud = os.environ.get('CLOUDINARY_CLOUD_NAME', '')
    api_key = os.environ.get('CLOUDINARY_API_KEY', '')
    api_secret = os.environ.get('CLOUDINARY_API_SECRET', '')
    if not (cloud and api_key and api_secret):
        return None
    public_id = f"nexlab/{os.path.splitext(key)[0]}"
    timestamp = str(int(time.time()))
    # signature = sha1(sorted params + api_secret)
    to_sign = f"public_id={public_id}&timestamp={timestamp}{api_secret}"
    signature = hashlib.sha1(to_sign.encode()).hexdigest()
    try:
        resp = requests.post(
            f'https://api.cloudinary.com/v1_1/{cloud}/auto/upload',
            data={'public_id': public_id, 'timestamp': timestamp,
                  'api_key': api_key, 'signature': signature},
            files={'file': (os.path.basename(key), data, content_type)},
            timeout=60,
        )
        if resp.status_code >= 300:
            current_app.logger.warning('[storage] cloudinary HTTP %s', resp.status_code)
            return None
        j = resp.json()
        return {'url': j.get('secure_url'), 'public_id': j.get('public_id')}
    except Exception as exc:
        current_app.logger.warning('[storage] cloudinary failed: %s', exc)
        return None


# ── Google Drive (OAuth2 refresh-token, drive.file scope) ───────────────────

def _gdrive_access_token() -> str | None:
    if _gdrive_cache['access_token'] and _gdrive_cache['expires_at'] > time.time() + 60:
        return _gdrive_cache['access_token']
    client_id = os.environ.get('GDRIVE_CLIENT_ID', '')
    client_secret = os.environ.get('GDRIVE_CLIENT_SECRET', '')
    refresh = os.environ.get('GDRIVE_REFRESH_TOKEN', '')
    if not (client_id and client_secret and refresh):
        return None
    try:
        resp = requests.post('https://oauth2.googleapis.com/token', data={
            'client_id': client_id, 'client_secret': client_secret,
            'refresh_token': refresh, 'grant_type': 'refresh_token',
        }, timeout=30)
        if resp.status_code != 200:
            current_app.logger.warning('[storage] gdrive token HTTP %s', resp.status_code)
            return None
        tok = resp.json().get('access_token')
        _gdrive_cache['access_token'] = tok
        _gdrive_cache['expires_at'] = time.time() + 3500
        return tok
    except Exception as exc:
        current_app.logger.warning('[storage] gdrive token refresh failed: %s', exc)
        return None


def _gdrive_save(key: str, data: bytes, content_type: str) -> dict | None:
    token = _gdrive_access_token()
    if not token:
        return None
    folder_id = os.environ.get('GDRIVE_FOLDER_ID', '')   # optional parent folder
    try:
        meta = {'name': os.path.basename(key)}
        if folder_id:
            meta['parents'] = [folder_id]
        resp = requests.post(
            'https://www.googleapis.com/upload/drive/v3/files'
            '?uploadType=multipart&fields=id,webViewLink,size',
            headers={'Authorization': f'Bearer {token}'},
            files={'data': (None, json.dumps(meta), 'application/json; charset=UTF-8'),
                   'file': (os.path.basename(key), data, content_type)},
            timeout=120,
        )
        if resp.status_code not in (200, 201):
            current_app.logger.warning('[storage] gdrive upload HTTP %s: %s',
                                       resp.status_code, resp.text[:120])
            return None
        j = resp.json()
        # make it link-shareable (anyone with the link can VIEW) so certificates
        # and exports are openable without handing out the app's credentials
        requests.patch(
            f"https://www.googleapis.com/drive/v3/files/{j['id']}?fields=webViewLink",
            headers={'Authorization': f'Bearer {token}'},
            json={'role': 'reader', 'type': 'anyone'}, timeout=30,
        )
        return {'file_id': j.get('id'), 'url': j.get('webViewLink')}
    except Exception as exc:
        current_app.logger.warning('[storage] gdrive upload failed: %s', exc)
        return None


# ── facade ──────────────────────────────────────────────────────────────────

def store_bytes(key: str, data: bytes) -> dict:
    """Write `data` under `key` (e.g. 'certificates/x.pdf'). Local always wins
    as the durable copy; the configured cloud backend is best-effort on top."""
    key = key.replace('\\', '/').lstrip('/')
    ctype = mimetypes.guess_type(key)[0] or 'application/octet-stream'
    local_path = _local_save(key, data)

    backend = os.environ.get('STORAGE_BACKEND', 'local').lower()
    cloud = None
    if backend == 'cloudinary':
        cloud = _cloudinary_save(key, data, ctype)
    elif backend == 'gdrive':
        cloud = _gdrive_save(key, data, ctype)
    elif backend not in ('local', ''):
        current_app.logger.warning('[storage] unknown STORAGE_BACKEND %r — using local', backend)

    return {
        'backend': 'local' if not cloud else backend,
        'key': key,
        'local_path': local_path,
        'url': (cloud or {}).get('url'),
        'cloud': cloud,
    }


def store_file(local_path: str, key: str = None) -> dict:
    """Upload an existing file (and keep/refresh the local copy)."""
    path = Path(local_path)
    data = path.read_bytes()
    return store_bytes(key or f"files/{path.name}", data)
