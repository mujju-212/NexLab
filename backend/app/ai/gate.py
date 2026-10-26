"""
AI governance gate — the single choke-point for every AI call.

Every route that wants to call an AI model must go through guarded_ai_call()
instead of calling groq_chat / groq_single directly.  This enforces:

  1. Institution-level and per-role AI policy (on/off / per-feature toggle)
  2. Platform-level global toggle (PlatformConfig.ai_hints_enabled)
  3. Daily token quota (institution-level, hard-stop or warn-only)
  4. Per-student daily token cap (fairness)
  5. Usage logging to AIUsageLog (fail-open — logging failure never blocks the response)

Usage:
    from app.ai.gate import guarded_ai_call, AIDisabled, AIQuotaExceeded

    text, model, is_fallback, usage = guarded_ai_call(
        feature='hint',
        institution_id=g.institution_id,
        user_id=g.user_id,
        role=g.role,
        messages=[...],           # passed through to groq_chat
        pool='fast',
        max_tokens=120,
        temperature=0.3,
        section_subject_id=ss_id, # optional — for per-subject cost tracking
    )
"""
import time
import logging
from datetime import datetime, date
from flask import current_app
from sqlalchemy import func

log = logging.getLogger(__name__)


class AIDisabled(Exception):
    """Policy check failed: AI is disabled for this institution / role / feature."""
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class AIQuotaExceeded(Exception):
    """Quota check failed: institution or student has hit their daily token limit."""
    def __init__(self, reason: str, quota: int, used: int):
        super().__init__(reason)
        self.reason = reason
        self.quota = quota
        self.used = used


# ── platform-default daily quota (requests, for legacy _check_quota compat) ─
# Gate uses token counts; this value is only a fallback if platform config missing.
_DEFAULT_PLATFORM_DAILY_TOKENS = 2_000_000   # 2M tokens / institution / day


def _platform_daily_tokens() -> int:
    """Read groq_daily_limit from PlatformConfig, convert to a token count.

    Legacy: PlatformConfig stores a *request* count ('200').  We treat it as
    requests and multiply by 2000 tokens/request as a rough cap so there is no
    hard behaviour change for institutions that have never set a token quota.
    """
    try:
        from app.models.institution import PlatformConfig
        raw = PlatformConfig.get('groq_daily_limit')
        if raw:
            count = int(raw)
            return count * 2_000   # 200 requests * 2 000 tokens/req = 400 000 tokens
    except Exception:
        pass
    return _DEFAULT_PLATFORM_DAILY_TOKENS


def _tokens_used_today(institution_id: str) -> int:
    """Sum total_tokens from AIUsageLog for this institution today (UTC day)."""
    from app.models.ai_usage import AIUsageLog
    from app.extensions import db
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        row = (db.session.query(func.coalesce(func.sum(AIUsageLog.total_tokens), 0))
               .filter(
                   AIUsageLog.institution_id == institution_id,
                   AIUsageLog.created_at >= today_start,
                   AIUsageLog.success == True,
               )
               .scalar())
        return int(row or 0)
    except Exception:
        return 0   # fail-open: don't block on DB error


def _tokens_used_this_month(institution_id: str) -> int:
    """Sum total_tokens from AIUsageLog for this institution this calendar month (UTC)."""
    from app.models.ai_usage import AIUsageLog
    from app.extensions import db
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    try:
        row = (db.session.query(func.coalesce(func.sum(AIUsageLog.total_tokens), 0))
               .filter(
                   AIUsageLog.institution_id == institution_id,
                   AIUsageLog.created_at >= month_start,
                   AIUsageLog.success == True,
               )
               .scalar())
        return int(row or 0)
    except Exception:
        return 0   # fail-open: don't block on DB error


def _student_tokens_today(institution_id: str, user_id: str) -> int:
    """Sum total_tokens from AIUsageLog for this student today (UTC day)."""
    from app.models.ai_usage import AIUsageLog
    from app.extensions import db
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    try:
        row = (db.session.query(func.coalesce(func.sum(AIUsageLog.total_tokens), 0))
               .filter(
                   AIUsageLog.institution_id == institution_id,
                   AIUsageLog.user_id == user_id,
                   AIUsageLog.created_at >= today_start,
                   AIUsageLog.success == True,
               )
               .scalar())
        return int(row or 0)
    except Exception:
        return 0


def _log_usage(institution_id, user_id, role, feature, model, provider,
               usage_dict, cost, latency_ms, success, section_subject_id):
    """Write one AIUsageLog row.  Wrapped in try/except — never raises."""
    try:
        from app.models.ai_usage import AIUsageLog, _estimate_cost
        from app.extensions import db

        prompt_tokens     = (usage_dict or {}).get('prompt_tokens', 0)
        completion_tokens = (usage_dict or {}).get('completion_tokens', 0)
        total_tokens      = (usage_dict or {}).get('total_tokens', 0)

        log_row = AIUsageLog(
            institution_id     = institution_id,
            user_id            = user_id,
            role               = role,
            feature            = feature,
            model              = model or 'unknown',
            provider           = provider,
            prompt_tokens      = prompt_tokens,
            completion_tokens  = completion_tokens,
            total_tokens       = total_tokens,
            estimated_cost_usd = cost or _estimate_cost(model or '', total_tokens),
            latency_ms         = latency_ms,
            success            = success,
            section_subject_id = section_subject_id,
        )
        db.session.add(log_row)
        db.session.commit()
    except Exception as exc:
        log.warning('[ai.gate] usage log write failed (non-fatal): %s', exc)
        try:
            from app.extensions import db
            db.session.rollback()
        except Exception:
            pass


def guarded_ai_call(
    feature: str,
    *,
    institution_id: str = None,
    user_id: str = None,
    role: str = 'student',
    messages: list,              # forwarded to groq_chat
    pool: str = 'fast',
    max_tokens: int = 200,
    temperature: float = 0.3,
    section_subject_id: str = None,
    json_mode: bool = False,
    reasoning_effort: str = None,
):
    """
    Policy check → quota check → call → log → return.

    Returns the same 4-tuple as groq_chat: (text, model, is_fallback, usage_dict).

    Raises:
      AIDisabled(reason)          → caller should 403
      AIQuotaExceeded(reason)     → caller should 429

    Args:
      institution_id: caller's institution; used for policy lookup + quota scoping.
      user_id:        caller's user id; used for per-student quota + usage log.
      role:           'student' | 'instructor' | 'institution_admin' — used for
                      role-level policy toggle.
    """
    user_role = role

    # ── 1. Platform global switch ─────────────────────────────────────────
    try:
        from app.models.institution import PlatformConfig
        if PlatformConfig.get('ai_enabled', 'true').lower() == 'false':
            raise AIDisabled('AI features are disabled platform-wide by the administrator.')
        if feature == 'hint' and PlatformConfig.get('ai_hints_enabled', 'true').lower() == 'false':
            raise AIDisabled('AI hints are disabled platform-wide by the administrator.')
    except AIDisabled:
        raise
    except Exception:
        pass   # PlatformConfig read failure → fail-open

    # ── 2. Institution policy switch ──────────────────────────────────────
    policy = None
    if institution_id:
        try:
            from app.models.ai_usage import AIPolicy
            policy = AIPolicy.get_or_create(institution_id, updated_by=user_id)
        except Exception as exc:
            log.warning('[ai.gate] policy fetch failed (fail-open): %s', exc)
            try:
                from app.extensions import db
                db.session.rollback()
            except Exception:
                pass

    if policy:
        if not policy.ai_enabled_global:
            raise AIDisabled('AI features are disabled for your institution.')
        if user_role == 'student' and not policy.ai_enabled_students:
            raise AIDisabled('AI features are currently disabled for students at your institution.')
        if user_role == 'instructor' and not policy.ai_enabled_instructors:
            raise AIDisabled('AI features are currently disabled for instructors at your institution.')
        flags = policy.feature_flags()
        if not flags.get(feature, True):
            raise AIDisabled(f'The {feature} AI feature is currently turned off for your institution.')

    # ── 3. Quota check ────────────────────────────────────────────────────
    if institution_id:
        used_today = _tokens_used_today(institution_id)

        # Determine effective institution quota
        inst_quota = None
        if policy and policy.daily_token_quota:
            inst_quota = policy.daily_token_quota
        else:
            inst_quota = _platform_daily_tokens()

        hard_stop = policy.hard_stop if policy else True

        if inst_quota and used_today >= inst_quota:
            if hard_stop:
                raise AIQuotaExceeded(
                    reason=f'Daily AI token quota ({inst_quota:,}) reached for this institution.',
                    quota=inst_quota,
                    used=used_today,
                )
            else:
                log.warning('[ai.gate] institution %s over daily quota (%d/%d) — warn-only',
                            institution_id, used_today, inst_quota)

        # Monthly institution quota (calendar month, UTC)
        if policy and policy.monthly_token_quota:
            used_month = _tokens_used_this_month(institution_id)
            if used_month >= policy.monthly_token_quota:
                if hard_stop:
                    raise AIQuotaExceeded(
                        reason=f'Monthly AI token quota ({policy.monthly_token_quota:,}) reached for this institution.',
                        quota=policy.monthly_token_quota,
                        used=used_month,
                    )
                else:
                    log.warning('[ai.gate] institution %s over monthly quota (%d/%d) — warn-only',
                                institution_id, used_month, policy.monthly_token_quota)

        # Per-student cap (students only)
        if user_role == 'student' and policy and policy.per_student_daily_quota:
            student_used = _student_tokens_today(institution_id, user_id)
            if student_used >= policy.per_student_daily_quota:
                if hard_stop:
                    raise AIQuotaExceeded(
                        reason=f'Daily AI token limit ({policy.per_student_daily_quota:,}) reached for your account.',
                        quota=policy.per_student_daily_quota,
                        used=student_used,
                    )
                else:
                    log.warning('[ai.gate] student %s over per-student quota (%d/%d) — warn-only',
                                user_id, student_used, policy.per_student_daily_quota)

    # ── 4. AI call ────────────────────────────────────────────────────────
    from app.ai.groq_client import groq_chat
    from app.models.ai_usage import _estimate_cost

    t0 = time.time()
    text, model, is_fallback, usage_dict = None, None, True, None
    success = False

    try:
        text, model, is_fallback, usage_dict = groq_chat(
            messages,
            pool=pool,
            max_tokens=max_tokens,
            temperature=temperature,
            json_mode=json_mode,
            reasoning_effort=reasoning_effort,
        )
        success = (text is not None and not is_fallback)
    except Exception as exc:
        log.error('[ai.gate] groq_chat raised unexpectedly: %s', exc)
        # Log the failure, then re-raise or return None-tuple
        latency_ms = int((time.time() - t0) * 1000)
        _log_usage(
            institution_id, user_id, user_role, feature,
            model='unknown', provider='groq',
            usage_dict=None, cost=0, latency_ms=latency_ms,
            success=False, section_subject_id=section_subject_id,
        )
        raise

    latency_ms = int((time.time() - t0) * 1000)

    # Determine provider for the log row
    if model and model.startswith('gemini:'):
        provider = 'gemini'
        model_name = model.replace('gemini:', '', 1)
    else:
        provider = 'groq'
        model_name = model or 'unknown'

    # ── 5. Usage logging (fail-open) ─────────────────────────────────────
    total_tokens = (usage_dict or {}).get('total_tokens', 0)
    cost = _estimate_cost(model_name, total_tokens)

    _log_usage(
        institution_id, user_id, user_role, feature,
        model=model_name, provider=provider,
        usage_dict=usage_dict, cost=cost,
        latency_ms=latency_ms,
        success=success,
        section_subject_id=section_subject_id,
    )

    return text, model, is_fallback, usage_dict
