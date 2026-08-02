import requests

r = requests.post('http://localhost:5000/api/execution/run-dev',
    json={
        'code': 'public class Main{public static void main(String[] a){System.out.println("JAVA OK");}}',
        'language': 'java',
        'stdin': ''
    },
    timeout=30)
d = r.json()
print('HTTP:', r.status_code)
print('status:', d.get('status'), '| id:', d.get('status_id'))
print('stdout:', repr(d.get('stdout')))
print('stderr:', repr(d.get('stderr')))
print('compile_output:', repr(d.get('compile_output')))
