"""
app/ai/learner_context.py — the Context Engine: live learner profiles that
make the tutor "know them properly".

build_role_context(user) assembles a compact markdown block injected into
LAYER 3 of every harness prompt:

  student / platform_user : level, XP, streak, accuracy, strongest/weakest
                            topics (from the verified analytics engines),
                            recent mistakes with problem titles, current
                            courses, and the user's durable goal
  instructor              : experiments, this-week sessions, students, flags
  admin                   : platform totals (users, institutions, DAU)

Snapshots cache into ai_learner_memory (10-minute TTL) so per-message cost
stays trivial; the durable goal/notes always merge in fresh.
"""
from datetime import datetime, timedelta

from app.extensions import db
from app.models.ai_memory import AILearnerMemory

SNAPSHOT_TTL_MINUTES = 10


def _get_memory(user_id):
    mem = AILearnerMemory.query.filter_by(user_id=user_id).first()
    if not mem:
        mem = AILearnerMemory(user_id=user_id)
        db.session.add(mem)
        db.session.flush()
    return mem


def _learner_snapshot(user) -> str:
    from app.models.practice import StudentXP, PracticeSubmission, Problem
    from app.platform_user_analytics.activity import (
        get_practice_topic_mastery, get_platform_user_accuracy_and_bests,
    )

    xp = StudentXP.query.filter_by(student_id=user.id).first()
    acc = get_platform_user_accuracy_and_bests(user.id)
    dm = acc.get('difficulty_mix') or {}
    topics = get_practice_topic_mastery(user.id)
    solved_topics = [t for t in topics if (t.get('total_solved') or 0) > 0]
    strongest = sorted(solved_topics, key=lambda t: -(t.get('strength') or 0))[:3]
    weakest = sorted([t for t in topics if (t.get('strength') or 0) < 60],
                     key=lambda t: (t.get('strength') or 0))[:3]

    # recent mistakes (last 3 wrong submissions, newest first)
    wrongs = (PracticeSubmission.query
              .filter_by(student_id=user.id, is_run=False)
              .order_by(PracticeSubmission.submitted_at.desc()).limit(30).all())
    mistakes, seen = [], set()
    for s in wrongs:
        if s.status in ('Accepted',) or s.problem_id in seen:
            continue
        seen.add(s.problem_id)
        p = Problem.query.get(s.problem_id)
        if p:
            mistakes.append(f"{p.title} ({p.difficulty}, {p.nexlab_topic})")
        if len(mistakes) == 3:
            break

    lines = [f"LEARNER PROFILE — {user.full_name}:"]
    if xp:
        lines.append(f"- Level {xp.level} ({xp.level_name}), {xp.total_xp or 0} XP, "
                     f"{xp.streak_days or 0}-day streak, {xp.problems_solved or 0} problems solved")
    if dm:
        lines.append(f"- Accuracy: acceptance {dm.get('acceptance_rate', 0)}%, "
                     f"first-try {dm.get('first_try_rate', 0)}% · "
                     f"solved mix easy {dm.get('easy', 0)} / medium {dm.get('medium', 0)} / hard {dm.get('hard', 0)}")
    if strongest:
        lines.append("- Strongest topics: " + ", ".join(
            f"{t['topic']} ({t['strength']:.0f})" for t in strongest))
    if weakest:
        lines.append("- Needs practice: " + ", ".join(
            f"{t['topic']} ({t['strength']:.0f})" for t in weakest))
    if mistakes:
        lines.append("- Recent mistakes to revisit: " + "; ".join(mistakes))
    return "\n".join(lines)


def _instructor_snapshot(user) -> str:
    from app.models.experiment import Experiment
    from app.models.session import LabSession
    from app.models.feedback import PlagiarismFlag
    from datetime import timezone

    iid = user.institution_id
    exps = Experiment.query.filter_by(institution_id=iid, instructor_id=user.id).count()
    week_ago = datetime.utcnow() - timedelta(days=7)
    sessions_w = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.scheduled_at >= week_ago).count()
    from app.models.user import User
    students = User.query.filter_by(institution_id=iid, role='student').count()
    flags = PlagiarismFlag.query.filter(
        PlagiarismFlag.detected_at >= week_ago).count() if hasattr(PlagiarismFlag, 'detected_at') else 0
    return (f"TEACHING CONTEXT — {user.full_name}:\n"
            f"- {exps} experiments authored · {sessions_w} sessions scheduled in the last 7 days\n"
            f"- {students} students in the institution · {flags} plagiarism flags this week")


def _admin_snapshot(user) -> str:
    from app.models.user import User
    from app.models.institution import Institution
    from sqlalchemy import text
    total = User.query.count()
    insts = Institution.query.count()
    # platform_metrics_daily is created by migrate_admin_p3.py; if it is
    # missing, degrade gracefully instead of aborting the request transaction
    # (a failing raw query poisons every later commit in this request).
    dau = None
    try:
        dau = db.session.execute(text("""
            SELECT value FROM platform_metrics_daily
            WHERE metric='dau' AND institution_id='platform'
            ORDER BY day DESC LIMIT 1
        """)).scalar()
    except Exception:
        db.session.rollback()
    return (f"PLATFORM CONTEXT — {user.full_name} (Platform Admin):\n"
            f"- {total} users across {insts} institutions"
            + (f" · latest snapshot DAU {int(float(dau))}" if dau is not None else ""))


def build_role_context(user) -> str:
    """Compact, cached, role-aware context block for the harness prompt."""
    role = (user.role or 'student').lower()
    try:
        if role in ('student', 'platform_user'):
            mem = _get_memory(user.id)
            fresh = mem.snapshot_at and (
                datetime.utcnow() - mem.snapshot_at) < timedelta(minutes=SNAPSHOT_TTL_MINUTES)
            if not fresh or not mem.snapshot:
                mem.snapshot = _learner_snapshot(user)
                mem.snapshot_at = datetime.utcnow()
                db.session.commit()
            block = mem.snapshot or ''
            durable = []
            if mem.goal:
                durable.append(f"- Stated goal: {mem.goal}")
            if mem.preferred_language:
                durable.append(f"- Preferred language: {mem.preferred_language}")
            if mem.tutor_notes:
                durable.append(f"- Tutor notes (memory): {mem.tutor_notes[:300]}")
            if durable:
                block += "\n" + "\n".join(durable)
            return block
        if role == 'instructor':
            return _instructor_snapshot(user)
        if role in ('admin', 'platform_admin'):
            return _admin_snapshot(user)
    except Exception:
        # The context engine must NEVER break a tutor turn — degrade silently.
        # CRITICAL: roll back any aborted transaction. If a raw SQL statement
        # above failed, the Postgres transaction is aborted; without a rollback
        # every later commit in this request would silently discard the
        # caller's uncommitted work (e.g. the chat session row) and end with
        # a foreign-key violation.
        try:
            db.session.rollback()
        except Exception:
            pass
        return ''
    return ''


def save_learning_goal(user_id, goal=None, preferred_language=None, note=None):
    """Durable tutor memory writes (used by the tutor tool + profile API)."""
    mem = _get_memory(user_id)
    if goal is not None:
        mem.goal = goal.strip()[:500] or None
    if preferred_language is not None:
        mem.preferred_language = preferred_language.strip()[:30] or None
    if note is not None:
        existing = (mem.tutor_notes or '').strip()
        mem.tutor_notes = (note.strip()[:500] + ('\n' + existing if existing else ''))[:2000]
    db.session.commit()
    return mem
