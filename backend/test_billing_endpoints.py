"""
Automated Verification for Institution Admin Billing & Plan Endpoints
"""
import requests

BASE_URL = 'http://127.0.0.1:5000/api'
LOGIN_DATA = {
    'email': 'inst.admin@nexlab.demo',
    'password': 'Admin@123',
}


def test_billing_endpoints():
    print("=== Testing Institution Admin Billing & Plan Endpoints ===")

    # 1. Login
    sess = requests.Session()
    res = sess.post(f"{BASE_URL}/auth/login", json=LOGIN_DATA)
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json().get('token')
    headers = {'Authorization': f"Bearer {token}"}
    print("[OK] Admin Login Succeeded. Token acquired.")

    # 2. GET Billing Overview
    res = sess.get(f"{BASE_URL}/institution/billing/overview", headers=headers)
    assert res.status_code == 200, f"Get overview failed: {res.text}"
    data = res.json()
    assert 'plan' in data, "Missing plan in overview"
    assert 'usage' in data, "Missing usage in overview"
    assert 'billing_info' in data, "Missing billing_info in overview"
    assert 'payment_methods' in data, "Missing payment_methods in overview"
    assert 'recent_invoices' in data, "Missing recent_invoices in overview"
    assert 'plans_catalog' in data, "Missing plans_catalog in overview"

    plan = data['plan']
    print(f"[OK] Plan: {plan['name']} ({plan['id']}), Price: {plan['price']}, Cycle: {plan['billing_cycle']}, Next: {plan['next_billing_date']}")

    usage = data['usage']
    print(f"[OK] Usage: Students={usage['students']['used']}/{usage['students']['limit']} ({usage['students']['percent']}%), Instructors={usage['instructors']['used']}/{usage['instructors']['limit']}, Subjects={usage['subjects']['used']}/{usage['subjects']['limit']}")

    invoices = data['recent_invoices']
    print(f"[OK] Invoices count={len(invoices)}")
    for inv in invoices[:3]:
        print(f"     * {inv['invoice_number']} - {inv['date']} - {inv['amount']} ({inv['status']})")

    # 3. PATCH Billing Info
    update_info = {
        'billing_email': 'accounts@greenwood.edu',
        'contact_person': 'Finance Department',
        'phone': '+91 98765 43210',
        'address': '123 Education Street, HSR Layout, Bengaluru, Karnataka 560102, India',
    }
    res = sess.patch(f"{BASE_URL}/institution/billing/info", json=update_info, headers=headers)
    assert res.status_code == 200, f"Update billing info failed: {res.text}"
    print(f"[OK] Update Billing Info Succeeded: {res.json().get('message')}")

    # 4. PATCH Auto-Renewal Toggle
    res = sess.patch(f"{BASE_URL}/institution/billing/auto-renewal", json={'auto_renewal': False}, headers=headers)
    assert res.status_code == 200, f"Toggle auto renewal failed: {res.text}"
    assert res.json()['auto_renewal'] is False
    print("[OK] Toggle Auto-Renewal to False Succeeded")

    res = sess.patch(f"{BASE_URL}/institution/billing/auto-renewal", json={'auto_renewal': True}, headers=headers)
    assert res.status_code == 200
    assert res.json()['auto_renewal'] is True
    print("[OK] Toggle Auto-Renewal back to True Succeeded")

    # 5. POST Add Payment Method
    new_card = {
        'cardholder_name': 'Greenwood Tech',
        'card_number': '5105105105108888',
        'exp_month': 11,
        'exp_year': 2029,
        'card_brand': 'Mastercard',
        'is_default': False,
    }
    res = sess.post(f"{BASE_URL}/institution/billing/payment-methods", json=new_card, headers=headers)
    assert res.status_code == 201, f"Add payment method failed: {res.text}"
    pm_id = res.json()['payment_method']['id']
    print(f"[OK] Add Payment Method Succeeded: {res.json().get('message')} (ID={pm_id})")

    # 6. DELETE Payment Method
    res = sess.delete(f"{BASE_URL}/institution/billing/payment-methods/{pm_id}", headers=headers)
    assert res.status_code == 200, f"Delete payment method failed: {res.text}"
    print(f"[OK] Delete Payment Method Succeeded: {res.json().get('message')}")

    # 7. GET Invoice Download
    first_inv = invoices[0]
    res = sess.get(f"{BASE_URL}/institution/billing/invoices/{first_inv['id']}/download", headers=headers)
    assert res.status_code == 200, f"Download invoice failed: {res.text}"
    assert 'application/json' in res.headers.get('Content-Type', '')
    receipt = res.json()
    print(f"[OK] Download Invoice Succeeded: Receipt {receipt['invoice_number']} for {receipt['amount']}")

    # 8. PATCH Plan switch
    res = sess.patch(f"{BASE_URL}/institution/billing/plan", json={'plan': 'pro', 'billing_cycle': 'monthly'}, headers=headers)
    assert res.status_code == 200, f"Update plan failed: {res.text}"
    print(f"[OK] Update Plan Succeeded: {res.json().get('message')}")

    print("\nALL BILLING BACKEND TESTS PASSED SUCCESSFULLY!")


if __name__ == '__main__':
    test_billing_endpoints()
