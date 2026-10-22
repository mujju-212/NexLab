"""
AI usage tracking and governance models.

AIUsageLog  — one row per AI API call; the audit trail and analytics source.
AIPolicy    — one row per institution; controls on/off + quotas.
AIAgentRun  — one row per agent invocation (WS-D, agentic AI feature).
"""
import uuid
from datetime import datetime
from app.extensions import db


# Token → USD price map; best-effort estimate, clearly labeled in UIs.
# Update when provider pricing changes.
PRICE_MAP = {
    # Groq models
    'openai/gpt-oss-20b':           0.00000009,   # $0.09 / 1M tokens
    'openai/gpt-oss-120b':          0.00000009,
    'openai/gpt-oss-safeguard-20b': 0.00000009,
    'qwen/qwen3.6-27b':             0.00000009,
    'llama-3.1-8b-instant':         0.00000005,
    'llama-3.3-70b-versatile':      0.00000059,
    # Gemini fallback models
    'gemini-flash-latest':          0.00000001,
    'gemini-3-flash-preview':       0.00000001,
}
PRICE_DEFAULT = 0.000_000_1   # fallback for unknown models


def _estimate_cost(model: str, total_tokens: int) -> float:
    """Return a best-effort USD cost estimate for a completed call."""
    if not total_tokens:
        return 0.0
    price = PRICE_MAP.get(model, PRICE_DEFAULT)
    return round(price * total_tokens, 8)


class AIUsageLog(db.Model):
    """
    One row per AI call, stamped with institution_id so dashboards can
    aggregate by institution (institution admin) or across institutions
    (platform admin) from the same table.
    """
    __tablename__ = 'ai_usage_log'

    id                 = db.Column(db.String(36), primary_key=True,
                                   default=lambda: str(uuid.uuid4()))
    institution_id     = db.Column(db.String(36), db.ForeignKey('institutions.id'),
                                   nullable=True, index=True)   # nullable for platform-level calls
    user_id            = db.Column(db.String(36), db.ForeignKey('users.id'),
                                   nullable=True, index=True)
    role               = db.Column(db.String(20))               # student | instructor | institution_admin
    feature            = db.Column(db.String(30), index=True)   # hint | chat | code_assist | viva_generate | viva_evaluate | agent
    model              = db.Column(db.String(80))               # e.g. openai/gpt-oss-20b
    provider           = db.Column(db.String(20))               # groq | gemini
    prompt_tokens      = db.Column(db.Integer, default=0)
    completion_tokens  = db.Column(db.Integer, default=0)
    total_tokens       = db.Column(db.Integer, default=0, index=True)
    estimated_cost_usd = db.Column(db.Numeric(12, 8), default=0)
    latency_ms         = db.Column(db.Integer)
    success            = db.Column(db.Boolean, default=True)
    section_subject_id = db.Column(db.String(36), nullable=True)   # context (no FK — optional)
    created_at         = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        db.Index('ix_ai_usage_inst_date', 'institution_id', 'created_at'),
        db.Index('ix_ai_usage_inst_user_date', 'institution_id', 'user_id', 'created_at'),
        db.Index('ix_ai_usage_inst_feature', 'institution_id', 'feature'),
    )

    def to_dict(self):
        return {
            'id':                  self.id,
            'institution_id':      self.institution_id,
            'user_id':             self.user_id,
            'role':                self.role,
            'feature':             self.feature,
            'model':               self.model,
            'provider':            self.provider,
            'prompt_tokens':       self.prompt_tokens,
            'completion_tokens':   self.completion_tokens,
            'total_tokens':        self.total_tokens,
            'estimated_cost_usd':  float(self.estimated_cost_usd or 0),
            'latency_ms':          self.latency_ms,
            'success':             self.success,
            'created_at':          self.created_at.isoformat() if self.created_at else None,
        }


class AIPolicy(db.Model):
    """
    Per-institution AI governance: master on/off, per-role toggles,
    per-feature switches, and token quotas.

    Defaults are all-on, quota=None (inherit platform).
    Enforcement precedence: platform global → institution policy.
    """
    __tablename__ = 'ai_policy'

    institution_id       = db.Column(db.String(36), db.ForeignKey('institutions.id'),
                                     primary_key=True)
    # Master switch — if False all AI is blocked for the institution.
    ai_enabled_global    = db.Column(db.Boolean, default=True, nullable=False)
    # Role-level toggles (only respected when ai_enabled_global=True).
    ai_enabled_students  = db.Column(db.Boolean, default=True, nullable=False)
    ai_enabled_instructors = db.Column(db.Boolean, default=True, nullable=False)
    # Per-feature JSON blob: {"hint": true, "chat": true, "code_assist": true,
    #                         "viva_generate": true, "viva_evaluate": true, "agent": false}
    features_enabled     = db.Column(db.Text)  # JSON; None = all on
    # Quota caps (tokens/day or tokens/month). None = inherit from platform.
    daily_token_quota    = db.Column(db.Integer)
    monthly_token_quota  = db.Column(db.Integer)
    per_student_daily_quota = db.Column(db.Integer)  # fairness cap per student
    # When True, block at quota; when False, log a warning but allow the call.
    hard_stop            = db.Column(db.Boolean, default=True, nullable=False)
    updated_by           = db.Column(db.String(36), db.ForeignKey('users.id'))
    updated_at           = db.Column(db.DateTime, default=datetime.utcnow,
                                     onupdate=datetime.utcnow)

    FEATURE_DEFAULTS = {
        'hint':           True,
        'chat':           True,
        'code_assist':    True,
        'viva_generate':  True,
        'viva_evaluate':  True,
        'agent':          True,   # WS-D Autonomous Harness enabled
    }

    def feature_flags(self) -> dict:
        """Stored per-feature flags merged over defaults (defaults win on gaps)."""
        import json
        flags = dict(self.FEATURE_DEFAULTS)
        if self.features_enabled:
            try:
                stored = json.loads(self.features_enabled)
                if isinstance(stored, dict):
                    flags.update({k: bool(v) for k, v in stored.items()
                                  if k in self.FEATURE_DEFAULTS})
            except (ValueError, TypeError):
                pass
        return flags

    def to_dict(self):
        return {
            'institution_id':        self.institution_id,
            'ai_enabled_global':     self.ai_enabled_global,
            'ai_enabled_students':   self.ai_enabled_students,
            'ai_enabled_instructors': self.ai_enabled_instructors,
            'features_enabled':      self.feature_flags(),
            'daily_token_quota':     self.daily_token_quota,
            'monthly_token_quota':   self.monthly_token_quota,
            'per_student_daily_quota': self.per_student_daily_quota,
            'hard_stop':             self.hard_stop,
            'updated_at':            self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def get_or_create(cls, institution_id: str, updated_by: str = None) -> 'AIPolicy':
        """Fetch the policy row, creating a default one if it doesn't exist yet."""
        policy = cls.query.get(institution_id)
        if not policy:
            policy = cls(institution_id=institution_id, updated_by=updated_by)
            db.session.add(policy)
            db.session.flush()
        return policy


class AIAgentRun(db.Model):
    """
    Audit trail for every agentic AI invocation (WS-D).
    Enables replay, cost attribution, and admin oversight.
    """
    __tablename__ = 'ai_agent_run'

    id             = db.Column(db.String(36), primary_key=True,
                               default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'),
                               nullable=False, index=True)
    user_id        = db.Column(db.String(36), db.ForeignKey('users.id'),
                               nullable=False)
    prompt         = db.Column(db.Text)
    tool_calls     = db.Column(db.Text)   # JSON array of {tool, args, result}
    result         = db.Column(db.Text)   # final natural-language answer
    total_tokens   = db.Column(db.Integer, default=0)
    status         = db.Column(db.String(20), default='completed')  # completed | error | pending_confirm
    created_at     = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        import json
        return {
            'id':             self.id,
            'institution_id': self.institution_id,
            'user_id':        self.user_id,
            'prompt':         self.prompt,
            'tool_calls':     json.loads(self.tool_calls) if self.tool_calls else [],
            'result':         self.result,
            'total_tokens':   self.total_tokens,
            'status':         self.status,
            'created_at':     self.created_at.isoformat() if self.created_at else None,
        }
