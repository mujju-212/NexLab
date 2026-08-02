"""
Background jobs using APScheduler.
All periodic and post-event tasks run here.
"""
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler()
_app = None   # stored app reference for background job contexts


def init_app(app):
    """Attach scheduler to Flask app context"""
    global _app
    _app = app
    scheduler.app = app


def start():
    """Register all jobs and start the scheduler"""
    # Job 1: Send session reminders (every 15 minutes)
    scheduler.add_job(
        func=_send_session_reminders,
        trigger='interval',
        minutes=15,
        id='session_reminders',
        replace_existing=True
    )

    # Job 2: Auto-end sessions that exceeded duration
    scheduler.add_job(
        func=_auto_end_expired_sessions,
        trigger='interval',
        minutes=1,
        id='auto_end_sessions',
        replace_existing=True
    )

    # Job 3: Daily cleanup of temp files older than 24h
    scheduler.add_job(
        func=_cleanup_temp_files,
        trigger='cron',
        hour=2, minute=0,
        id='cleanup_temp_files',
        replace_existing=True
    )

    scheduler.start()


# ── Individual job functions ──────────────────────────────────────────────────

def _send_session_reminders():
    from datetime import datetime, timedelta
    with scheduler.app.app_context():
        from app.models.session import LabSession
        from app.models.feedback import Notification
        from app.models.academic import SectionStudent
        from app.extensions import db

        now = datetime.utcnow()
        windows = [
            ('24h', now + timedelta(hours=24), timedelta(minutes=5)),
            ('1h',  now + timedelta(hours=1),  timedelta(minutes=5)),
            ('15m', now + timedelta(minutes=15), timedelta(minutes=2)),
        ]

        for label, target, tolerance in windows:
            sessions = LabSession.query.filter(
                LabSession.status == 'scheduled',
                LabSession.scheduled_at.between(target - tolerance, target + tolerance)
            ).all()

            for session in sessions:
                # Get all students in section
                from app.models.academic import SectionSubject
                ss = SectionSubject.query.get(session.section_subject_id)
                if not ss:
                    continue
                students = SectionStudent.query.filter_by(section_id=ss.section_id).all()
                for enrollment in students:
                    notif = Notification(
                        user_id=enrollment.student_id,
                        institution_id=ss.section.batch.academic_year.institution_id if hasattr(ss, 'section') else None,
                        notif_type='session_reminder',
                        title=f'Lab Session in {label}',
                        body=f'Your lab session starts in {label}. Complete pre-lab if not done.'
                    )
                    db.session.add(notif)
        db.session.commit()


def _auto_end_expired_sessions():
    from datetime import datetime, timedelta
    with scheduler.app.app_context():
        from app.models.session import LabSession
        from app.extensions import db

        now = datetime.utcnow()
        active_sessions = LabSession.query.filter_by(status='active').all()

        for session in active_sessions:
            if session.started_at:
                end_time = session.started_at + timedelta(minutes=session.duration_minutes)
                if now > end_time + timedelta(minutes=5):  # 5 min grace period
                    session.status   = 'ended'
                    session.ended_at = end_time
                    # Trigger post-session jobs
                    _trigger_post_session_jobs(session)

        db.session.commit()


def _trigger_post_session_jobs(session):
    """Called when a session ends — triggers plagiarism check and ranking update"""
    # Schedule plagiarism check in 1 hour
    scheduler.add_job(
        func=_run_plagiarism_check,
        trigger='date',
        args=[session.id, session.experiment_id],
        id=f'plagiarism_{session.id}',
        replace_existing=True
    )


def _run_plagiarism_check(session_id, experiment_id):
    with scheduler.app.app_context():
        from app.ml.plagiarism import check_session_plagiarism
        from app.models.session import LabSession
        session = LabSession.query.get(session_id)
        if session:
            check_session_plagiarism(session_id, experiment_id, session.institution_id)


def _cleanup_temp_files():
    import os, glob
    from datetime import datetime, timedelta
    cutoff = datetime.utcnow() - timedelta(hours=24)
    for f in glob.glob('/tmp/vlab_*'):
        try:
            mtime = datetime.fromtimestamp(os.path.getmtime(f))
            if mtime < cutoff:
                os.remove(f)
        except Exception:
            pass
