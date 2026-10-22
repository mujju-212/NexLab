"""
Background jobs using APScheduler.
All periodic and post-event tasks run here.
"""
from apscheduler.schedulers.background import BackgroundScheduler

scheduler = BackgroundScheduler({
    # Tolerate missed runs (laptop sleep / Docker startup / slow Docker probes)
    # instead of spamming "Run time of job ... was missed" warnings; coalesce
    # collapses any backlog into a single run, max_instances prevents overlap.
    'misfire_grace_time': 300,
    'coalesce': True,
    'max_instances': 1,
})
_app = None   # stored app reference for background job contexts


def init_app(app):
    """Attach scheduler to Flask app context"""
    global _app
    _app = app
    scheduler.app = app


def start():
    """Register all jobs and start the scheduler"""
    if scheduler.running:
        return

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

    # Job 2b: Fire timer_expired for LivePageState page timers (C20)
    scheduler.add_job(
        func=_fire_expired_page_timers,
        trigger='interval',
        seconds=15,
        id='expired_page_timers',
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

    # Job 4: Nightly telemetry retention — proctor events / AI usage / agent
    # runs grow forever without this. Defaults follow an academic-year cycle
    # (~1 year for proctor evidence, in case of disputes).
    scheduler.add_job(
        func=_cleanup_telemetry,
        trigger='cron',
        hour=3, minute=30,
        id='cleanup_telemetry',
        replace_existing=True
    )

    # Job 5: Dispatch due scheduled announcements (P5) — checked every 5 min
    # so an "8:00 AM exam notice" lands within five minutes of its time.
    scheduler.add_job(
        func=_dispatch_scheduled_announcements,
        trigger='interval',
        minutes=5,
        id='dispatch_scheduled_announcements',
        replace_existing=True
    )

    # Job 6: Weekly instructor digest (F5) — Sundays 07:00 UTC. Composes the
    # week in review from existing queries and drops it as a Notification.
    scheduler.add_job(
        func=_weekly_instructor_digest,
        trigger='cron',
        day_of_week='sun',
        hour=7, minute=0,
        id='weekly_instructor_digest',
        replace_existing=True
    )

    # Job 7: Nightly analytics metric & KPI snapshot rollup (O(1) trends & risk slopes)
    scheduler.add_job(
        func=_run_nightly_metric_snapshots,
        trigger='cron',
        hour=2, minute=30,
        id='nightly_analytics_snapshots',
        replace_existing=True
    )

    scheduler.start()


def _cleanup_telemetry():
    """
    Nightly retention sweep for high-volume observability tables.
    Windows come from PlatformConfig (keys absent → defaults); defaults follow
    an academic-year cycle — proctor evidence is kept ~1 year for disputes:
      proctor_event_retention_days  (default 365)
      ai_usage_retention_days       (default 365)
      ai_agent_run_retention_days   (default 365)
    """
    from datetime import datetime, timedelta
    from app.extensions import db
    from app.models.institution import PlatformConfig
    from app.models.proctor_event import ProctorEvent
    from app.models.ai_usage import AIUsageLog, AIAgentRun

    def _days(key, default):
        try:
            return max(7, int(PlatformConfig.get(key, default)))
        except (TypeError, ValueError):
            return default

    now = datetime.utcnow()
    windows = (
        (ProctorEvent, 'proctor_event_retention_days', 365),
        (AIUsageLog,   'ai_usage_retention_days',      365),
        (AIAgentRun,   'ai_agent_run_retention_days',  365),
    )
    for model, key, default in windows:
        cutoff = now - timedelta(days=_days(key, default))
        try:
            ts_col = getattr(model, 'created_at', None) or getattr(model, 'recorded_at')
            deleted = model.query.filter(ts_col < cutoff).delete()
            db.session.commit()
            if deleted:
                scheduler.app.logger.info('[jobs] retention: pruned %d %s rows older than %s',
                                          deleted, model.__tablename__, cutoff.date())
        except Exception as exc:
            db.session.rollback()
            scheduler.app.logger.warning('[jobs] retention sweep failed for %s: %s',
                                         model.__tablename__, exc)


# ── Individual job functions ──────────────────────────────────────────────────

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
                        type='session_reminder',
                        title=f'Lab Session in {label}',
                        message=f'Your lab session starts in {label}. Complete pre-lab if not done.'
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


def _fire_expired_page_timers():
    """C20 — when a LivePageState page timer expires, emit `timer_expired` to
    the instructor room with checkpoint stats (D15: instructor-only signal,
    no automatic student-side action). Clears the timer so it fires once."""
    from datetime import datetime
    with scheduler.app.app_context():
        from app.models.conductor import LivePageState, CheckpointProgress
        from app.models.session import LabSession
        from app.extensions import db, socketio

        now = datetime.utcnow()
        expired = LivePageState.query.filter(
            LivePageState.page_timer_ends_at.isnot(None),
            LivePageState.page_timer_ends_at <= now,
        ).all()

        for lps in expired:
            sess = LabSession.query.get(lps.session_id)
            if not sess or sess.status != 'active':
                # session not live — just clear the stale timer
                lps.page_timer_ends_at = None
                continue

            page_id = lps.current_page_id
            # Stats: how many students have passed the current page's checkpoint(s)
            try:
                from app.models.conductor import Checkpoint
                cps = Checkpoint.query.filter_by(page_id=page_id).all() if page_id else []
                passed = 0
                total = 0
                if cps:
                    cp_ids = [c.id for c in cps]
                    rows = (db.session.query(CheckpointProgress.status)
                            .filter(
                                CheckpointProgress.session_id == sess.id,
                                CheckpointProgress.checkpoint_id.in_(cp_ids),
                                CheckpointProgress.status.in_(['verified', 'manual_pass']),
                            ).all())
                    passed = len(rows)
                    from app.models.academic import SectionStudent, SectionSubject
                    ss = SectionSubject.query.get(sess.section_subject_id)
                    total = SectionStudent.query.filter_by(section_id=ss.section_id).count() if ss else 0
            except Exception:
                passed, total = 0, 0

            try:
                socketio.emit('timer_expired', {
                    'session_id': sess.id,
                    'page_id': page_id,
                    'page_title': 'Current page',
                    'passed_count': passed,
                    'total_count': total,
                    'timestamp': now.isoformat(),
                }, room=f"session_{sess.id}_instructor")
            except Exception:
                pass

            # Clear the fired timer (one-shot)
            lps.page_timer_ends_at = None

        if expired:
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


def _weekly_instructor_digest():
    """
    F5 — one Notification per instructor per week: sessions run, finals
    submitted, grades saved, plagiarism flags, at-risk count, and open
    follow-ups due. Pure composition of existing queries — zero new analytics.
    """
    from datetime import timedelta, datetime as _dt
    with scheduler.app.app_context():
        from app.extensions import db
        from app.models.user import User
        from app.models.academic import SectionSubject, SectionStudent
        from app.models.session import LabSession
        from app.models.submission import CodeAttempt
        from app.models.grading import Grade
        from app.models.feedback import PlagiarismFlag, Notification
        from app.models.knowledge import ConceptMastery
        from app.models.intervention import Intervention

        now = _dt.utcnow()
        week_ago = now - timedelta(days=7)

        instructors = User.query.filter_by(role='instructor', is_active=True).all()
        sent = 0
        for inst in instructors:
            my_ss = SectionSubject.query.filter_by(
                institution_id=inst.institution_id, instructor_id=inst.id).all()
            ss_ids = [s.id for s in my_ss]
            my_exp = [e.id for e in _query_experiments(inst)]
            if not ss_ids and not my_exp:
                continue

            my_students = 0
            if ss_ids:
                my_students = len({e.student_id for e in SectionStudent.query.filter(
                    SectionStudent.section_id.in_([s.section_id for s in my_ss])).all()})

            sessions_run = LabSession.query.filter(
                LabSession.section_subject_id.in_(ss_ids) if ss_ids else db.false(),
                LabSession.started_at >= week_ago,
            ).count()
            finals = CodeAttempt.query.filter(
                CodeAttempt.experiment_id.in_(my_exp) if my_exp else db.false(),
                CodeAttempt.is_final_submission == True,  # noqa: E712
                CodeAttempt.submitted_at >= week_ago,
            ).count()
            graded = Grade.query.filter(
                Grade.experiment_id.in_(my_exp) if my_exp else db.false(),
                Grade.graded_at >= week_ago,
            ).count()
            flags = PlagiarismFlag.query.filter(
                PlagiarismFlag.experiment_id.in_(my_exp) if my_exp else db.false(),
                PlagiarismFlag.detected_at >= week_ago,
            ).count()

            # At-risk among my students (mastery < 40)
            at_risk = 0
            open_followups = 0
            my_student_ids = _student_ids_of(inst)
            if my_student_ids:
                at_risk = len({
                    m.student_id for m in ConceptMastery.query.filter(
                        ConceptMastery.institution_id == inst.institution_id,
                        ConceptMastery.student_id.in_(my_student_ids),
                    ).all()
                    if (m.mastery_score or 0) < 40
                })
                open_followups = Intervention.query.filter(
                    Intervention.created_by == inst.id,
                    Intervention.outcome == 'open',
                    Intervention.follow_up_at <= now,
                ).count()

            lines = [
                f'• Sessions run this week: {sessions_run}',
                f'• Final submissions: {finals} · Grades saved: {graded}',
                f'• Plagiarism flags: {flags}',
                f'• Students below the at-risk line: {at_risk}',
            ]
            if open_followups:
                lines.append(f'• ⏰ {open_followups} intervention follow-up(s) are due — check Attention Needed.')

            db.session.add(Notification(
                user_id=inst.id,
                type='session_reminder',
                title='Your weekly teaching digest',
                message='\n'.join(lines),
            ))
            sent += 1
        db.session.commit()
        if sent:
            scheduler.app.logger.info('[jobs] weekly digest sent to %d instructors', sent)


def _query_experiments(inst):
    from app.models.experiment import Experiment
    return Experiment.query.filter_by(institution_id=inst.institution_id, instructor_id=inst.id).all()


def _student_ids_of(inst):
    from app.models.academic import SectionSubject, SectionStudent
    my_ss = SectionSubject.query.filter_by(
        institution_id=inst.institution_id, instructor_id=inst.id).all()
    if not my_ss:
        return []
    rows = SectionStudent.query.filter(
        SectionStudent.section_id.in_([s.section_id for s in my_ss])).all()
    return list({r.student_id for r in rows})


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


def _dispatch_scheduled_announcements():
    """
    P5 — send every ScheduledAnnouncement whose send_at has arrived.
    Reuses the exact same send core as the immediate /announcements/targeted
    endpoint (targeting, fan-out, socket push, audit) by passing the stored
    institution/actor explicitly — no request context exists in the scheduler.
    A failing row is marked 'failed' (visible in the admin UI) instead of
    silently retry-forever.
    """
    with scheduler.app.app_context():
        from datetime import datetime as _dt
        from app.extensions import db
        from app.models.scheduled_announcement import ScheduledAnnouncement
        from app.institution.routes import _send_targeted_announcement

        due = (ScheduledAnnouncement.query
               .filter_by(status='pending')
               .filter(ScheduledAnnouncement.send_at <= _dt.utcnow())
               .order_by(ScheduledAnnouncement.send_at.asc())
               .limit(50).all())
        if not due:
            return

        for row in due:
            try:
                payload, status = _send_targeted_announcement(
                    row.payload(),
                    institution_id=row.institution_id,
                    actor_id=row.created_by,
                )
                if status < 300:
                    row.status = 'sent'
                    row.sent_at = _dt.utcnow()
                    row.recipients_sent = payload.get('sent_to', 0)
                else:
                    row.status = 'failed'
                    scheduler.app.logger.warning(
                        '[jobs] scheduled announcement %s failed: %s',
                        row.id, payload.get('error'))
            except Exception as exc:
                db.session.rollback()
                row.status = 'failed'
                scheduler.app.logger.warning(
                    '[jobs] scheduled announcement %s raised: %s', row.id, exc)
        db.session.commit()


def _run_nightly_metric_snapshots():
    """Nightly metric and KPI snapshots for all institutions."""
    with scheduler.app.app_context():
        from app.analytics.snapshots import run_all_institution_daily_snapshots
        try:
            res = run_all_institution_daily_snapshots()
            scheduler.app.logger.info('[jobs] Nightly analytics snapshots completed: %s', res)
        except Exception as exc:
            scheduler.app.logger.warning('[jobs] Nightly analytics snapshots failed: %s', exc)


compute_all_snapshots = _run_nightly_metric_snapshots
