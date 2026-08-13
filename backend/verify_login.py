import requests
BASE = 'http://localhost:5000/api'
tests = [
    ('stud@tinstrc.edu',      'Test@1234'),
    ('instr@tinstrc.edu',     'Instr@1234'),
    ('instadmin@test.com',    'Admin@1234'),
    ('superadmin@nexlab.com', 'Super@1234'),
]
print('=== Login Verification ===')
for email, pw in tests:
    try:
        r = requests.post(BASE + '/auth/login', json={'email': email, 'password': pw}, timeout=5)
        d = r.json()
        if r.status_code == 200:
            tok = str(d.get('token', '') or d.get('access_token', ''))
            role = d.get('user', {}).get('role', '?')
            print('  PASS', email, '->', role, '| token:', tok[:15] + '...')
        else:
            print('  FAIL', email, '->', r.status_code, r.text[:100])
    except Exception as e:
        print('  ERR ', email, '->', str(e))
