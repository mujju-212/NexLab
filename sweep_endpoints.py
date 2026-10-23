"""sweep_endpoints.py — hit every analytics endpoint for all three roles."""
import sys
import time

import requests

API = "http://localhost:5000/api"
FAILS = []


def login(email, pw):
    # the login route is rate-limited, so retry politely instead of failing
    for attempt in range(6):
        r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
        if r.status_code == 200:
            return {"Authorization": f"Bearer {r.json()['token']}"}
        if r.status_code != 429:
            r.raise_for_status()
        time.sleep(3 * (attempt + 1))
    raise SystemExit(f"rate-limited out while logging in as {email}")


STUDENT = [
    "student/analytics/overview?period=30d", "student/analytics/academic-dashboard?period=30d",
    "student/analytics/ranks", "student/analytics/standing", "student/analytics/attendance",
    "student/analytics/subjects", "student/analytics/trends", "student/analytics/integrity",
    "student/analytics/forecast", "student/analytics/unlocks", "student/rankings",
    "analytics/rankings/scope?scope_level=section", "analytics/rankings/scope?scope_level=subject",
    "student/dashboard",
]
INSTRUCTOR = [
    "instructor/analytics/overview?days=30", "instructor/analytics/cohort-matrix?days=30",
    "instructor/analytics/trends-overview?days=30", "instructor/analytics/experiments?days=30",
    "instructor/analytics/mastery-overview?days=30", "instructor/analytics/engagement?days=30",
    "instructor/analytics/engagement-overview?days=30",
    "instructor/analytics/integrity-overview?days=30",
    "instructor/analytics/ai-usage-overview?days=30",
    "instructor/analytics/trends?days=30",
    "instructor/analytics/experiments-overview?days=30",
    "instructor/analytics/roster?days=30",
    "instructor/analytics/integrity?days=30", "instructor/analytics/rankings-overview?days=30",
    "instructor/analytics/ai-usage?days=30", "instructor/dashboard",
]
INSTITUTION = [f"institution/analytics/{t}?days=30" for t in [
    "overview", "outcomes", "funnel", "benchmark", "attendance", "grades", "integrity",
    "engagement", "ai-usage", "instructors"]] + [
    "institution/analytics/risk/overview?days=30", "institution/analytics/risk/trends?days=30",
]
PLATFORM = ["platform/analytics/overview?days=30", "platform/analytics/groq-trend?days=30",
            "platform/analytics/sessions-trend?days=30", "platform/analytics/peak-usage?days=30",
            "platform/analytics/cross-institution?days=30", "platform/analytics/ai-usage/cross-institution?days=30",
            "platform/analytics/overview?days=7",
            "admin/dashboard"]


def sweep(name, headers, paths):
    print(f"\n== {name}")
    for p in paths:
        r = requests.get(f"{API}/{p}", headers=headers)
        flag = 'ok ' if r.status_code == 200 else 'FAIL'
        print(f"  {flag} {r.status_code}  {p}")
        if r.status_code != 200:
            FAILS.append(f"{name}: {r.status_code} {p}")


sweep("student", login("rahul.sharma@skit.edu.in", "Student@2026"), STUDENT)
sweep("instructor", login("anitha.rao@skit.edu.in", "Instructor@2026"), INSTRUCTOR)
sweep("institution", login("admin@skit.edu.in", "SkitAdmin@2026"), INSTITUTION)
sweep("platform", login("superadmin@nexlab.io", "SuperAdmin@2026"), PLATFORM)

print("\nFAILURES:", *FAILS, sep="\n  " if FAILS else " none")
sys.exit(1 if FAILS else 0)
