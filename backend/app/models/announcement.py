"""
Announcement & AnnouncementInteraction models.

Elevates announcements to first-class entities with full tracking of:
- Authors (institution_admin or instructor)
- Categories (general, cancellation, schedule, exam, event)
- Priorities (normal, important, urgent)
- Rich audience scoping (everyone, students, instructors, custom, department, batch, year, section, section_subject)
- Attachments (filename, url, size)
- State management (sent, scheduled, draft)
- Real engagement metrics (reach_count, views_count, likes_count)
- Per-user interactions (read_at, liked)
"""
import uuid
from datetime import datetime
from app.extensions import db


class Announcement(db.Model):
    __tablename__ = 'announcements'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False, index=True)
    author_id = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=False, index=True)
    author_role = db.Column(db.String(30), default='institution_admin', nullable=False)  # institution_admin | instructor

    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text, nullable=False)
    priority = db.Column(db.String(20), default='normal', nullable=False)  # normal | important | urgent
    category = db.Column(db.String(30), default='general', nullable=False)  # general | cancellation | schedule | exam | event

    # Targeting
    target = db.Column(db.String(30), default='all', nullable=False)  # all | students | instructors | custom
    department_id = db.Column(db.String(36), nullable=True)
    academic_year = db.Column(db.Integer, nullable=True)
    batch_id = db.Column(db.String(36), nullable=True)
    section_id = db.Column(db.String(36), nullable=True)
    section_subject_id = db.Column(db.String(36), nullable=True)

    # Attachments
    attachment_name = db.Column(db.String(255), nullable=True)
    attachment_url = db.Column(db.Text, nullable=True)
    attachment_size = db.Column(db.String(50), nullable=True)

    # State & Timestamps
    status = db.Column(db.String(20), default='sent', nullable=False, index=True)  # sent | scheduled | draft
    send_at = db.Column(db.DateTime, nullable=True, index=True)
    sent_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Engagement Metrics
    reach_count = db.Column(db.Integer, default=0, nullable=False)
    views_count = db.Column(db.Integer, default=0, nullable=False)
    likes_count = db.Column(db.Integer, default=0, nullable=False)

    # Relationships
    author = db.relationship('User', foreign_keys=[author_id], lazy='joined')
    interactions = db.relationship('AnnouncementInteraction', backref='announcement', cascade='all, delete-orphan', lazy='dynamic')

    __table_args__ = (
        db.Index('ix_announcements_inst_status', 'institution_id', 'status'),
        db.Index('ix_announcements_inst_created', 'institution_id', 'created_at'),
    )

    def to_dict(self, current_user_id=None):
        out = {
            'id': self.id,
            'institution_id': self.institution_id,
            'author_id': self.author_id,
            'author_name': self.author.full_name if self.author else 'NexLab Administrator',
            'author_role': self.author_role,
            'title': self.title,
            'message': self.message,
            'priority': self.priority,
            'category': self.category,
            'target': self.target,
            'department_id': self.department_id,
            'academic_year': self.academic_year,
            'batch_id': self.batch_id,
            'section_id': self.section_id,
            'section_subject_id': self.section_subject_id,
            'attachment_name': self.attachment_name,
            'attachment_url': self.attachment_url,
            'attachment_size': self.attachment_size,
            'status': self.status,
            'send_at': self.send_at.isoformat() + 'Z' if self.send_at else None,
            'sent_at': self.sent_at.isoformat() + 'Z' if self.sent_at else None,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
            'updated_at': self.updated_at.isoformat() + 'Z' if self.updated_at else None,
            'reach_count': self.reach_count,
            'views_count': self.views_count,
            'likes_count': self.likes_count,
            'open_rate_pct': round((self.views_count / self.reach_count * 100), 1) if self.reach_count > 0 else 0,
        }

        if current_user_id:
            interaction = AnnouncementInteraction.query.filter_by(
                announcement_id=self.id, user_id=current_user_id
            ).first()
            out['is_read'] = bool(interaction and interaction.read_at is not None)
            out['is_liked'] = bool(interaction and interaction.liked)
            out['read_at'] = interaction.read_at.isoformat() + 'Z' if (interaction and interaction.read_at) else None
        else:
            out['is_read'] = False
            out['is_liked'] = False
            out['read_at'] = None

        return out


class AnnouncementInteraction(db.Model):
    __tablename__ = 'announcement_interactions'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    announcement_id = db.Column(db.String(36), db.ForeignKey('announcements.id', ondelete='CASCADE'), nullable=False, index=True)
    user_id = db.Column(db.String(36), db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    read_at = db.Column(db.DateTime, nullable=True)
    liked = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint('announcement_id', 'user_id', name='uq_announcement_user_interaction'),
    )

    def to_dict(self):
        return {
            'id': self.id,
            'announcement_id': self.announcement_id,
            'user_id': self.user_id,
            'read_at': self.read_at.isoformat() + 'Z' if self.read_at else None,
            'liked': self.liked,
            'created_at': self.created_at.isoformat() + 'Z' if self.created_at else None,
        }
