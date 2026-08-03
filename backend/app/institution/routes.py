"""
Institution Blueprint — Institution Admin routes
Manages: users, academic structure, sections, subjects, environment profiles,
         announcements, analytics, audit log, force logout
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role, require_institution
from app.extensions import db
from app.models.user import User
from app.models.academic import AcademicYear, Batch, Section, SectionStudent, SectionSubject
from app.models.subject import Subject, EnvironmentProfile
from app.models.feedback import Notification
from app.models.session import LabSession
from datetime import datetime, timedelta
import bcrypt, uuid, csv, io

institution_bp = Blueprint('institution', __name__)


# ── User Management ────────────────────────────────────────────────────────────

@institution_bp.route('/users', methods=['GET'])
@require_role('institution_admin')
def list_users():
    role = request.args.get('role')
    query = User.query.filter_by(institution_id=g.institution_id)
    if role:
        query = query.filter_by(role=role)
    users = query.order_by(User.full_name).all()
    return jsonify({'users': [u.to_dict() for u in users]}), 200


@institution_bp.route('/users', methods=['POST'])
@require_role('institution_admin')
def create_user():
    data = request.get_json()
    if User.query.filter_by(email=data['email'].lower()).first():
        return jsonify({'error': 'Email already exists'}), 409

    user = User(
        institution_id=g.institution_id,
        email=data['email'].lower().strip(),
        password_hash=bcrypt.hashpw(data.get('password', 'Welcome@123').encode(),
                                    bcrypt.gensalt()).decode(),
        full_name=data['full_name'],
        role=data['role'],
        roll_number=data.get('roll_number'),
        phone=data.get('phone'),
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({'user': user.to_dict()}), 201


@institution_bp.route('/users/bulk-upload', methods=['POST'])
@require_role('institution_admin')
def bulk_upload_users():
    """CSV bulk upload for students. Columns: email, full_name, roll_number, phone"""
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'CSV file required'}), 400

    content = file.read().decode('utf-8')
    reader = csv.DictReader(io.StringIO(content))
    created, skipped = [], []

    for row in reader:
        email = row.get('email', '').lower().strip()
        if not email:
            continue
        if User.query.filter_by(email=email).first():
            skipped.append(email)
            continue

        user = User(
            institution_id=g.institution_id,
            email=email,
            password_hash=bcrypt.hashpw('Welcome@123'.encode(), bcrypt.gensalt()).decode(),
            full_name=row.get('full_name', '').strip(),
            role='student',
            roll_number=row.get('roll_number', '').strip(),
            phone=row.get('phone', '').strip(),
        )
        db.session.add(user)
        created.append(email)

    db.session.commit()
    return jsonify({'created': len(created), 'skipped': len(skipped), 'skipped_emails': skipped}), 201


@institution_bp.route('/users/<user_id>/toggle-active', methods=['PATCH'])
@require_role('institution_admin')
def toggle_user_active(user_id):
    user = User.query.filter_by(id=user_id, institution_id=g.institution_id).first_or_404()
    user.is_active = not user.is_active
    db.session.commit()
    return jsonify({'is_active': user.is_active}), 200


# ── Academic Structure ─────────────────────────────────────────────────────────

@institution_bp.route('/academic-years', methods=['GET', 'POST'])
@require_role('institution_admin')
def academic_years():
    if request.method == 'GET':
        years = AcademicYear.query.filter_by(institution_id=g.institution_id).all()
        return jsonify({'years': [y.to_dict() for y in years]}), 200

    data = request.get_json()
    year = AcademicYear(
        institution_id=g.institution_id,
        year_label=data['year_label'],
        is_active=data.get('is_active', True)
    )
    db.session.add(year)
    db.session.commit()
    return jsonify({'year': year.to_dict()}), 201


@institution_bp.route('/batches', methods=['GET', 'POST'])
@require_role('institution_admin')
def batches():
    if request.method == 'GET':
        year_id = request.args.get('year_id')
        query = Batch.query.filter_by(institution_id=g.institution_id)
        if year_id:
            query = query.filter_by(year_id=year_id)
        return jsonify({'batches': [b.to_dict() for b in query.all()]}), 200

    data = request.get_json()
    batch = Batch(
        institution_id=g.institution_id,
        year_id=data['year_id'],
        name=data['name'],
        program=data.get('program'),
    )
    db.session.add(batch)
    db.session.commit()
    return jsonify({'batch': batch.to_dict()}), 201


@institution_bp.route('/sections', methods=['GET', 'POST'])
@require_role('institution_admin')
def sections():
    if request.method == 'GET':
        batch_id = request.args.get('batch_id')
        query = Section.query.filter_by(institution_id=g.institution_id)
        if batch_id:
            query = query.filter_by(batch_id=batch_id)
        return jsonify({'sections': [s.to_dict() for s in query.all()]}), 200

    data = request.get_json()
    section = Section(
        institution_id=g.institution_id,
        batch_id=data['batch_id'],
        name=data['name'],
    )
    db.session.add(section)
    db.session.commit()
    return jsonify({'section': section.to_dict()}), 201


@institution_bp.route('/sections/<section_id>/enroll', methods=['POST'])
@require_role('institution_admin')
def enroll_students(section_id):
    """Enroll students into a section"""
    data = request.get_json()
    student_ids = data.get('student_ids', [])
    enrolled = 0
    for sid in student_ids:
        if not SectionStudent.query.filter_by(section_id=section_id, student_id=sid).first():
            db.session.add(SectionStudent(section_id=section_id, student_id=sid))
            enrolled += 1
    db.session.commit()
    return jsonify({'enrolled': enrolled}), 200


# ── Subject & Section-Subject Assignment ──────────────────────────────────────

@institution_bp.route('/subjects', methods=['GET', 'POST'])
@require_role('institution_admin')
def subjects():
    if request.method == 'GET':
        subs = Subject.query.filter_by(institution_id=g.institution_id).all()
        return jsonify({'subjects': [s.to_dict() for s in subs]}), 200

    data = request.get_json()
    subject = Subject(
        institution_id=g.institution_id,
        name=data['name'],
        code=data.get('code'),
        description=data.get('description'),
        env_profile_id=data.get('env_profile_id'),
    )
    db.session.add(subject)
    db.session.commit()
    return jsonify({'subject': subject.to_dict()}), 201


@institution_bp.route('/section-subjects', methods=['POST'])
@require_role('institution_admin')
def assign_subject():
    """Assign a subject + instructor to a section"""
    data = request.get_json()
    ss = SectionSubject(
        institution_id=g.institution_id,
        section_id=data['section_id'],
        subject_id=data['subject_id'],
        instructor_id=data['instructor_id'],
        co_instructor_id=data.get('co_instructor_id'),
    )
    db.session.add(ss)
    db.session.commit()
    return jsonify({'section_subject': ss.to_dict()}), 201


# ── Environment Profiles ───────────────────────────────────────────────────────

@institution_bp.route('/environments', methods=['GET'])
@require_institution
def list_environments():
    """Get all available environment profiles (platform defaults + institution custom)"""
    defaults = EnvironmentProfile.query.filter_by(is_platform_default=True).all()
    custom   = EnvironmentProfile.query.filter_by(institution_id=g.institution_id).all()
    return jsonify({
        'platform_defaults': [e.to_dict() for e in defaults],
        'custom': [e.to_dict() for e in custom]
    }), 200


@institution_bp.route('/environments/request', methods=['POST'])
@require_role('instructor', 'institution_admin')
def request_custom_environment():
    """Instructor requests a custom Docker environment"""
    data = request.get_json()
    profile = EnvironmentProfile(
        institution_id=g.institution_id,
        name=data['name'].lower().replace(' ', '-'),
        display_name=data['display_name'],
        docker_image=f"virtuallab/{data['name'].lower().replace(' ', '-')}:latest",
        is_platform_default=False,
        pip_packages=data.get('pip_packages', []),
        apt_packages=data.get('apt_packages', []),
        build_status='pending',
        created_by=g.user_id,
    )
    db.session.add(profile)
    db.session.commit()

    # Notify platform admins
    # (Platform admin gets notified to review and build)
    return jsonify({
        'profile': profile.to_dict(),
        'message': 'Environment request submitted. Admin will review and build.'
    }), 201


# ── Institution Dashboard ──────────────────────────────────────────────────────

@institution_bp.route('/dashboard', methods=['GET'])
@require_role('institution_admin')
def institution_dashboard():
    from app.models.session import LabSession
    iid = g.institution_id

    instructors = User.query.filter_by(institution_id=iid, role='instructor').count()
    students    = User.query.filter_by(institution_id=iid, role='student').count()
    subjects_count = Subject.query.filter_by(institution_id=iid).count()
    live_sessions  = LabSession.query.filter_by(institution_id=iid, status='active').count()

    upcoming = LabSession.query.filter_by(
        institution_id=iid, status='scheduled'
    ).order_by(LabSession.scheduled_at).limit(5).all()

    return jsonify({
        'stats': {
            'instructors': instructors,
            'students': students,
            'subjects': subjects_count,
            'live_sessions': live_sessions,
        },
        'upcoming_sessions': [s.to_dict() for s in upcoming],
    }), 200


# ── Announcements ──────────────────────────────────────────────────────────────

@institution_bp.route('/announcements', methods=['POST'])
@require_role('institution_admin')
def send_announcement():
    """
    Broadcast announcement to all users or a specific role/section.
    Creates one Notification row per target user.

    Body: {
        title, message,
        target: 'all' | 'students' | 'instructors',
        section_id: (optional — scope to one section only)
    }
    """
    data       = request.get_json()
    title      = data.get('title', '')
    message    = data.get('message', '')
    target     = data.get('target', 'all')        # all | students | instructors
    section_id = data.get('section_id')           # optional scope

    if not title or not message:
        return jsonify({'error': 'title and message required'}), 400

    # Build target user list
    query = User.query.filter_by(institution_id=g.institution_id, is_active=True)

    if target == 'students':
        query = query.filter_by(role='student')
    elif target == 'instructors':
        query = query.filter_by(role='instructor')
    # 'all' → no extra filter

    if section_id:
        # Scope to students in a specific section
        enrolled_ids = [
            e.student_id
            for e in SectionStudent.query.filter_by(section_id=section_id).all()
        ]
        query = query.filter(User.id.in_(enrolled_ids))

    users = query.all()
    created = 0
    for user in users:
        notif = Notification(
            user_id=user.id,
            type='announcement',
            title=title,
            message=message,
        )
        db.session.add(notif)
        created += 1

    # Push via SocketIO to online users
    from app.extensions import socketio
    socketio.emit('new_announcement', {
        'title': title,
        'message': message,
        'from': 'Institution Admin',
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"institution_{g.institution_id}")

    db.session.commit()
    return jsonify({'sent_to': created, 'target': target}), 201


@institution_bp.route('/announcements/recent', methods=['GET'])
@require_role('institution_admin')
def recent_announcements():
    """Last 20 announcements sent by this institution"""
    # Get distinct announcements (by title+message+created_at) for this institution
    from sqlalchemy import distinct
    recent = Notification.query.join(
        User, Notification.user_id == User.id
    ).filter(
        User.institution_id == g.institution_id,
        Notification.type == 'announcement'
    ).order_by(Notification.created_at.desc()).limit(20).all()

    return jsonify({'announcements': [n.to_dict() for n in recent]}), 200


# ── Force Logout ───────────────────────────────────────────────────────────────

@institution_bp.route('/users/<user_id>/force-logout', methods=['POST'])
@require_role('institution_admin')
def force_logout_user(user_id):
    """
    Force-logout a user by invalidating their JWT.
    Stores the user_id in a blocklist table — auth middleware checks it on each request.
    Also emits a SocketIO kick event to disconnect them live.
    """
    user = User.query.filter_by(
        id=user_id, institution_id=g.institution_id
    ).first_or_404()

    # Store force-logout timestamp — any token issued before this is rejected
    user.force_logout_at = datetime.utcnow()
    db.session.commit()

    # Kick from any active SocketIO rooms
    from app.extensions import socketio
    socketio.emit('force_logout', {
        'reason': 'Logged out by administrator',
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"user_{user_id}")

    # Write audit log
    _write_audit(
        actor_id=g.user_id,
        institution_id=g.institution_id,
        action='force_logout',
        target_type='user',
        target_id=user_id,
        detail=f"Force-logged out {user.full_name} ({user.email})"
    )

    return jsonify({'message': f'{user.full_name} has been logged out'}), 200


# ── Audit Log ──────────────────────────────────────────────────────────────────

@institution_bp.route('/audit-log', methods=['GET'])
@require_role('institution_admin')
def get_audit_log():
    """
    View admin action history for this institution.
    Query params: ?limit=50&action=force_logout&days=7
    """
    from app.models.academic import AuditLog
    limit  = int(request.args.get('limit', 50))
    action = request.args.get('action')
    days   = int(request.args.get('days', 30))

    since = datetime.utcnow() - timedelta(days=days)
    query = AuditLog.query.filter_by(
        institution_id=g.institution_id
    ).filter(AuditLog.created_at >= since)

    if action:
        query = query.filter_by(action=action)

    logs = query.order_by(AuditLog.created_at.desc()).limit(limit).all()
    return jsonify({'logs': [l.to_dict() for l in logs]}), 200


def _write_audit(actor_id, institution_id, action, target_type, target_id, detail=''):
    """Helper — write one audit log row. Call from any route that needs tracking."""
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
        pass  # Never crash a real request due to audit failure


# ── Per-Institution Analytics ──────────────────────────────────────────────────

@institution_bp.route('/analytics/overview', methods=['GET'])
@require_role('institution_admin')
def analytics_overview():
    """
    High-level institution analytics:
    - Total sessions last 30 days
    - Average experiment completion rate
    - Students at risk (concept mastery < 40%)
    - Peak usage hours
    - Instructor activity levels
    """
    from app.models.submission import CodeAttempt
    from app.models.knowledge import ConceptMastery
    from sqlalchemy import func

    iid   = g.institution_id
    since = datetime.utcnow() - timedelta(days=30)

    # Sessions this month
    total_sessions = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.scheduled_at >= since
    ).count()

    completed_sessions = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.status == 'ended',
        LabSession.scheduled_at >= since
    ).count()

    # Total students
    total_students = User.query.filter_by(
        institution_id=iid, role='student', is_active=True
    ).count()

    # Students at risk — avg mastery < 40%
    at_risk_subq = db.session.query(
        ConceptMastery.student_id,
        func.avg(ConceptMastery.mastery_score).label('avg_mastery')
    ).filter_by(institution_id=iid).group_by(
        ConceptMastery.student_id
    ).subquery()

    at_risk_count = db.session.query(at_risk_subq).filter(
        at_risk_subq.c.avg_mastery < 40
    ).count()

    # Active instructors this month
    active_instructors = db.session.query(
        func.count(func.distinct(LabSession.instructor_id))
    ).filter(
        LabSession.institution_id == iid,
        LabSession.scheduled_at >= since
    ).scalar() or 0

    # Peak usage: count sessions per hour-of-day
    all_sessions = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.started_at.isnot(None)
    ).all()

    hour_counts = {}
    for s in all_sessions:
        if s.started_at:
            h = s.started_at.hour
            hour_counts[h] = hour_counts.get(h, 0) + 1

    peak_hours = sorted(hour_counts.items(), key=lambda x: x[1], reverse=True)[:3]

    return jsonify({
        'period_days': 30,
        'sessions': {
            'total': total_sessions,
            'completed': completed_sessions,
            'completion_rate_pct': round(
                (completed_sessions / total_sessions * 100) if total_sessions else 0, 1
            ),
        },
        'students': {
            'total': total_students,
            'at_risk': at_risk_count,
            'at_risk_pct': round(
                (at_risk_count / total_students * 100) if total_students else 0, 1
            ),
        },
        'instructors': {'active_this_month': active_instructors},
        'peak_hours': [{'hour': h, 'session_count': c} for h, c in peak_hours],
    }), 200


@institution_bp.route('/analytics/students-at-risk', methods=['GET'])
@require_role('institution_admin')
def students_at_risk():
    """List of students with avg concept mastery below threshold (default 40%)"""
    from app.models.knowledge import ConceptMastery
    from sqlalchemy import func

    threshold = float(request.args.get('threshold', 40.0))

    at_risk = db.session.query(
        ConceptMastery.student_id,
        func.avg(ConceptMastery.mastery_score).label('avg_mastery'),
        func.count(ConceptMastery.concept).label('concepts_tracked')
    ).filter_by(
        institution_id=g.institution_id
    ).group_by(
        ConceptMastery.student_id
    ).having(
        func.avg(ConceptMastery.mastery_score) < threshold
    ).all()

    result = []
    for row in at_risk:
        user = User.query.get(row.student_id)
        if user:
            result.append({
                'student_id':       row.student_id,
                'full_name':        user.full_name,
                'email':            user.email,
                'roll_number':      user.roll_number,
                'avg_mastery':      round(float(row.avg_mastery), 1),
                'concepts_tracked': row.concepts_tracked,
            })

    result.sort(key=lambda x: x['avg_mastery'])
    return jsonify({'at_risk_students': result, 'threshold': threshold}), 200


@institution_bp.route('/analytics/section-comparison', methods=['GET'])
@require_role('institution_admin')
def section_comparison():
    """Compare performance across all sections in the institution"""
    from app.models.knowledge import StudentRanking
    from sqlalchemy import func

    sections = Section.query.filter_by(institution_id=g.institution_id).all()
    result = []

    for sec in sections:
        # Get all rankings for this section
        rankings = StudentRanking.query.filter_by(section_id=sec.id).all()
        if not rankings:
            avg_score = 0
        else:
            avg_score = sum(r.holistic_score for r in rankings if r.holistic_score) / len(rankings)

        enrolled = SectionStudent.query.filter_by(section_id=sec.id).count()
        result.append({
            'section_id':   sec.id,
            'section_name': sec.name,
            'enrolled':     enrolled,
            'avg_score':    round(avg_score, 1),
        })

    result.sort(key=lambda x: x['avg_score'], reverse=True)
    return jsonify({'sections': result}), 200
