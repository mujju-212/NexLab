import requests, base64, time

def b64d(s):
    if not s: return ''
    try: return base64.b64decode(s).decode('utf-8')
    except: return s

code = '''public class Main {
    public static void main(String[] a) {
        System.out.println("Java single test!");
    }
}'''

r = requests.post('http://localhost:2358/submissions',
    json={'source_code': code, 'language_id': 62, 'stdin': ''},
    timeout=15)
print(f'Submit HTTP: {r.status_code}')
d = r.json()
token = d.get('token')
print(f'Token: {token}')

for i in range(60):
    time.sleep(2)
    pr = requests.get(f'http://localhost:2358/submissions/{token}', timeout=10)
    d2 = pr.json()
    sid  = (d2.get('status') or {}).get('id')
    desc = (d2.get('status') or {}).get('description', '?')
    print(f't={i*2:3d}s  sid={sid} ({desc})')
    if sid and sid not in (1, 2):
        out = b64d(d2.get('stdout'))
        err = b64d(d2.get('stderr')) or b64d(d2.get('compile_output'))
        print(f'  DONE! stdout: {repr(out)}')
        print(f'  error: {repr(err)}')
        break
else:
    print('TIMED OUT after 120s')
