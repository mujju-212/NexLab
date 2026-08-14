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
    # Job 0: Ensure Judge0 (code execution) containers are up — one-shot on boot
    scheduler.add_job(
        func=_ensure_judge0,
        trigger='date',
        id='ensure_judge0',
        replace_existing=True
    )

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

def _ensure_judge0():
    """Auto-start the Judge0 Docker stack if it is not reachable.

    Runs once right after backend boot so code execution works without
    manually starting containers. Best-effort: failures only log.
    """
    import os, time, subprocess
    import requests

    app = scheduler.app   # stored Flask app — scheduler threads have no app context
    try:
        url = app.config['JUDGE0_URL']
    except Exception:
        return

    def _reachable():
        try:
            return requests.get(f'{url}/about', timeout=4).status_code == 200
        except Exception:
            return False

    if _reachable():
        app.logger.info('[judge0] already running at %s', url)
        return

    app.logger.warning('[judge0] not reachable — starting Docker stack…')
    compose_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'docker')
    compose_file = os.path.join(compose_dir, 'docker-compose.judge0.yml')
    try:
        subprocess.run(
            f'docker compose -f "{compose_file}" up -d',
            shell=True, cwd=compose_dir, timeout=180,
            capture_output=True,
        )
    except Exception as e:
        app.logger.error('[judge0] docker compose failed: %s', e)
        return

    # Wait up to ~90s for the API to come up
    for _ in range(18):
        time.sleep(5)
        if _reachable():
            app.logger.info('[judge0] started successfully')
            return
    app.logger.error('[judge0] containers started but API still unreachable')


def _send_session_reminders():
    from datetime import datetime, timedelta
    with scheduler.app.app_context():
        from app.models.session import LabSession
        from app.models.feedback import Notification
        from app.models.academic import SectionSubject, SectionStudent, Section
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
                ss = SectionSubject.query.get(session.section_subject_id)
                if not ss:
                    continue

                # Section has institution_id directly — no chained relationship needed
                section = Section.query.get(ss.section_id)
                institution_id = section.institution_id if section else ss.institution_id

                students = SectionStudent.query.filter_by(section_id=ss.section_id).all()
                for enrollment in students:
                    notif = Notification(
                        user_id=enrollment.student_id,
                        institution_id=institution_id,
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
