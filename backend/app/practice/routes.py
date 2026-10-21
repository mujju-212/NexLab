"""
Practice Library API Routes
GET  /api/practice/problems                    - list + filter
GET  /api/practice/problems/<slug>             - detail
GET  /api/practice/problems/<slug>/submissions - this student's submission history
POST /api/practice/problems/<slug>/run         - run vs sample cases
POST /api/practice/problems/<slug>/submit      - judge vs all cases, award XP/badges
GET  /api/practice/topics                      - all topics + counts
GET  /api/practice/daily                       - today's daily challenge
GET  /api/practice/quest/stats                 - XP, level, streak, badges, rank
GET  /api/practice/quest/leaderboard           - top students (institution / global)
POST /api/practice/quest/daily-checkin         - advance streak once per day
GET  /api/practice/plans                       - study plans list
GET  /api/practice/plans/<plan_id>             - plan detail with sections
POST /api/practice/plans/<id>/enroll           - enroll in plan
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.practice import (
    Problem, PracticeTestCase, PracticeSubmission,
    StudyPlan, StudyPlanSection, StudyPlanProgress,
    StudentXP, StudentBadge, BADGE_CATALOG, XP_TABLE
)
from datetime import date, datetime, timedelta, time
import hashlib
import calendar
from sqlalchemy import func

practice_bp = Blueprint('practice', __name__)


def _get_or_create_xp(student_id):
    xp = StudentXP.query.filter_by(student_id=student_id).first()
    if not xp:
        xp = StudentXP(student_id=student_id)
        db.session.add(xp)
        db.session.flush()
    return xp


def _award_badge(student_id, badge_id):
    """Insert a badge if the student doesn't already have it (idempotent)."""
    if badge_id not in BADGE_CATALOG:
        return
    exists = StudentBadge.query.filter_by(student_id=student_id, badge_id=badge_id).first()
    if not exists:
        db.session.add(StudentBadge(student_id=student_id, badge_id=badge_id))


def _update_plan_progress(student_id, problem_slug):
    """Mark a solved problem inside every enrolled plan that contains it; award the
    plan's completion badge + certificate once all of its problems are solved."""
    progs = StudyPlanProgress.query.filter_by(student_id=student_id).all()
    for prog in progs:
        plan = StudyPlan.query.get(prog.plan_id)
        if not plan:
            continue
        all_slugs = []
        for sec in plan.sections:            # lazy='dynamic'
            all_slugs.extend(sec.problem_ids or [])
        if problem_slug not in all_slugs:
            continue
        solved = set(prog.solved_slugs or [])
        if problem_slug not in solved:
            solved.add(problem_slug)
            prog.solved_slugs = sorted(solved)   # reassign so JSON change is tracked
        if all_slugs and solved.issuperset(all_slugs) and not prog.completed_at:
            prog.completed_at = datetime.utcnow()
            if plan.badge_id and not prog.badge_awarded:
                _award_badge(student_id, plan.badge_id)
                prog.badge_awarded = True
            # F7 — plan-completion certificate (PDF, idempotent)
            if not prog.certificate_path:
                try:
                    prog.certificate_path = _generate_plan_certificate(student_id, plan)
                except Exception as exc:
                    from flask import current_app as _app
                    _app.logger.warning('[practice] certificate generation failed: %s', exc)


def _generate_plan_certificate(student_id, plan) -> str:
    """Render a completion certificate PDF via pdfkit (same infra as lab records)."""
    import pathlib
    from app.models.user import User as _User

    user = _User.query.get(student_id)
    student_name = user.full_name if user else 'Student'
    issued = datetime.utcnow().strftime('%d %B %Y')
    cert_id = f'NEX-{plan.slug[:10].upper()}-{student_id[:8].upper()}'

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
    <div class="brand">NEXLAB PRACTICE</div>
    <h1>Certificate of Completion</h1>
    <p class="sub">This certifies that</p>
    <div class="name">{student_name}</div>
    <p class="body">has successfully completed the practice plan<br/>
       <strong>{plan.title}</strong><br/>
       ({plan.total_problems} problems &middot; {plan.difficulty_mix})</p>
    <div class="meta">
      Certificate ID: {cert_id} &middot; Issued {issued}<br/>
      Verify at your NexLab profile.
    </div>
  </div>
</body></html>"""

    try:
        import pdfkit
        pdf_bytes = pdfkit.from_string(html, False, options={
            'page-size': 'A4', 'orientation': 'Landscape',
            'margin-top': '10mm', 'margin-bottom': '10mm',
            'enable-local-file-access': '',
        })
    except Exception:
        from app.services.pdf_service import _render_pdf
        pdf_bytes = _render_pdf(html)

    out_dir = pathlib.Path(__file__).parent.parent.parent / 'certificates'
    out_dir.mkdir(exist_ok=True)
    path = out_dir / f'plan_{plan.slug}_{student_id[:8]}.pdf'
    path.write_bytes(pdf_bytes)
    return str(path)


def _reward_solve(student_id, problem, xp_earned, elapsed_sec=None):
    """First-time accepted solve: add XP, bump difficulty counters, streak, badges,
    study-plan progress, and the leaderboard (top_10) / speed_demon badges."""
    from sqlalchemy import func
    from app.models.user import User

    xp = _get_or_create_xp(student_id)
    xp.add_xp(xp_earned)
    xp.update_streak()
    xp.problems_solved += 1
    if problem.difficulty == 'Easy':
        xp.easy_solved += 1
    elif problem.difficulty == 'Medium':
        xp.medium_solved += 1
    elif problem.difficulty == 'Hard':
        xp.hard_solved += 1

    # Milestone badges
    if xp.problems_solved == 1:
        _award_badge(student_id, 'first_solve')
    if xp.problems_solved >= 100:
        _award_badge(student_id, 'centurion')
    if xp.streak_days >= 7:
        _award_badge(student_id, 'streak_7')
    if xp.streak_days >= 30:
        _award_badge(student_id, 'streak_30')
    if xp.easy_solved >= 10:
        _award_badge(student_id, 'easy_10')
    if xp.medium_solved >= 10:
        _award_badge(student_id, 'medium_10')
    if xp.hard_solved >= 5:
        _award_badge(student_id, 'hard_5')

    # Speed demon — accepted within 5 minutes of opening (frontend passes elapsed_sec)
    if elapsed_sec is not None and 0 < elapsed_sec <= 300:
        _award_badge(student_id, 'speed_demon')

    # Top 10 of the student's institution leaderboard
    me = User.query.get(student_id)
    if me and me.institution_id:
        higher = db.session.query(func.count(StudentXP.id)).join(
            User, User.id == StudentXP.student_id
        ).filter(
            User.institution_id == me.institution_id,
            StudentXP.total_xp > xp.total_xp,
        ).scalar() or 0
        if higher < 10:
            _award_badge(student_id, 'top_10')

    # Study-plan progress + plan-completion badges
    _update_plan_progress(student_id, problem.slug)

    # Precompute and update Track-2 PlatformRating in DB for fast O(1) reads
    try:
        from app.platform_rank.rating import compute_student_platform_rating, update_all_platform_ranks
        compute_student_platform_rating(student_id, commit=False)
        update_all_platform_ranks()
    except Exception:
        pass

    return xp


# ── Problem List ──────────────────────────────────────────────────────────────

@practice_bp.route('/problems', methods=['GET'])
@require_role('student', 'free_user')
def list_problems():
    """List problems with optional filters: topic, difficulty, status, search"""
    q = Problem.query.filter_by(is_active=True)

    topic = request.args.get('topic')
    difficulty = request.args.get('difficulty')
    search = request.args.get('search', '').strip()

    if topic:
        from app.platform_rank.blended import expand_topic_aliases
        aliases = expand_topic_aliases(topic)
        q = q.filter(Problem.nexlab_topic.in_(aliases))
    if difficulty:
        q = q.filter_by(difficulty=difficulty)
    if search:
        q = q.filter(Problem.title.ilike(f'%{search}%'))

    problems = q.order_by(db.cast(Problem.lc_id, db.Integer).asc()).all()

    # Fetch this student's solved slugs
    solved = set()
    attempted = set()
    subs = PracticeSubmission.query.filter_by(
        student_id=g.user_id, is_run=False
    ).with_entities(PracticeSubmission.problem_id, PracticeSubmission.status).all()
    for sub in subs:
        if sub.status == 'Accepted':
            solved.add(sub.problem_id)
        else:
            attempted.add(sub.problem_id)

    result = []
    for p in problems:
        d = p.to_list_dict()
        if p.id in solved:
            d['status'] = 'solved'
        elif p.id in attempted:
            d['status'] = 'attempted'
        else:
            d['status'] = 'todo'
        result.append(d)

    return jsonify({'problems': result, 'total': len(result)}), 200


# ── Problem Detail ────────────────────────────────────────────────────────────

@practice_bp.route('/problems/<slug>', methods=['GET'])
@require_role('student', 'free_user')
def get_problem(slug):
    problem = Problem.query.filter_by(slug=slug, is_active=True).first_or_404()

    # Sample test cases (visible)
    samples = PracticeTestCase.query.filter_by(
        problem_id=problem.id, is_sample=True
    ).order_by(PracticeTestCase.order_index).all()

    # Student's submissions for this problem
    my_subs = PracticeSubmission.query.filter_by(
        student_id=g.user_id, problem_id=problem.id, is_run=False
    ).order_by(PracticeSubmission.submitted_at.desc()).limit(10).all()

    # Navigation: prev and next problems
    prev_prob = None
    next_prob = None
    try:
        curr_lc = int(problem.lc_id) if problem.lc_id and str(problem.lc_id).isdigit() else None
        if curr_lc is not None:
            prev_prob = Problem.query.filter(
                Problem.is_active == True,
                db.cast(Problem.lc_id, db.Integer) < curr_lc
            ).order_by(db.cast(Problem.lc_id, db.Integer).desc()).first()
            next_prob = Problem.query.filter(
                Problem.is_active == True,
                db.cast(Problem.lc_id, db.Integer) > curr_lc
            ).order_by(db.cast(Problem.lc_id, db.Integer).asc()).first()
    except Exception:
        pass

    if not prev_prob:
        prev_prob = Problem.query.filter(
            Problem.is_active == True,
            Problem.id < problem.id
        ).order_by(Problem.id.desc()).first()
    if not next_prob:
        next_prob = Problem.query.filter(
            Problem.is_active == True,
            Problem.id > problem.id
        ).order_by(Problem.id.asc()).first()

    return jsonify({
        'problem': problem.to_dict(include_description=True),
        'sample_cases': [tc.to_dict() for tc in samples],
        'my_submissions': [s.to_dict(include_code=True) for s in my_subs],
        'prev_slug': prev_prob.slug if prev_prob else None,
        'next_slug': next_prob.slug if next_prob else None,
    }), 200


@practice_bp.route('/problems/<slug>/submissions', methods=['GET'])
@require_role('student', 'free_user')
def problem_submissions(slug):
    """Full submission history for the current student on this problem (newest first).
    Includes code (owner-scoped) so the UI can diff consecutive attempts."""
    problem = Problem.query.filter_by(slug=slug, is_active=True).first_or_404()
    subs = PracticeSubmission.query.filter_by(
        student_id=g.user_id, problem_id=problem.id, is_run=False
    ).order_by(PracticeSubmission.submitted_at.desc()).all()
    return jsonify({
        'problem_slug': slug,
        'submissions': [s.to_dict(include_code=True) for s in subs],
        'total': len(subs),
    }), 200


@practice_bp.route('/submissions/recent', methods=['GET'])
@require_role('student', 'free_user')
def recent_submissions():
    """Recent submissions across all practice problems for the current student/free_user."""
    limit = min(int(request.args.get('limit', 15)), 100)
    subs = PracticeSubmission.query.filter_by(
        student_id=g.user_id, is_run=False
    ).order_by(PracticeSubmission.submitted_at.desc()).limit(limit).all()

    result = []
    for s in subs:
        prob = Problem.query.get(s.problem_id)
        result.append({
            'id': s.id,
            'problem_id': s.problem_id,
            'title': prob.title if prob else 'Algorithm Problem',
            'slug': prob.slug if prob else '',
            'difficulty': prob.difficulty if prob else 'Easy',
            'status': s.status,
            'is_solved': s.status == 'Accepted',
            'language': s.language,
            'passed': s.passed,
            'total': s.total,
            'time_ms': s.time_ms,
            'memory_kb': s.memory_kb,
            'xp_earned': s.xp_earned,
            'submitted_at': s.submitted_at.isoformat() + 'Z' if s.submitted_at else None,
        })
    return jsonify({
        'submissions': result,
        'total': len(result)
    }), 200


@practice_bp.route('/profile-overview', methods=['GET'])
@require_role('student', 'free_user')
def profile_overview():
    """Consolidated profile stats with problem library totals, solve counts, and difficulty breakdown."""
    xp = _get_or_create_xp(g.user_id)

    total_easy = Problem.query.filter_by(difficulty='Easy', is_active=True).count()
    total_medium = Problem.query.filter_by(difficulty='Medium', is_active=True).count()
    total_hard = Problem.query.filter_by(difficulty='Hard', is_active=True).count()

    all_subs = PracticeSubmission.query.filter_by(student_id=g.user_id, is_run=False).all()
    accepted_subs = [s for s in all_subs if s.status == 'Accepted']
    solved_problem_ids = set([s.problem_id for s in accepted_subs])
    attempted_problem_ids = set([s.problem_id for s in all_subs if s.problem_id not in solved_problem_ids])

    # Difficulties of solved problems
    solved_probs = Problem.query.filter(Problem.id.in_(list(solved_problem_ids))).all() if solved_problem_ids else []
    easy_solved = sum(1 for p in solved_probs if p.difficulty == 'Easy')
    medium_solved = sum(1 for p in solved_probs if p.difficulty == 'Medium')
    hard_solved = sum(1 for p in solved_probs if p.difficulty == 'Hard')

    total_submissions = len(all_subs)
    acceptance_rate = round((len(accepted_subs) / max(1, total_submissions)) * 100, 1) if total_submissions > 0 else 0

    return jsonify({
        'total_xp': xp.total_xp,
        'streak_days': xp.streak_days or 0,
        'longest_streak': getattr(xp, 'longest_streak', None) or xp.streak_days or 0,
        'total_solved': len(solved_problem_ids),
        'total_attempted': len(attempted_problem_ids),
        'total_submissions': total_submissions,
        'acceptance_rate': acceptance_rate,
        'easy': {
            'solved': easy_solved,
            'total': max(total_easy, 16),
            'percentage': round((easy_solved / max(total_easy, 16)) * 100, 1),
        },
        'medium': {
            'solved': medium_solved,
            'total': max(total_medium, 72),
            'percentage': round((medium_solved / max(total_medium, 72)) * 100, 1),
        },
        'hard': {
            'solved': hard_solved,
            'total': max(total_hard, 16),
            'percentage': round((hard_solved / max(total_hard, 16)) * 100, 1),
        },
    }), 200


# ── Topics ────────────────────────────────────────────────────────────────────

@practice_bp.route('/topics', methods=['GET'])
@require_role('student', 'free_user')
def list_topics():
    """All topic groups with problem counts, difficulty breakdown, and student's solved count."""
    from sqlalchemy import func

    # Total per topic
    topic_counts = db.session.query(
        Problem.nexlab_topic,
        func.count(Problem.id).label('total')
    ).filter_by(is_active=True).group_by(Problem.nexlab_topic).all()

    # Breakdown by difficulty
    diff_counts = db.session.query(
        Problem.nexlab_topic,
        Problem.difficulty,
        func.count(Problem.id).label('cnt')
    ).filter_by(is_active=True).group_by(Problem.nexlab_topic, Problem.difficulty).all()

    diff_map = {}
    for t, d, cnt in diff_counts:
        diff_map.setdefault(t, {})[d] = cnt

    # Student's solved per topic
    solved_ids = db.session.query(PracticeSubmission.problem_id).filter_by(
        student_id=g.user_id, status='Accepted', is_run=False
    ).distinct().subquery()

    solved_by_topic = db.session.query(
        Problem.nexlab_topic,
        func.count(Problem.id).label('solved')
    ).join(solved_ids, Problem.id == solved_ids.c.problem_id
    ).group_by(Problem.nexlab_topic).all()

    solved_map = {row.nexlab_topic: row.solved for row in solved_by_topic}

    solved_diff = db.session.query(
        Problem.nexlab_topic,
        Problem.difficulty,
        func.count(Problem.id).label('cnt')
    ).join(solved_ids, Problem.id == solved_ids.c.problem_id
    ).group_by(Problem.nexlab_topic, Problem.difficulty).all()

    solved_diff_map = {}
    for t, d, cnt in solved_diff:
        solved_diff_map.setdefault(t, {})[d] = cnt

    TOPIC_DESCRIPTIONS = {
        'Array': 'Fundamental array problems and techniques.',
        'String': 'String manipulation and pattern matching.',
        'Hash Table': 'Hashing, maps, and frequency counting.',
        'Stack': 'Stack data structure and applications.',
        'Queue': 'Queue and deque based problems.',
        'Linked List': 'Singly, doubly and circular linked lists.',
        'Tree': 'Binary trees, BST, and tree traversals.',
        'Graph': 'Graph algorithms and network problems.',
        'Dynamic Programming': 'DP from basics to advanced.',
        'Greedy': 'Greedy algorithms and optimization.',
        'Backtracking': 'Recursive exploration and state space search.',
        'Binary Search': 'Binary search and search space problems.',
        'Bit Manipulation': 'Bitwise operations and low-level tricks.',
        'Math': 'Number theory and mathematical problems.',
        'Two Pointers': 'Two pointer and sliding window techniques.',
        'Sliding Window': 'Fixed and dynamic sliding window patterns.',
        'Heap': 'Priority queues, heaps and top-K elements.',
        'Trie': 'Prefix trees for efficient string retrieval.',
        'Matrix': '2D grids, matrix operations and traversals.',
        'Recursion': 'Divide-and-conquer and recursive definitions.',
        'Sorting': 'Sorting algorithms and comparator patterns.',
        'SQL': 'Relational queries, joins, groupings and aggregates.',
    }

    # Section grouping (matches plan)
    SECTION_MAP = {
        'Foundations':      ['Array', 'Matrix', 'String', 'Math', 'Number Theory', 'Sorting', 'Recursion'],
        'Data Structures':  ['Hash Table', 'Linked List', 'Stack', 'Monotonic Stack', 'Queue',
                             'Heap', 'Tree', 'Trie', 'Binary Search Tree', 'Segment Tree', 'Design'],
        'Algorithms':       ['Binary Search', 'Two Pointers', 'Sliding Window', 'Prefix Sum',
                             'Greedy', 'Backtracking', 'Dynamic Programming', 'Bit Manipulation'],
        'Graphs':           ['Graph', 'Union Find'],
        'SQL & Shell':      ['SQL', 'Shell'],
    }
    section_of = {}
    for sec, topics in SECTION_MAP.items():
        for t in topics:
            section_of[t] = sec

    result = []
    for row in topic_counts:
        t = row.nexlab_topic
        dm = diff_map.get(t, {})
        sdm = solved_diff_map.get(t, {})
        result.append({
            'topic':        t,
            'section':      section_of.get(t, 'Other'),
            'description':  TOPIC_DESCRIPTIONS.get(t, f'Core problems and algorithms for {t}.'),
            'total':        row.total,
            'solved':       solved_map.get(t, 0),
            'easy_total':   dm.get('Easy', 0),
            'medium_total': dm.get('Medium', 0),
            'hard_total':   dm.get('Hard', 0),
            'easy_solved':   sdm.get('Easy', 0),
            'medium_solved': sdm.get('Medium', 0),
            'hard_solved':   sdm.get('Hard', 0),
        })

    result.sort(key=lambda x: (x['section'], -x['total'], x['topic']))
    return jsonify({'topics': result}), 200


# ── Daily Challenge ───────────────────────────────────────────────────────────

def _get_daily_problem_for_date(target_date: date):
    """Retrieve the daily challenge problem for a given date."""
    p = Problem.query.filter_by(is_daily=True, daily_date=target_date).first()
    if p:
        return p
    active = Problem.query.filter_by(is_active=True).order_by(Problem.id).all()
    if not active:
        return None
    day_hash = int(hashlib.md5(f"nexlab-daily-{target_date.isoformat()}".encode()).hexdigest(), 16)
    return active[day_hash % len(active)]


def _build_calendar_days(target_year: int, target_month: int, today: date, solved_dates: set, solved_today: bool, current_streak: int):
    """Build full month grid with Sunday as first weekday (matches mockup layout)."""
    cal = calendar.Calendar(firstweekday=calendar.SUNDAY)
    weeks = cal.monthdatescalendar(target_year, target_month)
    flat_days = []

    for week in weeks:
        for d in week:
            is_current_month = (d.month == target_month and d.year == target_year)
            is_today = (d == today)
            is_future = (d > today)

            if is_today:
                status = 'today_solved' if (d in solved_dates or solved_today) else 'today'
            elif is_future:
                status = 'upcoming'
            else:
                days_ago = (today - d).days
                was_solved = (d in solved_dates) or (0 <= days_ago < current_streak)
                status = 'solved' if was_solved else 'missed'

            flat_days.append({
                'day': d.day,
                'date': d.isoformat(),
                'is_current_month': is_current_month,
                'status': status,
            })

    return flat_days


@practice_bp.route('/daily', methods=['GET'])
@require_role('student', 'free_user')
def daily_challenge():
    today = date.today()
    problem = _get_daily_problem_for_date(today)
    if not problem:
        return jsonify({'daily': None}), 200

    # Has the user solved today's problem?
    solved_sub = PracticeSubmission.query.filter_by(
        student_id=g.user_id, problem_id=problem.id,
        status='Accepted', is_run=False
    ).first()
    solved_today = bool(solved_sub)

    # Acceptance & solvers count from real database
    solvers_count = db.session.query(func.count(func.distinct(PracticeSubmission.student_id))).filter(
        PracticeSubmission.problem_id == problem.id,
        PracticeSubmission.status == 'Accepted',
        PracticeSubmission.is_run == False
    ).scalar() or 0
    if solvers_count == 0:
        seed_num = int(hashlib.md5(f"solvers-{today}-{problem.id}".encode()).hexdigest(), 16)
        solvers_count = 1150 + (seed_num % 180)

    success_rate = 68
    if problem.acceptance and problem.acceptance > 0:
        success_rate = int(round(problem.acceptance * 100))
    else:
        diff_rates = {'Easy': 76, 'Medium': 58, 'Hard': 38}
        success_rate = diff_rates.get(problem.difficulty, 60)

    # Time remaining until midnight UTC
    now_utc = datetime.utcnow()
    midnight_utc = datetime.combine(today + timedelta(days=1), time(0, 0))
    ends_in_seconds = max(0, int((midnight_utc - now_utc).total_seconds()))
    hours = ends_in_seconds // 3600
    minutes = (ends_in_seconds % 3600) // 60
    ends_in_str = f"Ends in {hours}h {minutes}m"

    # Build topic tags
    tags = []
    if problem.difficulty:
        tags.append(problem.difficulty)
    if problem.topics and isinstance(problem.topics, list):
        for t in problem.topics:
            if t not in tags and len(tags) < 4:
                tags.append(t)
    if len(tags) < 3 and problem.nexlab_topic and problem.nexlab_topic not in tags:
        tags.append(problem.nexlab_topic)

    problem_dict = problem.to_dict(include_description=False)
    problem_dict['tags'] = tags
    problem_dict['reward_xp'] = 15
    problem_dict['solvers_today'] = f"{solvers_count / 1000:.1f}K" if solvers_count >= 1000 else str(solvers_count)
    problem_dict['solvers_raw'] = solvers_count
    problem_dict['success_rate'] = f"{success_rate}%"
    problem_dict['success_rate_raw'] = success_rate
    problem_dict['ends_in_seconds'] = ends_in_seconds
    problem_dict['ends_in'] = ends_in_str
    problem_dict['description_hook'] = "You have 24 hours to solve today's challenge. Compete with other learners and keep your streak alive!"

    # Streak & user stats
    xp = _get_or_create_xp(g.user_id)
    current_streak = xp.streak_days or 0

    # User's solved dates across all time
    user_subs = PracticeSubmission.query.filter_by(
        student_id=g.user_id, status='Accepted', is_run=False
    ).order_by(PracticeSubmission.submitted_at.asc()).all()
    solved_dates = set(s.submitted_at.date() for s in user_subs if s.submitted_at)

    # Compute best streak
    sorted_dates = sorted(solved_dates)
    longest_streak = 0
    curr = 0
    prev_d = None
    for d in sorted_dates:
        if prev_d is None or d == prev_d + timedelta(days=1):
            curr += 1
        elif d != prev_d:
            curr = 1
        prev_d = d
        if curr > longest_streak:
            longest_streak = curr
    best_streak = max(current_streak, longest_streak, 6)

    # Current Week: Monday to Sunday
    monday = today - timedelta(days=today.weekday())
    day_labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    week_history = []
    for i in range(7):
        d = monday + timedelta(days=i)
        is_today = (d == today)
        is_future = (d > today)
        is_solved = (d in solved_dates) or (is_today and solved_today)
        if not is_solved and not is_future:
            days_ago = (today - d).days
            if 0 <= days_ago < current_streak:
                is_solved = True
        week_history.append({
            'day': day_labels[i],
            'date': d.isoformat(),
            'day_number': d.day,
            'solved': is_solved,
            'is_today': is_today,
            'is_future': is_future,
        })

    # Calendar Month Grid
    try:
        target_year = int(request.args.get('year', today.year))
        target_month = int(request.args.get('month', today.month))
    except (ValueError, TypeError):
        target_year, target_month = today.year, today.month

    calendar_days = _build_calendar_days(target_year, target_month, today, solved_dates, solved_today, current_streak)

    # Recent 4 daily challenges
    recent_challenges = []
    for i in range(1, 5):
        past_date = today - timedelta(days=i)
        past_p = _get_daily_problem_for_date(past_date)
        if past_p:
            was_solved = (past_date in solved_dates)
            days_ago = (today - past_date).days
            if 0 < days_ago <= current_streak:
                was_solved = True
            recent_challenges.append({
                'date': past_date.isoformat(),
                'date_formatted': past_date.strftime('%b %d, %Y'),
                'id': past_p.id,
                'title': past_p.title,
                'slug': past_p.slug,
                'difficulty': past_p.difficulty,
                'solved': was_solved,
            })

    # Milestone stepper rewards
    milestones = [
        {'day': 1, 'label': 'Day 1', 'xp': 10, 'status': 'completed' if current_streak >= 1 else 'locked'},
        {'day': 2, 'label': 'Day 2', 'xp': 15, 'status': 'completed' if current_streak >= 2 else 'locked'},
        {'day': 3, 'label': 'Day 3', 'xp': 25, 'status': 'completed' if current_streak >= 3 else ('active' if current_streak == 2 else 'locked'), 'is_gift': True},
        {'day': 4, 'label': 'Day 4', 'xp': 35, 'status': 'completed' if current_streak >= 4 else 'locked'},
        {'day': 5, 'label': 'Day 5', 'xp': 50, 'status': 'completed' if current_streak >= 5 else 'locked'},
        {'day': 6, 'label': 'Day 6', 'xp': 75, 'status': 'completed' if current_streak >= 6 else 'locked'},
        {'day': 7, 'label': 'Day 7', 'xp': 100, 'status': 'completed' if current_streak >= 7 else 'locked'},
    ]

    weekly_rewards = [
        {'streak': 3, 'title': '3-day streak', 'xp': 25, 'unlocked': current_streak >= 3, 'icon': 'flame'},
        {'streak': 5, 'title': '5-day streak', 'xp': 50, 'unlocked': current_streak >= 5, 'icon': 'flame'},
        {'streak': 7, 'title': '7-day streak', 'xp': 100, 'unlocked': current_streak >= 7, 'icon': 'crown'},
    ]

    return jsonify({
        'daily': problem_dict,
        'date': str(today),
        'solved_today': solved_today,
        'streak_stats': {
            'current_streak': current_streak,
            'best_streak': best_streak,
            'week_history': week_history,
        },
        'calendar': {
            'year': target_year,
            'month': target_month,
            'days': calendar_days,
        },
        'recent_challenges': recent_challenges,
        'milestones': milestones,
        'weekly_rewards': weekly_rewards,
    }), 200


@practice_bp.route('/daily/calendar', methods=['GET'])
@require_role('student', 'free_user')
def daily_calendar():
    today = date.today()
    try:
        target_year = int(request.args.get('year', today.year))
        target_month = int(request.args.get('month', today.month))
    except (ValueError, TypeError):
        target_year, target_month = today.year, today.month

    xp = _get_or_create_xp(g.user_id)
    current_streak = xp.streak_days or 0

    user_subs = PracticeSubmission.query.filter_by(
        student_id=g.user_id, status='Accepted', is_run=False
    ).all()
    solved_dates = set(s.submitted_at.date() for s in user_subs if s.submitted_at)

    problem = _get_daily_problem_for_date(today)
    solved_today = False
    if problem:
        solved_today = bool(PracticeSubmission.query.filter_by(
            student_id=g.user_id, problem_id=problem.id, status='Accepted', is_run=False
        ).first())

    days = _build_calendar_days(target_year, target_month, today, solved_dates, solved_today, current_streak)
    return jsonify({
        'year': target_year,
        'month': target_month,
        'days': days,
    }), 200


# ── Quest / XP ────────────────────────────────────────────────────────────────

@practice_bp.route('/quest/stats', methods=['GET'])
@require_role('student', 'free_user')
def quest_stats():
    from app.practice.quest_service import get_quest_dashboard_data
    data = get_quest_dashboard_data(g.user_id, g.role, g.institution_id)
    return jsonify(data), 200


@practice_bp.route('/quest/dashboard', methods=['GET'])
@require_role('student', 'free_user')
def quest_dashboard():
    from app.practice.quest_service import get_quest_dashboard_data
    data = get_quest_dashboard_data(g.user_id, g.role, g.institution_id)
    return jsonify(data), 200


@practice_bp.route('/quest/claim', methods=['POST'])
@require_role('student', 'free_user')
def quest_claim():
    from app.practice.quest_service import claim_quest_reward
    data = request.get_json() or {}
    quest_key = data.get('quest_key')
    if not quest_key:
        return jsonify({'error': 'quest_key is required'}), 400
    res = claim_quest_reward(g.user_id, quest_key)
    if 'error' in res:
        return jsonify(res), 400
    return jsonify(res), 200



@practice_bp.route('/quest/leaderboard', methods=['GET'])
@require_role('student', 'free_user')
def quest_leaderboard():
    """XP leaderboard. Two independent boards:
       - scope=institution : only students of the caller's institution (institution board)
       - scope=global      : everyone on the platform — free/individual users AND all
                             institution students together (platform board)
    Institution students default to their institution board and may request global.
    Free/individual users only have the global board."""
    from app.models.user import User

    limit = min(int(request.args.get('limit', 50) or 50), 100)
    can_scope_institution = (g.role == 'student' and bool(g.institution_id))
    requested = (request.args.get('scope') or '').lower()
    if requested not in ('institution', 'global'):
        requested = 'institution' if can_scope_institution else 'global'
    if requested == 'institution' and not can_scope_institution:
        requested = 'global'   # free users can't have an institution board

    q = db.session.query(StudentXP, User).join(User, User.id == StudentXP.student_id)
    if requested == 'institution':
        q = q.filter(User.institution_id == g.institution_id)

    rows = q.order_by(StudentXP.total_xp.desc()).limit(limit).all()

    entries = []
    my_rank = None
    for i, (xp, user) in enumerate(rows, start=1):
        is_me = user.id == g.user_id
        if is_me:
            my_rank = i
        entries.append({
            'rank':            i,
            'student_id':      user.id,
            'name':            user.full_name,
            'account_type':    'institution' if user.institution_id else 'individual',
            'total_xp':        xp.total_xp,
            'level':           xp.level,
            'level_name':      xp.level_name,
            'problems_solved': xp.problems_solved,
            'streak_days':     xp.streak_days,
            'is_me':           is_me,
        })

    return jsonify({
        'scope':               requested,
        'can_view_institution': can_scope_institution,
        'leaderboard':         entries,
        'my_rank':             my_rank,
    }), 200


@practice_bp.route('/quest/daily-checkin', methods=['POST'])
@require_role('student', 'free_user')
def daily_checkin():
    """Log a daily visit — advances the streak at most once per day, small XP on first check-in."""
    xp = _get_or_create_xp(g.user_id)
    already = xp.streak_last_date == date.today()
    xp.update_streak()

    bonus = 0
    if not already:
        bonus = 5
        xp.add_xp(bonus)
        if xp.streak_days >= 7:
            _award_badge(g.user_id, 'streak_7')
        if xp.streak_days >= 30:
            _award_badge(g.user_id, 'streak_30')

    db.session.commit()
    return jsonify({
        'checked_in':    True,
        'already_today': already,
        'streak_days':   xp.streak_days,
        'xp_bonus':      bonus,
        'xp':            xp.to_dict(),
    }), 200


# ── Study Plans ───────────────────────────────────────────────────────────────

@practice_bp.route('/plans', methods=['GET'])
@require_role('student', 'free_user')
def list_plans():
    plans = StudyPlan.query.order_by(StudyPlan.order_index).all()

    result = []
    for plan in plans:
        prog = StudyPlanProgress.query.filter_by(
            student_id=g.user_id, plan_id=plan.id
        ).first()
        d = plan.to_dict()
        d['enrolled'] = prog is not None
        d['solved_count'] = len(prog.solved_slugs or []) if prog else 0
        d['completed'] = prog.completed_at is not None if prog else False
        result.append(d)

    return jsonify({'plans': result}), 200


def _resolve_plan(plan_id):
    """Study-plan URLs are slug-based (like problems); accept slug or raw id."""
    plan = StudyPlan.query.filter_by(slug=plan_id).first()
    if plan is None:
        plan = StudyPlan.query.get_or_404(plan_id)
    return plan


@practice_bp.route('/plans/<plan_id>', methods=['GET'])
@require_role('student', 'free_user')
def get_plan(plan_id):
    plan = _resolve_plan(plan_id)
    sections = StudyPlanSection.query.filter_by(
        plan_id=plan.id
    ).order_by(StudyPlanSection.order_index).all()

    prog = StudyPlanProgress.query.filter_by(
        student_id=g.user_id, plan_id=plan.id
    ).first()
    solved_set = set(prog.solved_slugs or []) if prog else set()

    sections_data = []
    for sec in sections:
        slugs = sec.problem_ids or []
        problems = Problem.query.filter(Problem.slug.in_(slugs)).all()
        prob_map = {p.slug: p for p in problems}
        probs = []
        for slug in slugs:
            p = prob_map.get(slug)
            if p:
                d = p.to_list_dict()
                d['status'] = 'solved' if slug in solved_set else 'todo'
                probs.append(d)
        sd = sec.to_dict()
        sd['problems'] = probs
        sd['solved_count'] = sum(1 for s in slugs if s in solved_set)
        sections_data.append(sd)

    return jsonify({
        'plan': plan.to_dict(),
        'sections': sections_data,
        'progress': prog.to_dict() if prog else None,
        'certificate_ready': bool(prog and prog.completed_at),
    }), 200


@practice_bp.route('/plans/<plan_id>/certificate', methods=['GET'])
@require_role('student', 'free_user')
def download_plan_certificate(plan_id):
    """Download the plan-completion certificate PDF (generated at completion)."""
    import os
    from flask import send_file
    plan = _resolve_plan(plan_id)
    prog = StudyPlanProgress.query.filter_by(
        student_id=g.user_id, plan_id=plan.id).first()
    if not prog or not prog.completed_at:
        return jsonify({'error': 'Complete the plan first to earn your certificate.'}), 400
    path = prog.certificate_path
    if not path or not os.path.exists(path):
        # regenerate once if the file was cleaned up
        try:
            prog.certificate_path = _generate_plan_certificate(g.user_id, plan)
            db.session.commit()
            path = prog.certificate_path
        except Exception:
            return jsonify({'error': 'Certificate unavailable.'}), 404
    return send_file(path, as_attachment=True,
                     download_name=f'nexlab_certificate_{plan.slug}.pdf')


@practice_bp.route('/plans/<plan_id>/enroll', methods=['POST'])
@require_role('student', 'free_user')
def enroll_plan(plan_id):
    plan = _resolve_plan(plan_id)
    existing = StudyPlanProgress.query.filter_by(
        student_id=g.user_id, plan_id=plan.id
    ).first()
    if existing:
        return jsonify({'message': 'Already enrolled', 'progress': existing.to_dict()}), 200

    prog = StudyPlanProgress(student_id=g.user_id, plan_id=plan.id)
    db.session.add(prog)
    db.session.commit()
    return jsonify({'message': 'Enrolled!', 'progress': prog.to_dict()}), 201


# ── Run / Submit ──────────────────────────────────────────────────────────────

def _exec_case(lang_id, code, stdin):
    """Run one test case via the Docker runner. Returns (result, err_response)."""
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


@practice_bp.route('/problems/<slug>/run', methods=['POST'])
@require_role('student', 'free_user')
def run_problem(slug):
    """Run code against visible sample test cases only."""
    from flask import current_app
    from app.execution.languages import resolve as resolve_language

    problem = Problem.query.filter_by(slug=slug, is_active=True).first_or_404()
    data = request.get_json() or {}
    code = data.get('code', '')
    language = data.get('language', 'python')
    elapsed_sec = data.get('elapsed_sec')   # optional: seconds since problem opened (for speed_demon)

    if not code.strip():
        return jsonify({'error': 'No code provided'}), 400
    spec = resolve_language(language)
    if not spec:
        return jsonify({'error': f'Unsupported language: {language}'}), 400

    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        samples = PracticeTestCase.query.filter_by(problem_id=problem.id, is_sample=True).all()
        if not samples:
            return jsonify({'results': [{
                'input': None, 'expected': None,
                'output': '[Dev mode — write code that solves the problem, then Submit to check]',
                'passed': None, 'time_ms': 0, 'status': 'No test cases seeded',
            }]}), 200
        return jsonify({'results': [
            {'input': tc.input_data, 'expected': tc.expected, 'output': tc.expected,
             'passed': True, 'time_ms': 42, 'status': 'Accepted'}
            for tc in samples
        ]}), 200

    samples = PracticeTestCase.query.filter_by(
        problem_id=problem.id, is_sample=True
    ).order_by(PracticeTestCase.order_index).all()

    # No sample test cases seeded yet — run code, show raw output, no pass/fail judgment
    if not samples:
        res, err = _exec_case(spec['id'], code, '')
        if err:
            return err
        stdout = (res.get('stdout') or '').strip()
        stderr = (res.get('stderr') or '').strip()
        output = stdout if not stderr else f"{stdout}\n[stderr]: {stderr}".strip()
        status_id = res.get('status_id')
        status = res.get('status', 'Unknown')
        return jsonify({'results': [{
            'input': None,
            'expected': None,
            'output': output or '(no output)',
            'passed': None,          # no judgment — nothing to compare against
            'time_ms': res.get('time_ms'),
            'status': status if status_id != 3 else 'Executed',   # don't say Accepted
        }]}), 200

    results = []
    for tc in samples:
        res, err = _exec_case(spec['id'], code, tc.input_data)
        if err:
            return err
        stdout = (res.get('stdout') or '').strip()
        expected = (tc.expected or '').strip()
        passed = stdout == expected and res.get('status_id') == 3
        results.append({
            'input':    tc.input_data,
            'expected': expected,
            'output':   stdout,
            'passed':   passed,
            'time_ms':  res.get('time_ms'),
            'status':   res.get('status', 'Unknown'),
        })

    return jsonify({'results': results}), 200


@practice_bp.route('/problems/<slug>/submit', methods=['POST'])
@require_role('student', 'free_user')
def submit_problem(slug):
    """Submit code — run all hidden cases, store submission, award XP + badges."""
    from flask import current_app
    from app.execution.languages import resolve as resolve_language

    problem = Problem.query.filter_by(slug=slug, is_active=True).first_or_404()
    data = request.get_json() or {}
    code = data.get('code', '')
    language = data.get('language', 'python')
    elapsed_sec = data.get('elapsed_sec')   # optional: seconds since problem opened (for speed_demon)

    if not code.strip():
        return jsonify({'error': 'No code provided'}), 400
    spec = resolve_language(language)
    if not spec:
        return jsonify({'error': f'Unsupported language: {language}'}), 400

    xp_reward = XP_TABLE.get(problem.difficulty, 10)

    # XP is awarded only on the FIRST accepted solve of this problem
    already_solved = PracticeSubmission.query.filter_by(
        student_id=g.user_id, problem_id=problem.id,
        status='Accepted', is_run=False
    ).first() is not None

    all_cases = PracticeTestCase.query.filter_by(problem_id=problem.id).all()
    if not all_cases:
        return jsonify({
            'error': 'No test cases configured for this problem yet. Please try another problem.'
        }), 400

    if not current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        total = len(all_cases)
        sub = PracticeSubmission(
            student_id=g.user_id, problem_id=problem.id,
            language=language, code=code, status='Accepted',
            passed=total, total=total, is_run=False,
        )
        xp_earned = 0 if already_solved else xp_reward
        if not already_solved:
            sub.xp_earned = xp_earned
            _reward_solve(g.user_id, problem, xp_earned, elapsed_sec)
        db.session.add(sub)
        db.session.commit()
        return jsonify({
            'status': 'Accepted', 'passed': total, 'total': total,
            'score': 100.0, 'xp_earned': xp_earned, 'runtime_ms': None,
        }), 200

    passed_count = 0
    total_ms = 0
    total_kb = 0
    fail_input = None
    fail_expected = None
    fail_output = None
    first_bad_status = None

    for tc in all_cases:
        res, err = _exec_case(spec['id'], code, tc.input_data)
        if err:
            return err
        stdout   = (res.get('stdout') or '').strip()
        expected = (tc.expected or '').strip()
        sid      = res.get('status_id')
        total_ms += res.get('time_ms', 0) or 0
        total_kb += res.get('memory_kb', 0) or 0
        if stdout == expected and sid == 3:
            passed_count += 1
        elif fail_input is None:
            # capture first failing case for feedback
            fail_input    = tc.input_data
            fail_expected = expected
            fail_output   = stdout
            first_bad_status = res.get('status', 'Wrong Answer')

    n = len(all_cases)
    score    = round(passed_count / n * 100, 1)
    accepted = passed_count == n
    avg_ms   = round(total_ms / n) if n else None
    avg_kb   = round(total_kb / n) if n else None

    sub = PracticeSubmission(
        student_id=g.user_id, problem_id=problem.id,
        language=language, code=code,
        status='Accepted' if accepted else (first_bad_status or 'Wrong Answer'),
        passed=passed_count, total=n,
        time_ms=avg_ms, memory_kb=avg_kb, is_run=False,
    )

    xp_earned = 0
    if accepted and not already_solved:
        xp_earned = xp_reward
        sub.xp_earned = xp_earned
        _reward_solve(g.user_id, problem, xp_earned, elapsed_sec)

    db.session.add(sub)
    db.session.commit()

    resp = {
        'status':     sub.status,
        'passed':     passed_count,
        'total':      n,
        'score':      score,
        'xp_earned':  xp_earned,
        'runtime_ms': avg_ms,
        'memory_kb':  avg_kb,
    }
    # surface first failing case so UI can show it
    if not accepted and fail_input is not None:
        resp['fail_case'] = {
            'input':    fail_input,
            'expected': fail_expected,
            'output':   fail_output,
        }
    return jsonify(resp), 200
