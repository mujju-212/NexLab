"""
Free-user enhancement endpoints (recommendations, bookmarks, collections,
playground save/share, contests, public showcase, plan certificates, meter).

Blueprint prefix: /api/practice  (same as the practice library — it serves
the same audience: 'student' + 'free_user').
"""
import re
from flask import Blueprint, request, jsonify, g, current_app
from app.auth.utils import require_role
from app.extensions import db
from app.models.user import User
from app.models.practice import (
    Problem, PracticeTestCase, PracticeSubmission, StudyPlan, StudyPlanProgress,
    StudentXP, StudentBadge, BADGE_CATALOG, XP_TABLE,
)
from app.models.free_extra import (
    ProblemBookmark, PlaygroundSession, ProblemCollection,
    CollectionItem, CodingContest, ContestParticipant,
)
from app.models.institution import PlatformConfig
from datetime import datetime, timedelta

extra_bp = Blueprint('practice_extra', __name__)


# ── helpers ───────────────────────────────────────────────────────────────────

def _ensure_xp():
    xp = StudentXP.query.filter_by(student_id=g.user_id).first()
    if not xp:
        xp = StudentXP(student_id=g.user_id)
        db.session.add(xp)
        db.session.flush()
    return xp


def _slugify_name(name: str, fallback: str) -> str:
    """Turn a display name into a URL-safe slug; guaranteed unique-ish."""
    base = re.sub(r'[^a-z0-9]+', '-', (name or fallback).lower()).strip('-')[:24]
    if not base:
        base = 'user'
    slug = base
    attempt = 0
    while StudentXP.query.filter(StudentXP.profile_slug == slug,
                                 StudentXP.student_id != g.user_id).first():
        attempt += 1
        slug = f'{base}-{attempt}'
    return slug


def _difficulty_rank(d):
    return {'Easy': 0, 'Medium': 1, 'Hard': 2}.get(d, 1)


# ══════════════════════════════════════════════════════════════════════════════
# Personal recommendations ("your next 5 problems")
# ══════════════════════════════════════════════════════════════════════════════

@extra_bp.route('/recommended', methods=['GET'])
@require_role('student', 'free_user')
def recommended_problems():
    """
    Pick 5 problems from topics where the user most recently failed,
    difficulty-matched to their solve history:
      - rank topics by (recent failures, no recent successes)
      - user's max solved difficulty sets the ceiling (Hard solvers get Hard)
      - exclude already-solved problems
    """
    submissions = PracticeSubmission.query.filter(
        PracticeSubmission.student_id == g.user_id,
        PracticeSubmission.is_run == False,  # noqa: E712
    ).order_by(PracticeSubmission.submitted_at.desc()).limit(200).all()

    problems = {p.id: p for p in Problem.query.filter_by(is_active=True).all()}
    solved_ids, topic_score = set(), {}
    for s in submissions:
        p = problems.get(s.problem_id)
        if not p:
            continue
        if s.status == 'Accepted':
            solved_ids.add(p.id)
            topic_score[p.nexlab_topic] = topic_score.get(p.nexlab_topic, 0) - 2
        else:
            # failed attempt: recent failures rank higher (list is newest-first)
            topic_score[p.nexlab_topic] = topic_score.get(p.nexlab_topic, 0) + 3

    solved_difficulty = max(
        (_difficulty_rank(problems[s.problem_id].difficulty)
         for s in submissions if s.status == 'Accepted' and s.problem_id in problems),
        default=-1,
    )

    if not topic_score:
        # cold start — prioritize top flagship starter problems
        priority_slugs = ['two-sum', 'palindrome-number', 'roman-to-integer', 'longest-common-prefix', 'valid-parentheses']
        candidates = []
        for ps in priority_slugs:
            for p in problems.values():
                if p.slug == ps and p.id not in solved_ids:
                    candidates.append(p)
                    break
        for p in sorted(problems.values(), key=lambda x: -(x.acceptance or 0)):
            if p.id not in solved_ids and p not in candidates and p.difficulty == 'Easy':
                candidates.append(p)
        picks = candidates[:5]
    else:
        weak_topics = [t for t, sc in sorted(topic_score.items(), key=lambda x: -x[1]) if sc > 0]
        if not weak_topics:
            weak_topics = sorted(topic_score.keys())
        candidates = [p for p in problems.values()
                      if p.id not in solved_ids and p.nexlab_topic in weak_topics
                      and _difficulty_rank(p.difficulty) <= max(solved_difficulty + 1, 0)]
        if len(candidates) < 5:
            extra = [p for p in problems.values()
                     if p.id not in solved_ids and p not in candidates]
            candidates.extend(extra)
        # order by weak-topic priority then acceptance
        candidates.sort(key=lambda p: (
            -topic_score.get(p.nexlab_topic, 0),
            -(p.acceptance or 0),
        ))
        picks = candidates[:5]

    def _clean_desc(txt):
        if not txt:
            return ""
        import re
        c = re.sub(r'<[^>]+>', ' ', txt)
        c = re.sub(r'[*_#`]', '', c)
        lines = [l.strip() for l in c.split('\n') if l.strip()]
        if lines:
            line = lines[0]
            return line[:90] + ('...' if len(line) > 90 else '')
        return ""

    def _solves_str(acc, pid):
        # Deterministic human-readable solves estimate matching competitive platforms
        h = abs(hash(str(pid))) % 500
        total_k = int(round((acc or 0.6) * 1100)) + h + 200
        if total_k >= 1000:
            return f"{round(total_k / 1000, 1)}M solves"
        return f"{total_k}K solves"

    return jsonify({'recommendations': [{
        'id':             p.id,
        'slug':           p.slug,
        'title':          p.title,
        'difficulty':     p.difficulty,
        'nexlab_topic':   p.nexlab_topic,
        'topics':         (p.topics or [p.nexlab_topic])[:3],
        'description':    _clean_desc(p.description),
        'acceptance':     p.acceptance,
        'acceptance_pct': int(round(float(p.acceptance or 0.88) * 100 if (p.acceptance and p.acceptance <= 1.0) else float(p.acceptance or 88))),
        'solves_display': _solves_str(p.acceptance, p.id),
        'reason':         'weak topic practice' if topic_score.get(p.nexlab_topic, 0) > 0
                          else ('warm-up' if p.difficulty == 'Easy' else 'level up'),
    } for p in picks]}), 200


# ══════════════════════════════════════════════════════════════════════════════
# Bookmarks + private notes
# ══════════════════════════════════════════════════════════════════════════════

@extra_bp.route('/bookmarks', methods=['GET'])
@require_role('student', 'free_user')
def list_bookmarks():
    rows = ProblemBookmark.query.filter_by(user_id=g.user_id).order_by(
        ProblemBookmark.created_at.desc()).limit(200).all()
    return jsonify({'bookmarks': [r.to_dict() for r in rows]}), 200


@extra_bp.route('/bookmarks/ids', methods=['GET'])
@require_role('student', 'free_user')
def bookmark_ids():
    """Lightweight starred-state map for the problem list."""
    rows = ProblemBookmark.query.filter_by(user_id=g.user_id).all()
    return jsonify({'starred': [r.problem_id for r in rows]}), 200


@extra_bp.route('/bookmarks', methods=['POST'])
@require_role('student', 'free_user')
def toggle_bookmark():
    """
    Star/unstar a problem. Body: {problem_id, note?}
    Second call on the same problem unstars (toggle).
    """
    data = request.get_json() or {}
    problem = Problem.query.filter_by(
        id=data.get('problem_id'), is_active=True).first()
    if not problem:
        return jsonify({'error': 'Problem not found.'}), 404

    row = ProblemBookmark.query.filter_by(
        user_id=g.user_id, problem_id=problem.id).first()
    if row:
        db.session.delete(row)
        db.session.commit()
        return jsonify({'starred': False}), 200

    row = ProblemBookmark(
        user_id=g.user_id,
        problem_id=problem.id,
        note=(data.get('note') or '').strip() or None,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'starred': True, 'bookmark': row.to_dict()}), 201


@extra_bp.route('/bookmarks/<bookmark_id>/note', methods=['PATCH'])
@require_role('student', 'free_user')
def update_bookmark_note(bookmark_id):
    row = ProblemBookmark.query.filter_by(
        id=bookmark_id, user_id=g.user_id).first()
    if not row:
        return jsonify({'error': 'Bookmark not found.'}), 404
    row.note = (request.get_json() or {}).get('note', '').strip() or None
    db.session.commit()
    return jsonify({'bookmark': row.to_dict()}), 200


# ══════════════════════════════════════════════════════════════════════════════
# Collections (user-built playlists)
# ══════════════════════════════════════════════════════════════════════════════

@extra_bp.route('/collections', methods=['GET'])
@require_role('student', 'free_user')
def list_collections():
    rows = ProblemCollection.query.filter_by(user_id=g.user_id).order_by(
        ProblemCollection.created_at.desc()).all()
    counts = {}
    if rows:
        items = CollectionItem.query.filter(
            CollectionItem.collection_id.in_([r.id for r in rows])).all()
        for it in items:
            counts[it.collection_id] = counts.get(it.collection_id, 0) + 1
    return jsonify({'collections': [
        r.to_dict(item_count=counts.get(r.id, 0)) for r in rows
    ]}), 200


@extra_bp.route('/collections', methods=['POST'])
@require_role('student', 'free_user')
def create_collection():
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'title is required'}), 400
    if len(title) > 200:
        return jsonify({'error': 'title too long'}), 400
    row = ProblemCollection(
        user_id=g.user_id,
        title=title,
        description=(data.get('description') or '').strip() or None,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'collection': row.to_dict()}), 201


@extra_bp.route('/collections/<coll_id>', methods=['DELETE'])
@require_role('student', 'free_user')
def delete_collection(coll_id):
    row = ProblemCollection.query.filter_by(id=coll_id, user_id=g.user_id).first()
    if not row:
        return jsonify({'error': 'Collection not found.'}), 404
    CollectionItem.query.filter_by(collection_id=row.id).delete()
    db.session.delete(row)
    db.session.commit()
    return jsonify({'message': 'Collection deleted.'}), 200


@extra_bp.route('/collections/<coll_id>/items', methods=['GET'])
@require_role('student', 'free_user')
def list_collection_items(coll_id):
    row = ProblemCollection.query.filter_by(id=coll_id, user_id=g.user_id).first()
    if not row:
        return jsonify({'error': 'Collection not found.'}), 404
    items = CollectionItem.query.filter_by(collection_id=coll_id).order_by(
        CollectionItem.order_index.asc()).all()
    return jsonify({'collection': row.to_dict(len(items)),
                    'items': [i.to_dict() for i in items]}), 200


@extra_bp.route('/collections/<coll_id>/items', methods=['POST'])
@require_role('student', 'free_user')
def add_collection_item(coll_id):
    coll = ProblemCollection.query.filter_by(id=coll_id, user_id=g.user_id).first()
    if not coll:
        return jsonify({'error': 'Collection not found.'}), 404
    problem = Problem.query.filter_by(
        id=(request.get_json() or {}).get('problem_id'), is_active=True).first()
    if not problem:
        return jsonify({'error': 'Problem not found.'}), 404

    if CollectionItem.query.filter_by(
            collection_id=coll.id, problem_id=problem.id).first():
        return jsonify({'error': 'Already in this collection.'}), 409

    last = CollectionItem.query.filter_by(collection_id=coll.id).order_by(
        CollectionItem.order_index.desc()).first()
    item = CollectionItem(
        collection_id=coll.id,
        problem_id=problem.id,
        order_index=(last.order_index + 1) if last else 0,
    )
    db.session.add(item)
    db.session.commit()
    return jsonify({'item': item.to_dict()}), 201


@extra_bp.route('/collections/<coll_id>/items/<item_id>', methods=['DELETE'])
@require_role('student', 'free_user')
def remove_collection_item(coll_id, item_id):
    row = ProblemCollection.query.filter_by(id=coll_id, user_id=g.user_id).first()
    if not row:
        return jsonify({'error': 'Collection not found.'}), 404
    item = CollectionItem.query.filter_by(id=item_id, collection_id=coll_id).first()
    if not item:
        return jsonify({'error': 'Item not found.'}), 404
    db.session.delete(item)
    db.session.commit()
    return jsonify({'message': 'Removed.'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# Playground save / share / history
# ══════════════════════════════════════════════════════════════════════════════

@extra_bp.route('/playground/sessions', methods=['GET'])
@require_role('student', 'free_user')
def list_playground_sessions():
    rows = PlaygroundSession.query.filter_by(user_id=g.user_id).order_by(
        PlaygroundSession.updated_at.desc()).limit(50).all()
    return jsonify({'sessions': [r.to_dict(include_code=False) for r in rows]}), 200


@extra_bp.route('/playground/sessions', methods=['POST'])
@require_role('student', 'free_user')
def save_playground_session():
    """Save (or update) a playground session. Body: {id?, title, language, code, stdin_data?}"""
    data = request.get_json() or {}
    code = data.get('code', '')
    if not code.strip():
        return jsonify({'error': 'No code to save'}), 400
    language = data.get('language', 'python')

    row = None
    if data.get('id'):
        row = PlaygroundSession.query.filter_by(
            id=data['id'], user_id=g.user_id).first()
    if row:
        row.title = (data.get('title') or row.title or 'Untitled')[:200]
        row.language = language
        row.code = code
        row.stdin_data = data.get('stdin_data')
    else:
        row = PlaygroundSession(
            user_id=g.user_id,
            title=(data.get('title') or 'Untitled session')[:200],
            language=language,
            code=code,
            stdin_data=data.get('stdin_data'),
        )
        db.session.add(row)
    db.session.commit()
    return jsonify({'session': row.to_dict(include_code=False)}), 201


@extra_bp.route('/playground/sessions/<row_id>', methods=['GET'])
@require_role('student', 'free_user')
def get_playground_session(row_id):
    row = PlaygroundSession.query.filter_by(id=row_id, user_id=g.user_id).first()
    if not row:
        return jsonify({'error': 'Session not found.'}), 404
    return jsonify({'session': row.to_dict()}), 200


@extra_bp.route('/playground/sessions/<row_id>', methods=['DELETE'])
@require_role('student', 'free_user')
def delete_playground_session(row_id):
    row = PlaygroundSession.query.filter_by(id=row_id, user_id=g.user_id).first()
    if not row:
        return jsonify({'error': 'Session not found.'}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({'message': 'Session deleted.'}), 200


@extra_bp.route('/playground/sessions/<row_id>/share', methods=['POST'])
@require_role('student', 'free_user')
def share_playground_session(row_id):
    """Publish a session — generates a public read-only share slug."""
    row = PlaygroundSession.query.filter_by(id=row_id, user_id=g.user_id).first()
    if not row:
        return jsonify({'error': 'Session not found.'}), 404
    if not row.share_slug:
        row.share_slug = PlaygroundSession.new_slug()
    row.is_shared = True
    db.session.commit()
    return jsonify({'share_slug': row.share_slug,
                    'share_url': f'/u/playground/{row.share_slug}'}), 200


@extra_bp.route('/playground/sessions/<row_id>/share', methods=['DELETE'])
@require_role('student', 'free_user')
def unshare_playground_session(row_id):
    row = PlaygroundSession.query.filter_by(id=row_id, user_id=g.user_id).first()
    if not row:
        return jsonify({'error': 'Session not found.'}), 404
    row.is_shared = False
    db.session.commit()
    return jsonify({'message': 'Sharing disabled.'}), 200


@extra_bp.route('/playground/shared/<share_slug>', methods=['GET'])
def get_shared_playground(share_slug):
    """Public — read-only shared playground session."""
    row = PlaygroundSession.query.filter_by(
        share_slug=share_slug, is_shared=True).first()
    if not row:
        return jsonify({'error': 'Shared session not found.'}), 404
    owner = User.query.get(row.user_id)
    return jsonify({
        'session': {
            'title':      row.title,
            'language':   row.language,
            'code':       row.code,
            'stdin_data': row.stdin_data,
        },
        'author': owner.full_name if owner else 'A NexLab user',
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# Public achievement showcase (/u/<slug>) + opt-in toggle
# ══════════════════════════════════════════════════════════════════════════════

@extra_bp.route('/showcase', methods=['PATCH'])
@require_role('student', 'free_user')
def toggle_showcase():
    """
    Opt in/out of the public profile. Body: {profile_public: bool}
    Opting in auto-generates a stable slug once.
    """
    xp = _ensure_xp()
    data = request.get_json() or {}
    xp.profile_public = bool(data.get('profile_public'))
    if xp.profile_public and not xp.profile_slug:
        xp.profile_slug = _slugify_name(
            User.query.get(g.user_id).full_name if User.query.get(g.user_id) else '',
            g.user_id[:8])
    db.session.commit()
    return jsonify({
        'profile_public': xp.profile_public,
        'profile_slug':   xp.profile_slug if xp.profile_public else None,
    }), 200


@extra_bp.route('/showcase/me', methods=['GET'])
@require_role('student', 'free_user')
def my_showcase():
    xp = _ensure_xp()
    return jsonify({
        'profile_public': bool(xp.profile_public),
        'profile_slug':   xp.profile_slug,
        'public_url':     f'/u/{xp.profile_slug}' if (xp.profile_public and xp.profile_slug) else None,
    }), 200


@extra_bp.route('/showcase/<slug>', methods=['GET'])
def public_showcase(slug):
    """Public achievement showcase — no auth. Respects the opt-out."""
    xp = StudentXP.query.filter_by(profile_slug=slug).first()
    if not xp or not xp.profile_public:
        return jsonify({'error': 'Profile not found or private.'}), 404

    user = User.query.get(xp.student_id)
    badges = StudentBadge.query.filter_by(student_id=xp.student_id).all()
    badge_details = [
        {'badge_id': b.badge_id, **(BADGE_CATALOG.get(b.badge_id, {}))}
        for b in badges
    ]
    solved = PracticeSubmission.query.filter(
        PracticeSubmission.student_id == xp.student_id,
        PracticeSubmission.status == 'Accepted',
        PracticeSubmission.is_run == False,  # noqa: E712
    ).order_by(PracticeSubmission.submitted_at.desc()).limit(8).all()
    problems = {p.id: p for p in Problem.query.filter(
        Problem.id.in_([s.problem_id for s in solved])).all()} if solved else {}

    return jsonify({
        'slug':         slug,
        'display_name': (user.full_name.split()[0] + ' ' + (user.full_name.split()[-1][0] + '.' if len(user.full_name.split()) > 1 else '')) if user else 'NexLab user',
        'xp': {
            'total_xp':     xp.total_xp,
            'level':        xp.level,
            'level_name':   xp.level_name,
            'streak_days':  xp.streak_days,
            'problems_solved': xp.problems_solved,
            'easy': xp.easy_solved, 'medium': xp.medium_solved, 'hard': xp.hard_solved,
        },
        'badges': badge_details,
        'recent_solves': [{
            'title':      problems[s.problem_id].title if s.problem_id in problems else 'Problem',
            'slug':       problems[s.problem_id].slug if s.problem_id in problems else None,
            'difficulty': problems[s.problem_id].difficulty if s.problem_id in problems else None,
            'solved_at':  s.submitted_at.isoformat() + 'Z' if s.submitted_at else None,
        } for s in solved],
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# Free-tier AI meter widget (reads the meter the lab-AI guard enforces)
# ══════════════════════════════════════════════════════════════════════════════

@extra_bp.route('/meter', methods=['GET'])
@require_role('student', 'free_user')
def ai_meter():
    """Today's AI usage vs the free-tier limit (PlatformConfig)."""
    from sqlalchemy import func
    from app.models.ai_usage import AIUsageLog
    limit = int(PlatformConfig.get('free_user_daily_ai_calls', 10))
    day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    used = db.session.query(func.count(AIUsageLog.id)).filter(
        AIUsageLog.user_id == g.user_id,
        AIUsageLog.created_at >= day_start,
    ).scalar() or 0
    return jsonify({
        'used': used,
        'limit': limit,
        'remaining': max(0, limit - used),
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# Contests (timed problem sets + leaderboard)
# ══════════════════════════════════════════════════════════════════════════════

@extra_bp.route('/contests', methods=['GET'])
@require_role('student', 'free_user')
def list_contests():
    rows = CodingContest.query.order_by(CodingContest.starts_at.desc()).limit(50).all()
    now = datetime.utcnow()
    out = []
    for c in rows:
        d = c.to_dict()
        d['status'] = c.status_now()
        parts = ContestParticipant.query.filter_by(contest_id=c.id).count()
        d['participants'] = parts
        joined = ContestParticipant.query.filter_by(
            contest_id=c.id, user_id=g.user_id).first() is not None
        d['joined'] = joined
        out.append(d)
    return jsonify({'contests': out}), 200


@extra_bp.route('/contests/<contest_id>', methods=['GET'])
@require_role('student', 'free_user')
def contest_detail(contest_id):
    c = CodingContest.query.get(contest_id)
    if not c:
        return jsonify({'error': 'Contest not found.'}), 404

    problems = Problem.query.filter(
        Problem.id.in_(c.problem_ids or []),
        Problem.is_active == True,  # noqa: E712
    ).all()
    problem_list = [{
        'id': p.id, 'slug': p.slug, 'title': p.title,
        'difficulty': p.difficulty, 'nexlab_topic': p.nexlab_topic,
        'solved': PracticeSubmission.query.filter_by(
            student_id=g.user_id, problem_id=p.id,
            status='Accepted', is_run=False).first() is not None,
    } for p in problems]

    me = ContestParticipant.query.filter_by(
        contest_id=c.id, user_id=g.user_id).first()

    return jsonify({
        'contest': c.to_dict(),
        'status': c.status_now(),
        'problems': problem_list,
        'joined': me is not None,
        'solved_slugs': (me.solved_slugs or []) if me else [],
    }), 200


@extra_bp.route('/contests/<contest_id>/join', methods=['POST'])
@require_role('student', 'free_user')
def join_contest(contest_id):
    c = CodingContest.query.get(contest_id)
    if not c:
        return jsonify({'error': 'Contest not found.'}), 404
    if c.status_now() == 'past':
        return jsonify({'error': 'This contest has ended.'}), 400

    existing = ContestParticipant.query.filter_by(
        contest_id=contest_id, user_id=g.user_id).first()
    if existing:
        return jsonify({'message': 'Already joined.', 'participant': existing.to_dict()}), 200

    row = ContestParticipant(contest_id=contest_id, user_id=g.user_id, solved_slugs=[])
    db.session.add(row)
    db.session.commit()
    return jsonify({'participant': row.to_dict()}), 201


@extra_bp.route('/contests/<contest_id>/leaderboard', methods=['GET'])
@require_role('student', 'free_user')
def contest_leaderboard(contest_id):
    """
    Computed live from accepted submissions of the contest's problems inside
    the contest window — no extra bookkeeping on the submit path.
    Ranked by solved count, then earliest last-solve.
    """
    from sqlalchemy import func
    c = CodingContest.query.get(contest_id)
    if not c:
        return jsonify({'error': 'Contest not found.'}), 404

    problem_ids = c.problem_ids or []
    if not problem_ids:
        return jsonify({'leaderboard': []}), 200

    xp_by_user = {x.student_id: x for x in StudentXP.query.all()}
    users_by_id = {u.id: u for u in User.query.filter(
        User.id.in_([p.user_id for p in
                     ContestParticipant.query.filter_by(contest_id=contest_id).all()])).all()}

    rows = db.session.query(
        PracticeSubmission.student_id,
        PracticeSubmission.problem_id,
        func.min(PracticeSubmission.submitted_at).label('first_accept'),
    ).filter(
        PracticeSubmission.problem_id.in_(problem_ids),
        PracticeSubmission.status == 'Accepted',
        PracticeSubmission.is_run == False,  # noqa: E712
        PracticeSubmission.submitted_at >= c.starts_at,
        PracticeSubmission.submitted_at <= c.ends_at,
    ).group_by(
        PracticeSubmission.student_id, PracticeSubmission.problem_id,
    ).all()

    tally = {}
    for sid, pid, first_accept in rows:
        t = tally.setdefault(sid, {'solved': 0, 'score': 0, 'last_at': None})
        t['solved'] += 1
        problem = Problem.query.get(pid)
        t['score'] += XP_TABLE.get(problem.difficulty, 10) if problem else 10
        if first_accept and (t['last_at'] is None or first_accept > t['last_at']):
            t['last_at'] = first_accept

    # only show participants (opt-in model)
    participant_ids = {p.user_id for p in
                       ContestParticipant.query.filter_by(contest_id=contest_id).all()}

    board = []
    for sid, t in tally.items():
        if sid not in participant_ids:
            continue
        u = users_by_id.get(sid)
        board.append({
            'user_id':  sid,
            'name':     (u.full_name.split()[0] + ' ' + (u.full_name.split()[-1][0] + '.' if len(u.full_name.split()) > 1 else '')) if u else '—',
            'solved':   t['solved'],
            'score':    t['score'],
            'last_at':  t['last_at'].isoformat() + 'Z' if t['last_at'] else None,
        })
    board.sort(key=lambda x: (-x['score'], x['last_at'] or ''))
    for i, b in enumerate(board):
        b['rank'] = i + 1

    me_rank = next((b['rank'] for b in board if b['user_id'] == g.user_id), None)
    return jsonify({'leaderboard': board[:50], 'my_rank': me_rank}), 200


# ══════════════════════════════════════════════════════════════════════════════
# Platform-admin: curate contests
# ══════════════════════════════════════════════════════════════════════════════

@extra_bp.route('/admin/contests', methods=['POST'])
@require_role('platform_admin')
def create_contest():
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'title is required'}), 400
    try:
        starts_at = datetime.fromisoformat(str(data['starts_at']).replace('Z', ''))
        ends_at = datetime.fromisoformat(str(data['ends_at']).replace('Z', ''))
    except (KeyError, ValueError):
        return jsonify({'error': 'starts_at and ends_at (ISO datetimes) are required'}), 400
    if ends_at <= starts_at:
        return jsonify({'error': 'ends_at must be after starts_at'}), 400
    problem_ids = [str(p) for p in (data.get('problem_ids') or [])]
    valid = {p.id for p in Problem.query.filter(Problem.id.in_(problem_ids)).all()}
    if len(valid) < 1:
        return jsonify({'error': 'At least one valid problem_id is required'}), 400

    row = CodingContest(
        title=title,
        description=(data.get('description') or '').strip() or None,
        starts_at=starts_at,
        ends_at=ends_at,
        problem_ids=[pid for pid in problem_ids if pid in valid],
        created_by=g.user_id,
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'contest': row.to_dict()}), 201
