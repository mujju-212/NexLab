import requests
import json

BASE_URL = 'http://127.0.0.1:5000/api'

print("=== Testing Institution Admin Notifications Endpoints ===")

# 1. Login as Institution Admin
login_resp = requests.post(f"{BASE_URL}/auth/login", json={
    'email': 'inst.admin@nexlab.demo',
    'password': 'Admin@123'
})
if login_resp.status_code != 200:
    print(f"Login failed ({login_resp.status_code}): {login_resp.text}")
    exit(1)

token = login_resp.json()['token']
headers = {'Authorization': f'Bearer {token}'}
print(f"[OK] Admin Login Succeeded. Token acquired.")

# 2. Test GET /institution/notifications/settings
get_resp = requests.get(f"{BASE_URL}/institution/notifications/settings", headers=headers)
assert get_resp.status_code == 200, f"GET failed ({get_resp.status_code}): {get_resp.text}"
data = get_resp.json()
assert 'channels' in data and 'categories' in data and 'recent_notifications' in data
print(f"[OK] Channels: Email={data['channels']['email']}, In-App={data['channels']['in_app']}")
print(f"[OK] Categories count={len(data['categories'])}")
print(f"[OK] Recent Notifications count={len(data['recent_notifications'])}")
for n in data['recent_notifications'][:3]:
    print(f"     • {n['title']} ({n['message']}) - {n['relative_time']}")

# 3. Test PATCH /institution/notifications/settings
channels = data['channels']
channels['sms'] = True
patch_resp = requests.patch(f"{BASE_URL}/institution/notifications/settings", headers=headers, json={
    'channels': channels,
    'categories': data['categories']
})
assert patch_resp.status_code == 200, f"PATCH failed ({patch_resp.status_code}): {patch_resp.text}"
print(f"[OK] Update Settings Succeeded: {patch_resp.json()['message']}")

# 4. Test POST /institution/notifications/test
test_resp = requests.post(f"{BASE_URL}/institution/notifications/test", headers=headers, json={
    'channel': 'in_app',
    'recipient': 'inst.admin@nexlab.demo'
})
assert test_resp.status_code == 200, f"Test notification failed: {test_resp.text}"
print(f"[OK] Test Notification Succeeded: {test_resp.json()['message']}")

# 5. Test POST /institution/notifications/reset
reset_resp = requests.post(f"{BASE_URL}/institution/notifications/reset", headers=headers)
assert reset_resp.status_code == 200, f"Reset failed: {reset_resp.text}"
print(f"[OK] Reset Settings Succeeded: {reset_resp.json()['message']}")

print("\nALL NOTIFICATIONS BACKEND TESTS PASSED SUCCESSFULLY!")
