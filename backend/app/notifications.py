"""
Universal notifications API — works for every role (student, instructor,
institution_admin, platform_admin, free_user). The shells' bell buttons poll
this; on open, everything is marked read.

GET  /api/notifications              → {notifications: [...], unread: n}
POST /api/notifications/read-all     → marks every unread row read
POST /api/notifications/<id>/read    → marks one read
"""
from flask import Blueprint, jsonify, g, request
from app.auth.utils import require_auth
from app.models.feedback import Notification
from app.extensions import db

notif_bp = Blueprint('notifications', __name__)

NOTIF_ICONS = {
    'session_reminder': 'calendar',
    'session_scheduled': 'calendar',
    'session_started': 'radio',
    'session_ended': 'check',
    'grade_published': 'trophy',
    'alert': 'alert',
    'announcement': 'megaphone',
    'catchup_available': 'rotate',
}


@notif_bp.route('/notifications', methods=['GET'])
@require_auth
def my_notifications():
    """Latest 30 notifications + unread count (any role)."""
    rows = Notification.query.filter_by(user_id=g.user_id).order_by(
        Notification.created_at.desc()).limit(30).all()
    unread = Notification.query.filter_by(
        user_id=g.user_id, is_read=False).count()
    return jsonify({
        'notifications': [{
            'id':         n.id,
            'type':       n.type or 'alert',
            'title':      n.title,
            'message':    n.message,
            'is_read':    bool(n.is_read),
            'created_at': n.created_at.isoformat() + 'Z' if n.created_at else None,
        } for n in rows],
        'unread': unread,
    }), 200


@notif_bp.route('/notifications/unread', methods=['GET'])
@require_auth
def unread_count():
    """Cheap badge poll."""
    unread = Notification.query.filter_by(
        user_id=g.user_id, is_read=False).count()
    return jsonify({'unread': unread}), 200


@notif_bp.route('/notifications/read-all', methods=['POST'])
@require_auth
def mark_all_read():
    Notification.query.filter_by(
        user_id=g.user_id, is_read=False).update({'is_read': True})
    db.session.commit()
    return jsonify({'message': 'All notifications marked read.'}), 200


@notif_bp.route('/notifications/<notif_id>/read', methods=['POST'])
@require_auth
def mark_one_read(notif_id):
    row = Notification.query.filter_by(
        id=notif_id, user_id=g.user_id).first()
    if not row:
        return jsonify({'error': 'Notification not found.'}), 404
    row.is_read = True
    db.session.commit()
    return jsonify({'message': 'Marked read.'}), 200
