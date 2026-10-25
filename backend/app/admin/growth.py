"""
app/admin/growth.py — Platform Admin: growth analytics + exports (Phase 3).

  Funnel      signup → activated (ran code within 7d) → first solve (14d)
              → retained (still active days 7–30 after signup)
  Cohorts     weekly signup cohorts × week-N activity matrix (8 weeks)
  Direct users  the platform-user cohort: growth, DAU, XP distribution, tops
  Exports     CSV streams (users, activity) — audited
"""
import csv
import io
from datetime import datetime, timedelta

from flask import Blueprint, Response, jsonify, request, g

from app.auth.utils import require_role
from app.extensions import db
from app.models.academic import AuditLog
from app.models.user import User
from app.models.practice import PracticeSubmission, StudentXP
from app.models.platform_content import PlatformProgress

admin_growth_bp = Blueprint('admin_growth', __name__)


def _activity_dates(user_id, since=None):
    """Distinct dates this user did anything gradable (practice + courses)."""
    q1 = db.session.query(PracticeSubmission.submitted_at).filter(
        PracticeSubmission.student_id == user_id,
        PracticeSubmission.is_run == False)  # noqa: E712
    q2 = db.session.query(PlatformProgress.created_at).filter_by(user_id=user_id)
    if since:
        q1 = q1.filter(PracticeSubmission.submitted_at >= since)
        q2 = q2.filter(PlatformProgress.created_at >= since)
    dates = {r[0].date() for r in q1.all() if r[0]}
    dates |= {r[0].date() for r in q2.all() if r[0]}
    return dates


def _solved_ever(user_id):
    return (PracticeSubmission.query.filter_by(
        student_id=user_id, status='Accepted', is_run=False).first() is not None
        or PlatformProgress.query.filter_by(user_id=user_id, status='solved').first() is not None)


# ── funnel ─────────────────────────────────────────────────────────────────

@admin_growth_bp.route('/analytics/funnel', methods=['GET'])
@require_role('platform_admin')
def funnel():
    """?days=30 — users who SIGNED UP in the window, tracked through the
    activation funnel. Stage definitions:
      activated : first code submission within 7 days of signup
      first_solve: first Accepted solve within 14 days of signup
      retained  : any activity between day 7 and day 30 after signup
    """
    days = min(max(int(request.args.get('days', 30)), 7), 180)
    since = datetime.utcnow() - timedelta(days=days)
    users = User.query.filter(User.created_at >= since).all()
    n = len(users)
    activated = first_solve = retained = 0
    for u in users:
        created = u.created_at or since
        acts = _activity_dates(u.id)
        if not acts:
            continue
        first = min(acts)
        if (first - created.date()).days <= 7:
            activated += 1
        if (first - created.date()).days <= 14 and _solved_ever(u.id):
            first_solve += 1
        if any(7 <= (d - created.date()).days <= 30 for d in acts):
            retained += 1

    def pct(x):
        return round(x * 100 / n, 1) if n else 0.0

    return jsonify({
        'window_days': days,
        'stages': [
            {'key': 'signup',         'label': 'Signed up',          'count': n,        'pct': 100.0},
            {'key': 'activated',      'label': 'Ran code (≤7d)',     'count': activated, 'pct': pct(activated)},
            {'key': 'first_solve',    'label': 'Solved (≤14d)',      'count': first_solve, 'pct': pct(first_solve)},
            {'key': 'retained',       'label': 'Active days 7–30',   'count': retained,  'pct': pct(retained)},
        ],
    }), 200


# ── cohorts ────────────────────────────────────────────────────────────────

@admin_growth_bp.route('/analytics/cohorts', methods=['GET'])
@require_role('platform_admin')
def cohorts():
    """Weekly signup cohorts for the last N weeks; cell = % of the cohort
    active in week W after signup (week 0 = signup week)."""
    weeks = min(max(int(request.args.get('weeks', 8)), 4), 16)
    today = datetime.utcnow().date()
    monday0 = today - timedelta(days=today.weekday())        # this week's Monday

    out = []
    for w in range(weeks):
        wk_start = monday0 - timedelta(weeks=weeks - 1 - w)
        wk_end = wk_start + timedelta(days=7)
        cohort_users = User.query.filter(
            User.created_at >= datetime.combine(wk_start, datetime.min.time()),
            User.created_at < datetime.combine(wk_end, datetime.min.time()),
        ).all()
        size = len(cohort_users)
        row = {'cohort': wk_start.isoformat(), 'size': size, 'cells': []}
        for wk_after in range(weeks - w):
            target_start = wk_start + timedelta(weeks=wk_after)
            target_end = target_start + timedelta(days=7)
            active = 0
            for u in cohort_users:
                acts = _activity_dates(u.id)
                if any(target_start <= d < target_end for d in acts):
                    active += 1
            row['cells'].append({
                'week': wk_after,
                'count': active,
                'pct': round(active * 100 / size, 1) if size else None,
            })
        out.append(row)
    return jsonify({'weeks': weeks, 'cohorts': out}), 200


# ── direct (platform) users cohort ─────────────────────────────────────────

@admin_growth_bp.route('/analytics/platform-users', methods=['GET'])
@require_role('platform_admin')
def platform_users_cohort():
    """The direct-user cohort: totals, growth, DAU trend, XP distribution."""
    days = min(max(int(request.args.get('days', 30)), 7), 90)
    since = datetime.utcnow() - timedelta(days=days)

    total = User.query.filter_by(role='platform_user').count()
    active_total = User.query.filter_by(role='platform_user', is_active=True).count()
    signups = User.query.filter(
        User.role == 'platform_user', User.created_at >= since).count()

    # growth series (cumulative) — one count per day
    growth = []
    for i in range(days):
        d = since.date() + timedelta(days=i)
        nxt = d + timedelta(days=1)
        growth.append({'date': d.isoformat(), 'count': User.query.filter(
            User.role == 'platform_user',
            User.created_at < datetime.combine(nxt, datetime.min.time())).count()})

    # DAU: platform users with gradable activity that day
    dau = []
    ids = [r[0] for r in db.session.query(User.id).filter_by(role='platform_user').all()]
    for i in range(days):
        d = since.date() + timedelta(days=i)
        start = datetime.combine(d, datetime.min.time())
        end = start + timedelta(days=1)
        n = (PracticeSubmission.query.filter(
                PracticeSubmission.student_id.in_(ids),
                PracticeSubmission.submitted_at >= start,
                PracticeSubmission.submitted_at < end)
             .distinct(PracticeSubmission.student_id).count()
             if ids else 0)
        dau.append({'date': d.isoformat(), 'count': n})

    # XP distribution buckets
    xp_rows = [r[0] or 0 for r in db.session.query(StudentXP.total_xp)
               .filter(StudentXP.student_id.in_(ids)).all()] if ids else []
    buckets = {'0': 0, '1-99': 0, '100-299': 0, '300-699': 0, '700+': 0}
    for x in xp_rows:
        if x <= 0:
            buckets['0'] += 1
        elif x < 100:
            buckets['1-99'] += 1
        elif x < 300:
            buckets['100-299'] += 1
        elif x < 700:
            buckets['300-699'] += 1
        else:
            buckets['700+'] += 1

    top = [{'id': r[0], 'name': r[1], 'xp': r[2] or 0} for r in
           (db.session.query(User.id, User.full_name, StudentXP.total_xp)
            .join(StudentXP, StudentXP.student_id == User.id)
            .filter(User.role == 'platform_user')
            .order_by(StudentXP.total_xp.desc()).limit(10).all())]

    return jsonify({
        'total': total, 'active': active_total,
        'signups_in_window': signups,
        'growth': growth, 'dau': dau,
        'xp_distribution': buckets,
        'top_learners': top,
    }), 200


# ── CSV exports ────────────────────────────────────────────────────────────

@admin_growth_bp.route('/analytics/export', methods=['GET'])
@require_role('platform_admin')
def export_csv():
    """?report=users|activity — audited CSV stream."""
    report = request.args.get('report', 'users')

    def _csv(headers, rows):
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(headers)
        w.writerows(rows)
        db.session.add(AuditLog(
            institution_id=None, actor_id=g.user_id,
            action='admin.analytics.export', target_type='system', target_id=report,
            detail=f'CSV export: {report} ({len(rows)} rows)',
            module='Platform Analytics', severity='medium'))
        db.session.commit()
        return Response(
            buf.getvalue(), mimetype='text/csv',
            headers={'Content-Disposition': f'attachment; filename=nexlab_{report}_{datetime.utcnow().strftime("%Y%m%d")}.csv"'})

    if report == 'users':
        rows = [[u.id, u.full_name, u.email, u.role,
                 u.institution_id or 'direct', (u.status or 'active'),
                 u.created_at.isoformat() if u.created_at else '',
                 u.last_login.isoformat() if u.last_login else '']
                for u in User.query.order_by(User.created_at.desc()).all()]
        return _csv(['id', 'full_name', 'email', 'role', 'institution',
                     'status', 'created_at', 'last_login'], rows)

    if report == 'activity':
        rows = [[s.id, s.student_id, s.problem_id, s.language, s.status,
                 s.passed, s.total, s.xp_earned or 0,
                 s.submitted_at.isoformat() if s.submitted_at else '']
                for s in PracticeSubmission.query.filter_by(is_run=False)
                .order_by(PracticeSubmission.submitted_at.desc()).limit(5000).all()]
        return _csv(['id', 'student_id', 'problem_id', 'language', 'status',
                     'passed', 'total_cases', 'xp_earned', 'submitted_at'], rows)

    return jsonify({'error': 'Unknown report. Use users or activity.'}), 400
