"""
app/admin/users.py — Platform Admin: User Management + User-360 (Phase 1).

The authoritative cross-tenant console surface for PEOPLE on the platform:
every role, every institution, plus the direct (platform) users. All routes
require platform_admin; every mutation writes an AuditLog row with a
before/after detail. Read endpoints are never audited (noise).

Suspension & revocation semantics:
  suspend      -> status='suspended' + force_logout_at=now  (live JWTs die on
                  the next request via the auth guard; login returns 403)
  force-logout -> force_logout_at=now only
  reset-password -> temp password + must_change_password + force_logout_at
"""
import secrets
import string
from datetime import datetime

from flask import Blueprint, jsonify, request, g

from app.auth.utils import require_role
from app.extensions import db
from app.models.academic import AuditLog
from app.models.user import User
from app.models.institution import Institution

admin_users_bp = Blueprint('admin_users', __name__)

_ROLES = ('platform_admin', 'institution_admin', 'instructor', 'student', 'platform_user')


# ── helpers ────────────────────────────────────────────────────────────────

def _audit(action, target_user, detail, severity='medium', module='Platform Users'):
    """Write one platform-scope audit row. institution_id is the TARGET's
    tenant (NULL for direct users) — tenant-scoped viewers never see NULL
    rows, the platform audit viewer sees everything."""
    db.session.add(AuditLog(
        institution_id=target_user.institution_id,   # NULLable since P1
        actor_id=g.user_id,
        action=action,
        target_type='user',
        target_id=target_user.id,
        detail=detail,
        module=module,
        severity=severity,
        ip_address=request.headers.get('X-Forwarded-For', request.remote_addr or ''),
    ))


def _user_or_404(user_id):
    user = User.query.get(user_id)
    if not user:
        return None, (jsonify({'error': 'User not found.'}), 404)
    return user, None


def _inst_name(institution_id):
    if not institution_id:
        return None
    inst = Institution.query.get(institution_id)
    return inst.name if inst else None


def _dir_row(u):
    return {
        'id': u.id,
        'full_name': u.full_name,
        'email': u.email,
        'role': u.role,
        'institution_id': u.institution_id,
        'institution_name': _inst_name(u.institution_id),
        'account_type': 'institution' if u.institution_id else 'direct',
        'status': u.status or 'active',
        'is_active': bool(u.is_active),
        'must_change_password': bool(u.must_change_password),
        'created_at': u.created_at.isoformat() + 'Z' if u.created_at else None,
        'last_login': u.last_login.isoformat() + 'Z' if u.last_login else None,
    }


# ── directory ──────────────────────────────────────────────────────────────

@admin_users_bp.route('/users', methods=['GET'])
@require_role('platform_admin')
def list_users():
    """Paginated global user directory.
    ?q=&role=&institution_id=<id|direct>&status=&sort=-last_login&page=&per_page="""
    q_txt = (request.args.get('q') or '').strip()
    role = request.args.get('role') or None
    inst = (request.args.get('institution_id') or '').strip()
    status = (request.args.get('status') or '').strip() or None
    page = max(1, int(request.args.get('page', 1)))
    per_page = min(int(request.args.get('per_page', 25)), 100)
    sort = (request.args.get('sort') or '-last_login').strip()

    query = User.query
    if q_txt:
        like = f'%{q_txt}%'
        query = query.filter(db.or_(User.full_name.ilike(like), User.email.ilike(like)))
    if role in _ROLES:
        query = query.filter_by(role=role)
    if inst == 'direct':
        query = query.filter(User.institution_id.is_(None))
    elif inst:
        query = query.filter_by(institution_id=inst)
    if status:
        query = query.filter_by(status=status)

    sort_map = {
        'last_login': User.last_login.asc().nullsfirst(),
        '-last_login': User.last_login.desc().nullslast(),
        'created_at': User.created_at.asc(),
        '-created_at': User.created_at.desc(),
        'full_name': User.full_name.asc(),
        '-full_name': User.full_name.desc(),
    }
    query = query.order_by(sort_map.get(sort, sort_map['-last_login']))

    total = query.count()
    rows = query.paginate(page=page, per_page=per_page, error_out=False).items
    return jsonify({
        'total': total,
        'page': page,
        'pages': max(1, -(-total // per_page)),
        'users': [_dir_row(u) for u in rows],
    }), 200


# ── User-360 ───────────────────────────────────────────────────────────────

@admin_users_bp.route('/users/<user_id>', methods=['GET'])
@require_role('platform_admin')
def user_360(user_id):
    """Identity header + quick activity counters for the 360 view."""
    user, err = _user_or_404(user_id)
    if err:
        return err

    from app.models.platform_content import PlatformProgress
    from app.models.practice import PracticeSubmission, StudentXP
    from app.models.grading import Grade
    from app.models.exam import ExamAttempt

    solves = PlatformProgress.query.filter_by(user_id=user.id, status='solved').count()
    p_subs = PracticeSubmission.query.filter_by(student_id=user.id, is_run=False).count()
    p_accepted = PracticeSubmission.query.filter_by(
        student_id=user.id, is_run=False, status='Accepted').count()
    xp = StudentXP.query.filter_by(student_id=user.id).first()
    grades_n = Grade.query.filter_by(student_id=user.id).count()
    exams_n = ExamAttempt.query.filter_by(student_id=user.id).count()

    return jsonify({
        'user': {
            **user.to_dict(),
            'institution_name': _inst_name(user.institution_id),
            'account_type': 'institution' if user.institution_id else 'direct',
            'suspension_reason': user.suspension_reason,
            'suspended_until': user.suspended_until.isoformat() + 'Z' if user.suspended_until else None,
        },
        'stats': {
            'course_solves': solves,
            'practice_submissions': p_subs,
            'practice_accepted': p_accepted,
            'total_xp': (xp.total_xp or 0) if xp else 0,
            'level': (xp.level or 1) if xp else None,
            'level_name': xp.level_name if xp else None,
            'grades': grades_n,
            'exam_attempts': exams_n,
        },
    }), 200


@admin_users_bp.route('/users/<user_id>/progress', methods=['GET'])
@require_role('platform_admin')
def user_progress(user_id):
    """Learning progress: platform courses, practice mastery, activity."""
    user, err = _user_or_404(user_id)
    if err:
        return err

    from app.platform_user_analytics.course_stats import get_user_course_analytics
    from app.platform_user_analytics.activity import (
        get_platform_user_activity, get_practice_topic_mastery,
    )
    from app.models.practice import StudentXP, PlatformRating

    xp = StudentXP.query.filter_by(student_id=user.id).first()
    rating = PlatformRating.query.get(user.id)

    activity = get_platform_user_activity(user.id, days=90)
    return jsonify({
        'xp': xp.to_dict() if xp else None,
        'rating': {
            'rating': rating.rating, 'global_rank': rating.global_rank,
            'easy_solved': rating.easy_solved, 'medium_solved': rating.medium_solved,
            'hard_solved': rating.hard_solved,
        } if rating else None,
        'topic_strength': get_practice_topic_mastery(user.id),
        'courses': get_user_course_analytics(user.id),
        'activity_summary': activity.get('summary'),
        'heatmap': activity.get('heatmap'),
    }), 200


@admin_users_bp.route('/users/<user_id>/grades', methods=['GET'])
@require_role('platform_admin')
def user_grades(user_id):
    """Grades, exam attempts and earned certificates."""
    user, err = _user_or_404(user_id)
    if err:
        return err

    from app.models.grading import Grade
    from app.models.exam import ExamAttempt, Exam
    from app.models.experiment import Experiment
    from app.platform_user_analytics.course_stats import get_user_course_analytics

    grades = []
    for gr in (Grade.query.filter_by(student_id=user.id)
               .order_by(Grade.graded_at.desc().nullslast()).limit(100).all()):
        item = gr.to_dict() if hasattr(gr, 'to_dict') else {}
        if gr.experiment_id:
            exp = Experiment.query.get(gr.experiment_id)
            item['source_title'] = exp.title if exp else None
            item['source_kind'] = 'experiment'
        elif gr.exam_id:
            ex = Exam.query.get(gr.exam_id)
            item['source_title'] = ex.title if ex else None
            item['source_kind'] = 'exam'
        grades.append(item)

    attempts = [a.to_dict() for a in
                ExamAttempt.query.filter_by(student_id=user.id)
                .order_by(ExamAttempt.started_at.desc()).limit(50).all()]

    certs = get_user_course_analytics(user.id).get('certificates', [])
    return jsonify({'grades': grades, 'exam_attempts': attempts, 'certificates': certs}), 200


@admin_users_bp.route('/users/<user_id>/attempts', methods=['GET'])
@require_role('platform_admin')
def user_attempts(user_id):
    """Recent code attempts (labs) and practice submissions."""
    user, err = _user_or_404(user_id)
    if err:
        return err

    from app.models.submission import CodeAttempt
    from app.models.experiment import Experiment
    from app.models.practice import PracticeSubmission, Problem

    page = max(1, int(request.args.get('page', 1)))
    per_page = min(int(request.args.get('per_page', 25)), 100)

    lab_q = CodeAttempt.query.filter_by(student_id=user.id) \
        .order_by(CodeAttempt.submitted_at.desc().nullslast())
    lab_total = lab_q.count()
    lab_rows = lab_q.paginate(page=page, per_page=per_page, error_out=False).items
    exp_map = {e.id: e.title for e in Experiment.query.filter(
        Experiment.id.in_([a.experiment_id for a in lab_rows if a.experiment_id])).all()} \
        if lab_rows else {}

    prac_q = PracticeSubmission.query.filter_by(student_id=user.id, is_run=False) \
        .order_by(PracticeSubmission.submitted_at.desc())
    prac_total = prac_q.count()
    prac_rows = prac_q.paginate(page=page, per_page=per_page, error_out=False).items
    prob_map = {p.id: p.title for p in Problem.query.filter(
        Problem.id.in_([s.problem_id for s in prac_rows])).all()} if prac_rows else {}

    def _iso(dt):
        return dt.isoformat() + 'Z' if dt else None

    return jsonify({
        'page': page, 'per_page': per_page,
        'lab_attempts': {
            'total': lab_total,
            'items': [{
                'id': a.id,
                'experiment_id': a.experiment_id,
                'experiment_title': exp_map.get(a.experiment_id),
                'compile_status': getattr(a, 'compile_status', None),
                'execution_time_ms': getattr(a, 'execution_time_ms', None),
                'attempt_number': getattr(a, 'attempt_number', None),
                'created_at': _iso(getattr(a, 'created_at', None)),
            } for a in lab_rows],
        },
        'practice_submissions': {
            'total': prac_total,
            'items': [{
                'id': s.id,
                'problem_id': s.problem_id,
                'problem_title': prob_map.get(s.problem_id),
                'language': s.language,
                'status': s.status,
                'passed': s.passed, 'total_cases': s.total,
                'xp_earned': s.xp_earned,
                'submitted_at': _iso(s.submitted_at),
            } for s in prac_rows],
        },
    }), 200


@admin_users_bp.route('/users/<user_id>/activity', methods=['GET'])
@require_role('platform_admin')
def user_activity(user_id):
    """Audit events BY this user and administrative events ABOUT this user."""
    user, err = _user_or_404(user_id)
    if err:
        return err

    by_user = AuditLog.query.filter_by(actor_id=user.id) \
        .order_by(AuditLog.created_at.desc()).limit(50).all()
    about_user = AuditLog.query.filter(
        AuditLog.target_id == user.id, AuditLog.target_type == 'user') \
        .order_by(AuditLog.created_at.desc()).limit(50).all()
    return jsonify({
        'by_user': [l.to_dict() for l in by_user],
        'about_user': [l.to_dict() for l in about_user],
    }), 200


# ── actions ────────────────────────────────────────────────────────────────

@admin_users_bp.route('/users/<user_id>', methods=['PATCH'])
@require_role('platform_admin')
def update_user(user_id):
    """Editable in P1: full_name only (role/institution moves need the
    two-admin rule and arrive with governance hardening)."""
    user, err = _user_or_404(user_id)
    if err:
        return err
    data = request.get_json() or {}
    new_name = (data.get('full_name') or '').strip()
    if not new_name:
        return jsonify({'error': 'full_name is required.'}), 400
    old = user.full_name
    user.full_name = new_name
    _audit('admin.user.update', user,
           f'Platform admin updated name: {old!r} -> {new_name!r}', severity='low')
    db.session.commit()
    return jsonify({'user': _dir_row(user)}), 200


@admin_users_bp.route('/users/<user_id>/suspend', methods=['POST'])
@require_role('platform_admin')
def suspend_user(user_id):
    """Suspend a user: blocks login and kills live tokens immediately.
    A reason is mandatory; an optional `until` timestamp makes it a temp ban.
    Self-suspension and suspending other platform admins are rejected."""
    user, err = _user_or_404(user_id)
    if err:
        return err
    if user.id == g.user_id:
        return jsonify({'error': 'You cannot suspend your own account.'}), 400
    if user.role == 'platform_admin':
        return jsonify({'error': 'Platform admin accounts cannot be suspended '
                                 'from this endpoint (two-admin rule).'}), 403

    data = request.get_json() or {}
    reason = (data.get('reason') or '').strip()
    if not reason:
        return jsonify({'error': 'A suspension reason is required.'}), 400
    until_raw = (data.get('until') or '').strip() or None
    until = None
    if until_raw:
        try:
            until = datetime.fromisoformat(until_raw.replace('Z', ''))
        except ValueError:
            return jsonify({'error': 'Invalid `until` (ISO-8601 expected).'}), 400

    user.status = 'suspended'
    user.suspension_reason = reason
    user.suspended_until = until
    user.force_logout_at = datetime.utcnow()      # revoke live JWTs now

    from app.auth.utils import invalidate_force_logout_cache
    invalidate_force_logout_cache(user.id)

    _audit('admin.user.suspend', user,
           f'Suspended {user.email}: {reason}'
           + (f' (until {until.isoformat()}Z)' if until else ''),
           severity='high')
    db.session.commit()
    return jsonify({'user': _dir_row(user), 'suspended': True}), 200


@admin_users_bp.route('/users/<user_id>/activate', methods=['POST'])
@require_role('platform_admin')
def activate_user(user_id):
    """Lift a suspension."""
    user, err = _user_or_404(user_id)
    if err:
        return err
    if (user.status or 'active') == 'active':
        return jsonify({'user': _dir_row(user), 'activated': False}), 200

    user.status = 'active'
    user.suspension_reason = None
    user.suspended_until = None
    _audit('admin.user.activate', user, f'Reactivated {user.email}', severity='medium')
    db.session.commit()
    return jsonify({'user': _dir_row(user), 'activated': True}), 200


@admin_users_bp.route('/users/<user_id>/reset-password', methods=['POST'])
@require_role('platform_admin')
def reset_user_password(user_id):
    """Issue a temp password: old credentials + tokens are revoked, the user
    must change the password at next login. The temp password is shown ONCE."""
    user, err = _user_or_404(user_id)
    if err:
        return err
    if user.role == 'platform_admin':
        return jsonify({'error': 'Platform admin passwords cannot be reset '
                                 'from this endpoint (two-admin rule).'}), 403

    alphabet = string.ascii_letters + string.digits
    temp = ''.join(secrets.choice(alphabet) for _ in range(12)) + '!9'
    import bcrypt
    user.password_hash = bcrypt.hashpw(temp.encode(), bcrypt.gensalt()).decode()
    user.must_change_password = True
    user.force_logout_at = datetime.utcnow()

    from app.auth.utils import invalidate_force_logout_cache
    invalidate_force_logout_cache(user.id)

    _audit('admin.user.reset_password', user,
           f'Password reset issued for {user.email} (temp credentials delivered '
           'by the admin; forced change on next login)', severity='high')
    db.session.commit()
    return jsonify({'temp_password': temp, 'must_change_password': True}), 200


@admin_users_bp.route('/users/<user_id>/force-logout', methods=['POST'])
@require_role('platform_admin')
def force_logout_user(user_id):
    """Invalidate every live session for this user right now."""
    user, err = _user_or_404(user_id)
    if err:
        return err
    if user.id == g.user_id:
        return jsonify({'error': 'Use Sign Out to end your own session.'}), 400

    user.force_logout_at = datetime.utcnow()
    from app.auth.utils import invalidate_force_logout_cache
    invalidate_force_logout_cache(user.id)

    _audit('admin.user.force_logout', user,
           f'Force-logged-out all sessions for {user.email}', severity='medium')
    db.session.commit()
    return jsonify({'forced': True}), 200
