"""
Per-institution analytics configuration manager.
Provides safe fallbacks, weight normalization, and validation.
"""
from datetime import datetime
from app.extensions import db
from app.models.analytics_config import (
    AnalyticsConfig,
    DEFAULT_RISK_WEIGHTS,
    DEFAULT_RISK_BANDS,
)


def get_analytics_config(institution_id: str) -> dict:
    """Retrieve institution analytics config or safe system defaults."""
    if not institution_id:
        return {
            'institution_id': None,
            'risk_weights': dict(DEFAULT_RISK_WEIGHTS),
            'risk_bands': dict(DEFAULT_RISK_BANDS),
            'mastery_halflife_days': 30,
            'min_sample_size': 3,
            'updated_at': None,
        }

    cfg = AnalyticsConfig.query.filter_by(institution_id=institution_id).first()
    if not cfg:
        return {
            'institution_id': institution_id,
            'risk_weights': dict(DEFAULT_RISK_WEIGHTS),
            'risk_bands': dict(DEFAULT_RISK_BANDS),
            'mastery_halflife_days': 30,
            'min_sample_size': 3,
            'updated_at': None,
        }

    return cfg.to_dict()


def save_analytics_config(institution_id: str, data: dict) -> dict:
    """Validate and upsert institution analytics configuration."""
    if not institution_id:
        raise ValueError("institution_id is required")

    cfg = AnalyticsConfig.query.filter_by(institution_id=institution_id).first()
    if not cfg:
        cfg = AnalyticsConfig(institution_id=institution_id)
        db.session.add(cfg)

    # 1. Validate & normalize risk weights
    if 'risk_weights' in data and isinstance(data['risk_weights'], dict):
        raw_weights = data['risk_weights']
        sanitized = {}
        for k in DEFAULT_RISK_WEIGHTS.keys():
            val = float(raw_weights.get(k, DEFAULT_RISK_WEIGHTS[k]))
            sanitized[k] = max(0.0, val)

        total = sum(sanitized.values())
        if total <= 0:
            sanitized = dict(DEFAULT_RISK_WEIGHTS)
            total = sum(sanitized.values())
        cfg.risk_weights = {k: round(v / total, 4) for k, v in sanitized.items()}

    # 2. Validate risk bands
    if 'risk_bands' in data and isinstance(data['risk_bands'], dict):
        raw_bands = data['risk_bands']
        crit = float(raw_bands.get('critical', DEFAULT_RISK_BANDS['critical']))
        high = float(raw_bands.get('high', DEFAULT_RISK_BANDS['high']))
        watch = float(raw_bands.get('watch', DEFAULT_RISK_BANDS['watch']))

        # Ensure monotonic order: critical >= high >= watch >= 0
        crit = max(0.0, min(100.0, crit))
        high = max(0.0, min(crit, high))
        watch = max(0.0, min(high, watch))

        cfg.risk_bands = {
            'critical': round(crit, 1),
            'high': round(high, 1),
            'watch': round(watch, 1),
        }

    # 3. Tunable half-life and min sample size
    if 'mastery_halflife_days' in data:
        try:
            val = int(data['mastery_halflife_days'])
            cfg.mastery_halflife_days = max(1, min(365, val))
        except (ValueError, TypeError):
            pass

    if 'min_sample_size' in data:
        try:
            val = int(data['min_sample_size'])
            cfg.min_sample_size = max(1, min(50, val))
        except (ValueError, TypeError):
            pass

    cfg.updated_at = datetime.utcnow()
    db.session.commit()
    return cfg.to_dict()
