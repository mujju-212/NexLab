import requests
import json

BASE = "http://127.0.0.1:5000/api"
r = requests.post(f"{BASE}/auth/login", json={
    "email": "alex.rivera.tester@nexlab.test",
    "password": "TestPass@1234"
}).json()
token = r['token']
headers = {"Authorization": f"Bearer {token}"}

payload = {
    "language": "python",
    "code": "print('Hello from NexLab Compiler!')\nprint(f'Calculation: {21 * 2}')",
    "stdin": ""
}

res = requests.post(f"{BASE}/execution/playground", headers=headers, json=payload)
print("Status code:", res.status_code)
try:
    data = res.json()
    print("Execution output:")
    print("  Stdout:", repr(data.get('stdout')))
    print("  Stderr:", repr(data.get('stderr')))
    print("  Time ms:", data.get('time_ms'))
    print("  Memory KB:", data.get('memory_kb'))
    print("  Status:", data.get('status'))
except Exception as e:
    print("Response text:", res.text)
