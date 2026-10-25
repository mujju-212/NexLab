"""
Free Platform Routes — public course catalog + practice execution
Accessible by: platform_user, student, instructor, platform_admin (all authenticated roles)
Course listing is fully PUBLIC (no auth required).
"""
import os
from sqlalchemy import func
from flask import Blueprint, request, jsonify, g, current_app, send_file
from app.extensions import db
from app.models.platform_content import PlatformCourse, PlatformExercise, PlatformProgress
from app.models.user import User
from app.auth.utils import require_auth, require_role
from app.execution.languages import resolve as resolve_language
from datetime import datetime

platform_user_bp = Blueprint('platform_user', __name__)


# ── Public: Course Catalog ────────────────────────────────────────────────────

@platform_user_bp.route('/courses', methods=['GET'])
def list_courses():
    """Public — list all published platform courses."""
    difficulty = request.args.get('difficulty')
    language   = request.args.get('language')
    tag        = request.args.get('tag')

    q = PlatformCourse.query.filter_by(is_published=True)
    if difficulty:
        q = q.filter_by(difficulty=difficulty)
    if language:
        q = q.filter_by(language=language)

    courses = q.order_by(PlatformCourse.order_index).all()

    if tag:
        courses = [c for c in courses if tag in (c.tags or [])]

    return jsonify({'courses': [c.to_dict() for c in courses]}), 200


@platform_user_bp.route('/courses/<course_id>', methods=['GET'])
def get_course(course_id):
    """Public — course detail with enriched real exercise list and user progress."""
    # Accept slug or UUID
    course = PlatformCourse.query.filter(
        (PlatformCourse.id == course_id) | (PlatformCourse.slug == course_id)
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

    # Topic summaries are derived only from tags actually attached to exercises.
    topic_counts = {}
    for exercise in exercises:
        for topic in exercise.tags or []:
            name = str(topic).strip()
            if not name:
                continue
            topic_counts.setdefault(name, {'total': 0, 'solved': 0})
            topic_counts[name]['total'] += 1

    solved_ids = set()
    attempted_ids = set()
    if user_id:
        progs = PlatformProgress.query.filter_by(user_id=user_id, course_id=course.id).all()
        for p in progs:
            if p.status == 'solved':
                solved_ids.add(p.exercise_id)
            elif p.status == 'attempted':
                attempted_ids.add(p.exercise_id)

    # Compute topic progress from the same exercise tags used to build the catalog.
    for exercise in exercises:
        if exercise.id in solved_ids:
            for topic in exercise.tags or []:
                name = str(topic).strip()
                if name in topic_counts:
                    topic_counts[name]['solved'] += 1
    topics_summary = [
        {
            'name': name,
            'solved': counts['solved'],
            'total': counts['total'],
            'pct': round(counts['solved'] / counts['total'] * 100) if counts['total'] else 0,
        }
        for name, counts in topic_counts.items()
    ]

    total_exercises = len(exercises)
    total_xp = sum(e.xp_reward or 0 for e in exercises)
    solved_count = len(solved_ids)
    attempted_count = len(attempted_ids)
    unsolved_count = max(0, total_exercises - solved_count - attempted_count)
    earned_xp = sum(e.xp_reward or 0 for e in exercises if e.id in solved_ids)
    pct_solved = round((solved_count / total_exercises) * 100) if total_exercises else 0
    pct_xp = round((earned_xp / total_xp) * 100) if total_xp else 0

    rank_in_course = None
    global_rank = None
    top_percentile = None
    try:
        from app.models.practice import StudentXP
        from sqlalchemy import func
        if user_id and solved_count > 0:
            per_user_xp = db.session.query(
                PlatformProgress.user_id.label('user_id'),
                func.sum(PlatformProgress.xp_earned).label('course_xp'),
            ).filter_by(course_id=course.id, status='solved').group_by(PlatformProgress.user_id).subquery()
            better_count = db.session.query(func.count()).select_from(per_user_xp).filter(
                per_user_xp.c.course_xp > earned_xp
            ).scalar() or 0
            rank_in_course = better_count + 1

        my_xp = db.session.query(StudentXP.total_xp).filter_by(student_id=user_id).scalar() if user_id else None
        has_global_activity = bool(my_xp and my_xp > 0)
        if user_id and has_global_activity:
            higher_xp_count = db.session.query(func.count(StudentXP.student_id)).filter(
                StudentXP.total_xp > my_xp
            ).scalar() or 0
            global_rank = higher_xp_count + 1
            total_students = db.session.query(func.count(StudentXP.student_id)).filter(
                StudentXP.total_xp > 0
            ).scalar() or 0
            if total_students:
                top_percentile = max(1, min(100, round((global_rank / total_students) * 100)))
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

    exercise_ids = [e.id for e in exercises]
    solved_counts = dict(db.session.query(
        PlatformProgress.exercise_id, func.count(PlatformProgress.id)
    ).filter(
        PlatformProgress.exercise_id.in_(exercise_ids),
        PlatformProgress.status == 'solved',
    ).group_by(PlatformProgress.exercise_id).all()) if exercise_ids else {}

    formatted_exercises = []
    for e in exercises:
        d = e.to_dict(actual_solves=solved_counts.get(e.id, 0))
        is_solved = e.id in solved_ids
        is_attempted = e.id in attempted_ids
        is_locked = (e.order_index > 6 and not is_solved)
        d['is_solved'] = is_solved
        d['is_attempted'] = is_attempted
        d['is_locked'] = is_locked
        d['action_label'] = 'Solve Again' if is_solved else ('Unlock' if is_locked else 'Solve')
        solves_count = d.get('solves_count', 0)
        d['solves_display'] = f"{solves_count / 1000:.1f}k solves" if solves_count >= 1000 else f"{solves_count} solves"
        formatted_exercises.append(d)

    course_dict = course.to_dict()
    course_dict['topic_count'] = len(topics_summary)

    return jsonify({
        'course': course_dict,
        'exercises': formatted_exercises,
        'user_progress': user_progress,
        'topics_summary': topics_summary,
    }), 200


@platform_user_bp.route('/exercises/<exercise_id>', methods=['GET'])
def get_exercise(exercise_id):
    """Public — single exercise detail (hidden test cases excluded)."""
    ex = PlatformExercise.query.get_or_404(exercise_id)
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


@platform_user_bp.route('/exercises/<exercise_id>/run', methods=['POST'])
@require_auth
def run_exercise(exercise_id):
    """
    Run code against public test cases only (no hidden cases exposed).
    Each case executes in the Docker sandbox (fixed 5 s / 256 MB caps).
    """
    ex = PlatformExercise.query.get_or_404(exercise_id)
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

    visible_cases = [tc for tc in (ex.test_cases or []) if not tc.get('hidden', False)]

    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({
            'error': 'Code execution is currently unavailable. Your code was not run.'
        }), 503

    results = []

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

@platform_user_bp.route('/exercises/<exercise_id>/submit', methods=['POST'])
@require_auth
def submit_exercise(exercise_id):
    """
    Run code against ALL test cases (including hidden), store progress.
    Returns per-test-case results with hidden test cases masked.
    """
    ex = PlatformExercise.query.get_or_404(exercise_id)
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

    all_cases = ex.test_cases or []
    if not all_cases:
        return jsonify({'error': 'No test cases configured for this exercise'}), 400

    results = []
    passed_count = 0

    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        return jsonify({
            'error': 'Code execution is currently unavailable. Your code was not run or saved.'
        }), 503
    else:
        for tc in all_cases:
            result, err = _run_case(spec['id'], code, tc.get('input', ''))
            if err:
                return err   # infra failure (429/503) — abort before scoring
            stdout   = (result.get('stdout') or '').strip()
            expected = (tc.get('expected', '') or '').strip()
            passed   = (stdout == expected and result.get('status_id') == 3)
            if passed:
                passed_count += 1
            is_hidden = bool(tc.get('hidden', False))
            results.append({
                'input':          '<hidden>' if is_hidden else tc.get('input', ''),
                'expected':       '<hidden>' if is_hidden else expected,
                'output':         '<hidden>' if is_hidden else stdout,
                'passed':         passed,
                'hidden':         is_hidden,
                'time_ms':        result.get('time_ms'),
                'memory_kb':      result.get('memory_kb'),
                'status':         result.get('status', 'Passed' if passed else 'Failed'),
                'stderr':         None if is_hidden else result.get('stderr'),
                'compile_output': None if is_hidden else result.get('compile_output'),
            })

    score = round(passed_count / len(all_cases) * 100, 1)
    solved = passed_count == len(all_cases)

    # Upsert progress
    prog = PlatformProgress.query.filter_by(
        user_id=g.user_id, exercise_id=exercise_id
    ).first()

    if not prog:
        prog = PlatformProgress(
            user_id=g.user_id,
            exercise_id=exercise_id,
            course_id=ex.course_id,
        )
        db.session.add(prog)

    prog.attempts     = (prog.attempts or 0) + 1
    prog.last_code     = code
    prog.language_used = language
    prog.best_score    = prog.best_score or 0.0
    prog.xp_earned     = prog.xp_earned or 0
    was_already_solved = (prog.status == 'solved')
    if score > prog.best_score:
        prog.best_score = score
    if solved:
        if not was_already_solved:
            prog.status    = 'solved'
            prog.solved_at = datetime.utcnow()
            prog.xp_earned = ex.xp_reward
            ex.solves_count = (ex.solves_count or 0) + 1

            # Real-time Track-2 platform sync
            from app.models.practice import StudentXP, StudentBadge
            from app.platform_rank.rating import compute_student_platform_rating, update_all_platform_ranks
            xp = StudentXP.query.filter_by(student_id=g.user_id).first()
            if not xp:
                xp = StudentXP(student_id=g.user_id)
                db.session.add(xp)
            xp.add_xp(ex.xp_reward)
            xp.update_streak()
            if not StudentBadge.query.filter_by(student_id=g.user_id, badge_id='first_solve').first():
                db.session.add(StudentBadge(student_id=g.user_id, badge_id='first_solve'))
            db.session.flush()
            compute_student_platform_rating(g.user_id, commit=False)
    else:
        if not was_already_solved:
            prog.status = 'attempted'

    db.session.commit()

    return jsonify({
        'results':    results,
        'passed':     passed_count,
        'total':      len(all_cases),
        'score':      score,
        'solved':     solved,
        'xp_earned':  prog.xp_earned,
        'status':     prog.status,
    }), 200


# ── Authenticated: MCQ Submit ─────────────────────────────────────────────────

@platform_user_bp.route('/exercises/<exercise_id>/answer', methods=['POST'])
@require_auth
def submit_mcq(exercise_id):
    """Submit MCQ answer — reveals correct answer + explanation."""
    ex = PlatformExercise.query.get_or_404(exercise_id)
    if ex.exercise_type != 'mcq':
        return jsonify({'error': 'Not an MCQ exercise'}), 400

    answer = (request.get_json() or {}).get('answer', '').upper()
    correct = answer == (ex.mcq_answer or '').upper()

    # Save progress
    prog = PlatformProgress.query.filter_by(
        user_id=g.user_id, exercise_id=exercise_id
    ).first()
    if not prog:
        prog = PlatformProgress(user_id=g.user_id, exercise_id=exercise_id, course_id=ex.course_id)
        db.session.add(prog)

    prog.attempts    = (prog.attempts or 0) + 1
    prog.xp_earned   = prog.xp_earned or 0
    if correct and prog.status != 'solved':
        prog.status  = 'solved'
        prog.best_score = 100.0
        prog.solved_at  = datetime.utcnow()
        prog.xp_earned  = ex.xp_reward
        ex.solves_count = (ex.solves_count or 0) + 1

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
        db.session.flush()
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

@platform_user_bp.route('/exercises/<exercise_id>/complete', methods=['POST'])
@require_auth
def complete_simulation(exercise_id):
    """Mark a simulation experiment or reading module as completed — awards XP once."""
    ex = PlatformExercise.query.get_or_404(exercise_id)
    if ex.exercise_type not in ('simulation', 'reading'):
        return jsonify({'error': 'Not a simulation or reading exercise'}), 400

    prog = PlatformProgress.query.filter_by(
        user_id=g.user_id, exercise_id=exercise_id
    ).first()
    if not prog:
        prog = PlatformProgress(user_id=g.user_id, exercise_id=exercise_id,
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
        ex.solves_count = (ex.solves_count or 0) + 1

        from app.models.practice import StudentXP, StudentBadge
        from app.platform_rank.rating import compute_student_platform_rating, update_all_platform_ranks
        xp = StudentXP.query.filter_by(student_id=g.user_id).first()
        if not xp:
            xp = StudentXP(student_id=g.user_id)
            db.session.add(xp)
        xp.add_xp(ex.xp_reward)
        xp.update_streak()
        if not StudentBadge.query.filter_by(student_id=g.user_id, badge_id='first_solve').first():
            db.session.add(StudentBadge(student_id=g.user_id, badge_id='first_solve'))
        compute_student_platform_rating(g.user_id, commit=False)
        update_all_platform_ranks()

    db.session.commit()

    return jsonify({
        'solved':     True,
        'xp_earned':  0 if already_solved else ex.xp_reward,
        'status':     prog.status,
    }), 200


@platform_user_bp.route('/progress', methods=['GET'])
@require_auth
def my_progress():
    """Get current user's progress across all platform courses, incorporating StudentXP and Practice solves."""
    from app.models.practice import StudentXP, PracticeSubmission
    records = PlatformProgress.query.filter_by(user_id=g.user_id).all()

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

    xp = StudentXP.query.filter_by(student_id=g.user_id).first()
    ex_map = {e.id: e.title for e in PlatformExercise.query.filter(
        PlatformExercise.id.in_([r.exercise_id for r in records])
    ).all()} if records else {}

    practice_solved = db.session.query(PracticeSubmission.problem_id).filter_by(
        student_id=g.user_id, status='Accepted', is_run=False
    ).distinct().count()

    course_xp = sum(r.xp_earned or 0 for r in records)
    course_solved = sum(1 for r in records if r.status == 'solved')

    return jsonify({
        'total_xp':     max(course_xp, xp.total_xp if xp else 0),
        'total_solved': course_solved + practice_solved,
        'by_course':    by_course,
        'records':      [{**r.to_dict(), 'exercise_title': ex_map.get(r.exercise_id, 'Exercise')} for r in records],
    }), 200


@platform_user_bp.route('/courses/<course_id>/certificate', methods=['GET'])
@require_auth
def course_certificate(course_id):
    """Download verified certificate for a completed platform course or study plan."""
    import pathlib
    from app.models.user import User as _User

    course = PlatformCourse.query.filter((PlatformCourse.id == course_id) | (PlatformCourse.slug == course_id)).first()
    if not course:
        # Check if it's a study plan
        from app.models.practice import StudyPlan, StudyPlanProgress
        plan = StudyPlan.query.filter((StudyPlan.id == course_id) | (StudyPlan.slug == course_id)).first()
        if plan:
            prog = StudyPlanProgress.query.filter_by(student_id=g.user_id, plan_id=plan.id).first()
            if not prog or not prog.completed:
                return jsonify({'error': 'Complete the plan first to earn your certificate.'}), 400
            path = prog.certificate_path
            if not path or not os.path.exists(path):
                from app.practice.routes import _generate_plan_certificate
                prog.certificate_path = _generate_plan_certificate(g.user_id, plan)
                db.session.commit()
                path = prog.certificate_path
            return send_file(path, as_attachment=True, download_name=f'nexlab_certificate_{plan.slug}.pdf')
        return jsonify({'error': 'Course not found.'}), 404

    # Check that user solved all exercises in this course
    total_exercises = PlatformExercise.query.filter_by(course_id=course.id).count()
    if total_exercises == 0:
        return jsonify({'error': 'Course has no exercises.'}), 400

    solved_count = PlatformProgress.query.filter_by(
        user_id=g.user_id, course_id=course.id, status='solved'
    ).count()

    if solved_count < total_exercises:
        return jsonify({'error': f'Complete all exercises ({solved_count}/{total_exercises} solved) to earn your certificate.'}), 400

    user = _User.query.get(g.user_id)
    student_name = user.full_name if user else 'Learner'
    issued = datetime.utcnow().strftime('%d %B %Y')
    cert_id = f'NEX-{course.slug[:12].upper()}-{g.user_id[:8].upper()}'

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body {{ font-family: Georgia, serif; text-align: center; padding: 60px 40px; color: #2d2438; }}
  .frame {{ border: 6px double #7c3aed; border-radius: 16px; padding: 46px 30px; }}
  .brand {{ letter-spacing: 6px; font-size: 13px; color: #7c3aed; font-weight: bold; }}
  h1 {{ font-size: 34px; margin: 18px 0 4px; letter-spacing: 2px; }}
  .sub {{ font-size: 14px; color: #6b6480; margin-bottom: 26px; }}
  .name {{ font-size: 30px; font-style: italic; margin: 16px 0; border-bottom: 2px solid #c4b5fd; display: inline-block; padding: 0 34px 8px; }}
  .body {{ font-size: 15px; line-height: 1.7; margin: 14px 0 24px; }}
  .meta {{ font-size: 11.5px; color: #9891a6; margin-top: 30px; }}
</style></head><body>
  <div class="frame">
    <div class="brand">NEXLAB ACADEMY</div>
    <h1>Certificate of Completion</h1>
    <p class="sub">This certifies that</p>
    <div class="name">{student_name}</div>
    <p class="body">has successfully completed the interactive curriculum<br/>
       <strong>{course.title}</strong><br/>
       ({total_exercises} exercises &middot; {course.difficulty})</p>
    <div class="meta">
      Certificate ID: {cert_id} &middot; Issued {issued}<br/>
      Verify at your NexLab profile.
    </div>
  </div>
</body></html>"""

    out_dir = pathlib.Path(__file__).parent.parent.parent / 'certificates'
    out_dir.mkdir(exist_ok=True)
    path = out_dir / f'course_{course.slug}_{g.user_id[:8]}.pdf'

    try:
        import pdfkit
        pdf_bytes = pdfkit.from_string(html, False, options={
            'page-size': 'A4', 'orientation': 'Landscape',
            'margin-top': '10mm', 'margin-bottom': '10mm',
            'enable-local-file-access': '',
        })
        path.write_bytes(pdf_bytes)
        try:
            from app.services.storage import store_file
            store_file(str(path), f'certificates/{path.name}')
        except Exception:
            pass
    except Exception:
        try:
            from app.services.pdf_service import _render_pdf
            pdf_bytes = _render_pdf(html)
            path.write_bytes(pdf_bytes)
            try:
                from app.services.storage import store_file
                store_file(str(path), f'certificates/{path.name}')
            except Exception:
                pass
        except Exception:
            html_path = out_dir / f'course_{course.slug}_{g.user_id[:8]}.html'
            html_path.write_text(html, encoding='utf-8')
            return send_file(html_path, as_attachment=True, download_name=f'nexlab_certificate_{course.slug}.html')

    return send_file(path, as_attachment=True, download_name=f'nexlab_certificate_{course.slug}.pdf')


@platform_user_bp.route('/progress/<course_id>', methods=['GET'])
@require_auth
def course_progress(course_id):
    """Progress for a specific course — which exercises solved/attempted."""
    records = PlatformProgress.query.filter_by(
        user_id=g.user_id, course_id=course_id
    ).all()
    solved_ids = {r.exercise_id for r in records if r.status == 'solved'}
    return jsonify({
        'solved_ids': list(solved_ids),
        'records':    [r.to_dict() for r in records],
    }), 200


# ── Public: Leaderboard ───────────────────────────────────────────────────────

@platform_user_bp.route('/leaderboard/<course_id>', methods=['GET'])
def leaderboard(course_id):
    """Top users by XP earned in a course."""
    from sqlalchemy import func
    rows = db.session.query(
        PlatformProgress.user_id,
        func.sum(PlatformProgress.xp_earned).label('total_xp'),
        func.count(PlatformProgress.id).label('solved'),
    ).filter_by(course_id=course_id, status='solved').group_by(
        PlatformProgress.user_id
    ).order_by(db.text('total_xp DESC')).limit(20).all()

    user_ids = [r[0] for r in rows]
    users = {u.id: u.full_name for u in User.query.filter(User.id.in_(user_ids)).all()}

    return jsonify({'leaderboard': [
        {'rank': i+1, 'user_id': r[0], 'name': users.get(r[0], 'Anonymous'),
         'xp': int(r[1]), 'solved': int(r[2])}
        for i, r in enumerate(rows)
    ]}), 200


# ── Platform Admin: Manage Platform Courses ──────────────────────────────────────

@platform_user_bp.route('/admin/courses', methods=['POST'])
@require_role('platform_admin')
def create_course():
    """Platform admin creates a platform course."""
    data = request.get_json()
    if not data.get('title') or not data.get('slug'):
        return jsonify({'error': 'title and slug required'}), 400

    if PlatformCourse.query.filter_by(slug=data['slug']).first():
        return jsonify({'error': 'Slug already exists'}), 409

    course = PlatformCourse(
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


@platform_user_bp.route('/admin/courses/<course_id>/exercises', methods=['POST'])
@require_role('platform_admin')
def create_exercise(course_id):
    """Add an exercise to a platform course."""
    course = PlatformCourse.query.get_or_404(course_id)
    data = request.get_json()

    ex = PlatformExercise(
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


@platform_user_bp.route('/admin/courses/<course_id>/publish', methods=['POST'])
@require_role('platform_admin')
def publish_course(course_id):
    """Publish or unpublish a platform course."""
    course = PlatformCourse.query.get_or_404(course_id)
    published = request.get_json().get('published', True)
    course.is_published = published
    db.session.commit()
    return jsonify({'course': course.to_dict()}), 200