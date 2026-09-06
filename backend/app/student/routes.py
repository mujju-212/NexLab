"""
Student Blueprint
Handles: dashboard, pre-lab content, quiz gate, join session, catch-up,
         grades, analytics, notifications, feedback, lab record
"""
from flask import Blueprint, request, jsonify, g, current_app
from app.auth.utils import require_role
from app.extensions import db, limiter
from app.models.experiment import Experiment, ContentModule, ContentPage, ContentProgress, QuizQuestion
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt, CodeVersion
from app.models.grading import Grade, HintLog
from app.models.knowledge import ConceptMastery, StudentRanking, FocusScore
from app.ml.knowledge_tracing import update_concept_mastery
from app.models.feedback import SessionFeedback, Notification
from app.models.academic import SectionSubject, SectionStudent
from datetime import datetime, timedelta, timezone

student_bp = Blueprint('student', __name__)


def _parse_iso_z(raw):
    """Parse an ISO-8601 timestamp ('Z' or ±HH:MM) into a naive-UTC datetime.

    Used for the optional quiz time-limit / assignment deadline (Feature 3).
    Returns None for missing/invalid input so callers can skip enforcement.
    """
    if not raw:
        return None
    try:
        s = str(raw).strip()
        if s.endswith('Z'):
            s = s[:-1] + '+00:00'
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None


# â”€â”€ My Subjects & Experiments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/subjects', methods=['GET'])
@require_role('student')
def my_subjects():
    """All section-subjects the student is enrolled in with dynamic progress and status"""
    from app.models.subject import Subject
    from app.models.experiment import Experiment
    from app.models.grading import Grade
    from app.models.submission import CodeAttempt

    enrollments = SectionStudent.query.filter_by(student_id=g.user_id).all()
    section_ids = [e.section_id for e in enrollments]

    section_subjects = SectionSubject.query.filter(
        SectionSubject.section_id.in_(section_ids),
        SectionSubject.institution_id == g.institution_id
    ).all() if section_ids else []

    result = []
    for ss in section_subjects:
        subject = Subject.query.get(ss.subject_id)
        if not subject:
            continue

        exps = Experiment.query.filter_by(
            subject_id=subject.id,
            institution_id=g.institution_id,
            is_published=True
        ).order_by(Experiment.exp_number).all()
        exp_ids = [e.id for e in exps]

        grades = {g_row.experiment_id: g_row for g_row in Grade.query.filter(
            Grade.student_id == g.user_id,
            Grade.experiment_id.in_(exp_ids)
        ).all()} if exp_ids else {}

        attempts = CodeAttempt.query.filter(
            CodeAttempt.student_id == g.user_id,
            CodeAttempt.experiment_id.in_(exp_ids)
        ).all() if exp_ids else []

        final_attempts = {
            a.experiment_id: a for a in attempts
            if a.is_final_submission or (a.test_cases_passed and a.test_cases_passed == a.test_cases_total)
        }
        any_attempts = {a.experiment_id: a for a in attempts}

        completed_count = 0
        in_progress_count = 0
        all_tags = []
        for e in exps:
            if e.concept_tags and isinstance(e.concept_tags, list):
                for t in e.concept_tags:
                    if t and t not in all_tags:
                        all_tags.append(t)
            if e.id in grades or e.id in final_attempts:
                completed_count += 1
            elif e.id in any_attempts:
                in_progress_count += 1

        total_exps = len(exps)
        pct = round((completed_count / total_exps) * 100) if total_exps > 0 else 0
        if total_exps > 0 and completed_count >= total_exps:
            sub_status = 'completed'
        elif completed_count > 0 or in_progress_count > 0:
            sub_status = 'in_progress'
        else:
            sub_status = 'not_started'

        result.append({
            'section_subject_id': ss.id,
            'subject_id': ss.subject_id,
            'subject_name': subject.name,
            'subject_code': subject.code or '',
            'icon': getattr(subject, 'icon', None) or 'datastruct',
            'subject_icon': getattr(subject, 'icon', None) or 'datastruct',
            'description': subject.description or '',
            'instructor_id': ss.instructor_id,
            'total_experiments': total_exps,
            'completed_experiments': completed_count,
            'progress_percentage': pct,
            'status': sub_status,
            'concept_tags': all_tags[:8],
        })
    return jsonify({'subjects': result}), 200


@student_bp.route('/experiments/<subject_id>', methods=['GET'])
@require_role('student')
def list_experiments(subject_id):
    """Published experiments for a subject with student's personal completion status"""
    from app.models.experiment import Experiment
    from app.models.grading import Grade
    from app.models.submission import CodeAttempt

    exps = Experiment.query.filter_by(
        subject_id=subject_id,
        institution_id=g.institution_id,
        is_published=True
    ).order_by(Experiment.exp_number).all()

    exp_ids = [e.id for e in exps]
    grades = {g_row.experiment_id: g_row for g_row in Grade.query.filter(
        Grade.student_id == g.user_id,
        Grade.experiment_id.in_(exp_ids)
    ).all()} if exp_ids else {}

    attempts = CodeAttempt.query.filter(
        CodeAttempt.student_id == g.user_id,
        CodeAttempt.experiment_id.in_(exp_ids)
    ).order_by(CodeAttempt.submitted_at.desc()).all() if exp_ids else []

    final_attempts = {}
    any_attempts = {}
    for a in attempts:
        if (a.is_final_submission or (a.test_cases_passed and a.test_cases_passed == a.test_cases_total)) and a.experiment_id not in final_attempts:
            final_attempts[a.experiment_id] = a
        if a.experiment_id not in any_attempts:
            any_attempts[a.experiment_id] = a

    enriched = []
    for e in exps:
        d = e.to_dict()
        if e.id in grades:
            gr = grades[e.id]
            d['student_status'] = 'completed'
            d['completed_at'] = (gr.graded_at or gr.created_at).strftime('%b %d, %Y') if (gr.graded_at or gr.created_at) else None
            d['score'] = gr.final_grade
        elif e.id in final_attempts:
            att = final_attempts[e.id]
            d['student_status'] = 'completed'
            d['completed_at'] = att.submitted_at.strftime('%b %d, %Y') if att.submitted_at else None
            d['score'] = att.test_cases_passed
        elif e.id in any_attempts:
            d['student_status'] = 'in_progress'
            d['completed_at'] = None
            d['score'] = None
        else:
            d['student_status'] = 'not_started'
            d['completed_at'] = None
            d['score'] = None
        enriched.append(d)

    return jsonify({'experiments': enriched}), 200


# â”€â”€ Pre-Lab Content & Gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/prelab/<experiment_id>', methods=['GET'])
@require_role('student')
def get_prelab_content(experiment_id):
    """Get all content modules for an experiment (in display order).

    Only returns pages that are visible to students right now:
      is_live=True  OR  (release_at IS NOT NULL AND release_at <= now())
    Modules belonging to hidden pages are omitted. Pages with no published
    state at all (is_live=False, release_at=None) are excluded entirely â€”
    students see nothing until the instructor flips the toggle.

    Modules carry `page_id` so the client can group them into page tabs.
    Each page in `pages[]` includes `is_live`, `release_at` so the student
    UI can show a countdown if desired.
    """
    # ── Staged publishing: students read the frozen snapshot, not live drafts ──
    # Published experiments serve Experiment.published_content (the last
    # Publish/Republish). Unpublished experiments fall back to the live rows so
    # the conductor "launch an unpublished quiz live" flow keeps working.
    from app.services.content_publish import resolve_published_snapshot, snapshot_to_objects
    _exp_for_snapshot = Experiment.query.get(experiment_id)
    _snapshot = resolve_published_snapshot(_exp_for_snapshot)
    if _snapshot:
        all_pages, modules = snapshot_to_objects(_snapshot)
    else:
        modules = ContentModule.query.filter_by(
            experiment_id=experiment_id
        ).order_by(ContentModule.display_order).all()
        all_pages = ContentPage.query.filter_by(experiment_id=experiment_id)\
            .order_by(ContentPage.display_order, ContentPage.created_at).all()

    # Only expose pages that are currently visible to students
    visible_pages = [p for p in all_pages if p.is_visible_to_students()]

    # â”€â”€ C15 â€” launched-quiz whitelist (D-QuizFetch) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # If the instructor launched an unpublished quiz live for this experiment,
    # that quiz module (and its page) is accessible to students even though
    # is_live=False / release_at is in the future. Resolve the student's active
    # session for this experiment, then check its LivePageState.
    launched_quiz_module_id = None
    launched_page_id = None
    my_sections = [e.section_id for e in SectionStudent.query.filter_by(student_id=g.user_id).all()]
    active_session = None
    if my_sections:
        active_session = LabSession.query.join(
            SectionSubject, SectionSubject.id == LabSession.section_subject_id
        ).filter(
            SectionSubject.section_id.in_(my_sections),
            LabSession.experiment_id == experiment_id,
            LabSession.status == 'active',
        ).order_by(LabSession.started_at.desc()).first()
    if active_session:
        from app.models.conductor import LivePageState
        lps = LivePageState.query.filter_by(session_id=active_session.id).first()
        if lps and lps.launched_quiz_module_id:
            launched_quiz_module_id = lps.launched_quiz_module_id
            quiz_mod = ContentModule.query.get(launched_quiz_module_id)
            if quiz_mod and quiz_mod.experiment_id == experiment_id:
                launched_page_id = quiz_mod.page_id
                # Snapshot mode: the launched quiz may be an unpublished draft not
                # present in the frozen snapshot — expose the live module directly.
                if not any(m.id == launched_quiz_module_id for m in modules):
                    modules.append(quiz_mod)

    # Force-include the launched quiz's page (and any page holding it) so the
    # whitelisted module is not hidden behind a not-yet-live page.
    if launched_page_id:
        lp = next((p for p in all_pages if p.id == launched_page_id), None)
        if lp is None:
            # launched draft quiz lives on a page not in the snapshot — load it live
            lp = ContentPage.query.get(launched_page_id)
        if lp and lp.id not in [p.id for p in visible_pages]:
            visible_pages.append(lp)

    visible_page_ids = {p.id for p in visible_pages}

    result = []
    for module in modules:
        # Skip modules whose page is not yet released (unless it's the launched quiz)
        if module.id == launched_quiz_module_id:
            pass   # whitelisted â€” always expose
        elif module.page_id is not None and module.page_id not in visible_page_ids:
            continue

        # Get student's progress on this module
        progress = ContentProgress.query.filter_by(
            student_id=g.user_id, module_id=module.id
        ).first()

        module_data = {
            'id': module.id,
            'page_id': module.page_id,
            'type': module.module_type,
            'title': module.title,
            'display_order': module.display_order,
            'completed': progress.completed if progress else False,
            'score': progress.score if progress else None,
        }

        if module.module_type == 'quiz':
            config = module.content_data or {}
            module_data['quiz_config'] = {
                'pass_threshold': config.get('pass_threshold', 70),
                'max_attempts': config.get('max_attempts', 3),
                'cooldown_minutes': config.get('cooldown_minutes', 30),
                'shuffle': config.get('shuffle', True),
                'time_limit_minutes': config.get('time_limit_minutes'),
                'attempts_used': progress.attempts if progress else 0,
                'last_attempt_at': progress.last_attempt_at.isoformat() if (progress and progress.last_attempt_at) else None,
            }
        elif module.module_type == 'viva':
            # Never leak the stored expected_answer to students â€” return only
            # the question text + metadata. Grading happens server-side.
            config = module.content_data or {}
            questions = config.get('questions', []) or []
            module_data['viva_config'] = {
                'pass_threshold': config.get('pass_threshold', 70),
                'count': len(questions),
                'questions': [{
                    'index': i,
                    'question': (q or {}).get('question', ''),
                    'topics': (q or {}).get('topics', []),
                    'difficulty': (q or {}).get('difficulty'),
                } for i, q in enumerate(questions)],
                'attempts_used': progress.attempts if progress else 0,
            }
        else:
            # text/pdf/video/markdown/code/image/html/link/file/assign
            module_data['content_data'] = module.content_data

        result.append(module_data)

    pages_out = [{
        'id': p.id,
        'title': p.title,
        'display_order': p.display_order,
        'is_live': p.is_live,
        'release_at': p.release_at.isoformat() if p.release_at else None,
    } for p in visible_pages]

    from app.models.subject import Subject
    exp = Experiment.query.get(experiment_id)
    exp_out = None
    if exp:
        sub = Subject.query.get(exp.subject_id) if exp.subject_id else None
        exp_out = {
            'id': exp.id,
            'title': exp.title,
            'exp_number': exp.exp_number,
            'aim': exp.aim,
            'subject_id': exp.subject_id,
            'subject_name': sub.name if sub else '',
            'subject_code': sub.code if sub else '',
            'icon': (getattr(sub, 'icon', None) or 'datastruct') if sub else 'datastruct',
            'concept_tags': exp.concept_tags or [],
            'difficulty_level': exp.difficulty_level,
            'allowed_languages': exp.allowed_languages or ['python'],
        }

    # Feature 3 — server_now lets the client render assignment/quiz deadline
    # countdowns without trusting its own clock (server time is authoritative).
    return jsonify({'modules': result, 'pages': pages_out, 'experiment': exp_out,
                    'server_now': datetime.utcnow().isoformat() + 'Z'}), 200


@student_bp.route('/prelab/<module_id>/quiz/start', methods=['GET'])
@require_role('student')
def get_quiz_questions(module_id):
    """Get shuffled quiz questions (without correct answers)"""
    from app.services.content_publish import resolve_published_snapshot, get_published_module
    module = ContentModule.query.get_or_404(module_id)
    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()

    # Serve the PUBLISHED snapshot so edits made after publishing stay hidden
    # until the instructor republishes. Fall back to live rows when unpublished.
    _snap_mod = get_published_module(
        resolve_published_snapshot(Experiment.query.get(module.experiment_id)), module_id
    )
    config = (_snap_mod.get('content_data') if _snap_mod else module.content_data) or {}
    max_attempts = config.get('max_attempts', 3)
    cooldown_min = config.get('cooldown_minutes', 30)

    # Check attempt limit
    attempts_used = progress.attempts if progress else 0
    if attempts_used >= max_attempts:
        return jsonify({'error': 'Maximum attempts reached. Ask instructor to unlock.'}), 429

    # Check cooldown
    if progress and progress.last_attempt_at:
        next_allowed = progress.last_attempt_at + timedelta(minutes=cooldown_min)
        if datetime.utcnow() < next_allowed:
            wait_sec = int((next_allowed - datetime.utcnow()).total_seconds())
            return jsonify({'error': f'Cooldown active. Try again in {wait_sec} seconds.'}), 429

    # Build questions (never including correct_answer) from the snapshot when
    # available, else from live rows.
    if _snap_mod is not None and _snap_mod.get('questions') is not None:
        questions = [{
            'id': q['id'], 'question_text': q['question_text'],
            'options': q['options'], 'points': q.get('points', 1),
        } for q in _snap_mod['questions']]
    else:
        questions = [{
            'id': q.id, 'question_text': q.question_text,
            'options': q.options, 'points': q.points,
        } for q in QuizQuestion.query.filter_by(module_id=module_id).all()]

    import random
    if config.get('shuffle', True):
        random.shuffle(questions)

    # Feature 3 — optional per-quiz countdown (minutes). server_now lets the
    # client tick without trusting its own clock.
    return jsonify({
        'questions': questions,
        'time_limit_minutes': config.get('time_limit_minutes'),
        'server_now': datetime.utcnow().isoformat() + 'Z',
    }), 200


@student_bp.route('/prelab/<module_id>/quiz/submit', methods=['POST'])
@require_role('student')
def submit_quiz(module_id):
    """Submit quiz answers, get score, update gate status"""
    from app.services.content_publish import resolve_published_snapshot, get_published_module
    module = ContentModule.query.get_or_404(module_id)
    data   = request.get_json()
    answers = data.get('answers', {})   # {question_id: "A"|"B"|"C"|"D"}

    # Grade against the PUBLISHED snapshot so edits after publishing don't change
    # an in-flight quiz. Fall back to live rows when the module isn't snapshotted.
    _snap_mod = get_published_module(
        resolve_published_snapshot(Experiment.query.get(module.experiment_id)), module_id
    )
    if _snap_mod is not None and _snap_mod.get('questions') is not None:
        questions = [{'id': q['id'], 'points': q.get('points', 1),
                      'correct_answer': q.get('correct_answer')} for q in _snap_mod['questions']]
        config = _snap_mod.get('content_data') or {}
    else:
        questions = [{'id': q.id, 'points': q.points, 'correct_answer': q.correct_answer}
                     for q in QuizQuestion.query.filter_by(module_id=module_id).all()]
        config = module.content_data or {}

    # Feature 3 — optional per-quiz time limit (minutes). The client captures
    # server_now when it fetches questions and echoes it back as `started_at`.
    # We never discard work: an over-time submit is still graded (auto-grade)
    # but flagged `timed_out`. A small grace (~15s) absorbs submit latency.
    timed_out = False
    limit_min = config.get('time_limit_minutes')
    if limit_min:
        started_at = _parse_iso_z(data.get('started_at'))
        if started_at is not None:
            elapsed = (datetime.utcnow() - started_at).total_seconds()
            timed_out = elapsed > (float(limit_min) * 60 + 15)

    total_points = sum(q['points'] for q in questions)
    earned_points = sum(
        q['points'] for q in questions
        if answers.get(q['id']) == q['correct_answer']
    )
    score = (earned_points / total_points * 100) if total_points > 0 else 0

    # Update/create progress
    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()
    if not progress:
        progress = ContentProgress(
            student_id=g.user_id, module_id=module_id,
            attempts=0,          # explicit init â€” column default only applies at flush
            score=0.0,
        )
        db.session.add(progress)

    progress.attempts = (progress.attempts or 0) + 1
    progress.last_attempt_at = datetime.utcnow()
    progress.score = score
    # Per-question breakdown (per-question analytics + most-missed insights)
    progress.answers = {
        q['id']: {
            'answer':  answers.get(q['id']),
            'correct': answers.get(q['id']) == q['correct_answer'],
        }
        for q in questions
    }

    threshold = config.get('pass_threshold', 70)
    if score >= threshold:
        progress.completed  = True
        progress.completed_at = datetime.utcnow()

    db.session.commit()

    # P0: Update concept mastery after quiz submission
    try:
        _exp = module.experiment
        if _exp and _exp.concept_tags:
            update_concept_mastery(
                student_id=g.user_id,
                institution_id=g.institution_id,
                concept_tags=_exp.concept_tags or [],
                result={
                    'passed': score >= threshold,
                    'score_pct': score / 100.0,
                    'attempt_count': progress.attempts,
                    'hints_used': 0,
                    'difficulty': _exp.difficulty_level or 1,
                },
            )
    except Exception:
        pass  # mastery update is non-critical â€” never block the submission response

    return jsonify({
        'score': round(score, 1),
        'passed': score >= threshold,
        'threshold': threshold,
        'attempts_used': progress.attempts,
        'correct_count': int(earned_points),
        'total_points': total_points,
        'timed_out': timed_out,
    }), 200


# â”€â”€ Session Join â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@student_bp.route('/sessions/<session_id>/check-gate', methods=['GET'])
@require_role('student', 'free_user')
def check_gate(session_id):
    """Check if student passes pre-lab gate for a session.

    A session must be 'active' to hand out a Jitsi room.  A 'scheduled'
    session returns gate status so the student can prepare, but jitsi_room
    stays null until the session starts.  'ended' and 'cancelled' sessions
    never grant access (use the catch-up endpoint instead).
    """
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    experiment_id  = session.experiment_id
    gate_threshold = session.gate_score_threshold

    # Get all quiz modules for this experiment
    quiz_modules = ContentModule.query.filter_by(
        experiment_id=experiment_id, module_type='quiz'
    ).all()

    all_passed = True
    for qm in quiz_modules:
        progress = ContentProgress.query.filter_by(
            student_id=g.user_id, module_id=qm.id
        ).first()
        if not progress or not progress.completed or (progress.score or 0) < gate_threshold:
            all_passed = False
            break

    quiz_gate_passed = all_passed or not quiz_modules

    # Live join is gated ONLY by session status â€” the pre-lab quiz is
    # informational now (product decision: the gate was breaking the join
    # flow). gate_passed is still returned so the UI can show a nudge.
    can_join_live = session.status == 'active'

    # T2-10 â€” auto check-in: a gate-cleared student is marked joined the
    # moment they open the session, even before the socket connects.
    if can_join_live:
        att = SessionAttendance.query.filter_by(
            session_id=session_id, student_id=g.user_id).first()
        if not att:
            att = SessionAttendance(
                session_id=session_id, student_id=g.user_id,
                status='present', total_time_seconds=0, reconnect_count=0,
            )
            db.session.add(att)
        else:
            if att.status == 'absent':
                att.status = 'present'
        if not att.joined_at:
            att.joined_at = datetime.utcnow()
        db.session.commit()

    # Generate a student LiveKit JWT when they are clear to join the live room
    livekit_token = None
    if can_join_live and current_app.config.get('LIVEKIT_URL'):
        from app.livekit_helper import make_token
        livekit_token = make_token(
            room_name=session.jitsi_room_name,   # reused as LiveKit room name
            identity=f"student-{g.user_id[:8]}",
            name=getattr(g, 'full_name', None) or 'Student',
            can_publish=True,    # camera + mic
            can_subscribe=True,  # see/hear instructor
        )

    return jsonify({
        'gate_passed':      quiz_gate_passed,
        'session':          session.to_dict(),
        'jitsi_room':       session.jitsi_room_name if can_join_live else None,  # kept for compat
        'livekit_token':    livekit_token,
        'livekit_url':      current_app.config.get('LIVEKIT_URL', '') if can_join_live else '',
        'focus_ml_enabled': session.focus_ml_enabled,
        'lockdown_enabled': session.lockdown_enabled,
        'session_status':   session.status,
        'can_join_live':    can_join_live,
    }), 200


# â”€â”€ My Grades & Performance â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/grades', methods=['GET'])
@require_role('student')
def my_grades():
    grades = Grade.query.filter_by(student_id=g.user_id).all()

    result = []
    for grade in grades:
        # Lock grade once student views it
        if not grade.is_locked and grade.final_grade is not None:
            grade.is_locked = True
        result.append(grade.to_dict())

    db.session.commit()
    return jsonify({'grades': result}), 200


@student_bp.route('/mastery', methods=['GET'])
@require_role('student')
def my_mastery():
    masteries = ConceptMastery.query.filter_by(
        student_id=g.user_id, institution_id=g.institution_id
    ).order_by(ConceptMastery.mastery_score.desc()).all()
    return jsonify({'mastery': [m.to_dict() for m in masteries]}), 200


@student_bp.route('/rankings', methods=['GET'])
@require_role('student')
def my_rankings():
    """Student's rankings â€” only for section-subjects whose instructor kept
    rankings public (T3-15: the ranking_visible toggle follows the latest
    published experiment of that subject)."""
    rankings = StudentRanking.query.filter_by(student_id=g.user_id).all()
    visible = []
    for r in rankings:
        ss = SectionSubject.query.get(r.section_subject_id)
        if not ss:
            continue
        latest = (Experiment.query.filter_by(
            subject_id=ss.subject_id, instructor_id=ss.instructor_id,
            is_published=True,
        ).order_by(Experiment.exp_number.desc()).first())
        if latest and latest.ranking_visible is False:
            continue
        visible.append(r)
    return jsonify({'rankings': [r.to_dict() for r in visible]}), 200


@student_bp.route('/notifications', methods=['GET'])
@require_role('student')
def my_notifications():
    notifications = Notification.query.filter_by(
        user_id=g.user_id
    ).order_by(Notification.created_at.desc()).limit(30).all()

    # Mark all as read
    Notification.query.filter_by(user_id=g.user_id, is_read=False).update({'is_read': True})
    db.session.commit()

    return jsonify({'notifications': [n.to_dict() for n in notifications]}), 200


# â”€â”€ Anonymous Feedback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/feedback', methods=['POST'])
@require_role('student')
def submit_feedback():
    """Submit anonymous session feedback â€” student_id is NOT stored"""
    data = request.get_json()
    session_id = data.get('session_id')

    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    # Check feedback window (24 hours after session ended)
    if session.ended_at and datetime.utcnow() > session.ended_at + timedelta(hours=24):
        return jsonify({'error': 'Feedback window has closed (24 hours after session end)'}), 400

    feedback = SessionFeedback(
        session_id=session_id,
        institution_id=g.institution_id,
        # Intentionally NO student_id
        experiment_clarity=data.get('experiment_clarity'),
        session_pacing=data.get('session_pacing'),
        ai_hint_helpfulness=data.get('ai_hint_helpfulness'),
        overall_rating=data.get('overall_rating'),
        comment=data.get('comment'),
    )
    db.session.add(feedback)
    db.session.commit()
    return jsonify({'message': 'Feedback submitted anonymously. Thank you!'}), 201


# â”€â”€ PDF Lab Record â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/lab-record/<subject_id>/download', methods=['GET'])
@require_role('student')
def download_lab_record(subject_id):
    """Generate and return PDF lab record URL"""
    from app.services.pdf_service import generate_lab_record_pdf
    pdf_url = generate_lab_record_pdf(g.user_id, subject_id, g.institution_id)
    return jsonify({'pdf_url': pdf_url}), 200


# â”€â”€ Dashboard Aggregate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/dashboard', methods=['GET'])
@require_role('student')
def dashboard():
    """
    Single-call dashboard aggregate â€” subjects, progress, upcoming sessions,
    top concepts, rank, unread notification count.
    """
    # Enrolled sections â†’ subjects
    enrollments = SectionStudent.query.filter_by(student_id=g.user_id).all()
    section_ids = [e.section_id for e in enrollments]
    section_subjects = SectionSubject.query.filter(
        SectionSubject.section_id.in_(section_ids),
        SectionSubject.institution_id == g.institution_id
    ).all() if section_ids else []
    ss_ids = [ss.id for ss in section_subjects]

    # Upcoming sessions (next 7 days, status scheduled or active)
    now = datetime.utcnow()
    upcoming = LabSession.query.filter(
        LabSession.section_subject_id.in_(ss_ids),
        LabSession.status.in_(['scheduled', 'active']),
        LabSession.scheduled_at >= now,
        LabSession.scheduled_at <= now + timedelta(days=7)
    ).order_by(LabSession.scheduled_at).limit(5).all() if ss_ids else []

    # Top 5 concept mastery
    top_concepts = ConceptMastery.query.filter_by(
        student_id=g.user_id, institution_id=g.institution_id
    ).order_by(ConceptMastery.mastery_score.desc()).limit(5).all()

    # Weak concepts (below 40)
    weak_concepts = ConceptMastery.query.filter(
        ConceptMastery.student_id == g.user_id,
        ConceptMastery.institution_id == g.institution_id,
        ConceptMastery.mastery_score < 40
    ).order_by(ConceptMastery.mastery_score).limit(3).all()

    # Overall rank (best rank across all section-subjects)
    best_rank = StudentRanking.query.filter_by(
        student_id=g.user_id, institution_id=g.institution_id
    ).order_by(StudentRanking.rank_score.desc()).first()

    # Grades summary
    grades = Grade.query.filter_by(student_id=g.user_id).all()
    avg_grade = (sum(g2.final_grade for g2 in grades if g2.final_grade is not None) /
                 len([g2 for g2 in grades if g2.final_grade is not None])) if any(
        g2.final_grade is not None for g2 in grades) else None

    # Unread notifications
    unread_count = Notification.query.filter_by(
        user_id=g.user_id, is_read=False
    ).count()

    # Hint usage today â€” HintLog stores timestamp in `created_at`
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    hints_today = HintLog.query.filter(
        HintLog.student_id == g.user_id,
        HintLog.created_at >= today_start
    ).count()

    # Total submissions
    total_submissions = CodeAttempt.query.filter_by(
        student_id=g.user_id, is_final_submission=True
    ).count()

    return jsonify({
        'subjects_enrolled': len(section_subjects),
        'upcoming_sessions': [s.to_dict() for s in upcoming],
        'top_concepts': [c.to_dict() for c in top_concepts],
        'weak_concepts': [c.to_dict() for c in weak_concepts],
        'best_rank': best_rank.to_dict() if best_rank else None,
        'avg_grade': round(avg_grade, 1) if avg_grade else None,
        'total_submissions': total_submissions,
        'unread_notifications': unread_count,
        'hints_used_today': hints_today,
    }), 200


# â”€â”€ My Sessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/sessions', methods=['GET'])
@require_role('student')
def my_sessions():
    """List all sessions the student's sections are enrolled in"""
    enrollments = SectionStudent.query.filter_by(student_id=g.user_id).all()
    section_ids = [e.section_id for e in enrollments]
    ss = SectionSubject.query.filter(
        SectionSubject.section_id.in_(section_ids),
        SectionSubject.institution_id == g.institution_id
    ).all() if section_ids else []
    ss_ids = [s.id for s in ss]

    sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(ss_ids)
    ).order_by(LabSession.scheduled_at.desc()).all() if ss_ids else []

    result = []
    for session in sessions:
        att = SessionAttendance.query.filter_by(
            session_id=session.id, student_id=g.user_id
        ).first()
        d = session.to_dict()
        d['my_attendance'] = att.to_dict() if att else {'status': 'absent'}
        result.append(d)
    return jsonify({'sessions': result}), 200


# â”€â”€ Catch-up Mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/sessions/<session_id>/catchup', methods=['POST'])
@require_role('student')
def start_catchup(session_id):
    """
    Start catch-up attempt for a missed session.
    Allowed only if: catchup_enabled=True, session ended, within catchup_deadline,
    student was absent.
    """
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    if not session.catchup_enabled:
        return jsonify({'error': 'Catch-up is not enabled for this session'}), 400
    if session.status != 'ended':
        return jsonify({'error': 'Session has not ended yet'}), 400
    if session.catchup_deadline and datetime.utcnow() > session.catchup_deadline:
        # F4 â€” instructor-granted extension overrides the session deadline
        from app.models.intervention import Extension
        if session.experiment_id:
            ext = Extension.query.filter_by(
                student_id=g.user_id, experiment_id=session.experiment_id,
                excused=False,
            ).filter(Extension.extension_until >= datetime.utcnow()).first()
            if not ext:
                return jsonify({'error': 'Catch-up deadline has passed'}), 400

    # Check student was absent (not already present)
    att = SessionAttendance.query.filter_by(
        session_id=session_id, student_id=g.user_id
    ).first()
    if att and att.status in ('present', 'late', 'partial'):
        return jsonify({'error': 'You already attended this session'}), 400

    # Create or update attendance as catch-up
    if not att:
        att = SessionAttendance(
            session_id=session_id,
            student_id=g.user_id,
            is_catchup=True
        )
        db.session.add(att)

    att.status = 'partial'   # will be finalized when they submit code
    att.is_catchup = True
    att.joined_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        'message': 'Catch-up session started. Submit your code before the deadline.',
        'experiment_id': session.experiment_id,
        'catchup_deadline': session.catchup_deadline.isoformat() if session.catchup_deadline else None,
        'session_id': session_id,
    }), 200


# â”€â”€ Experiment History â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/history', methods=['GET'])
@require_role('student')
def my_experiment_history():
    """All experiments the student has attempted, with latest attempt stats"""
    attempts = db.session.query(
        CodeAttempt.experiment_id,
        db.func.max(CodeAttempt.submitted_at).label('last_attempt'),
        db.func.count(CodeAttempt.id).label('total_attempts'),
        db.func.max(CodeAttempt.test_cases_passed).label('best_tests_passed'),
        db.func.max(CodeAttempt.test_cases_total).label('tests_total'),
    ).filter_by(
        student_id=g.user_id
    ).group_by(CodeAttempt.experiment_id).all()

    result = []
    for row in attempts:
        exp = Experiment.query.get(row.experiment_id)
        grade = Grade.query.filter_by(
            student_id=g.user_id, experiment_id=row.experiment_id
        ).first()
        result.append({
            'experiment_id': row.experiment_id,
            'experiment_title': exp.title if exp else 'Unknown',
            'concept_tags': exp.concept_tags if exp else [],
            'last_attempt': row.last_attempt.isoformat() if row.last_attempt else None,
            'total_attempts': row.total_attempts,
            'best_tests_passed': row.best_tests_passed,
            'tests_total': row.tests_total,
            'grade': grade.final_grade if grade else None,
        })
    return jsonify({'history': result}), 200


# â”€â”€ Content Progress Mark â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/prelab/<module_id>/complete', methods=['POST'])
@require_role('student')
def mark_module_complete(module_id):
    """
    Mark a text, video, or PDF module as completed.
    (Quiz completion is auto-set by submit_quiz.)
    """
    module = ContentModule.query.get_or_404(module_id)
    if module.module_type == 'quiz':
        return jsonify({'error': 'Quiz completion is set automatically on submit'}), 400

    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()
    if not progress:
        progress = ContentProgress(student_id=g.user_id, module_id=module_id)
        db.session.add(progress)

    progress.completed = True
    progress.completed_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'message': 'Module marked as complete', 'module_id': module_id}), 200


# â”€â”€ Graded code assignment ('assign' block) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
def _norm_output(s):
    """Trailing-space + trailing-newline tolerant line-by-line comparison key."""
    text = (s or '').replace('\r\n', '\n').rstrip('\n')
    return '\n'.join(line.rstrip() for line in text.split('\n'))


@student_bp.route('/prelab/<module_id>/assignment/submit', methods=['POST'])
@require_role('student')
@limiter.limit("10 per minute")   # each submit spawns one container per test case
def submit_assignment(module_id):
    """
    Run a student's code for a graded 'assign' block against the block's own
    test cases (kept in content_data â€” migration-free), auto-score, and record
    the attempt.

    Body: { "code": "...", "language": "python" (optional; else content_data.language) }

    Scoring: weighted % of test cases whose stdout matches `expected`
    (status_id 3 + normalized-output match). Best score across attempts is kept;
    `completed` once best >= content_data.pass_threshold (default 60).
    Hidden test cases are graded but never reveal their input/expected/actual.

    NOTE: submission is intentionally UNGATED here; Phase 3 binds it to the
    active LabSession (hybrid delivery model).
    """
    from app.execution.routes import _run_docker
    from app.execution.languages import resolve as resolve_language
    from app.models.experiment import TestCase
    from app.models.conductor import TestCaseResult

    module = ContentModule.query.get_or_404(module_id)
    if module.module_type != 'assign':
        return jsonify({'error': 'This module is not a graded assignment.'}), 400

    from app.services.content_publish import resolve_published_snapshot, get_published_module
    exp = Experiment.query.get(module.experiment_id)
    # Grade against the PUBLISHED snapshot when available (stable, frozen test
    # cases + config), else fall back to live rows for unpublished/legacy modules.
    _snap_mod = get_published_module(resolve_published_snapshot(exp), module_id)
    cfg = (_snap_mod.get('content_data') if _snap_mod else module.content_data) or {}
    _snap_cases = (_snap_mod.get('test_cases') if _snap_mod else None)

    # Feature 3 — optional hard deadline. Server time is authoritative; reject
    # submissions after due_at (small grace for clock/network latency). An absent
    # due_at means "no deadline", so existing assignments are unaffected.
    _due = _parse_iso_z(cfg.get('due_at'))
    if _due is not None and datetime.utcnow() > _due + timedelta(seconds=15):
        return jsonify({'error': 'The submission deadline for this assignment has passed.',
                        'late': True, 'due_at': cfg.get('due_at')}), 403
    # Prefer the experiment's official TestCase table rows (the SPARK/checkpoint
    # source of truth â€” D4). Fall back to embedded content_data test cases when
    # the experiment has none (pre-existing modules).
    official_cases = TestCase.query.filter_by(experiment_id=exp.id).all() if exp else []

    if _snap_cases:
        # Snapshot-frozen test cases (captured at publish time) — stable grading.
        test_cases = [dict(tc) for tc in _snap_cases]
    elif official_cases:
        # Build the test list from the test_cases table (has id, visible/hidden)
        test_cases = []
        for tc in official_cases:
            if tc.is_hidden:
                test_cases.append({'input': tc.input_data or '', 'expected': tc.expected_output or '',
                                   'hidden': True, 'weight': tc.points_weight or 1, 'tc_id': tc.id})
            else:
                test_cases.append({'input': tc.input_data or '', 'expected': tc.expected_output or '',
                                   'hidden': False, 'weight': tc.points_weight or 1, 'tc_id': tc.id, 'description': tc.description})
    else:
        # Fall back to embedded content_data test cases (no table rows)
        test_cases = cfg.get('test_cases') or []
        for tc in test_cases:
            tc['tc_id'] = None

    if not test_cases:
        return jsonify({'error': 'This assignment has no test cases yet.'}), 400

    data = request.get_json() or {}
    code = (data.get('code') or '').strip()
    if not code:
        return jsonify({'error': 'No code submitted.'}), 400

    language = data.get('language') or cfg.get('language') or 'python'
    spec = resolve_language(language)
    if not spec:
        return jsonify({'error': f'Unknown language: {language}'}), 400
    if spec['engine'] == 'browser':
        return jsonify({'error': 'Browser languages run client-side only.'}), 400
    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({'error': 'Code execution engine is not enabled on this server.'}), 503

    # â”€â”€ Run the submission against each test case â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    results = []
    earned = 0.0
    total_weight = 0.0
    passed_count = 0

    packages = data.get('packages') or cfg.get('packages')

    for i, tc in enumerate(test_cases):
        weight = tc.get('weight', 1) or 1
        total_weight += weight
        stdin = str(tc.get('input', '') or '')
        result, error = _run_docker(code, spec['id'], stdin, g.user_id, packages=packages)
        if error:
            # queue full (429) / engine down (503) â€” surface it, grade nothing
            return error
        ok = (result.get('status_id') == 3
              and _norm_output(result.get('stdout')) == _norm_output(str(tc.get('expected', ''))))
        if ok:
            earned += weight
            passed_count += 1
        hidden = bool(tc.get('hidden'))
        row = {'index': i, 'passed': ok, 'hidden': hidden, 'test_case_id': tc.get('tc_id'),
               '_ms': int(result.get('time_ms') or 0)}
        if not hidden:
            row.update({
                'input': stdin,
                'expected': str(tc.get('expected', '')),
                'actual': result.get('stdout', ''),
                'status': result.get('status'),
                'stderr': result.get('stderr') or result.get('compile_output') or '',
            })
        results.append(row)

    score = (earned / total_weight * 100) if total_weight > 0 else 0.0

    # â”€â”€ Upsert progress, keeping the best score across attempts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()
    if not progress:
        progress = ContentProgress(student_id=g.user_id, module_id=module_id, attempts=0, score=0.0)
        db.session.add(progress)
    progress.attempts = (progress.attempts or 0) + 1
    progress.last_attempt_at = datetime.utcnow()
    best = max(progress.score or 0, score)
    progress.score = best
    threshold = cfg.get('pass_threshold', 60)
    if best >= threshold:
        progress.completed = True
        progress.completed_at = datetime.utcnow()

    # â”€â”€ Record the attempt (analytics parity with /execution/run) â”€â”€â”€â”€â”€â”€â”€â”€â”€
    # Bind to the student's ACTIVE live session for this experiment (Fix 3) so
    # the SPARK grid attempt count and session-end grade finalization can find
    # it. Fall back to None when no live session is running (prelab solo work).
    active_session = None
    my_sections = [e.section_id for e in SectionStudent.query.filter_by(student_id=g.user_id).all()]
    if my_sections:
        active_session = LabSession.query.join(
            SectionSubject, SectionSubject.id == LabSession.section_subject_id
        ).filter(
            SectionSubject.section_id.in_(my_sections),
            LabSession.experiment_id == module.experiment_id,
            LabSession.status == 'active',
        ).order_by(LabSession.started_at.desc()).first()

    attempt_count = CodeAttempt.query.filter_by(
        student_id=g.user_id, experiment_id=module.experiment_id
    ).count()
    attempt = CodeAttempt(
        student_id=g.user_id,
        experiment_id=module.experiment_id,
        session_id=active_session.id if active_session else None,
        attempt_number=attempt_count + 1,
        language=language,
        files={'main': code},
        stdin='',
        compile_status='graded',
        test_cases_passed=passed_count,
        test_cases_total=len(test_cases),
        is_final_submission=True,
    )
    db.session.add(attempt)
    db.session.flush()

    # â”€â”€ Per-test-case results (B12) â€” feeds the analytics failure heatmap â”€â”€
    for row in results:
        if row.get('test_case_id'):
            db.session.add(TestCaseResult(
                attempt_id=attempt.id,
                test_case_id=row['test_case_id'],
                passed=row['passed'],
                execution_time_ms=int((row.get('_ms') or 0)),
            ))

    # â”€â”€ Auto-verify checkpoints (C16 / Fix 3) â€” when a live session is bound â”€â”€
    if active_session:
        from app.models.conductor import CheckpointProgress, Checkpoint
        passed_ids = {r['test_case_id'] for r in results if r.get('passed') and r.get('test_case_id')}
        if passed_ids:
            cps = Checkpoint.query.filter_by(experiment_id=module.experiment_id).all()
            for cp in cps:
                mapped = set(cp.test_case_ids or [])
                if mapped and mapped.issubset(passed_ids):
                    prog = CheckpointProgress.query.filter_by(
                        session_id=active_session.id, student_id=g.user_id, checkpoint_id=cp.id).first()
                    if not prog:
                        prog = CheckpointProgress(
                            session_id=active_session.id, student_id=g.user_id, checkpoint_id=cp.id)
                        db.session.add(prog)
                    if prog.status in ('pending', 'claimed', 'failed'):
                        prog.status = 'verified'
                        prog.passed_at = datetime.utcnow()
                        prog.last_signal_at = datetime.utcnow()

    db.session.commit()

    # P0: Update concept mastery after coding assignment submission
    try:
        _exp = module.experiment
        if _exp and _exp.concept_tags:
            _hints = HintLog.query.filter_by(
                student_id=g.user_id, experiment_id=_exp.id).count()
            update_concept_mastery(
                student_id=g.user_id,
                institution_id=g.institution_id,
                concept_tags=_exp.concept_tags or [],
                result={
                    'passed': best >= threshold,
                    'score_pct': best / 100.0,
                    'attempt_count': progress.attempts,
                    'hints_used': _hints,
                    'difficulty': _exp.difficulty_level or 1,
                },
            )
    except Exception:
        pass  # mastery update is non-critical â€” never block the submission response

    return jsonify({
        'score': round(score, 1),
        'best_score': round(best, 1),
        'passed': best >= threshold,
        'threshold': threshold,
        'passed_tests': passed_count,
        'total_tests': len(test_cases),
        'attempts_used': progress.attempts,
        'results': results,
    }), 200


# â”€â”€ AI Viva ('viva' block) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
@student_bp.route('/prelab/<module_id>/viva/submit', methods=['POST'])
@require_role('student')
@limiter.limit("6 per minute")   # each submit calls the LLM once per question
def submit_viva(module_id):
    """
    Grade a student's answers to an author-time AI Viva block.

    The block's content_data holds the generated questions with their
    `expected_answer` (never sent to the student â€” see get_prelab_content).
    Each submitted answer is scored 0â€“10 by the LLM against the expected
    answer; the block score is the mean, scaled to 0â€“100. `completed` once
    score >= content_data.pass_threshold (default 70).

    Body: { "answers": { "<index>": "student answer text", ... } }
    Returns: { score, passed, threshold, per_question: [...], attempts_used }
    """
    module = ContentModule.query.get_or_404(module_id)
    if module.module_type != 'viva':
        return jsonify({'error': 'This module is not a viva block.'}), 400

    cfg = module.content_data or {}
    questions = cfg.get('questions') or []
    if not questions:
        return jsonify({'error': 'This viva has no questions yet.'}), 400

    data = request.get_json() or {}
    answers = data.get('answers') or {}
    if not isinstance(answers, dict):
        return jsonify({'error': 'answers must be an object keyed by question index.'}), 400

    from app.ai.groq_client import groq_chat
    import json as _json
    import re as _re

    per_question = []
    total_score = 0.0
    for i, q in enumerate(questions):
        q = q or {}
        question_text  = q.get('question', '')
        expected       = q.get('expected_answer', '')
        student_answer = str(answers.get(str(i), answers.get(i, '')) or '').strip()

        if not student_answer:
            per_question.append({'index': i, 'score': 0, 'feedback': 'No answer provided.'})
            continue

        system_prompt = (
            "You are grading a student's oral-exam (viva) answer against a model answer. "
            'Return ONLY valid JSON: {"score": <0-10 integer>, "feedback": "<one short sentence>"}. '
            'Score guide: 9-10=excellent, 7-8=good, 5-6=partial, 3-4=weak, 0-2=incorrect or off-topic.'
        )
        user_msg = (
            f"Question: {question_text}\n"
            f"Model answer: {expected}\n"
            f"Student answer: {student_answer}"
        )
        messages = [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_msg},
        ]
        try:
            response, _, _, _ = groq_chat(messages, pool='fast', max_tokens=80, temperature=0.1)
            match = _re.search(r'\{.*\}', response or '', _re.DOTALL)
            parsed = _json.loads(match.group()) if match else {}
            q_score = int(parsed.get('score', 5))
            feedback = str(parsed.get('feedback', ''))[:300]
        except Exception:
            q_score = 5
            feedback = 'Could not evaluate automatically.'
        q_score = max(0, min(10, q_score))
        total_score += q_score
        per_question.append({'index': i, 'score': q_score, 'feedback': feedback})

    # Mean of 0â€“10 scores â†’ 0â€“100
    score = (total_score / len(questions) * 10) if questions else 0.0

    # Upsert progress, keeping the best score across attempts
    progress = ContentProgress.query.filter_by(
        student_id=g.user_id, module_id=module_id
    ).first()
    if not progress:
        progress = ContentProgress(student_id=g.user_id, module_id=module_id, attempts=0, score=0.0)
        db.session.add(progress)
    progress.attempts = (progress.attempts or 0) + 1
    progress.last_attempt_at = datetime.utcnow()
    best = max(progress.score or 0, score)
    progress.score = best
    threshold = cfg.get('pass_threshold', 70)
    if best >= threshold:
        progress.completed = True
        progress.completed_at = datetime.utcnow()
    db.session.commit()

    # P0: Update concept mastery after viva submission
    try:
        _exp = module.experiment
        if _exp and _exp.concept_tags:
            update_concept_mastery(
                student_id=g.user_id,
                institution_id=g.institution_id,
                concept_tags=_exp.concept_tags or [],
                result={
                    'passed': best >= threshold,
                    'score_pct': best / 100.0,
                    'attempt_count': progress.attempts,
                    'hints_used': 0,
                    'difficulty': _exp.difficulty_level or 1,
                },
            )
    except Exception:
        pass  # mastery update is non-critical â€” never block the submission response

    return jsonify({
        'score': round(score, 1),
        'best_score': round(best, 1),
        'passed': best >= threshold,
        'threshold': threshold,
        'per_question': per_question,
        'attempts_used': progress.attempts,
    }), 200


# â”€â”€ Student search (shell search bar) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@student_bp.route('/search', methods=['GET'])
@require_role('student', 'free_user')
def student_search():
    """
    Cross-entity search for the student shell.
    ?q=<text> â€” matches my lab sessions (title), my experiments (title),
    and practice-library problems (title). â‰¤8 results per type.
    """
    q = (request.args.get('q') or '').strip()
    if len(q) < 2:
        return jsonify({'results': []}), 200
    like = f'%{q}%'
    results = []

    # My lab sessions (through my sections' section-subjects)
    my_ss_ids = [ss.id for ss in SectionSubject.query.filter(
        SectionSubject.institution_id == g.institution_id,
        SectionSubject.section_id.in_(
            [e.section_id for e in SectionStudent.query.filter_by(
                student_id=g.user_id).all()]
        )).all()]
    if my_ss_ids:
        for s in (LabSession.query.filter(
                LabSession.section_subject_id.in_(my_ss_ids),
                LabSession.title.ilike(like),
        ).order_by(LabSession.scheduled_at.desc()).limit(8).all()):
            results.append({
                'type': 'session', 'id': s.id,
                'label': s.title or 'Lab session',
                'sub_label': f'{s.status} Â· {s.scheduled_at.strftime("%d %b") if s.scheduled_at else ""}',
                'link': '/student/live-lab',
            })

    # My subjects' experiments (course content)
    if g.institution_id and my_ss_ids:
        seen_subjects = {ss.subject_id for ss in SectionSubject.query.filter(
            SectionSubject.id.in_(my_ss_ids)).all()}
        for e in (Experiment.query.filter(
                Experiment.institution_id == g.institution_id,
                Experiment.subject_id.in_(seen_subjects),
                Experiment.title.ilike(like),
        ).limit(6).all()):
            from app.models.subject import Subject as _Subject
            subj = _Subject.query.get(e.subject_id)
            results.append({
                'type': 'experiment', 'id': e.id,
                'label': e.title,
                'sub_label': f'{subj.name if subj else "Subject"} Â· Exp #{e.exp_number}',
                'link': '/student/subjects',
            })

    # Practice library problems
    from app.models.practice import Problem as _P
    for p in (_P.query.filter(
            _P.is_active == True,  # noqa: E712
            _P.title.ilike(like),
    ).order_by(_P.lc_id.asc()).limit(8).all()):
        results.append({
            'type': 'problem', 'id': p.id,
            'label': p.title,
            'sub_label': f'{p.difficulty} Â· {p.nexlab_topic}',
            'link': '/student/practice',
        })

    return jsonify({'results': results}), 200
