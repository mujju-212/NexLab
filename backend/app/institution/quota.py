"""
Plan quota helpers for institution admins.

The per-plan student caps live in PlatformConfig (max_students_free / _pro /
_enterprise) so a platform admin can change them without a deploy. Everything
that admits students — direct creation and CSV bulk upload — checks here first,
otherwise the plan stored on the institution is decorative.
"""
from app.models.user import User
from app.models.institution import Institution, PlatformConfig

# plan -> PlatformConfig key holding its student cap
_PLAN_LIMIT_KEYS = {
    'free':       'max_students_free',
    'starter':    'max_students_free',
    'pro':        'max_students_pro',
    'enterprise': 'max_students_enterprise',
}


def student_quota(institution_id: str) -> dict:
    """
    Current student headcount against the institution's plan cap.

    Returns {plan, used, limit, remaining, percent_used, is_full}.
    `limit` is None when the plan is unknown, which is treated as uncapped
    rather than as zero — never lock an admin out because of a bad plan string.
    """
    inst = Institution.query.get(institution_id)
    plan = (inst.plan if inst and inst.plan else 'free').lower()

    used = User.query.filter_by(
        institution_id=institution_id, role='student'
    ).count()

    limit = None
    key = _PLAN_LIMIT_KEYS.get(plan)
    if key:
        try:
            limit = int(PlatformConfig.get(key))
        except (TypeError, ValueError):
            limit = None

    remaining = max(limit - used, 0) if limit is not None else None
    return {
        'plan':         plan,
        'used':         used,
        'limit':        limit,
        'remaining':    remaining,
        'percent_used': round(used / limit * 100, 1) if limit else None,
        'is_full':      limit is not None and used >= limit,
    }


def student_headroom(institution_id: str, adding: int = 1):
    """
    Check whether `adding` more students still fits the plan.

    Returns None when it fits, otherwise a ready-to-return error dict so the
    caller stays a one-liner.
    """
    q = student_quota(institution_id)
    if q['limit'] is None or q['used'] + adding <= q['limit']:
        return None
    return {
        'error': (f"Student limit reached for the {q['plan']} plan "
                  f"({q['used']}/{q['limit']}). Upgrade the plan or deactivate "
                  f"existing students to add more."),
        'quota': q,
    }
