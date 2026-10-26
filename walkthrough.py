"""
walkthrough.py — manual end-to-end setup, exactly as a human would do it in the UI.

Goes through the REAL HTTP API, via the Next.js proxy on :3000 (same path the
browser uses), so it also proves the frontend<->backend wiring.

Order:
  1. platform admin logs in
  2. platform admin onboards an institution (+ its first admin)
  3. institution admin logs in, forced to replace the temp password
  4. academic year -> department -> batch -> section -> subject
  5. create instructor, create student
  6. assign subject+instructor to the section, enroll the student
  7. instructor + student log in and replace their temp passwords
  8. read back every dashboard/structure endpoint

Nothing is pre-seeded; every row is created here.
"""
import json
import sys

import requests

BASE = "http://localhost:3000"          # Next.js proxy (browser path)
API = f"{BASE}/api"

PASSED, FAILED = [], []


def step(n, title):
    print(f"\n\033[1m[{n}] {title}\033[0m")


def check(label, resp, expect=200, show=None):
    ok = resp.status_code == expect
    tag = "\033[92mPASS\033[0m" if ok else "\033[91mFAIL\033[0m"
    print(f"   {tag}  {label:<48} {resp.status_code}")
    if not ok:
        body = resp.text[:400]
        print(f"         expected {expect}, got {resp.status_code}: {body}")
        FAILED.append(f"{label} ({resp.status_code})")
        return None
    PASSED.append(label)
    try:
        data = resp.json()
    except Exception:
        return None
    if show:
        for path in show:
            cur = data
            for part in path.split('.'):
                cur = cur.get(part) if isinstance(cur, dict) else None
                if cur is None:
                    break
            print(f"         · {path} = {cur}")
    return data


def login(email, password):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": password})


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ─────────────────────────────────────────────────────────────────────────────
step(1, "Platform super-admin login")
r = login("superadmin@nexlab.io", "SuperAdmin@2026")
d = check("POST /api/auth/login (platform_admin)", r, show=["user.role", "user.full_name"])
if not d:
    sys.exit(1)
SA = d["token"]

r = requests.get(f"{API}/admin/dashboard", headers=H(SA))
check("GET /api/admin/dashboard", r)

# ─────────────────────────────────────────────────────────────────────────────
step(2, "Onboard institution -> Sri Krishna Institute of Technology")
r = requests.post(f"{API}/admin/institutions", headers=H(SA), json={
    "name": "Sri Krishna Institute of Technology",
    "code": "SKIT",
    "contact_email": "admin@skit.edu.in",
    "email_domain": "skit.edu.in",
    "address": "Kundalahalli, Bengaluru 560037",
    "plan": "pro",
    "admin_name": "Dr. Ramesh Kumar",
    "admin_password": "Welcome@2026",
})
d = check("POST /api/admin/institutions", r, expect=201,
          show=["institution.id", "institution.code", "admin_user.email", "temp_password"])
if not d:
    sys.exit(1)
INST = d["institution"]["id"]
# The API generates its own random temp password (it does not accept a
# client-supplied admin_password), so capture the real one from the response.
TEMP_ADM = d.get("temp_password") or d.get("admin_user", {}).get("temp_password")

r = requests.get(f"{API}/admin/institutions", headers=H(SA))
check("GET /api/admin/institutions", r)

r = requests.get(f"{API}/platform/institutions/{INST}/onboarding", headers=H(SA))
check("GET /api/platform/.../onboarding (fresh checklist)", r,
      show=["checklist.admin_account_exists", "checklist.has_users", "complete"])

# ─────────────────────────────────────────────────────────────────────────────
step(3, "Institution admin first login (forced password change)")
r = login("admin@skit.edu.in", TEMP_ADM)
d = check("POST /api/auth/login (institution_admin)", r,
          show=["user.must_change_password", "user.role"])
if not d:
    sys.exit(1)
IA_TEMP = d["token"]

r = requests.post(f"{API}/auth/change-password", headers=H(IA_TEMP), json={
    "current_password": TEMP_ADM,
    "new_password": "SkitAdmin@2026",
})
d = check("POST /api/auth/change-password", r, show=["message"])
IA = d["token"]

r = login("admin@skit.edu.in", "SkitAdmin@2026")
d = check("POST /api/auth/login (new password)", r, show=["user.must_change_password"])
IA = d["token"]

# ─────────────────────────────────────────────────────────────────────────────
step(4, "Build the academic structure")
r = requests.post(f"{API}/institution/academic-years", headers=H(IA), json={
    "year_label": "2026-2027",
    "is_active": True,
})
d = check("POST /academic-years", r, expect=201, show=["year.id", "year.year_label"])
YEAR = d["year"]["id"]

r = requests.post(f"{API}/institution/departments", headers=H(IA), json={
    "name": "Computer Science and Engineering",
    "code": "CSE",
    "description": "CSE department",
    "color": "#7c3aed",
})
d = check("POST /departments", r, expect=201, show=["department.id", "department.code"])
DEPT = d["department"]["id"]

r = requests.post(f"{API}/institution/batches", headers=H(IA), json={
    "year_id": YEAR,
    "name": "CSE 2026 Batch",
    "program": "B.Tech",
    "department_id": DEPT,
    "total_sections": 2,
    "max_students": 60,
})
d = check("POST /batches (with 2 sections auto-created)", r, expect=201,
          show=["batch.id", "batch.sections_count"])
BATCH = d["batch"]["id"]

r = requests.get(f"{API}/institution/sections?batch_id={BATCH}", headers=H(IA))
d = check("GET /sections?batch_id", r, show=["sections"])
SECTIONS = [s["id"] for s in d["sections"]]
SEC_A = SECTIONS[0]
print(f"         · section A id = {SEC_A}")
print(f"         · section B id = {SECTIONS[1]}")

r = requests.post(f"{API}/institution/subjects", headers=H(IA), json={
    "name": "Data Structures and Algorithms",
    "code": "CS301",
    "description": "DSA with virtual lab experiments",
    "department_id": DEPT,
    "subject_type": "Theory",
    "total_marks": 100,
})
d = check("POST /subjects", r, expect=201, show=["subject.id", "subject.code"])
SUBJ = d["subject"]["id"]

# ─────────────────────────────────────────────────────────────────────────────
step(5, "Create the instructor and the student")
r = requests.post(f"{API}/institution/users", headers=H(IA), json={
    "full_name": "Prof. Anitha Rao",
    "email": "anitha.rao@skit.edu.in",
    "role": "instructor",
    "password": "TempInst@2026",
    "staff_id": "SKIT-INS-001",
    "department_id": DEPT,
    "phone": "9845012345",
})
d = check("POST /users (instructor)", r, expect=201,
          show=["user.id", "user.role", "user.staff_id", "temp_password"])
INSTR = d["user"]["id"]

r = requests.post(f"{API}/institution/users", headers=H(IA), json={
    "full_name": "Rahul Sharma",
    "email": "rahul.sharma@skit.edu.in",
    "role": "student",
    "password": "TempStud@2026",
    "roll_number": "SKIT2026001",
    "department_id": DEPT,
    "year_of_study": 3,
    "semester": 5,
    "section_id": SEC_A,
})
d = check("POST /users (student, enrolled into section A)", r, expect=201,
          show=["user.id", "user.role", "user.roll_number", "user.section_id"])
STUD = d["user"]["id"]

r = requests.get(f"{API}/institution/users?role=student", headers=H(IA))
check("GET /institution/users?role=student", r)

# ─────────────────────────────────────────────────────────────────────────────
step(6, "Assign subject + instructor to the section, verify enrollment")
r = requests.post(f"{API}/institution/section-subjects", headers=H(IA), json={
    "section_id": SEC_A,
    "subject_id": SUBJ,
    "instructor_id": INSTR,
})
check("POST /section-subjects (subject + lead instructor)", r, expect=201)

r = requests.get(f"{API}/institution/sections/{SEC_A}/students", headers=H(IA))
check("GET /sections/{id}/students", r)

r = requests.get(f"{API}/institution/academic/structure", headers=H(IA))
check("GET /academic/structure", r)

# ─────────────────────────────────────────────────────────────────────────────
step(7, "Instructor logs in and replaces temp password")
r = login("anitha.rao@skit.edu.in", "TempInst@2026")
d = check("POST /api/auth/login (instructor)", r, show=["user.must_change_password", "user.role"])
IT = d["token"]

r = requests.post(f"{API}/auth/change-password", headers=H(IT), json={
    "current_password": "TempInst@2026",
    "new_password": "Instructor@2026",
})
check("POST /api/auth/change-password (instructor)", r)

r = login("anitha.rao@skit.edu.in", "Instructor@2026")
d = check("POST /api/auth/login (instructor, new pw)", r)
IT = d["token"]

step(8, "Student logs in and replaces temp password")
r = login("rahul.sharma@skit.edu.in", "TempStud@2026")
d = check("POST /api/auth/login (student)", r, show=["user.must_change_password", "user.role"])
ST = d["token"]

r = requests.post(f"{API}/auth/change-password", headers=H(ST), json={
    "current_password": "TempStud@2026",
    "new_password": "Student@2026",
})
check("POST /api/auth/change-password (student)", r)

r = login("rahul.sharma@skit.edu.in", "Student@2026")
d = check("POST /api/auth/login (student, new pw)", r)
ST = d["token"]

# ─────────────────────────────────────────────────────────────────────────────
step(9, "Read back every role's dashboards / data")
for label, tok, path in [
    ("institution dashboard",  IA, "/institution/dashboard"),
    ("institution analytics",  IA, "/institution/analytics/overview"),
    ("instructor dashboard",   IT, "/instructor/dashboard"),
    ("instructor experiments", IT, "/instructor/experiments"),
    ("student dashboard",      ST, "/student/dashboard"),
    ("student grades",         ST, "/student/grades"),
    ("notifications",          ST, "/notifications"),
    ("auth/me (student)",      ST, "/auth/me"),
]:
    r = requests.get(f"{API}{path}", headers=H(tok))
    check(f"GET {path}  [{label}]", r)

step(10, "Onboarding checklist after real setup")
r = requests.get(f"{API}/platform/institutions/{INST}/onboarding", headers=H(SA))
check("GET /platform/.../onboarding (after setup)", r,
      show=["checklist.admin_account_exists", "checklist.has_users", "complete"])

# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print(f"  PASSED: {len(PASSED)}    FAILED: {len(FAILED)}")
if FAILED:
    print("  Failed checks:")
    for f in FAILED:
        print(f"    ✗ {f}")
print("=" * 70)

print("""
CREDENTIALS (write these down)
──────────────────────────────────────────────────────────────
PLATFORM SUPER ADMIN   superadmin@nexlab.io        SuperAdmin@2026
INSTITUTION ADMIN      admin@skit.edu.in           SkitAdmin@2026
INSTRUCTOR             anitha.rao@skit.edu.in      Instructor@2026
STUDENT                rahul.sharma@skit.edu.in    Student@2026
──────────────────────────────────────────────────────────────
""")
sys.exit(1 if FAILED else 0)
