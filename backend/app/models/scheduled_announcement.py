"""
ScheduledAnnouncement — P5: announcements written today, delivered later.

An institution admin drafts an announcement with a future send_at; the
scheduler dispatches it through the exact same core as the immediate-send
endpoint, so targeting, notification fan-out, socket push and audit behave
identically — just delayed.
"""
import uuid
from datetime import datetime
from app.extensions import db


class ScheduledAnnouncement(db.Model):
    __tablename__ = 'scheduled_announcements'

    id             = db.Column(db.String(36), primary_key=True,
                               default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'),
                               nullable=False, index=True)
    created_by     = db.Column(db.String(36), db.ForeignKey('users.id'),
                               nullable=False)
    title          = db.Column(db.Text, nullable=False)
    message        = db.Column(db.Text, nullable=False)
    target         = db.Column(db.String(20), default='all')  # all|students|instructors
    department_id  = db.Column(db.String(36))
    batch_id       = db.Column(db.String(36))
    section_id     = db.Column(db.String(36))
    academic_year  = db.Column(db.Integer)
    send_at        = db.Column(db.DateTime, nullable=False, index=True)
    status         = db.Column(db.String(20), default='pending',
                               index=True)  # pending | sent | cancelled
    sent_at        = db.Column(db.DateTime)
    recipients_sent = db.Column(db.Integer)
    created_at     = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.Index('ix_sched_ann_inst_status', 'institution_id', 'status'),
        db.Index('ix_sched_ann_status_sendat', 'status', 'send_at'),
    )

    def to_dict(self):
        return {
            'id':             self.id,
            'institution_id': self.institution_id,
            'created_by':     self.created_by,
            'title':          self.title,
            'message':        self.message,
            'target':         self.target,
            'department_id':  self.department_id,
            'batch_id':       self.batch_id,
            'section_id':     self.section_id,
            'academic_year':  self.academic_year,
            'send_at':        self.send_at.isoformat() + 'Z' if self.send_at else None,
            'status':         self.status,
            'sent_at':        self.sent_at.isoformat() + 'Z' if self.sent_at else None,
            'recipients_sent': self.recipients_sent,
            'created_at':     self.created_at.isoformat() + 'Z' if self.created_at else None,
        }

    def payload(self) -> dict:
        """The body `_send_targeted_announcement` expects, rebuilt from columns."""
        data = {'title': self.title, 'message': self.message, 'target': self.target}
        for key in ('department_id', 'batch_id', 'section_id', 'academic_year'):
            val = getattr(self, key)
            if val:
                data[key] = val
        return data
