import requests

BASE = 'http://127.0.0.1:5000/api'

def test_flow():
    print("=== Testing Announcements End-to-End ===")

    # 1. Admin Login
    r = requests.post(f"{BASE}/auth/login", json={'email': 'inst.admin@nexlab.demo', 'password': 'InstAdmin@123'})
    assert r.status_code == 200, f"Admin login failed: {r.text}"
    admin_token = r.json().get('token') or r.json().get('access_token')
    admin_headers = {'Authorization': f'Bearer {admin_token}'}
    print("[OK] Admin Login Passed")

    # 2. Get Stats
    r = requests.get(f"{BASE}/institution/announcements/stats", headers=admin_headers)
    assert r.status_code == 200, f"Stats failed: {r.text}"
    stats = r.json()
    print(f"[OK] Stats: Total={stats['total_announcements']}, Reach={stats['students_reached']:,}, Views={stats['total_views']:,}, Sched={stats['scheduled_count']}")

    # 3. List Announcements
    r = requests.get(f"{BASE}/institution/announcements", headers=admin_headers)
    assert r.status_code == 200, f"List failed: {r.text}"
    announcements = r.json()['announcements']
    print(f"[OK] List Announcements: Count={len(announcements)}")
    assert len(announcements) > 0

    first_ann = announcements[0]
    first_id = first_ann['id']

    # 4. Get Single Announcement Details
    r = requests.get(f"{BASE}/institution/announcements/{first_id}", headers=admin_headers)
    assert r.status_code == 200, f"Details failed: {r.text}"
    details = r.json()['announcement']
    print(f"[OK] Announcement Details: Title='{details['title']}', Readers={len(details.get('readers', []))}")

    # 5. Create New Announcement
    new_payload = {
        'title': 'Test System Verification Notice',
        'message': 'This is an automated verification announcement ensuring full delivery across all portals.',
        'priority': 'important',
        'category': 'general',
        'target': 'all'
    }
    r = requests.post(f"{BASE}/institution/announcements", json=new_payload, headers=admin_headers)
    assert r.status_code == 201, f"Create failed: {r.text}"
    created_id = r.json()['announcement']['id']
    print(f"[OK] Created Announcement: ID={created_id}, Sent To={r.json()['sent_to']}")

    # 6. Student Login & View Feed
    r = requests.post(f"{BASE}/auth/login", json={'email': 'student@nexlab.demo', 'password': 'Student@123'})
    assert r.status_code == 200, f"Student login failed: {r.text}"
    student_token = r.json().get('token') or r.json().get('access_token')
    student_headers = {'Authorization': f'Bearer {student_token}'}
    print("[OK] Student Login Passed")

    r = requests.get(f"{BASE}/student/announcements", headers=student_headers)
    assert r.status_code == 200, f"Student feed failed: {r.text}"
    student_announcements = r.json()['announcements']
    print(f"[OK] Student Announcements Feed: Count={len(student_announcements)}, Unread={r.json()['unread_count']}")

    # 7. Student Mark as Read
    r = requests.post(f"{BASE}/student/announcements/{created_id}/read", headers=student_headers)
    assert r.status_code == 200, f"Student read failed: {r.text}"
    print(f"[OK] Student Marked Read: Views={r.json()['views_count']}")

    # 8. Student Like
    r = requests.post(f"{BASE}/student/announcements/{created_id}/like", headers=student_headers)
    assert r.status_code == 200, f"Student like failed: {r.text}"
    print(f"[OK] Student Liked: Liked={r.json()['liked']}, Likes Count={r.json()['likes_count']}")

    # 9. Instructor Login & View Feed
    r = requests.post(f"{BASE}/auth/login", json={'email': 'instructor@nexlab.demo', 'password': 'Instructor@123'})
    assert r.status_code == 200, f"Instructor login failed: {r.text}"
    inst_token = r.json().get('token') or r.json().get('access_token')
    inst_headers = {'Authorization': f'Bearer {inst_token}'}
    print("[OK] Instructor Login Passed")

    r = requests.get(f"{BASE}/instructor/announcements", headers=inst_headers)
    assert r.status_code == 200, f"Instructor feed failed: {r.text}"
    print(f"[OK] Instructor Announcements Feed: Count={len(r.json()['announcements'])}")

    # Clean up test announcement
    requests.delete(f"{BASE}/institution/announcements/{created_id}", headers=admin_headers)
    print("[OK] Cleaned up test announcement")

    print("\nALL ANNOUNCEMENTS END-TO-END TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    test_flow()
