"""
Socket.io event handlers for live session real-time communication.
All events here — zero ML logic. Pure routing and relay.
"""
from flask import g
from flask_socketio import join_room, leave_room, emit
from flask_jwt_extended import decode_token

from app.extensions import socketio, db
from app.models.session import SessionAttendance, LabSession
from app.models.submission import CodeVersion
from datetime import datetime
import json


def get_user_from_token(token):
    """Extract user claims from JWT token passed in Socket.io auth"""
    try:
        decoded = decode_token(token)
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

    if role in ('instructor', 'institution_admin'):
        # Instructor joins instructor room
        join_room(f"session_{session_id}_instructor")
        emit('joined', {'room': 'instructor', 'session_id': session_id})
    else:
        # Student joins student room
        join_room(f"session_{session_id}_students")
        join_room(f"student_{user['user_id']}")  # private room for targeted messages

        # Update attendance record
        attendance = SessionAttendance.query.filter_by(
            session_id=session_id, student_id=user['user_id']
        ).first()
        if attendance:
            if not attendance.joined_at:
                attendance.joined_at = datetime.utcnow()
            else:
                attendance.reconnect_count += 1
            db.session.commit()

        # Notify instructor
        emit('student_joined', {
            'student_id': user['user_id'],
            'full_name': user['full_name'],
            'timestamp': datetime.utcnow().isoformat(),
        }, room=f"session_{session_id}_instructor")

        emit('joined', {'room': 'student', 'session_id': session_id})


@socketio.on('leave_session')
def handle_leave_session(data):
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user:
        return

    session_id = data.get('session_id')

    if user['role'] == 'student':
        leave_room(f"session_{session_id}_students")
        # Notify instructor
        emit('student_left', {
            'student_id': user['user_id'],
            'timestamp': datetime.utcnow().isoformat(),
        }, room=f"session_{session_id}_instructor")


# ── Checkpoint Events ──────────────────────────────────────────────────────────

@socketio.on('checkpoint_passed')
def handle_checkpoint(data):
    """Student passed a checkpoint — relay to instructor dashboard"""
    from flask import session as sock_session
    user = sock_session.get('user')
    if not user:
        return

    session_id      = data.get('session_id')
    checkpoint_num  = data.get('checkpoint_number')
    test_cases_done = data.get('test_cases_passed', 0)

    emit('student_checkpoint_update', {
        'student_id':       user['user_id'],
        'full_name':        user['full_name'],
        'checkpoint_number': checkpoint_num,
        'test_cases_passed': test_cases_done,
        'timestamp':        datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_instructor")


# ── Focus Score Events ─────────────────────────────────────────────────────────

@socketio.on('focus_score_update')
def handle_focus_update(data):
    """Focus score computed by ML microservice — relay to instructor"""
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
    """Instructor sends message to all students"""
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
    """Instructor sends private message to one student"""
    session_id = data.get('session_id')
    student_id = data.get('student_id')
    message    = data.get('message')

    emit('private_message', {
        'message':   message,
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"student_{student_id}")


@socketio.on('session_extended')
def handle_session_extended(data):
    session_id     = data.get('session_id')
    added_minutes  = data.get('added_minutes')
    emit('session_time_extended', {
        'added_minutes': added_minutes,
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_students")


@socketio.on('force_submit')
def handle_force_submit(data):
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

    session_id  = data.get('session_id')
    switch_count = data.get('count', 1)

    emit('proctor_alert', {
        'type':        'tab_switch',
        'student_id':  user['user_id'],
        'full_name':   user.get('full_name', ''),
        'detail':      f"Tab switched {switch_count} time(s)",
        'count':       switch_count,
        'severity':    'high' if switch_count >= 3 else 'medium',
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

    # Persist to DB
    try:
        from app.models.knowledge import FocusScore as FocusScoreModel
        fs = FocusScoreModel(
            student_id=student_id,
            session_id=session_id,
            focus_score=round(focus_score, 1),
            signals=signals,
        )
        db.session.add(fs)
        db.session.commit()
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
        'focus_score': round(focus_score, 1),
        'signals':     signals,
        'alerts':      alerts,
        'timestamp':   datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_instructor")
