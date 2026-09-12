"""
Automated Verification for Institution Admin Help & FAQ Endpoints
"""
import requests

BASE_URL = 'http://127.0.0.1:5000/api'
LOGIN_DATA = {
    'email': 'inst.admin@nexlab.demo',
    'password': 'Admin@123',
}


def test_help_endpoints():
    print("=== Testing Institution Admin Help & FAQ Endpoints ===")

    # 1. Login
    sess = requests.Session()
    res = sess.post(f"{BASE_URL}/auth/login", json=LOGIN_DATA)
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json().get('token')
    headers = {'Authorization': f"Bearer {token}"}
    print("[OK] Admin Login Succeeded. Token acquired.")

    # 2. GET Help Overview
    res = sess.get(f"{BASE_URL}/institution/help/overview", headers=headers)
    assert res.status_code == 200, f"Get overview failed: {res.text}"
    data = res.json()
    assert 'topics' in data, "Missing topics in overview"
    assert 'popular_searches' in data, "Missing popular_searches in overview"
    assert 'support_info' in data, "Missing support_info in overview"
    assert 'resources' in data, "Missing resources in overview"
    assert 'faqs' in data, "Missing faqs in overview"

    topics = data['topics']
    print(f"[OK] Topics count={len(topics)}")
    for top in topics[:3]:
        print(f"     * Topic: {top['title']} ({top['article_count']} articles)")

    faqs = data['faqs']
    print(f"[OK] FAQs count={len(faqs)}")
    for f in faqs[:3]:
        print(f"     * FAQ: {f['question']} ({f['category_title']})")

    # 3. GET Overview with category filter
    res = sess.get(f"{BASE_URL}/institution/help/overview?category=academic_sessions", headers=headers)
    assert res.status_code == 200
    filtered = res.json()['faqs']
    assert all(f['category'] == 'academic_sessions' for f in filtered)
    print(f"[OK] Category filter (academic_sessions): {len(filtered)} FAQs found")

    # 4. GET Overview with search query
    res = sess.get(f"{BASE_URL}/institution/help/overview?q=students", headers=headers)
    assert res.status_code == 200
    search_results = res.json()['faqs']
    print(f"[OK] Search query ('students'): {len(search_results)} FAQs found")

    # 5. POST Rate FAQ
    first_faq = faqs[0]
    res = sess.post(f"{BASE_URL}/institution/help/faqs/{first_faq['id']}/rate", json={'helpful': True}, headers=headers)
    assert res.status_code == 200
    print(f"[OK] Rate FAQ Succeeded: {res.json().get('message')} (Helpful: {res.json().get('helpful_count')})")

    # 6. POST Create Support Ticket
    new_ticket = {
        'subject': 'Help with lab session scheduler recurrence',
        'category': 'academic',
        'priority': 'high',
        'message': 'We want to schedule a recurring lab session for Section B on alternate Thursdays.',
    }
    res = sess.post(f"{BASE_URL}/institution/help/tickets", json=new_ticket, headers=headers)
    assert res.status_code == 201, f"Create ticket failed: {res.text}"
    ticket = res.json()['ticket']
    print(f"[OK] Create Support Ticket Succeeded: {ticket['ticket_number']} - {ticket['subject']}")

    # 7. GET List Support Tickets
    res = sess.get(f"{BASE_URL}/institution/help/tickets", headers=headers)
    assert res.status_code == 200
    tickets = res.json()['tickets']
    assert any(t['ticket_number'] == ticket['ticket_number'] for t in tickets)
    print(f"[OK] List Support Tickets Succeeded: {len(tickets)} total tickets")

    print("\nALL HELP & FAQ BACKEND TESTS PASSED SUCCESSFULLY!")


if __name__ == '__main__':
    test_help_endpoints()
