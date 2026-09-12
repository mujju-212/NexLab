"""
Shared audit-log writer for the institution-admin blueprints.

Lives in its own module so routes.py, extended.py and departments.py can all
write audit rows without importing each other (they are registered separately
in app/__init__.py and must stay independent).

Every mutating admin action should call this. It deliberately swallows its own
exceptions: an audit failure must never turn a successful operation into a 500.
Note it commits — call it *after* the real work is committed, so a failed audit
cannot roll back the change it was describing.
"""
from flask import has_request_context, request
from app.extensions import db


MODULE_MAP = {
    'user': 'User Management',
    'session': 'Sessions',
    'academic_year': 'Academic',
    'batch': 'Academic',
    'section': 'Academic',
    'subject': 'Academic',
    'section_subject': 'Academic',
    'experiment': 'Academic',
    'announcement': 'Announcements',
    'institution': 'Settings',
    'settings': 'Settings',
    'billing': 'Billing & Plan',
    'plan': 'Billing & Plan',
    'analytics': 'Analytics',
    'system': 'System',
}


def _infer_module(target_type, action):
    tt = (target_type or '').lower()
    act = (action or '').lower()
    if tt in MODULE_MAP:
        return MODULE_MAP[tt]
    for key, mod in MODULE_MAP.items():
        if key in act or key in tt:
            return mod
    return 'System'


def _infer_severity(action):
    act = (action or '').lower()
    high_keywords = ['delete', 'destroy', 'deactivate', 'force_logout', 'failed_login', 'purge', 'drop', 'security']
    medium_keywords = ['update_settings', 'change_user_role', 'reschedule', 'cancel', 'reset_password', 'bulk_upload', 'reassign', 'transfer']

    if any(k in act for k in high_keywords):
        return 'high'
    if any(k in act for k in medium_keywords):
        return 'medium'
    return 'low'


def _infer_ip():
    if has_request_context():
        forwarded = request.headers.get('X-Forwarded-For')
        if forwarded:
            return forwarded.split(',')[0].strip()
        if request.remote_addr:
            return request.remote_addr
    return '192.168.1.24'


def write_audit(actor_id, institution_id, action, target_type, target_id, detail='',
                ip_address=None, severity=None, module=None):
    """Write one AuditLog row with enriched metadata. Never raises."""
    try:
        from app.models.academic import AuditLog
        final_module = module or _infer_module(target_type, action)
        final_severity = severity or _infer_severity(action)
        final_ip = ip_address or _infer_ip()

        log = AuditLog(
            institution_id=institution_id,
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail,
            module=final_module,
            severity=final_severity,
            ip_address=final_ip,
        )
        db.session.add(log)
        db.session.commit()
    except Exception:
        db.session.rollback()
