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
from datetime import datetime
import requests as req
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
    """Public — course detail with exercise list (no answers exposed)."""
    # Accept slug or UUID
    course = FreeCourse.query.filter(
        (FreeCourse.id == course_id) | (FreeCourse.slug == course_id)
    ).filter_by(is_published=True).first_or_404()

    exercises = course.exercises.filter_by(is_published=True).all()
    return jsonify({
        'course': course.to_dict(),
        'exercises': [e.to_dict() for e in exercises],
    }), 200


@free_bp.route('/exercises/<exercise_id>', methods=['GET'])
def get_exercise(exercise_id):
    """Public — single exercise detail (hidden test cases excluded)."""
    ex = FreeExercise.query.get_or_404(exercise_id)
    if not ex.is_published:
        return jsonify({'error': 'Exercise not available'}), 404
    return jsonify({'exercise': ex.to_dict()}), 200


# ── Authenticated: Run Code ───────────────────────────────────────────────────

@free_bp.route('/exercises/<exercise_id>/run', methods=['POST'])
@require_auth
def run_exercise(exercise_id):
    """
    Run code against public test cases only (no hidden cases exposed).
    Uses same Judge0 integration as the main execution service.
    """
    ex = FreeExercise.query.get_or_404(exercise_id)
    data = request.get_json()
    code     = data.get('code', '')
    language = data.get('language', 'python')

    if not code.strip():
        return jsonify({'error': 'No code provided'}), 400

    judge0_url = current_app.config['JUDGE0_URL']
    LANG_IDS = {
        'python': 71, 'python3': 71,
        'cpp': 54, 'c++': 54,
        'c': 50,
        'java': 62,
        'javascript': 63, 'js': 63,
    }
    lang_id = LANG_IDS.get(language.lower(), 71)

    results = []
    visible_cases = [tc for tc in (ex.test_cases or []) if not tc.get('hidden', False)]

    for tc in visible_cases:
        try:
            r = req.post(f'{judge0_url}/submissions?wait=true', json={
                'source_code': code,
                'language_id': lang_id,
                'stdin':       tc.get('input', ''),
                'expected_output': tc.get('expected', ''),
                'cpu_time_limit':  ex.time_limit_sec,
                'memory_limit':    ex.memory_limit_kb,
            }, timeout=15)
            result = r.json()
            stdout = (result.get('stdout') or '').strip()
            expected = (tc.get('expected', '') or '').strip()
            passed = stdout == expected and result.get('status', {}).get('id') == 3

            results.append({
                'input':    tc.get('input', ''),
                'expected': expected,
                'output':   stdout,
                'passed':   passed,
                'time':     result.get('time'),
                'memory':   result.get('memory'),
                'status':   result.get('status', {}).get('description', 'Unknown'),
                'stderr':   result.get('stderr'),
                'compile_output': result.get('compile_output'),
            })
        except Exception as e:
            results.append({'passed': False, 'error': str(e), 'input': tc.get('input', '')})

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

    judge0_url = current_app.config['JUDGE0_URL']
    LANG_IDS = {'python': 71, 'python3': 71, 'cpp': 54, 'c++': 54,
                'c': 50, 'java': 62, 'javascript': 63}
    lang_id = LANG_IDS.get(language.lower(), 71)

    all_cases = ex.test_cases or []
    if not all_cases:
        return jsonify({'error': 'No test cases configured for this exercise'}), 400

    passed_count = 0
    for tc in all_cases:
        try:
            r = req.post(f'{judge0_url}/submissions?wait=true', json={
                'source_code': code, 'language_id': lang_id,
                'stdin': tc.get('input', ''),
                'expected_output': tc.get('expected', ''),
                'cpu_time_limit': ex.time_limit_sec,
                'memory_limit': ex.memory_limit_kb,
            }, timeout=15)
            result = r.json()
            stdout = (result.get('stdout') or '').strip()
            expected = (tc.get('expected', '') or '').strip()
            if stdout == expected and result.get('status', {}).get('id') == 3:
                passed_count += 1
        except Exception:
            pass

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
    if score > prog.best_score:
        prog.best_score = score
    if solved and prog.status != 'solved':
        prog.status    = 'solved'
        prog.solved_at = datetime.utcnow()
        prog.xp_earned = ex.xp_reward
    else:
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