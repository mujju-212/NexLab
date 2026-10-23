"""
Institution Announcements Blueprint.
Full first-class management of Announcements, Drafts, Scheduled Delivery,
Target Scoping, Real Metrics, and User Interactions.
"""
import uuid
import os
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from sqlalchemy import func, or_, and_
from werkzeug.utils import secure_filename

from app.auth.utils import require_role
from app.extensions import db, socketio
from app.models.announcement import Announcement, AnnouncementInteraction
from app.models.academic import Department, Batch, Section, SectionStudent, AcademicYear
from app.models.feedback import Notification
from app.models.user import User

announcements_inst_bp = Blueprint('institution_announcements', __name__)

UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static', 'uploads', 'announcements')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


from app.institution.audit import write_audit as _canonical_write_audit


def _write_audit(user_id, institution_id, action, target_type, target_id, details, severity=None):
    """Safely log an audit entry using canonical write_audit."""
    _canonical_write_audit(
        actor_id=user_id,
        institution_id=institution_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=details,
        module='Announcements',
        severity=severity,
    )


def _resolve_target_users(institution_id, target, department_id=None, academic_year=None, batch_id=None, section_id=None):
    """Resolve an explicit audience without treating an empty custom scope as a broadcast."""
    query = User.query.filter_by(institution_id=institution_id, is_active=True)
    if target in ('all', 'custom'):
        query = query.filter(User.role.in_(('student', 'instructor')))
    elif target == 'students':
        query = query.filter_by(role='student')
    elif target == 'instructors':
        query = query.filter_by(role='instructor')

    if department_id:
        query = query.filter_by(department_id=department_id)

    # Class/batch/year scopes resolve to enrolled students. Intersect all supplied
    # academic scopes so the recipient count matches the audience the student feed
    # later enforces. Department-only custom audiences may include all roles.
    academic_scopes = []
    if section_id:
        academic_scopes.append({row.student_id for row in SectionStudent.query.filter_by(section_id=section_id).all()})
    if batch_id:
        batch_sections = [row.id for row in Section.query.filter_by(
            institution_id=institution_id, batch_id=batch_id).all()]
        academic_scopes.append({row.student_id for row in SectionStudent.query.filter(
            SectionStudent.section_id.in_(batch_sections)).all()} if batch_sections else set())
    if academic_year:
        year_num = str(academic_year)
        year_ids = [row.id for row in AcademicYear.query.filter_by(institution_id=institution_id).all()
                    if row.year_label and str(row.year_label).startswith(year_num)]
        year_batches = Batch.query.filter_by(institution_id=institution_id).filter(
            Batch.year_id.in_(year_ids)).all() if year_ids else []
        year_section_ids = [row.id for batch in year_batches for row in Section.query.filter_by(
            institution_id=institution_id, batch_id=batch.id).all()]
        academic_scopes.append({row.student_id for row in SectionStudent.query.filter(
            SectionStudent.section_id.in_(year_section_ids)).all()} if year_section_ids else set())

    if academic_scopes:
        matching_ids = set.intersection(*academic_scopes)
        query = query.filter(User.role == 'student', User.id.in_(matching_ids))
    return query.all()


@announcements_inst_bp.route('/announcements/stats', methods=['GET'])
@require_role('institution_admin')
def get_announcements_stats():
    """
    Returns aggregated metrics for top cards:
    - total_announcements
    - new_this_month
    - students_reached
    - delivery_rate_pct
    - total_views
    - open_rate_pct
    - scheduled_count
    - drafts_count
    """
    iid = g.institution_id
    now = datetime.utcnow()
    month_start = datetime(now.year, now.month, 1)

    sent_announcements = Announcement.query.filter_by(institution_id=iid, status='sent').all()
    total_sent = len(sent_announcements)

    new_this_month = sum(
        1 for a in sent_announcements if a.sent_at and a.sent_at >= month_start
    )

    total_reach = sum(a.reach_count for a in sent_announcements)
    total_views = sum(a.views_count for a in sent_announcements)
    total_likes = sum(a.likes_count for a in sent_announcements)

    # Calculate delivery rate & open rate
    open_rate_pct = round((total_views / total_reach * 100), 1) if total_reach > 0 else 0
    # Delivery receipts are not stored per channel; don't fabricate a percentage.
    delivery_rate_pct = None

    scheduled_count = Announcement.query.filter_by(institution_id=iid, status='scheduled').count()
    drafts_count = Announcement.query.filter_by(institution_id=iid, status='draft').count()

    return jsonify({
        'total_announcements': total_sent,
        'new_this_month': new_this_month,
        'students_reached': total_reach,
        'delivery_rate_pct': delivery_rate_pct,
        'total_views': total_views,
        'open_rate_pct': open_rate_pct,
        'scheduled_count': scheduled_count,
        'drafts_count': drafts_count,
        'total_likes': total_likes,
    }), 200


@announcements_inst_bp.route('/announcements', methods=['GET'])
@require_role('institution_admin')
def list_announcements():
    """
    Filtered list of announcements with pagination and search.
    Params: status ('all'|'sent'|'scheduled'|'draft'), search, category, priority
    """
    iid = g.institution_id
    status = request.args.get('status', 'all')
    search = request.args.get('search', '').strip().lower()
    category = request.args.get('category')
    priority = request.args.get('priority')
    target = request.args.get('target')

    query = Announcement.query.filter_by(institution_id=iid)

    if status != 'all':
        query = query.filter_by(status=status)

    if category and category != 'all':
        query = query.filter_by(category=category)

    if priority and priority != 'all':
        query = query.filter_by(priority=priority)

    if target and target != 'all':
        query = query.filter_by(target=target)

    if search:
        query = query.filter(
            or_(
                Announcement.title.ilike(f"%{search}%"),
                Announcement.message.ilike(f"%{search}%"),
            )
        )

    # Order: scheduled first by send_at asc, sent by sent_at desc, drafts by updated_at desc
    query = query.order_by(Announcement.created_at.desc())
    items = query.all()

    # Preload scope labels
    depts = {d.id: d.name for d in Department.query.filter_by(institution_id=iid).all()}
    sections = {s.id: s.name for s in Section.query.filter_by(institution_id=iid).all()}
    batches = {b.id: b.name for b in Batch.query.filter_by(institution_id=iid).all()}

    results = []
    for a in items:
        item = a.to_dict(current_user_id=g.user_id)
        # Add friendly scope label
        scope_parts = []
        if a.department_id and a.department_id in depts:
            scope_parts.append(depts[a.department_id])
        if a.academic_year:
            scope_parts.append(str(a.academic_year))
        elif a.batch_id and a.batch_id in batches:
            scope_parts.append(batches[a.batch_id])
        if a.section_id and a.section_id in sections:
            scope_parts.append(f"Section {sections[a.section_id]}")

        item['audience_label'] = ' • '.join(scope_parts) if scope_parts else (
            'Everyone' if a.target in ('all', 'everyone') else a.target.replace('_', ' ').capitalize()
        )
        results.append(item)

    return jsonify({
        'announcements': results,
        'total': len(results),
    }), 200


@announcements_inst_bp.route('/announcements', methods=['POST'])
@require_role('institution_admin')
def create_announcement():
    """
    Create announcement — either send immediately, save as draft, or schedule.
    """
    iid = g.institution_id
    data = request.get_json() or {}

    title = (data.get('title') or '').strip()
    message = (data.get('message') or '').strip()
    status = data.get('status', 'sent')  # 'sent' | 'scheduled' | 'draft'
    priority = data.get('priority', 'normal')  # 'normal' | 'important' | 'urgent'
    category = data.get('category', 'general')  # 'general' | 'cancellation' | 'schedule' | 'exam' | 'event'
    target = data.get('target', 'all')  # 'all' | 'students' | 'instructors' | 'custom'
    if status not in ('sent', 'scheduled', 'draft'):
        return jsonify({'error': 'status must be sent, scheduled, or draft.'}), 400
    if priority not in ('normal', 'important', 'urgent'):
        return jsonify({'error': 'priority must be normal, important, or urgent.'}), 400
    if category not in ('general', 'cancellation', 'schedule', 'exam', 'event'):
        return jsonify({'error': 'category is not supported.'}), 400
    if target not in ('all', 'students', 'instructors', 'custom'):
        return jsonify({'error': 'target must be all, students, instructors, or custom.'}), 400

    dept_id = data.get('department_id') or None
    acad_year = data.get('academic_year')
    if acad_year:
        try:
            acad_year = int(str(acad_year)[:4])
        except ValueError:
            acad_year = None
    batch_id = data.get('batch_id') or None
    section_id = data.get('section_id') or None

    if target == 'custom' and status in ('sent', 'scheduled') and not any((dept_id, acad_year, batch_id, section_id)):
        return jsonify({'error': 'Choose a department, academic year, batch, or section for a custom audience.'}), 400
    if target != 'custom' and any((dept_id, acad_year, batch_id, section_id)):
        return jsonify({'error': 'Use the custom audience option to apply department, year, batch, or section filters.'}), 400

    attachment_name = data.get('attachment_name') or None
    attachment_url = data.get('attachment_url') or None
    attachment_size = data.get('attachment_size') or None

    if not title:
        return jsonify({'error': 'Title is required'}), 400
    if not message and status != 'draft':
        return jsonify({'error': 'Message is required'}), 400

    # Resolve target recipients
    recipients = _resolve_target_users(
        institution_id=iid,
        target=target,
        department_id=dept_id,
        academic_year=acad_year,
        batch_id=batch_id,
        section_id=section_id,
    )
    reach_count = len(recipients) if status == 'sent' else 0

    send_at = None
    sent_at = None

    if status == 'scheduled':
        send_at_raw = data.get('send_at')
        if not send_at_raw:
            return jsonify({'error': 'send_at datetime is required for scheduled announcements'}), 400
        try:
            send_at = datetime.fromisoformat(str(send_at_raw).replace('Z', ''))
        except ValueError:
            return jsonify({'error': 'Invalid send_at format, use ISO datetime'}), 400
        if send_at <= datetime.utcnow():
            status = 'sent'
            sent_at = datetime.utcnow()
            reach_count = len(recipients)
    elif status == 'sent':
        sent_at = datetime.utcnow()

    announcement = Announcement(
        institution_id=iid,
        author_id=g.user_id,
        author_role='institution_admin',
        title=title,
        message=message,
        priority=priority,
        category=category,
        target=target,
        department_id=dept_id,
        academic_year=acad_year,
        batch_id=batch_id,
        section_id=section_id,
        attachment_name=attachment_name,
        attachment_url=attachment_url,
        attachment_size=attachment_size,
        status=status,
        send_at=send_at,
        sent_at=sent_at,
        reach_count=reach_count,
        views_count=0,
        likes_count=0,
    )
    db.session.add(announcement)
    db.session.commit()

    # If sending immediately, fan-out notifications & emit socket event
    if status == 'sent':
        for u in recipients:
            db.session.add(Notification(
                user_id=u.id,
                type='announcement',
                title=title,
                message=message[:200] + ('...' if len(message) > 200 else ''),
            ))
        db.session.commit()

        # Emit SocketIO event to institution room
        try:
            socketio.emit('new_announcement', {
                'id': announcement.id,
                'title': title,
                'message': message,
                'priority': priority,
                'category': category,
                'author': 'Institution Admin',
                'target': target,
                'attachment_name': attachment_name,
                'timestamp': datetime.utcnow().isoformat() + 'Z',
            }, room=f"institution_{iid}")
        except Exception:
            pass

    _write_audit(g.user_id, iid, 'create_announcement', 'announcement', announcement.id,
                 f'Created announcement "{title}" ({status})')

    return jsonify({
        'announcement': announcement.to_dict(current_user_id=g.user_id),
        'sent_to': reach_count,
    }), 201


@announcements_inst_bp.route('/announcements/<announcement_id>', methods=['GET'])
@require_role('institution_admin')
def get_announcement_details(announcement_id):
    """
    Get detailed metrics for one announcement including readers list.
    """
    iid = g.institution_id
    ann = Announcement.query.filter_by(id=announcement_id, institution_id=iid).first_or_404()

    # Preload interactions
    interactions = AnnouncementInteraction.query.filter_by(announcement_id=ann.id).all()
    user_ids = [i.user_id for i in interactions]
    users_map = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}

    readers = []
    for inter in interactions:
        u = users_map.get(inter.user_id)
        readers.append({
            'user_id': inter.user_id,
            'user_name': u.full_name if u else 'Unknown User',
            'user_role': u.role if u else 'student',
            'read_at': inter.read_at.isoformat() + 'Z' if inter.read_at else None,
            'liked': inter.liked,
        })

    # Scope labels
    scope_label = 'Everyone'
    if ann.department_id:
        dept = Department.query.filter_by(id=ann.department_id, institution_id=iid).first()
        if dept:
            scope_label = dept.name
    if ann.section_id:
        sec = Section.query.filter_by(id=ann.section_id, institution_id=iid).first()
        if sec:
            scope_label += f" • Section {sec.name}"

    out = ann.to_dict(current_user_id=g.user_id)
    out['audience_label'] = scope_label
    out['readers'] = sorted(readers, key=lambda r: r['read_at'] or '', reverse=True)

    return jsonify({'announcement': out}), 200


@announcements_inst_bp.route('/announcements/<announcement_id>', methods=['PATCH'])
@require_role('institution_admin')
def update_announcement(announcement_id):
    """
    Update announcement (especially drafts or scheduled).
    """
    iid = g.institution_id
    ann = Announcement.query.filter_by(id=announcement_id, institution_id=iid).first_or_404()
    data = request.get_json() or {}

    if 'title' in data:
        ann.title = data['title'].strip()
    if 'message' in data:
        ann.message = data['message'].strip()
    if 'priority' in data:
        ann.priority = data['priority']
    if 'category' in data:
        ann.category = data['category']
    if 'target' in data:
        if data['target'] not in ('all', 'students', 'instructors', 'custom'):
            return jsonify({'error': 'target must be all, students, instructors, or custom.'}), 400
        ann.target = data['target']
    if 'department_id' in data:
        ann.department_id = data['department_id'] or None
    if 'academic_year' in data:
        try:
            ann.academic_year = int(str(data['academic_year'])[:4]) if data['academic_year'] else None
        except (TypeError, ValueError):
            return jsonify({'error': 'academic_year must start with a four-digit year.'}), 400
    if 'batch_id' in data:
        ann.batch_id = data['batch_id'] or None
    if 'section_id' in data:
        ann.section_id = data['section_id'] or None
    if 'attachment_name' in data:
        ann.attachment_name = data['attachment_name'] or None
    if 'attachment_url' in data:
        ann.attachment_url = data['attachment_url'] or None
    if 'attachment_size' in data:
        ann.attachment_size = data['attachment_size'] or None

    # A custom audience is only deliverable with an explicit scope; never let an empty
    # filter silently become an institution-wide broadcast.
    new_status = data.get('status')
    if new_status is not None and new_status not in ('sent', 'scheduled', 'draft'):
        return jsonify({'error': 'status must be sent, scheduled, or draft.'}), 400
    effective_status = new_status or ann.status
    if effective_status in ('sent', 'scheduled') and ann.target == 'custom' and not any((ann.department_id, ann.academic_year, ann.batch_id, ann.section_id)):
        return jsonify({'error': 'Choose a department, academic year, batch, or section for a custom audience.'}), 400
    if ann.target != 'custom' and any((ann.department_id, ann.academic_year, ann.batch_id, ann.section_id)):
        return jsonify({'error': 'Use the custom audience option to apply department, year, batch, or section filters.'}), 400
    if new_status and new_status != ann.status:
        if new_status == 'sent':
            ann.status = 'sent'
            ann.sent_at = datetime.utcnow()
            recipients = _resolve_target_users(
                iid, ann.target, ann.department_id, ann.academic_year, ann.batch_id, ann.section_id
            )
            ann.reach_count = len(recipients)
            for u in recipients:
                db.session.add(Notification(
                    user_id=u.id,
                    type='announcement',
                    title=ann.title,
                    message=ann.message[:200],
                ))
            try:
                socketio.emit('new_announcement', {
                    'id': ann.id,
                    'title': ann.title,
                    'message': ann.message,
                    'priority': ann.priority,
                    'category': ann.category,
                    'author': 'Institution Admin',
                    'target': ann.target,
                    'timestamp': datetime.utcnow().isoformat() + 'Z',
                }, room=f"institution_{iid}")
            except Exception:
                pass
        elif new_status == 'scheduled':
            send_at_raw = data.get('send_at')
            if send_at_raw:
                ann.send_at = datetime.fromisoformat(str(send_at_raw).replace('Z', ''))
            ann.status = 'scheduled'
        elif new_status == 'draft':
            ann.status = 'draft'

    ann.updated_at = datetime.utcnow()
    db.session.commit()

    _write_audit(g.user_id, iid, 'update_announcement', 'announcement', ann.id,
                 f'Updated announcement "{ann.title}"')

    return jsonify({'announcement': ann.to_dict(current_user_id=g.user_id)}), 200


@announcements_inst_bp.route('/announcements/<announcement_id>', methods=['DELETE'])
@require_role('institution_admin')
def delete_announcement(announcement_id):
    """
    Delete an announcement.
    """
    iid = g.institution_id
    ann = Announcement.query.filter_by(id=announcement_id, institution_id=iid).first_or_404()
    title = ann.title

    db.session.delete(ann)
    db.session.commit()

    _write_audit(g.user_id, iid, 'delete_announcement', 'announcement', announcement_id,
                 f'Deleted announcement "{title}"')

    return jsonify({'message': f'Announcement "{title}" deleted successfully'}), 200


@announcements_inst_bp.route('/announcements/<announcement_id>/resend', methods=['POST'])
@require_role('institution_admin')
def resend_announcement(announcement_id):
    """
    Resend an announcement to newly enrolled users or re-broadcast.
    """
    iid = g.institution_id
    ann = Announcement.query.filter_by(id=announcement_id, institution_id=iid).first_or_404()

    recipients = _resolve_target_users(
        iid, ann.target, ann.department_id, ann.academic_year, ann.batch_id, ann.section_id
    )

    for u in recipients:
        db.session.add(Notification(
            user_id=u.id,
            type='announcement',
            title=f"[Update] {ann.title}",
            message=ann.message[:200],
        ))
    ann.reach_count = max(ann.reach_count, len(recipients))
    db.session.commit()

    try:
        socketio.emit('new_announcement', {
            'id': ann.id,
            'title': ann.title,
            'message': ann.message,
            'priority': ann.priority,
            'category': ann.category,
            'author': 'Institution Admin',
            'timestamp': datetime.utcnow().isoformat() + 'Z',
        }, room=f"institution_{iid}")
    except Exception:
        pass

    return jsonify({'message': f'Resent to {len(recipients)} users', 'reach_count': ann.reach_count}), 200


@announcements_inst_bp.route('/announcements/recent', methods=['GET'])
@require_role('institution_admin')
def get_recent_announcements():
    """
    Backward-compatible helper returning last 20 announcements.
    """
    iid = g.institution_id
    items = Announcement.query.filter_by(institution_id=iid).order_by(
        Announcement.created_at.desc()
    ).limit(20).all()
    return jsonify({'announcements': [a.to_dict() for a in items]}), 200


@announcements_inst_bp.route('/announcements/scheduled', methods=['GET'])
@require_role('institution_admin')
def get_scheduled_announcements():
    """
    Backward-compatible list of scheduled announcements.
    """
    iid = g.institution_id
    items = Announcement.query.filter_by(institution_id=iid, status='scheduled').order_by(
        Announcement.send_at.asc()
    ).all()
    return jsonify({'scheduled': [a.to_dict() for a in items]}), 200


@announcements_inst_bp.route('/announcements/scheduled/<announcement_id>', methods=['DELETE'])
@require_role('institution_admin')
def cancel_scheduled_announcement(announcement_id):
    """
    Cancel/delete a scheduled announcement.
    """
    iid = g.institution_id
    title = ann.title
    db.session.delete(ann)
    db.session.commit()
    _write_audit(g.user_id, iid, 'cancel_announcement', 'announcement', announcement_id,
                 f'Cancelled scheduled announcement "{title}"')
    return jsonify({'message': 'Scheduled announcement cancelled'}), 200


@announcements_inst_bp.route('/announcements/upload', methods=['POST'])
@require_role('institution_admin', 'instructor')
def upload_announcement_file():
    """
    Upload attachment for an announcement (PDF, document, image, etc.).
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file part in request'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    filename = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex[:8]}_{filename}"
    filepath = os.path.join(UPLOAD_FOLDER, unique_name)
    file.save(filepath)

    file_size_bytes = os.path.getsize(filepath)
    if file_size_bytes < 1024 * 1024:
        size_label = f"{round(file_size_bytes / 1024, 1)} KB"
    else:
        size_label = f"{round(file_size_bytes / (1024 * 1024), 1)} MB"

    return jsonify({
        'filename': filename,
        'url': f"/static/uploads/announcements/{unique_name}",
        'size': size_label,
    }), 200


@announcements_inst_bp.route('/announcements/targeted', methods=['POST'])
@require_role('institution_admin')
def send_targeted_announcement_compat():
    """Compatibility alias for targeted announcement sending."""
    return create_announcement()


@announcements_inst_bp.route('/announcements/schedule', methods=['POST'])
@require_role('institution_admin')
def schedule_announcement_compat():
    """Compatibility alias for scheduling an announcement."""
    data = request.get_json() or {}
    data['status'] = 'scheduled'
    return create_announcement()

