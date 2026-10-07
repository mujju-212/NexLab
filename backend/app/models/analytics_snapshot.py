import uuid
from datetime import datetime
from app.extensions import db


class StudentMetricSnapshot(db.Model):
    """Daily frozen metric and risk snapshot per student (and optionally section-subject)."""
    __tablename__ = 'student_metric_snapshots'

    id                 = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id     = db.Column(db.String(36), nullable=False, index=True)
    student_id         = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    section_subject_id = db.Column(db.String(36), nullable=True, index=True)
    snapshot_date      = db.Column(db.Date, nullable=False, index=True)
    metrics            = db.Column(db.JSON, nullable=False, default=dict)
    created_at         = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('student_id', 'snapshot_date', 'section_subject_id', name='uq_student_snapshot_date_ss'),
        db.Index('ix_sms_inst_date', 'institution_id', 'snapshot_date'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'institution_id': self.institution_id,
            'student_id': self.student_id,
            'section_subject_id': self.section_subject_id,
            'snapshot_date': self.snapshot_date.isoformat() if self.snapshot_date else None,
            'metrics': self.metrics or {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class InstitutionDailyKPI(db.Model):
    """Nightly pre-aggregated institution-level KPI snapshot for fast O(1) reads."""
    __tablename__ = 'institution_daily_kpis'

    id             = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False, index=True)
    snapshot_date  = db.Column(db.Date, nullable=False, index=True)
    kpis           = db.Column(db.JSON, nullable=False, default=dict)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('institution_id', 'snapshot_date', name='uq_inst_snapshot_date'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'institution_id': self.institution_id,
            'snapshot_date': self.snapshot_date.isoformat() if self.snapshot_date else None,
            'kpis': self.kpis or {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
