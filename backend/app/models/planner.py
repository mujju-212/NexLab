import uuid
import json
from datetime import datetime, date
from app.extensions import db


class RecurringPlan(db.Model):
    """
    Recurring Lab Session Plan (Timetable Planner).
    Defines rules for auto-generating recurring lab sessions for departments, batches, and sections.
    """
    __tablename__ = 'recurring_plans'

    id                       = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    institution_id           = db.Column(db.String(36), db.ForeignKey('institutions.id'), nullable=False)
    name                     = db.Column(db.Text, nullable=False)        # e.g. "CSE Core Labs"
    description              = db.Column(db.Text)                       # e.g. "Core subjects lab schedule"
    department_id            = db.Column(db.String(36), db.ForeignKey('departments.id'), nullable=True)
    batch_id                 = db.Column(db.String(36), db.ForeignKey('batches.id'), nullable=True)
    academic_year_id         = db.Column(db.String(36), db.ForeignKey('academic_years.id'), nullable=True)
    
    # JSON arrays stored as strings
    sections_json            = db.Column(db.Text, default='[]')         # e.g. '["A", "B"]' or section IDs
    subjects_json            = db.Column(db.Text, default='[]')         # e.g. '[{"id":"...","name":"Data Structures","code":"CS102"}]'
    schedule_days_json       = db.Column(db.Text, default='[]')         # e.g. '["Mon", "Wed", "Fri"]'
    
    start_time               = db.Column(db.String(20), default='09:00')# e.g. "09:00" or "09:00 AM"
    duration_minutes         = db.Column(db.Integer, default=60)
    start_date               = db.Column(db.Date, nullable=False)       # e.g. 2026-09-01
    end_date                 = db.Column(db.Date, nullable=False)       # e.g. 2026-12-15
    
    room                     = db.Column(db.String(100), default='Lab 1 (Main Block)')
    instructor_id            = db.Column(db.String(36), db.ForeignKey('users.id'), nullable=True, index=True)
    
    status                   = db.Column(db.String(20), default='active') # 'active' | 'draft' | 'paused'
    sessions_generated_count = db.Column(db.Integer, default=0)
    
    created_at               = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at               = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships for fast hydration
    department               = db.relationship('Department', foreign_keys=[department_id], lazy='joined')
    batch                    = db.relationship('Batch', foreign_keys=[batch_id], lazy='joined')
    academic_year            = db.relationship('AcademicYear', foreign_keys=[academic_year_id], lazy='joined')
    instructor               = db.relationship('User', foreign_keys=[instructor_id], lazy='joined')

    def get_sections(self):
        try:
            return json.loads(self.sections_json or '[]')
        except Exception:
            return []

    def get_subjects(self):
        try:
            return json.loads(self.subjects_json or '[]')
        except Exception:
            return []

    def get_schedule_days(self):
        try:
            return json.loads(self.schedule_days_json or '[]')
        except Exception:
            return []

    def to_dict(self):
        sections = self.get_sections()
        subjects = self.get_subjects()
        schedule_days = self.get_schedule_days()

        # Format time for display (e.g. "09:00" -> "9:00 AM" or "14:00" -> "2:00 PM")
        time_display = self.start_time or ''
        if time_display and ':' in time_display and 'AM' not in time_display.upper() and 'PM' not in time_display.upper():
            try:
                parts = time_display.split(':')
                h = int(parts[0])
                m = int(parts[1])
                ampm = 'AM' if h < 12 else 'PM'
                disp_h = 12 if h in (0, 12) else (h % 12)
                time_display = f"{disp_h}:{m:02d} {ampm}"
            except Exception:
                pass

        # Format date range (e.g. "1 Sep – 15 Dec 2026")
        date_range_display = ''
        try:
            sd = self.start_date
            ed = self.end_date
            if isinstance(sd, str):
                sd = datetime.strptime(sd[:10], '%Y-%m-%d').date()
            if isinstance(ed, str):
                ed = datetime.strptime(ed[:10], '%Y-%m-%d').date()
            if sd and ed:
                s_fmt = f"{sd.day} {sd.strftime('%b')}"
                e_fmt = f"{ed.day} {ed.strftime('%b %Y')}"
                date_range_display = f"{s_fmt} – {e_fmt}"
        except Exception:
            date_range_display = ''

        schedule_display = ', '.join(schedule_days) if schedule_days else '—'

        return {
            'id': self.id,
            'institution_id': self.institution_id,
            'name': self.name,
            'description': self.description or '',
            'department_id': self.department_id,
            'department_name': self.department.name if self.department else '',
            'department_code': self.department.code if self.department else '',
            'batch_id': self.batch_id,
            'batch_name': self.batch.name if self.batch else '',
            'academic_year_id': self.academic_year_id,
            'academic_year_label': self.academic_year.year_label if self.academic_year else '',
            'sections': sections,
            'subjects': subjects,
            'subject_count': len(subjects),
            'schedule_days': schedule_days,
            'schedule_display': schedule_display,
            'start_time': time_display,
            'raw_start_time': self.start_time,
            'duration_minutes': self.duration_minutes,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'end_date': self.end_date.isoformat() if self.end_date else None,
            'date_range_display': date_range_display,
            'room': self.room or '',
            'instructor_id': self.instructor_id,
            'instructor_name': self.instructor.full_name if self.instructor else None,
            'status': self.status or 'active',
            'sessions_generated_count': self.sessions_generated_count or 0,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
