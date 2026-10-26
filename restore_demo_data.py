"""
restore_demo_data.py — rebuild the instructor workbench content lost when the
sandbox's Postgres (outside /home/user) was wiped.

Creates, through the real HTTP API (same path the browser uses):
  * 4 lab experiments with explicit rubric weights + weightages to the subject
  * 1 timed MCQ exam, published, attendable from the subject page
  * component-by-component grades for the enrolled student

Nothing is inserted with SQL; everything goes through the app.
"""
import json
import sys

import requests

API = "http://localhost:5000/api"
INST = "anitha.rao@skit.edu.in"
INST_PW = "Instructor@2026"
STU = "rahul.sharma@skit.edu.in"
STU_PW = "Student@2026"

# IDs are discovered at runtime: hardcoding them broke the moment the sandbox
# reset the database (every UUID changes).
SUBJECT = None
SECTION_SUBJECT = None
STUDENT = None

SUBJECT_CODE = "CS301"
STUDENT_EMAIL = "rahul.sharma@skit.edu.in"

OK, BAD = [], []


def call(method, path, token=None, **kw):
    r = requests.request(
        method, API + path,
        headers={"Authorization": f"Bearer {token}"} if token else {},
        timeout=90, **kw,
    )
    if not r.ok:
        raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text[:300]}")
    return r.json()


def login(email, pw):
    return call("POST", "/auth/login", json={"email": email, "password": pw})["token"]


def step(msg):
    print(f"\n\033[1m{msg}\033[0m")


def ok(msg, extra=""):
    OK.append(msg)
    print(f"   \033[92mPASS\033[0m  {msg:<56} {extra}")


it = login(INST, INST_PW)
st = login(STU, STU_PW)

# ── resolve the subject / section-subject / student created by walkthrough.py ──
def discover():
    global SUBJECT, SECTION_SUBJECT, STUDENT
    # There is no GET /instructor/subjects; the assignment list carries the
    # subject id/code and is the same list the UI's subject picker uses.
    ss = call("GET", "/instructor/section-subjects", token=it)
    rows = ss.get("section_subjects") or []
    for x in rows:
        if (x.get("subject_code") or "").upper() == SUBJECT_CODE:
            SUBJECT = x["subject_id"]
            SECTION_SUBJECT = x.get("section_subject_id") or x.get("id") or None
            break
    if not SUBJECT:
        raise SystemExit(f"subject {SUBJECT_CODE} not found — run walkthrough.py first")

    me = call("GET", "/auth/me", token=st)
    STUDENT = me["user"]["id"]
    if (me["user"].get("email") or "").lower() != STUDENT_EMAIL:
        raise SystemExit(f"logged-in student is not {STUDENT_EMAIL}")


discover()
print(f"   subject={SUBJECT}  section_subject={SECTION_SUBJECT}  student={STUDENT}")

# ── Experiments: number, title, weightage, rubric(tc, report, quality, viva, quiz)
EXPS = [
    (1, "Implement Binary Search on a Sorted Array", 1, (60, 20, 10, 10, 0)),
    (2, "Linear Search and Binary Search Comparison", 1, (50, 20, 10, 10, 10)),
    (3, "Merging Two Sorted Arrays", 1, (50, 20, 10, 10, 10)),
    (4, "Insertion Sort Lab", 2, (60, 20, 10, 10, 0)),
]

step("1) Experiments with explicit rubric weights")
exp_ids = {}
existing = {e["exp_number"]: e for e in call("GET", "/instructor/experiments", token=it).get("experiments", [])}
for num, title, weight, (tc, rep, cq, viva, quiz) in EXPS:
    if num in existing:
        e = existing[num]
        exp_ids[num] = e["id"]
        ok(f"#{num} already present", e["id"][:8])
        continue
    body = {
        "title": title, "subject_id": SUBJECT, "exp_number": num, "weightage": weight,
        "concept_tags": ["searching"] if num <= 2 else ["sorting"],
        "difficulty": "medium", "language": "python",
        "rubric_test_cases": tc, "rubric_lab_report": rep, "rubric_code_quality": cq,
        "rubric_viva": viva, "rubric_quiz": quiz,
        "description": f"{title} — lab experiment for CS301.",
        "objective": "Implement and analyse the algorithm; write a short lab report.",
    }
    d = call("POST", "/instructor/experiments", token=it, json=body)
    e = d.get("experiment", d)
    exp_ids[num] = e["id"]
    ok(f"#{num} created (w={weight}, rubric {tc}/{rep}/{cq}/{viva}/{quiz})", e["id"][:8])

step("2) Publish all four so students can see them")
for num, eid in exp_ids.items():
    try:
        call("PATCH", f"/instructor/experiments/{eid}", token=it, json={"is_published": True})
        ok(f"#{num} published")
    except RuntimeError as exc:
        print("   ", exc)

step("3) Timed MCQ exam, published and attendable from the subject")
exams = call("GET", "/instructor/exams", token=it).get("exams", [])
exam_id = None
for e in exams:
    if e.get("title") == "CS301 Quiz 1: Searching":
        exam_id = e["id"]
        break
if exam_id:
    ok("exam already present", exam_id[:8])
else:
    d = call("POST", "/instructor/exams", token=it, json={
        "title": "CS301 Quiz 1: Searching",
        "subject_id": SUBJECT,
        "description": "Short searched-algorithm quiz: linear vs binary search.",
        "duration_minutes": 20,
        "pass_threshold": 40,
        "grade_weight": 0.25,   # 25% of the subject = 25 marks
        "max_attempts": 5,
        "proctor_focus_enabled": True,
        "proctor_lockdown_enabled": True,
        "max_violations": 5,
    })
    exam_id = d.get("exam", d)["id"]
    # questions are added one by one (create only takes settings)
    for q in [
            {"prompt": "Binary search requires the array to be:",
             "question_type": "mcq", "points": 1,
             "options": [{"text": "Sorted", "is_correct": True},
                         {"text": "Unsorted", "is_correct": False},
                         {"text": "All equal", "is_correct": False}],
             "correct_answer": "Sorted"},
            {"prompt": "Worst-case complexity of linear search on n elements:",
             "question_type": "mcq", "points": 2,
             "options": [{"text": "O(1)", "is_correct": False},
                         {"text": "O(log n)", "is_correct": False},
                         {"text": "O(n)", "is_correct": True}],
             "correct_answer": "O(n)"},
            {"prompt": "Binary search halves the search space each step.",
             "question_type": "mcq", "points": 2,
             "options": [{"text": "True", "is_correct": True},
                         {"text": "False", "is_correct": False}],
             "correct_answer": "True"},
        ]:
        call("POST", f"/instructor/exams/{exam_id}/questions", token=it, json=q)
    ok("exam created with 3 questions", exam_id[:8])

call("PATCH", f"/instructor/exams/{exam_id}", token=it, json={"is_published": True})
ok("exam published")

step("4) Grade component by component (the Round 3 contract)")
# experiment -> {component: score}
MARKS = {
    1: {"test_cases": 80, "lab_report": 88, "code_quality": 75, "viva": 70},
    2: {"test_cases": 90, "lab_report": 80, "code_quality": 70, "viva": 60, "quiz": 100},
    4: {"test_cases": 65, "lab_report": 72, "code_quality": 80, "viva": 55},
}
for num, comps in MARKS.items():
    d = call("POST", "/instructor/grades", token=it, json={
        "student_id": STUDENT, "experiment_id": exp_ids[num],
        "components": comps, "manual_feedback": "Solid work; tighten edge-case handling.",
        "force": True,
    })
    g = d.get("grade", d)
    print(f"   \033[92mPASS\033[0m  #{num} graded -> final {g['final_grade']}  "
          f"({', '.join(f'{k}={v}' for k, v in comps.items())})")

step("5) What the student sees")
mine = call("GET", "/student/grades", token=st).get("grades", [])
print(f"   student grade rows: {len(mine)}")
subj = call("GET", f"/student/experiments/{SUBJECT}", token=st)
items = subj.get("experiments") or subj.get("items") or []
print(f"   subject assessments visible to student: {len(items)}")
for x in items:
    print(f"     - {x.get('title')}  kind={x.get('kind', 'lab')}  "
          f"state={x.get('window_state', x.get('status', ''))}")

print("\n" + "=" * 70)
print(f"  STEPS PASSED: {len(OK)}   experiment ids: {exp_ids}")
print(f"  exam id: {exam_id}")
print("=" * 70)
json.dump({"experiments": exp_ids, "exam": exam_id}, open("/tmp/restored_ids.json", "w"), indent=2)
