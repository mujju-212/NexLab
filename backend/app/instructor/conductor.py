"""
Live Lab Conductor — backend for the flagship instructor page.

Provides the unified live-state endpoint plus every control action that
persists and relays: session mode machine (D1), page/quiz launch (D-Push,
D-QuizFetch), granular proctor override (D-Proctor), SPARK checkpoint
overrides (D-S1/S4), live chat (D13), force-submit, broadcast, code
snapshots (D-S5) and grade finalization (D3).

Design contract (Part III):
  - LabSession.current_mode is the moment; LivePageState is the content.
  - All live control events persist (auditability) and relay over the
    session socket rooms.
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db, socketio
from app.models.session import LabSession, SessionAttendance
from app.models.experiment import Experiment, ContentPage, ContentModule
from app.models.conductor import (
    Checkpoint, CheckpointProgress, LivePageState, ProctorPolicy,
    SessionModeTransition, ChatMessage,
)
from app.models.submission import CodeAttempt, CodeVersion
from app.models.academic import SectionSubject, SectionStudent
from app.models.user import User
from datetime import datetime, timedelta
import uuid

conductor_bp = Blueprint('instructor_conductor', __name__)

# Mode -> capability rules relayed to students (D2)
MODE_RULES = {
    'briefing':    {'code': 'read_only', 'quiz': 'locked',     'submit': False, 'proctor': 'passive', 'label': 'Briefing'},
    'working':     {'code': 'active',    'quiz': 'locked',     'submit': True,  'proctor': 'full',    'label': 'Working'},
    'quiz_active': {'code': 'locked',    'quiz': 'active',     'submit': 'quiz', 'proctor': 'full',   'label': 'Quiz'},
    'paused':      {'code': 'frozen',    'quiz': 'frozen',     'submit': False, 'proctor': 'frozen',  'label': 'Paused'},
    'debrief':     {'code': 'read_only', 'quiz': 'locked',     'submit': False, 'proctor': 'passive', 'label': 'Debrief'},
    'ended':       {'code': 'read_only', 'quiz': 'locked',     'submit': False, 'proctor': 'off',     'label': 'Ended'},
}


def _require_my_session(session_id):
    """Fetch a session the current instructor teaches, or None."""
    sess = LabSession.query.get(session_id)
    if not sess:
        return None
    ss = SectionSubject.query.filter_by(
        id=sess.section_subject_id,
        instructor_id=g.user_id,
    ).first()
    if not ss:
        return None
    return sess


def _get_or_create_live_state(session_id, actor_id):
    lps = LivePageState.query.filter_by(session_id=session_id).first()
    if not lps:
        lps = LivePageState(session_id=session_id, updated_by=actor_id)
        db.session.add(lps)
        db.session.flush()
        sess = LabSession.query.get(session_id)
        sess.live_page_state_id = lps.id
    lps.updated_by = actor_id
    lps.updated_at = datetime.utcnow()
    return lps


def _resolve_policy(session, page_id=None):
    """Merge proctor policy: session override > experiment defaults > defaults."""
    # Session-level override
    pol = ProctorPolicy.query.filter_by(
        session_id=session.id, page_id=page_id).first()
    if pol:
        return pol.to_dict()
    # Experiment defaults (JSON on experiment)
    exp = Experiment.query.get(session.experiment_id) if session.experiment_id else None
    if exp and exp.proctor_defaults:
        return {
            'lockdown_fullscreen': exp.proctor_defaults.get('lockdown_fullscreen', True),
            'block_copy_paste':    exp.proctor_defaults.get('block_copy_paste', True),
            'block_tab_switch':    exp.proctor_defaults.get('block_tab_switch', True),
            'plagiarism_scan':     exp.proctor_defaults.get('plagiarism_scan', True),
            'focus_ml':            exp.proctor_defaults.get('focus_ml', False),
            'webcam_required':     exp.proctor_defaults.get('webcam_required', False),
        }
    # Defaults
    return {
        'lockdown_fullscreen': True,
        'block_copy_paste':    True,
        'block_tab_switch':    True,
        'plagiarism_scan':     True,
        'focus_ml':            False,
        'webcam_required':     False,
    }


# ══════════════════════════════════════════════════════════════════════════════
# GET unified live state
# ══════════════════════════════════════════════════════════════════════════════

@conductor_bp.route('/sessions/<session_id>/live', methods=['GET'])
@require_role('instructor', 'institution_admin')
def live_state(session_id):
    """Unified Conductor state: mode, live page state, experiment pages,
    checkpoints, SPARK grid (students x checkpoints), proctor policy,
    attendance and chat history."""
    sess = _require_my_session(session_id)
    if not sess:
        return jsonify({'error': 'Session not found or not assigned to you.'}), 404

    lps = LivePageState.query.filter_by(session_id=session_id).first()
    exp = Experiment.query.get(sess.experiment_id) if sess.experiment_id else None

    # ── Checkpoints + SPARK grid ───────────────────────────────────────────
    checkpoints = []
    spark_grid  = []
    if exp:
        cps = Checkpoint.query.filter_by(experiment_id=exp.id).order_by(Checkpoint.order).all()
        for cp in cps:
            checkpoints.append(cp.to_dict())

        # Students in this section
        section = SectionSubject.query.get(sess.section_subject_id)
        students = []
        if section:
            rows = SectionStudent.query.filter_by(section_id=section.section_id).all()
            student_ids = [r.student_id for r in rows]
            users_map = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()}
            students = [
                {'student_id': sid, 'full_name': users_map[sid].full_name,
                 'roll_number': users_map[sid].roll_number}
                for sid in student_ids if sid in users_map
            ]

        # Progress per (student, checkpoint)
        if students:
            cp_ids = [cp.id for cp in cps] if cps else []
            progress_rows = CheckpointProgress.query.filter(
                CheckpointProgress.session_id == session_id,
                CheckpointProgress.student_id.in_([s['student_id'] for s in students]),
                CheckpointProgress.checkpoint_id.in_(cp_ids),
            ).all() if cp_ids else []
            prog_by_key = {
                (p.student_id, p.checkpoint_id): p
                for p in progress_rows
            }

            # Latest focus per student — ONE batched query instead of N
            from app.models.knowledge import FocusScore
            focus_map = {}
            if students:
                sids = [s['student_id'] for s in students]
                focus_rows = (
                    FocusScore.query
                    .filter(
                        FocusScore.session_id == session_id,
                        FocusScore.student_id.in_(sids),
                    )
                    # newest row per student: window over recorded_at desc
                    .order_by(FocusScore.student_id, FocusScore.recorded_at.desc())
                    .distinct(FocusScore.student_id)
                    .with_entities(FocusScore.student_id, FocusScore.focus_score)
                    .all()
                )
                for sid, score in focus_rows:
                    focus_map[sid] = score

            # Proctor event counts per student
            from app.models.proctor_event import ProctorEvent
            pe_rows = ProctorEvent.query.filter(
                ProctorEvent.session_id == session_id,
                ProctorEvent.student_id.in_([s['student_id'] for s in students]),
            ).with_entities(ProctorEvent.student_id, ProctorEvent.event_type).all()
            from collections import defaultdict
            pe_counts = defaultdict(int)
            for sid, etype in pe_rows:
                pe_counts[sid] += 1

            # Attempts scoped to (session, experiment, student)
            attempt_rows = CodeAttempt.query.filter(
                CodeAttempt.session_id == session_id,
                CodeAttempt.experiment_id == exp.id,
                CodeAttempt.student_id.in_([s['student_id'] for s in students]),
            ).with_entities(CodeAttempt.student_id, CodeAttempt.id).all()
            attempt_counts = defaultdict(int)
            for sid, _aid in attempt_rows:
                attempt_counts[sid] += 1

            for st in students:
                sid = st['student_id']
                cell_states = {}
                verified_count = 0
                for cp in cps:
                    p = prog_by_key.get((sid, cp.id))
                    status = p.status if p else 'pending'
                    cell_states[cp.id] = status
                    if status in ('verified', 'manual_pass'):
                        verified_count += 1

                spark_grid.append({
                    'student_id': sid,
                    'full_name': st['full_name'],
                    'roll_number': st['roll_number'],
                    'focus_score': focus_map.get(sid),
                    'attempts': attempt_counts.get(sid, 0),
                    'proctor_events': pe_counts.get(sid, 0),
                    'verified_checkpoints': verified_count,
                    'checkpoints': cell_states,
                })

            # Priority: behind*3 + low-focus*2 + proctor*1
            for row in spark_grid:
                behind = len(cps) - row['verified_checkpoints']
                row['priority_score'] = (
                    behind * 3
                    + (2 if (row['focus_score'] is not None and row['focus_score'] < 40) else 0)
                    + row['proctor_events'] * 1
                )
            spark_grid.sort(key=lambda r: r['priority_score'], reverse=True)

    # ── Attendance summary ─────────────────────────────────────────────────
    att_rows = SessionAttendance.query.filter_by(session_id=session_id).all()
    attendance = [a.to_dict() for a in att_rows]

    # ── Chat history (last 100) ────────────────────────────────────────────
    chat_rows = ChatMessage.query.filter_by(session_id=session_id).order_by(
        ChatMessage.at.desc()).limit(100).all()
    chat = [c.to_dict() for c in reversed(chat_rows)]
    from app.models.user import User as _U
    chat_user_ids = {c['from_id'] for c in chat} | {c['to_id'] for c in chat if c['to_id']}
    chat_users = {u.id: u.full_name for u in _U.query.filter(_U.id.in_(chat_user_ids)).all()}
    for c in chat:
        c['from_name'] = chat_users.get(c['from_id'], '')
        c['to_name'] = chat_users.get(c['to_id'], '')

    # ── Content pages for Present & Pace ───────────────────────────────────
    pages = []
    if exp:
        pg_rows = ContentPage.query.filter_by(experiment_id=exp.id).order_by(
            ContentPage.display_order).all()
        pages = [p.to_dict() for p in pg_rows]

    # ── Quiz modules for launch-live ───────────────────────────────────────
    exp_dict = exp.to_dict() if exp else None
    if exp_dict and exp:
        modules = ContentModule.query.filter_by(experiment_id=exp.id).order_by(
            ContentModule.display_order).all()
        exp_dict['content_modules'] = [
            {'id': m.id, 'title': m.title, 'module_type': m.module_type}
            for m in modules
        ]

    return jsonify({
        'session': sess.to_dict(),
        'mode': sess.current_mode or 'briefing',
        'mode_rules': MODE_RULES.get(sess.current_mode or 'briefing', {}),
        'live_page_state': lps.to_dict() if lps else None,
        'experiment': exp.to_dict() if exp else None,
        'checkpoints': checkpoints,
        'spark_grid': spark_grid,
        'pages': pages,
        'attendance': attendance,
        'chat': chat,
        'proctor_policy': _resolve_policy(sess, lps.current_page_id if lps else None),
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# Session mode machine (D1)
# ══════════════════════════════════════════════════════════════════════════════

@conductor_bp.route('/sessions/<session_id>/mode', methods=['POST'])
@require_role('instructor', 'institution_admin')
def set_mode(session_id):
    """Set the session mode with state-machine validation + audit log.
    Relays capability rules to all students via socket."""
    sess = _require_my_session(session_id)
    if not sess:
        return jsonify({'error': 'Session not found or not assigned to you.'}), 404

    data = request.get_json() or {}
    to_mode = data.get('mode')
    reason = data.get('reason', '')

    if to_mode not in SessionModeTransition.VALID_MODES:
        return jsonify({'error': f'Invalid mode "{to_mode}". Valid: {sorted(SessionModeTransition.VALID_MODES)}'}), 400

    from_mode = sess.current_mode or 'briefing'
    legal = SessionModeTransition.LEGAL_TRANSITIONS.get(from_mode, set())
    if to_mode not in legal:
        return jsonify({'error': f'Invalid transition {from_mode} → {to_mode}'}), 409

    sess.current_mode = to_mode
    # Terminal mode = session ended
    if to_mode == 'ended' and sess.status != 'ended':
        sess.status = 'ended'
        sess.ended_at = datetime.utcnow()

    db.session.add(SessionModeTransition(
        session_id=session_id, from_mode=from_mode, to_mode=to_mode,
        actor_id=g.user_id, reason=reason,
    ))
    db.session.commit()

    # D3 — ending the session triggers background grade finalization
    # (quiz-grade population + final blend) without blocking the response.
    if to_mode == 'ended' and sess.experiment_id:
        _spawn_finalize_worker(session_id)

    socketio.emit('session_mode_changed', {
        'mode': to_mode,
        'rules': MODE_RULES.get(to_mode, {}),
        'from': from_mode,
        'reason': reason,
    }, room=f"session_{session_id}_students")

    return jsonify({
        'mode': to_mode,
        'rules': MODE_RULES.get(to_mode, {}),
        'transitions': [t.to_dict() for t in SessionModeTransition.query.filter_by(
            session_id=session_id).order_by(SessionModeTransition.at.desc()).limit(20).all()],
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# Present & Pace — page launch (D-Push) and quiz launch (D-QuizFetch)
# ══════════════════════════════════════════════════════════════════════════════

@conductor_bp.route('/sessions/<session_id>/launch-page', methods=['POST'])
@require_role('instructor', 'institution_admin')
def launch_page(session_id):
    """Launch a content page for all students, optionally with a timer.
    In 'briefing' the push is hard (student UI force-navigates); in 'working'
    it is a soft banner. Server relays the event + mode together."""
    sess = _require_my_session(session_id)
    if not sess:
        return jsonify({'error': 'Session not found or not assigned to you.'}), 404

    data = request.get_json() or {}
    page_id = data.get('page_id')
    timer_sec = data.get('timer_sec')   # optional int

    page = ContentPage.query.get(page_id)
    if not page:
        return jsonify({'error': 'Page not found.'}), 404
    if sess.experiment_id and page.experiment_id != sess.experiment_id:
        return jsonify({'error': 'Page does not belong to this session\'s experiment.'}), 400

    lps = _get_or_create_live_state(session_id, g.user_id)
    lps.current_page_id = page_id
    launched = lps.launched_page_ids or []
    if page_id not in launched:
        launched.append(page_id)
    lps.launched_page_ids = launched
    lps.page_timer_ends_at = (
        datetime.utcnow() + timedelta(seconds=timer_sec)
        if timer_sec else None
    )
    db.session.commit()

    mode = sess.current_mode or 'briefing'
    socketio.emit('student_page_launched', {
        'page_id': page_id,
        'page_title': page.title,
        'mode': mode,
        'timer_ends_at': lps.page_timer_ends_at.isoformat() if lps.page_timer_ends_at else None,
    }, room=f"session_{session_id}_students")

    # Instructor-side confirmation
    socketio.emit('conductor_page_launched', {
        'page_id': page_id,
        'page_title': page.title,
        'mode': mode,
    }, room=f"session_{session_id}_instructor")

    return jsonify({'live_page_state': lps.to_dict()}), 200


@conductor_bp.route('/sessions/<session_id>/launch-quiz', methods=['POST'])
@require_role('instructor', 'institution_admin')
def launch_quiz(session_id):
    """Push a quiz module live even if unpublished (session whitelist)."""
    sess = _require_my_session(session_id)
    if not sess:
        return jsonify({'error': 'Session not found or not assigned to you.'}), 404

    data = request.get_json() or {}
    module_id = data.get('module_id')
    module = ContentModule.query.get(module_id)
    if not module or module.module_type != 'quiz':
        return jsonify({'error': 'Quiz module not found.'}), 404

    lps = _get_or_create_live_state(session_id, g.user_id)
    lps.launched_quiz_module_id = module_id
    db.session.commit()

    socketio.emit('student_quiz_launched', {
        'module_id': module_id,
        'module_title': module.title,
    }, room=f"session_{session_id}_students")

    return jsonify({'live_page_state': lps.to_dict()}), 200


# ══════════════════════════════════════════════════════════════════════════════
# Live Control — proctor override (D-Proctor), force-submit, broadcast
# ══════════════════════════════════════════════════════════════════════════════

@conductor_bp.route('/sessions/<session_id>/set-proctor', methods=['POST'])
@require_role('instructor', 'institution_admin')
def set_proctor(session_id):
    """Flip a granular proctoring control, per page, mid-session.
    Persists to ProctorPolicy and relays the new rules to students."""
    sess = _require_my_session(session_id)
    if not sess:
        return jsonify({'error': 'Session not found or not assigned to you.'}), 404

    data = request.get_json() or {}
    page_id = data.get('page_id')   # optional — NULL = session-wide
    allowed_keys = {
        'lockdown_fullscreen', 'block_copy_paste', 'block_tab_switch',
        'plagiarism_scan', 'focus_ml', 'webcam_required',
    }
    changes = {k: bool(v) for k, v in data.items() if k in allowed_keys}
    if not changes:
        return jsonify({'error': 'No proctor settings provided.'}), 400

    pol = ProctorPolicy.query.filter_by(
        session_id=session_id, page_id=page_id).first()
    if not pol:
        pol = ProctorPolicy(session_id=session_id, page_id=page_id)
        db.session.add(pol)
    for k, v in changes.items():
        setattr(pol, k, v)
    db.session.commit()

    policy = pol.to_dict()
    socketio.emit('proctor_policy_updated', {
        'policy': policy,
        'page_id': page_id,
    }, room=f"session_{session_id}_students")

    return jsonify({'policy': policy, 'page_id': page_id}), 200


@conductor_bp.route('/sessions/<session_id>/force-submit', methods=['POST'])
@require_role('instructor', 'institution_admin')
def force_submit(session_id):
    """Force-submit a single student or all students."""
    sess = _require_my_session(session_id)
    if not sess:
        return jsonify({'error': 'Session not found or not assigned to you.'}), 404

    data = request.get_json() or {}
    student_id = data.get('student_id')
    reason = data.get('reason', 'Session ended by instructor')

    if student_id:
        socketio.emit('force_submission', {
            'reason': reason,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=f"student_{student_id}")
    else:
        socketio.emit('force_submission', {
            'reason': reason,
            'timestamp': datetime.utcnow().isoformat(),
        }, room=f"session_{session_id}_students")

    return jsonify({'ok': True, 'target': student_id or 'all'}), 200


@conductor_bp.route('/sessions/<session_id>/broadcast', methods=['POST'])
@require_role('instructor', 'institution_admin')
def broadcast(session_id):
    """Instructor broadcast to all students + persist a chat message."""
    sess = _require_my_session(session_id)
    if not sess:
        return jsonify({'error': 'Session not found or not assigned to you.'}), 404

    message = (request.get_json() or {}).get('message', '').strip()
    if not message:
        return jsonify({'error': 'Message is empty.'}), 400

    chat = ChatMessage(session_id=session_id, from_id=g.user_id, to_id=None, text=message)
    db.session.add(chat)
    db.session.commit()

    from app.models.user import User as _U
    instr = _U.query.get(g.user_id)
    sender_name = instr.full_name if instr else 'Instructor'

    socketio.emit('instructor_message', {
        'message': message,
        'from': sender_name,        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"session_{session_id}_students")

    # The instructor's own log and student chat logs must show this broadcast
    payload = chat.to_dict()
    payload['from_name'] = sender_name
    socketio.emit('chat_message', payload, room=f"session_{session_id}_students")
    socketio.emit('chat_message', payload, room=f"session_{session_id}_instructor")

    return jsonify({'message': payload}), 200


# ══════════════════════════════════════════════════════════════════════════════
# SPARK — checkpoint override (D-S1 authoritative)
# ══════════════════════════════════════════════════════════════════════════════

@conductor_bp.route('/sessions/<session_id>/checkpoints/<checkpoint_id>/override', methods=['POST'])
@require_role('instructor', 'institution_admin')
def checkpoint_override(session_id, checkpoint_id):
    """Instructor manually passes/fails a student's checkpoint.
    Authoritative — overrides any self-report or execution verdict."""
    sess = _require_my_session(session_id)
    if not sess:
        return jsonify({'error': 'Session not found or not assigned to you.'}), 404

    data = request.get_json() or {}
    student_id = data.get('student_id')
    status = data.get('status')   # manual_pass | manual_fail
    if status not in ('manual_pass', 'manual_fail'):
        return jsonify({'error': 'Status must be manual_pass or manual_fail.'}), 400

    progress = CheckpointProgress.query.filter_by(
        session_id=session_id, student_id=student_id, checkpoint_id=checkpoint_id).first()
    if not progress:
        progress = CheckpointProgress(
            session_id=session_id, student_id=student_id, checkpoint_id=checkpoint_id)
        db.session.add(progress)
    progress.status = status
    progress.passed_at = datetime.utcnow() if status == 'manual_pass' else None
    progress.last_signal_at = datetime.utcnow()
    db.session.commit()

    # Relay to instructor grid + student
    payload = {
        'checkpoint_id': checkpoint_id,
        'student_id': student_id,
        'status': status,
    }
    socketio.emit('checkpoint_update', payload, room=f"session_{session_id}_instructor")
    socketio.emit('my_checkpoint_update', payload, room=f"student_{student_id}")

    return jsonify(payload), 200


# ══════════════════════════════════════════════════════════════════════════════
# Live chat (D13) — instructor broadcasts & 1:1, student->instructor only
# ══════════════════════════════════════════════════════════════════════════════

@conductor_bp.route('/sessions/<session_id>/chat', methods=['GET'])
@require_role('instructor', 'institution_admin', 'student')
def get_chat(session_id):
    """Fetch missed chat messages since ?since=<iso-ts> (late-join)."""
    since = request.args.get('since')
    q = ChatMessage.query.filter_by(session_id=session_id)
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            q = q.filter(ChatMessage.at > since_dt)
        except ValueError:
            pass
    rows = q.order_by(ChatMessage.at.asc()).limit(200).all()
    user_ids = set()
    for c in rows:
        if c.from_id:
            user_ids.add(c.from_id)
        if c.to_id:
            user_ids.add(c.to_id)
    from app.models.user import User as _U
    users = _U.query.filter(_U.id.in_(list(user_ids))).all() if user_ids else []
    name_map = {u.id: u.full_name for u in users}
    res = []
    for c in rows:
        d = c.to_dict()
        d['from_name'] = name_map.get(c.from_id, 'User')
        if c.to_id:
            d['to_name'] = name_map.get(c.to_id, 'User')
        res.append(d)
    return jsonify({'messages': res}), 200


@conductor_bp.route('/sessions/<session_id>/chat', methods=['POST'])
@require_role('instructor', 'institution_admin', 'student')
def send_chat(session_id):
    """Send a chat message. Students may message the group (to_id null) or instructor;
    instructors may broadcast (to_id null) or message one student."""
    data = request.get_json() or {}
    text = (data.get('text') or '').strip()
    to_id = data.get('to_id')
    if not text:
        return jsonify({'error': 'Message is empty.'}), 400

    role = getattr(g, 'role', None)

    # Verify session exists AND belongs to the sender's institution
    sess = LabSession.query.get(session_id)
    if not sess:
        return jsonify({'error': 'Session not found.'}), 404
    if getattr(sess, 'institution_id', None) != getattr(g, 'institution_id', None):
        return jsonify({'error': 'Session not found.'}), 404

    # Students may only chat inside a live session they attend.
    if role == 'student':
        enrolled = SectionStudent.query.filter_by(
            section_id=SectionSubject.query.get(sess.section_subject_id).section_id,
            student_id=g.user_id,
        ).first()
        if not enrolled:
            return jsonify({'error': 'You are not enrolled in this session.'}), 403

    if role == 'student':
        # If student specified a target (direct chat with instructor), resolve instructor ID
        if to_id:
            ss = SectionSubject.query.get(sess.section_subject_id)
            to_id = ss.instructor_id if ss else to_id
        else:
            to_id = None
    else:
        # Instructor can broadcast (to_id is None) or target a student
        to_id = to_id or None

    chat = ChatMessage(session_id=session_id, from_id=g.user_id, to_id=to_id, text=text)
    db.session.add(chat)
    db.session.commit()

    payload = chat.to_dict()
    from app.models.user import User as _U
    sender = _U.query.get(g.user_id)
    payload['from_name'] = sender.full_name if sender else ''
    # Include the recipient's name for 1:1 DMs so the UI can label the thread.
    if to_id:
        recipient = _U.query.get(to_id)
        payload['to_name'] = recipient.full_name if recipient else ''

    if not to_id:
        # Group broadcast: send to both student room and instructor room
        socketio.emit('chat_message', payload, room=f"session_{session_id}_students")
        socketio.emit('chat_message', payload, room=f"session_{session_id}_instructor")
    else:
        # Direct 1:1 message
        socketio.emit('chat_message', payload, room=f"student_{to_id}")
        socketio.emit('chat_message', payload, room=f"student_{g.user_id}")
        socketio.emit('chat_message', payload, room=f"session_{session_id}_instructor")

    return jsonify({'message': payload}), 200


# ══════════════════════════════════════════════════════════════════════════════
# Code snapshot (D-S5) — on-demand read-only editor state
# ══════════════════════════════════════════════════════════════════════════════

@conductor_bp.route('/sessions/<session_id>/student-code/<student_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def student_code_snapshot(session_id, student_id):
    """Return the latest CodeVersion for a student in this session (read-only)."""
    sess = _require_my_session(session_id)
    if not sess:
        return jsonify({'error': 'Session not found or not assigned to you.'}), 404

    version = CodeVersion.query.filter_by(
        session_id=session_id, student_id=student_id
    ).order_by(CodeVersion.saved_at.desc()).first()

    if not version:
        return jsonify({'error': 'No code saved yet for this student.'}), 404

    return jsonify({
        'student_id': student_id,
        'files': version.files,
        'saved_at': version.saved_at.isoformat() if version.saved_at else None,
        'version_number': version.version_number,
        'save_type': version.save_type,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# Student detail — full per-student dossier for the Conductor "View" page
# ══════════════════════════════════════════════════════════════════════════════

@conductor_bp.route('/sessions/<session_id>/student/<student_id>/detail', methods=['GET'])
@require_role('instructor', 'institution_admin')
def student_detail(session_id, student_id):
    """Everything the Student Details page shows: identity, focus timeline,
    checkpoints, quiz/assignment grades, code executions, submissions,
    proctor breakdown, files, and the latest code snapshot."""
    sess = _require_my_session(session_id)
    if not sess:
        return jsonify({'error': 'Session not found or not assigned to you.'}), 404

    stu = User.query.get(student_id)
    if not stu:
        return jsonify({'error': 'Student not found.'}), 404

    exp_id = sess.experiment_id
    from app.models.knowledge import FocusScore
    from app.models.proctor_event import ProctorEvent
    from app.models.grading import Grade
    from app.models.experiment import ContentModule, ContentProgress

    # ── Focus timeline (this session, chronological) ───────────────────────
    focus_rows = FocusScore.query.filter_by(
        session_id=session_id, student_id=student_id
    ).order_by(FocusScore.recorded_at.asc()).all()
    focus_timeline = [
        {'at': f.recorded_at.isoformat() if f.recorded_at else None, 'score': f.focus_score}
        for f in focus_rows if f.focus_score is not None
    ]
    latest_focus = focus_timeline[-1]['score'] if focus_timeline else None

    # ── Checkpoints (with this student's status) ───────────────────────────
    checkpoints = []
    verified_count = 0
    if exp_id:
        cps = Checkpoint.query.filter_by(experiment_id=exp_id).order_by(Checkpoint.order).all()
        prog = {
            p.checkpoint_id: p for p in CheckpointProgress.query.filter_by(
                session_id=session_id, student_id=student_id).all()
        }
        for cp in cps:
            p = prog.get(cp.id)
            status = p.status if p else 'pending'
            if status in ('verified', 'manual_pass'):
                verified_count += 1
            checkpoints.append({
                'id': cp.id, 'order': cp.order, 'title': cp.title, 'status': status,
                'passed_at': p.passed_at.isoformat() if (p and p.passed_at) else None,
            })

    # ── Code attempts (executions + final submissions) ─────────────────────
    attempts = CodeAttempt.query.filter_by(
        session_id=session_id, student_id=student_id
    ).order_by(CodeAttempt.submitted_at.desc()).all() if exp_id else []
    exec_count = len(attempts)
    finals = [a for a in attempts if a.is_final_submission]

    # ── Grade (quiz + assignment scores) ───────────────────────────────────
    grade = Grade.query.filter_by(
        student_id=student_id, experiment_id=exp_id, session_id=session_id
    ).first() if exp_id else None

    # ── Quiz progress (best score across quiz modules of this experiment) ──
    quiz_status, quiz_score = 'not_started', None
    if exp_id:
        quiz_mods = ContentModule.query.filter_by(experiment_id=exp_id, module_type='quiz').all()
        quiz_ids = [m.id for m in quiz_mods]
        if quiz_ids:
            qps = ContentProgress.query.filter(
                ContentProgress.module_id.in_(quiz_ids),
                ContentProgress.student_id == student_id,
            ).all()
            scored = [p.score for p in qps if p.score is not None]
            if scored:
                quiz_score = round(max(scored), 1)
                quiz_status = 'submitted'

    assign_status = 'submitted' if finals else ('in_progress' if attempts else 'not_started')
    assign_score = None
    if finals:
        best = max((a.test_cases_passed / a.test_cases_total * 100 if a.test_cases_total else 0) for a in finals)
        assign_score = round(best, 1)

    # ── Proctor event breakdown ────────────────────────────────────────────
    from collections import defaultdict
    pe_counts = defaultdict(int)
    for pe in ProctorEvent.query.filter_by(session_id=session_id, student_id=student_id).all():
        pe_counts[pe.event_type] += 1

    # ── Submissions list (quiz/assignment/code rows with full details) ───
    submissions = []
    if exp_id:
        quiz_mods = ContentModule.query.filter_by(experiment_id=exp_id, module_type='quiz').all()
        for qmod in quiz_mods:
            qp = ContentProgress.query.filter_by(module_id=qmod.id, student_id=student_id).first()
            if qp and (qp.completed or qp.score is not None or qp.answers):
                questions_data = []
                cdata = qmod.content_data or {}
                raw_questions = cdata.get('questions', [])
                student_answers = qp.answers or {}
                for idx, q in enumerate(raw_questions):
                    qid = str(q.get('id', idx))
                    user_ans = student_answers.get(qid, {})
                    chosen = user_ans.get('answer') if isinstance(user_ans, dict) else user_ans
                    is_correct = user_ans.get('correct') if isinstance(user_ans, dict) else None
                    questions_data.append({
                        'id': qid,
                        'question': q.get('question', q.get('title', f'Question {idx + 1}')),
                        'options': q.get('options', []),
                        'selected': chosen,
                        'correct_answer': q.get('correct_answer'),
                        'is_correct': is_correct if is_correct is not None else (chosen == q.get('correct_answer')),
                        'explanation': q.get('explanation', ''),
                    })

                submissions.append({
                    'id': f'quiz-{qp.module_id}',
                    'type': 'Quiz',
                    'title': qmod.title or 'Concept Quiz',
                    'status': 'graded' if qp.score is not None else 'submitted',
                    'score': round(qp.score, 1) if qp.score is not None else None,
                    'at': qp.completed_at.isoformat() if qp.completed_at else (qp.last_attempt_at.isoformat() if qp.last_attempt_at else None),
                    'questions': questions_data,
                    'total_questions': len(raw_questions),
                })

    if not any(s['type'] == 'Quiz' for s in submissions) and grade and grade.quiz_grade is not None:
        submissions.insert(0, {
            'id': 'quiz-grade',
            'type': 'Quiz',
            'title': 'Pre-Lab Quiz',
            'status': 'graded',
            'score': grade.quiz_grade,
            'at': grade.graded_at.isoformat() if grade.graded_at else None,
            'questions': [],
            'total_questions': 0,
        })

    attempts_to_show = finals[:10] if finals else attempts[:5]
    for a in attempts_to_show:
        submissions.append({
            'id': a.id,
            'type': 'Assignment' if a.is_final_submission else 'Execution',
            'title': f'Attempt #{a.attempt_number}' + (' (Final)' if a.is_final_submission else ''),
            'status': 'submitted',
            'score': (round(a.test_cases_passed / a.test_cases_total * 100, 1) if a.test_cases_total else None),
            'at': a.submitted_at.isoformat() if a.submitted_at else None,
            'tests': f'{a.test_cases_passed or 0}/{a.test_cases_total or 0}',
            'language': a.language,
            'compile_status': a.compile_status,
            'compile_output': a.compile_output,
            'stdout': a.stdout,
            'stderr': a.stderr,
            'files': a.files,
            'execution_time_ms': a.execution_time_ms,
            'loc': a.loc,
            'quality_grade': a.quality_grade,
        })

    # ── Latest code snapshot / files ───────────────────────────────────────
    version = CodeVersion.query.filter_by(
        session_id=session_id, student_id=student_id
    ).order_by(CodeVersion.saved_at.desc()).first()

    # ── Attendance / activity ──────────────────────────────────────────────
    att = SessionAttendance.query.filter_by(session_id=session_id, student_id=student_id).first()
    att_status = att.status if att else 'not_joined'
    if att and (att.joined_at or att.status in ('present', 'joined')):
        att_status = 'present'
    elif focus_timeline or attempts:
        att_status = 'present'

    return jsonify({
        'student': {
            'id': stu.id, 'full_name': stu.full_name, 'roll_number': stu.roll_number,
            'email': stu.email,
        },
        'attendance_status': att_status,
        'joined_at': att.joined_at.isoformat() if (att and att.joined_at) else None,
        'total_time_sec': att.total_time_seconds if att else 0,
        'focus_score': latest_focus,
        'focus_timeline': focus_timeline,
        'checkpoints': checkpoints,
        'checkpoints_done': verified_count,
        'checkpoints_total': len(checkpoints),
        'code_executions': exec_count,
        'last_attempt_at': attempts[0].submitted_at.isoformat() if (attempts and attempts[0].submitted_at) else None,
        'quiz_status': quiz_status,
        'quiz_score': quiz_score,
        'assignment_status': assign_status,
        'assignment_score': assign_score,
        'final_grade': grade.final_grade if grade else None,
        'proctor_events': {
            'tab_switch': pe_counts.get('tab_switch', 0),
            'fullscreen_exit': pe_counts.get('fullscreen_exit', 0),
            'copy_paste': pe_counts.get('copy_paste', 0) + pe_counts.get('paste', 0) + pe_counts.get('cut', 0),
            'lockdown_violation': pe_counts.get('lockdown_violation', 0),
            'total': sum(pe_counts.values()),
        },
        'submissions': submissions,
        'latest_code': {
            'files': version.files if version else None,
            'saved_at': version.saved_at.isoformat() if (version and version.saved_at) else None,
            'save_type': version.save_type if version else None,
        },
        'experiment': {'id': exp_id, 'title': (Experiment.query.get(exp_id).title if exp_id else None)},
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# Grade finalization (D3) — quiz grade population + final blend recompute
# ══════════════════════════════════════════════════════════════════════════════

@conductor_bp.route('/sessions/<session_id>/finalize-grades', methods=['POST'])
@require_role('instructor', 'institution_admin')
def finalize_grades(session_id):
    """Recompute grades for every (student, experiment) in this session.
    quiz_grade = best QuizAttempt score % across modules; then calculate_final()
    using the experiment rubric (including quiz weight). Idempotent."""
    sess = _require_my_session(session_id)
    if not sess or not sess.experiment_id:
        return jsonify({'error': 'Session has no experiment to grade.'}), 400

    updated, count = _finalize_grades_core(sess)
    return jsonify({'updated': updated, 'count': count}), 200


def _finalize_grades_core(sess):
    """Grade finalization shared by the HTTP route and the session-end
    background worker (D3: mode → ended triggers this automatically)."""
    exp = Experiment.query.get(sess.experiment_id)
    session_id = sess.id
    if not exp:
        return [], 0

    rubric = {
        'test_cases':   exp.rubric_test_cases or 0,
        'lab_report':   exp.rubric_lab_report or 0,
        'code_quality': exp.rubric_code_quality or 0,
        'viva':         exp.rubric_viva or 0,
        'quiz':         exp.rubric_quiz or 0,
    }

    from app.models.experiment import ContentModule, ContentProgress
    from app.models.grading import Grade

    # Students who attended or submitted in this session
    attempts = CodeAttempt.query.filter(
        CodeAttempt.session_id == session_id,
        CodeAttempt.experiment_id == exp.id,
    ).all()
    student_ids = {a.student_id for a in attempts}
    attendance = SessionAttendance.query.filter_by(session_id=session_id).all()
    student_ids |= {a.student_id for a in attendance if a.status != 'absent'}

    # Quiz modules + their best progress scores — batch ONCE, not per student.
    # (Each loop iteration previously re-queried ContentModule + ContentProgress.)
    # ContentProgress.score is already the best-per-module; average across the
    # experiment's quiz modules to match the original per-student mean.
    quiz_module_ids = [
        qm.id for qm in ContentModule.query.filter_by(
            experiment_id=exp.id, module_type='quiz').all()
    ]
    quiz_scores_by_student: dict[str, list[float]] = {}
    if quiz_module_ids:
        cps = ContentProgress.query.filter(
            ContentProgress.module_id.in_(quiz_module_ids),
        ).with_entities(
            ContentProgress.student_id, ContentProgress.score,
        ).all()
        for c_sid, c_score in cps:
            if c_score is None:
                continue
            quiz_scores_by_student.setdefault(c_sid, []).append(c_score)

    updated = []
    for sid in student_ids:
        # Best auto grade from final submissions
        finals = [a for a in attempts if a.student_id == sid and a.is_final_submission]
        best_auto = None
        if finals:
            best_auto = max(
                (a.test_cases_passed / a.test_cases_total * 100 if a.test_cases_total else 0)
                for a in finals
            )

        # Best quality score across finals
        quality_scores = [a.quality_grade for a in finals]
        quality_score = None
        if quality_scores:
            grade_map = {'A': 10, 'B': 8, 'C': 6, 'D': 4, 'E': 2, 'F': 0}
            quality_score = max(grade_map.get(q, 0) for q in quality_scores)

        # Quiz grade from pre-batched ContentProgress scores (no per-student queries)
        quiz_scores = quiz_scores_by_student.get(sid, [])
        quiz_grade = round(sum(quiz_scores) / len(quiz_scores), 2) if quiz_scores else None

        # Upsert Grade
        grade = Grade.query.filter_by(
            student_id=sid, experiment_id=exp.id, session_id=session_id).first()
        if not grade:
            grade = Grade(student_id=sid, experiment_id=exp.id, session_id=session_id)
            db.session.add(grade)
        if best_auto is not None:
            grade.auto_grade = round(best_auto, 2)
        if quality_score is not None:
            grade.code_quality_grade = quality_score
        grade.quiz_grade = quiz_grade
        if not grade.graded_at:
            grade.graded_at = datetime.utcnow()
        grade.calculate_final(rubric)
        updated.append({
            'student_id': sid,
            'auto_grade': grade.auto_grade,
            'quiz_grade': grade.quiz_grade,
            'quality_grade': grade.code_quality_grade,
            'final_grade': grade.final_grade,
        })

    db.session.commit()
    return updated, len(updated)


def _spawn_finalize_worker(session_id):
    """D3 — on session end, grade finalization runs in the background so the
    HTTP response returns immediately. Separate app context, like the report
    worker; failures are logged, never raised into the request."""
    import threading

    def _worker():
        from app import create_app
        worker_app = create_app()
        with worker_app.app_context():
            try:
                sess = db.session.get(LabSession, session_id)
                if sess and sess.experiment_id:
                    _finalize_grades_core(sess)
            except Exception as exc:
                db.session.rollback()
                import logging
                logging.getLogger(__name__).warning(
                    '[conductor] auto-finalize failed for session %s: %s',
                    session_id, exc)

    threading.Thread(target=_worker, daemon=True).start()
