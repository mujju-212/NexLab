import requests
import json

BASE_URL = 'http://127.0.0.1:5000/api'

print("=== Testing Institution Admin Profile Endpoints ===")

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

# 2. Test GET /institution/profile
prof_resp = requests.get(f"{BASE_URL}/institution/profile", headers=headers)
assert prof_resp.status_code == 200, f"GET /institution/profile failed ({prof_resp.status_code}): {prof_resp.text}"
prof_data = prof_resp.json()
print(f"[OK] Profile Data: User='{prof_data['user']['full_name']}', Email='{prof_data['user']['email']}', Phone='{prof_data['user']['phone']}', Bio='{prof_data['user']['bio']}'")
print(f"[OK] Institution='{prof_data['institution']['name']}', Plan='{prof_data['institution']['plan_display']}'")
print(f"[OK] Security: 2FA={prof_data['security']['two_factor_enabled']}, Session IP='{prof_data['security']['current_session']['ip_address']}'")

# 3. Test PATCH /institution/profile
patch_resp = requests.patch(f"{BASE_URL}/institution/profile", headers=headers, json={
    'full_name': 'Institution Admin',
    'phone': '+91 98765 43210',
    'bio': 'Empowering education through technology.',
    'timezone': '(GMT+05:30) Asia/Kolkata',
    'language': 'English (India)'
})
assert patch_resp.status_code == 200, f"PATCH /institution/profile failed ({patch_resp.status_code}): {patch_resp.text}"
print(f"[OK] Update Profile Succeeded: {patch_resp.json()['message']}")

# 4. Test POST /institution/profile/2fa/toggle
toggle_resp = requests.post(f"{BASE_URL}/institution/profile/2fa/toggle", headers=headers)
assert toggle_resp.status_code == 200, f"2FA toggle failed: {toggle_resp.text}"
new_state = toggle_resp.json()['two_factor_enabled']
print(f"[OK] 2FA Toggle Succeeded: State now = {new_state}")

# Toggle back if it was enabled so default stays clean or user choice
toggle_back = requests.post(f"{BASE_URL}/institution/profile/2fa/toggle", headers=headers)
print(f"[OK] 2FA Toggled Back: State now = {toggle_back.json()['two_factor_enabled']}")

# 5. Test GET /institution/profile/export-data
export_resp = requests.get(f"{BASE_URL}/institution/profile/export-data", headers=headers)
assert export_resp.status_code == 200, f"Export user data failed: {export_resp.text}"
export_json = export_resp.json()
assert 'user_account' in export_json and 'institution' in export_json
print(f"[OK] Export User Data Succeeded: {len(json.dumps(export_json))} bytes exported.")

print("\nALL PROFILE BACKEND TESTS PASSED SUCCESSFULLY!")
