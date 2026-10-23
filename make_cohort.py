"""make_cohort.py — widen the demo cohort through the real HTTP API only.

Rahul Sharma (SKIT2026001) was created by walkthrough.py. This script adds eight
more enrolled students to the same section and marks their three laboratory
experiments through POST /api/instructor/grades, so the Gradebook, the grade
distribution and the at-risk states are exercised with genuine rows instead of
painted-on placeholders.

Safe to re-run: existing users are reused, grades are upserted by the API.
"""
import requests

API = "http://localhost:5000/api"
ADMIN = ("admin@skit.edu.in", "SkitAdmin@2026")
INSTRUCTOR = ("anitha.rao@skit.edu.in", "Instructor@2026")

STUDENTS = [
    ("Aarav Sharma", "aarav.sharma@skit.edu.in", "SKIT2026002"),
    ("Nikita Kapoor", "nikita.kapoor@skit.edu.in", "SKIT2026003"),
    ("Rohan Das", "rohan.das@skit.edu.in", "SKIT2026004"),
    ("Siya Menon", "siya.menon@skit.edu.in", "SKIT2026005"),
    ("Vivaan Patel", "vivaan.patel@skit.edu.in", "SKIT2026006"),
    ("Meera Iyer", "meera.iyer@skit.edu.in", "SKIT2026007"),
    ("Kabir Nair", "kabir.nair@skit.edu.in", "SKIT2026008"),
    ("Ananya Reddy", "ananya.reddy@skit.edu.in", "SKIT2026009"),
]

# Per-student rubric marks per experiment (test_cases, lab_report, code_quality, viva).
# Deliberately spread so the distribution chart has real shape.
MARKS = {
    "SKIT2026002": [(96, 92, 94, 90), (94, 90, 92, 88), (97, 93, 95, 92)],
    "SKIT2026003": [(78, 74, 76, 70), (82, 78, 80, 74), (80, 76, 78, 72)],
    "SKIT2026004": [(61, 55, 58, 0), (58, 50, 54, 0), (64, 58, 60, 0)],
    "SKIT2026005": [(44, 40, 42, 0), (48, 44, 46, 0), (52, 46, 48, 0)],
    "SKIT2026006": [(88, 84, 86, 82), (90, 86, 88, 84), (92, 88, 90, 86)],
    "SKIT2026007": [(72, 68, 70, 66), (68, 62, 66, 60), (74, 70, 72, 68)],
    "SKIT2026008": [(35, 30, 32, 0), (38, 34, 36, 0), (41, 36, 38, 0)],
    "SKIT2026009": [(84, 80, 82, 78), (86, 82, 84, 80), (88, 84, 86, 82)],
}


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def main():
    admin = login(*ADMIN)
    ins = login(*INSTRUCTOR)

    ss = requests.get(f"{API}/instructor/section-subjects", headers=ins).json()["section_subjects"][0]
    section_id = ss["section_id"]
    subject_id = ss["subject_id"]
    department_id = ss.get("department_id")

    existing = {}
    resp = requests.get(f"{API}/institution/users?role=student", headers=admin)
    if resp.ok:
        for u in resp.json().get("users", []):
            existing[u.get("roll_number")] = u.get("id")

    created = {}
    for full_name, email, roll in STUDENTS:
        if roll in existing and existing[roll]:
            created[roll] = existing[roll]
            continue
        r = requests.post(f"{API}/institution/users", headers=admin, json={
            "full_name": full_name,
            "email": email,
            "role": "student",
            "password": "TempStud@2026",
            "roll_number": roll,
            "department_id": department_id,
            "year_of_study": 3,
            "semester": 5,
            "section_id": section_id,
        })
        if r.status_code in (200, 201):
            created[roll] = r.json()["user"]["id"]
        else:
            print(f"  ! {roll}: {r.status_code} {r.text[:120]}")

    exps = requests.get(f"{API}/instructor/experiments", headers=ins).json()["experiments"]
    exps = sorted([e for e in exps if e.get("subject_id") == subject_id], key=lambda e: e["exp_number"])[:3]

    saved = 0
    for roll, marks in MARKS.items():
        sid = created.get(roll)
        if not sid:
            continue
        for exp, (tc, rep, cq, viva) in zip(exps, marks):
            components = {"test_cases": tc, "lab_report": rep, "code_quality": cq}
            assessed = {"test_cases": True, "lab_report": True, "code_quality": True, "viva": viva > 0, "quiz": False}
            if viva:
                components["viva"] = viva
            r = requests.post(f"{API}/instructor/grades", headers=ins, json={
                "student_id": sid,
                "experiment_id": exp["id"],
                "components": components,
                "assessed": assessed,
            })
            if r.status_code in (200, 201):
                saved += 1
            else:
                print(f"  ! grade {roll} exp{exp['exp_number']}: {r.status_code} {r.text[:120]}")

    print(f"students available: {len(created)} · grades written: {saved}")


if __name__ == "__main__":
    main()
