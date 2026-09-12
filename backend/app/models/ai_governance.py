"""
AI Governance, Quotas, Feature Controls, and Security & Compliance models.
"""
import uuid
import json
from datetime import datetime
from app.extensions import db


class AIUserQuota(db.Model):
    """
    Per-user AI token quota allocation and current monthly consumption.
    """
    __tablename__ = 'ai_user_quotas'

    id                   = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id       = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False, index=True)
    user_id              = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    monthly_token_quota  = db.Column(db.Integer, default=50000, nullable=False)
    current_month_tokens = db.Column(db.Integer, default=0, nullable=False)
    reset_date           = db.Column(db.String(30), default='01 Oct 2026')
    status               = db.Column(db.String(20), default='active')  # active | warning | blocked
    created_at           = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at           = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('institution_id', 'user_id', name='uq_inst_user_quota'),
    )

    def to_dict(self):
        used = self.current_month_tokens or 0
        allocated = self.monthly_token_quota or 1
        pct = min(100, round((used / allocated) * 100, 1)) if allocated > 0 else 0
        remaining = max(0, allocated - used)
        
        status = self.status
        if pct >= 90:
            status = 'warning'
        elif pct >= 100:
            status = 'blocked'

        return {
            'id': self.id,
            'institution_id': self.institution_id,
            'user_id': self.user_id,
            'monthly_token_quota': self.monthly_token_quota,
            'current_month_tokens': self.current_month_tokens,
            'remaining_tokens': remaining,
            'usage_percent': pct,
            'reset_date': self.reset_date,
            'status': status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class AIFeatureConfig(db.Model):
    """
    Granular controls for individual AI capabilities across roles.
    """
    __tablename__ = 'ai_feature_configs'

    id                  = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id      = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False, index=True)
    feature_id          = db.Column(db.String(50), nullable=False, index=True)
    name                = db.Column(db.String(100), nullable=False)
    category            = db.Column(db.String(50), default='General')
    description         = db.Column(db.Text, default='')
    enabled             = db.Column(db.Boolean, default=True, nullable=False)
    available_roles     = db.Column(db.Text, default='["Student", "Instructor", "TA"]')  # JSON list
    default_model       = db.Column(db.String(80), default='GPT-4o (Institution)')
    rate_limit_per_hour = db.Column(db.Integer, default=100)
    cost_per_1k         = db.Column(db.Float, default=0.002)
    supported_content   = db.Column(db.String(100), default='Text, Code, Images')
    enabled_since       = db.Column(db.String(30), default='12 Aug 2026')
    created_at          = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at          = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('institution_id', 'feature_id', name='uq_inst_feature_id'),
    )

    def get_roles(self):
        try:
            return json.loads(self.available_roles) if self.available_roles else []
        except Exception:
            return ['Student', 'Instructor', 'TA']

    def to_dict(self):
        return {
            'id': self.id,
            'institution_id': self.institution_id,
            'feature_id': self.feature_id,
            'name': self.name,
            'category': self.category,
            'description': self.description,
            'enabled': self.enabled,
            'available_roles': self.get_roles(),
            'default_model': self.default_model,
            'rate_limit_per_hour': self.rate_limit_per_hour,
            'cost_per_1k': self.cost_per_1k,
            'supported_content': self.supported_content,
            'enabled_since': self.enabled_since,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class SecurityEvent(db.Model):
    """
    Security audit trail tracking login attempts, policy violations, and administrative actions.
    """
    __tablename__ = 'security_events'

    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False, index=True)
    user_id        = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True, index=True)
    user_name      = db.Column(db.String(120), default='Unknown')
    event_type     = db.Column(db.String(50), nullable=False, index=True)
    title          = db.Column(db.String(150), nullable=False)
    ip_address     = db.Column(db.String(45), default='127.0.0.1')
    location       = db.Column(db.String(100), default='Bengaluru, IN')
    severity       = db.Column(db.String(20), default='low')  # low | medium | high | critical
    details        = db.Column(db.Text, default='')
    created_at     = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    def to_dict(self):
        now = datetime.utcnow()
        diff = now - (self.created_at or now)
        if diff.total_seconds() < 60:
            rel = 'Just now'
        elif diff.total_seconds() < 3600:
            rel = f'{int(diff.total_seconds() // 60)} mins ago'
        elif diff.total_seconds() < 86400:
            rel = f'{int(diff.total_seconds() // 3600)} hours ago'
        else:
            rel = f'{diff.days} days ago'

        return {
            'id': self.id,
            'institution_id': self.institution_id,
            'user_id': self.user_id,
            'user_name': self.user_name,
            'event_type': self.event_type,
            'title': self.title,
            'ip_address': self.ip_address,
            'location': self.location,
            'severity': self.severity,
            'details': self.details,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'formatted_time': rel,
        }


class ComplianceSetting(db.Model):
    """
    Institution compliance framework statuses and retention periods.
    """
    __tablename__ = 'compliance_settings'

    id              = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id  = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False, index=True)
    security_score  = db.Column(db.Integer, default=96)
    compliance_status = db.Column(db.String(30), default='Compliant')
    last_assessed   = db.Column(db.String(30), default='01 Oct 2026')
    frameworks_json = db.Column(db.Text)  # JSON list of {id, name, desc, status}
    retention_json  = db.Column(db.Text)  # JSON dict of {chat_months, content_months, logs_months, delete_days}
    created_at      = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at      = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_frameworks(self):
        if self.frameworks_json:
            try:
                return json.loads(self.frameworks_json)
            except Exception:
                pass
        return [
            {'id': 'ferpa', 'name': 'FERPA', 'title': 'Family Educational Rights and Privacy Act', 'status': 'Compliant'},
            {'id': 'gdpr', 'name': 'GDPR', 'title': 'General Data Protection Regulation', 'status': 'Compliant'},
            {'id': 'iso27001', 'name': 'ISO 27001', 'title': 'Information Security Management', 'status': 'Compliant'},
            {'id': 'soc2', 'name': 'SOC 2', 'title': 'Security, Availability, Confidentiality', 'status': 'Compliant'},
        ]

    def get_retention(self):
        if self.retention_json:
            try:
                return json.loads(self.retention_json)
            except Exception:
                pass
        return {
            'chat_conversations': '12 months',
            'generated_content': '12 months',
            'user_activity_logs': '24 months',
            'deleted_accounts': '90 days',
        }

    def to_dict(self):
        return {
            'id': self.id,
            'institution_id': self.institution_id,
            'security_score': self.security_score,
            'compliance_status': self.compliance_status,
            'last_assessed': self.last_assessed,
            'frameworks': self.get_frameworks(),
            'retention_rules': self.get_retention(),
        }
