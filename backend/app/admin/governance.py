"""
app/admin/governance.py — Platform Admin: governance hardening (Phase 4).

  Impersonation  POST /admin/users/:id/impersonate → 30-minute read-only
                 "view as user" JWT (imp claim); /admin/impersonation/end
                 closes it. Every write path that matters rejects imp
                 tokens via auth.utils.reject_if_impersonating.
  Data exports   POST /admin/users/:id/export → GDPR JSON bundle job with
                 7-day expiry; GET /admin/exports(/:id) list/download.
  Jobs monitor   GET /admin/jobs — APScheduler registry + snapshot freshness.
  Audit export   GET /admin/governance/audit-logs/export — CSV stream.
"""
import csv
import io
import json
import os
from datetime import datetime, timedelta

from flask import Blueprint, Response, jsonify, request, g, send_file

from app.auth.utils import require_role, build_jwt_claims
from app.extensions import db
from app.models.academic import AuditLog
from app.models.governance import ImpersonationSession, DataExportJob
from app.models.user import User

admin_governance_bp = Blueprint('admin_governance', __name__)

IMPERSONATION_MINUTES = 30
EXPORT_EXPIRY_DAYS = 7


def _export_directory():
    return os.path.realpath(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'exports'))


def _remove_export_file(path):
    """Delete only files inside the dedicated export directory."""
    if not path:
        return False
    root = _export_directory()
    candidate = os.path.realpath(path)
    try:
        inside_root = os.path.commonpath((root, candidate)) == root
    except ValueError:
        inside_root = False
    if not inside_root:
        raise ValueError('Export path is outside the dedicated export directory.')
    if os.path.isfile(candidate):
        os.remove(candidate)
        return True
    return False


def cleanup_expired_exports(now=None):
    """Enforce the stated TTL and remove sensitive export files from disk."""
    now = now or datetime.utcnow()
    expired = DataExportJob.query.filter(
        DataExportJob.status == 'ready', DataExportJob.expires_at <= now).all()
    changed = 0
    for job in expired:
        try:
            _remove_export_file(job.file_path)
        except (OSError, ValueError):
            from flask import current_app
            current_app.logger.exception('Could not safely remove expired export %s', job.id)
            continue
        job.file_path = None
        job.status = 'expired'
        changed += 1
    if changed:
        db.session.commit()
    return changed


def _audit(action, detail, target_type, target_id, severity='medium'):
    db.session.add(AuditLog(
        institution_id=None, actor_id=g.user_id, action=action,
        target_type=target_type, target_id=target_id, detail=detail,
        module='Platform Governance', severity=severity,
        ip_address=request.headers.get('X-Forwarded-For', request.remote_addr or ''),
    ))


# ══ Impersonation ══════════════════════════════════════════════════════════

@admin_governance_bp.route('/users/<user_id>/impersonate', methods=['POST'])
@require_role('platform_admin')
def impersonate(user_id):
    """Mint a short-lived read-only 'view as user' token. A reason is
    mandatory, platform-admin targets are blocked, and only one active
    impersonation per admin is allowed at a time."""
    from flask_jwt_extended import create_access_token
    target = User.query.get(user_id)
    if not target:
        return jsonify({'error': 'User not found.'}), 404
    if target.role == 'platform_admin':
        return jsonify({'error': 'Platform admin accounts cannot be impersonated.'}), 403

    reason = ((request.get_json() or {}).get('reason') or '').strip()
    if not reason:
        return jsonify({'error': 'An impersonation reason is required.'}), 400

    active = ImpersonationSession.query.filter_by(
        admin_id=g.user_id, ended_at=None, revoked=False).first()
    if active:
        return jsonify({'error': 'End your current impersonation session first.'}), 409

    sess = ImpersonationSession(admin_id=g.user_id, target_id=target.id, reason=reason)
    db.session.add(sess)
    db.session.flush()

    claims = build_jwt_claims(target)
    claims['imp'] = {'by': g.user_id, 'sid': sess.id}
    token = create_access_token(
        identity=target.id, additional_claims=claims,
        expires_delta=timedelta(minutes=IMPERSONATION_MINUTES))

    _audit('admin.user.impersonate',
           f'Impersonating {target.email} — {reason} (session {sess.id[:8]}, '
           f'{IMPERSONATION_MINUTES} min, read-only)', 'user', target.id, severity='high')
    db.session.commit()
    return jsonify({
        'token': token,
        'session_id': sess.id,
        'expires_in_minutes': IMPERSONATION_MINUTES,
        'read_only': True,
    }), 201


@admin_governance_bp.route('/impersonation/end', methods=['POST'])
@require_role('student', 'platform_user', 'instructor', 'institution_admin', 'platform_admin')
def end_impersonation():
    """Close the impersonation session. Callable with EITHER the impersonation
    token itself (role claim = target) or the admin's own token."""
    from flask_jwt_extended import get_jwt
    claims = get_jwt()
    imp = claims.get('imp')
    if imp:
        sess = ImpersonationSession.query.get(imp.get('sid'))
        if not sess or sess.ended_at or sess.revoked:
            return jsonify({'ended': True, 'already': True}), 200
        sess.ended_at = datetime.utcnow()
        _audit('admin.user.impersonate_end',
               f'Impersonation session {sess.id[:8]} ended by the banner',
               'user', sess.target_id, severity='low')
        db.session.commit()
        return jsonify({'ended': True}), 200

    # admin path: end by session_id
    if claims.get('role') != 'platform_admin':
        return jsonify({'error': 'Insufficient permissions'}), 403
    sid = (request.get_json() or {}).get('session_id')
    sess = ImpersonationSession.query.get(sid) if sid else ImpersonationSession.query.filter_by(
        admin_id=g.user_id, ended_at=None, revoked=False).first()
    if not sess:
        return jsonify({'error': 'No active impersonation session.'}), 404
    sess.ended_at = datetime.utcnow()
    _audit('admin.user.impersonate_end',
           f'Impersonation session {sess.id[:8]} ended by admin', 'user', sess.target_id,
           severity='low')
    db.session.commit()
    return jsonify({'ended': True}), 200


@admin_governance_bp.route('/impersonation/history', methods=['GET'])
@require_role('platform_admin')
def impersonation_history():
    rows = (ImpersonationSession.query
            .order_by(ImpersonationSession.started_at.desc()).limit(50).all())
    admin_ids = {r.admin_id for r in rows} | {r.target_id for r in rows}
    names = {u.id: (u.full_name, u.email) for u in
             User.query.filter(User.id.in_(admin_ids)).all()} if admin_ids else {}
    return jsonify({'sessions': [{
        **r.to_dict(),
        'admin_name': names.get(r.admin_id, (None, None))[0],
        'target_name': names.get(r.target_id, (None, None))[0],
        'target_email': names.get(r.target_id, (None, None))[1],
    } for r in rows]}), 200


# ══ Data export jobs (GDPR / portability) ══════════════════════════════════

def _build_export_bundle(user):
    from app.models.platform_content import PlatformProgress, PlatformExercise, PlatformCourse
    from app.models.practice import PracticeSubmission, StudentXP
    from app.models.grading import Grade
    from app.models.exam import ExamAttempt
    from app.models.submission import CodeAttempt
    from sqlalchemy import or_

    bundle = {
        'generated_at': datetime.utcnow().isoformat() + 'Z',
        'kind': 'gdpr_portability_bundle',
        'profile': user.to_dict(include_sensitive=True) if hasattr(user.to_dict, '__call__') else user.to_dict(),
        'platform_progress': [p.to_dict() for p in
                              PlatformProgress.query.filter_by(user_id=user.id).all()],
        'practice_submissions': [s.to_dict() for s in
                                 PracticeSubmission.query.filter_by(student_id=user.id).all()],
        'code_attempts': [a.to_dict() for a in
                          CodeAttempt.query.filter_by(student_id=user.id).all()],
        'grades': [gr.to_dict() for gr in Grade.query.filter_by(student_id=user.id).all()],
        'exam_attempts': [ea.to_dict() for ea in
                          ExamAttempt.query.filter_by(student_id=user.id).all()],
        'xp': (StudentXP.query.filter_by(student_id=user.id).first() or None).to_dict()
              if StudentXP.query.filter_by(student_id=user.id).first() else None,
        'audit_about_user': [l.to_dict() for l in
                             AuditLog.query.filter(
                                 AuditLog.target_id == user.id,
                                 AuditLog.target_type == 'user').limit(200).all()],
    }
    return bundle


@admin_governance_bp.route('/users/<user_id>/export', methods=['POST'])
@require_role('platform_admin')
def create_export(user_id):
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found.'}), 404
    kind = (request.get_json() or {}).get('kind', 'gdpr')
    if kind != 'gdpr':
        return jsonify({'error': "kind must be 'gdpr'."}), 400

    job = DataExportJob(
        user_id=user.id, requested_by=g.user_id, kind=kind,
        status='pending',
        expires_at=datetime.utcnow() + timedelta(days=EXPORT_EXPIRY_DAYS))
    db.session.add(job)
    db.session.flush()

    try:
        bundle = _build_export_bundle(user)
        out_dir = _export_directory()
        os.makedirs(out_dir, mode=0o700, exist_ok=True)
        try:
            os.chmod(out_dir, 0o700)
        except OSError:
            pass
        path = os.path.join(out_dir, f'{kind}_{user.id[:8]}_{job.id[:8]}.json')
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(bundle, f, indent=2, default=str)
        job.file_path = path
        job.status = 'ready'
        _audit('admin.user.export', f'GDPR export generated for {user.email}',
               'user', user.id, severity='medium')
    except Exception as exc:
        job.status = 'failed'
        _audit('admin.user.export', f'GDPR export FAILED for {user.email}: {exc}',
               'user', user.id, severity='high')
    db.session.commit()
    return jsonify({'job': job.to_dict()}), 201


@admin_governance_bp.route('/exports', methods=['GET'])
@require_role('platform_admin')
def list_exports():
    cleanup_expired_exports()
    rows = DataExportJob.query.order_by(DataExportJob.created_at.desc()).limit(50).all()
    return jsonify({'jobs': [j.to_dict() for j in rows]}), 200


@admin_governance_bp.route('/exports/<job_id>', methods=['GET'])
@require_role('platform_admin')
def download_export(job_id):
    job = DataExportJob.query.get(job_id)
    if not job:
        return jsonify({'error': 'Export job not found.'}), 404
    if job.expires_at and job.expires_at <= datetime.utcnow():
        cleanup_expired_exports()
        return jsonify({'error': 'Export expired.'}), 410
    if job.status != 'ready' or not job.file_path:
        return jsonify({'error': 'Export unavailable or expired.'}), 410
    path = os.path.realpath(job.file_path)
    try:
        if os.path.commonpath((_export_directory(), path)) != _export_directory():
            return jsonify({'error': 'Export unavailable.'}), 410
    except ValueError:
        return jsonify({'error': 'Export unavailable.'}), 410
    if not os.path.isfile(path):
        return jsonify({'error': 'Export unavailable or expired.'}), 410
    return send_file(path, as_attachment=True,
                     download_name=os.path.basename(path),
                     mimetype='application/json')


# ══ Jobs monitor ════════════════════════════════════════════════════════════

@admin_governance_bp.route('/jobs', methods=['GET'])
@require_role('platform_admin')
def jobs_monitor():
    from app.jobs import scheduler
    from sqlalchemy import text
    jobs = []
    try:
        for j in scheduler.get_jobs():
            jobs.append({
                'id': j.id,
                'trigger': str(j.trigger),
                'next_run': j.next_run_time.isoformat() + 'Z' if getattr(j, 'next_run_time', None) else None,
            })
    except Exception:
        pass
    snap = db.session.execute(text("""
        SELECT metric, MAX(day) AS last_day, MAX(computed_at) AS last_computed
        FROM platform_metrics_daily GROUP BY metric ORDER BY metric
    """)).fetchall()
    return jsonify({
        'scheduler_running': bool(scheduler.running),
        'jobs': jobs,
        'metric_snapshots': [{
            'metric': r[0],
            'last_day': r[1].isoformat() if r[1] else None,
            'last_computed': r[2].isoformat() + 'Z' if r[2] else None,
        } for r in snap],
    }), 200


# ══ Audit CSV export ═══════════════════════════════════════════════════════

@admin_governance_bp.route('/governance/audit-logs/export', methods=['GET'])
@require_role('platform_admin')
def audit_csv():
    days = min(max(int(request.args.get('days', 30)), 1), 365)
    since = datetime.utcnow() - timedelta(days=days)
    q = AuditLog.query.filter(AuditLog.created_at >= since)
    if request.args.get('institution_id'):
        q = q.filter_by(institution_id=request.args['institution_id'])
    logs = q.order_by(AuditLog.created_at.desc()).limit(20000).all()

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(['id', 'created_at', 'actor', 'action', 'severity', 'module',
                'institution_id', 'target_type', 'target_id', 'detail', 'ip'])
    for l in logs:
        w.writerow([l.id,
                    l.created_at.isoformat() if l.created_at else '',
                    l.actor.full_name if l.actor else l.actor_id,
                    l.action, l.severity, l.module or '',
                    l.institution_id or 'platform', l.target_type or '', l.target_id or '',
                    (l.detail or '').replace('\n', ' '),
                    l.ip_address or ''])
    _audit('admin.audit.export', f'Audit CSV export: {len(logs)} rows ({days}d)',
           'system', 'audit_logs', severity='medium')
    db.session.commit()
    return Response(
        buf.getvalue(), mimetype='text/csv',
        headers={'Content-Disposition':
                 f'attachment; filename=nexlab_audit_{datetime.utcnow().strftime("%Y%m%d")}.csv'})
