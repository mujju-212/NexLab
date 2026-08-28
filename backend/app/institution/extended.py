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
    from app.models.grading import Grade
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
                text("SELECT id, title FROM experiments WHERE id IN :ids"),
                {'ids': tuple(exp_ids)}
            ).fetchall()
            exp_names = {r[0]: r[1] for r in name_rows}
        except Exception:
            pass

    # Grade stats per experiment — attempt count + avg final grade
    grade_stats = {}
    if exp_ids:
        grade_rows = db.session.query(
            Grade.experiment_id,
            func.count(Grade.id).label('attempt_count'),
            func.avg(Grade.final_grade).label('avg_score'),
        ).filter(
            Grade.experiment_id.in_(exp_ids),
        ).group_by(Grade.experiment_id).all()
        for gr in grade_rows:
            grade_stats[gr.experiment_id] = {
                'attempt_count': gr.attempt_count,
                'avg_score': round(float(gr.avg_score), 1) if gr.avg_score is not None else None,
            }

    result = [{
        'experiment_id':   r[0],
        'experiment_name': exp_names.get(r[0], 'Unknown'),
        'session_count':   r[1],
        'attempt_count':   grade_stats.get(r[0], {}).get('attempt_count', 0),
        'avg_score':       grade_stats.get(r[0], {}).get('avg_score'),
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
    Download a CSV of all students with their real session + grade stats.
    Columns: roll_number, full_name, email, active, department,
             sessions_attended, sessions_total, attendance_pct,
             avg_final_grade, last_active
    """
    from app.models.session import SessionAttendance
    from app.models.grading import Grade
    from app.models.academic import Department
    iid = g.institution_id

    students = User.query.filter_by(
        institution_id=iid, role='student'
    ).order_by(User.full_name).all()

    student_ids = [s.id for s in students]

    # ── Sessions attended per student (via SessionAttendance) ────────────────
    attendance_rows = db.session.query(
        SessionAttendance.student_id,
        func.count(SessionAttendance.session_id).label('sessions_attended'),
        func.max(SessionAttendance.joined_at).label('last_active'),
    ).filter(
        SessionAttendance.student_id.in_(student_ids),
    ).group_by(SessionAttendance.student_id).all()
    attendance_map = {
        r.student_id: {'attended': r.sessions_attended, 'last_active': r.last_active}
        for r in attendance_rows
    }

    # ── Total sessions scheduled in this institution ─────────────────────────
    total_sessions = LabSession.query.filter_by(institution_id=iid).count()

    # ── Average final grade per student ─────────────────────────────────────
    grade_rows = db.session.query(
        Grade.student_id,
        func.avg(Grade.final_grade).label('avg_final'),
    ).filter(
        Grade.student_id.in_(student_ids),
        Grade.final_grade.isnot(None),
    ).group_by(Grade.student_id).all()
    grade_map = {r.student_id: round(float(r.avg_final), 1) for r in grade_rows}

    # ── Department names ─────────────────────────────────────────────────────
    dept_ids = {s.department_id for s in students if s.department_id}
    dept_map = {}
    if dept_ids:
        dept_map = {d.id: d.name for d in Department.query.filter(
            Department.id.in_(dept_ids)).all()}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Roll Number', 'Full Name', 'Email', 'Active', 'Department',
        'Sessions Attended', 'Sessions Total', 'Attendance %',
        'Avg Final Grade', 'Last Active',
    ])

    for s in students:
        att  = attendance_map.get(s.id, {})
        attended     = att.get('attended', 0)
        last_active  = att.get('last_active')
        att_pct = (
            round(attended / total_sessions * 100, 1)
            if total_sessions else 0.0
        )
        writer.writerow([
            s.roll_number or '',
            s.full_name,
            s.email,
            'Yes' if s.is_active else 'No',
            dept_map.get(s.department_id, '') if s.department_id else '',
            attended,
            total_sessions,
            att_pct,
            grade_map.get(s.id, ''),
            last_active.strftime('%Y-%m-%d %H:%M') if last_active else '',
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
    from app.models.academic import SectionSubject, Section, SectionStudent
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

    # ── Readiness warnings (non-blocking) ────────────────────────────────────
    # The session is created regardless; warnings are surfaced so the admin can
    # act before the session goes live.
    warnings = []

    enrolled_count = SectionStudent.query.filter_by(section_id=section_id).count()
    if enrolled_count == 0:
        warnings.append(
            f'Section "{section.name}" has no enrolled students. '
            f'Enrol students before the session starts or no one will see it.'
        )

    instr_user = User.query.filter_by(id=ss.instructor_id).first()
    if not instr_user:
        warnings.append(
            'The assigned instructor account no longer exists. '
            'Reassign the instructor on the Academics page.'
        )
    elif not instr_user.is_active:
        warnings.append(
            f'Instructor "{instr_user.full_name}" is deactivated. '
            f'Reactivate the account or reassign the subject to another instructor.'
        )

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

    return jsonify({'session': _enrich_sessions([session])[0], 'warnings': warnings}), 201


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

    # ── Readiness warnings (non-blocking) ────────────────────────────────────
    bulk_warnings = []

    enrolled_count = SectionStudent.query.filter_by(section_id=section_id).count()
    if enrolled_count == 0:
        bulk_warnings.append(
            f'Section "{section.name}" has no enrolled students. '
            f'Enrol students before these sessions start or no one will see them.'
        )

    instr_user = User.query.filter_by(id=effective_instr_id).first() if effective_instr_id else None
    if not instr_user:
        bulk_warnings.append(
            'The assigned instructor account no longer exists. '
            'Reassign the instructor on the Academics page.'
        )
    elif not instr_user.is_active:
        bulk_warnings.append(
            f'Instructor "{instr_user.full_name}" is deactivated. '
            f'Reactivate the account or reassign the subject to another instructor.'
        )

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
            'warnings': bulk_warnings,
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
        'warnings':      bulk_warnings,
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
# 6. GROQ BUDGET TRACKING + AI GOVERNANCE
# ══════════════════════════════════════════════════════════════════════════════

@institution_ext_bp.route('/groq-budget', methods=['GET'])
@require_role('institution_admin')
def groq_budget():
    """
    Today's AI token usage vs limit for this institution.
    Reads from AIUsageLog (token-level) with a legacy fallback to groq_usage
    request counts so old data is still included.
    """
    from datetime import date
    from app.models.ai_usage import AIUsageLog, AIPolicy, _estimate_cost
    iid   = g.institution_id
    today = date.today().isoformat()

    inst = Institution.query.get_or_404(iid)

    # ── Determine limit ───────────────────────────────────────────────────────
    # Precedence: AIPolicy.daily_token_quota → institution override (requests×2000)
    # → plan default (requests) → global PlatformConfig
    policy = None
    try:
        policy = AIPolicy.get_or_create(iid, updated_by=g.user_id)
        db.session.flush()
    except Exception:
        db.session.rollback()

    if policy and policy.daily_token_quota:
        limit  = policy.daily_token_quota
        source = 'ai_policy_token_quota'
    elif inst.groq_limit_override is not None:
        limit  = inst.groq_limit_override * 2_000   # convert request count → tokens
        source = 'institution_override'
    else:
        plan_limits = {'free': 50, 'pro': 200, 'enterprise': 500}
        limit  = plan_limits.get(inst.plan, 200) * 2_000
        source = 'plan_default'

    # ── Today's token usage from AIUsageLog ───────────────────────────────────
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    used_tokens = 0
    try:
        row = (db.session.query(func.coalesce(func.sum(AIUsageLog.total_tokens), 0))
               .filter(
                   AIUsageLog.institution_id == iid,
                   AIUsageLog.created_at >= today_start,
                   AIUsageLog.success == True,
               )
               .scalar())
        used_tokens = int(row or 0)
    except Exception:
        db.session.rollback()

    # ── Cost estimate for today ───────────────────────────────────────────────
    cost_today = 0.0
    try:
        rows = (db.session.query(AIUsageLog.model,
                                 func.sum(AIUsageLog.total_tokens))
                .filter(
                    AIUsageLog.institution_id == iid,
                    AIUsageLog.created_at >= today_start,
                    AIUsageLog.success == True,
                )
                .group_by(AIUsageLog.model)
                .all())
        cost_today = sum(_estimate_cost(model, int(tokens or 0)) for model, tokens in rows)
    except Exception:
        db.session.rollback()

    # ── 7-day per-day trend from AIUsageLog ───────────────────────────────────
    trend = []
    try:
        from sqlalchemy import cast, Date as SADate
        trend_rows = (db.session.query(
                          cast(AIUsageLog.created_at, SADate).label('d'),
                          func.sum(AIUsageLog.total_tokens).label('tokens'),
                          func.count(AIUsageLog.id).label('calls'),
                      )
                      .filter(
                          AIUsageLog.institution_id == iid,
                          AIUsageLog.created_at >= today_start - timedelta(days=6),
                          AIUsageLog.success == True,
                      )
                      .group_by('d')
                      .order_by('d')
                      .all())
        trend = [{'date': str(r.d), 'tokens': int(r.tokens or 0), 'calls': int(r.calls or 0)}
                 for r in trend_rows]
    except Exception:
        db.session.rollback()

    return jsonify({
        'institution_id':    iid,
        'date':              today,
        'used_tokens':       used_tokens,
        'limit_tokens':      limit,
        'remaining_tokens':  max(0, limit - used_tokens),
        'exhausted':         used_tokens >= limit,
        'limit_source':      source,
        'plan':              inst.plan,
        'cost_usd_today':    round(cost_today, 6),
        'trend_7d':          trend,
        # legacy shim — old frontend expected 'used' and 'limit' as request counts
        'used':              used_tokens // 2000,
        'limit':             limit // 2000,
        'remaining':         max(0, limit - used_tokens) // 2000,
    }), 200


@institution_ext_bp.route('/ai-policy', methods=['GET'])
@require_role('institution_admin')
def get_ai_policy():
    """Return the current AI governance policy for this institution."""
    from app.models.ai_usage import AIPolicy
    policy = AIPolicy.get_or_create(g.institution_id, updated_by=g.user_id)
    db.session.flush()
    return jsonify({'policy': policy.to_dict()}), 200


@institution_ext_bp.route('/ai-policy', methods=['PATCH'])
@require_role('institution_admin')
def update_ai_policy():
    """
    Update AI governance policy fields.
    Only the fields present in the request body are modified.
    Body (all optional):
      ai_enabled_global:     bool
      ai_enabled_students:   bool
      ai_enabled_instructors: bool
      features_enabled:      {hint, chat, code_assist, viva_generate, viva_evaluate, agent} (any subset)
      daily_token_quota:     int | null
      monthly_token_quota:   int | null
      per_student_daily_quota: int | null
      hard_stop:             bool
    """
    import json as _json
    from app.models.ai_usage import AIPolicy
    data   = request.get_json() or {}
    policy = AIPolicy.get_or_create(g.institution_id, updated_by=g.user_id)

    bool_fields = ['ai_enabled_global', 'ai_enabled_students',
                   'ai_enabled_instructors', 'hard_stop']
    int_fields  = ['daily_token_quota', 'monthly_token_quota', 'per_student_daily_quota']

    for field in bool_fields:
        if field in data:
            setattr(policy, field, bool(data[field]))

    for field in int_fields:
        if field in data:
            val = data[field]
            setattr(policy, field, int(val) if val is not None else None)

    if 'features_enabled' in data:
        incoming = data['features_enabled']
        if isinstance(incoming, dict):
            # Merge over defaults — only recognized keys
            merged = dict(AIPolicy.FEATURE_DEFAULTS)
            merged.update({k: bool(v) for k, v in incoming.items()
                           if k in AIPolicy.FEATURE_DEFAULTS})
            policy.features_enabled = _json.dumps(merged)

    policy.updated_by = g.user_id
    policy.updated_at = datetime.utcnow()

    db.session.commit()
    return jsonify({'policy': policy.to_dict()}), 200


@institution_ext_bp.route('/ai-usage', methods=['GET'])
@require_role('institution_admin')
def get_ai_usage():
    """
    AI usage summary and recent log entries for this institution.
    Query params:
      days=7          — window size (max 90, default 7)
      feature=hint    — filter to one feature
      limit=100       — max log rows returned (max 500, default 100)
      offset=0        — pagination
    """
    from app.models.ai_usage import AIUsageLog, _estimate_cost
    iid     = g.institution_id
    days    = min(int(request.args.get('days', 7)), 90)
    feature = request.args.get('feature')
    limit   = min(int(request.args.get('limit', 100)), 500)
    offset  = int(request.args.get('offset', 0))

    since = datetime.utcnow() - timedelta(days=days)

    # Base filter
    base_q = AIUsageLog.query.filter(
        AIUsageLog.institution_id == iid,
        AIUsageLog.created_at >= since,
    )
    if feature:
        base_q = base_q.filter(AIUsageLog.feature == feature)

    # Summary aggregates
    summary = {'calls': 0, 'tokens': 0, 'cost_usd': 0.0, 'by_feature': {}, 'by_model': {}}
    try:
        aggs = (db.session.query(
                    AIUsageLog.feature,
                    AIUsageLog.model,
                    func.count(AIUsageLog.id).label('calls'),
                    func.sum(AIUsageLog.total_tokens).label('tokens'),
                )
                .filter(AIUsageLog.institution_id == iid,
                        AIUsageLog.created_at >= since,
                        AIUsageLog.success == True)
                .group_by(AIUsageLog.feature, AIUsageLog.model)
                .all())

        for row in aggs:
            tkns = int(row.tokens or 0)
            cost = _estimate_cost(row.model, tkns)
            summary['calls']   += int(row.calls)
            summary['tokens']  += tkns
            summary['cost_usd'] = round(summary['cost_usd'] + cost, 6)

            bf = summary['by_feature'].setdefault(row.feature, {'calls': 0, 'tokens': 0})
            bf['calls']  += int(row.calls)
            bf['tokens'] += tkns

            bm = summary['by_model'].setdefault(row.model, {'calls': 0, 'tokens': 0})
            bm['calls']  += int(row.calls)
            bm['tokens'] += tkns
    except Exception:
        db.session.rollback()

    # Recent log rows (paginated)
    log_rows = []
    try:
        rows = (base_q.order_by(AIUsageLog.created_at.desc())
                .limit(limit).offset(offset).all())
        log_rows = [r.to_dict() for r in rows]
    except Exception:
        db.session.rollback()

    total_count = 0
    try:
        total_count = base_q.count()
    except Exception:
        db.session.rollback()

    return jsonify({
        'institution_id': iid,
        'window_days':    days,
        'summary':        summary,
        'logs':           log_rows,
        'total':          total_count,
        'limit':          limit,
        'offset':         offset,
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


# ─────────────────────────────────────────────────────────────────────────────
# Task #46 — Missing analytics endpoints
# ─────────────────────────────────────────────────────────────────────────────

def _date_window(default_days: int = 30):
    """Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD / ?days=N from request args.
    Returns (start_dt, end_dt) as UTC datetime objects."""
    from_str = request.args.get('from')
    to_str   = request.args.get('to')
    if from_str and to_str:
        try:
            start = datetime.strptime(from_str, '%Y-%m-%d')
            end   = datetime.strptime(to_str,   '%Y-%m-%d').replace(
                        hour=23, minute=59, second=59)
            return start, end
        except ValueError:
            pass
    days  = int(request.args.get('days', default_days))
    end   = datetime.utcnow()
    start = end - timedelta(days=days)
    return start, end


# ── 1. Grade / Score Analytics ────────────────────────────────────────────────
@institution_ext_bp.route('/analytics/grades', methods=['GET'])
@require_role('institution_admin')
def analytics_grades():
    """
    Grade breakdown across the institution.

    Optional filters:
      ?section_subject_id=  — narrow to one SectionSubject
      ?session_id=          — narrow to one session
      ?from=YYYY-MM-DD&to=YYYY-MM-DD  or  ?days=N
    Returns per-student grade rows plus institution-wide aggregates
    (avg/min/max for auto_grade, manual_grade, viva_grade, final_grade)
    and a grade-band histogram (A/B/C/D/F).
    """
    from app.models.grading import Grade
    from app.models.academic import SectionSubject, SectionStudent

    start, end = _date_window(30)
    ss_id      = request.args.get('section_subject_id')
    session_filter = request.args.get('session_id')

    # Resolve student_ids that belong to this institution
    student_ids = db.session.query(User.id).filter(
        User.institution_id == g.institution_id,
        User.role == 'student',
    ).subquery()

    q = db.session.query(Grade).filter(
        Grade.student_id.in_(student_ids),
        Grade.graded_at.isnot(None),
        Grade.graded_at >= start,
        Grade.graded_at <= end,
    )

    if session_filter:
        q = q.filter(Grade.session_id == session_filter)
    if ss_id:
        # join through LabSession if a section_subject_id filter is applied
        from app.models.session import LabSession as _LS
        session_ids = db.session.query(_LS.id).filter(
            _LS.institution_id  == g.institution_id,
            _LS.section_subject_id == ss_id,
        ).subquery()
        q = q.filter(Grade.session_id.in_(session_ids))

    grades = q.all()

    if not grades:
        return jsonify({
            'count': 0, 'aggregates': {}, 'distribution': {},
            'rows': [], 'period': {'from': start.isoformat(), 'to': end.isoformat()},
        }), 200

    # Aggregates
    def _agg(vals):
        vals = [v for v in vals if v is not None]
        if not vals:
            return {'avg': None, 'min': None, 'max': None, 'count': 0}
        return {
            'avg':   round(sum(vals) / len(vals), 2),
            'min':   round(min(vals), 2),
            'max':   round(max(vals), 2),
            'count': len(vals),
        }

    # Grade bands based on final_grade (0–100 scale)
    def _band(fg):
        if fg is None:   return 'ungraded'
        if fg >= 90:     return 'A'
        if fg >= 75:     return 'B'
        if fg >= 60:     return 'C'
        if fg >= 45:     return 'D'
        return 'F'

    band_counts = {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0, 'ungraded': 0}
    for g_row in grades:
        band_counts[_band(g_row.final_grade)] += 1

    # Lookup names once
    sid_set = list({g_row.student_id for g_row in grades})
    users_map = {u.id: u for u in User.query.filter(User.id.in_(sid_set)).all()}

    rows = []
    for g_row in grades:
        u = users_map.get(g_row.student_id)
        rows.append({
            'grade_id':         g_row.id,
            'student_id':       g_row.student_id,
            'student_name':     u.full_name if u else None,
            'roll_number':      u.roll_number if u else None,
            'session_id':       g_row.session_id,
            'auto_grade':       g_row.auto_grade,
            'manual_grade':     g_row.manual_grade,
            'viva_grade':       g_row.viva_grade,
            'code_quality_grade': g_row.code_quality_grade,
            'hint_deduction':   g_row.hint_deduction,
            'final_grade':      g_row.final_grade,
            'band':             _band(g_row.final_grade),
            'graded_at':        g_row.graded_at.isoformat() if g_row.graded_at else None,
        })

    return jsonify({
        'count':    len(grades),
        'aggregates': {
            'auto_grade':     _agg([g.auto_grade   for g in grades]),
            'manual_grade':   _agg([g.manual_grade for g in grades]),
            'viva_grade':     _agg([g.viva_grade   for g in grades]),
            'final_grade':    _agg([g.final_grade  for g in grades]),
            'hint_deduction': _agg([g.hint_deduction for g in grades]),
        },
        'distribution': band_counts,
        'rows':     rows,
        'period':   {'from': start.isoformat(), 'to': end.isoformat()},
    }), 200


# ── 2. Attendance Analytics ───────────────────────────────────────────────────
@institution_ext_bp.route('/analytics/attendance', methods=['GET'])
@require_role('institution_admin')
def analytics_attendance():
    """
    Attendance summary across all institution sessions.

    Optional filters:
      ?session_id=     — single session detail
      ?section_subject_id= — all sessions under a SectionSubject
      ?from=YYYY-MM-DD&to=YYYY-MM-DD  or  ?days=N

    Returns:
      - status breakdown (present/late/partial/absent/inactive_present)
      - avg time_in_session per present student (seconds)
      - is_active_participant rate
      - per-session aggregates
    """
    from app.models.session import SessionAttendance, LabSession as _LS

    start, end = _date_window(30)
    session_filter = request.args.get('session_id')
    ss_id          = request.args.get('section_subject_id')

    # Base: sessions belonging to this institution in the window
    sess_q = db.session.query(_LS.id).filter(
        _LS.institution_id == g.institution_id,
        _LS.scheduled_at   >= start,
        _LS.scheduled_at   <= end,
    )
    if session_filter:
        sess_q = sess_q.filter(_LS.id == session_filter)
    if ss_id:
        sess_q = sess_q.filter(_LS.section_subject_id == ss_id)

    session_ids = [row[0] for row in sess_q.all()]

    if not session_ids:
        return jsonify({
            'total_sessions': 0,
            'status_breakdown': {},
            'avg_time_seconds': None,
            'active_participant_rate': None,
            'sessions': [],
            'period': {'from': start.isoformat(), 'to': end.isoformat()},
        }), 200

    # All attendance rows for those sessions
    att_rows = SessionAttendance.query.filter(
        SessionAttendance.session_id.in_(session_ids)
    ).all()

    status_counts = {
        'present': 0, 'late': 0, 'partial': 0,
        'absent': 0, 'inactive_present': 0,
    }
    total_time   = []
    active_flags = []

    for row in att_rows:
        s = row.status or 'absent'
        status_counts[s] = status_counts.get(s, 0) + 1
        if s not in ('absent',):
            total_time.append(row.total_time_seconds or 0)
        active_flags.append(1 if row.is_active_participant else 0)

    avg_time = round(sum(total_time) / len(total_time), 1) if total_time else None
    active_rate = (
        round(sum(active_flags) / len(active_flags) * 100, 1)
        if active_flags else None
    )

    # Per-session summary
    from collections import defaultdict
    per_session = defaultdict(lambda: {
        'present': 0, 'late': 0, 'partial': 0, 'absent': 0,
        'inactive_present': 0, 'total': 0,
    })
    for row in att_rows:
        s = row.status or 'absent'
        per_session[row.session_id][s] = per_session[row.session_id].get(s, 0) + 1
        per_session[row.session_id]['total'] += 1

    sessions_out = [
        {'session_id': sid, **counts}
        for sid, counts in per_session.items()
    ]

    return jsonify({
        'total_sessions':        len(session_ids),
        'total_records':         len(att_rows),
        'status_breakdown':      status_counts,
        'avg_time_seconds':      avg_time,
        'active_participant_rate': active_rate,
        'sessions':              sessions_out,
        'period': {'from': start.isoformat(), 'to': end.isoformat()},
    }), 200


# ── 3. Proctoring / Integrity Analytics ──────────────────────────────────────
@institution_ext_bp.route('/analytics/proctoring', methods=['GET'])
@require_role('institution_admin')
def analytics_proctoring():
    """
    Aggregate FocusScore signals across institution sessions to surface
    integrity risk indicators.

    Optional filters:
      ?session_id=   — single session
      ?student_id=   — single student (admin can check one learner)
      ?from=YYYY-MM-DD&to=YYYY-MM-DD  or  ?days=N

    Signals aggregated (avg per record):
      tab_switches_per_min, idle_seconds, typing_speed_wpm,
      backspace_ratio, copy_paste_count, window_focus_ratio

    Returns institution-level averages plus a per-student risk summary
    (students sorted by lowest avg focus_score descending risk).
    """
    from app.models.knowledge import FocusScore
    from app.models.session  import LabSession as _LS

    start, end     = _date_window(30)
    session_filter = request.args.get('session_id')
    student_filter = request.args.get('student_id')

    # Scope to institution
    inst_session_ids = db.session.query(_LS.id).filter(
        _LS.institution_id == g.institution_id,
        _LS.scheduled_at   >= start,
        _LS.scheduled_at   <= end,
    )
    if session_filter:
        inst_session_ids = inst_session_ids.filter(_LS.id == session_filter)

    inst_session_ids = [r[0] for r in inst_session_ids.all()]

    if not inst_session_ids:
        return jsonify({
            'total_records': 0,
            'institution_avg': {},
            'at_risk_students': [],
            'period': {'from': start.isoformat(), 'to': end.isoformat()},
        }), 200

    fs_q = FocusScore.query.filter(
        FocusScore.session_id.in_(inst_session_ids)
    )
    if student_filter:
        fs_q = fs_q.filter(FocusScore.student_id == student_filter)

    fs_rows = fs_q.all()

    if not fs_rows:
        return jsonify({
            'total_records': 0,
            'institution_avg': {},
            'at_risk_students': [],
            'period': {'from': start.isoformat(), 'to': end.isoformat()},
        }), 200

    SIGNAL_KEYS = [
        'tab_switches_per_min', 'idle_seconds', 'typing_speed_wpm',
        'backspace_ratio', 'copy_paste_count', 'window_focus_ratio',
    ]

    def _extract(row, key):
        sig = row.signals or {}
        v = sig.get(key)
        return float(v) if v is not None else None

    def _mean(vals):
        vals = [v for v in vals if v is not None]
        return round(sum(vals) / len(vals), 3) if vals else None

    # Institution-level averages
    inst_avg = {
        key: _mean([_extract(r, key) for r in fs_rows])
        for key in SIGNAL_KEYS
    }
    inst_avg['focus_score'] = _mean([r.focus_score for r in fs_rows])

    # ── ProctorEvent discrete counts (fail-open — table may not exist yet) ──
    try:
        from app.models.proctor_event import ProctorEvent
        pe_q = ProctorEvent.query.filter(
            ProctorEvent.institution_id == g.institution_id,
            ProctorEvent.session_id.in_(inst_session_ids),
        )
        if student_filter:
            pe_q = pe_q.filter(ProctorEvent.student_id == student_filter)
        pe_rows = pe_q.with_entities(
            ProctorEvent.student_id, ProctorEvent.event_type
        ).all()
    except Exception:
        pe_rows = []

    # Build per-student event counts
    from collections import defaultdict
    pe_counts = defaultdict(lambda: defaultdict(int))  # student_id → {event_type: N}
    pe_totals = defaultdict(int)                         # event_type → N (institution-wide)
    for sid, etype in pe_rows:
        pe_counts[sid][etype] += 1
        pe_totals[etype] += 1

    # Per-student aggregation (FocusScore + ProctorEvent)
    by_student = defaultdict(list)
    for r in fs_rows:
        by_student[r.student_id].append(r)

    # Include students who only have ProctorEvents but no FocusScore rows
    for sid in pe_counts:
        if sid not in by_student:
            by_student[sid] = []

    sid_set   = list(by_student.keys())
    users_map = {u.id: u for u in User.query.filter(User.id.in_(sid_set)).all()} if sid_set else {}

    at_risk = []
    for sid, rows in by_student.items():
        u = users_map.get(sid)
        avg_focus = _mean([r.focus_score for r in rows]) if rows else None
        record = {
            'student_id':  sid,
            'full_name':   u.full_name  if u else None,
            'roll_number': u.roll_number if u else None,
            'samples':     len(rows),
            'avg_focus_score': avg_focus,
            'signals': {
                key: _mean([_extract(r, key) for r in rows])
                for key in SIGNAL_KEYS
            } if rows else {},
            'proctor_events': dict(pe_counts.get(sid, {})),
        }
        at_risk.append(record)

    # Sort by avg_focus_score ascending (lowest focus = most at risk)
    at_risk.sort(key=lambda x: (x['avg_focus_score'] is None, x['avg_focus_score'] or 0))

    return jsonify({
        'total_records':         len(fs_rows),
        'institution_avg':       inst_avg,
        'proctor_event_totals':  dict(pe_totals),
        'at_risk_students':      at_risk,
        'period': {'from': start.isoformat(), 'to': end.isoformat()},
    }), 200


# ── 4. Week-over-Week Trend / Time-Series Analytics ──────────────────────────
@institution_ext_bp.route('/analytics/trends', methods=['GET'])
@require_role('institution_admin')
def analytics_trends():
    """
    Weekly time-series for 4 key institution metrics over a lookback window
    (default 12 weeks, max 52 via ?weeks=N).

    Metrics returned per ISO week (YYYY-WW):
      - sessions_held     : LabSession rows that ended in that week
      - avg_attendance    : mean attendance record count / session for that week
      - avg_final_grade   : mean Grade.final_grade graded that week
      - avg_focus_score   : mean FocusScore.focus_score recorded that week
    """
    from app.models.session  import LabSession as _LS, SessionAttendance
    from app.models.grading  import Grade
    from app.models.knowledge import FocusScore

    weeks = min(int(request.args.get('weeks', 12)), 52)
    end   = datetime.utcnow()
    start = end - timedelta(weeks=weeks)

    # ── sessions per week ──────────────────────────────────────────────────
    # group by ISO week using DATE_TRUNC
    sess_weekly = db.session.execute(
        text("""
            SELECT TO_CHAR(DATE_TRUNC('week', ended_at), 'IYYY-IW') AS wk,
                   COUNT(*)                                         AS cnt
            FROM lab_sessions
            WHERE institution_id = :iid
              AND status         = 'ended'
              AND ended_at       >= :start
              AND ended_at       <= :end
            GROUP BY wk
            ORDER BY wk
        """),
        {'iid': g.institution_id, 'start': start, 'end': end},
    ).fetchall()

    # ── avg attendance per session per week ────────────────────────────────
    att_weekly = db.session.execute(
        text("""
            SELECT TO_CHAR(DATE_TRUNC('week', ls.ended_at), 'IYYY-IW') AS wk,
                   COUNT(sa.student_id)::float / NULLIF(COUNT(DISTINCT sa.session_id), 0) AS avg_att
            FROM session_attendance sa
            JOIN lab_sessions ls ON ls.id = sa.session_id
            WHERE ls.institution_id = :iid
              AND ls.status         = 'ended'
              AND ls.ended_at       >= :start
              AND ls.ended_at       <= :end
            GROUP BY wk
            ORDER BY wk
        """),
        {'iid': g.institution_id, 'start': start, 'end': end},
    ).fetchall()

    # ── avg final grade per week ───────────────────────────────────────────
    grade_weekly = db.session.execute(
        text("""
            SELECT TO_CHAR(DATE_TRUNC('week', g.graded_at), 'IYYY-IW') AS wk,
                   AVG(g.final_grade)                                   AS avg_fg
            FROM grades g
            JOIN users u ON u.id = g.student_id
            WHERE u.institution_id = :iid
              AND g.graded_at      >= :start
              AND g.graded_at      <= :end
              AND g.final_grade    IS NOT NULL
            GROUP BY wk
            ORDER BY wk
        """),
        {'iid': g.institution_id, 'start': start, 'end': end},
    ).fetchall()

    # ── avg focus score per week ───────────────────────────────────────────
    focus_weekly = db.session.execute(
        text("""
            SELECT TO_CHAR(DATE_TRUNC('week', fs.recorded_at), 'IYYY-IW') AS wk,
                   AVG(fs.focus_score)                                     AS avg_fs
            FROM focus_scores fs
            JOIN lab_sessions ls ON ls.id = fs.session_id
            WHERE ls.institution_id = :iid
              AND fs.recorded_at    >= :start
              AND fs.recorded_at    <= :end
              AND fs.focus_score    IS NOT NULL
            GROUP BY wk
            ORDER BY wk
        """),
        {'iid': g.institution_id, 'start': start, 'end': end},
    ).fetchall()

    # Build unified week map
    from collections import defaultdict
    week_data = defaultdict(lambda: {
        'sessions_held':   0,
        'avg_attendance':  None,
        'avg_final_grade': None,
        'avg_focus_score': None,
    })

    for row in sess_weekly:
        week_data[row[0]]['sessions_held'] = row[1]
    for row in att_weekly:
        week_data[row[0]]['avg_attendance'] = round(float(row[1]), 2) if row[1] is not None else None
    for row in grade_weekly:
        week_data[row[0]]['avg_final_grade'] = round(float(row[1]), 2) if row[1] is not None else None
    for row in focus_weekly:
        week_data[row[0]]['avg_focus_score'] = round(float(row[1]), 2) if row[1] is not None else None

    series = [
        {'week': wk, **vals}
        for wk, vals in sorted(week_data.items())
    ]

    return jsonify({
        'weeks_requested': weeks,
        'series':          series,
        'period': {'from': start.strftime('%Y-%m-%d'), 'to': end.strftime('%Y-%m-%d')},
    }), 200


# ── 5. Engagement / Retention Analytics ──────────────────────────────────────
@institution_ext_bp.route('/analytics/engagement', methods=['GET'])
@require_role('institution_admin')
def analytics_engagement():
    """
    Learner engagement and retention metrics for the institution.

    Defines:
      - active_student    : has at least 1 SessionAttendance record in the window
                            where status in (present/late/partial/inactive_present)
      - dormant_student   : enrolled (role=student) but zero attendance in the window
      - at_risk_student   : attended < 50% of sessions they were enrolled in

    Optional: ?days=N (default 30) / ?from=YYYY-MM-DD&to=YYYY-MM-DD
    """
    from app.models.session  import LabSession as _LS, SessionAttendance
    from app.models.academic import SectionStudent, SectionSubject

    start, end = _date_window(30)

    # All students in the institution
    all_students = User.query.filter(
        User.institution_id == g.institution_id,
        User.role == 'student',
        User.is_active.is_(True),
    ).all()
    all_ids = {s.id for s in all_students}

    # Sessions in window for this institution
    sessions_in_window = db.session.query(_LS.id, _LS.section_subject_id).filter(
        _LS.institution_id == g.institution_id,
        _LS.scheduled_at   >= start,
        _LS.scheduled_at   <= end,
        _LS.status         != 'cancelled',
    ).all()
    sess_ids = [r[0] for r in sessions_in_window]

    if not sess_ids:
        return jsonify({
            'active_students':   0,
            'dormant_students':  len(all_ids),
            'at_risk_students':  0,
            'engagement_rate':   0.0,
            'retention': [],
            'period': {'from': start.isoformat(), 'to': end.isoformat()},
        }), 200

    # Attendance rows for these sessions
    PRESENT_STATUSES = ('present', 'late', 'partial', 'inactive_present')
    att_rows = SessionAttendance.query.filter(
        SessionAttendance.session_id.in_(sess_ids),
    ).all()

    # Students with at least one present-equivalent record
    attended_by = {}   # student_id -> set of session_ids attended
    for row in att_rows:
        if row.status in PRESENT_STATUSES:
            attended_by.setdefault(row.student_id, set()).add(row.session_id)

    active_ids  = {sid for sid in attended_by if sid in all_ids}
    dormant_ids = all_ids - active_ids

    # Sessions per SectionSubject → sessions per enrolled student
    # Build: section_subject_id → [session_ids]
    ss_to_sessions = {}
    for r in sessions_in_window:
        ss_to_sessions.setdefault(r[1], []).append(r[0])

    # Enrolled students per SectionSubject
    ss_enroll = db.session.query(
        SectionStudent.student_id,
        SectionSubject.id,
    ).join(
        SectionSubject,
        SectionStudent.section_id == SectionSubject.section_id,
    ).filter(
        SectionSubject.institution_id == g.institution_id,
        SectionStudent.student_id.in_(list(all_ids)),
    ).all()

    # student → set of sessions they SHOULD attend
    expected = {}   # student_id -> set of session_ids
    for student_id, ss_id in ss_enroll:
        for sess_id in ss_to_sessions.get(ss_id, []):
            expected.setdefault(student_id, set()).add(sess_id)

    at_risk = []
    for student_id, exp_sessions in expected.items():
        if not exp_sessions:
            continue
        attended = attended_by.get(student_id, set())
        rate = len(attended & exp_sessions) / len(exp_sessions)
        if rate < 0.5:
            u = next((s for s in all_students if s.id == student_id), None)
            at_risk.append({
                'student_id':     student_id,
                'full_name':      u.full_name  if u else None,
                'roll_number':    u.roll_number if u else None,
                'expected_sessions': len(exp_sessions),
                'attended_sessions': len(attended & exp_sessions),
                'attendance_rate':   round(rate * 100, 1),
            })

    at_risk.sort(key=lambda x: x['attendance_rate'])

    engagement_rate = (
        round(len(active_ids) / len(all_ids) * 100, 1)
        if all_ids else 0.0
    )

    return jsonify({
        'total_students':    len(all_ids),
        'active_students':   len(active_ids),
        'dormant_students':  len(dormant_ids),
        'at_risk_count':     len(at_risk),
        'engagement_rate':   engagement_rate,
        'at_risk_students':  at_risk,
        'period': {'from': start.isoformat(), 'to': end.isoformat()},
    }), 200


# ── 6. Instructor Performance Analytics (B5 — requires ProctorEvent table) ────
@institution_ext_bp.route('/analytics/instructors', methods=['GET'])
@require_role('institution_admin')
def analytics_instructors():
    """
    Per-instructor performance and workload metrics for the institution.

    Metrics per instructor:
      - sessions_run     : number of sessions they ran (status != 'cancelled')
      - avg_attendance   : mean attendance_rate across their sessions
      - avg_final_grade  : mean final-grade score from Grade rows for their sessions
      - avg_focus_score  : mean student focus score across their sessions
      - avg_feedback     : mean session feedback rating (1–5)
      - subjects_count   : distinct subjects they teach
      - sections_count   : distinct sections they are assigned to

    Optional: ?days=N (default 60) / ?from=YYYY-MM-DD&to=YYYY-MM-DD
    """
    from app.models.academic import SectionSubject
    from app.models.session  import SessionAttendance
    from app.models.grading  import Grade
    from app.models.knowledge import FocusScore
    from app.models.feedback  import SessionFeedback
    from collections import defaultdict

    start, end = _date_window(60)

    # All instructors at this institution
    instructors = User.query.filter(
        User.institution_id == g.institution_id,
        User.role == 'instructor',
    ).all()
    if not instructors:
        return jsonify({'instructors': [], 'period': {'from': start.isoformat(), 'to': end.isoformat()}}), 200

    instr_ids = [i.id for i in instructors]

    # SectionSubject rows for these instructors → subject + section counts
    ss_rows = SectionSubject.query.filter(
        SectionSubject.institution_id == g.institution_id,
        SectionSubject.instructor_id.in_(instr_ids),
    ).all()
    # instructor_id → sets of subject_id / section_id
    instr_subjects  = defaultdict(set)
    instr_sections  = defaultdict(set)
    ss_to_instr     = {}   # ss_id → instructor_id
    for ss in ss_rows:
        instr_subjects[ss.instructor_id].add(ss.subject_id)
        instr_sections[ss.instructor_id].add(ss.section_id)
        ss_to_instr[ss.id] = ss.instructor_id

    # Sessions in date window scoped to this institution
    sessions_in_window = LabSession.query.filter(
        LabSession.institution_id == g.institution_id,
        LabSession.scheduled_at  >= start,
        LabSession.scheduled_at  <= end,
        LabSession.status        != 'cancelled',
    ).all()

    # Bucket sessions by instructor via SectionSubject
    instr_sessions = defaultdict(list)
    for sess in sessions_in_window:
        iid = ss_to_instr.get(sess.section_subject_id)
        if iid:
            instr_sessions[iid].append(sess)

    # Attendance per session: attendance_rate = present / enrolled
    sess_ids = [s.id for s in sessions_in_window]
    if sess_ids:
        att_rows      = SessionAttendance.query.filter(
            SessionAttendance.session_id.in_(sess_ids)).all()
        grade_rows    = Grade.query.filter(
            Grade.session_id.in_(sess_ids),
        ).all()
        focus_rows    = FocusScore.query.filter(
            FocusScore.session_id.in_(sess_ids)).all()
        feedback_rows = SessionFeedback.query.filter(
            SessionFeedback.session_id.in_(sess_ids)).all()
    else:
        att_rows = grade_rows = focus_rows = feedback_rows = []

    # Index by session_id
    PRESENT_STATUSES = ('present', 'late', 'partial', 'inactive_present')
    att_by_sess   = defaultdict(list)
    for r in att_rows:
        att_by_sess[r.session_id].append(r)
    grade_by_sess = defaultdict(list)
    for r in grade_rows:
        grade_by_sess[r.session_id].append(r)
    focus_by_sess = defaultdict(list)
    for r in focus_rows:
        focus_by_sess[r.session_id].append(r)
    feed_by_sess  = defaultdict(list)
    for r in feedback_rows:
        feed_by_sess[r.session_id].append(r)

    def _safe_mean(vals):
        vals = [v for v in vals if v is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    result = []
    for instr in instructors:
        my_sessions = instr_sessions.get(instr.id, [])

        # Per-session attendance rate then averaged
        att_rates = []
        for sess in my_sessions:
            rows = att_by_sess[sess.id]
            if not rows:
                continue
            total    = len(rows)
            present  = sum(1 for r in rows if r.status in PRESENT_STATUSES)
            att_rates.append(present / total * 100 if total else 0)

        # Grades (final_grade is the blended percentage)
        grade_scores = [
            r.final_grade
            for sess in my_sessions
            for r in grade_by_sess[sess.id]
            if r.final_grade is not None
        ]

        # Focus
        focus_scores = [
            r.focus_score
            for sess in my_sessions
            for r in focus_by_sess[sess.id]
            if r.focus_score is not None
        ]

        # Feedback ratings
        feedback_vals = [
            r.overall_rating
            for sess in my_sessions
            for r in feed_by_sess[sess.id]
            if r.overall_rating is not None
        ]

        result.append({
            'instructor_id':   instr.id,
            'full_name':       instr.full_name,
            'email':           instr.email,
            'sessions_run':    len(my_sessions),
            'subjects_count':  len(instr_subjects.get(instr.id, set())),
            'sections_count':  len(instr_sections.get(instr.id, set())),
            'avg_attendance':  _safe_mean(att_rates),
            'avg_final_grade': _safe_mean(grade_scores),
            'avg_focus_score': _safe_mean(focus_scores),
            'avg_feedback':    _safe_mean(feedback_vals),
        })

    # Sort by sessions_run desc
    result.sort(key=lambda x: x['sessions_run'], reverse=True)

    return jsonify({
        'instructors': result,
        'period': {'from': start.isoformat(), 'to': end.isoformat()},
    }), 200


# ── 7. Proctoring Event Log (discrete events, with ProctorEvent persistence) ──
@institution_ext_bp.route('/analytics/proctoring/events', methods=['GET'])
@require_role('institution_admin')
def analytics_proctoring_events():
    """
    Returns raw ProctorEvent rows for a date window with filter options.

    Optional filters:
      ?session_id=   — single session
      ?student_id=   — single student
      ?event_type=   — tab_switch | fullscreen_exit | lockdown_violation | screen_share_stop
      ?days=N        — lookback (default 30)
      ?limit=N       — page size (default 200)
      ?offset=N      — pagination offset

    Returns:
      total_events   : count of all events (before pagination)
      event_type_counts : {'tab_switch': N, 'fullscreen_exit': N, …}
      at_risk_students  : students with ≥3 high-severity events (sorted by count)
      events         : paginated rows
    """
    from app.models.proctor_event import ProctorEvent
    from app.models.session       import LabSession as _LS
    from collections import defaultdict

    start, end = _date_window(30)

    session_filter    = request.args.get('session_id')
    student_filter    = request.args.get('student_id')
    event_type_filter = request.args.get('event_type')
    limit             = min(int(request.args.get('limit', 200)), 1000)
    offset            = int(request.args.get('offset', 0))

    q = ProctorEvent.query.filter(
        ProctorEvent.institution_id == g.institution_id,
        ProctorEvent.recorded_at    >= start,
        ProctorEvent.recorded_at    <= end,
    )
    if session_filter:
        q = q.filter(ProctorEvent.session_id == session_filter)
    if student_filter:
        q = q.filter(ProctorEvent.student_id == student_filter)
    if event_type_filter:
        q = q.filter(ProctorEvent.event_type == event_type_filter)

    total_events = q.count()
    rows         = q.order_by(ProctorEvent.recorded_at.desc()).limit(limit).offset(offset).all()

    # Event type breakdown
    all_rows = (q.with_entities(ProctorEvent.event_type, ProctorEvent.severity,
                                 ProctorEvent.student_id)
                 .all())
    type_counts     = defaultdict(int)
    high_by_student = defaultdict(int)
    for event_type, severity, sid in all_rows:
        type_counts[event_type] += 1
        if severity == 'high':
            high_by_student[sid] += 1

    # Load user info for at-risk students
    at_risk_ids = [sid for sid, cnt in high_by_student.items() if cnt >= 3]
    users_map   = {u.id: u for u in User.query.filter(User.id.in_(at_risk_ids)).all()} if at_risk_ids else {}
    at_risk = sorted(
        [{'student_id': sid,
          'full_name':   users_map[sid].full_name  if sid in users_map else None,
          'roll_number': users_map[sid].roll_number if sid in users_map else None,
          'high_severity_events': cnt}
         for sid, cnt in high_by_student.items() if cnt >= 3],
        key=lambda x: x['high_severity_events'], reverse=True,
    )

    return jsonify({
        'total_events':      total_events,
        'event_type_counts': dict(type_counts),
        'at_risk_students':  at_risk,
        'events': [r.to_dict() for r in rows],
        'period': {'from': start.isoformat(), 'to': end.isoformat()},
    }), 200


# ── 8. AI Usage analytics (per-feature + top consumers) ──────────────────────
@institution_ext_bp.route('/analytics/ai-usage', methods=['GET'])
@require_role('institution_admin')
def analytics_ai_usage():
    """
    Institution-wide AI usage aggregated from AIUsageLog — the analytics view.

    Optional: ?days=N (default 30)

    Returns the AIUsageReport shape consumed by the Analytics → AI Usage tab:
      total_calls    : successful AI calls in the window
      total_tokens   : total tokens consumed
      by_feature     : {hint: {calls, tokens}, chat: {...}, …}
      top_consumers  : per-user aggregates (calls + tokens), joined with names
      period         : {from, to}
    """
    from app.models.ai_usage import AIUsageLog
    from collections import defaultdict

    start, end = _date_window(30)
    iid = g.institution_id

    try:
        rows = (db.session.query(
                    AIUsageLog.feature,
                    AIUsageLog.user_id,
                    AIUsageLog.role,
                    func.count(AIUsageLog.id).label('calls'),
                    func.sum(AIUsageLog.total_tokens).label('tokens'),
                )
                .filter(AIUsageLog.institution_id == iid,
                        AIUsageLog.created_at >= start,
                        AIUsageLog.created_at <= end,
                        AIUsageLog.success == True)
                .group_by(AIUsageLog.feature, AIUsageLog.user_id, AIUsageLog.role)
                .all())
    except Exception:
        db.session.rollback()
        rows = []

    by_feature   = defaultdict(lambda: {'calls': 0, 'tokens': 0})
    per_user     = defaultdict(lambda: {'calls': 0, 'tokens': 0, 'role': None})
    total_calls  = 0
    total_tokens = 0

    for feature, user_id, role, calls, tokens in rows:
        calls = int(calls or 0)
        tokens = int(tokens or 0)
        total_calls  += calls
        total_tokens += tokens
        by_feature[feature]['calls']  += calls
        by_feature[feature]['tokens'] += tokens
        if user_id:
            per_user[user_id]['calls']  += calls
            per_user[user_id]['tokens'] += tokens
            per_user[user_id]['role']    = role

    # Join user names
    users_map = {}
    if per_user:
        try:
            users_map = {u.id: u for u in User.query.filter(User.id.in_(per_user.keys())).all()}
        except Exception:
            users_map = {}

    top_consumers = sorted(
        [{'user_id': uid,
          'full_name': users_map[uid].full_name  if uid in users_map else None,
          'role':      agg['role'] or 'unknown',
          'calls':     agg['calls'],
          'tokens':    agg['tokens']}
         for uid, agg in per_user.items()],
        key=lambda x: x['tokens'], reverse=True,
    )[:25]

    return jsonify({
        'total_calls':    total_calls,
        'total_tokens':   total_tokens,
        'by_feature':     dict(by_feature),
        'top_consumers':  top_consumers,
        'period':         {'from': start.isoformat(), 'to': end.isoformat()},
    }), 200
