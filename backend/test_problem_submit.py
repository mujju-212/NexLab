import requests
import json

BASE = "http://127.0.0.1:5000/api"
r = requests.post(f"{BASE}/auth/login", json={
    "email": "alex.rivera.tester@nexlab.test",
    "password": "TestPass@1234"
}).json()
token = r['token']
headers = {"Authorization": f"Bearer {token}"}

# Check initial quest stats before solving
stats_before = requests.get(f"{BASE}/practice/quest/stats", headers=headers).json()
print("XP Before:", stats_before.get('total_xp'), "Level:", stats_before.get('level_name'), "Solved:", stats_before.get('problems_solved'))

# Submit solution to two-sum
payload = {
    "language": "python",
    "code": """def twoSum(nums, target):
    lookup = {}
    for i, num in enumerate(nums):
        diff = target - num
        if diff in lookup:
            return [lookup[diff], i]
        lookup[num] = i
    return []
"""
}

sub_res = requests.post(f"{BASE}/practice/problems/two-sum/submit", headers=headers, json=payload)
print("Submit Status:", sub_res.status_code)
print("Submit Response:", sub_res.json())

# Check stats after solving!
stats_after = requests.get(f"{BASE}/practice/quest/stats", headers=headers).json()
print("XP After:", stats_after.get('total_xp'), "Level:", stats_after.get('level_name'), "Solved:", stats_after.get('problems_solved'))

# Check profile overview
prof_res = requests.get(f"{BASE}/practice/profile-overview", headers=headers).json()
print("Profile Overview:")
print("  Total solved:", prof_res.get('total_solved'))
print("  Total XP:", prof_res.get('total_xp'))
print("  Easy solved:", prof_res.get('easy', {}).get('solved'))
