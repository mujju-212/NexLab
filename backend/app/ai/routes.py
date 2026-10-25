"""
AI Blueprint — Groq API integration
Handles: AI hints, help chat, viva question generation, viva answer evaluation

All AI calls go through guarded_ai_call() (app.ai.gate) which enforces:
  - Platform + institution on/off policy
  - Daily/monthly token quotas
  - Per-student fairness caps
  - AIUsageLog row per call (tokens, cost, latency, model)
"""
import time
from flask import Blueprint, request, jsonify, current_app, g
from app.auth.utils import require_auth, require_role
from app.extensions import db, limiter
from app.models.grading import HintLog, VivaSession, VivaAnswer
from app.models.experiment import Experiment
from app.ai.gate import guarded_ai_call, AIDisabled, AIQuotaExceeded
from datetime import datetime, timedelta
import os

ai_bp = Blueprint('ai', __name__)

# Groq model pools — rotation across models on rate limits is handled
# by app.ai.groq_client (429 → next model in pool automatically)
POOL_HINTS = 'fast'      # fast, generous free tier
POOL_CHAT  = 'quality'   # better reasoning for chat
POOL_VIVA  = 'quality'   # code-specific questions need quality

# Hint deduction schedule
HINT_DEDUCTIONS = {0: 0.0, 1: 3.0, 2: 7.0, 3: 12.0}
HINT_MAX_DEDUCTION = 15.0


@ai_bp.route('/hint', methods=['POST'])
@require_auth
@limiter.limit("4 per 3 minutes")   # enforce 3-min cooldown between hints
def get_hint():
    """Progressive 3-level hint system"""
    data           = request.get_json()
    experiment_id  = data.get('experiment_id')
    session_id     = data.get('session_id')
    hint_level     = data.get('hint_level', 1)       # 1 | 2 | 3
    code           = data.get('code', '')
    error          = data.get('error', '')
    language       = data.get('language', 'python')

    if not experiment_id:
        return jsonify({'error': 'experiment_id required'}), 400
    if hint_level not in (1, 2, 3):
        return jsonify({'error': 'hint_level must be 1, 2, or 3'}), 400
    blocked = _require_institution_account()
    if blocked:
        return blocked

    # ── Check Groq quota (legacy request-count check — gate also enforces token quota) ──
    if not _check_quota(g.institution_id):
        return jsonify({'error': 'Daily AI assistance limit reached. Resets at midnight.'}), 429

    # ── Count hints used for deduction calculation ─────────────────────────
    hints_used = HintLog.query.filter_by(
        student_id=g.user_id,
        experiment_id=experiment_id
    ).count()

    # ── Build prompt (Zampirolli paper design) ─────────────────────────────
    experiment = Experiment.query.get(experiment_id)
    exp_title  = experiment.title if experiment else 'this experiment'

    level_instructions = {
        1: "Give a very vague directional hint only. Do not mention the code at all. Point to the general concept area.",
        2: "Be more specific. Point to the area of their code that has the issue. Mention the line range if relevant.",
        3: "Clearly explain what the specific issue is. Do not give any code. Do not give the correct logic directly."
    }

    system_prompt = f"""You are a lab teaching assistant for {exp_title}.
{level_instructions[hint_level]}
STRICT RULES:
- Do NOT provide code snippets or functions
- Do NOT give the correct answer or algorithm
- If there is a compilation error: state the line number and what type of error it is
- Use plain text only — no markdown
- Maximum 400 characters
- Guide toward the solution, never to the solution"""

    user_message = f"Language: {language}\nError: {error or 'None'}\nCode:\n{code[-1500:]}"

    messages = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user',   'content': user_message},
    ]

    # ── Call via AI gate (enforces policy, quota, usage logging) ────────────
    try:
        hint_text, model_used, is_fallback, _ = guarded_ai_call(
            'hint',
            institution_id=g.institution_id,
            user_id=g.user_id,
            role=g.role,
            messages=messages,
            pool=POOL_HINTS,
            max_tokens=120,
            temperature=0.3,
        )
    except AIDisabled as e:
        return jsonify({'error': str(e.reason)}), 403
    except AIQuotaExceeded as e:
        return jsonify({'error': e.reason, 'quota': e.quota, 'used': e.used}), 429

    start_time = time.time()
    latency_ms = 0  # gate already measures latency internally; kept for HintLog compat

    # ── Log hint ──────────────────────────────────────────────────────────
    log = HintLog(
        student_id=g.user_id,
        experiment_id=experiment_id,
        session_id=session_id,
        hint_level=hint_level,
        prompt_sent=f"{system_prompt}\n---\n{user_message}",
        response_received=hint_text,
        model_used=model_used or 'fallback',
        latency_ms=latency_ms,
        is_fallback=is_fallback
    )
    db.session.add(log)
    db.session.commit()

    _safe_increment_quota(g.institution_id)

    # Compute deduction for this experiment
    total_hints = hints_used + 1
    deduction   = min(HINT_DEDUCTIONS.get(total_hints, HINT_MAX_DEDUCTION), HINT_MAX_DEDUCTION)

    return jsonify({
        'hint': hint_text,
        'hint_level': hint_level,
        'hints_used': total_hints,
        'deduction_pct': deduction,
        'is_fallback': is_fallback,
        'model_used': model_used,
        'latency_ms': latency_ms,
    }), 200


@ai_bp.route('/chat', methods=['POST'])
@require_auth
def help_chat():
    """Multi-turn AI help chat"""
    data          = request.get_json()
    experiment_id = data.get('experiment_id')
    messages      = data.get('messages', [])   # conversation history (last 5)
    language      = data.get('language', 'python')

    blocked = _require_institution_account()
    if blocked:
        return blocked

    if not _check_quota(g.institution_id):
        return jsonify({'error': 'Daily AI assistance limit reached.'}), 429

    experiment = Experiment.query.get(experiment_id) if experiment_id else None
    exp_title  = experiment.title if experiment else 'the experiment'
    concepts   = ', '.join(experiment.concept_tags or []) if experiment else 'programming'

    system_prompt = f"""You are a friendly programming lab teaching assistant for {exp_title}.
The student is learning about: {concepts}. Language: {language}.
Help them understand concepts — do not give direct answers or complete code.
Be encouraging. Use simple language. Ask guiding questions."""

    groq_messages = [{'role': 'system', 'content': system_prompt}]
    groq_messages.extend(messages[-10:])   # last 10 messages for context

    try:
        response, _, _, _ = guarded_ai_call(
            'chat',
            institution_id=g.institution_id,
            user_id=g.user_id,
            role=g.role,
            messages=groq_messages,
            pool=POOL_CHAT,
            max_tokens=400,
            temperature=0.5,
        )
    except AIDisabled as e:
        return jsonify({'error': str(e.reason)}), 403
    except AIQuotaExceeded as e:
        return jsonify({'error': e.reason}), 429

    _safe_increment_quota(g.institution_id)

    return jsonify({'response': response}), 200


@ai_bp.route('/viva/generate', methods=['POST'])
@require_auth
@require_role('instructor', 'institution_admin')
def generate_viva():
    """Generate viva questions specific to student's submitted code"""
    data          = request.get_json()
    student_id    = data.get('student_id')
    experiment_id = data.get('experiment_id')
    code          = data.get('code', '')
    grade_id      = data.get('grade_id')

    system_prompt = """You are an examiner conducting a technical viva.
Generate exactly 4 short-answer questions about this student's code.
Requirements:
- Questions must be answerable ONLY by someone who wrote this specific code
- Ask about their specific variable names, algorithm choices, edge cases they handled
- Do NOT ask general theory questions
- Return a JSON array: [{"question": "...", "expected_topics": ["..."]}]"""

    user_message = f"Student's submitted code:\n{code[:3000]}"

    viva_messages = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user',   'content': user_message},
    ]
    try:
        response, _, is_fallback, _ = guarded_ai_call(
            'viva_generate',
            institution_id=g.institution_id,
            user_id=g.user_id,
            role=g.role,
            messages=viva_messages,
            pool=POOL_VIVA,
            max_tokens=600,
            temperature=0.3,
        )
    except AIDisabled as e:
        return jsonify({'error': str(e.reason)}), 403
    except AIQuotaExceeded as e:
        return jsonify({'error': e.reason}), 429

    if is_fallback:
        return jsonify({'error': 'AI is temporarily unavailable (all models rate-limited). Try again in a minute.'}), 503

    # Parse questions from response
    import json, re
    try:
        json_match = re.search(r'\[.*\]', response, re.DOTALL)
        questions  = json.loads(json_match.group()) if json_match else []
    except Exception:
        questions = [{'question': response, 'expected_topics': []}]

    # Create viva session
    viva = VivaSession(
        student_id=student_id,
        experiment_id=experiment_id,
        grade_id=grade_id,
        questions=questions,
        status='active',
        started_at=datetime.utcnow()
    )
    db.session.add(viva)
    db.session.commit()

    return jsonify({'viva_session_id': viva.id, 'questions': questions}), 200


@ai_bp.route('/viva/evaluate', methods=['POST'])
@require_auth
def evaluate_viva_answer():
    """Evaluate a student's viva answer"""
    data            = request.get_json()
    viva_session_id = data.get('viva_session_id')
    question_index  = data.get('question_index', 0)
    question_text   = data.get('question')
    answer_text     = data.get('answer', '')
    code            = data.get('code', '')

    blocked = _require_institution_account()
    if blocked:
        return blocked

    system_prompt = """You are evaluating a student's viva answer.
Return ONLY valid JSON: {"score": <0-10>, "feedback": "<one sentence>"}
Score guidelines: 9-10=excellent, 7-8=good, 5-6=partial, 3-4=weak, 0-2=incorrect"""

    user_message = f"Code: {code[:1000]}\nQuestion: {question_text}\nAnswer: {answer_text}"

    eval_messages = [
        {'role': 'system', 'content': system_prompt},
        {'role': 'user',   'content': user_message},
    ]
    try:
        response, _, _, _ = guarded_ai_call(
            'viva_evaluate',
            institution_id=g.institution_id,
            user_id=g.user_id,
            role=g.role,
            messages=eval_messages,
            pool=POOL_HINTS,
            max_tokens=80,
            temperature=0.3,
        )
    except AIDisabled as e:
        # Governance must win: return the error, don't store a fabricated score.
        return jsonify({'error': str(e.reason)}), 403
    except AIQuotaExceeded as e:
        return jsonify({'error': e.reason, 'quota': e.quota, 'used': e.used}), 429

    import json, re
    try:
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        result     = json.loads(json_match.group()) if json_match else {'score': 5, 'feedback': 'Evaluated'}
    except Exception:
        result = {'score': 5, 'feedback': 'Could not evaluate automatically'}

    # Store answer
    answer = VivaAnswer(
        viva_session_id=viva_session_id,
        question_index=question_index,
        question_text=question_text,
        answer_text=answer_text,
        score=result.get('score', 5),
        ai_feedback=result.get('feedback', ''),
        submitted_at=datetime.utcnow()
    )
    db.session.add(answer)
    db.session.commit()

    return jsonify(result), 200


@ai_bp.route('/viva/<viva_session_id>/finish', methods=['POST'])
@require_auth
@require_role('instructor', 'institution_admin')
def finish_viva(viva_session_id):
    """
    Finish a viva session: compute average score → update Grade.viva_grade → recalculate final.
    Called by instructor after all questions are evaluated.
    """
    viva = VivaSession.query.filter_by(id=viva_session_id).first_or_404()

    if viva.status == 'completed':
        return jsonify({'error': 'Viva already completed'}), 400

    answers = VivaAnswer.query.filter_by(viva_session_id=viva_session_id).all()
    if not answers:
        return jsonify({'error': 'No answers submitted yet'}), 400

    # Average score of all answers (scale 0–10 → 0–100)
    avg_score = sum(a.score or 0 for a in answers) / len(answers)
    total_score_pct = round(avg_score * 10, 1)   # convert 0–10 → 0–100

    viva.total_score  = total_score_pct
    viva.status       = 'completed'
    viva.completed_at = datetime.utcnow()
    db.session.flush()

    # Push to Grade and recalculate final
    if viva.grade_id:
        from app.models.grading import Grade as GradeModel
        from app.models.experiment import Experiment as ExpModel
        grade = GradeModel.query.get(viva.grade_id)
        if grade and not grade.is_locked:
            grade.viva_grade = total_score_pct
            exp = ExpModel.query.get(viva.experiment_id)
            if exp:
                rubric = {
                    'test_cases':   exp.rubric_test_cases,
                    'lab_report':   exp.rubric_lab_report,
                    'code_quality': exp.rubric_code_quality,
                    'viva':         exp.rubric_viva,
                }
                grade.calculate_final(rubric)

    db.session.commit()

    return jsonify({
        'viva_session_id': viva_session_id,
        'status':          'completed',
        'total_score_pct': total_score_pct,
        'answers_scored':  len(answers),
    }), 200


@ai_bp.route('/viva/<viva_session_id>', methods=['GET'])
@require_auth
def get_viva_session(viva_session_id):
    """Get full viva session record with all answers and scores."""
    viva    = VivaSession.query.filter_by(id=viva_session_id).first_or_404()
    answers = VivaAnswer.query.filter_by(
        viva_session_id=viva_session_id
    ).order_by(VivaAnswer.question_index).all()

    return jsonify({
        'id':            viva.id,
        'student_id':    viva.student_id,
        'experiment_id': viva.experiment_id,
        'status':        viva.status,
        'total_score':   viva.total_score,
        'questions':     viva.questions,
        'started_at':    viva.started_at.isoformat() if viva.started_at else None,
        'completed_at':  viva.completed_at.isoformat() if viva.completed_at else None,
        'answers': [{
            'question_index': a.question_index,
            'question_text':  a.question_text,
            'answer_text':    a.answer_text,
            'score':          a.score,
            'ai_feedback':    a.ai_feedback,
        } for a in answers],
    }), 200


# ══ Compiler playground assistant ════════════════════════════════════════════
# Standalone code help for the student Compiler page. Deliberately separate from
# /hint: there is no experiment, no HintLog row and no grade deduction, because
# playground work is not assessed. Same "guide, never solve" pedagogy applies.

_ASSIST_RULES = (
    "STRICT RULES:\n"
    "- Never output the corrected program, a complete function, or a full code block.\n"
    "- At most one single-line fragment, and only if it is unavoidable.\n"
    "- Plain text only. No markdown headings, no fenced code.\n"
    "- Be specific about line numbers and identifiers you can see in their code."
)

_ASSIST_MODES = {
    'hint': {
        'max_tokens': 220,
        'prompt': (
            "You are a programming tutor sitting beside a student in a platform-practice "
            "code playground. They want a nudge, not the answer.\n"
            "Point at the weakest part of their logic, or — if there is an error "
            "message — name its likely cause and the line to inspect.\n"
            f"{_ASSIST_RULES}\n- Maximum 700 characters."
        ),
    },
    'explain_error': {
        'max_tokens': 300,
        'prompt': (
            "You explain compiler and runtime errors to students in plain language.\n"
            "Structure your answer as: (1) one line translating the error into plain "
            "English, (2) the exact line or token at fault if the message names one, "
            "(3) the general class of mistake that produces it.\n"
            f"{_ASSIST_RULES}\n- Maximum 900 characters."
        ),
    },
    'review': {
        'max_tokens': 340,
        'prompt': (
            "You are a lab instructor reviewing a student's program.\n"
            "Give at most 4 bullet points, each starting with '- ', in priority order: "
            "correctness risks and unhandled edge cases, readability and naming, "
            "efficiency, then idiomatic style. Praise one thing if it is genuinely good.\n"
            f"{_ASSIST_RULES}\n- Maximum 900 characters."
        ),
    },
    'ask': {
        'max_tokens': 360,
        'prompt': (
            "You are a friendly programming tutor answering a student's question about "
            "the code they are writing in a practice playground.\n"
            "Answer the question directly and concretely, then stop.\n"
            f"{_ASSIST_RULES}\n- Maximum 900 characters."
        ),
    },
}


@ai_bp.route('/code-assist', methods=['POST'])
@require_auth
@limiter.limit("12 per 5 minutes")
def code_assist():
    """
    Playground code help. mode = hint | explain_error | review | ask.
    Requires no experiment and never affects a grade.
    """
    blocked = _require_institution_account()
    if blocked:
        return blocked
    data     = request.get_json(silent=True) or {}
    mode     = (data.get('mode') or 'hint').strip().lower()
    code     = (data.get('code') or '').strip()
    language = (data.get('language') or 'python').strip()
    error    = (data.get('error') or '').strip()
    stdout   = (data.get('stdout') or '').strip()
    question = (data.get('question') or '').strip()

    spec = _ASSIST_MODES.get(mode)
    if not spec:
        return jsonify({'error': f"mode must be one of: {', '.join(_ASSIST_MODES)}"}), 400
    if not code:
        return jsonify({'error': 'No code to look at yet — write something first.'}), 400
    if mode == 'explain_error' and not error:
        return jsonify({'error': 'No error output to explain — run the code first.'}), 400
    if mode == 'ask' and not question:
        return jsonify({'error': 'Type a question first.'}), 400

    if not _check_quota(g.institution_id):
        return jsonify({'error': 'Daily AI assistance limit reached. Resets at midnight.'}), 429

    # Trim from the front: the tail of a file and the tail of an error trace are
    # where the interesting bits live.
    parts = [f"Language: {language}"]
    if question:
        parts.append(f"Student's question: {question[:400]}")
    if error:
        parts.append(f"Error / diagnostics:\n{error[-1200:]}")
    if stdout:
        parts.append(f"Program output:\n{stdout[-500:]}")
    parts.append(f"Code:\n{code[-4000:]}")

    assist_messages = [
        {'role': 'system', 'content': spec['prompt']},
        {'role': 'user',   'content': '\n\n'.join(parts)},
    ]

    try:
        answer, model_used, is_fallback, _ = guarded_ai_call(
            'code_assist',
            institution_id=g.institution_id,
            user_id=g.user_id,
            role=g.role,
            messages=assist_messages,
            pool=POOL_HINTS,
            max_tokens=spec['max_tokens'],
            temperature=0.3,
        )
    except AIDisabled as e:
        return jsonify({'error': str(e.reason)}), 403
    except AIQuotaExceeded as e:
        return jsonify({'error': e.reason}), 429

    start = time.time()
    latency_ms = 0  # gate measures internally

    _safe_increment_quota(g.institution_id)

    return jsonify({
        'mode':        mode,
        'answer':      answer,
        'language':    language,
        'is_fallback': is_fallback,
        'model_used':  model_used,
        'latency_ms':  latency_ms,
    }), 200


def _safe_increment_quota(institution_id):
    """Quota bookkeeping must never cost the student an answer they already got."""
    if not institution_id:
        return
    try:
        _increment_quota(institution_id)
    except Exception:
        db.session.rollback()
        current_app.logger.warning('[ai] quota increment failed', exc_info=True)


# ── Groq helpers ────────────────────────────────────────────────────────────

def _call_groq(system_prompt: str, user_message: str, pool: str, max_tokens: int = 200):
    """Single-turn Groq call with automatic model rotation on rate limits."""
    from app.ai.groq_client import groq_single
    text, model, is_fallback, _ = groq_single(
        user_message, pool=pool, system_prompt=system_prompt,
        max_tokens=max_tokens, temperature=0.3
    )
    if text is None:
        return _get_fallback_hint(), None, True
    return text, model, is_fallback


def _call_groq_messages(messages: list, pool: str, max_tokens: int = 400):
    """Multi-turn Groq call with automatic model rotation on rate limits."""
    from app.ai.groq_client import groq_chat
    text, model, is_fallback, _ = groq_chat(
        messages, pool=pool, max_tokens=max_tokens, temperature=0.5
    )
    if text is None:
        return "I'm temporarily unavailable. Please try again in a moment.", None, True
    return text, model, is_fallback


def _get_fallback_hint() -> str:
    """Generic fallback when Groq is unavailable"""
    return ("AI hints are temporarily unavailable. "
            "Review your logic carefully: check loop conditions, "
            "variable initialization, and edge cases.")


def _check_quota(institution_id: str) -> bool:
    """
    True when the caller may still use Groq today.

    Two meters:
      - institution users: legacy request-count meter (`groq_usage`, seeded by
        database/init.sql) + the token quota the AI gate enforces on top.
      - platform-direct users (platform_user / any caller without an institution):
        counted from AIUsageLog against PlatformConfig `platform_user_daily_ai_calls`
        (default 10/day). Previously `None` institution short-circuited to
        always-allow — platform users consumed AI with no meter at all.

    Fails **open** on meter-read failures so the AI tutor never goes down with
    the counter.
    """
    from datetime import date, datetime
    if not institution_id:
        # ── Platform-user meter (per-user, from the usage log we already write) ──
        try:
            from app.models.institution import PlatformConfig
            from app.models.ai_usage import AIUsageLog
            from sqlalchemy import func
            limit = int(PlatformConfig.get('platform_user_daily_ai_calls', 10))
            day_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            used = db.session.query(func.count(AIUsageLog.id)).filter(
                AIUsageLog.user_id == g.user_id,
                AIUsageLog.created_at >= day_start,
            ).scalar() or 0
            return used < limit
        except Exception:
            current_app.logger.warning('[ai] platform-user quota lookup failed; allowing request', exc_info=True)
            return True
    from datetime import date
    from app.extensions import db
    from sqlalchemy import text
    from sqlalchemy.exc import SQLAlchemyError
    today = date.today().isoformat()
    try:
        result = db.session.execute(
            text("SELECT count FROM groq_usage WHERE institution_id = :iid AND usage_date = :date"),
            {'iid': institution_id, 'date': today}
        ).fetchone()
    except SQLAlchemyError:
        db.session.rollback()
        current_app.logger.warning('[ai] quota lookup failed; allowing request', exc_info=True)
        return True
    limit = current_app.config['GROQ_DAILY_LIMIT_PER_INSTITUTION']
    return (result is None) or (result[0] < limit)


def _require_institution_account():
    """
    Lab AI features (hints, chat, code-assist, viva, explain) exist inside
    institution labs only. Platform-direct accounts have no lab experiments —
    returning 403 also closes the cost/content-leak hole where a platform user
    could hint/assist against someone else's experiment id.
    Returns None when the caller is fine, else a (response, status) tuple.
    """
    if not getattr(g, 'institution_id', None):
        return jsonify({'error': 'Lab AI features require an institution account. '
                                 'Use the Practice Library instead.'}), 403
    return None


def _increment_quota(institution_id: str):
    """Increment Groq usage counter for institution"""
    if not institution_id:
        return               # no meter to move, and NULL breaks the ON CONFLICT key
    from datetime import date
    from app.extensions import db
    from sqlalchemy import text
    today = date.today().isoformat()
    db.session.execute(text("""
        INSERT INTO groq_usage (institution_id, usage_date, count)
        VALUES (:iid, :date, 1)
        ON CONFLICT (institution_id, usage_date)
        DO UPDATE SET count = groq_usage.count + 1
    """), {'iid': institution_id, 'date': today})
    db.session.commit()


# ══════════════════════════════════════════════════════════════════════════════
# P5 — Topic Explainer (institution-gated, no code context)
# ══════════════════════════════════════════════════════════════════════════════

@ai_bp.route('/explain-topic', methods=['POST'])
@require_auth
@limiter.limit("6 per minute")
def explain_topic():
    """
    General topic explanation for students — no code context, no cheating.
    Institution-gated via guarded_ai_call (same policy as hints).
    Explains the concept, its real-world use, and common pitfalls.
    """
    blocked = _require_institution_account()
    if blocked:
        return blocked
    data = request.get_json(silent=True) or {}
    topic = (data.get('topic') or '').strip()
    if not topic:
        return jsonify({'error': 'Provide a topic to explain.'}), 400

    system_prompt = (
        "You are a knowledgeable lab tutor. Explain the given topic as if "
        "teaching a first-year university student.\n\n"
        "Structure your answer:\n"
        "1. What it is (plain language, one sentence)\n"
        "2. How it works (the core idea, ~2-3 sentences)\n"
        "3. Real-world example where it's used\n"
        "4. Common mistakes beginners make\n\n"
        "STRICT RULES:\n"
        "- Do NOT write code, pseudocode, or algorithms.\n"
        "- Do NOT solve any specific problem or assignment.\n"
        "- If the topic is unrelated to computer science or engineering, "
        "say 'I can only explain technical topics.'\n"
        "- Maximum 600 characters."
    )

    try:
        text, model, is_fallback, usage = guarded_ai_call(
            feature='chat',
            institution_id=getattr(g, 'institution_id', None),
            user_id=getattr(g, 'user_id', None),
            role=getattr(g, 'role', 'student'),
            messages=[
                {'role': 'system', 'content': system_prompt},
                {'role': 'user', 'content': f'Explain: {topic}'},
            ],
            pool='fast',
            max_tokens=400,
            temperature=0.4,
        )
    except AIDisabled as e:
        return jsonify({'error': str(e)}), 403
    except AIQuotaExceeded as e:
        return jsonify({'error': str(e)}), 429

    if not text:
        text = "I'm temporarily unavailable. Please try again in a moment."

    return jsonify({
        'explanation': text,
        'model_used': model,
        'is_fallback': is_fallback,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# P4 — Agentic AI (WS-D)
# ══════════════════════════════════════════════════════════════════════════════

@ai_bp.route('/agent/query', methods=['POST'])
@require_auth
@require_role('institution_admin')
@limiter.limit("6 per minute")
def agent_query():
    """
    Natural-language agent for the Institution Admin dashboard.

    Accepts a prompt, runs the agent loop (plan → call whitelisted tools →
    synthesise), persists the AIAgentRun, and returns the result.
    """
    import json
    data   = request.get_json(silent=True) or {}
    prompt = (data.get('prompt') or '').strip()

    if not prompt:
        return jsonify({'error': 'prompt is required'}), 400
    if len(prompt) > 2000:
        return jsonify({'error': 'prompt must be 2000 characters or fewer'}), 400

    from app.ai.agent import run_agent, AIDisabled as AgentAIDisabled, AIQuotaExceeded as AgentQuotaExceeded
    from app.models.ai_usage import AIAgentRun

    try:
        result = run_agent(
            prompt=prompt,
            institution_id=g.institution_id,
            user_id=g.user_id,
            role=g.role,
        )
    except AgentAIDisabled as e:
        return jsonify({'error': str(e.reason)}), 403
    except AgentQuotaExceeded as e:
        return jsonify({'error': e.reason}), 429

    # Persist the run
    run_row = AIAgentRun(
        institution_id=g.institution_id,
        user_id=g.user_id,
        prompt=prompt,
        tool_calls=json.dumps(result.get('tool_calls', []), default=str),
        result=result.get('answer', ''),
        total_tokens=result.get('total_tokens', 0),
        status=result.get('status', 'completed'),
    )
    db.session.add(run_row)
    db.session.commit()

    from app.institution.audit import write_audit
    write_audit(g.user_id, g.institution_id, 'agent_query', 'agent_run',
                run_row.id, f'Agent run: {prompt[:80]}')

    out = run_row.to_dict()
    out['pending_action'] = result.get('pending_action')
    return jsonify(out), 201


@ai_bp.route('/agent/runs', methods=['GET'])
@require_auth
@require_role('institution_admin')
def agent_runs():
    """
    List agent runs for this institution, newest first.
    ?page=&per_page=  (default 1, 20)
    """
    from app.models.ai_usage import AIAgentRun

    page     = int(request.args.get('page', 1))
    per_page = min(int(request.args.get('per_page', 20)), 100)

    q = AIAgentRun.query.filter_by(institution_id=g.institution_id)
    total = q.count()
    runs  = q.order_by(AIAgentRun.created_at.desc()).paginate(
        page=page, per_page=per_page, error_out=False,
    )
    return jsonify({
        'total':   total,
        'page':    page,
        'pages':   runs.pages,
        'per_page': per_page,
        'runs':    [r.to_dict() for r in runs.items],
    }), 200


@ai_bp.route('/agent/runs/<run_id>', methods=['GET'])
@require_auth
@require_role('institution_admin')
def agent_run_detail(run_id):
    """Get one agent run with full tool_calls + pending action hint."""
    from app.models.ai_usage import AIAgentRun

    run = AIAgentRun.query.filter_by(id=run_id, institution_id=g.institution_id).first()
    if not run:
        return jsonify({'error': 'Run not found'}), 404

    out = run.to_dict()
    # If the run is pending_confirm, reconstruct the pending action from tool_calls
    if run.status == 'pending_confirm':
        import json
        calls = json.loads(run.tool_calls) if run.tool_calls else []
        for c in calls:
            if c.get('tool') == 'draft_announcement':
                outer = c.get('result', {}) if isinstance(c.get('result'), dict) else {}
                draft = outer.get('draft') if isinstance(outer, dict) else None
                if draft:
                    out['pending_action'] = {'tool': 'draft_announcement', 'payload': draft}
                    break
    return jsonify(out), 200


@ai_bp.route('/agent/runs/<run_id>/apply', methods=['POST'])
@require_auth
@require_role('institution_admin')
def agent_apply(run_id):
    """
    Confirm and apply a pending action from a previous agent run.

    Currently only supports `draft_announcement` — the draft is applied through
    the shared core of the existing `POST /api/institution/announcements/targeted`
    endpoint, so the same permission, tenancy and audit logic applies.
    """
    import json
    from app.models.ai_usage import AIAgentRun

    run = AIAgentRun.query.filter_by(id=run_id, institution_id=g.institution_id).first()
    if not run:
        return jsonify({'error': 'Run not found'}), 404
    if run.status != 'pending_confirm':
        return jsonify({'error': 'Run is not pending confirmation'}), 400

    # Reconstruct draft from tool_calls
    calls = json.loads(run.tool_calls) if run.tool_calls else []
    draft = None
    for c in calls:
        if c.get('tool') == 'draft_announcement':
            outer = c.get('result', {}) if isinstance(c.get('result'), dict) else {}
            if isinstance(outer, dict):
                draft = outer.get('draft')
            break
    if not draft:
        return jsonify({'error': 'No draft announcement found in this run'}), 400

    # Apply via the shared core of POST /institution/announcements/targeted —
    # same tenancy filters, notification fan-out, socket emission and audit row
    # as a direct admin call, without an HTTP round trip. Runs inside this
    # admin's own request context, so g.user_id / g.institution_id apply.
    from app.institution.routes import _send_targeted_announcement
    from werkzeug.exceptions import HTTPException

    try:
        payload, status = _send_targeted_announcement(draft)
    except HTTPException as exc:
        payload, status = {'error': exc.description or 'Invalid announcement target'}, exc.code or 400
    if status >= 300:
        return jsonify(payload), status

    # Mark run as completed
    run.status = 'completed'
    db.session.commit()

    from app.institution.audit import write_audit
    write_audit(g.user_id, g.institution_id, 'agent_apply', 'announcement',
                run_id, f'Applied draft from run {run_id}')

    return jsonify({
        'success': True,
        'sent_to': payload.get('sent_to'),
        'target':  payload.get('target'),
        'run_id':  run_id,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
def _generate_smart_fallback_title(prompt: str) -> str:
    """Generate a clean 3-5 word title from the user prompt by removing conversational boilerplate."""
    cleaned = (prompt or '').strip().rstrip('?.!')
    prefixes = [
        'give me a markdown table of ', 'give me a markdown table comparing ', 'give me a markdown table on ',
        'give me a table of ', 'give me a table comparing ', 'give me a ', 'give me ',
        'compare ', 'comparison between ', 'comparison of ',
        'what are the ', 'what is the ', 'what lab sessions are ', 'what are ', 'what is ',
        'which students are at risk or ', 'which students are at risk ', 'which students are ',
        'can you give me ', 'can you show me ', 'can you tell me ', 'can you ',
        'please provide ', 'please show ', 'please give ', 'please ',
        'show me ', 'tell me about ', 'tell me ', 'who consumed the most '
    ]
    lower = cleaned.lower()
    for p in prefixes:
        if lower.startswith(p):
            cleaned = cleaned[len(p):].strip()
            break
    words = [w for w in cleaned.split() if w]
    if not words:
        words = [w for w in prompt.split() if w]
    return ' '.join(words[:4]).title()


@ai_bp.route('/chat/sessions', methods=['GET'])
@ai_bp.route('/harness/sessions', methods=['GET'])
@require_auth
def list_chat_sessions():
    """List all AI Harness chat sessions for the authenticated user across any role, pinned first."""
    from app.models.admin_copilot import AdminChatSession
    q = AdminChatSession.query.filter_by(user_id=g.user_id)
    if g.institution_id:
        q = q.filter(
            (AdminChatSession.institution_id == g.institution_id) |
            (AdminChatSession.institution_id.is_(None))
        )
    sessions = q.order_by(
        AdminChatSession.is_pinned.desc(),
        AdminChatSession.updated_at.desc()
    ).all()
    return jsonify({'sessions': [s.to_dict() for s in sessions]}), 200


@ai_bp.route('/chat/sessions', methods=['POST'])
@ai_bp.route('/harness/sessions', methods=['POST'])
@require_auth
def create_chat_session():
    """Create a new AI Harness conversation thread for any authenticated role."""
    from app.models.admin_copilot import AdminChatSession
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip() or 'New Conversation'
    mode = data.get('mode') or 'chat'
    from app.models.user import User
    current_user = User.query.get(g.user_id)
    if not current_user:
        return jsonify({'error': 'User account not found or session expired. Please log in again.'}), 401

    session = AdminChatSession(
        institution_id=g.institution_id or current_user.institution_id,
        user_id=current_user.id,
        role_scope=current_user.role or g.role or 'student',
        title=title,
        mode=mode,
        page_context=page_context,
    )
    db.session.add(session)
    db.session.commit()
    return jsonify({'session': session.to_dict(include_last_message=False)}), 201


@ai_bp.route('/chat/sessions/<session_id>', methods=['GET'])
@ai_bp.route('/harness/sessions/<session_id>', methods=['GET'])
@require_auth
def get_chat_session(session_id):
    """Get full message history for a specific chat thread owned by the authenticated user."""
    from app.models.admin_copilot import AdminChatSession, AdminChatMessage
    session = AdminChatSession.query.filter_by(
        id=session_id,
        user_id=g.user_id,
    ).first()
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    messages = session.messages.order_by(AdminChatMessage.created_at.asc()).all()
    return jsonify({
        'session': session.to_dict(),
        'messages': [m.to_dict() for m in messages],
    }), 200


@ai_bp.route('/chat/sessions/<session_id>', methods=['PATCH'])
@ai_bp.route('/harness/sessions/<session_id>', methods=['PATCH'])
@require_auth
def update_chat_session(session_id):
    """Rename, pin/unpin, or update live page_context on a chat session."""
    from app.models.admin_copilot import AdminChatSession
    session = AdminChatSession.query.filter_by(
        id=session_id,
        user_id=g.user_id,
    ).first()
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    data = request.get_json(silent=True) or {}
    if 'title' in data:
        session.title = (data['title'] or '').strip()[:255] or session.title
    if 'is_pinned' in data:
        session.is_pinned = bool(data['is_pinned'])
    if 'page_context' in data and isinstance(data['page_context'], dict):
        session.page_context = data['page_context']
    session.updated_at = datetime.utcnow()
    db.session.commit()
    return jsonify({'session': session.to_dict()}), 200


@ai_bp.route('/chat/sessions/<session_id>', methods=['DELETE'])
@ai_bp.route('/harness/sessions/<session_id>', methods=['DELETE'])
@require_auth
def delete_chat_session(session_id):
    """Delete a chat session and all its messages."""
    from app.models.admin_copilot import AdminChatSession
    session = AdminChatSession.query.filter_by(
        id=session_id,
        user_id=g.user_id,
    ).first()
    if not session:
        return jsonify({'error': 'Session not found'}), 404

    db.session.delete(session)
    db.session.commit()
    return jsonify({'success': True, 'deleted_id': session_id}), 200


@ai_bp.route('/chat/message', methods=['POST'])
@ai_bp.route('/harness/message', methods=['POST'])
@require_auth
@limiter.limit("20 per minute")
def send_chat_message():
    """
    Unified Multi-Role AI Harness messaging endpoint (supports all 5 roles:
    student, platform_user, instructor, institution_admin, admin).
    Accepts:
      - session_id: optional (creates new if missing)
      - prompt: string (required)
      - mode: 'chat' | 'agent' (default 'chat')
      - doc_id: optional string (target document for RAG)
      - web_search: optional bool
      - page_context: optional dict (active route, experiment_id, problem_slug, code, error)
    """
    import json
    from app.models.admin_copilot import AdminChatSession, AdminChatMessage
    from app.ai.harness import run_harness_turn, maybe_compact_session_memory
    from app.ai.gate import AIDisabled as AgentAIDisabled, AIQuotaExceeded as AgentQuotaExceeded
    from app.models.ai_usage import AIAgentRun

    data = request.get_json(silent=True) or {}
    prompt = (data.get('prompt') or '').strip()
    mode = data.get('mode') or 'chat'
    doc_id = data.get('doc_id')
    web_search = bool(data.get('web_search', False))
    session_id = data.get('session_id')
    page_context = data.get('page_context') if isinstance(data.get('page_context'), dict) else {}

    # Students and Platform Users are always in Socratic 'chat' mode (cannot execute administrative agent mutations)
    if g.role in ('student', 'platform_user'):
        mode = 'chat'

    if not prompt:
        return jsonify({'error': 'prompt is required'}), 400
    if len(prompt) > 4000:
        return jsonify({'error': 'prompt must be 4000 characters or fewer'}), 400

    session = None
    if session_id:
        session = AdminChatSession.query.filter_by(
            id=session_id,
            user_id=g.user_id,
        ).first()

    from app.models.user import User
    current_user = User.query.get(g.user_id)
    if not current_user:
        return jsonify({'error': 'User account not found or session expired. Please log in again.'}), 401

    inst_id = g.institution_id or current_user.institution_id

    if not session:
        title = _generate_smart_fallback_title(prompt)
        session = AdminChatSession(
            institution_id=inst_id,
            user_id=current_user.id,
            role_scope=current_user.role or g.role or 'student',
            title=title or 'New Chat',
            mode=mode,
            page_context=page_context,
        )
        db.session.add(session)
        db.session.flush()
    elif page_context or mode:
        if mode:
            session.mode = mode
        if page_context:
            merged_ctx = dict(session.page_context or {})
            merged_ctx.update(page_context)
            session.page_context = merged_ctx

    # Record User Message
    user_msg = AdminChatMessage(
        session_id=session.id,
        role='user',
        content=prompt,
        mode=mode,
    )
    db.session.add(user_msg)
    db.session.flush()

    # Fetch recent history for multi-turn context
    recent_msgs = session.messages.order_by(AdminChatMessage.created_at.desc()).limit(7).all()
    history = [{'role': m.role, 'content': m.content} for m in reversed(recent_msgs) if m.id != user_msg.id]

    try:
        harness_result = run_harness_turn(
            prompt=prompt,
            institution_id=g.institution_id,
            user_id=g.user_id,
            role=g.role,
            mode=mode,
            doc_id=doc_id,
            web_search_enabled=web_search,
            chat_history=history,
            page_context=session.page_context or page_context,
            compact_memory=session.compact_memory,
            session_id=session.id,
        )
    except AgentAIDisabled as e:
        db.session.rollback()
        return jsonify({'error': str(e.reason)}), 403
    except AgentQuotaExceeded as e:
        db.session.rollback()
        return jsonify({'error': e.reason}), 429

    # Record Assistant Message
    assistant_msg = AdminChatMessage(
        session_id=session.id,
        role='assistant',
        content=harness_result.get('answer', ''),
        mode=mode,
        tool_calls=harness_result.get('tool_calls', []),
        pending_action=harness_result.get('pending_action'),
        sources=harness_result.get('sources', []),
        generated_doc=harness_result.get('generated_doc'),
        socratic_filtered=bool(harness_result.get('socratic_filtered', False)),
        total_tokens=harness_result.get('total_tokens', 0),
    )
    db.session.add(assistant_msg)

    # Log to AIAgentRun if institution_id is present
    run_id = None
    if g.institution_id:
        try:
            run_row = AIAgentRun(
                institution_id=g.institution_id,
                user_id=g.user_id,
                prompt=prompt,
                tool_calls=json.dumps(harness_result.get('tool_calls', []), default=str),
                result=harness_result.get('answer', ''),
                total_tokens=harness_result.get('total_tokens', 0),
                status=harness_result.get('status', 'completed'),
            )
            db.session.add(run_row)
            db.session.flush()
            run_id = run_row.id
        except Exception:
            pass

    session.updated_at = datetime.utcnow()
    session.mode = mode

    # Auto-compact memory when conversation reaches threshold
    maybe_compact_session_memory(session, g.institution_id, g.user_id, g.role)

    # Smart title generation after first exchange
    msg_count = session.messages.count()
    needs_smart_title = (
        msg_count <= 2 or
        session.title.endswith('...') or
        session.title in ('New Chat', 'New Conversation')
    )
    if needs_smart_title:
        ai_title_applied = False
        try:
            from app.ai.gate import guarded_ai_call
            title_text, _, is_fb, _ = guarded_ai_call(
                'chat' if g.role in ('student', 'platform_user') else 'agent',
                institution_id=g.institution_id,
                user_id=g.user_id,
                role=g.role,
                messages=[
                    {'role': 'system', 'content': 'Generate a concise 3 to 5 word title summarizing this user request. Reply ONLY with the title. Do not include quotes or punctuation at the end.'},
                    {'role': 'user', 'content': f"User prompt: {prompt[:250]}"},
                ],
                pool='fast',
                max_tokens=25,
                temperature=0.3,
            )
            if title_text and not is_fb:
                cleaned = title_text.strip().strip('"`').rstrip('.?!')
                if 2 < len(cleaned) <= 80 and not cleaned.lower().startswith('title:'):
                    session.title = cleaned
                    ai_title_applied = True
        except Exception as e:
            current_app.logger.warning(f"Smart title generation error: {e}")

        if not ai_title_applied:
            smart_fallback = _generate_smart_fallback_title(prompt)
            if smart_fallback:
                session.title = smart_fallback

    db.session.commit()

    return jsonify({
        'session_id': session.id,
        'session_title': session.title,
        'user_message': user_msg.to_dict(),
        'assistant_message': assistant_msg.to_dict(),
        'pending_action': harness_result.get('pending_action'),
        'generated_doc': harness_result.get('generated_doc'),
        'socratic_filtered': harness_result.get('socratic_filtered', False),
        'sources': harness_result.get('sources', []),
        'run_id': run_id,
    }), 201


@ai_bp.route('/chat/actions/execute', methods=['POST'])
@ai_bp.route('/harness/actions/execute', methods=['POST'])
@require_auth
def execute_chat_action():
    """
    Executes a confirmed pending_action for authorized roles (institution_admin, instructor, admin).
    """
    from app.ai.role_tools import execute_role_action
    from app.models.admin_copilot import AdminChatMessage

    if g.role in ('student', 'platform_user'):
        return jsonify({'error': 'Students and platform learners cannot execute administrative write actions.'}), 403

    data = request.get_json(silent=True) or {}
    action_payload = data.get('action_payload')
    message_id = data.get('message_id')

    if not action_payload or not isinstance(action_payload, dict):
        return jsonify({'error': 'action_payload object is required'}), 400

    try:
        result = execute_role_action(
            action_payload=action_payload,
            institution_id=g.institution_id,
            user_id=g.user_id,
            role=g.role,
        )

        if message_id:
            msg = AdminChatMessage.query.filter_by(id=message_id).first()
            if msg:
                msg.pending_action = None
                db.session.commit()

        return jsonify({
            'success': True,
            'result': result,
        }), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({'error': str(exc)}), 400


# ══════════════════════════════════════════════════════════════════════════════
# Multi-Format Document Management for Scoped RAG + Generated Document Downloads
# ══════════════════════════════════════════════════════════════════════════════

@ai_bp.route('/documents', methods=['GET'])
@ai_bp.route('/harness/documents', methods=['GET'])
@require_auth
def list_documents():
    """List uploaded RAG documents visible to the authenticated user."""
    from app.models.admin_copilot import InstitutionDocument
    from sqlalchemy import or_
    q = InstitutionDocument.query
    if g.institution_id:
        q = q.filter(or_(
            InstitutionDocument.institution_id == g.institution_id,
            InstitutionDocument.uploaded_by == g.user_id,
        ))
    else:
        q = q.filter(InstitutionDocument.uploaded_by == g.user_id)
    docs = q.order_by(InstitutionDocument.created_at.desc()).all()
    return jsonify({'documents': [d.to_dict() for d in docs]}), 200


@ai_bp.route('/documents/upload', methods=['POST'])
@ai_bp.route('/harness/documents/upload', methods=['POST'])
@require_auth
def upload_document():
    """
    Upload a document (.pdf, .docx, .xlsx, .csv, .md, .txt), extract text & chunks,
    and index for scoped RAG retrieval.
    """
    import os
    import uuid
    from werkzeug.utils import secure_filename
    from app.models.admin_copilot import InstitutionDocument
    from app.ai.harness import extract_multi_format_chunks, SUPPORTED_RAG_EXTENSIONS

    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file or not file.filename:
        return jsonify({'error': 'Filename is empty'}), 400

    orig_filename = secure_filename(file.filename)
    if not orig_filename.lower().endswith(SUPPORTED_RAG_EXTENSIONS):
        return jsonify({
            'error': f"Unsupported file format. Supported formats: {', '.join(SUPPORTED_RAG_EXTENSIONS)}"
        }), 400

    upload_dir = os.path.join(current_app.root_path, '..', 'uploads', 'institution_docs')
    os.makedirs(upload_dir, exist_ok=True)

    file_id = str(uuid.uuid4())
    stored_name = f"{file_id}_{orig_filename}"
    file_path = os.path.join(upload_dir, stored_name)
    file.save(file_path)
    file_size = os.path.getsize(file_path)

    try:
        chunks, page_count, doc_type = extract_multi_format_chunks(file_path, orig_filename, file_id)
    except Exception as exc:
        current_app.logger.warning("[harness.rag] parsing error for %s: %s", orig_filename, exc)
        return jsonify({'error': f'Failed to parse document: {str(exc)}'}), 400

    scope_type = request.form.get('scope_type') or ('institution' if g.role == 'institution_admin' else 'user')
    scope_id = request.form.get('scope_id') or (g.institution_id if scope_type == 'institution' else g.user_id)

    doc = InstitutionDocument(
        id=file_id,
        institution_id=g.institution_id,
        uploaded_by=g.user_id,
        scope_type=scope_type,
        scope_id=scope_id,
        doc_type=doc_type,
        filename=orig_filename,
        file_path=file_path,
        file_size=file_size,
        page_count=page_count,
        chunks=chunks,
        status='indexed',
    )
    db.session.add(doc)
    db.session.commit()

    # Index chunk embeddings for semantic retrieval (never blocks upload).
    try:
        from app.models.ai_documents import DocumentChunk
        from app.ai.rag_embeddings import embed_chunks
        chunk_texts = [c.get('text', '') for c in chunks]
        vectors = embed_chunks(chunk_texts)
        for i, (c, vec) in enumerate(zip(chunks, vectors)):
            row = DocumentChunk(
                document_id=doc.id,
                institution_id=g.institution_id,
                scope_type=scope_type,
                scope_id=scope_id,
                chunk_index=i,
                chunk_id=c.get('chunk_id', f"{file_id}_{i}"),
                text=c.get('text', ''),
                page=c.get('page'),
                embedding=vec,
            )
            db.session.add(row)
        db.session.commit()
    except Exception as exc:
        current_app.logger.warning("[harness.rag] chunk embedding skipped for %s: %s", orig_filename, exc)

    if g.institution_id and g.role == 'institution_admin':
        try:
            from app.institution.audit import write_audit
            write_audit(g.user_id, g.institution_id, 'upload_document', 'document', doc.id,
                        f"Uploaded {doc_type.upper()} '{orig_filename}' ({page_count} pages, {len(chunks)} chunks)")
        except Exception:
            pass

    return jsonify({
        'success': True,
        'document': doc.to_dict(),
        'message': f"Document '{orig_filename}' indexed with {len(chunks)} searchable chunks.",
    }), 201


@ai_bp.route('/documents/<doc_id>', methods=['DELETE'])
@ai_bp.route('/harness/documents/<doc_id>', methods=['DELETE'])
@require_auth
def delete_document(doc_id):
    """Delete an uploaded RAG document."""
    import os
    from app.models.admin_copilot import InstitutionDocument

    q = InstitutionDocument.query.filter_by(id=doc_id)
    if g.role != 'institution_admin':
        q = q.filter_by(uploaded_by=g.user_id)
    elif g.institution_id:
        q = q.filter_by(institution_id=g.institution_id)
    doc = q.first()
    if not doc:
        return jsonify({'error': 'Document not found or permission denied'}), 404

    try:
        if os.path.exists(doc.file_path):
            os.remove(doc.file_path)
    except Exception:
        pass

    try:
        from app.models.ai_documents import DocumentChunk
        DocumentChunk.query.filter_by(document_id=doc_id).delete()
        db.session.commit()
    except Exception:
        pass

    db.session.delete(doc)
    db.session.commit()
    return jsonify({'success': True, 'deleted_id': doc_id}), 200


@ai_bp.route('/generated-docs/<doc_id>/download', methods=['GET'])
@require_auth
def download_generated_document(doc_id):
    """Download an on-demand AI-generated study sheet, cheat sheet, study plan, or report."""
    import os
    import io
    from flask import send_file
    from app.models.admin_copilot import AIGeneratedDocument

    doc = AIGeneratedDocument.query.filter_by(id=doc_id).first()
    if not doc:
        return jsonify({'error': 'Generated document not found'}), 404
    if doc.user_id != g.user_id and g.role not in ('institution_admin', 'admin'):
        return jsonify({'error': 'Access denied'}), 403

    mime_map = {
        'md': 'text/markdown',
        'csv': 'text/csv',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'pdf': 'application/pdf',
        'txt': 'text/plain',
    }
    mimetype = mime_map.get(doc.format, 'application/octet-stream')
    dl_name = f"{doc.title.replace(' ', '_')}.{doc.format}"

    if doc.file_path and os.path.exists(doc.file_path):
        return send_file(doc.file_path, mimetype=mimetype, as_attachment=True, download_name=dl_name)

    # Fallback to serving content_text from DB
    buf = io.BytesIO((doc.content_text or '').encode('utf-8'))
    return send_file(buf, mimetype=mimetype, as_attachment=True, download_name=dl_name)
