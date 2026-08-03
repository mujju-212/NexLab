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

# Groq model selection
MODEL_HINTS = 'gemma2-9b-it'          # fast, generous free tier
MODEL_CHAT  = 'llama-3.3-70b-versatile'  # better reasoning for chat
MODEL_VIVA  = 'llama-3.3-70b-versatile'  # code-specific questions need quality

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

    # ── Call Groq ─────────────────────────────────────────────────────────
    start_time = time.time()
    hint_text, is_fallback = _call_groq(system_prompt, user_message, MODEL_HINTS, max_tokens=120)
    latency_ms = int((time.time() - start_time) * 1000)

    # ── Log hint ──────────────────────────────────────────────────────────
    log = HintLog(
        student_id=g.user_id,
        experiment_id=experiment_id,
        session_id=session_id,
        hint_level=hint_level,
        prompt_sent=f"{system_prompt}\n---\n{user_message}",
        response_received=hint_text,
        model_used=MODEL_HINTS,
        latency_ms=latency_ms,
        is_fallback=is_fallback
    )
    db.session.add(log)
    db.session.commit()

    _increment_quota(g.institution_id)

    # Compute deduction for this experiment
    total_hints = hints_used + 1
    deduction   = min(HINT_DEDUCTIONS.get(total_hints, HINT_MAX_DEDUCTION), HINT_MAX_DEDUCTION)

    return jsonify({
        'hint': hint_text,
        'hint_level': hint_level,
        'hints_used': total_hints,
        'deduction_pct': deduction,
        'is_fallback': is_fallback,
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

    response, _ = _call_groq_messages(groq_messages, MODEL_CHAT, max_tokens=400)
    _increment_quota(g.institution_id)

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
    response, _ = _call_groq(system_prompt, user_message, MODEL_VIVA, max_tokens=600)

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
    response, _ = _call_groq(system_prompt, user_message, MODEL_HINTS, max_tokens=80)

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


# ── Groq helpers ────────────────────────────────────────────────────────────

def _call_groq(system_prompt: str, user_message: str, model: str, max_tokens: int = 200):
    """Single-turn Groq call with retry and fallback"""
    from groq import Groq, RateLimitError
    client = Groq(api_key=current_app.config['GROQ_API_KEY'])

    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {'role': 'system', 'content': system_prompt},
                    {'role': 'user',   'content': user_message}
                ],
                max_tokens=max_tokens,
                temperature=0.3
            )
            return resp.choices[0].message.content, False
        except RateLimitError:
            if attempt < 2:
                time.sleep(10)
            else:
                return _get_fallback_hint(), True
        except Exception as e:
            current_app.logger.error(f"Groq call failed: {e}")
            if attempt == 2:
                return _get_fallback_hint(), True
            time.sleep(2)

    return _get_fallback_hint(), True


def _call_groq_messages(messages: list, model: str, max_tokens: int = 400):
    """Multi-turn Groq call"""
    from groq import Groq
    client = Groq(api_key=current_app.config['GROQ_API_KEY'])
    try:
        resp = client.chat.completions.create(
            model=model, messages=messages, max_tokens=max_tokens, temperature=0.5
        )
        return resp.choices[0].message.content, False
    except Exception as e:
        current_app.logger.error(f"Groq chat failed: {e}")
        return "I'm temporarily unavailable. Please try again in a moment.", True


def _get_fallback_hint() -> str:
    """Generic fallback when Groq is unavailable"""
    return ("AI hints are temporarily unavailable. "
            "Review your logic carefully: check loop conditions, "
            "variable initialization, and edge cases.")


def _check_quota(institution_id: str) -> bool:
    """Check if institution has Groq quota remaining today"""
    from datetime import date
    from app.extensions import db
    from sqlalchemy import text
    today = date.today().isoformat()
    result = db.session.execute(
        text("SELECT count FROM groq_usage WHERE institution_id = :iid AND usage_date = :date"),
        {'iid': institution_id, 'date': today}
    ).fetchone()
    limit = current_app.config['GROQ_DAILY_LIMIT_PER_INSTITUTION']
    return (result is None) or (result[0] < limit)


def _increment_quota(institution_id: str):
    """Increment Groq usage counter for institution"""
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
