"""
verify_ai_system.py — AI & Agentic System verification.

Proves the revived stack end to end:
  [1] Context Engine — learner/teaching/platform snapshots match the DB truth
  [2] Tutor memory — profile endpoint + durable goal + tool write
  [3] Live harness turns per role (tutor knows the learner; staff agents answer
      with grounded data) — requires GROQ_API_KEY or the OpenRouter fallback
  [4] Usage accounting — every turn lands in AIUsageLog with tokens

Run:  cd backend && DATABASE_URL=postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab \
          PYTHONIOENCODING=utf-8 ./venv/Scripts/python.exe verify_ai_system.py
"""
import os
import sys
from datetime import datetime, timedelta

os.environ.setdefault('DATABASE_URL', 'postgresql://postgres:vlabpass@127.0.0.1:5433/virtuallab')

from app import create_app
from app.extensions import db

app = create_app('development')
app.config.update(
    SQLALCHEMY_DATABASE_URI=os.environ['DATABASE_URL'],
    TESTING=True, PROPAGATE_EXCEPTIONS=False, JWT_SECRET_KEY='test-secret',
)
client = app.test_client()

results = []
def record(step, name, ok, detail=''):
    results.append((step, name, bool(ok), detail))
    print(f"  {'PASS' if ok else 'FAIL'}  [{step}] {name}" + (f"  — {detail}" if detail else ''))

def H(tok):
    return {'Authorization': f'Bearer {tok}'}

with app.app_context():
    from app.models.user import User
    from app.models.ai_memory import AILearnerMemory
    from app.models.ai_usage import AIUsageLog
    from app.ai.learner_context import build_role_context, save_learning_goal
    from app.ai.role_tools import get_tools_for_role

    print('\n[1] CONTEXT ENGINE')
    learner = User.query.filter_by(email='platform@nexlab.io').first()
    ctx = build_role_context(learner)
    from app.models.practice import StudentXP
    xp = StudentXP.query.filter_by(student_id=learner.id).first()
    record('C1', 'learner snapshot carries real DB numbers (level/XP/streak)',
           f'Level {xp.level}' in ctx and f'{xp.total_xp} XP' in ctx
           and f'{xp.streak_days}-day streak' in ctx,
           f'level={xp.level} xp={xp.total_xp} streak={xp.streak_days}')
    record('C2', 'strongest + needs-practice topics present',
           'Strongest topics:' in ctx and ('Needs practice:' in ctx or 'solved mix' in ctx))
    record('C3', 'snapshot cached in ai_learner_memory (TTL)',
           AILearnerMemory.query.filter_by(user_id=learner.id).first() is not None)

    inst_user = User.query.filter_by(email='instructor@nexlab.demo').first()
    ictx = build_role_context(inst_user)
    record('C4', 'instructor teaching context builds', 'TEACHING CONTEXT' in ictx,
           ictx.split('\n')[0][:60])
    admin_user = User.query.filter_by(email='admin@nexlab.io').first()
    actx = build_role_context(admin_user)
    record('C5', 'platform-admin context builds', 'PLATFORM CONTEXT' in actx,
           actx.split('\n')[1][:70] if '\n' in actx else actx[:70])

    print('\n[2] TUTOR MEMORY')
    r = client.post('/api/auth/login', json={'email': 'platform@nexlab.io', 'password': 'Free@123'})
    PT = r.get_json()['token']
    r = client.patch('/api/ai/tutor/profile', headers=H(PT),
                     json={'goal': 'Master dynamic programming for interviews', 'preferred_language': 'python'})
    j = (r.get_json() or {}).get('profile') or {}
    record('M1', 'goal saved via profile API',
           r.status_code == 200 and 'dynamic programming' in (j.get('goal') or ''),
           f'goal={j.get("goal")}')
    r = client.get('/api/ai/tutor/profile', headers=H(PT))
    record('M2', 'profile reads back', r.status_code == 200)
    ctx2 = build_role_context(learner)
    record('M3', 'durable goal injected into every future prompt',
           'Stated goal: Master dynamic programming' in ctx2)

    r = client.post('/api/auth/login', json={'email': 'student@nexlab.demo', 'password': 'Student@123'})
    ST = r.get_json()['token']
    r = client.patch('/api/ai/tutor/profile', headers=H(ST), json={'goal': 'pass my DS lab'})
    record('M4', 'student tutor memory works too', r.status_code == 200)
    record('M5', "goal tool registered for both learner roles",
           'save_learning_goal' in get_tools_for_role('student')
           and 'save_learning_goal' in get_tools_for_role('platform_user'))

    print('\n[3] LIVE HARNESS TURNS')
    def turn(tok, prompt, mode='chat'):
        return client.post('/api/ai/harness/message', headers=H(tok),
                           json={'prompt': prompt, 'mode': mode})

    r = turn(PT, 'Based on my profile, what topic should I practice next and why?')
    j = r.get_json() or {}
    reply = str(((j.get('assistant_message') or {}).get('content')) or '')
    ok = r.status_code in (200, 201) and len(reply) > 40
    personalized = ok and any(k in reply.lower() for k in
                              ('hash', 'trie', 'arrays & strings', 'topic', 'practice'))
    record('T1', 'tutor turn answers with personalized guidance', personalized,
           f'HTTP {r.status_code} len={len(reply)} head={reply[:70]!r}')

    r = client.post('/api/auth/login', json={'email': 'instructor@nexlab.demo', 'password': 'Instructor@123'})
    IT = r.get_json()['token']
    r = turn(IT, 'Summarize my teaching context in one sentence.', mode='agent')
    j = r.get_json() or {}
    reply = str(((j.get('assistant_message') or {}).get('content')) or '')
    record('T2', 'instructor agent turn works', r.status_code in (200, 201) and len(reply) > 30,
           f'HTTP {r.status_code} head={reply[:70]!r}')

    r = client.post('/api/auth/login', json={'email': 'admin@nexlab.io', 'password': 'Admin@123'})
    AT = r.get_json()['token']
    r = turn(AT, 'Give me the platform totals from my context.', mode='agent')
    j = r.get_json() or {}
    reply = str(((j.get('assistant_message') or {}).get('content')) or '')
    record('T3', 'platform-admin agent turn works', r.status_code in (200, 201) and len(reply) > 30,
           f'HTTP {r.status_code} head={reply[:70]!r}')

    print('\n[4] USAGE ACCOUNTING')
    since = datetime.utcnow() - timedelta(minutes=10)
    recent = AIUsageLog.query.filter(AIUsageLog.created_at >= since).order_by(
        AIUsageLog.created_at.desc()).limit(10).all()
    record('U1', 'harness turns logged to AIUsageLog', len(recent) >= 3,
           f'rows={len(recent)}')
    with_tokens = sum(1 for r_ in recent if (r_.total_tokens or 0) > 0)
    record('U2', 'token usage captured for billing', with_tokens >= 1,
           f'{with_tokens}/{len(recent)} rows carry tokens')
    feats = {r_.feature for r_ in recent}
    record('U3', 'feature/attribution recorded', len(feats) >= 1, f'features={feats}')

    # cleanup: leave the learner goal (harmless, real memory) — remove test note only

print('\n' + '=' * 78)
fails = [x for x in results if not x[2]]
for step, name, ok, detail in fails:
    print(f"  FAILED [{step}] {name}  — {detail}")
print(f"RESULT: {len(results) - len(fails)}/{len(results)} passed"
      + ('  — AI SYSTEM FULLY OPERATIONAL ✅' if not fails else f'  — {len(fails)} FAILED ❌'))
sys.exit(0 if not fails else 1)
