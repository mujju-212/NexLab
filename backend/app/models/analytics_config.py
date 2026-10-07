import uuid
from datetime import datetime
from app.extensions import db

DEFAULT_RISK_WEIGHTS = {
    'mastery': 0.25,
    'grade': 0.25,
    'attendance': 0.20,
    'focus': 0.10,
    'consistency': 0.10,
    'freshness': 0.10,
}

DEFAULT_RISK_BANDS = {
    'critical': 70,
    'high': 50,
    'watch': 30,
}


class AnalyticsConfig(db.Model):
    """Per-institution tunable analytics and risk thresholds."""
    __tablename__ = 'analytics_config'

    institution_id        = db.Column(db.String(36), db.ForeignKey('institutions.id'), primary_key=True)
    risk_weights          = db.Column(db.JSON, nullable=False, default=lambda: dict(DEFAULT_RISK_WEIGHTS))
    risk_bands            = db.Column(db.JSON, nullable=False, default=lambda: dict(DEFAULT_RISK_BANDS))
    mastery_halflife_days = db.Column(db.Integer, default=30)
    min_sample_size       = db.Column(db.Integer, default=3)
    updated_at            = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def get_risk_weights(self) -> dict:
        weights = dict(DEFAULT_RISK_WEIGHTS)
        if isinstance(self.risk_weights, dict):
            weights.update(self.risk_weights)
        total = sum(weights.values()) or 1.0
        return {k: round(v / total, 4) for k, v in weights.items()}

    def get_risk_bands(self) -> dict:
        bands = dict(DEFAULT_RISK_BANDS)
        if isinstance(self.risk_bands, dict):
            bands.update(self.risk_bands)
        return bands

    def to_dict(self):
        return {
            'institution_id': self.institution_id,
            'risk_weights': self.get_risk_weights(),
            'risk_bands': self.get_risk_bands(),
            'mastery_halflife_days': self.mastery_halflife_days or 30,
            'min_sample_size': self.min_sample_size or 3,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
