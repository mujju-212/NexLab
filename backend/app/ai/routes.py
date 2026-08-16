"""
AI Blueprint — Groq API integration
Handles: AI hints, help chat, viva question generation, viva answer evaluation
"""
import time
from flask import Blueprint, request, jsonify, current_app, g
from app.auth.utils import require_auth, require_role
from app.extensions import db, limiter
from app.models.grading import HintLog, VivaSession, VivaAnswer
from app.models.experiment import Experiment
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

    # ── Check Groq quota ──────────────────────────────────────────────────
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

    # ── Call Groq (auto-rotates models on rate limits) ───────────────────
    start_time = time.time()
    hint_text, model_used, is_fallback = _call_groq(system_prompt, user_message, POOL_HINTS, max_tokens=120)
    latency_ms = int((time.time() - start_time) * 1000)

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

    response, _, _ = _call_groq_messages(groq_messages, POOL_CHAT, max_tokens=400)
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
    response, _, is_fallback = _call_groq(system_prompt, user_message, POOL_VIVA, max_tokens=600)

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

    system_prompt = """You are evaluating a student's viva answer.
Return ONLY valid JSON: {"score": <0-10>, "feedback": "<one sentence>"}
Score guidelines: 9-10=excellent, 7-8=good, 5-6=partial, 3-4=weak, 0-2=incorrect"""

    user_message = f"Code: {code[:1000]}\nQuestion: {question_text}\nAnswer: {answer_text}"
    response, _, _ = _call_groq(system_prompt, user_message, POOL_HINTS, max_tokens=80)

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
            "You are a programming tutor sitting beside a student in a free-practice "
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

    start = time.time()
    answer, model_used, is_fallback = _call_groq(
        spec['prompt'], '\n\n'.join(parts), POOL_HINTS, max_tokens=spec['max_tokens']
    )
    latency_ms = int((time.time() - start) * 1000)

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
    text, model, is_fallback = groq_single(
        user_message, pool=pool, system_prompt=system_prompt,
        max_tokens=max_tokens, temperature=0.3
    )
    if text is None:
        return _get_fallback_hint(), None, True
    return text, model, is_fallback


def _call_groq_messages(messages: list, pool: str, max_tokens: int = 400):
    """Multi-turn Groq call with automatic model rotation on rate limits."""
    from app.ai.groq_client import groq_chat
    text, model, is_fallback = groq_chat(
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
    True when the institution may still call Groq today.

    Fails **open**: `groq_usage` is created by database/init.sql rather than by a
    migration, so a database that was set up another way simply has no counter.
    Losing the meter must not take the AI tutor down with it.
    """
    if not institution_id:
        return True          # platform-level users have no institution meter
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
