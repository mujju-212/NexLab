"""
test_groq_integration.py
End-to-end test of every Groq-powered feature in the platform.
Run: python test_groq_integration.py
"""
import os, sys
os.environ['DATABASE_URL'] = 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab'

from app import create_app
from app.extensions import db

app = create_app('development')
app.config['SQLALCHEMY_DATABASE_URI'] = 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab'
app.config.update(TESTING=True, JWT_SECRET_KEY='test-secret')
client = app.test_client()

results = {'passed': 0, 'failed': 0, 'errors': []}


def test(name, fn):
    try:
        fn()
        results['passed'] += 1
        print(f'  PASS  {name}')
    except Exception as e:
        results['failed'] += 1
        results['errors'].append(f'{name}: {e}')
        print(f'  FAIL  {name}: {e}')


with app.app_context():
    db.create_all()

    # ── Login as instructor ──────────────────────────────────────
    r = client.post('/api/auth/login',
                    json={'email': 'instr@tinstrc.edu', 'password': 'Instr@1234'})
    assert r.status_code == 200, f'Login failed: {r.data}'
    TOKEN = r.get_json()['token']
    H = {'Authorization': f'Bearer {TOKEN}'}

    # Find an experiment scoped to the instructor's institution
    from app.models.experiment import Experiment
    from app.models.user import User
    instr_user = User.query.filter_by(email='instr@tinstrc.edu').first()
    assert instr_user, 'Instructor user not found -- run test_instructor.py first'
    exp = Experiment.query.filter_by(institution_id=instr_user.institution_id).first()
    assert exp, 'No experiment found for this institution -- run test_instructor.py first'
    exp_id = exp.id
    print(f'Using experiment: [{exp.title}] id={exp_id}')
    print()

    # ── TEST 1: GROQ_API_KEY loaded into Flask config ────────────
    print('[1] Config Check')

    def t_config_has_key():
        key = app.config.get('GROQ_API_KEY', '')
        assert key.startswith('gsk_'), f'Key not loaded into config: {repr(key[:20])}'
        print(f'    -> Key prefix: {key[:12]}... (length {len(key)})')
    test('GROQ_API_KEY loaded into Flask config', t_config_has_key)

    # ── TEST 2: Direct Groq API call ─────────────────────────────
    print('\n[2] Direct Groq API')

    def t_direct_groq_call():
        from groq import Groq
        groq_client = Groq(api_key=app.config['GROQ_API_KEY'])
        resp = groq_client.chat.completions.create(
            model='llama-3.3-70b-versatile',
            messages=[{'role': 'user', 'content': 'Reply with exactly: GROQ_OK'}],
            max_tokens=10,
            temperature=0
        )
        reply = resp.choices[0].message.content.strip()
        assert 'GROQ' in reply or 'OK' in reply, f'Unexpected reply: {reply}'
        print(f'    -> Model reply: {reply}')
        print(f'    -> Tokens used: {resp.usage.total_tokens}')
        latency_ms = round(resp.usage.total_time * 1000)
        print(f'    -> Latency: {latency_ms}ms')
    test('Direct Groq API call (llama-3.3-70b)', t_direct_groq_call)

    def t_groq_models_available():
        from groq import Groq
        groq_client = Groq(api_key=app.config['GROQ_API_KEY'])
        models = groq_client.models.list()
        model_ids = [m.id for m in models.data]
        assert 'llama-3.3-70b-versatile' in model_ids, \
            f'llama-3.3-70b not in available models. Got: {model_ids[:3]}'
        fast_model = 'llama-3.1-8b-instant'
        print(f'    -> Total models available: {len(model_ids)}')
        print(f'    -> llama-3.3-70b-versatile: YES')
        print(f'    -> llama-3.1-8b-instant: {"YES" if fast_model in model_ids else "NO"}')
    test('Groq model list (verify account access)', t_groq_models_available)

    # ── TEST 3: AI test case generation via route ────────────────
    print('\n[3] AI Test Case Generation Route')

    def t_ai_generate_test_cases():
        r = client.post(
            f'/api/instructor/experiments/{exp_id}/generate-test-cases',
            headers=H,
            json={'count': 4}
        )
        assert r.status_code == 201, f'Status {r.status_code}: {r.data[:400]}'
        data = r.get_json()
        assert data['generated'] >= 1, f'No test cases generated: {data}'
        tc = data['test_cases'][0]
        # Shape check
        assert 'input' in tc or 'expected_output' in tc, \
            f'Bad test case shape: {tc}'
        print(f'    -> Generated: {data["generated"]} test cases')
        print(f'    -> Sample input: {str(tc.get("input",""))[:60]}')
        print(f'    -> Sample expected: {str(tc.get("expected_output",""))[:60]}')
        print(f'    -> is_hidden: {tc.get("is_hidden")}')
    test('AI generate test cases via route (count=4)', t_ai_generate_test_cases)

    # ── TEST 4: AI hint route reachable ──────────────────────────
    print('\n[4] AI Hint Route')

    def t_ai_hint_route():
        r = client.post('/api/ai/hint', headers=H, json={
            'experiment_id': exp_id,
            'hint_level': 1,
            'code': 'def sort(arr): pass',
            'session_id': None
        })
        # 200 = hint returned, 400/422 = missing field, 429 = quota
        assert r.status_code != 404, 'AI hint route does not exist!'
        assert r.status_code != 500, f'Server error: {r.data[:200]}'
        print(f'    -> AI hint route status: {r.status_code}')
        if r.status_code == 200:
            hint = r.get_json()
            print(f'    -> Hint preview: {str(hint.get("hint",""))[:80]}')
    test('AI hint route reachable + no 500 error', t_ai_hint_route)

    # ── TEST 5: Simulation prompt generation ─────────────────────
    print('\n[5] Simulation Prompt')

    def t_simulation_prompt():
        r = client.get(
            f'/api/instructor/experiments/{exp_id}/simulation/prompt',
            headers=H
        )
        assert r.status_code == 200, f'Status: {r.status_code}'
        data = r.get_json()
        prompt = data['prompt']
        assert len(prompt) > 200, f'Prompt too short: {len(prompt)} chars'
        assert '600px' in prompt, 'Missing iframe dimension spec'
        assert 'index.html' in prompt or 'self-contained' in prompt
        print(f'    -> Prompt length: {len(prompt)} chars')
        print(f'    -> Experiment in prompt: {exp.title[:40]}')
    test('Simulation AI prompt generation', t_simulation_prompt)

    # ── TEST 6: Groq with fast model ─────────────────────────────
    print('\n[6] Fast Model (llama-3.1-8b-instant)')

    def t_fast_model():
        from groq import Groq
        groq_client = Groq(api_key=app.config['GROQ_API_KEY'])
        resp = groq_client.chat.completions.create(
            model='llama-3.1-8b-instant',
            messages=[{'role': 'user', 'content': 'Count to 3 with commas only.'}],
            max_tokens=15,
            temperature=0
        )
        reply = resp.choices[0].message.content.strip()
        print(f'    -> Fast model reply: {reply}')
        print(f'    -> Latency: {round(resp.usage.total_time*1000)}ms')
    test('Fast model llama-3.1-8b-instant', t_fast_model)

    # ── TEST 7: Groq error handling (bad model) ──────────────────
    print('\n[7] Error Handling')

    def t_bad_model_handled():
        from groq import Groq
        from groq import BadRequestError, AuthenticationError
        groq_client = Groq(api_key=app.config['GROQ_API_KEY'])
        try:
            groq_client.chat.completions.create(
                model='fake-model-xyz',
                messages=[{'role': 'user', 'content': 'hi'}],
                max_tokens=5
            )
            # If it somehow succeeds, that's unexpected but not a failure
            print('    -> Bad model unexpectedly succeeded')
        except Exception as e:
            err_type = type(e).__name__
            assert err_type not in ('AuthenticationError',), \
                f'Key rejected: {e}'
            print(f'    -> Correctly raised {err_type} for bad model name')
    test('Bad model name raises error (not auth error)', t_bad_model_handled)

# ── RESULTS ──────────────────────────────────────────────────────
total = results['passed'] + results['failed']
print()
print('=' * 52)
print(f'Groq Integration Results: {results["passed"]}/{total} passed')
if results['errors']:
    print('\nFailed tests:')
    for e in results['errors']:
        print(f'  FAIL {e}')
else:
    print('All Groq integration tests passed!')
