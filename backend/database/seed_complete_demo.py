#!/usr/bin/env python3
"""seed_complete_demo.py — the complete, realistic two-month demo dataset.

This is the single canonical "full data" seeder for the SKIT demo tenant.
It is NOT a paint-on of dashboard numbers: every analytics page reads its
values from the raw rows created here (attempts, attendance, focus, exam
attempts, AI usage, XP ...), and at the end it triggers the platform's own
nightly snapshot jobs so the derived metrics are computed for real.

WHAT IT CREATES (two-month window: 2026-08-26 .. 2026-10-26, Wed labs 10:00)
─────────────────────────────────────────────────────────────────────────────
A.  Platform users (free tier, no institution):
     3 accounts with ~50-80 practice submissions each, XP/level/streak,
     quest claims, badges, bookmarks, playground sessions, platform-course
     progress across all 11 seeded exercises, AI chat/hint usage.
B.  SKIT institution (admin + 1 instructor + 16 students):
     • +8 students (SKIT2026010..017) on the existing section
     • 4 graded test cases per experiment (the 3 baseline experiments)
     • 8 COMPLETED lab sessions (Aug 26 .. Oct 14) with per-student
       attendance (present/late/absent), focus scores, session feedback
     • ~350 code attempts with per-test-case results, compile states,
       learning trajectories per student, code versions
     • viva sessions for the strong new students (Viva Week, Oct 7)
     • grades for the 8 new students via the real instructor API
     • 1 published mid-term exam (10 questions) + 18 attempts (2 retries)
     • 7 sent + 1 scheduled announcement, ~90 notifications
     • AI usage log (~150 rows, students/instructor/admin), hint logs
     • 4 proctoring events, 2 interventions, 1 plagiarism flag,
       6 instructor↔student chat messages
     • concept mastery for all 16 students
C.  Derived data: runs _run_nightly_metric_snapshots() and
    _platform_metric_snapshots() from app/jobs.py so student metric
    snapshots and institution daily KPIs are genuine computations.

DETERMINISM & SAFETY
────────────────────
• RNG seeded with 42 → identical dataset on every run.
• Idempotent: every section is guarded by a unique-key check (email,
  roll number, session (section_subject, scheduled_at), exam title,
  announcement title, ...). Re-running will not duplicate rows.
• Preserves the walkthrough.py / make_activity.py / make_cohort.py
  baseline untouched (Rahul's rows, the 3 "Lab session N" scheduled
  sessions, existing grades).
• Run AFTER make_cohort.py so SKIT2026002..009 exist with their grades.

Usage:   cd backend && python3 database/seed_complete_demo.py
"""
import json
import os
import random
import secrets
import sys
import uuid
from datetime import datetime, date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import bcrypt
import requests
from sqlalchemy import text

# Run against the live DB but with TESTING=True so create_app() does NOT
# start a second background-scheduler (the live server already runs the jobs).
os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault(
    "TEST_DATABASE_URL",
    os.environ.get("DATABASE_URL",
                   "postgresql://postgres:vlabpass@localhost:5433/virtuallab"),
)

from app import create_app  # noqa: E402

# ──────────────────────────────────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────────────────────────────────
API = "http://localhost:5000/api"
INSTRUCTOR = ("anitha.rao@skit.edu.in", "Instructor@2026")

RNG = random.Random(42)
NS = uuid.UUID("9a3f1c2e-7d4b-4e8a-b6f0-2c5d8e1f4a7b")  # seed-namespace

TODAY = date(2026, 10, 26)

# 8 completed lab sessions (Wednesdays) + 2 upcoming
PAST_LAB_DAYS = [date(2026, 8, 26), date(2026, 9, 2), date(2026, 9, 9),
                 date(2026, 9, 16), date(2026, 9, 23), date(2026, 9, 30),
                 date(2026, 10, 7), date(2026, 10, 14)]
UPCOMING_LAB_DAYS = [date(2026, 10, 28), date(2026, 10, 31)]
LAB_START_H, LAB_MIN = 10, 90          # 10:00, 90 minutes
VIVA_DAY = date(2026, 10, 7)

# experiment index → lab session indices (0-based into PAST_LAB_DAYS)
EXP_SESSIONS = {1: [0, 3, 7], 2: [1, 4], 3: [2, 5, 6]}

# Skill tiers: (attend_reliability, final_accept, exam_acc, focus_base, mastery)
# mastery is on the platform's 0-100 scale (ConceptMastery docstring).
TIERS = {
    "top":  (0.97, 0.95, 0.92, 92, 90.0),
    "good": (0.93, 0.86, 0.82, 86, 78.0),
    "mid":  (0.88, 0.66, 0.66, 78, 62.0),
    "weak": (0.78, 0.42, 0.50, 68, 45.0),
    "low":  (0.62, 0.22, 0.35, 58, 30.0),
}

# Existing baseline students (roll → tier). 001..009 come from
# walkthrough.py / make_activity.py / make_cohort.py.
EXISTING_ROLES = {
    "SKIT2026001": "good", "SKIT2026002": "top",  "SKIT2026003": "good",
    "SKIT2026004": "weak", "SKIT2026005": "weak", "SKIT2026006": "good",
    "SKIT2026007": "mid",  "SKIT2026008": "low",  "SKIT2026009": "good",
}
NEW_STUDENTS = [
    # (roll, full name, email, tier)
    ("SKIT2026010", "Arjun Verma",     "arjun.verma@skit.edu.in",     "good"),
    ("SKIT2026011", "Diya Kulkarni",   "diya.kulkarni@skit.edu.in",   "top"),
    ("SKIT2026012", "Ishaan Gupta",    "ishaan.gupta@skit.edu.in",    "mid"),
    ("SKIT2026013", "Janhavi Joshi",   "janhavi.joshi@skit.edu.in",   "good"),
    ("SKIT2026014", "Kunal Mehta",     "kunal.mehta@skit.edu.in",     "weak"),
    ("SKIT2026015", "Lakshmi Pillai",  "lakshmi.pillai@skit.edu.in",  "mid"),
    ("SKIT2026016", "Om Thakur",       "om.thakur@skit.edu.in",       "low"),
    ("SKIT2026017", "Priyanka Bose",   "priyanka.bose@skit.edu.in",   "good"),
]

PLATFORM_USERS = [
    # (email, full name, language, style)  style: 'python' | 'dsa' | 'cpp'
    ("priya.raman@outlook.com", "Priya Raman",   "python", "python"),
    ("dev.patel@gmail.com",     "Dev Patel",     "python", "dsa"),
    ("sanjana.nair@proton.me",  "Sanjana Nair",  "cpp",    "cpp"),
]

CODE_SNIPPETS = {
    1: {  # Binary search
        "ok": "def binary_search(arr, target):\n    lo, hi = 0, len(arr) - 1\n    while lo <= hi:\n        mid = (lo + hi) // 2\n        if arr[mid] == target:\n            return mid\n        if arr[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n",
        "off_by_one": "def binary_search(arr, target):\n    lo, hi = 0, len(arr) - 1\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if arr[mid] == target:\n            return mid\n        if arr[mid] < target:\n            lo = mid + 1\n        else:\n            hi = mid - 1\n    return -1\n",
        "linear": "def binary_search(arr, target):\n    for i in range(len(arr)):\n        if arr[i] == target:\n            return i\n    return -1\n",
    },
    2: {  # Merge two sorted arrays
        "ok": "def merge(a, b):\n    out, i, j = [], 0, 0\n    while i < len(a) and j < len(b):\n        if a[i] <= b[j]:\n            out.append(a[i]); i += 1\n        else:\n            out.append(b[j]); j += 1\n    out.extend(a[i:]); out.extend(b[j:])\n    return out\n",
        "pop0": "def merge(a, b):\n    a, b = a[:], b[:]\n    out = []\n    while a and b:\n        out.append(a.pop(0) if a[0] <= b[0] else b.pop(0))\n    return out + a + b\n",
        "sort": "def merge(a, b):\n    return sorted(a + b)\n",
    },
    3: {  # Insertion sort
        "ok": "def insertion_sort(arr):\n    a = arr[:]\n    for i in range(1, len(a)):\n        key = a[i]; j = i - 1\n        while j >= 0 and a[j] > key:\n            a[j + 1] = a[j]; j -= 1\n        a[j + 1] = key\n    return a\n",
        "swap": "def insertion_sort(arr):\n    a = arr[:]\n    for i in range(1, len(a)):\n        j = i\n        while j > 0 and a[j - 1] > a[j]:\n            a[j - 1], a[j] = a[j], a[j - 1]\n            j -= 1\n    return a\n",
        "broken": "def insertion_sort(arr):\n    a = arr[:]\n    for i in range(1, len(a)):\n        key = a[i]\n        while i > 0 and a[i - 1] > key:\n            a[i] = a[i - 1]\n            i -= 1\n        a[i] = key\n    return a\n",
    },
}

FEEDBACK_COMMENTS = [
    "Session was well paced, the dry run of the algorithm before coding helped a lot.",
    "AI hints were useful but I wish there were more hidden test cases.",
    "A bit rushed at the end; the viva round took longer than expected.",
    "Great session. The complexity discussion before insertion sort clarified things.",
    "Screen share worked fine, one small lag at the start.",
    "Could use a shorter break between the theory and coding parts.",
    "Very helpful — the step-by-step trace on the whiteboard was clear.",
]

AI_MODELS = [("qwen/qwen3.8-27b", "groq"), ("openai/gpt-oss-120b", "groq")]

BADGES = ["first_problem", "streak_7", "streak_30", "solved_20", "medium_10", "hard_1"]


def uid(name: str) -> str:
    return str(uuid.uuid5(NS, name))


def _session_on_or_before(past: dict, day: date):
    """Latest past session on/before `day` (for FK-bearing rows)."""
    best = None
    for sid, meta in past.items():
        if meta["day"] <= day and (best is None or meta["day"] > past[best]["day"]):
            best = sid
    return best


def dt(d: date, h: int, m: int) -> str:
    return f"{d.isoformat()} {h:02d}:{m:02d}:{RNG.randint(0, 59):02d}"


# ──────────────────────────────────────────────────────────────────────────
# Raw-SQL helpers (explicit columns, idempotent)
# ──────────────────────────────────────────────────────────────────────────
class DB:
    def __init__(self, session):
        self.s = session

    def has(self, query, *params) -> bool:
        return self.s.execute(text(query), params).first() is not None

    def ins(self, table: str, cols: list, values: list):
        col_sql, names = [], []
        for c in cols:
            col_sql.append(c)                      # rendered as-is (handles "at")
            names.append(c.strip('"'))             # bind-param identifier
        sql = (f"INSERT INTO {table} ({', '.join(col_sql)}) "
               f"VALUES ({', '.join(':' + n for n in names)})")
        self.s.execute(text(sql), dict(zip(names, values)))

    def count(self, table: str, where: str = "1=1"):
        return self.s.execute(text(f"SELECT count(*) FROM {table} WHERE {where}")).scalar()


def j(obj) -> str:
    return json.dumps(obj)


# ──────────────────────────────────────────────────────────────────────────
# Section A — Platform users
# ──────────────────────────────────────────────────────────────────────────
def seed_platform_users(db: DB, app):
    created = 0
    for email, name, lang, style in PLATFORM_USERS:
        row = db.s.execute(text(
            "SELECT id FROM users WHERE email=:e AND role='platform_user'"
        ), {"e": email}).first()
        if row:
            continue
        pwd = bcrypt.hashpw(b"Platform@2026", bcrypt.gensalt(rounds=4)).decode()
        db.ins("users", ["id", "email", "password_hash", "full_name", "first_name",
                         "last_name", "role", "is_active", "status", "created_at"],
               [uid(f"pu:{email}"), email, pwd, name, name.split()[0],
                name.split()[-1], "platform_user", True, "active",
                dt(date(2026, 8, 20), 18, RNG.randint(0, 59))])
        created += 1

    # problem pool per style (deterministic pick, 60 problems each)
    problems = {}
    for style in ("python", "dsa", "cpp"):
        rows = db.s.execute(text(
            "SELECT id, difficulty FROM practice_problems WHERE is_active "
            "ORDER BY slug LIMIT 60"
        )).all()
        problems[style] = rows

    for email, name, lang, style in PLATFORM_USERS:
        user_id = db.s.execute(text(
            "SELECT id FROM users WHERE email=:e"
        ), {"e": email}).scalar()
        if db.has("SELECT 1 FROM practice_student_xp WHERE student_id=:s", {"s": user_id}):
            continue
        probs = problems[style]
        picks = RNG.sample(list(probs), k=42)
        solved_easy = solved_med = solved_hard = 0
        subs = 0
        first_seen = date(2026, 8, 28)
        streak = 0
        for (pid, diff), solved in zip(
            picks, [RNG.random() < (0.78, 0.62, 0.40)["Easy Medium Hard".split().index(diff)]
                    for diff in [p[1] for p in picks]]
        ):
            # spread submissions across 8 weeks
            day = first_seen + timedelta(days=RNG.randint(0, 58))
            h, m = RNG.randint(8, 22), RNG.randint(0, 59)
            n_attempts = RNG.choices([1, 2, 3], weights=[60, 28, 12])[0]
            xp = {"Easy": 10, "Medium": 20, "Hard": 30}[diff]
            for k in range(n_attempts):
                status = "Accepted" if (solved and k == n_attempts - 1) else \
                    RNG.choice(["Wrong Answer", "Time Limit Exceeded", "Runtime Error",
                                "Compilation Error", "Wrong Answer"])
                passed = 0 if status != "Accepted" else RNG.randint(3, 4)
                total = RNG.choice([3, 4])
                db.ins("practice_submissions",
                       ["id", "student_id", "problem_id", "language", "code", "status",
                        "passed", "total", "time_ms", "memory_kb", "xp_earned",
                        "is_run", "submitted_at"],
                       [uid(f"psub:{user_id}:{pid}:{k}"), user_id, pid, lang,
                        "def solve():\n    pass  # (seeded sample)", status, passed,
                        total, RNG.randint(40, 900), RNG.randint(8000, 64000),
                        xp if (status == "Accepted" and k == n_attempts - 1) else 0,
                        False, dt(day, h, m)])
                subs += 1
            if solved:
                if diff == "Easy":
                    solved_easy += 1
                elif diff == "Medium":
                    solved_med += 1
                else:
                    solved_hard += 1
                streak += 1

        streak_days = max(3, min(streak // 3 + RNG.randint(4, 18), 34))
        total_xp = solved_easy * 10 + solved_med * 20 + solved_hard * 30
        level = 1 + total_xp // 500
        level_name = ["Novice", "Learner", "Practitioner", "Problem Solver",
                      "Algorithmist", "Expert", "Guru"]
        db.ins("practice_student_xp",
               ["id", "student_id", "total_xp", "level", "level_name", "streak_days",
                "streak_last_date", "freeze_used_month", "problems_solved",
                "easy_solved", "medium_solved", "hard_solved", "profile_public",
                "profile_slug"],
               [uid(f"pxp:{user_id}"), user_id, total_xp, level,
                level_name[min(level - 1, 6)], streak_days, TODAY - timedelta(days=0),
                0, solved_easy + solved_med + solved_hard, solved_easy, solved_med,
                solved_hard, True, name.lower().replace(" ", "")])

        # quest claims across the two months (keys are date-scoped, matching
        # the format quest_service.py builds: <quest>_<YYYY-MM-DD>)
        for wk in range(8):
            if RNG.random() < 0.75:
                cday = date(2026, 8, 27) + timedelta(days=7 * wk)
                db.ins("practice_quest_claims",
                       ["id", "student_id", "quest_key", "quest_type", "xp_awarded",
                        "claimed_at"],
                       [uid(f"q:{user_id}:daily:{wk}"), user_id,
                        f"daily_medium_1_{cday.isoformat()}",
                        "daily", 10, dt(cday, 20, 5)])
        for wk in (2, 5):
            cday = date(2026, 8, 27) + timedelta(days=7 * (wk + 1))
            monday = cday - timedelta(days=cday.weekday())
            db.ins("practice_quest_claims",
                   ["id", "student_id", "quest_key", "quest_type", "xp_awarded",
                    "claimed_at"],
                   [uid(f"q:{user_id}:weekly:{wk}"), user_id,
                    f"weekly_medium_10_{monday.isoformat()}",
                    "weekly", 200, dt(cday, 21, 0)])

        # badges (guarded: whole block skipped on re-run)
        if db.count("practice_student_badges", f"student_id='{user_id}'") == 0:
            for b, when in zip(BADGES[: min(4 + (style == "dsa"), len(BADGES))],
                               [date(2026, 8, 29), date(2026, 9, 8), date(2026, 9, 22),
                                date(2026, 10, 5), date(2026, 10, 12)]):
                db.ins("practice_student_badges",
                       ["id", "student_id", "badge_id", "earned_at"],
                       [uid(f"b:{user_id}:{b}"), user_id, b, dt(when, 21, 30)])

        # bookmarks (3)
        if db.count("practice_bookmarks", f"user_id='{user_id}'") == 0:
            for i, (pid, diff) in enumerate(RNG.sample(list(probs), 3)):
                db.ins("practice_bookmarks",
                       ["id", "user_id", "problem_id", "note", "created_at"],
                       [uid(f"bm:{user_id}:{i}"), user_id, pid,
                        ["Review before exams", "Classic problem",
                         "Need better approach"][i],
                        dt(date(2026, 9, 5) + timedelta(days=14 * i), 22, 10)])

        # playground sessions (4)
        if db.count("playground_sessions", f"user_id='{user_id}'") == 0:
            for i in range(4):
                db.ins("playground_sessions",
                       ["id", "user_id", "title", "language", "code", "stdin_data",
                        "share_slug", "is_shared", "created_at", "updated_at"],
                       [uid(f"pg:{user_id}:{i}"), user_id,
                        f"Scratch {i + 1}", lang,
                        "def main():\n    print('hello nexlab')\n",
                        "", uid(f"pgs:{user_id}:{i}")[:8], False,
                        dt(date(2026, 9, 2) + timedelta(days=18 * i), 19, 40),
                        dt(date(2026, 9, 2) + timedelta(days=18 * i), 19, 55)])

        # AI usage (chat + hints)
        if db.count("ai_usage_log", f"user_id='{user_id}'") == 0:
            for k in range(RNG.randint(6, 12)):
                model, prov = AI_MODELS[RNG.random() < 0.8]
                db.ins("ai_usage_log",
                       ["id", "institution_id", "user_id", "role", "feature",
                        "model", "provider", "prompt_tokens", "completion_tokens",
                        "total_tokens", "estimated_cost_usd", "latency_ms",
                        "success", "section_subject_id", "created_at"],
                       [uid(f"aiu:pu:{user_id}:{k}"), None, user_id,
                        "platform_user",
                        RNG.choice(["chat", "hint", "chat"]), model, prov,
                        RNG.randint(200, 900), RNG.randint(60, 400),
                        RNG.randint(260, 1300), round(RNG.uniform(0.0005, 0.004), 4),
                        RNG.randint(700, 3800), True, None,
                        dt(date(2026, 8, 28) + timedelta(days=RNG.randint(0, 58)),
                           RNG.randint(8, 22), RNG.randint(0, 59))])

    # platform-course progress across the 11 seeded exercises
    ex_rows = db.s.execute(text(
        "SELECT x.id, x.title, x.course_id, c.slug, x.xp_reward, x.exercise_type "
        "FROM platform_exercises x JOIN platform_courses c ON c.id = x.course_id "
        "ORDER BY c.order_index, x.order_index"
    )).all()
    plans = {  # style → (solved count, attempted count)
        "python": (5, 2), "dsa": (4, 3), "cpp": (3, 2),
    }
    for email, name, lang, style in PLATFORM_USERS:
        user_id = db.s.execute(text("SELECT id FROM users WHERE email=:e"),
                               {"e": email}).scalar()
        if db.count("platform_progress", f"user_id='{user_id}'") > 0:
            continue
        solved, attempted = plans[style]
        for i, (xid, title, cid, slug, xp, etype) in enumerate(ex_rows):
            if i < solved:
                status, attempts, best = "solved", RNG.randint(1, 3), 100.0
            elif i < solved + attempted:
                status, attempts, best = "attempted", RNG.randint(1, 4), RNG.randint(40, 80)
            else:
                continue
            solved_at = dt(date(2026, 9, 1) + timedelta(days=4 * i), 17, 20)
            db.ins("platform_progress",
                   ["id", "user_id", "exercise_id", "course_id", "status", "attempts",
                    "best_score", "last_code", "language_used", "xp_earned",
                    "solved_at", "created_at", "updated_at"],
                   [uid(f"pp:{user_id}:{xid}"), user_id, xid, cid, status, attempts,
                    best, "def solve():\n    pass", lang,
                    int(xp or 0) if status == "solved" else 0,
                    solved_at if status == "solved" else None,
                    dt(date(2026, 8, 30) + timedelta(days=3 * i), 16, 0), solved_at])

    return created


# ──────────────────────────────────────────────────────────────────────────
# Section B — SKIT institution
# ──────────────────────────────────────────────────────────────────────────
def _institution_ctx(db: DB):
    inst = db.s.execute(text("SELECT id FROM institutions LIMIT 1")).scalar()
    ss = dict(db.s.execute(text("SELECT * FROM section_subjects LIMIT 1")).mappings().first())
    # department is reached via section -> batch -> department
    dept = db.s.execute(text(
        "SELECT b.department_id FROM sections s JOIN batches b ON b.id = s.batch_id "
        "WHERE s.id = :sec"
    ), {"sec": ss["section_id"]}).scalar()
    ss["department_id"] = dept
    instructor = db.s.execute(text(
        "SELECT id FROM users WHERE role='instructor' AND institution_id=:i"
    ), {"i": inst}).scalar()
    admin = db.s.execute(text(
        "SELECT id FROM users WHERE role='institution_admin' AND institution_id=:i"
    ), {"i": inst}).scalar()
    exps = {e["exp_number"]: e for e in db.s.execute(text(
        "SELECT id, exp_number, title FROM experiments ORDER BY exp_number"
    )).mappings()}
    return inst, dict(ss), instructor, admin, exps


def _roster(db: DB, inst) -> dict:
    """roll → (user_id, tier) for all 16 students."""
    roster = {}
    rows = db.s.execute(text(
        "SELECT id, roll_number, full_name FROM users "
        "WHERE role='student' AND institution_id=:i AND roll_number IS NOT NULL "
        "ORDER BY roll_number"
    ), {"i": inst}).all()
    for uid_, roll, name in rows:
        tier = EXISTING_ROLES.get(roll)
        if tier is None and roll in [r for r, *_ in NEW_STUDENTS]:
            tier = dict((r, t) for r, _, _, t in NEW_STUDENTS)[roll]
        if tier:
            roster[roll] = (uid_, tier, name)
    return roster


def seed_new_students(db: DB, inst, ss):
    made = 0
    for roll, name, email, tier in NEW_STUDENTS:
        if db.has("SELECT 1 FROM users WHERE roll_number=:r", {"r": roll}):
            continue
        pwd = bcrypt.hashpw(b"TempStud@2026", bcrypt.gensalt(rounds=4)).decode()
        db.ins("users",
               ["id", "institution_id", "email", "password_hash", "full_name",
                "first_name", "last_name", "role", "roll_number", "department_id",
                "year_of_study", "semester", "is_active", "status", "created_at"],
               [uid(f"stu:{roll}"), inst, email, pwd, name, name.split()[0],
                name.split()[-1], "student", roll, ss["department_id"], 3, 5,
                True, "active", dt(date(2026, 8, 25), 12, 0)])
        db.ins("section_students",
               ["section_id", "student_id", "enrolled_at"],
               [ss["section_id"], uid(f"stu:{roll}"), dt(date(2026, 8, 25), 12, 0)])
        made += 1
    return made


def seed_test_cases(db: DB, exps):
    made = 0
    for num, exp in sorted(exps.items()):
        if db.count("test_cases", f"experiment_id='{exp['id']}'") > 0:
            continue
        base = {1: ("[-10, -3, 0, 4, 9, 15, 22, 30, 41, 50]", "3"),
                2: ("[1, 3, 5, 7] [2, 4, 6, 8, 10]", "1 2 3 4 5 6 7 8 10"),
                3: ("5 2 9 1 7 3", "1 2 3 5 7 9")}[num]
        inputs = [base[0], "[] []" if num == 2 else "[-5]" if num != 2 else "[1] [1]",
                 "[100, 200, 300, 400]" if num != 3 else "9 8 7 6 5 4 3 2 1",
                 "1 1 1 1" if num == 3 else "[0] [0, 0]"]
        expected = [base[1], "41", "22", "0"]
        for k in range(4):
            db.ins("test_cases",
                   ["id", "experiment_id", "input_data", "expected_output", "is_hidden",
                    "points_weight", "description"],
                   [uid(f"tc:{num}:{k}"), exp["id"], inputs[k], expected[k],
                    k >= 3, 25.0, f"Case {k + 1}" + (" (hidden)" if k >= 3 else "")])
            made += 1
    return made


def seed_sessions(db: DB, inst, ss, exps):
    """8 completed + 2 upcoming sessions. Returns {session_id: meta} for past."""
    past, upcoming = {}, []
    for i, day in enumerate(PAST_LAB_DAYS):
        num = [n for n, idxs in EXP_SESSIONS.items() if i in idxs][0]
        key = f"labwk:{ss['section_subject_id'] if 'section_subject_id' in ss else ss['id']}:{day.isoformat()}"
        if db.has("SELECT 1 FROM lab_sessions WHERE section_subject_id=:s "
                  "AND scheduled_at::date=:d AND title LIKE 'Lab Week %'",
                  {"s": ss["id"], "d": day}):
            row = db.s.execute(text(
                "SELECT id, started_at FROM lab_sessions WHERE section_subject_id=:s "
                "AND scheduled_at::date=:d AND title LIKE 'Lab Week %'"
            ), {"s": ss["id"], "d": day}).first()
            past[row[0]] = {"day": day, "exp": num, "idx": i, "started_at": row[1]}
            continue
        sid = uid(key)
        start = datetime(day.year, day.month, day.day, LAB_START_H)
        end = start + timedelta(minutes=LAB_MIN)
        db.ins("lab_sessions",
               ["id", "institution_id", "section_subject_id", "experiment_id", "title",
                "scheduled_at", "duration_minutes", "gate_score_threshold",
                "late_join_window_min", "catchup_enabled", "focus_ml_enabled",
                "lockdown_enabled", "status", "started_at", "ended_at", "created_at"],
               [sid, inst, ss["id"], exps[num]["id"],
                f"Lab Week {i + 1}: {exps[num]['title']}",
                start, LAB_MIN, 60, 10, True, True, True, "completed",
                start, end, start - timedelta(days=7)])
        past[sid] = {"day": day, "exp": num, "idx": i, "started_at": start}
    for j, day in enumerate(UPCOMING_LAB_DAYS):
        num = 1 if j == 0 else 3
        if db.has("SELECT 1 FROM lab_sessions WHERE section_subject_id=:s "
                  "AND scheduled_at::date=:d", {"s": ss["id"], "d": day}):
            continue
        start = datetime(day.year, day.month, day.day, LAB_START_H)
        db.ins("lab_sessions",
               ["id", "institution_id", "section_subject_id", "experiment_id", "title",
                "scheduled_at", "duration_minutes", "gate_score_threshold",
                "late_join_window_min", "catchup_enabled", "focus_ml_enabled",
                "lockdown_enabled", "status", "created_at"],
               [uid(f"labup:{ss['id']}:{day.isoformat()}"), inst, ss["id"],
                exps[num]["id"],
                f"Lab Week {8 + j + 1}: {exps[num]['title']}",
                start, LAB_MIN, 60, 10, True, True, True, "scheduled",
                dt(date(2026, 10, 20), 9, 0)])
        upcoming.append(sid := None)
    return past


def seed_attendance_focus_feedback(db: DB, inst, past, roster):
    n_att = n_focus = n_fb = 0
    for sid, meta in past.items():
        if db.count("session_attendance", f"session_id='{sid}'") > 0:
            continue  # whole session already seeded (re-run)
        for roll, (uid_, tier, name) in sorted(roster.items()):
            rel, _, _, focus_base, _ = TIERS[tier]
            r = RNG.random()
            status = "present" if r < rel else ("late" if r < rel + 0.08 else "absent")
            if status == "absent":
                db.ins("session_attendance",
                       ["session_id", "student_id", "status"], [sid, uid_, "absent"])
                n_att += 1
                continue
            start = meta["started_at"]
            joined = start + timedelta(minutes=(RNG.randint(2, 12) if status == "late"
                                                else RNG.randint(-3, 6)))
            left = start + timedelta(minutes=LAB_MIN - RNG.randint(0, 18))
            total = int((left - joined).total_seconds())
            fb = RNG.random() < 0.55
            db.ins("session_attendance",
                   ["session_id", "student_id", "joined_at", "left_at",
                    "reconnect_count", "total_time_seconds", "is_catchup", "status",
                    "is_active_participant", "feedback_submitted"],
                   [sid, uid_, joined, left, RNG.randint(0, 1), total, False, status,
                    status != "absent", fb])
            n_att += 1
            # focus score
            if fb:
                db.ins("session_feedback",
                       ["id", "session_id", "institution_id", "experiment_clarity",
                        "session_pacing", "ai_hint_helpfulness", "overall_rating",
                        "comment", "helpful_count", "submitted_at"],
                       [uid(f"fb:{sid}:{uid_}"), sid, inst,
                        RNG.randint(3, 5), RNG.randint(3, 5), RNG.randint(2, 5),
                        RNG.randint(3, 5),
                        RNG.choice(FEEDBACK_COMMENTS) if RNG.random() < 0.5 else None,
                        RNG.randint(0, 4), left + timedelta(minutes=2)])
                n_fb += 1
            fscore = max(40, min(99, int(focus_base + RNG.gauss(0, 6))))
            db.ins("focus_scores",
                   ["id", "student_id", "session_id", "signals", "focus_score",
                    "recorded_at"],
                   [uid(f"fs:{sid}:{uid_}"), uid_, sid,
                    j({"tab_switches": RNG.randint(0, 3),
                       "fullscreen_drops": RNG.randint(0, 2),
                       "idle_seconds": RNG.randint(0, 900),
                       "keystroke_bursts": RNG.randint(40, 800),
                       "page_visits": RNG.randint(1, 5)}),
                    float(fscore), left - timedelta(minutes=RNG.randint(5, 20))])
            n_focus += 1
    return n_att, n_focus, n_fb


def _attempt_plan(tier, exp_num, rng):
    """(n_attempts, final_passed) learning trajectory per student/experiment."""
    _, accept, _, _, _ = TIERS[tier]
    n = {"top": rng.randint(2, 3), "good": 3, "mid": rng.randint(3, 4),
         "weak": rng.randint(4, 5), "low": rng.randint(3, 5)}[tier]
    r = rng.random()
    if r < accept * 0.9:
        final = 4
    elif r < accept * 0.9 + (1 - accept) * 0.5:
        final = 3
    else:
        final = rng.choice([1, 2, 2, 3]) if tier in ("weak", "low") else 2
    return n, min(final, n if final > 0 else 4)


def seed_attempts(db: DB, inst, past, roster, exps, ss):
    n_att = n_res = 0
    session_ids = {}
    for sid, m in past.items():
        session_ids.setdefault(m["exp"], []).append(sid)
    for exp in session_ids:
        session_ids[exp] = sorted(session_ids[exp],
                                  key=lambda s: past[s]["started_at"])
    for roll, (uid_, tier, name) in sorted(roster.items()):
        for num in (1, 2, 3):
            if db.count("code_attempts", f"student_id='{uid_}' AND experiment_id='{exps[num]['id']}'") > 0:
                continue
            n, final = _attempt_plan(tier, num, RNG)
            snips = list(CODE_SNIPPETS[num].values())
            sess_list = session_ids[num]
            # trajectory of passed counts: mostly non-decreasing to `final`
            traj = [0] * n
            traj[-1] = final
            for k in range(n - 2, -1, -1):
                traj[k] = max(0, min(traj[k + 1], RNG.randint(0, traj[k + 1])))
            for k in range(n):
                # attempt k happens in the k-th session of this experiment
                if k < len(sess_list):
                    sid, meta = sess_list[k], past[sess_list[k]]
                    submitted = meta["started_at"] + timedelta(
                        minutes=RNG.randint(25, LAB_MIN - 15))
                else:
                    sid = None
                    base_day = past[sess_list[-1]]["day"] + timedelta(days=RNG.randint(2, 5))
                    submitted = datetime(base_day.year, base_day.month, base_day.day,
                                         RNG.randint(9, 17), RNG.randint(0, 59))
                compile_ok = traj[k] > 0 or k == n - 1 or RNG.random() > 0.25
                passed = 0 if not compile_ok else traj[k]
                aid = uid(f"att:{uid_}:{num}:{k}")
                db.ins("code_attempts",
                       ["id", "student_id", "experiment_id", "session_id", "attempt_number",
                        "language", "files", "stdin", "compile_status", "compile_output",
                        "stdout", "stderr", "test_cases_passed", "test_cases_total",
                        "execution_time_ms", "memory_used_kb", "loc",
                        "cyclomatic_complexity", "quality_grade", "is_final_submission",
                        "is_catchup", "submitted_at"],
                       [aid, uid_, exps[num]["id"], sid, k + 1,
                        RNG.choice(["python", "python", "python", "cpp"]),
                        j([{"name": "main.py",
                            "content": snips[min(k, len(snips) - 1)]}]),
                        None,
                        "success" if compile_ok else "error",
                        None if compile_ok else "IndentationError: expected an indented block",
                        "" if compile_ok else None,
                        None if compile_ok else "Traceback (most recent call last): ...",
                        passed, 4,
                        RNG.randint(20, 400) if compile_ok else None,
                        RNG.randint(9000, 40000) if compile_ok else None,
                        RNG.randint(28, 110), round(RNG.uniform(2, 11), 1),
                        {"top": "A", "good": "B", "mid": "C", "weak": "C",
                         "low": "D"}[tier],
                        k == n - 1, False, submitted])
                n_att += 1
                tcs = db.s.execute(text(
                    "SELECT id FROM test_cases WHERE experiment_id=:e "
                    "ORDER BY points_weight, id"
                ), {"e": exps[num]["id"]}).scalars().all()
                for j_, tcid in enumerate(tcs):
                    db.ins("test_case_results",
                           ["id", "attempt_id", "test_case_id", "passed",
                            "execution_time_ms", "output", "created_at"],
                           [uid(f"tcr:{aid}:{j_}"), aid, tcid,
                            bool(compile_ok and j_ < passed),
                            RNG.randint(15, 350) if (compile_ok and j_ < passed) else None,
                            None, submitted])
                    n_res += 1
            # code versions for a few students
            if tier in ("top", "good") and RNG.random() < 0.5:
                for v in range(1, 3):
                    db.ins("code_versions",
                           ["id", "student_id", "experiment_id", "version_number",
                            "files", "is_full_snapshot", "saved_at", "save_type"],
                           [uid(f"cv:{uid_}:{num}:{v}"), uid_, exps[num]["id"], v,
                            j([{"name": "main.py",
                                "content": snips[min(v, len(snips) - 1)]}]),
                            True,
                            dt(past[sess_list[0]]["day"], 11, 5 * v), "manual"])
    return n_att, n_res


def seed_vivas_and_grades(db: DB, inst, past, roster, exps, instructor):
    n_viva = 0
    strong = {roll: u for roll, (u, tier, _n) in roster.items()
              if tier in ("top", "good") and roll in [r for r, *_ in NEW_STUDENTS]}
    viva_scores = {}
    for roll, uid_ in sorted(strong.items()):
        if db.count("viva_sessions", f"student_id='{uid_}'") > 0:
            continue
        _, _, _, focus_base, _ = TIERS["top" if roll in ("SKIT2026011",) else "good"]
        score = max(55, min(97, int(focus_base + RNG.gauss(-2, 5))))
        started = datetime(VIVA_DAY.year, VIVA_DAY.month, VIVA_DAY.day, 11, 40)
        db.ins("viva_sessions",
               ["id", "student_id", "experiment_id", "questions", "total_score",
                "status", "started_at", "completed_at", "created_at"],
               [uid(f"viva:{uid_}"), uid_, exps[3]["id"],
                j(["Walk me through the worst-case complexity of your approach.",
                   "Why is insertion sort stable? Where does that matter?",
                   "How would you adapt your solution for a linked list?"]),
                float(score), "completed", started,
                started + timedelta(minutes=12), started])
        viva_scores[roll] = score
        n_viva += 1
    return n_viva, viva_scores


def _login_token(email, password):
    r = requests.post(f"{API}/auth/login",
                      json={"email": email, "password": password}, timeout=20)
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def publish_experiments(exps):
    """Publish the tenant's experiments (students only enroll in published
    ones — student dashboards/avg grades need this). Idempotent."""
    headers = _login_token(*INSTRUCTOR)
    n = 0
    listing = requests.get(f"{API}/instructor/experiments", headers=headers, timeout=20)
    if not listing.ok:
        return 0
    for e in listing.json().get("experiments", []):
        if not e.get("is_published"):
            r = requests.patch(f"{API}/instructor/experiments/{e['id']}",
                               headers=headers, json={"is_published": True}, timeout=20)
            if r.status_code in (200, 201):
                n += 1
    return n


def write_grades_for_new_students(db: DB, roster, exps, viva_scores):
    """Real instructor API, same contract as make_cohort.py."""
    headers = _login_token(*INSTRUCTOR)
    tier_marks = {
        "top":  [(97, 94, 95), (96, 93, 94), (98, 95, 96)],
        "good": [(88, 85, 87), (90, 87, 89), (91, 88, 90)],
        "mid":  [(70, 66, 68), (73, 69, 71), (75, 71, 73)],
        "weak": [(52, 48, 50), (55, 51, 53), (58, 54, 56)],
        "low":  [(38, 33, 35), (41, 36, 38), (43, 39, 41)],
    }
    saved = 0
    new_rolls = [r for r, *_ in NEW_STUDENTS]
    for roll, (uid_, tier, _n) in sorted(roster.items()):
        if roll not in new_rolls:
            continue
        marks = [tuple(m + (RNG.randint(-2, 2),)) for m in tier_marks[tier]]
        for exp, (tc, rep, cq, extra) in zip(sorted(exps.values(), key=lambda e: e["exp_number"]), marks):
            viva = viva_scores.get(roll, 0) if exp["exp_number"] == 3 else 0
            components = {"test_cases": max(0, min(100, tc + extra)),
                          "lab_report": max(0, min(100, rep + extra)),
                          "code_quality": max(0, min(100, cq + extra))}
            assessed = {"test_cases": True, "lab_report": True, "code_quality": True,
                        "viva": viva > 0, "quiz": False}
            if viva:
                components["viva"] = viva
            r = requests.post(f"{API}/instructor/grades", headers=headers, json={
                "student_id": uid_, "experiment_id": exp["id"],
                "components": components, "assessed": assessed}, timeout=20)
            # 409 = "grade exists (student already viewed it, locked)" → fine
            if r.status_code in (200, 201, 409):
                saved += 1
            else:
                print(f"  ! grade {roll} exp{exp['exp_number']}: {r.status_code} {r.text[:120]}")
    return saved


def seed_exam(db: DB, inst, ss, instructor, roster, exps):
    if db.has("SELECT 1 FROM exams WHERE institution_id=:i AND title=:t",
              {"i": inst, "t": "Mid-Term Lab Exam: Arrays & Sorting"}):
        return 0
    exam_id = uid("exam:midtterm-arrays-sorting")
    available = datetime(2026, 9, 22, 9, 0)
    due = datetime(2026, 10, 9, 23, 59)
    db.ins("exams",
           ["id", "institution_id", "subject_id", "created_by", "title", "description",
            "exam_type", "available_from", "due_at", "duration_minutes", "max_attempts",
            "pass_threshold", "shuffle_questions", "is_published", "grade_weight",
            "created_at"],
           [exam_id, inst, ss["subject_id"], instructor,
            "Mid-Term Lab Exam: Arrays & Sorting",
            "Covers binary search, array merging and insertion sort. "
            "5 MCQs (4 marks each) + 5 coding questions (16 marks each).",
            "midterm", available, due, 60, 2, 40, True, True, 15,
            dt(date(2026, 9, 18), 15, 0)])

    mcqs = [
        ("What is the time complexity of binary search on a sorted array of n elements?",
         ["O(n)", "O(log n)", "O(n log n)", "O(1)"], "O(log n)",
         "Each step halves the search space."),
        ("Binary search requires the input to be",
         ["random", "sorted", "unique", "positive"], "sorted",
         "The halving invariant depends on order."),
        ("Merging two sorted arrays of lengths m and n takes",
         ["O(m*n)", "O(m+n)", "O(log(m+n))", "O(m+n) only when equal"], "O(m+n)",
         "Two-pointer merge visits each element once."),
        ("Insertion sort's best-case complexity is",
         ["O(n^2)", "O(n log n)", "O(n)", "O(n^2) still"], "O(n)",
         "An already-sorted array needs only one pass."),
        ("Which of these is a stable sort?",
         ["Quick sort", "Heap sort", "Insertion sort", "Selection sort"],
         "Insertion sort", "Equal elements keep their relative order."),
    ]
    codes = [
        ("Write a function `binary_search(arr, target)` returning the index or -1.",
         "def binary_search(arr, target):\n    # your code\n    pass"),
        ("Write `merge(a, b)` merging two sorted lists into one sorted list.",
         "def merge(a, b):\n    # your code\n    pass"),
        ("Write `insertion_sort(arr)` sorting a list in place and returning it.",
         "def insertion_sort(arr):\n    # your code\n    pass"),
        ("Write `count_inversions(a)` — count pairs i<j with a[i] > a[j].",
         "def count_inversions(a):\n    # your code\n    pass"),
        ("Write `max_subarray_sum(a)` (Kadane's algorithm).",
         "def max_subarray_sum(a):\n    # your code\n    pass"),
    ]
    for i, (prompt, options, correct, expl) in enumerate(mcqs):
        db.ins("exam_questions",
               ["id", "exam_id", "question_type", "prompt", "points", "display_order",
                "explanation", "options", "correct_answer", "created_at"],
               [uid(f"eq:mcq:{i}"), exam_id, "mcq", prompt, 4.0, i + 1, expl,
                j(options), chr(65 + options.index(correct)),
                dt(date(2026, 9, 18), 15, 5)])
    for i, (prompt, starter) in enumerate(codes):
        db.ins("exam_questions",
               ["id", "exam_id", "question_type", "prompt", "points", "display_order",
                "explanation", "language", "starter_code", "test_cases", "created_at"],
               [uid(f"eq:code:{i}"), exam_id, "code", prompt, 16.0, 6 + i,
                None, "python", starter,
                j([{"input": "", "expected": "see rubric"}]),
                dt(date(2026, 9, 18), 15, 10)])

    n_att = 0
    for roll, (uid_, tier, _n) in sorted(roster.items()):
        if db.count("exam_attempts", f"exam_id='{exam_id}' AND student_id='{uid_}'") > 0:
            continue
        _, _, exam_acc, _, _ = TIERS[tier]
        n = 2 if tier in ("weak", "low") and RNG.random() < 0.6 else 1
        for attempt_no in range(1, n + 1):
            started = available + timedelta(
                days=RNG.randint(2, 16) + 3 * (attempt_no - 1),
                hours=RNG.randint(0, 10), minutes=RNG.randint(0, 59))
            correct_mcq = max(0, min(5, round(5 * exam_acc + RNG.uniform(-0.8, 0.8))))
            correct_code = max(0, min(5, round(5 * exam_acc + RNG.uniform(-0.8, 0.8))))
            if attempt_no == 2:
                correct_mcq = min(5, correct_mcq + 1)
                correct_code = min(5, correct_code + RNG.randint(0, 1))
            score = correct_mcq * 4 + correct_code * 16
            passed = (score / 100.0) * 100 >= 40
            answers = {}
            for i in range(5):
                options, correct = mcqs[i][1], mcqs[i][2]
                # answers are stored as option letters (A-D), like the app
                if i < correct_mcq:
                    answers[uid(f"eq:mcq:{i}")] = chr(65 + options.index(correct))
                else:
                    wrong = [chr(65 + options.index(o)) for o in options
                             if o != correct]
                    answers[uid(f"eq:mcq:{i}")] = RNG.choice(wrong)
            answers.update({
                uid(f"eq:code:{i}"): ("def f():\n    pass  # (seeded)"
                                      if i >= correct_code else
                                      CODE_SNIPPETS[i % 3 + 1]["ok"])
                for i in range(5)
            })
            submitted = started + timedelta(minutes=RNG.randint(30, 58))
            db.ins("exam_attempts",
                   ["id", "exam_id", "student_id", "started_at", "expires_at",
                    "submitted_at", "score", "total_points", "max_points", "passed",
                    "status", "answers", "created_at"],
                   [uid(f"ea:{uid_}:{attempt_no}"), exam_id, uid_, started,
                    started + timedelta(minutes=60), submitted, float(score),
                    100.0, 100.0, bool(passed), "submitted", j(answers), started])
            n_att += 1
    return n_att


def seed_announcements_notifications(db: DB, inst, ss, instructor, admin, roster):
    A = []  # (title, message, author_id, role, priority, category, sent_date_or_None, status)
    A.append(("Lab schedule for 2026-27 semester 5",
              "Weekly lab sessions every Wednesday 10:00–11:30 starting Aug 26. "
              "Experiment 1 (Binary Search) first — complete the theory page before the session.",
              admin, "institution_admin", "normal", "academic", date(2026, 8, 26), "sent"))
    A.append(("Experiment 1 session notes posted",
              "Notes and the trace worksheet from Wednesday's binary search session are in the course content.",
              instructor, "instructor", "normal", "session", date(2026, 8, 28), "sent"))
    A.append(("Mid-term exam window opens Sep 22",
              "The mid-term lab exam (Arrays & Sorting) is available Sep 22 – Oct 9. "
              "60 minutes, 2 attempts allowed. Score counts 15% in the gradebook.",
              admin, "institution_admin", "high", "exam", date(2026, 9, 18), "sent"))
    A.append(("Viva Week: Oct 7",
              "Viva rounds for the completed experiments are on Oct 7. Students who pass the coding gate will be called in section order.",
              instructor, "instructor", "high", "session", date(2026, 9, 25), "sent"))
    A.append(("Library server maintenance Oct 3",
              "The department server is down Oct 3, 06:00–08:00 for maintenance. Submissions may be delayed.",
              admin, "institution_admin", "normal", "notice", date(2026, 10, 1), "sent"))
    A.append(("Experiment 2 & 3 results published",
              "Gradebook entries for Merging Sorted Arrays and Insertion Sort are now visible. "
              "Please raise questions during doubt hours if you disagree with any component.",
              instructor, "instructor", "normal", "result", date(2026, 10, 12), "sent"))
    A.append(("Semester 5 internal assessment timetable",
              "Tentative dates for the remaining internal assessments are posted on the department notice board.",
              admin, "institution_admin", "normal", "academic", date(2026, 10, 16), "sent"))
    A.append(("Final lab session Oct 28",
              "Last lab of the term Oct 28, 10:00. Bring your lab record books — sign-off happens at the end of the session.",
              instructor, "instructor", "normal", "session", None, "scheduled"))

    made_ann = made_notif = 0
    for title, msg, author, role, prio, cat, sent_day, status in A:
        if db.has("SELECT 1 FROM announcements WHERE institution_id=:i AND title=:t",
                  {"i": inst, "t": title}):
            continue
        aid = uid(f"ann:{title}")
        sent_at = dt(sent_day, 8, 30) if sent_day else dt(date(2026, 10, 28), 8, 0)
        db.ins("announcements",
               ["id", "institution_id", "author_id", "author_role", "title", "message",
                "priority", "category", "target", "status", "send_at", "sent_at",
                "reach_count", "views_count", "likes_count", "created_at",
                "updated_at"],
               [aid, inst, author, role, title, msg, prio, cat, "all_students",
                status, sent_at, sent_at if status == "sent" else None,
                len(roster) if status == "sent" else 0,
                RNG.randint(10, len(roster)) if status == "sent" else 0,
                RNG.randint(0, 4) if status == "sent" else 0,
                dt(sent_day or date(2026, 10, 20), 8, 15),
                dt(sent_day or date(2026, 10, 20), 8, 15)])
        made_ann += 1
        if status != "sent":
            continue
        for roll, (uid_, tier, _n) in sorted(roster.items()):
            db.ins("notifications",
                   ["id", "user_id", "type", "title", "message", "is_read", "created_at"],
                   [uid(f"ntf:{aid}:{uid_}"), uid_, "announcement", title, msg,
                    RNG.random() < 0.6, sent_at])
            made_notif += 1
    # extra notifications: exam open, viva week, results
    extra = [
        ("exam", "Mid-term exam is open", "The Arrays & Sorting exam is now available until Oct 9."),
        ("session", "Viva Week reminder", "Viva rounds on Oct 7 — check your experiment gate status."),
        ("grade", "New grades published", "Grades for two experiments are now visible in your gradebook."),
    ]
    for ntype, ntitle, nmsg in extra:
        for roll, (uid_, tier, _n) in sorted(roster.items()):
            if db.has("SELECT 1 FROM notifications WHERE user_id=:u AND type=:t AND title=:x",
                      {"u": uid_, "t": ntype, "x": ntitle}):
                continue
            db.ins("notifications",
                   ["id", "user_id", "type", "title", "message", "is_read", "created_at"],
                   [uid(f"ntf:{ntype}:{ntitle}:{uid_}"), uid_, ntype, ntitle, nmsg,
                    RNG.random() < 0.5,
                    dt({"exam": date(2026, 9, 22), "session": date(2026, 10, 1),
                        "grade": date(2026, 10, 12)}[ntype], 9, 0)])
            made_notif += 1
    return made_ann, made_notif


def seed_ai_hints(db: DB, inst, ss, past, roster, instructor, admin, exps):
    n = 0
    for roll, (uid_, tier, _n) in sorted(roster.items()):
        # marker = this student's first deterministic hint id (stable across
        # re-runs, so the RNG stream can't drift the decision)
        if db.has("SELECT 1 FROM ai_usage_log WHERE id=:i",
                  {"i": uid(f"hint:{uid_}:0")}):
            continue
        if tier not in ("mid", "weak", "low") and RNG.random() > 0.3:
            continue
        k = RNG.randint(2, 5) if tier in ("weak", "low") else RNG.randint(1, 2)
        for i in range(k):
            day = date(2026, 9, 2) + timedelta(days=RNG.randint(0, 54))
            model, prov = AI_MODELS[RNG.random() < 0.85]
            prompt_tokens, comp_tokens = RNG.randint(250, 900), RNG.randint(60, 350)
            hid = uid(f"hint:{uid_}:{i}")
            level = min(3, i + 1) if i < 2 else 1
            # tie the hint to the experiment being worked on that week
            sess = _session_on_or_before(past, day)
            exp_id = past[sess]["exp"] if sess else 1
            db.ins("ai_usage_log",
                   ["id", "institution_id", "user_id", "role", "feature", "model",
                    "provider", "prompt_tokens", "completion_tokens", "total_tokens",
                    "estimated_cost_usd", "latency_ms", "success",
                    "section_subject_id", "created_at"],
                   [hid, inst, uid_, "student", "hint", model, prov, prompt_tokens,
                    comp_tokens, prompt_tokens + comp_tokens,
                    round(RNG.uniform(0.0005, 0.003), 4), RNG.randint(900, 4200),
                    True, ss["id"], dt(day, RNG.randint(9, 18), RNG.randint(0, 59))])
            if RNG.random() < 0.6:
                db.ins("hint_logs",
                       ["id", "student_id", "experiment_id", "hint_level",
                        "prompt_sent", "response_received", "model_used",
                        "latency_ms", "is_fallback", "created_at"],
                       [uid(f"hl:{uid_}:{i}"), uid_, exps[exp_id]["id"], level,
                        "I'm stuck on the loop condition — where do I start?",
                        "Instead of giving you the line, consider this: what invariant "
                        "must stay true between lo and hi at the top of every iteration?",
                        model, RNG.randint(900, 4000), False,
                        dt(day, RNG.randint(9, 18), RNG.randint(0, 59))])
            n += 1
    # instructor + admin AI usage
    for who, role, k in ((instructor, "instructor", 9), (admin, "institution_admin", 7)):
        if db.count("ai_usage_log", f"user_id='{who}'") > 0:
            continue
        for i in range(k):
            model, prov = AI_MODELS[RNG.random() < 0.7]
            db.ins("ai_usage_log",
                   ["id", "institution_id", "user_id", "role", "feature", "model",
                    "provider", "prompt_tokens", "completion_tokens", "total_tokens",
                    "estimated_cost_usd", "latency_ms", "success",
                    "section_subject_id", "created_at"],
                   [uid(f"aiu:{role}:{who}:{i}"), inst, who, role, "chat", model, prov,
                    RNG.randint(500, 3200), RNG.randint(200, 1400),
                    RNG.randint(700, 4600), round(RNG.uniform(0.001, 0.009), 4),
                    RNG.randint(1200, 8000), True, None,
                    dt(date(2026, 9, 10) + timedelta(days=RNG.randint(0, 45)),
                       RNG.randint(9, 19), RNG.randint(0, 59))])
            n += 1
    return n


def seed_proctor_interventions_plagiarism(db: DB, inst, past, roster, instructor, exps):
    past_sorted = sorted(past.items(), key=lambda kv: kv[1]["started_at"])
    ev_plan = [
        (2, "SKIT2026004", "tab_switch", "low"),
        (4, "SKIT2026005", "tab_switch", "low"),
        (5, "SKIT2026014", "fullscreen_exit", "medium"),
        (5, "SKIT2026016", "lockdown_violation", "high"),
    ]
    n_ev = 0
    for idx, roll, etype, sev in ev_plan:
        sid, meta = past_sorted[idx]
        uid_ = dict((r, u) for r, (u, _t, _n) in roster.items()).get(roll)
        if not uid_ or db.count("proctor_events",
                                f"session_id='{sid}' AND student_id='{uid_}'") > 0:
            continue
        rec = meta["started_at"] + timedelta(minutes=RNG.randint(20, 60))
        db.ins("proctor_events",
               ["id", "institution_id", "session_id", "student_id", "event_type",
                "payload", "severity", "recorded_at"],
               [uid(f"pe:{sid}:{uid_}"), inst, sid, uid_, etype,
                j({"detail": {"tab_switch": "Switched to 'chat-1'",
                              "fullscreen_exit": "Exited fullscreen",
                              "lockdown_violation": "Ctrl+C detected during lockdown"}[etype]}),
                sev, rec])
        n_ev += 1
    # interventions
    for roll, day, outcome in (("SKIT2026008", date(2026, 9, 20), "improved"),
                               ("SKIT2026016", date(2026, 10, 8), "pending")):
        uid_ = dict((r, u) for r, (u, _t, _n) in roster.items()).get(roll)
        if not uid_ or db.has("SELECT 1 FROM interventions WHERE student_id=:s AND action_type='outreach'",
                              {"s": uid_}):
            continue
        before = 0.62 if roll == "SKIT2026008" else 0.71
        db.ins("interventions",
               ["id", "institution_id", "student_id", "created_by", "action_type",
                "note", "follow_up_at", "outcome", "risk_score_before",
                "risk_score_after", "resolved_at", "created_at"],
               [uid(f"itv:{uid_}"), inst, uid_, instructor, "outreach",
                ("Noted two consecutive absences and a failing gate — messaged the student "
                 "and arranged a catch-up slot.") if outcome == "improved" else
                ("After the lockdown violation, discussed the lab rules and set a follow-up "
                 "after the next session."),
                dt(day + timedelta(days=7), 17, 0), outcome, before,
                round(before - 0.07, 2) if outcome == "improved" else None,
                dt(day + timedelta(days=9), 16, 0) if outcome == "improved" else None,
                dt(day, 17, 30)])
    # plagiarism flag
    a = dict((r, u) for r, (u, _t, _n) in roster.items()).get("SKIT2026008")
    b = dict((r, u) for r, (u, _t, _n) in roster.items()).get("SKIT2026016")
    if a and b and db.count("plagiarism_flags", f"student_a_id='{a}'") == 0:
        sid, meta = past_sorted[5]
        db.ins("plagiarism_flags",
               ["id", "institution_id", "experiment_id", "session_id", "student_a_id",
                "student_b_id", "similarity_pct", "detected_at", "status"],
               [uid("plag:008:016"), inst, exps[3]["id"], sid, a, b, 87.4,
                dt(meta["day"] + timedelta(days=1), 18, 10), "flagged"])
    # instructor ↔ student chat
    chats = [
        ("SKIT2026004", "Hi Rohan — you have two attempts left on the mid-term. "
                        "Let's use doubt hours Thursday to go over binary search edge cases."),
        ("SKIT2026005", "Siya, don't worry about the viva — we'll do a practice round "
                        "before Oct 7. Bring your merge code."),
        ("SKIT2026014", "Kunal, saw your latest attempt passed 3/4. Close! The hidden "
                        "case is a single-element list — think about the loop bound."),
        ("SKIT2026016", "Om — regarding the lockdown violation on Wednesday. We discussed "
                        "the rules; next session I'd like you to re-join with the form filled."),
    ]
    for roll, msg in chats:
        uid_ = dict((r, u) for r, (u, _t, _n) in roster.items()).get(roll)
        if not uid_ or db.has("SELECT 1 FROM chat_messages WHERE from_id=:f AND to_id=:t AND text=:x",
                              {"f": instructor, "t": uid_, "x": msg}):
            continue
        cday = date(2026, 9, 25) + timedelta(days=RNG.randint(0, 25))
        sid = _session_on_or_before(past, cday) or RNG.choice(list(past))
        db.ins("chat_messages",
               ["id", "session_id", "from_id", "to_id", "text", '"at"'],
               [uid(f"chat:{instructor}:{uid_}"), sid, instructor, uid_, msg,
                dt(cday, 16, RNG.randint(0, 50))])
    return n_ev


def seed_concept_mastery(db: DB, inst, roster, past):
    concepts = {"arrays": 5.0, "searching": 0.0, "sorting": 2.0, "complexity": -8.0}
    n = 0
    for roll, (uid_, tier, _n) in sorted(roster.items()):
        _, _, _, _, mastery = TIERS[tier]
        attended = db.s.execute(text(
            "SELECT count(DISTINCT la.experiment_id) FROM session_attendance sa "
            "JOIN lab_sessions la ON la.id = sa.session_id WHERE sa.student_id=:s "
            "AND sa.status IN ('present','late')"
        ), {"s": uid_}).scalar()
        for concept, off in concepts.items():
            if db.has("SELECT 1 FROM concept_mastery WHERE student_id=:s AND concept=:c",
                      {"s": uid_, "c": concept}):
                continue
            score = max(5.0, min(98.0, mastery + off + RNG.gauss(0, 2.0)))
            db.ins("concept_mastery",
                   ["student_id", "institution_id", "concept", "mastery_score",
                    "experiment_count", "last_updated"],
                   [uid_, inst, concept, round(score, 1),
                    max(1, min(3, attended)), dt(date(2026, 10, 20), 6, 0)])
            n += 1
    return n


# ──────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────
def main():
    app = create_app()
    with app.app_context():
        from app.extensions import db
        db.session.execute(text("SELECT 1"))
        d = DB(db.session)
        # Self-guard: this seeder extends the SKIT demo tenant. On a fresh
        # database (no institution yet) it exits cleanly instead of crashing.
        inst_check = d.s.execute(text("SELECT id FROM institutions LIMIT 1")).scalar()
        if not inst_check or not d.s.execute(
                text("SELECT 1 FROM section_subjects LIMIT 1")).first():
            print("No institution / section_subject found — run walkthrough.py first")
            print("(creates the SKIT demo tenant), then re-run this seeder.")
            return
        inst, ss, instructor, admin, exps = _institution_ctx(d)
        if not instructor:
            print("No instructor found — run walkthrough.py first, then re-run.")
            return
        roster = _roster(d, inst)
        print(f"Tenant: {inst} · section_subject {ss['id']} · experiments {list(exps)}")
        print(f"Students before: {len(roster)}")

        print("\n[A] Platform users ...")
        pu = seed_platform_users(d, app)
        print(f"    new platform users: {pu}")

        print("[B1] New students ...")
        made = seed_new_students(d, inst, ss)
        # Commit now: the instructor grade API (B6) runs in the LIVE server
        # process and cannot see users still uncommitted on this connection.
        db.session.commit()
        roster = _roster(d, inst)
        print(f"    new students: {made} · total roster: {len(roster)}")

        print("[B2] Test cases ...")
        print(f"    created: {seed_test_cases(d, exps)}")

        print("[B3] Lab sessions (8 past + 2 upcoming) ...")
        past = seed_sessions(d, inst, ss, exps)
        print(f"    completed sessions: {len(past)}")

        print("[B4] Attendance / focus / feedback ...")
        a, f, fb = seed_attendance_focus_feedback(d, inst, past, roster)
        print(f"    attendance rows: {a} · focus rows: {f} · feedback rows: {fb}")

        print("[B5] Code attempts ...")
        n_att, n_res = seed_attempts(d, inst, past, roster, exps, ss)
        print(f"    attempts: {n_att} · test-case results: {n_res}")

        print("[B6] Vivas + grades (instructor API) ...")
        n_pub = publish_experiments(exps)
        if n_pub:
            print(f"    experiments published: {n_pub}")
        n_viva, viva_scores = seed_vivas_and_grades(d, inst, past, roster, exps, instructor)
        try:
            n_grades = write_grades_for_new_students(d, roster, exps, viva_scores)
        except requests.exceptions.ConnectionError:
            print("    ! live API server unreachable — grades for the new students were")
            print("      not written. Start the backend, then re-run (idempotent).")
            n_grades = 0
        print(f"    viva sessions: {n_viva} · grade rows written via API: {n_grades}")

        print("[B7] Mid-term exam ...")
        n_ea = seed_exam(d, inst, ss, instructor, roster, exps)
        print(f"    exam attempts: {n_ea}")

        print("[B8] Announcements + notifications ...")
        na, nn = seed_announcements_notifications(d, inst, ss, instructor, admin, roster)
        print(f"    announcements: {na} · notifications: {nn}")

        print("[B9] AI usage + hints ...")
        n_ai = seed_ai_hints(d, inst, ss, past, roster, instructor, admin, exps)
        print(f"    AI usage rows: {n_ai}")

        print("[B10] Proctoring / interventions / plagiarism / chat ...")
        n_pe = seed_proctor_interventions_plagiarism(d, inst, past, roster, instructor, exps)
        print(f"    proctor events: {n_pe}")

        print("[B11] Concept mastery ...")
        n_cm = seed_concept_mastery(d, inst, roster, past)
        print(f"    mastery rows: {n_cm}")

        db.session.commit()
        print("\n✓ Committed. Running the platform's own snapshot jobs ...")
        # The job functions reach the app through scheduler.app; attach it
        # without starting the scheduler (the live server already runs it).
        from app import jobs
        jobs.init_app(app)
        jobs._run_nightly_metric_snapshots()
        jobs._platform_metric_snapshots()
        db.session.commit()

        print("\n═══ FINAL COUNTS ═══")
        for t in ("users", "lab_sessions", "session_attendance", "focus_scores",
                  "code_attempts", "test_case_results", "viva_sessions", "grades",
                  "exam_attempts", "announcements", "notifications", "ai_usage_log",
                  "hint_logs", "proctor_events", "interventions", "plagiarism_flags",
                  "concept_mastery", "session_feedback", "practice_submissions",
                  "practice_student_xp", "platform_progress", "student_metric_snapshots",
                  "institution_daily_kpis"):
            print(f"  {t:28s} {d.count(t):6d}")
        print("\nDone. Logins: TempStud@2026 (SKIT students) · Platform@2026 (platform users)")


if __name__ == "__main__":
    main()
