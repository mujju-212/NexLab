"""
seed_live_scenario.py — Real-world live-session scenario for the NexLab demo.

Idempotent. Everything is scoped to institution ``inst-test-001`` and owned by
Dr. Instructor (instructor@nexlab.demo). Safe to re-run: creates are guarded by
natural keys, the junk delete is a no-op once the rows are gone.

  Part 1a  delete junk  — 9 mojibake "sesaon …" sessions on DS-A + the stray
                          "tdhdtrh" experiment (children first).
  Part 1b  3 published experiments (+ a real quiz gate on Exp 1).
  Part 1c  4 sessions across the lifecycle: ended / active / scheduled ×2.

Run (see memory: run-backend-scripts):
    cd backend
    DATABASE_URL=postgresql://postgres:vlabpass@localhost:5433/virtuallab \
        ./venv/Scripts/python.exe database/seed_live_scenario.py
"""
import os, sys
os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:vlabpass@localhost:5433/virtuallab')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.academic import Section, SectionSubject, SectionStudent
from app.models.subject import Subject
from app.models.experiment import Experiment, ContentModule, ContentPage, QuizQuestion, TestCase
from app.models.session import LabSession, SessionAttendance

# ── Anchors (verified live against Postgres:5433) ────────────────────────────────
INST             = 'inst-test-001'
INSTRUCTOR_EMAIL = 'instructor@nexlab.demo'
SS_DS_A          = 'c964b6f6-51cd-4e3a-95d4-ca8edc9b5303'   # Data Structures · Section A · Dr. Instructor
SS_PYTHON_A      = 'cc6fcebd-f535-4d10-b65d-65115e5f0a11'   # Python Programming · Section A · Dr. Instructor

now = datetime.utcnow()


def _get_or_create(model, defaults=None, **filters):
    """Return (obj, created). Mirrors seed_institution_demo.py conventions."""
    obj = model.query.filter_by(**filters).first()
    if obj:
        return obj, False
    params = dict(filters)
    params.update(defaults or {})
    obj = model(**params)
    db.session.add(obj)
    db.session.flush()
    return obj, True


def _room(slug):
    return f"vlab-{INST[:8]}-{slug}"


def seed():
    instructor = User.query.filter_by(institution_id=INST, email=INSTRUCTOR_EMAIL).first()
    if not instructor:
        raise SystemExit(f"FATAL: instructor {INSTRUCTOR_EMAIL} not found in {INST}")

    ss_ds = SectionSubject.query.get(SS_DS_A)
    ss_py = SectionSubject.query.get(SS_PYTHON_A)
    if not ss_ds or not ss_py:
        raise SystemExit("FATAL: expected section-subjects not found (DS-A / Python-A)")

    subj_ds = ss_ds.subject_id       # ac39d45a… Data Structures
    subj_py = ss_py.subject_id       # 515e8b4e… Python Programming

    # Students enrolled in DS-A's *own* section (robust against duplicate 'A' sections).
    ds_section_students = [
        r.student_id for r in SectionStudent.query.filter_by(section_id=ss_ds.section_id).all()
    ]

    log = []

    # ── Part 1a — delete junk ────────────────────────────────────────────────────
    junk_sessions = LabSession.query.filter(
        LabSession.institution_id == INST,
        LabSession.section_subject_id == SS_DS_A,
        LabSession.title.like('sesaon%'),
    ).all()
    for s in junk_sessions:
        SessionAttendance.query.filter_by(session_id=s.id).delete(synchronize_session=False)
        db.session.delete(s)
    if junk_sessions:
        log.append(f"deleted {len(junk_sessions)} mojibake junk session(s)")

    junk_exp = Experiment.query.filter_by(
        institution_id=INST, subject_id=subj_ds, title='tdhdtrh'
    ).first()
    if junk_exp:
        for m in ContentModule.query.filter_by(experiment_id=junk_exp.id).all():
            QuizQuestion.query.filter_by(module_id=m.id).delete(synchronize_session=False)
            db.session.delete(m)
        TestCase.query.filter_by(experiment_id=junk_exp.id).delete(synchronize_session=False)
        ContentPage.query.filter_by(experiment_id=junk_exp.id).delete(synchronize_session=False)
        for s in LabSession.query.filter_by(experiment_id=junk_exp.id).all():
            SessionAttendance.query.filter_by(session_id=s.id).delete(synchronize_session=False)
            db.session.delete(s)
        db.session.delete(junk_exp)
        log.append("deleted stray 'tdhdtrh' experiment")

    db.session.flush()

    # ── Part 1b — 3 published experiments ────────────────────────────────────────
    exp_defaults = dict(
        institution_id=INST,
        instructor_id=instructor.id,
        allowed_languages=['python', 'c', 'cpp', 'java'],
        difficulty_level=2,
        weightage=10,
        grade_scale=100,
        is_published=True,
    )

    exp1, _ = _get_or_create(
        Experiment, subject_id=subj_ds, exp_number=1,
        defaults=dict(
            title='Stack Implementation using Arrays',
            aim='Implement a fixed-size stack (push/pop/peek) using arrays.',
            concept_tags=['stacks', 'arrays', 'data-structures'],
            **exp_defaults,
        ),
    )
    exp2, _ = _get_or_create(
        Experiment, subject_id=subj_ds, exp_number=2,
        defaults=dict(
            title='Linked List Traversal',
            aim='Traverse a singly linked list and report its contents.',
            concept_tags=['linked-lists', 'traversal', 'pointers'],
            **exp_defaults,
        ),
    )
    exp3, _ = _get_or_create(
        Experiment, subject_id=subj_py, exp_number=1,
        defaults=dict(
            title='Python List Comprehensions',
            aim='Use list comprehensions to transform and filter sequences.',
            concept_tags=['python', 'list-comprehensions', 'iteration'],
            **exp_defaults,
        ),
    )
    # Publish + normalise ownership on any pre-existing rows (keeps re-runs correct).
    for e in (exp1, exp2, exp3):
        e.is_published = True
        e.instructor_id = instructor.id

    # ── Quiz gate on Exp 1 (makes the pre-lab gate real) ─────────────────────────
    quiz_mod, _ = _get_or_create(
        ContentModule,
        experiment_id=exp1.id, module_type='quiz', title='Stack Pre-lab Check',
        defaults=dict(
            content_data={'pass_threshold': 70, 'max_attempts': 5,
                          'cooldown_minutes': 0, 'shuffle': False, 'weight': 20},
            display_order=1,
        ),
    )
    # cooldown_minutes=0 so the verification harness can re-attempt immediately.
    quiz_mod.content_data = {'pass_threshold': 70, 'max_attempts': 5,
                             'cooldown_minutes': 0, 'shuffle': False, 'weight': 20}

    _get_or_create(
        QuizQuestion, module_id=quiz_mod.id,
        question_text='Which operation removes the top element of a stack?',
        defaults=dict(
            options={'A': 'enqueue', 'B': 'pop', 'C': 'peek', 'D': 'insert'},
            correct_answer='B', points=1,
            explanation='pop() removes and returns the top of the stack (LIFO).',
        ),
    )
    _get_or_create(
        QuizQuestion, module_id=quiz_mod.id,
        question_text='A stack follows which ordering discipline?',
        defaults=dict(
            options={'A': 'FIFO', 'B': 'Random', 'C': 'LIFO', 'D': 'Priority'},
            correct_answer='C', points=1,
            explanation='Stacks are Last-In-First-Out.',
        ),
    )

    db.session.flush()

    # ── Part 1c — 4 sessions across the lifecycle ────────────────────────────────
    # S1 — ended yesterday, catch-up open for 3 days.
    s1, _ = _get_or_create(
        LabSession,
        section_subject_id=SS_DS_A, title='DS Lab 1 — Stacks (completed)',
        defaults=dict(
            institution_id=INST, experiment_id=exp1.id,
            scheduled_at=now - timedelta(days=1, hours=2),
            duration_minutes=120, status='ended',
            started_at=now - timedelta(days=1, hours=2),
            ended_at=now - timedelta(days=1),
            catchup_enabled=True, catchup_deadline=now + timedelta(days=3),
            gate_score_threshold=70, jitsi_room_name=_room('s1'),
        ),
    )

    # S2 — active now (started 20 min ago). Attendance pre-created as 'absent'.
    s2, _ = _get_or_create(
        LabSession,
        section_subject_id=SS_DS_A, title='DS Lab 2 — Linked Lists (LIVE)',
        defaults=dict(
            institution_id=INST, experiment_id=exp2.id,
            scheduled_at=now - timedelta(minutes=20),
            duration_minutes=120, status='active',
            started_at=now - timedelta(minutes=20),
            late_join_window_min=30,
            gate_score_threshold=70, jitsi_room_name=_room('s2'),
        ),
    )
    att_created = 0
    for sid in ds_section_students:
        _, made = _get_or_create(
            SessionAttendance, session_id=s2.id, student_id=sid,
            defaults=dict(status='absent'),
        )
        att_created += 1 if made else 0

    # S3 — scheduled tomorrow (Python-A, no quiz gate).
    s3, _ = _get_or_create(
        LabSession,
        section_subject_id=SS_PYTHON_A, title='Python Lab 1 — List Comprehensions',
        defaults=dict(
            institution_id=INST, experiment_id=exp3.id,
            scheduled_at=now + timedelta(days=1),
            duration_minutes=90, status='scheduled',
            gate_score_threshold=70, jitsi_room_name=_room('s3'),
        ),
    )

    # S4 — scheduled in 2 days (DS-A, Exp 1 which HAS the quiz → real gate).
    s4, _ = _get_or_create(
        LabSession,
        section_subject_id=SS_DS_A, title='DS Lab 3 — Stacks Reprise (gated)',
        defaults=dict(
            institution_id=INST, experiment_id=exp1.id,
            scheduled_at=now + timedelta(days=2),
            duration_minutes=120, status='scheduled',
            gate_score_threshold=70, jitsi_room_name=_room('s4'),
        ),
    )

    db.session.commit()

    # ── Summary ──────────────────────────────────────────────────────────────────
    print("=" * 68)
    print("LIVE SCENARIO SEEDED  (institution: inst-test-001)")
    print("=" * 68)
    for line in log:
        print(f"  cleanup: {line}")
    if not log:
        print("  cleanup: nothing to delete (already clean)")
    print("-" * 68)
    print("Experiments (published, owner = Dr. Instructor):")
    print(f"  Exp1  {exp1.id}  #{exp1.exp_number}  {exp1.title}   [quiz gate -> mod {quiz_mod.id}]")
    print(f"  Exp2  {exp2.id}  #{exp2.exp_number}  {exp2.title}")
    print(f"  Exp3  {exp3.id}  #{exp3.exp_number}  {exp3.title}")
    print("-" * 68)
    print("Sessions:")
    print(f"  S1  {s1.id}  ended      DS-A   Exp1  (catch-up open {s1.catchup_deadline:%Y-%m-%d})")
    print(f"  S2  {s2.id}  active     DS-A   Exp2  ({att_created} attendance rows, status=absent)")
    print(f"  S3  {s3.id}  scheduled  Py-A   Exp3  (+1d)")
    print(f"  S4  {s4.id}  scheduled  DS-A   Exp1  (+2d, gated by quiz)")
    print("-" * 68)
    print("Logins (shared demo password: Passw0rd@123):")
    print(f"  instructor  {INSTRUCTOR_EMAIL}   ({instructor.id})")
    print(f"  student     student@nexlab.demo  (section A, enrolled in DS-A)")
    print("=" * 68)


if __name__ == '__main__':
    app = create_app('development')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ['DATABASE_URL']
    with app.app_context():
        seed()
