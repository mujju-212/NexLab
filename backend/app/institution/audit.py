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
from app.extensions import db


def write_audit(actor_id, institution_id, action, target_type, target_id, detail=''):
    """Write one AuditLog row. Never raises."""
    try:
        from app.models.academic import AuditLog
        log = AuditLog(
            institution_id=institution_id,
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail,
        )
        db.session.add(log)
        db.session.commit()
    except Exception:
        db.session.rollback()
