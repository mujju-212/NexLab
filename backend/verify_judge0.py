import requests, base64

code = 'print("Hello from Judge0!")\nprint(2 + 2)'
resp = requests.post('http://localhost:2358/submissions?wait=true',
                     json={'source_code': code, 'language_id': 71, 'stdin': ''})
d = resp.json()
print('Status:', d['status']['description'])
raw = d.get('stdout', '')
if raw:
    # Add padding and decode
    padded = raw + '==' 
    decoded = base64.b64decode(padded).decode('utf-8')
    print('Output:', repr(decoded))
