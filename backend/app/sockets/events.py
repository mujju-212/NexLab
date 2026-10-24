"""
Socket.io event handlers for live session real-time communication.
All events here — zero ML logic. Pure routing and relay.
"""
from flask import g, current_app
from flask_socketio import join_room, leave_room, emit
from flask_jwt_extended import decode_token

from app.extensions import socketio, db
from app.models.session import SessionAttendance, LabSession
from app.models.submission import CodeVersion
from datetime import datetime
import json
import logging

_log = logging.getLogger(__name__)

# Cache of latest screenshots: (session_id, student_id) -> {'full_name': str, 'frame': str, 'timestamp': str}
_LATEST_SCREENSHOTS = {}


def _persist_proctor_event(institution_id: str, session_id: str, student_id: str,
                            event_type: str, payload: dict, severity: str) -> None:
    """Write one ProctorEvent row.  Fail-open — logging failure never blocks the relay."""
    try:
        from app.models.proctor_event import ProctorEvent
        if not institution_id:
            if session_id:
                from app.models.session import LabSession
                sess = LabSession.query.get(session_id)
                if sess and sess.institution_id:
                    institution_id = sess.institution_id
            if not institution_id and student_id:
                from app.models.user import User
                u = User.query.get(student_id)
                if u and u.institution_id:
                    institution_id = u.institution_id

        if severity in ('high', 'critical') and not payload.get('evidence_screenshot'):
            cached_shot = _LATEST_SCREENSHOTS.get((session_id, student_id))
            if cached_shot and cached_shot.get('frame'):
                payload['evidence_screenshot'] = cached_shot['frame']

        row = ProctorEvent(
            institution_id = institution_id,
            session_id     = session_id,
            student_id     = student_id,
            event_type     = event_type,
            payload        = payload,
            severity       = severity,
        )
        db.session.add(row)
        db.session.commit()
    except Exception as exc:
        _log.warning('[sockets] proctor_event persist failed (non-fatal): %s', exc)
        try:
            db.session.rollback()
        except Exception:
            pass


def _get_session_or_none(session_id):
    """
    Resolve a LabSession for socket handlers, enforcing tenancy:
    the session must exist, belong to the caller's institution.
    """
    if not session_id:
        return None
    from flask import session as sock_session
    user = sock_session.get('user') or {}
    try:
        sess = LabSession.query.get(session_id)
        if not sess:
            return None
        inst_id = user.get('institution_id')
        if not inst_id and user.get('user_id'):
            from app.models.user import User
            u = User.query.get(user['user_id'])
            if u:
                inst_id = u.institution_id
                user['institution_id'] = inst_id
        if inst_id and sess.institution_id and sess.institution_id != inst_id:
            return None
        return sess
    except Exception:
        return None


def _cap_elapsed(raw) -> int:
    """
    Heartbeat elapsed_seconds sanity cap. A well-behaved client sends ~30s;
    anything above 90s is treated as clock skew / tampering and clamped so
    presence time can't be inflated by a modified client.
    """
    try:
        val = int(raw)
    except (TypeError, ValueError):
        return 0
    return max(0, min(val, 90))


def get_user_from_token(token):
    """Extract user claims from JWT token passed in Socket.io auth"""
    try:
        decoded = decode_token(token)
        # Honor admin force-logout: reject tokens issued before force_logout_at
        from app.auth.utils import _is_force_logged_out
        if _is_force_logged_out(decoded):
            return None
        return {
            'user_id': decoded['sub'],
            'institution_id': decoded.get('institution_id'),
            'role': decoded.get('role'),
            'full_name': decoded.get('full_name'),
        }
    except Exception:
        return None


# ── Connection Events ──────────────────────────────────────────────────────────

@socketio.on('connect')
def handle_connect(auth):
    token = auth.get('token') if auth else None
    if not token:
        return False   # reject connection

    user = get_user_from_token(token)
    if not user:
        return False

    # Store user info in session context (flask_socketio uses flask session)
    from flask import session as sock_session
    sock_session['user'] = user

    # Automatically join personal and role rooms for real-time routing
    uid = user.get('user_id')
    if uid:
        join_room(f"user_{uid}")
        if user.get('role') == 'student':
            join_room(f"student_{uid}")
    role = user.get('role')
    if role:
        join_room(f"role_{role}")
    inst_id = user.get('institution_id')
    if inst_id:
        join_room(f"institution_{inst_id}")


@socketio.on('disconnect')
def handle_disconnect():
    # Handled per-room via leave events or timeout detection
    pass


# ── Session Room Management ────────────────────────────────────────────────────

@socketio.on('join_session')
def handle_join_session(data):
    """Student or instructor joins a session room"""
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user:
        return

    session_id = data.get('session_id')
    role = user['role']

    # Tenancy + liveness: reject sessions that don't exist, aren't ours, or aren't live.
    sess = _get_session_or_none(session_id)
    if not sess:
        emit('session_error', {'error': 'Session not found, not active, or not in your institution'})
        return

    if role in ('instructor', 'institution_admin'):
        # Instructor joins instructor room
        join_room(f"session_{session_id}_instructor")
        emit('joined', {'room': 'instructor', 'session_id': session_id})
        # Hydrate instructor with latest screenshots cached for this session
        for (sid, stid), shot in list(_LATEST_SCREENSHOTS.items()):
            if sid == session_id:
                emit('student_screenshot', {
                    'student_id': stid,
                    'full_name':  shot.get('full_name', ''),
                    'frame':      shot.get('frame', ''),
                    'timestamp':  shot.get('timestamp', ''),
                })
    else:
        # Enrollment check: only students enrolled in the session's section
        # may join (and get attendance). Prevents a student from another
        # section (or a shared login) silently joining someone else's class.
        from app.models.academic import SectionSubject, SectionStudent
        ss = SectionSubject.query.get(sess.section_subject_id)
        enrolled = ss and SectionStudent.query.filter_by(
            section_id=ss.section_id, student_id=user['user_id']).first()
        if not enrolled:
            emit('session_error', {'error': 'You are not enrolled in this session.'})
            return

        # Student joins student room
        join_room(f"session_{session_id}_students")
        join_room(f"student_{user['user_id']}")  # private room for targeted messages

        # Update attendance record — create if missing (e.g. student added after session started)
        attendance = SessionAttendance.query.filter_by(
            session_id=session_id, student_id=user['user_id']
        ).first()
        if not attendance:
            attendance = SessionAttendance(
                session_id=session_id,
                student_id=user['user_id'],
                status='present',
                total_time_seconds=0,
                reconnect_count=0,
            )
            db.session.add(attendance)
        else:
            if attendance.status == 'absent':
                attendance.status = 'present'
        if not attendance.joined_at:
            attendance.joined_at = datetime.utcnow()
        else:
            attendance.reconnect_count = (attendance.reconnect_count or 0) + 1
        db.session.commit()

        # Notify instructor
        emit('student_joined', {
            'student_id': user['user_id'],
            'full_name': user['full_name'],
            'status': attendance.status,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=f"session_{session_id}_instructor")

        emit('joined', {'room': 'student', 'session_id': session_id})

        # ── State snapshot ────────────────────────────────────────────────
        # Sockets are fire-and-forget: anything the instructor pushed while this
        # student was connecting, reconnecting or on another tab was lost with no
        # trace. Sending the whole current state on join means a student is
        # always correct on arrival, whatever they missed.
        try:
            from app.instructor.conductor import MODE_RULES
            from app.models.conductor import ChatMessage as _Chat
            from app.models.proctor_event import ProctorEvent as _PE

            mode = sess.current_mode or 'briefing'
            rules = MODE_RULES.get(mode, MODE_RULES.get('working'))

            # Has the instructor force-submitted this student since they joined?
            fs = (_PE.query
                  .filter(_PE.session_id == session_id,
                          _PE.event_type == 'force_submit',
                          _PE.student_id == user['user_id'])
                  .order_by(_PE.recorded_at.desc())
                  .first())
            force_payload = None
            if fs and fs.payload:
                force_payload = {
                    'reason':    fs.payload.get('reason') or 'Session ended by instructor',
                    'timestamp': fs.recorded_at.isoformat() if fs.recorded_at else None,
                }

            msgs = (_Chat.query.filter_by(session_id=session_id)
                    .order_by(_Chat.at.desc()).limit(25).all())[::-1]
            chat = []
            for m in msgs:
                d = m.to_dict()
                try:
                    from app.models.user import User as _U
                    u = _U.query.get(m.from_id) if m.from_id else None
                    d['from_name'] = u.full_name if u else 'Instructor'
                except Exception:
                    d['from_name'] = 'Instructor'
                chat.append(d)

            from app.instructor.conductor import _resolve_policy
            emit('session_state', {
                'session_id':        session_id,
                'status':            sess.status,
                'ended':             sess.status == 'ended',
                'mode':              mode,
                'rules':             rules,
                'proctor_policy':    _resolve_policy(sess),
                'focus_ml_enabled':  bool(sess.focus_ml_enabled),
                'lockdown_enabled':  bool(sess.lockdown_enabled),
                'force_submit':      force_payload,
                'chat':              chat,
            })
        except Exception as exc:   # never block the join itself
            print(f'[sock] session_state snapshot failed: {exc}', flush=True)
            emit('session_state', {'session_id': session_id, 'status': sess.status,
                                   'ended': sess.status == 'ended'})


@socketio.on('leave_session')
def handle_leave_session(data):
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user:
        return

    session_id = data.get('session_id')

    if user['role'] == 'student':
        leave_room(f"session_{session_id}_students")
        try:
            if session_id:
                attendance = SessionAttendance.query.filter_by(
                    session_id=session_id, student_id=user['user_id']
                ).first()
                if attendance:
                    attendance.left_at = datetime.utcnow()
                    db.session.commit()
        except Exception:
            try:
                db.session.rollback()
            except Exception:
                pass

        # Notify instructor
        emit('student_left', {
            'student_id': user['user_id'],
            'full_name': user.get('full_name', ''),
            'timestamp': datetime.utcnow().isoformat(),
        }, room=f"session_{session_id}_instructor")



@socketio.on('heartbeat')
def handle_heartbeat(data):
    """Student sends a heartbeat every 30s while in the live-lab page.

    Accumulates total_time_seconds on the attendance row so that
    _finalize_attendance can correctly grade presence (requires >= 1800s).
    Frontend sends: {session_id, elapsed_seconds}  (elapsed since last heartbeat)
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] != 'student':
        return

    session_id    = data.get('session_id')
    elapsed       = _cap_elapsed(data.get('elapsed_seconds', 30))

    # Tenancy: only accumulate time on a live session in the caller's institution.
    if not _get_session_or_none(session_id):
        return

    attendance = SessionAttendance.query.filter_by(
        session_id=session_id, student_id=user['user_id']
    ).first()
    if attendance:
        attendance.total_time_seconds = (attendance.total_time_seconds or 0) + elapsed
        db.session.commit()


# ── Checkpoint Events ──────────────────────────────────────────────────────────

# ── Poll voting (T2-10) ────────────────────────────────────────────────────────

@socketio.on('poll_vote')
def handle_poll_vote(data):
    """Student votes on an open poll; server tallies and relays to both rooms."""
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] != 'student':
        return

    from app.models.enhancements import SessionPoll
    poll_id = data.get('poll_id')
    option_idx = data.get('option_idx')
    poll = SessionPoll.query.get(poll_id)
    if not poll or not poll.is_open:
        return

    sess = _get_session_or_none(poll.session_id)
    if not sess:
        return

    try:
        option_idx = int(option_idx)
    except (TypeError, ValueError):
        return
    if option_idx < 0 or option_idx >= len(poll.options or []):
        return

    responses = dict(poll.responses or {})
    responses[user['user_id']] = option_idx
    poll.responses = responses
    db.session.commit()

    results = poll.results()
    payload = {'poll_id': poll.id, 'results': results,
               'responses_count': len(responses)}
    emit('poll_update', payload, room=f"session_{poll.session_id}_instructor")
    emit('my_poll_vote', {'poll_id': poll.id, 'option_idx': option_idx})


# ── Checkpoint Events ──────────────────────────────────────────────────────────

@socketio.on('checkpoint_passed')
def handle_checkpoint(data):
    """Student passed a checkpoint — persist to CheckpointProgress and relay to instructor"""
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user:
        return

    session_id      = data.get('session_id')
    checkpoint_num  = data.get('checkpoint_number')
    test_cases_done = data.get('test_cases_passed', 0)
    checkpoint_id   = data.get('checkpoint_id')   # optional — direct CP id

    # Resolve checkpoint_id from checkpoint_number if frontend omitted checkpoint_id
    if not checkpoint_id and session_id and checkpoint_num is not None:
        try:
            from app.models.conductor import Checkpoint
            sess_obj = LabSession.query.get(session_id)
            if sess_obj and sess_obj.experiment_id:
                cp_row = Checkpoint.query.filter_by(
                    experiment_id=sess_obj.experiment_id,
                    order=int(checkpoint_num),
                ).first()
                if not cp_row:
                    cps_all = Checkpoint.query.filter_by(experiment_id=sess_obj.experiment_id).order_by(Checkpoint.order.asc()).all()
                    idx_cp = max(0, int(checkpoint_num) - 1)
                    if idx_cp < len(cps_all):
                        cp_row = cps_all[idx_cp]
                if cp_row:
                    checkpoint_id = cp_row.id
        except Exception:
            pass

    # Persist to CheckpointProgress (D-S1 Hybrid model)
    if checkpoint_id and session_id:
        try:
            from app.models.conductor import CheckpointProgress
            cp = CheckpointProgress.query.filter_by(
                session_id=session_id,
                student_id=user['user_id'],
                checkpoint_id=checkpoint_id,
            ).first()
            if not cp:
                cp = CheckpointProgress(
                    session_id=session_id,
                    student_id=user['user_id'],
                    checkpoint_id=checkpoint_id,
                )
                db.session.add(cp)
            # Only upgrade: pending -> claimed (don't downgrade verified)
            if cp.status in ('pending', 'claimed'):
                cp.status = 'claimed'
                cp.last_signal_at = datetime.utcnow()
                cp.attempts = (cp.attempts or 0) + 1
            db.session.commit()
        except Exception:
            db.session.rollback()

    emit('student_checkpoint_update', {
        'student_id':       user['user_id'],
        'full_name':        user.get('full_name', ''),
        'checkpoint_number': checkpoint_num,
        'test_cases_passed': test_cases_done,
        'checkpoint_id':    checkpoint_id,
        'timestamp':        datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_instructor")


# ── Focus Score Events ─────────────────────────────────────────────────────────

@socketio.on('focus_score_update')
def handle_focus_update(data):
    """Focus score computed by ML microservice — relay to instructor.

    Auth: instructor/admin only. A student must never be able to inject
    focus scores or integrity alerts for themselves or classmates — the
    student-side path is `behavioral_signals` (server-scored) instead.
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] not in ('instructor', 'institution_admin'):
        return

    session_id  = data.get('session_id')
    student_id  = data.get('student_id')
    focus_score = data.get('focus_score')

    # Check alert thresholds and add flags
    alerts = []
    signals = data.get('signals', {})
    if signals.get('tab_switches', 0) >= 3:
        alerts.append('tab_switch_excessive')
    if signals.get('face_present_pct', 1.0) < 0.3:
        alerts.append('face_not_detected')
    if signals.get('large_paste_detected', False):
        alerts.append('large_paste')
    if focus_score is not None and focus_score < 40:
        alerts.append('low_focus_score')

    emit('student_focus_update', {
        'student_id':  student_id,
        'focus_score': focus_score,
        'alerts':      alerts,
        'timestamp':   datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_instructor")


# ── Instructor Control Events ──────────────────────────────────────────────────

@socketio.on('instructor_broadcast')
def handle_broadcast(data):
    """Instructor sends message to all students. Auth: instructor/admin only."""
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] not in ('instructor', 'institution_admin'):
        return

    session_id = data.get('session_id')
    message    = data.get('message')

    emit('instructor_message', {
        'message':   message,
        'from':      user['full_name'],
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_students")


@socketio.on('message_student')
def handle_private_message(data):
    """Instructor sends private message to one student.

    Auth: instructor/admin only — a student must not be able to spoof
    'instructor' DMs into another student's private room.
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] not in ('instructor', 'institution_admin'):
        return

    session_id = data.get('session_id')
    student_id = data.get('student_id')
    message    = data.get('message')

    emit('private_message', {
        'message':   message,
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"student_{student_id}")


@socketio.on('session_extended')
def handle_session_extended(data):
    """Instructor extends session time. Auth: instructor/admin only."""
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] not in ('instructor', 'institution_admin'):
        return

    session_id     = data.get('session_id')
    added_minutes  = data.get('added_minutes')
    emit('session_time_extended', {
        'added_minutes': added_minutes,
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_students")


@socketio.on('force_submit')
def handle_force_submit(data):
    """Force one student to submit. Auth: instructor/admin only — this is a
    destructive classroom action a student must never be able to trigger."""
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] not in ('instructor', 'institution_admin'):
        return

    session_id = data.get('session_id')
    student_id = data.get('student_id')
    emit('force_submission', {
        'reason':    data.get('reason', 'Session ended by instructor'),
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"student_{student_id}")


# ── Proctoring Events (from frontend JS) ──────────────────────────────────────

@socketio.on('tab_switch')
def handle_tab_switch(data):
    """Student switched tab — Page Visibility API detected it.
    Frontend sends: {session_id, count}
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] != 'student':
        return

    session_id   = data.get('session_id')
    switch_count = data.get('count', 1)
    severity     = 'high' if switch_count >= 3 else 'medium'

    # Tenancy: a forged/foreign session_id must not poison integrity analytics.
    if not _get_session_or_none(session_id):
        return

    # Persist event for analytics
    _persist_proctor_event(
        institution_id = user.get('institution_id', ''),
        session_id     = session_id,
        student_id     = user['user_id'],
        event_type     = 'tab_switch',
        payload        = {'count': switch_count},
        severity       = severity,
    )

    emit('proctor_alert', {
        'type':        'tab_switch',
        'student_id':  user['user_id'],
        'full_name':   user.get('full_name', ''),
        'detail':      f"Tab switched {switch_count} time(s)",
        'count':       switch_count,
        'severity':    severity,
        'timestamp':   datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_instructor")


@socketio.on('fullscreen_exit')
def handle_fullscreen_exit(data):
    """Student exited fullscreen during lockdown mode.
    Frontend sends: {session_id}
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] != 'student':
        return

    session_id = data.get('session_id')

    # Tenancy: a forged/foreign session_id must not poison integrity analytics.
    if not _get_session_or_none(session_id):
        return

    # Persist event for analytics
    _persist_proctor_event(
        institution_id = user.get('institution_id', ''),
        session_id     = session_id,
        student_id     = user['user_id'],
        event_type     = 'fullscreen_exit',
        payload        = {},
        severity       = 'high',
    )

    emit('proctor_alert', {
        'type':       'fullscreen_exit',
        'student_id': user['user_id'],
        'full_name':  user.get('full_name', ''),
        'detail':     'Student exited fullscreen',
        'severity':   'high',
        'timestamp':  datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_instructor")

    # Warn student to return to fullscreen
    emit('lockdown_warning', {
        'message':   'Please return to fullscreen. Repeated violations will be flagged.',
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"student_{user['user_id']}")


@socketio.on('instructor_request_screenshare')
def handle_request_screenshare(data):
    """Instructor requests an on-demand live screen-share from a student.

    D14 — consent required: the request is forwarded to the student's private
    room, the student client prompts [Allow]/[Decline], and the student's reply
    is relayed back to the instructor (screen-share_stopped / screenshot grid
    remain the fallback if declined).
    Frontend sends: {session_id, student_id}
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] not in ('instructor', 'institution_admin'):
        return

    session_id = data.get('session_id')
    student_id = data.get('student_id')
    if not student_id:
        return

    emit('screenshare_request', {
        'session_id': session_id,
        'instructor_id': user['user_id'],
        'instructor_name': user.get('full_name', 'Instructor'),
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"student_{student_id}")


@socketio.on('screenshare_response')
def handle_screenshare_response(data):
    """Student's consent reply to an instructor screen-share request.
    Frontend sends: {session_id, accepted: bool}
    Relayed to the instructor room — the instructor client then starts the
    LiveKit screen-share session (accepted) or stays on the screenshot grid.
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] != 'student':
        return

    session_id = data.get('session_id')
    accepted = bool(data.get('accepted'))

    emit('screenshare_response_relay', {
        'session_id': session_id,
        'student_id': user['user_id'],
        'full_name': user.get('full_name', ''),
        'accepted': accepted,
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_instructor")


@socketio.on('screen_share_stopped')
def handle_screen_share_stopped(data):
    """Student stopped screen sharing during proctored session.
    Frontend: Jitsi IFrame API 'screenSharingStatusChanged' event.
    Sends: {session_id}
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] != 'student':
        return

    session_id = data.get('session_id')

    # Tenancy: a forged/foreign session_id must not poison integrity analytics.
    if not _get_session_or_none(session_id):
        return

    # Persist event for analytics
    _persist_proctor_event(
        institution_id = user.get('institution_id', ''),
        session_id     = session_id,
        student_id     = user['user_id'],
        event_type     = 'screen_share_stop',
        payload        = {},
        severity       = 'high',
    )

    emit('proctor_alert', {
        'type':       'screen_share_stopped',
        'student_id': user['user_id'],
        'full_name':  user.get('full_name', ''),
        'detail':     'Student stopped sharing screen',
        'severity':   'high',
        'timestamp':  datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_instructor")

    # Request student to reshare
    emit('reshare_screen_request', {
        'message':   'Please share your screen to continue the proctored session.',
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"student_{user['user_id']}")


@socketio.on('screenshot_frame')
def handle_screenshot_frame(data):
    """Student sends a periodic JPEG screenshot for instructor monitoring grid.

    Frontend sends every ~30 s:
      { session_id: str, frame: '<base64 jpeg data-url>' }

    The frame is forwarded directly to the instructor socket room — it is never
    persisted to the database.  The instructor page stores the latest frame per
    student in React state and renders a thumbnail grid.
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] != 'student':
        return

    session_id = data.get('session_id')
    frame      = data.get('frame', '')

    ts = datetime.utcnow().isoformat()
    _LATEST_SCREENSHOTS[(session_id, user['user_id'])] = {
        'full_name': user.get('full_name', ''),
        'frame':     frame,
        'timestamp': ts,
    }

    # If any recent high-severity ProctorEvent occurred within the last 60s, attach screenshot evidence
    if frame:
        try:
            from app.models.proctor_event import ProctorEvent
            from datetime import timedelta
            recent_events = ProctorEvent.query.filter(
                ProctorEvent.session_id == session_id,
                ProctorEvent.student_id == user['user_id'],
                ProctorEvent.recorded_at >= datetime.utcnow() - timedelta(seconds=60),
                ProctorEvent.severity.in_(['high', 'critical']),
            ).all()
            for pe in recent_events:
                p_load = dict(pe.payload or {})
                if not p_load.get('evidence_screenshot'):
                    p_load['evidence_screenshot'] = frame
                    pe.payload = p_load
            db.session.commit()
        except Exception:
            pass

    emit('student_screenshot', {
        'student_id': user['user_id'],
        'full_name':  user.get('full_name', ''),
        'frame':      frame,
        'timestamp':  ts,
    }, room=f"session_{session_id}_instructor")


@socketio.on('lockdown_violation')
def handle_lockdown_violation(data):
    """Student tried a blocked action (copy/paste/right-click/dev-tools).
    Frontend sends: {session_id, action}  e.g. action='copy', 'paste', 'devtools'
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] != 'student':
        return

    session_id = data.get('session_id')
    action     = data.get('action', 'unknown')

    # Tenancy: a forged/foreign session_id must not poison integrity analytics.
    if not _get_session_or_none(session_id):
        return

    # Persist event for analytics
    _persist_proctor_event(
        institution_id = user.get('institution_id', ''),
        session_id     = session_id,
        student_id     = user['user_id'],
        event_type     = 'lockdown_violation',
        payload        = {'action': action},
        severity       = 'medium',
    )

    emit('proctor_alert', {
        'type':       'lockdown_violation',
        'student_id': user['user_id'],
        'full_name':  user.get('full_name', ''),
        'detail':     f"Blocked action attempted: {action}",
        'severity':   'medium',
        'timestamp':  datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_instructor")


@socketio.on('behavioral_signals')
def handle_behavioral_signals(data):
    """Student frontend sends 6 behavioral signals every 30s.
    Server calls ML focus endpoint and stores + relays the score.

    Frontend sends:
    {
        session_id,
        tab_switches_per_min,
        idle_seconds,
        typing_speed_wpm,
        backspace_ratio,
        copy_paste_count,
        window_focus_ratio
    }
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or user['role'] != 'student':
        return

    session_id = data.get('session_id')
    student_id = user['user_id']

    # The conductor's "Focus ML monitoring" switch must actually switch the
    # pipeline off — otherwise the instructor sees focus scores for a data stream
    # they deliberately turned off, and the student is scored while unmonitored.
    sess_for_focus = _get_session_or_none(session_id)
    if sess_for_focus is not None and not sess_for_focus.focus_ml_enabled:
        return

    # Auto-resolve session_id if missing
    if not session_id:
        try:
            from app.models.session import SessionAttendance
            att = SessionAttendance.query.filter_by(student_id=student_id, left_at=None).order_by(SessionAttendance.joined_at.desc()).first()
            if not att:
                att = SessionAttendance.query.filter_by(student_id=student_id).order_by(SessionAttendance.joined_at.desc()).first()
            if att:
                session_id = att.session_id
            else:
                from app.models.academic import SectionStudent, SectionSubject
                from app.models.session import LabSession
                my_secs = [s.section_id for s in SectionStudent.query.filter_by(student_id=student_id).all()]
                if my_secs:
                    active_s = LabSession.query.join(
                        SectionSubject, SectionSubject.id == LabSession.section_subject_id
                    ).filter(
                        SectionSubject.section_id.in_(my_secs),
                        LabSession.status == 'active'
                    ).order_by(LabSession.started_at.desc()).first()
                    if active_s:
                        session_id = active_s.id
        except Exception:
            pass

    signals = {
        'tab_switches_per_min': data.get('tab_switches_per_min', 0),
        'idle_seconds':         data.get('idle_seconds', 0),
        'typing_speed_wpm':     data.get('typing_speed_wpm', 0),
        'backspace_ratio':      data.get('backspace_ratio', 0),
        'copy_paste_count':     data.get('copy_paste_count', 0),
        'window_focus_ratio':   data.get('window_focus_ratio', 1.0),
    }

    # Score via ML model
    try:
        from app.ml.focus_model import predict_focus_score
        focus_score = predict_focus_score(signals)
    except Exception:
        # Rule-based fallback
        focus_score = max(0, min(100,
            100
            - signals['tab_switches_per_min'] * 15
            - (signals['idle_seconds'] / 300) * 30
            - signals['copy_paste_count'] * 5
            + signals['window_focus_ratio'] * 20
        ))

    # Persist to DB.
    # NOTE: predict_focus_score() returns a numpy.float64. psycopg2 renders that
    # as `np.float64(...)`, which Postgres rejects with
    #   InvalidSchemaName: schema "np" does not exist
    # and the old bare `except: rollback()` hid it, so NO focus score was ever
    # stored — the live number appeared on screen but the sparkline, the
    # spark_grid and the ranking engagement score all stayed empty. Coerce to a
    # builtin float and log failures instead of swallowing them.
    if session_id:
        try:
            from app.models.knowledge import FocusScore as FocusScoreModel
            fs = FocusScoreModel(
                student_id=student_id,
                session_id=session_id,
                focus_score=round(float(focus_score), 1),
                signals=signals,
            )
            db.session.add(fs)
            db.session.commit()
        except Exception as exc:
            current_app.logger.warning(
                'focus score not persisted (student=%s session=%s): %s',
                student_id, session_id, exc)
            try:
                db.session.rollback()
            except Exception:
                pass

    # Build alerts list
    alerts = []
    if signals['tab_switches_per_min'] >= 2:
        alerts.append('tab_switch_high')
    if signals['idle_seconds'] > 120:
        alerts.append('idle_detected')
    if signals['copy_paste_count'] >= 3:
        alerts.append('copy_paste_high')
    if signals['window_focus_ratio'] < 0.5:
        alerts.append('window_focus_low')
    if focus_score < 40:
        alerts.append('low_focus_score')

    # Relay to instructor dashboard
    emit('student_focus_update', {
        'student_id':  student_id,
        'full_name':   user.get('full_name', ''),
        'focus_score': round(float(focus_score), 1),
        'signals':     signals,
        'alerts':      alerts,
        'timestamp':   datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_instructor")


# ── AI Harness Real-Time Streaming Socket Handler ─────────────────────────────

@socketio.on('ai:message')
def handle_ai_harness_message(data):
    """
    Real-time Socket.IO entrypoint for the Unified AI Harness (`ai:message`).
    Emits `ai:tool_start`, `ai:tool_result`, `ai:confirm_action`, `ai:token`, and `ai:done`
    to the caller's personal room (`user_<user_id>`).
    """
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user or not user.get('user_id'):
        emit('ai:error', {'error': 'Authentication required'})
        return

    prompt = ((data or {}).get('prompt') or '').strip()
    if not prompt:
        emit('ai:error', {'error': 'prompt is required'})
        return

    uid = user['user_id']
    iid = user.get('institution_id')
    role = user.get('role') or 'student'
    mode = 'chat' if role in ('student', 'free_user') else ((data or {}).get('mode') or 'chat')
    session_id = (data or {}).get('session_id')
    page_context = (data or {}).get('page_context') if isinstance((data or {}).get('page_context'), dict) else {}

    g.user_id = uid
    g.institution_id = iid
    g.role = role

    try:
        from app.ai.harness import run_harness_turn
        res = run_harness_turn(
            prompt=prompt,
            institution_id=iid,
            user_id=uid,
            role=role,
            mode=mode,
            page_context=page_context,
            session_id=session_id,
        )
        emit('ai:response', res)
    except Exception as exc:
        _log.warning('[sockets.ai] ai:message error: %s', exc)
        emit('ai:error', {'error': str(exc)})
