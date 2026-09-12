import requests

BASE = 'http://127.0.0.1:5000/api'

def run():
    print("=== Testing Audit Log Endpoints ===")
    
    # 1. Login
    r = requests.post(f"{BASE}/auth/login", json={'email': 'inst.admin@nexlab.demo', 'password': 'InstAdmin@123'})
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json().get('token') or r.json().get('access_token')
    headers = {'Authorization': f'Bearer {token}'}
    print("[OK] Admin Login Passed")

    # 2. Get Stats
    r = requests.get(f"{BASE}/institution/audit-log/stats", headers=headers)
    assert r.status_code == 200, f"Stats failed: {r.text}"
    stats = r.json()
    print(f"[OK] Stats: Total Events={stats['total_events']}, Active Users={stats['active_users']}, Modules={stats['modules_affected']}, Critical={stats['critical_events']}")
    assert stats['total_events'] >= 240, f"Expected ~248 events, got {stats['total_events']}"
    assert len(stats['activity_chart']['daily']) > 0, "Expected daily series"
    assert len(stats['by_module']) >= 5, "Expected by_module breakdown"
    assert len(stats['recent_critical']) > 0, "Expected recent critical events"
    assert 'most_active_user' in stats['quick_insights'], "Expected quick insights"

    # 3. List Audit Logs (page 1, per_page 8)
    r = requests.get(f"{BASE}/institution/audit-log?page=1&per_page=8", headers=headers)
    assert r.status_code == 200, f"List failed: {r.text}"
    data = r.json()
    print(f"[OK] List Logs: Total={data['total']}, Page={data['page']}, Returned={len(data['logs'])}")
    assert len(data['logs']) == 8, f"Expected 8 logs on page 1, got {len(data['logs'])}"
    
    first = data['logs'][0]
    assert 'actor_name' in first, "Expected actor_name"
    assert 'module' in first, "Expected module"
    assert 'severity' in first, "Expected severity"
    assert 'ip_address' in first, "Expected ip_address"
    print(f"[OK] Row Sample: Action='{first['action']}', Module='{first['module']}', User='{first['actor_name']}', IP='{first['ip_address']}', Severity='{first['severity']}'")

    # 4. Filter by Module
    r = requests.get(f"{BASE}/institution/audit-log?module=Sessions&per_page=8", headers=headers)
    assert r.status_code == 200, f"Module filter failed: {r.text}"
    assert all('session' in l['module'].lower() for l in r.json()['logs']), "Module filter mismatch"
    print(f"[OK] Module Filter Passed: Sessions Count={r.json()['total']}")

    # 5. Filter by Severity High
    r = requests.get(f"{BASE}/institution/audit-log?severity=high", headers=headers)
    assert r.status_code == 200, f"Severity filter failed: {r.text}"
    assert all(l['severity'] == 'high' for l in r.json()['logs']), "Severity filter mismatch"
    print(f"[OK] Severity Filter Passed: High Count={r.json()['total']}")

    # 6. Search
    r = requests.get(f"{BASE}/institution/audit-log?q=Data Structures", headers=headers)
    assert r.status_code == 200, f"Search failed: {r.text}"
    print(f"[OK] Search Query Passed: Results Count={r.json()['total']}")

    # 7. Export CSV
    r = requests.get(f"{BASE}/institution/audit-log/export?days=30", headers=headers)
    assert r.status_code == 200, f"Export failed: {r.text}"
    assert 'text/csv' in r.headers.get('Content-Type', ''), "Expected text/csv content type"
    lines = r.text.strip().split('\n')
    assert len(lines) > 200, f"Expected >200 lines in CSV, got {len(lines)}"
    header = lines[0]
    assert 'IP Address' in header and 'Severity' in header and 'Module' in header, f"Header missing fields: {header}"
    print(f"[OK] Export CSV Passed: {len(lines)} lines exported with enriched headers")

    print("\nALL AUDIT LOG BACKEND TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    run()
