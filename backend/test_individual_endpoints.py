import requests
import json

BASE = "http://127.0.0.1:5000/api"

# 1. Login as Alex Rivera
login_res = requests.post(f"{BASE}/auth/login", json={
    "email": "alex.rivera.tester@nexlab.test",
    "password": "TestPass@1234"
})
assert login_res.status_code == 200, f"Login failed: {login_res.text}"
data = login_res.json()
token = data['token']
user = data['user']
print(f"Logged in as: {user['full_name']} ({user['email']}), Role: {user['role']}")

headers = {"Authorization": f"Bearer {token}"}

endpoints = [
    ("Dashboard - Quest Stats", f"{BASE}/practice/quest/stats"),
    ("Dashboard - Recommended Problems", f"{BASE}/practice/recommended"),
    ("Dashboard - Free Analytics Overview", f"{BASE}/free/analytics/overview"),
    ("Practice - Daily Challenge", f"{BASE}/practice/daily"),
    ("Practice - Study Plans List", f"{BASE}/practice/plans"),
    ("Practice - Topics List", f"{BASE}/practice/topics"),
    ("Practice - Problems List", f"{BASE}/practice/problems?limit=5"),
    ("Profile - Me", f"{BASE}/auth/me"),
    ("Practice - Quests Leaderboard", f"{BASE}/practice/quest/leaderboard"),
]

results = {}
for name, url in endpoints:
    try:
        r = requests.get(url, headers=headers, timeout=10)
        results[name] = {
            "status": r.status_code,
            "preview": r.text[:200]
        }
        print(f"[{r.status_code}] {name}")
    except Exception as e:
        results[name] = {"status": "ERROR", "error": str(e)}
        print(f"[ERR] {name}: {e}")

print("\n--- Summary of API endpoints ---")
for name, res in results.items():
    print(f"{name}: {res['status']}")
