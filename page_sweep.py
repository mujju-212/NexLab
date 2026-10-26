"""page_sweep.py — render every major page for each role through the Next.js server."""
import json
import sys
import time

import requests

BASE = "http://localhost:3000"

CREDS = {
    "platform":   ("superadmin@nexlab.io", "SuperAdmin@2026"),
    "institution": ("admin@skit.edu.in", "SkitAdmin@2026"),
    "instructor": ("anitha.rao@skit.edu.in", "Instructor@2026"),
    "student":    ("rahul.sharma@skit.edu.in", "Student@2026"),
}

ROUTES = {
    "platform": [
        "/admin/dashboard", "/admin/institutions", "/admin/academic/departments",
        "/admin/academic/academic-years", "/admin/users", "/admin/users/students",
        "/admin/users/instructors", "/admin/analytics", "/admin/assignments",
        "/admin/reports", "/admin/settings", "/admin/security",
        "/admin/monitoring/server-health",
    ],
    "institution": [
        "/institution/dashboard", "/institution/academic", "/institution/users",
        "/institution/analytics", "/institution/announcements", "/institution/audit-log",
        "/institution/billing", "/institution/sessions", "/institution/ai-usage",
        "/institution/settings", "/institution/profile", "/institution/security",
    ],
    "instructor": [
        "/instructor/dashboard", "/instructor/experiments", "/instructor/experiments/new",
        "/instructor/students", "/instructor/analytics", "/instructor/content",
        "/instructor/exams", "/instructor/sessions", "/instructor/grading",
        "/instructor/reports", "/instructor/management", "/instructor/live-lab",
        "/instructor/settings",
    ],
    "student": [
        "/student/dashboard", "/student/subjects", "/student/courses",
        "/student/analytics", "/student/exams", "/student/practice",
        "/student/rankings", "/student/submissions", "/student/pre-lab",
        "/student/compiler", "/student/live-lab", "/student/announcements",
        "/student/profile",
    ],
}


def tokens():
    out = {}
    for role, (email, pw) in CREDS.items():
        for attempt in range(6):
            r = requests.post(f"{BASE}/api/auth/login",
                              json={"email": email, "password": pw})
            if r.status_code == 200:
                out[role] = r.json()["token"]
                break
            if r.status_code == 429:
                print(f"  (rate-limited on {role}, waiting 12s)")
                time.sleep(12)
                continue
            print(f"  LOGIN FAILED {role}: {r.status_code} {r.text[:200]}")
            break
        time.sleep(7)   # stay under 10 logins/min
    return out


def main():
    print("Logging in all roles...")
    toks = tokens()
    if len(toks) < 4:
        print(f"only got {list(toks)}")
        sys.exit(1)
    json.dump(toks, open("/tmp/tokens.json", "w"))
    print(f"  got tokens for: {list(toks)}\n")

    results = []
    for role, routes in ROUTES.items():
        print(f"\033[1m── {role} ──\033[0m")
        for path in routes:
            try:
                r = requests.get(f"{BASE}{path}",
                                 headers={"Authorization": f"Bearer {toks[role]}"},
                                 timeout=180)
                code = r.status_code
            except Exception as e:
                code = f"ERR {type(e).__name__}"
            mark = "\033[92m✓\033[0m" if code == 200 else "\033[91m✗\033[0m"
            print(f"  {mark} {path:<42} {code}")
            results.append((role, path, code))

    bad = [x for x in results if x[2] != 200]
    print("\n" + "=" * 66)
    print(f"  pages OK: {len(results) - len(bad)}/{len(results)}")
    if bad:
        print("  failing:")
        for role, path, code in bad:
            print(f"    ✗ {role:<12} {path:<42} {code}")
    print("=" * 66)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
