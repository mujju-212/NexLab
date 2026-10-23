"""make_activity.py — create genuine lab activity through the real HTTP API.

Nothing is written straight into the database: the instructor creates the
experiments, schedules the sessions, marks attendance overrides and saves
rubric grades. The analytics pages then have to compute from those rows.
Safe to re-run (it will simply add another round of sessions/grades).
"""
from datetime import datetime, timedelta, timezone

import requests

API = "http://localhost:5000/api"
INSTRUCTOR = ("anitha.rao@skit.edu.in", "Instructor@2026")
STUDENT = ("rahul.sharma@skit.edu.in", "Student@2026")


def login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['token']}"}


def main():
    ins = login(*INSTRUCTOR)
    stu = login(*STUDENT)

    ss = requests.get(f"{API}/instructor/section-subjects", headers=ins).json()["section_subjects"][0]
    sid, subj = ss["section_subject_id"], ss["subject_id"]

    specs = [
        ("Implement Binary Search on a Sorted Array", ["arrays", "searching"], 1),
        ("Merging Two Sorted Arrays", ["arrays", "sorting"], 2),
        ("Insertion Sort Lab", ["sorting", "complexity"], 2),
    ]
    for i, (title, tags, level) in enumerate(specs, 1):
        requests.post(f"{API}/instructor/experiments", headers=ins, json={
            "subject_id": subj, "section_subject_id": sid, "exp_number": i, "title": title,
            "description": title, "concept_tags": tags, "difficulty_level": level,
            "rubric_test_cases": 60, "rubric_lab_report": 20, "rubric_code_quality": 10,
            "rubric_viva": 10, "rubric_quiz": 0, "estimated_minutes": 60,
        }).raise_for_status()

    exps = [e["id"] for e in requests.get(f"{API}/instructor/experiments", headers=ins).json()["experiments"]]
    me = requests.get(f"{API}/auth/me", headers=stu).json()
    student_id = (me.get("user") or me)["id"]

    session_ids = []
    for i, exp in enumerate(exps):
        when = (datetime.now(timezone.utc) - timedelta(days=6 - (i % 3) * 2)).replace(microsecond=0).isoformat()
        r = requests.post(f"{API}/instructor/sessions", headers=ins, json={
            "section_subject_id": sid, "experiment_id": exp, "scheduled_at": when,
            "duration_minutes": 90, "title": f"Lab session {i + 1}"})
        if r.status_code in (200, 201):
            session_ids.append((r.json().get("session") or r.json())["id"])

    for session_id, status in zip(session_ids, ["present", "late", "absent"]):
        requests.post(f"{API}/instructor/sessions/{session_id}/attendance/{student_id}/override",
                      headers=ins, json={"status": status, "reason": "recorded during lab"})

    graded = [
        {"test_cases": 88, "lab_report": 80, "code_quality": 85},
        {"test_cases": 72, "lab_report": 70, "code_quality": 75, "viva": 60},
        {"test_cases": 91, "lab_report": 88, "code_quality": 90, "viva": 85},
    ]
    for exp, components in zip(exps, graded):
        assessed = {k: True for k in components}
        assessed["viva"] = "viva" in components
        requests.post(f"{API}/instructor/grades", headers=ins, json={
            "student_id": student_id, "experiment_id": exp,
            "components": components, "assessed": assessed})

    print(f"created {len(exps)} experiments, {len(session_ids)} sessions, "
          f"{len(graded)} grades for {student_id}")


if __name__ == "__main__":
    main()
