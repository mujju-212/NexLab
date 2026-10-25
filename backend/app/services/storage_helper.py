"""Shared icon/avatar upload helper (Cloudinary via the storage facade)."""
IMG_OK = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'}


def upload_icon_file(file_storage, prefix='icons'):
    """Validate + upload an image via the storage facade. Returns the URL."""
    from app.services.storage import store_bytes
    name = (file_storage.filename or '')
    ext = name.rsplit('.', 1)[-1].lower() if '.' in name else ''
    if ext not in IMG_OK:
        raise ValueError(f'Only {", ".join(sorted(IMG_OK))} images are allowed.')
    data = file_storage.read()
    if len(data) > 5 * 1024 * 1024:
        raise ValueError('Image must be 5 MB or smaller.')
    import time as _t
    import uuid as _u
    key = f'{prefix}/{int(_t.time())}_{_u.uuid4().hex[:8]}.{ext}'
    res = store_bytes(key, data)
    if not res.get('url'):
        raise ValueError('Upload failed — try again.')
    return res['url']
