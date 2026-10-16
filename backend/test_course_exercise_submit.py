import requests
import json

BASE = "http://127.0.0.1:5000/api"
r = requests.post(f"{BASE}/auth/login", json={
    "email": "alex.rivera.tester@nexlab.test",
    "password": "TestPass@1234"
}).json()
token = r['token']
headers = {"Authorization": f"Bearer {token}"}

# 1. Fetch course details and first exercise
course_res = requests.get(f"{BASE}/free/courses/dsa-fundamentals", headers=headers).json()
ex = course_res['exercises'][0]
ex_id = ex['id']
ex_title = ex['title']
print(f"Target Exercise: {ex_title} (ID: {ex_id})")
print(f"Starter code: {ex.get('starter_code')}")
print(f"Test cases: {ex.get('test_cases')}")

# 2. Check progress before submit
prog_before = requests.get(f"{BASE}/free/courses/dsa-fundamentals/progress", headers=headers).json()
print("Course Progress Before:", prog_before)

# 3. Submit solution
test_code = "def linear_search(arr, target):\n    for i in range(len(arr)):\n        if arr[i] == target:\n            return i\n    return -1\n"
sub_res = requests.post(f"{BASE}/free/exercises/{ex_id}/submit", headers=headers, json={
    "code": test_code,
    "language": "python"
})
print("Submit Exercise Status:", sub_res.status_code)
print("Submit Exercise Response:", sub_res.json())

# 4. Check progress after submit
prog_after = requests.get(f"{BASE}/free/courses/dsa-fundamentals/progress", headers=headers).json()
print("Course Progress After:", prog_after)
