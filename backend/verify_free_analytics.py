"""
verify_free_analytics.py
Tests the Free User Analytics backend endpoints using the live Flask server.
"""
import requests
import json

BASE_URL = "http://127.0.0.1:5000/api"

def run_checks():
    print("--- 1. Authenticating as free@nexlab.io ---")
    login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": "free@nexlab.io",
        "password": "Free@123"
    })
    
    if login_res.status_code != 200:
        print(f"FAILED to login: {login_res.status_code} {login_res.text}")
        return
        
    login_data = login_res.json()
    token = login_data.get("token") or login_data.get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    user = login_data.get("user", {})
    print(f"Logged in successfully as {user.get('email')} (Role: {user.get('role')})")
    
    endpoints = [
        ("Overview", f"{BASE_URL}/free/analytics/overview"),
        ("Standing", f"{BASE_URL}/free/analytics/standing"),
        ("Activity", f"{BASE_URL}/free/analytics/activity?days=365"),
        ("Accuracy", f"{BASE_URL}/free/analytics/accuracy"),
        ("Courses", f"{BASE_URL}/free/analytics/courses"),
        ("Topic Strength", f"{BASE_URL}/free/analytics/topic-strength"),
        ("Unlocks", f"{BASE_URL}/free/analytics/unlocks"),
        ("Leaderboard (Global)", f"{BASE_URL}/free/analytics/leaderboard?scope=global&period=all_time"),
        ("Recommendations", f"{BASE_URL}/free/analytics/recommendations?limit=5"),
        ("Showcase Me", f"{BASE_URL}/free/analytics/showcase/me"),
    ]
    
    results = {}
    for name, url in endpoints:
        res = requests.get(url, headers=headers)
        status = res.status_code
        data = res.json() if status == 200 else res.text[:200]
        results[name] = {"status": status, "data": data}
        print(f"[{status}] {name}: {'OK' if status == 200 else 'ERR'}")
        
    # Check public showcase if slug exists
    showcase_me = results.get("Showcase Me", {}).get("data", {})
    if isinstance(showcase_me, dict) and showcase_me.get("profile_slug"):
        slug = showcase_me["profile_slug"]
        pub_res = requests.get(f"{BASE_URL}/free/analytics/showcase/{slug}")
        print(f"[{pub_res.status_code}] Public Showcase (No Auth, slug={slug}): {'OK' if pub_res.status_code in (200, 403) else 'ERR'}")
        
    print("\n--- Summary Data Highlights ---")
    ov = results.get("Overview", {}).get("data", {})
    if isinstance(ov, dict):
        standing = ov.get("standing", {})
        print(f"Rating: {standing.get('rating')} | Level: {standing.get('level')} ({standing.get('level_name')})")
        print(f"Global Rank: {standing.get('global_rank')} | Percentile: {standing.get('global_percentile')}%")
        print(f"Solves: Easy={standing.get('easy_solved')} Med={standing.get('medium_solved')} Hard={standing.get('hard_solved')}")
        print(f"Highlights: {ov.get('highlights')}")
        print(f"Enrolled Courses: {len(ov.get('courses', []))}")
        print(f"Topics Tracked: {len(ov.get('topic_strength', []))}")

if __name__ == "__main__":
    run_checks()
