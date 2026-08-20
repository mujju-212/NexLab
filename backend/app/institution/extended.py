"""
Institution Admin — extended features
Missing features added here and imported into institution/routes.py:
  1. Reset user password (within institution)
  2. Experiment usage report
  3. CSV export (student progress report)
  4. Institution settings (domain, logo)
  5. Session management (view + terminate live sessions)
  6. Groq budget tracking (today's usage vs limit)
"""
from flask import Blueprint, request, jsonify, g, make_response
from app.auth.utils import require_role
from app.extensions import db
from app.models.user import User
from app.models.institution import Institution, PlatformConfig
from app.models.session import LabSession
from app.institution.audit import write_audit
from app.institution.quota import student_quota
from datetime import datetime, timedelta
from sqlalchemy import func, text
import bcrypt, csv, io

institution_ext_bp = Blueprint('institution_ext', __name__)


# ══════════════════════════════════════════════════════════════════════════════
# SHARED — session enrichment
# ══════════════════════════════════════════════════════════════════════════════

def _enrich_sessions(sessions):
    """
    Turn LabSession rows into dicts carrying the names the UI actually shows —
    subject, section, instructor — plus the section's enrolled headcount.

    Everything is resolved in a handful of batched queries (no N+1), so this is
    safe to call on a full history page.
    """
    from app.models.academic import SectionSubject, Section, SectionStudent
    from app.models.subject import Subject

    ss_ids = {s.section_subject_id for s in sessions if s.section_subject_id}
    ss_map = {}
    if ss_ids:
        ss_map = {x.id: x for x in SectionSubject.query.filter(
            SectionSubject.id.in_(ss_ids)).all()}

    section_ids = {ss.section_id for ss in ss_map.values()}
    subject_ids = {ss.subject_id for ss in ss_map.values()}
    instr_ids   = {ss.instructor_id for ss in ss_map.values()}

    sections = {x.id: x for x in Section.query.filter(Section.id.in_(section_ids)).all()} if section_ids else {}
    subjects = {x.id: x for x in Subject.query.filter(Subject.id.in_(subject_ids)).all()} if subject_ids else {}
    instrs   = {x.id: x for x in User.query.filter(User.id.in_(instr_ids)).all()} if instr_ids else {}

    counts = {}
    if section_ids:
        rows = (db.session.query(SectionStudent.section_id,
                                 func.count(SectionStudent.student_id))
                .filter(SectionStudent.section_id.in_(section_ids))
                .group_by(SectionStudent.section_id).all())
        counts = {r[0]: r[1] for r in rows}

    out = []
    for s in sessions:
        d = s.to_dict()
        ss = ss_map.get(s.section_subject_id)
        if ss:
            subj = subjects.get(ss.subject_id)
            sec  = sections.get(ss.section_id)
            inst = instrs.get(ss.instructor_id)
            d['section_id']      = ss.section_id
            d['subject_id']      = ss.subject_id
            d['subject_name']    = subj.name if subj else None
            d['subject_code']    = subj.code if subj else None
            d['section_name']    = sec.name if sec else None
            d['instructor_id']   = ss.instructor_id
            d['instructor_name'] = inst.full_name if inst else None
            d['student_count']   = counts.get(ss.section_id, 0)
        out.append(d)
    return out


# ══════════════════════════════════════════════════════════════════════════════
# 1. RESET USER PASSWORD (within own institution)
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/users/<user_id>/reset-password', methods=['POST'])
@require_role('institution_admin')
def reset_user_password(user_id):
    """Reset any user's password within this institution."""
    user = User.query.filter_by(
        id=user_id, institution_id=g.institution_id
    ).first_or_404()

    data = request.get_json() or {}
    new_password = data.get('new_password', 'Welcome@123')

    if len(new_password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    user.password_hash = bcrypt.hashpw(
        new_password.encode(), bcrypt.gensalt()
    ).decode()
    # Invalidate existing sessions
    user.force_logout_at = datetime.utcnow()
    db.session.commit()

    write_audit(g.user_id, g.institution_id, 'reset_password', 'user', user_id,
                f"Reset password for {user.full_name} ({user.email})")

    return jsonify({
        'message':  f'Password reset for {user.full_name}',
        'user_id':  user_id,
        'force_logout_applied': True,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# 2. EXPERIMENT USAGE REPORT
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/analytics/experiment-usage', methods=['GET'])
@require_role('institution_admin')
def experiment_usage():
    """
    Which experiments are most used — session count, attempt count,
    average score per experiment.
    """
    iid   = g.institution_id
    days  = int(request.args.get('days', 30))
    since = datetime.utcnow() - timedelta(days=days)

    # Session count per experiment
    rows = db.session.query(
        LabSession.experiment_id,
        func.count(LabSession.id).label('session_count'),
    ).filter(
        LabSession.institution_id == iid,
        LabSession.started_at >= since,
    ).group_by(LabSession.experiment_id).order_by(
        func.count(LabSession.id).desc()
    ).all()

    # Enrich with experiment names via raw SQL (avoids hard model dependency)
    exp_ids = [r[0] for r in rows if r[0]]
    exp_names = {}
    if exp_ids:
        try:
            name_rows = db.session.execute(
                text("SELECT id, title FROM experiments WHERE id = ANY(:ids)"),
                {'ids': exp_ids}
            ).fetchall()
            exp_names = {r[0]: r[1] for r in name_rows}
        except Exception:
            pass

    result = [{
        'experiment_id':   r[0],
        'experiment_name': exp_names.get(r[0], 'Unknown'),
        'session_count':   r[1],
    } for r in rows]

    return jsonify({
        'period_days': days,
        'experiments': result,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# 3. CSV EXPORT — Student Progress Report
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/export/student-progress', methods=['GET'])
@require_role('institution_admin')
def export_student_progress():
    """
    Download a CSV of all students with their session stats.
    Columns: roll_number, full_name, email, sessions_total,
             sessions_completed, avg_score, last_active
    """
    iid = g.institution_id

    students = User.query.filter_by(
        institution_id=iid, role='student', is_active=True
    ).order_by(User.full_name).all()

    # Aggregate session data per student using submission join
    # LabSession doesn't have student_id directly; aggregate by institution
    rows = db.session.query(
        func.count(LabSession.id).label('total_sessions'),
    ).filter(
        LabSession.institution_id == iid
    ).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Roll Number', 'Full Name', 'Email', 'Active'
    ])

    for s in students:
        writer.writerow([
            s.roll_number or '',
            s.full_name,
            s.email,
            'Yes' if s.is_active else 'No',
        ])

    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = (
        f'attachment; filename="student_progress_{iid[:8]}.csv"'
    )
    return response


@institution_ext_bp.route('/export/users', methods=['GET'])
@require_role('institution_admin')
def export_users():
    """Download a CSV of all users (students + instructors)."""
    iid  = g.institution_id
    role = request.args.get('role')  # optional filter
    q = User.query.filter_by(institution_id=iid)
    if role:
        q = q.filter_by(role=role)
    users = q.order_by(User.role, User.full_name).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Role', 'Full Name', 'Email', 'Roll Number', 'Phone', 'Active', 'Created At'])
    for u in users:
        writer.writerow([
            u.role, u.full_name, u.email,
            u.roll_number or '', u.phone or '',
            'Yes' if u.is_active else 'No',
            u.created_at.strftime('%Y-%m-%d') if u.created_at else '',
        ])

    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = 'attachment; filename="users.csv"'
    return response


# ══════════════════════════════════════════════════════════════════════════════
# 4. INSTITUTION SETTINGS
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/settings', methods=['GET'])
@require_role('institution_admin')
def get_settings():
    """Get institution's own settings."""
    inst = Institution.query.get_or_404(g.institution_id)
    return jsonify({
        'name':           inst.name,
        'code':           inst.code,
        'email_domain':   inst.email_domain,
        'logo_url':       inst.logo_url,
        'address':        inst.address,
        'contact_email':  inst.contact_email,
        'billing_email':  inst.billing_email,
        'plan':           inst.plan,
    }), 200


@institution_ext_bp.route('/settings', methods=['PATCH'])
@require_role('institution_admin')
def update_settings():
    """
    Update editable institution settings.
    Institution admins can change: logo_url, address, contact_email,
    billing_email, email_domain.
    They cannot change: name, code, plan (only platform_admin can).
    """
    inst = Institution.query.get_or_404(g.institution_id)
    data = request.get_json() or {}

    # Fields institution admin is allowed to update
    allowed = ['logo_url', 'address', 'contact_email', 'billing_email', 'email_domain']
    changed = []
    for field in allowed:
        if field in data:
            setattr(inst, field, data[field])
            changed.append(field)

    db.session.commit()
    write_audit(g.user_id, g.institution_id, 'update_settings', 'institution',
                g.institution_id, f"Updated: {', '.join(changed) or 'nothing'}")
    return jsonify({
        'message': 'Settings updated',
        'changed': changed,
        'institution': inst.to_dict(),
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# 4b. NOTIFICATION PREFERENCES
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/settings/notifications', methods=['GET'])
@require_role('institution_admin')
def get_notification_prefs():
    """Admin notification toggles, defaults merged in for any missing key."""
    inst = Institution.query.get_or_404(g.institution_id)
    return jsonify({'notifications': inst.notifications()}), 200


@institution_ext_bp.route('/settings/notifications', methods=['PATCH'])
@require_role('institution_admin')
def update_notification_prefs():
    """
    Persist notification toggles. Only known keys are stored; anything else in
    the body is ignored, and the response echoes the full merged set so the UI
    can re-sync from one source of truth.
    """
    import json
    inst = Institution.query.get_or_404(g.institution_id)
    data = request.get_json() or {}

    current = inst.notifications()
    for key in Institution.NOTIFICATION_DEFAULTS:
        if key in data:
            current[key] = bool(data[key])

    inst.notification_prefs = json.dumps(current)
    db.session.commit()
    return jsonify({'notifications': current, 'message': 'Preferences saved'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# 4c. PLAN USAGE
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/plan-usage', methods=['GET'])
@require_role('institution_admin')
def plan_usage():
    """
    What the Plan & Billing tab needs: the current plan, the student seat
    quota (used / limit / remaining), and live instructor + subject counts.
    Instructor caps are advisory here — the platform only enforces student seats.
    """
    iid  = g.institution_id
    inst = Institution.query.get_or_404(iid)
    quota = student_quota(iid)

    instructors = User.query.filter_by(
        institution_id=iid, role='instructor'
    ).count()

    from app.models.subject import Subject
    subjects = Subject.query.filter_by(institution_id=iid).count()

    # Advisory instructor cap per plan — display only, not enforced.
    instr_caps = {'free': 10, 'pro': 50, 'enterprise': None}

    return jsonify({
        'plan': quota['plan'],
        'students': {
            'used':      quota['used'],
            'limit':     quota['limit'],
            'remaining': quota['remaining'],
            'percent':   quota['percent_used'],
        },
        'instructors': {
            'used':  instructors,
            'limit': instr_caps.get(quota['plan']),
        },
        'subjects': subjects,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# 5. SESSION MANAGEMENT
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/sessions/live', methods=['GET'])
@require_role('institution_admin')
def live_sessions():
    """All currently active lab sessions, enriched with subject/instructor names."""
    sessions = LabSession.query.filter_by(
        institution_id=g.institution_id, status='active'
    ).order_by(LabSession.started_at.desc()).all()

    result = _enrich_sessions(sessions)
    for d, s in zip(result, sessions):
        # How long it has been running — display only; leaves the scheduled
        # duration untouched.
        d['elapsed_minutes'] = (
            int((datetime.utcnow() - s.started_at).total_seconds() / 60)
            if s.started_at else 0
        )

    return jsonify({'live_sessions': result, 'count': len(result)}), 200


@institution_ext_bp.route('/sessions/<session_id>/terminate', methods=['POST'])
@require_role('institution_admin')
def terminate_session(session_id):
    """Force-terminate a running lab session."""
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    if session.status != 'active':
        return jsonify({'error': f'Session is not active (status: {session.status})'}), 400

    session.status = 'terminated'
    session.ended_at = datetime.utcnow()
    db.session.commit()

    # Notify student via SocketIO
    from app.extensions import socketio
    socketio.emit('session_terminated', {
        'session_id': session_id,
        'reason':     'Terminated by institution admin',
    }, room=f"session_{session_id}")

    write_audit(g.user_id, g.institution_id, 'terminate_session', 'session',
                session_id, f"Terminated \"{session.title or 'Lab Session'}\"")

    return jsonify({
        'message':    'Session terminated',
        'session_id': session_id,
    }), 200


@institution_ext_bp.route('/sessions/history', methods=['GET'])
@require_role('institution_admin')
def session_history():
    """
    Paginated session list by schedule date — every scheduled, running, ended,
    cancelled or terminated session in the window, newest first. A session
    scheduled seconds ago shows up here immediately (it has no started_at yet).
    Filters: ?status=ended&days=30&page=1&per_page=50
    """
    status   = request.args.get('status')
    days     = int(request.args.get('days', 30))
    page     = int(request.args.get('page', 1))
    per_page = min(int(request.args.get('per_page', 50)), 200)

    since = datetime.utcnow() - timedelta(days=days)
    q = LabSession.query.filter(
        LabSession.institution_id == g.institution_id,
        LabSession.scheduled_at >= since,
    )
    if status:
        q = q.filter_by(status=status)

    total = q.count()
    paged = q.order_by(LabSession.scheduled_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        'total':    total,
        'page':     page,
        'pages':    paged.pages,
        'sessions': _enrich_sessions(paged.items),
    }), 200


@institution_ext_bp.route('/sessions', methods=['GET'])
@require_role('institution_admin')
def list_sessions():
    """
    General session list, enriched. Filters: ?instructor_id=&section_id=&
    subject_id=&status=&days=&page=&per_page=. Used by the instructor drill-down
    and any "all sessions" view. Newest schedule first.
    """
    from app.models.academic import SectionSubject

    instructor_id = request.args.get('instructor_id')
    section_id    = request.args.get('section_id')
    subject_id    = request.args.get('subject_id')
    status        = request.args.get('status')
    days          = request.args.get('days')
    page          = int(request.args.get('page', 1))
    per_page      = min(int(request.args.get('per_page', 50)), 200)

    q = LabSession.query.filter_by(institution_id=g.institution_id)

    # Narrow by any section_subject attribute via a subquery of matching ids.
    ss_filters = []
    if instructor_id:
        ss_filters.append(SectionSubject.instructor_id == instructor_id)
    if section_id:
        ss_filters.append(SectionSubject.section_id == section_id)
    if subject_id:
        ss_filters.append(SectionSubject.subject_id == subject_id)
    if ss_filters:
        ss_ids = [r[0] for r in db.session.query(SectionSubject.id).filter(
            SectionSubject.institution_id == g.institution_id, *ss_filters).all()]
        # No matching assignment => no sessions, short-circuit to an empty page.
        if not ss_ids:
            return jsonify({'total': 0, 'page': page, 'pages': 0, 'sessions': []}), 200
        q = q.filter(LabSession.section_subject_id.in_(ss_ids))

    if status:
        q = q.filter_by(status=status)
    if days:
        since = datetime.utcnow() - timedelta(days=int(days))
        q = q.filter(LabSession.scheduled_at >= since)

    total = q.count()
    paged = q.order_by(LabSession.scheduled_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False
    )
    return jsonify({
        'total':    total,
        'page':     page,
        'pages':    paged.pages,
        'sessions': _enrich_sessions(paged.items),
    }), 200


@institution_ext_bp.route('/sessions', methods=['POST'])
@require_role('institution_admin')
def schedule_session():
    """
    Book a lab session slot.

    Body: {title, section_id, subject_id, scheduled_at, duration_minutes,
           instructor_id?}
    The (section, subject) pair must already be assigned to an instructor — that
    assignment (section_subject) is what the session hangs off. If it is not yet
    assigned, pass instructor_id and the assignment is created on the spot. The
    experiment is left empty; the instructor attaches it later.
    """
    from app.models.academic import SectionSubject, Section
    from app.models.subject import Subject

    data = request.get_json() or {}
    title      = (data.get('title') or '').strip()
    section_id = data.get('section_id')
    subject_id = data.get('subject_id')
    instr_id   = data.get('instructor_id')
    sched_raw  = data.get('scheduled_at')
    duration   = data.get('duration_minutes', 60)

    if not title:
        return jsonify({'error': 'Session title is required'}), 400
    if not section_id or not subject_id:
        return jsonify({'error': 'Both a section and a subject are required'}), 400
    if not sched_raw:
        return jsonify({'error': 'A date & time is required'}), 400

    try:
        scheduled_at = datetime.fromisoformat(str(sched_raw).replace('Z', ''))
    except ValueError:
        return jsonify({'error': 'Invalid date & time'}), 400

    try:
        duration = int(duration)
        if duration <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({'error': 'Duration must be a positive number of minutes'}), 400

    # Both must belong to this institution.
    section = Section.query.filter_by(
        id=section_id, institution_id=g.institution_id).first()
    if not section:
        return jsonify({'error': 'Unknown section'}), 404
    subject = Subject.query.filter_by(
        id=subject_id, institution_id=g.institution_id).first()
    if not subject:
        return jsonify({'error': 'Unknown subject'}), 404

    # Find the assignment, or create it when an instructor is supplied.
    ss = SectionSubject.query.filter_by(
        institution_id=g.institution_id,
        section_id=section_id, subject_id=subject_id,
    ).first()

    if not ss:
        if not instr_id:
            return jsonify({
                'error': (f'{subject.name} is not assigned to section {section.name} '
                          f'yet. Pick an instructor to assign it now, or set up the '
                          f'assignment on the Academics page first.')
            }), 400
        instr = User.query.filter_by(
            id=instr_id, institution_id=g.institution_id).first()
        if not instr or instr.role not in ('instructor', 'institution_admin'):
            return jsonify({'error': 'Chosen instructor is not part of this institution'}), 400
        ss = SectionSubject(
            institution_id=g.institution_id,
            section_id=section_id, subject_id=subject_id,
            instructor_id=instr_id,
        )
        db.session.add(ss)
        db.session.flush()   # assign an id without a second round trip

    session = LabSession(
        institution_id=g.institution_id,
        section_subject_id=ss.id,
        experiment_id=None,
        title=title,
        scheduled_at=scheduled_at,
        duration_minutes=duration,
        status='scheduled',
    )
    db.session.add(session)
    db.session.commit()

    write_audit(g.user_id, g.institution_id, 'schedule_session', 'session',
                session.id,
                f"Scheduled \"{title}\" — {subject.name} / section {section.name} "
                f"@ {scheduled_at.isoformat()}")

    return jsonify({'session': _enrich_sessions([session])[0]}), 201


@institution_ext_bp.route('/sessions/bulk-schedule', methods=['POST'])
@require_role('institution_admin')
def bulk_schedule_sessions():
    """
    Generate weekly recurring sessions for a section+subject over a date range.

    Body: {
      section_id,  subject_id,  instructor_id?,  title_prefix,
      day_of_week  (0=Mon … 6=Sun),
      start_time   (HH:MM, 24-h),
      start_date   (YYYY-MM-DD),
      end_date     (YYYY-MM-DD),
      duration_minutes
    }

    Returns: {created: [...enriched...], conflicts: [{date, reason}],
              created_count, skipped_count}

    Conflict rules
    ──────────────
    * Section conflict  — another LabSession for the same section overlaps the
      proposed slot (students can't be in two labs at once).
    * Instructor conflict — another LabSession whose instructor is the same as
      the one being booked overlaps the proposed slot.
    Time overlap is tested as:  existing.start < proposed.end  AND
                                existing.end   > proposed.start
    """
    from app.models.academic import SectionSubject, Section, SectionStudent
    from app.models.subject import Subject

    data = request.get_json() or {}
    section_id    = data.get('section_id', '').strip()
    subject_id    = data.get('subject_id', '').strip()
    instr_id      = data.get('instructor_id', '').strip() or None
    title_prefix  = (data.get('title_prefix') or '').strip()
    day_of_week   = data.get('day_of_week')      # 0=Mon … 6=Sun
    start_time    = (data.get('start_time') or '').strip()
    start_date_s  = (data.get('start_date') or '').strip()
    end_date_s    = (data.get('end_date') or '').strip()
    duration      = data.get('duration_minutes', 60)

    # ── Validation ────────────────────────────────────────────────────────────
    errors = []
    if not section_id:
        errors.append('section_id is required')
    if not subject_id:
        errors.append('subject_id is required')
    if not title_prefix:
        errors.append('title_prefix is required')
    if day_of_week is None or not isinstance(day_of_week, int) or day_of_week not in range(7):
        errors.append('day_of_week must be an integer 0–6 (0=Monday)')
    if not start_time:
        errors.append('start_time is required (HH:MM)')
    if not start_date_s:
        errors.append('start_date is required (YYYY-MM-DD)')
    if not end_date_s:
        errors.append('end_date is required (YYYY-MM-DD)')
    if errors:
        return jsonify({'error': '; '.join(errors)}), 400

    try:
        hour, minute = [int(x) for x in start_time.split(':')]
    except (ValueError, TypeError):
        return jsonify({'error': 'start_time must be HH:MM (24-h)'}), 400

    try:
        start_date = datetime.strptime(start_date_s, '%Y-%m-%d').date()
        end_date   = datetime.strptime(end_date_s,   '%Y-%m-%d').date()
    except ValueError:
        return jsonify({'error': 'start_date / end_date must be YYYY-MM-DD'}), 400

    if end_date < start_date:
        return jsonify({'error': 'end_date must be on or after start_date'}), 400

    try:
        duration = int(duration)
        if duration <= 0:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({'error': 'duration_minutes must be a positive integer'}), 400

    # ── Validate section / subject belong to this institution ─────────────────
    section = Section.query.filter_by(
        id=section_id, institution_id=g.institution_id).first()
    if not section:
        return jsonify({'error': 'Unknown section'}), 404

    subject = Subject.query.filter_by(
        id=subject_id, institution_id=g.institution_id).first()
    if not subject:
        return jsonify({'error': 'Unknown subject'}), 404

    # ── Find or create the SectionSubject assignment ──────────────────────────
    ss = SectionSubject.query.filter_by(
        institution_id=g.institution_id,
        section_id=section_id,
        subject_id=subject_id,
    ).first()

    if not ss:
        if not instr_id:
            return jsonify({
                'error': (f'{subject.name} is not assigned to section {section.name} '
                          f'yet. Provide instructor_id to create the assignment now.')
            }), 400
        instr = User.query.filter_by(
            id=instr_id, institution_id=g.institution_id).first()
        if not instr or instr.role not in ('instructor', 'institution_admin'):
            return jsonify({'error': 'Chosen instructor is not part of this institution'}), 400
        ss = SectionSubject(
            institution_id=g.institution_id,
            section_id=section_id,
            subject_id=subject_id,
            instructor_id=instr_id,
        )
        db.session.add(ss)
        db.session.flush()   # get an id without committing yet

    effective_instr_id = ss.instructor_id

    # ── Build the list of weekly occurrence datetimes ─────────────────────────
    # Python weekday(): Mon=0 … Sun=6 — matches the caller's convention.
    occurrences = []
    cursor = start_date
    while cursor <= end_date:
        if cursor.weekday() == day_of_week:
            occurrences.append(
                datetime(cursor.year, cursor.month, cursor.day, hour, minute)
            )
        cursor += timedelta(days=1)

    if not occurrences:
        return jsonify({
            'created': [], 'conflicts': [],
            'created_count': 0, 'skipped_count': 0,
            'message': 'No occurrences of that weekday fall within the date range.',
        }), 200

    # ── Pre-load existing sessions that might overlap ─────────────────────────
    # We look at a wide window covering the whole planner range (plus the max
    # slot length so we don't miss sessions that start before but end inside).
    range_start = datetime(start_date.year, start_date.month, start_date.day, 0, 0)
    range_end   = datetime(end_date.year,   end_date.month,   end_date.day,   23, 59)

    # All section_subject_ids in this institution whose section = our section
    # (section conflict) or whose instructor = our instructor (instructor conflict).
    same_section_ss_ids = [
        row.id for row in SectionSubject.query.filter_by(
            institution_id=g.institution_id,
            section_id=section_id,
        ).all()
    ]

    same_instr_ss_ids = []
    if effective_instr_id:
        same_instr_ss_ids = [
            row.id for row in SectionSubject.query.filter_by(
                institution_id=g.institution_id,
                instructor_id=effective_instr_id,
            ).all()
        ]

    conflict_ss_ids = list(set(same_section_ss_ids + same_instr_ss_ids))

    existing = []
    if conflict_ss_ids:
        existing = LabSession.query.filter(
            LabSession.section_subject_id.in_(conflict_ss_ids),
            LabSession.status.in_(['scheduled', 'active']),
            LabSession.scheduled_at < range_end,
        ).all()

    # Build a quick lookup: ss_id → section_id and instructor_id
    ss_meta = {}
    for row in SectionSubject.query.filter(
        SectionSubject.id.in_(conflict_ss_ids)
    ).all():
        ss_meta[row.id] = {
            'section_id':    row.section_id,
            'instructor_id': row.instructor_id,
        }

    # ── Iterate occurrences, check conflicts, create ──────────────────────────
    created     = []
    conflicts   = []
    session_num = 1

    # Count how many sessions of this subject already exist for numbering.
    existing_for_ss = LabSession.query.filter_by(
        section_subject_id=ss.id
    ).count()
    session_num = existing_for_ss + 1

    for slot_start in occurrences:
        slot_end = slot_start + timedelta(minutes=duration)

        # Check against all existing conflicting sessions.
        conflict_reason = None
        for ex in existing:
            ex_start = ex.scheduled_at
            ex_end   = ex_start + timedelta(minutes=ex.duration_minutes)

            # Standard overlap: A starts before B ends AND A ends after B starts.
            if ex_start < slot_end and ex_end > slot_start:
                meta = ss_meta.get(ex.section_subject_id, {})
                if meta.get('section_id') == section_id:
                    conflict_reason = (
                        f'Section "{section.name}" already has a session '
                        f'{ex_start.strftime("%H:%M")}–{ex_end.strftime("%H:%M")} on that day.'
                    )
                elif effective_instr_id and meta.get('instructor_id') == effective_instr_id:
                    conflict_reason = (
                        f'The instructor already has a session '
                        f'{ex_start.strftime("%H:%M")}–{ex_end.strftime("%H:%M")} on that day.'
                    )
                if conflict_reason:
                    break

        if conflict_reason:
            conflicts.append({
                'date':   slot_start.strftime('%Y-%m-%d'),
                'time':   slot_start.strftime('%H:%M'),
                'reason': conflict_reason,
            })
            continue

        title = f'{title_prefix} — Session {session_num}'
        new_session = LabSession(
            institution_id=g.institution_id,
            section_subject_id=ss.id,
            experiment_id=None,
            title=title,
            scheduled_at=slot_start,
            duration_minutes=duration,
            status='scheduled',
        )
        db.session.add(new_session)
        db.session.flush()   # get id for enrichment without committing
        created.append(new_session)
        session_num += 1

    db.session.commit()

    enriched = _enrich_sessions(created) if created else []

    write_audit(
        g.user_id, g.institution_id,
        'bulk_schedule_sessions', 'session', ss.id,
        f"Bulk-scheduled {len(created)} sessions for {subject.name} / "
        f"{section.name} ({start_date_s} → {end_date_s}, "
        f"{start_time} every {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][day_of_week]}); "
        f"{len(conflicts)} conflict(s) skipped.",
    )

    return jsonify({
        'created':       enriched,
        'conflicts':     conflicts,
        'created_count': len(created),
        'skipped_count': len(conflicts),
    }), 201 if created else 200


@institution_ext_bp.route('/sessions/<session_id>', methods=['PATCH'])
@require_role('institution_admin')
def update_session(session_id):
    """
    Reschedule or cancel a scheduled session. Only scheduled sessions can be
    changed — once a session is live or over, its history is frozen (use
    terminate for a running one).

    Body: {title?, scheduled_at?, duration_minutes?}  to reschedule, or
          {status: 'cancelled'}                       to cancel.
    """
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    if session.status != 'scheduled':
        return jsonify({
            'error': f'Only scheduled sessions can be edited (this one is {session.status}).'
        }), 400

    data = request.get_json() or {}

    if data.get('status') == 'cancelled':
        session.status = 'cancelled'
        db.session.commit()
        write_audit(g.user_id, g.institution_id, 'cancel_session', 'session',
                    session_id, f"Cancelled \"{session.title or 'Lab Session'}\"")
        return jsonify({'session': _enrich_sessions([session])[0]}), 200

    if 'title' in data:
        title = (data['title'] or '').strip()
        if not title:
            return jsonify({'error': 'Session title cannot be empty'}), 400
        session.title = title

    if 'scheduled_at' in data:
        try:
            session.scheduled_at = datetime.fromisoformat(
                str(data['scheduled_at']).replace('Z', ''))
        except ValueError:
            return jsonify({'error': 'Invalid date & time'}), 400

    if 'duration_minutes' in data:
        try:
            dur = int(data['duration_minutes'])
            if dur <= 0:
                raise ValueError
            session.duration_minutes = dur
        except (TypeError, ValueError):
            return jsonify({'error': 'Duration must be a positive number of minutes'}), 400

    db.session.commit()
    write_audit(g.user_id, g.institution_id, 'reschedule_session', 'session',
                session_id, f"Updated \"{session.title or 'Lab Session'}\"")
    return jsonify({'session': _enrich_sessions([session])[0]}), 200


# ══════════════════════════════════════════════════════════════════════════════
# 6. GROQ BUDGET TRACKING
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/groq-budget', methods=['GET'])
@require_role('institution_admin')
def groq_budget():
    """
    Today's Groq API usage vs limit for this institution.
    Shows: used, limit, remaining, source of limit.
    """
    from datetime import date
    iid   = g.institution_id
    today = date.today().isoformat()

    inst = Institution.query.get_or_404(iid)

    # Determine limit (institution override > plan default > global config)
    if inst.groq_limit_override is not None:
        limit  = inst.groq_limit_override
        source = 'institution_override'
    else:
        plan_limits = {'free': 50, 'pro': 200, 'enterprise': 500}
        limit  = plan_limits.get(inst.plan, 200)
        source = 'plan_default'

    # Get today's usage from groq_usage table
    used = 0
    try:
        row = db.session.execute(
            text("SELECT count FROM groq_usage WHERE institution_id=:iid AND usage_date=:d"),
            {'iid': iid, 'd': today}
        ).fetchone()
        used = row[0] if row else 0
    except Exception:
        db.session.rollback()

    # Last 7 days trend
    trend = []
    try:
        rows = db.session.execute(
            text("""
                SELECT usage_date, count FROM groq_usage
                WHERE institution_id=:iid AND usage_date >= CURRENT_DATE - 7
                ORDER BY usage_date ASC
            """),
            {'iid': iid}
        ).fetchall()
        trend = [{'date': str(r[0]), 'count': r[1]} for r in rows]
    except Exception:
        db.session.rollback()

    return jsonify({
        'institution_id': iid,
        'date':           today,
        'used':           used,
        'limit':          limit,
        'remaining':      max(0, limit - used),
        'exhausted':      used >= limit,
        'limit_source':   source,
        'plan':           inst.plan,
        'trend_7d':       trend,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# 7. DASHBOARD — weekly activity + system health
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/dashboard/activity', methods=['GET'])
@require_role('institution_admin')
def dashboard_activity():
    """
    Real last-7-days activity for the dashboard bar chart: sessions scheduled
    per day plus code submissions per day, and the week-over-week delta the
    header badge shows. Days are returned oldest→newest, one entry per day even
    when the count is zero, so the chart never has gaps.
    """
    iid = g.institution_id
    today = datetime.utcnow().date()
    start = today - timedelta(days=6)            # 7 day window incl. today
    prev_start = start - timedelta(days=7)       # the 7 days before that

    # Sessions per day (by scheduled_at) in the window.
    day_index = {start + timedelta(days=i): 0 for i in range(7)}
    sessions = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.scheduled_at >= datetime.combine(start, datetime.min.time()),
    ).all()
    for s in sessions:
        if s.scheduled_at:
            d = s.scheduled_at.date()
            if d in day_index:
                day_index[d] += 1

    # Code submissions per day — best-effort; the table may not exist in dev.
    submissions_by_day = {d: 0 for d in day_index}
    total_subs_week = 0
    total_subs_prev = 0
    try:
        from app.models.submission import CodeAttempt
        rows = CodeAttempt.query.join(
            User, CodeAttempt.student_id == User.id
        ).filter(
            User.institution_id == iid,
            CodeAttempt.submitted_at >= datetime.combine(prev_start, datetime.min.time()),
        ).all()
        for r in rows:
            if not r.submitted_at:
                continue
            d = r.submitted_at.date()
            if d in submissions_by_day:
                submissions_by_day[d] += 1
                total_subs_week += 1
            elif prev_start <= d < start:
                total_subs_prev += 1
    except Exception:
        db.session.rollback()

    labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    series = []
    for i in range(7):
        d = start + timedelta(days=i)
        series.append({
            'date':        d.isoformat(),
            'label':       labels[d.weekday()],
            'sessions':    day_index[d],
            'submissions': submissions_by_day[d],
            'total':       day_index[d] + submissions_by_day[d],
        })

    sessions_week = sum(day_index.values())
    this_week = sessions_week + total_subs_week
    # Prior-week session count for the delta.
    prev_sessions = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.scheduled_at >= datetime.combine(prev_start, datetime.min.time()),
        LabSession.scheduled_at <  datetime.combine(start, datetime.min.time()),
    ).count()
    last_week = prev_sessions + total_subs_prev
    if last_week > 0:
        delta_pct = round((this_week - last_week) / last_week * 100)
    else:
        delta_pct = 100 if this_week > 0 else 0

    return jsonify({
        'days':          series,
        'total_week':    this_week,
        'delta_pct':     delta_pct,
    }), 200


@institution_ext_bp.route('/system-health', methods=['GET'])
@require_role('institution_admin')
def system_health():
    """
    Live status for the dashboard health panel. Each component is probed cheaply
    and reported as operational / degraded / down, so the card reflects reality
    instead of hard-coded 'Operational' rows.
    """
    components = []

    # API server — if this handler runs at all, the API is up.
    components.append({'label': 'API Server', 'status': 'operational', 'ok': True})

    # Database — a trivial round trip.
    try:
        db.session.execute(text('SELECT 1'))
        components.append({'label': 'Database', 'status': 'operational', 'ok': True})
    except Exception:
        db.session.rollback()
        components.append({'label': 'Database', 'status': 'down', 'ok': False})

    # Code execution — driven by the platform flag.
    exec_on = str(PlatformConfig.get('code_execution_enabled', 'true')).lower() == 'true'
    components.append({
        'label':  'Code Execution',
        'status': 'operational' if exec_on else 'disabled',
        'ok':     exec_on,
    })

    # AI services — degraded when no provider key is configured.
    import os
    ai_ok = bool(os.getenv('GROQ_API_KEY') or os.getenv('GEMINI_API_KEY'))
    ai_on = str(PlatformConfig.get('ai_hints_enabled', 'true')).lower() == 'true'
    components.append({
        'label':  'AI Services',
        'status': 'operational' if (ai_ok and ai_on) else 'degraded',
        'ok':     ai_ok and ai_on,
    })

    maintenance = str(PlatformConfig.get('maintenance_mode', 'false')).lower() == 'true'
    all_ok = all(c['ok'] for c in components) and not maintenance

    return jsonify({
        'components':  components,
        'all_ok':      all_ok,
        'maintenance': maintenance,
    }), 200
