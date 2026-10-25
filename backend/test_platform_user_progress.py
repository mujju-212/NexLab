import requests
import json

BASE = "http://127.0.0.1:5000/api"
r = requests.post(f"{BASE}/auth/login", json={
    "email": "alex.rivera.tester@nexlab.test",
    "password": "TestPass@1234"
}).json()
token = r['token']
headers = {"Authorization": f"Bearer {token}"}

overall = requests.get(f"{BASE}/free/progress", headers=headers).json()
print("=== Overall Free Progress ===")
print(json.dumps(overall, indent=2))

course = requests.get(f"{BASE}/free/courses/dsa-fundamentals", headers=headers).json()['course']
cid = course['id']
course_prog = requests.get(f"{BASE}/free/progress/{cid}", headers=headers).json()
print(f"=== Course Progress for {course['title']} ===")
print(json.dumps(course_prog, indent=2))
