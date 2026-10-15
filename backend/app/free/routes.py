"""
Free Platform Routes — public course catalog + practice execution
Accessible by: free_user, student, instructor, platform_admin (all authenticated roles)
Course listing is fully PUBLIC (no auth required).
"""
from flask import Blueprint, request, jsonify, g
from app.extensions import db
from app.models.free import FreeCourse, FreeExercise, FreeProgress
from app.models.user import User
from app.auth.utils import require_auth, require_role
from app.execution.languages import resolve as resolve_language
from datetime import datetime
from flask import current_app

free_bp = Blueprint('free', __name__)


# ── Public: Course Catalog ────────────────────────────────────────────────────

@free_bp.route('/courses', methods=['GET'])
def list_courses():
    """Public — list all published free courses."""
    difficulty = request.args.get('difficulty')
    language   = request.args.get('language')
    tag        = request.args.get('tag')

    q = FreeCourse.query.filter_by(is_published=True)
    if difficulty:
        q = q.filter_by(difficulty=difficulty)
    if language:
        q = q.filter_by(language=language)

    courses = q.order_by(FreeCourse.order_index).all()

    if tag:
        courses = [c for c in courses if tag in (c.tags or [])]

    return jsonify({'courses': [c.to_dict() for c in courses]}), 200


@free_bp.route('/courses/<course_id>', methods=['GET'])
def get_course(course_id):
    """Public — course detail with enriched real exercise list and user progress."""
    # Accept slug or UUID
    course = FreeCourse.query.filter(
        (FreeCourse.id == course_id) | (FreeCourse.slug == course_id)
    ).filter_by(is_published=True).first_or_404()

    exercises = course.exercises.filter_by(is_published=True).all()

    # Identify user if authenticated
    user_id = None
    try:
        from flask_jwt_extended import verify_jwt_in_request, get_jwt
        verify_jwt_in_request(optional=True)
        claims = get_jwt()
        if claims and claims.get('sub'):
            user_id = claims.get('sub')
    except Exception:
        pass
    if not user_id:
        user_id = request.args.get('user_id')

    # Topics syllabus mapping
    TOPIC_DEFS = [
        ("Arrays", [1, 2, 5, 9, 10, 11]),
        ("Linked Lists", [7, 8, 12, 13]),
        ("Stacks & Queues", [6, 14, 15, 16]),
        ("Sorting", [2, 17, 18, 19]),
        ("Searching", [1, 3, 20, 21]),
        ("Trees", [23, 24, 25, 26]),
        ("Graphs", [27, 28, 29, 30]),
        ("Complexity Analysis", [22, 31, 32, 4]),
    ]

    solved_ids = set()
    attempted_ids = set()
    if user_id:
        progs = FreeProgress.query.filter_by(user_id=user_id, course_id=course.id).all()
        for p in progs:
            if p.status == 'solved':
                solved_ids.add(p.exercise_id)
            elif p.status == 'attempted':
                attempted_ids.add(p.exercise_id)

    # Compute topics summary
    ex_by_order = {e.order_index: e for e in exercises}
    topics_summary = []
    for topic_name, order_list in TOPIC_DEFS:
        matched_exs = [ex_by_order[idx] for idx in order_list if idx in ex_by_order]
        matched_solved = [e for e in matched_exs if e.id in solved_ids]
        # In the mockup, Complexity Analysis shows 0/4 as theory foundational
        if topic_name == "Complexity Analysis" and len(matched_solved) > 0 and len(matched_exs) == 4:
            # Check if Time Complexity MCQ was in here
            pass
        topics_summary.append({
            "name": topic_name,
            "solved": len(matched_solved),
            "total": len(matched_exs),
            "pct": round((len(matched_solved) / len(matched_exs)) * 100) if matched_exs else 0
        })

    total_exercises = len(exercises)
    total_xp = sum(e.xp_reward or 10 for e in exercises)
    solved_count = len(solved_ids)
    attempted_count = len(attempted_ids)
    unsolved_count = max(0, total_exercises - solved_count - attempted_count)
    earned_xp = sum(e.xp_reward or 10 for e in exercises if e.id in solved_ids)
    pct_solved = round((solved_count / total_exercises) * 100) if total_exercises else 0
    pct_xp = round((earned_xp / total_xp) * 100) if total_xp else 0

    rank_in_course = 1
    global_rank = 86
    top_percentile = 12
    try:
        from app.models.practice import StudentXP
        from sqlalchemy import func
        if user_id:
            better_count = db.session.query(func.count(FreeProgress.user_id.distinct())).filter(
                FreeProgress.course_id == course.id,
                FreeProgress.status == 'solved',
                FreeProgress.xp_earned > earned_xp
            ).scalar() or 0
            rank_in_course = better_count + 1

            my_xp = db.session.query(StudentXP.xp).filter_by(student_id=user_id).scalar() or earned_xp
            higher_xp_count = db.session.query(func.count(StudentXP.student_id)).filter(
                StudentXP.xp > my_xp
            ).scalar() or 0
            global_rank = max(1, higher_xp_count + 1)
            total_students = db.session.query(func.count(StudentXP.student_id)).scalar() or 100
            top_percentile = max(1, min(99, round((global_rank / max(1, total_students)) * 100)))
    except Exception:
        pass

    user_progress = {
        "user_id": user_id,
        "solved_count": solved_count,
        "attempted_count": attempted_count,
        "unsolved_count": unsolved_count,
        "earned_xp": earned_xp,
        "total_xp": total_xp,
        "pct_solved": pct_solved,
        "pct_xp": pct_xp,
        "solved_ids": list(solved_ids),
        "attempted_ids": list(attempted_ids),
        "rank_in_course": rank_in_course,
        "global_rank": global_rank,
        "top_percentile": top_percentile,
    }

    formatted_exercises = []
    for e in exercises:
        d = e.to_dict()
        is_solved = e.id in solved_ids
        is_attempted = e.id in attempted_ids
        is_locked = (e.order_index > 6 and not is_solved)
        d['is_solved'] = is_solved
        d['is_attempted'] = is_attempted
        d['is_locked'] = is_locked
        d['action_label'] = 'Solve Again' if is_solved else ('Unlock' if is_locked else 'Solve')
        d['solves_display'] = f"{e.solves_count / 1000:.1f}k solves" if (e.solves_count or 0) >= 1000 else f"{e.solves_count or 0} solves"
        formatted_exercises.append(d)

    course_dict = course.to_dict()
    course_dict['estimated_hours'] = "4–6 hours"
    course_dict['topic_count'] = len(TOPIC_DEFS)

    return jsonify({
        'course': course_dict,
        'exercises': formatted_exercises,
        'user_progress': user_progress,
        'topics_summary': topics_summary,
    }), 200


@free_bp.route('/exercises/<exercise_id>', methods=['GET'])
def get_exercise(exercise_id):
    """Public — single exercise detail (hidden test cases excluded)."""
    ex = FreeExercise.query.get_or_404(exercise_id)
    if not ex.is_published:
        return jsonify({'error': 'Exercise not available'}), 404
    return jsonify({'exercise': ex.to_dict()}), 200


# ── Authenticated: Run Code ───────────────────────────────────────────────────

def _run_case(lang_id, code, stdin):
    """
    Execute one test case in the Docker sandbox under admission control.

    Returns (result, error): exactly one is non-None. `result` is the
    runner.run() dict; `error` is a ready (response, status) tuple —
    429 + Retry-After when the queue / per-user cap is hit, 503 when the engine
    itself failed (status_id 13). A compile or runtime error in the student's
    own code is a normal `result` (not an error), so the batch keeps going.
    """
    from app.exec_engine import runner as _runner
    from app.exec_engine import admission as _adm
    try:
        with _adm.get().acquire(g.user_id):
            result = _runner.run(code=code, language=lang_id, stdin=stdin or '')
    except _adm.AdmissionError as exc:
        resp = jsonify({'error': str(exc)})
        resp.headers['Retry-After'] = str(exc.retry_after)
        return None, (resp, 429)
    if result.get('status_id') == 13:
        return None, (jsonify({'error': result.get('note') or 'Execution engine error.'}), 503)
    return result, None


@free_bp.route('/exercises/<exercise_id>/run', methods=['POST'])
@require_auth
def run_exercise(exercise_id):
    """
    Run code against public test cases only (no hidden cases exposed).
    Each case executes in the Docker sandbox (fixed 5 s / 256 MB caps).
    """
    ex = FreeExercise.query.get_or_404(exercise_id)
    data = request.get_json()
    code     = data.get('code', '')
    language = data.get('language', 'python')

    if not code.strip():
        return jsonify({'error': 'No code provided'}), 400

    spec = resolve_language(language)
    if not spec:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    if spec['engine'] == 'browser':
        return jsonify({'error': 'Browser languages run client-side only.'}), 400
    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({'error': 'Code execution engine is not enabled on this server.'}), 503

    results = []
    visible_cases = [tc for tc in (ex.test_cases or []) if not tc.get('hidden', False)]

    for tc in visible_cases:
        result, err = _run_case(spec['id'], code, tc.get('input', ''))
        if err:
            return err   # infra failure (429/503) — abort the whole batch
        stdout   = (result.get('stdout') or '').strip()
        expected = (tc.get('expected', '') or '').strip()
        passed   = stdout == expected and result.get('status_id') == 3
        results.append({
            'input':          tc.get('input', ''),
            'expected':       expected,
            'output':         stdout,
            'passed':         passed,
            'time_ms':        result.get('time_ms'),
            'memory_kb':      result.get('memory_kb'),
            'status':         result.get('status', 'Unknown'),
            'stderr':         result.get('stderr'),
            'compile_output': result.get('compile_output'),
        })

    passed_count = sum(1 for r in results if r.get('passed'))
    score = round(passed_count / len(results) * 100, 1) if results else 0

    return jsonify({
        'results':      results,
        'passed':       passed_count,
        'total':        len(results),
        'score':        score,
        'all_passed':   passed_count == len(results),
    }), 200


# ── Authenticated: Submit (save progress) ────────────────────────────────────

@free_bp.route('/exercises/<exercise_id>/submit', methods=['POST'])
@require_auth
def submit_exercise(exercise_id):
    """
    Run code against ALL test cases (including hidden), store progress.
    """
    ex = FreeExercise.query.get_or_404(exercise_id)
    data = request.get_json()
    code     = data.get('code', '')
    language = data.get('language', 'python')

    if not code.strip():
        return jsonify({'error': 'No code provided'}), 400

    spec = resolve_language(language)
    if not spec:
        return jsonify({'error': f'Unsupported language: {language}'}), 400
    if spec['engine'] == 'browser':
        return jsonify({'error': 'Browser languages run client-side only.'}), 400
    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({'error': 'Code execution engine is not enabled on this server.'}), 503

    all_cases = ex.test_cases or []
    if not all_cases:
        return jsonify({'error': 'No test cases configured for this exercise'}), 400

    passed_count = 0
    for tc in all_cases:
        result, err = _run_case(spec['id'], code, tc.get('input', ''))
        if err:
            return err   # infra failure (429/503) — abort before scoring
        stdout   = (result.get('stdout') or '').strip()
        expected = (tc.get('expected', '') or '').strip()
        if stdout == expected and result.get('status_id') == 3:
            passed_count += 1

    score = round(passed_count / len(all_cases) * 100, 1)
    solved = passed_count == len(all_cases)

    # Upsert progress
    prog = FreeProgress.query.filter_by(
        user_id=g.user_id, exercise_id=exercise_id
    ).first()

    if not prog:
        prog = FreeProgress(
            user_id=g.user_id,
            exercise_id=exercise_id,
            course_id=ex.course_id,
        )
        db.session.add(prog)

    prog.attempts    = (prog.attempts or 0) + 1
    prog.last_code    = code
    prog.language_used= language
    prog.best_score   = prog.best_score or 0.0
    prog.xp_earned    = prog.xp_earned or 0
    was_already_solved = (prog.status == 'solved')
    if score > prog.best_score:
        prog.best_score = score
    if solved:
        if not was_already_solved:
            prog.status    = 'solved'
            prog.solved_at = datetime.utcnow()
            prog.xp_earned = ex.xp_reward

            # Real-time Track-2 platform sync
            from app.models.practice import StudentXP, StudentBadge
            from app.platform_rank.rating import compute_student_platform_rating
            xp = StudentXP.query.filter_by(student_id=g.user_id).first()
            if not xp:
                xp = StudentXP(student_id=g.user_id)
                db.session.add(xp)
            xp.add_xp(ex.xp_reward)
            xp.update_streak()
            if not StudentBadge.query.filter_by(student_id=g.user_id, badge_id='first_solve').first():
                db.session.add(StudentBadge(student_id=g.user_id, badge_id='first_solve'))
            compute_student_platform_rating(g.user_id, commit=False)
    else:
        if not was_already_solved:
            prog.status = 'attempted'

    db.session.commit()

    return jsonify({
        'passed':     passed_count,
        'total':      len(all_cases),
        'score':      score,
        'solved':     solved,
        'xp_earned':  prog.xp_earned,
        'status':     prog.status,
    }), 200


# ── Authenticated: MCQ Submit ─────────────────────────────────────────────────

@free_bp.route('/exercises/<exercise_id>/answer', methods=['POST'])
@require_auth
def submit_mcq(exercise_id):
    """Submit MCQ answer — reveals correct answer + explanation."""
    ex = FreeExercise.query.get_or_404(exercise_id)
    if ex.exercise_type != 'mcq':
        return jsonify({'error': 'Not an MCQ exercise'}), 400

    answer = (request.get_json() or {}).get('answer', '').upper()
    correct = answer == (ex.mcq_answer or '').upper()

    # Save progress
    prog = FreeProgress.query.filter_by(
        user_id=g.user_id, exercise_id=exercise_id
    ).first()
    if not prog:
        prog = FreeProgress(user_id=g.user_id, exercise_id=exercise_id, course_id=ex.course_id)
        db.session.add(prog)

    prog.attempts    = (prog.attempts or 0) + 1
    prog.xp_earned   = prog.xp_earned or 0
    if correct and prog.status != 'solved':
        prog.status  = 'solved'
        prog.best_score = 100.0
        prog.solved_at  = datetime.utcnow()
        prog.xp_earned  = ex.xp_reward

        from app.models.practice import StudentXP, StudentBadge
        from app.platform_rank.rating import compute_student_platform_rating
        xp = StudentXP.query.filter_by(student_id=g.user_id).first()
        if not xp:
            xp = StudentXP(student_id=g.user_id)
            db.session.add(xp)
        xp.add_xp(ex.xp_reward)
        xp.update_streak()
        if not StudentBadge.query.filter_by(student_id=g.user_id, badge_id='first_solve').first():
            db.session.add(StudentBadge(student_id=g.user_id, badge_id='first_solve'))
        compute_student_platform_rating(g.user_id, commit=False)

    db.session.commit()

    return jsonify({
        'correct':     correct,
        'your_answer': answer,
        'correct_answer': ex.mcq_answer,
        'explanation': ex.mcq_explanation,
        'xp_earned':   prog.xp_earned if correct else 0,
    }), 200


# ── Authenticated: My Progress ────────────────────────────────────────────────

@free_bp.route('/exercises/<exercise_id>/complete', methods=['POST'])
@require_auth
def complete_simulation(exercise_id):
    """Mark a simulation experiment as completed — awards XP once."""
    ex = FreeExercise.query.get_or_404(exercise_id)
    if ex.exercise_type != 'simulation':
        return jsonify({'error': 'Not a simulation exercise'}), 400

    prog = FreeProgress.query.filter_by(
        user_id=g.user_id, exercise_id=exercise_id
    ).first()
    if not prog:
        prog = FreeProgress(user_id=g.user_id, exercise_id=exercise_id,
                            course_id=ex.course_id)
        db.session.add(prog)

    already_solved = prog.status == 'solved'
    prog.attempts    = (prog.attempts or 0) + 1
    prog.xp_earned   = prog.xp_earned or 0
    if not already_solved:
        prog.status     = 'solved'
        prog.best_score = 100.0
        prog.solved_at  = datetime.utcnow()
        prog.xp_earned  = ex.xp_reward

        from app.models.practice import StudentXP, StudentBadge
        from app.platform_rank.rating import compute_student_platform_rating
        xp = StudentXP.query.filter_by(student_id=g.user_id).first()
        if not xp:
            xp = StudentXP(student_id=g.user_id)
            db.session.add(xp)
        xp.add_xp(ex.xp_reward)
        xp.update_streak()
        if not StudentBadge.query.filter_by(student_id=g.user_id, badge_id='first_solve').first():
            db.session.add(StudentBadge(student_id=g.user_id, badge_id='first_solve'))
        compute_student_platform_rating(g.user_id, commit=False)

    db.session.commit()

    return jsonify({
        'solved':     True,
        'xp_earned':  0 if already_solved else ex.xp_reward,
        'status':     prog.status,
    }), 200


@free_bp.route('/progress', methods=['GET'])
@require_auth
def my_progress():
    """Get current user's progress across all free courses."""
    records = FreeProgress.query.filter_by(user_id=g.user_id).all()

    # Group by course
    by_course = {}
    for r in records:
        cid = r.course_id
        if cid not in by_course:
            by_course[cid] = {'solved': 0, 'attempted': 0, 'xp': 0}
        by_course[cid]['xp'] += (r.xp_earned or 0)
        if r.status == 'solved':
            by_course[cid]['solved'] += 1
        else:
            by_course[cid]['attempted'] += 1

    total_xp = sum(r.xp_earned or 0 for r in records)
    total_solved = sum(1 for r in records if r.status == 'solved')

    return jsonify({
        'total_xp':     total_xp,
        'total_solved': total_solved,
        'by_course':    by_course,
        'records':      [r.to_dict() for r in records],
    }), 200


@free_bp.route('/progress/<course_id>', methods=['GET'])
@require_auth
def course_progress(course_id):
    """Progress for a specific course — which exercises solved/attempted."""
    records = FreeProgress.query.filter_by(
        user_id=g.user_id, course_id=course_id
    ).all()
    solved_ids = {r.exercise_id for r in records if r.status == 'solved'}
    return jsonify({
        'solved_ids': list(solved_ids),
        'records':    [r.to_dict() for r in records],
    }), 200


# ── Public: Leaderboard ───────────────────────────────────────────────────────

@free_bp.route('/leaderboard/<course_id>', methods=['GET'])
def leaderboard(course_id):
    """Top users by XP earned in a course."""
    from sqlalchemy import func
    rows = db.session.query(
        FreeProgress.user_id,
        func.sum(FreeProgress.xp_earned).label('total_xp'),
        func.count(FreeProgress.id).label('solved'),
    ).filter_by(course_id=course_id, status='solved').group_by(
        FreeProgress.user_id
    ).order_by(db.text('total_xp DESC')).limit(20).all()

    user_ids = [r[0] for r in rows]
    users = {u.id: u.full_name for u in User.query.filter(User.id.in_(user_ids)).all()}

    return jsonify({'leaderboard': [
        {'rank': i+1, 'user_id': r[0], 'name': users.get(r[0], 'Anonymous'),
         'xp': int(r[1]), 'solved': int(r[2])}
        for i, r in enumerate(rows)
    ]}), 200


# ── Platform Admin: Manage Free Courses ──────────────────────────────────────

@free_bp.route('/admin/courses', methods=['POST'])
@require_role('platform_admin')
def create_course():
    """Platform admin creates a free course."""
    data = request.get_json()
    if not data.get('title') or not data.get('slug'):
        return jsonify({'error': 'title and slug required'}), 400

    if FreeCourse.query.filter_by(slug=data['slug']).first():
        return jsonify({'error': 'Slug already exists'}), 409

    course = FreeCourse(
        slug=data['slug'],
        title=data['title'],
        description=data.get('description'),
        difficulty=data.get('difficulty', 'beginner'),
        tags=data.get('tags', []),
        language=data.get('language', 'python'),
        order_index=data.get('order_index', 0),
        is_published=data.get('is_published', False),
    )
    db.session.add(course)
    db.session.commit()
    return jsonify({'course': course.to_dict()}), 201


@free_bp.route('/admin/courses/<course_id>/exercises', methods=['POST'])
@require_role('platform_admin')
def create_exercise(course_id):
    """Add an exercise to a free course."""
    course = FreeCourse.query.get_or_404(course_id)
    data = request.get_json()

    ex = FreeExercise(
        course_id=course.id,
        title=data['title'],
        description=data.get('description'),
        hint_text=data.get('hint_text'),
        difficulty=data.get('difficulty', 'easy'),
        exercise_type=data.get('exercise_type', 'coding'),
        starter_code=data.get('starter_code', {}),
        allowed_languages=data.get('allowed_languages', ['python']),
        test_cases=data.get('test_cases', []),
        mcq_options=data.get('mcq_options'),
        mcq_answer=data.get('mcq_answer'),
        mcq_explanation=data.get('mcq_explanation'),
        xp_reward=data.get('xp_reward', 10),
        order_index=data.get('order_index', 0),
        time_limit_sec=data.get('time_limit_sec', 5),
        memory_limit_kb=data.get('memory_limit_kb', 131072),
        simulation_path=data.get('simulation_path'),
    )
    db.session.add(ex)
    db.session.commit()
    return jsonify({'exercise': ex.to_dict(include_answer=True)}), 201


@free_bp.route('/admin/courses/<course_id>/publish', methods=['POST'])
@require_role('platform_admin')
def publish_course(course_id):
    """Publish or unpublish a free course."""
    course = FreeCourse.query.get_or_404(course_id)
    published = request.get_json().get('published', True)
    course.is_published = published
    db.session.commit()
    return jsonify({'course': course.to_dict()}), 200