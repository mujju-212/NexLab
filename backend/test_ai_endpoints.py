"""
Automated test script for Institution Admin AI Usage & Governance Endpoints.
"""
import sys
import requests

BASE_URL = 'http://127.0.0.1:5000/api'
ADMIN_EMAIL = 'inst.admin@nexlab.demo'
ADMIN_PASSWORD = 'Admin@123'

def run_tests():
    print("=== Testing Institution Admin AI Usage & Governance Endpoints ===")
    
    # 1. Login
    login_resp = requests.post(f"{BASE_URL}/auth/login", json={
        'email': ADMIN_EMAIL,
        'password': ADMIN_PASSWORD,
    })
    if login_resp.status_code != 200:
        print(f"[FAIL] Login failed: {login_resp.status_code} {login_resp.text}")
        sys.exit(1)
    
    token = login_resp.json().get('token')
    headers = {'Authorization': f"Bearer {token}"}
    print("[OK] Admin Login Succeeded. Token acquired.")

    # 2. GET /institution/ai/overview
    ov_resp = requests.get(f"{BASE_URL}/institution/ai/overview", headers=headers)
    if ov_resp.status_code != 200:
        print(f"[FAIL] AI Overview failed: {ov_resp.status_code} {ov_resp.text}")
        sys.exit(1)
    ov_data = ov_resp.json()
    assert 'kpis' in ov_data, "Missing kpis in overview"
    assert 'trend' in ov_data, "Missing trend in overview"
    assert 'feature_breakdown' in ov_data, "Missing feature_breakdown"
    assert 'governance' in ov_data, "Missing governance"
    assert 'top_users' in ov_data, "Missing top_users"
    print(f"[OK] AI Overview Succeeded: Total Calls={ov_data['kpis']['total_calls']['value']}, Active Users={ov_data['kpis']['active_users']['value']}")

    # 3. PATCH /institution/ai/governance
    gov_resp = requests.patch(f"{BASE_URL}/institution/ai/governance", headers=headers, json={
        'allow_students': True,
        'content_safety_filter': True,
    })
    assert gov_resp.status_code == 200, f"Update governance failed: {gov_resp.status_code} {gov_resp.text}"
    print(f"[OK] Update AI Governance Succeeded: {gov_resp.json().get('message')}")

    # 4. GET /institution/ai/users
    users_resp = requests.get(f"{BASE_URL}/institution/ai/users?role=all&page=1&per_page=8", headers=headers)
    assert users_resp.status_code == 200, f"Get AI Users failed: {users_resp.status_code} {users_resp.text}"
    users_data = users_resp.json()
    assert 'users' in users_data and len(users_data['users']) > 0, "No users returned in user usage"
    target_user = users_data['users'][0]
    print(f"[OK] Get AI Users Succeeded: {len(users_data['users'])} users on page 1 (Total: {users_data['total']})")

    # 5. GET /institution/ai/quotas
    quotas_resp = requests.get(f"{BASE_URL}/institution/ai/quotas", headers=headers)
    assert quotas_resp.status_code == 200, f"Get AI Quotas failed: {quotas_resp.status_code} {quotas_resp.text}"
    quotas_data = quotas_resp.json()
    assert 'kpis' in quotas_data and 'distribution' in quotas_data, "Missing quota fields"
    print(f"[OK] Get AI Quotas Succeeded: Total Allocated={quotas_data['kpis']['total_allocated']['value']}")

    # 6. PATCH /institution/ai/users/<user_id>/quota
    user_id = target_user['id']
    uq_resp = requests.patch(f"{BASE_URL}/institution/ai/users/{user_id}/quota", headers=headers, json={
        'monthly_token_quota': 550000,
    })
    assert uq_resp.status_code == 200, f"Update user quota failed: {uq_resp.status_code} {uq_resp.text}"
    print(f"[OK] Update User Quota Succeeded for {target_user['name']}")

    # 7. POST /institution/ai/users/<user_id>/reset-quota
    reset_resp = requests.post(f"{BASE_URL}/institution/ai/users/{user_id}/reset-quota", headers=headers)
    assert reset_resp.status_code == 200, f"Reset user quota failed: {reset_resp.status_code} {reset_resp.text}"
    print(f"[OK] Reset User Quota Succeeded for {target_user['name']}")

    # 8. GET /institution/ai/features
    feat_resp = requests.get(f"{BASE_URL}/institution/ai/features", headers=headers)
    assert feat_resp.status_code == 200, f"Get AI Features failed: {feat_resp.status_code} {feat_resp.text}"
    feat_data = feat_resp.json()
    assert len(feat_data['features']) == 12, f"Expected 12 features, got {len(feat_data['features'])}"
    print(f"[OK] Get AI Features Succeeded: {len(feat_data['features'])} features (Enabled: {feat_data['kpis']['enabled_features']})")

    # 9. PATCH /institution/ai/features/chat_assistant
    fpatch_resp = requests.patch(f"{BASE_URL}/institution/ai/features/chat_assistant", headers=headers, json={
        'enabled': True,
        'rate_limit_per_hour': 120,
    })
    assert fpatch_resp.status_code == 200, f"Update feature failed: {fpatch_resp.status_code} {fpatch_resp.text}"
    print("[OK] Update AI Feature Succeeded: Chat Assistant rate limit updated")

    # 10. GET /institution/ai/security
    sec_resp = requests.get(f"{BASE_URL}/institution/ai/security", headers=headers)
    assert sec_resp.status_code == 200, f"Get Security failed: {sec_resp.status_code} {sec_resp.text}"
    sec_data = sec_resp.json()
    assert 'recent_events' in sec_data and len(sec_data['recent_events']) > 0
    print(f"[OK] Get Security & Compliance Succeeded: Score={sec_data['kpis']['security_score']['value']}, Events={len(sec_data['recent_events'])}")

    # 11. GET /institution/ai/logs
    logs_resp = requests.get(f"{BASE_URL}/institution/ai/logs?page=1&per_page=5", headers=headers)
    assert logs_resp.status_code == 200, f"Get AI Logs failed: {logs_resp.status_code} {logs_resp.text}"
    print(f"[OK] Get AI Logs Succeeded: {len(logs_resp.json().get('logs', []))} log rows returned")

    # 12. GET /institution/ai/export
    exp_resp = requests.get(f"{BASE_URL}/institution/ai/export", headers=headers)
    assert exp_resp.status_code == 200, f"Export failed: {exp_resp.status_code}"
    assert 'text/csv' in exp_resp.headers.get('Content-Type', '')
    print("[OK] Export AI Report Succeeded: CSV generated successfully")

    print("\nALL AI USAGE & GOVERNANCE BACKEND TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    run_tests()
