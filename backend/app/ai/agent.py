"""
Agentic AI for the Institution Admin (WS-D).

Turns a natural-language prompt into a small number of *whitelisted, read-mostly*
calls against the institution's own existing API endpoints, then narrates the
result.  Nothing here invents new data access: every tool re-dispatches an
endpoint that already exists and already enforces `institution_admin` +
`g.institution_id` scoping, so the agent cannot reach another tenant or gain a
permission its caller doesn't have.

Design notes
------------
* **Tool dispatch, not tool reimplementation.** `_call_view()` clones the live
  WSGI environ, swaps in a `GET` + query string, and invokes the real view
  function inside a nested request context. The `Authorization` header rides
  along in the environ, so `@require_role('institution_admin')` re-runs and
  repopulates `g` exactly as it would for a direct HTTP call. Analytics logic
  therefore has exactly one implementation.
* **Planning via JSON, not provider tool-calling.** The planner is asked for a
  strict JSON object naming one tool. This keeps every call flowing through
  `guarded_ai_call()` (policy + quota + AIUsageLog) unchanged, and works on
  every model in the rotation pool rather than only tool-capable ones.
* **Mutations are proposals.** `draft_announcement` never sends. It returns a
  draft, the run is stored as `pending_confirm`, and the admin applies it via
  `POST /api/ai/agent/runs/<id>/apply`. Delete / force-logout / terminate are
  not exposed at all in v1.
"""
import json
import logging
import re

from flask import current_app, request, g

from app.ai.gate import guarded_ai_call, AIDisabled, AIQuotaExceeded

log = logging.getLogger(__name__)

# How many tool calls one prompt may fan out to before we force an answer.
MAX_STEPS = 3
# Tool results are fed back into the model; cap the JSON so a big analytics
# payload can't blow the context window (or the token budget).
MAX_OBSERVATION_CHARS = 3500


class AgentToolError(Exception):
    """A tool was asked for something it cannot do (bad args, unknown kind)."""


# ══════════════════════════════════════════════════════════════════════════════
# Internal endpoint dispatch
# ══════════════════════════════════════════════════════════════════════════════

def _call_view(view_func, params: dict = None):
    """
    Invoke an existing institution view function as if it were a GET request
    with `params` as the query string, and return its parsed JSON body.

    Runs inside a nested request context built from the *current* environ, so
    the caller's Authorization header — and therefore their institution scope —
    is preserved. Raises AgentToolError on a non-2xx response.
    """
    from urllib.parse import urlencode

    query = urlencode({k: v for k, v in (params or {}).items() if v not in (None, '')})

    env = request.environ.copy()
    env['REQUEST_METHOD'] = 'GET'
    env['QUERY_STRING'] = query
    # Drop the POST body: the nested view is a GET and must not read our stream.
    env.pop('wsgi.input', None)
    env['CONTENT_LENGTH'] = '0'
    env['CONTENT_TYPE'] = ''

    with current_app.request_context(env):
        result = view_func()

    # Views return either `Response` or `(Response, status)`.
    if isinstance(result, tuple):
        response, status = result[0], result[1]
    else:
        response, status = result, getattr(result, 'status_code', 200)

    body = response.get_json(silent=True) if hasattr(response, 'get_json') else None
    if status >= 300:
        raise AgentToolError((body or {}).get('error') or f'endpoint returned {status}')
    return body if body is not None else {}


# ══════════════════════════════════════════════════════════════════════════════
# Tools
# ══════════════════════════════════════════════════════════════════════════════

# kind → (module, view function name). Resolved lazily so importing this module
# never drags the institution blueprints in at app-factory time.
_ANALYTICS_VIEWS = {
    'overview':           ('app.institution.routes',   'analytics_overview'),
    'at_risk':            ('app.institution.routes',   'students_at_risk'),
    'section_comparison': ('app.institution.routes',   'section_comparison'),
    'attendance':         ('app.institution.extended', 'analytics_attendance'),
    'grades':             ('app.institution.extended', 'analytics_grades'),
    'proctoring':         ('app.institution.extended', 'analytics_proctoring'),
    'engagement':         ('app.institution.extended', 'analytics_engagement'),
    'instructors':        ('app.institution.extended', 'analytics_instructors'),
    'trends':             ('app.institution.extended', 'analytics_trends'),
    'ai_usage':           ('app.institution.extended', 'analytics_ai_usage'),
    'experiment_usage':   ('app.institution.extended', 'experiment_usage'),
}


def _resolve(dotted_module: str, func_name: str):
    import importlib
    return getattr(importlib.import_module(dotted_module), func_name)


def tool_get_analytics(kind: str = 'overview', days: int = 30, **_):
    """Read one of the institution analytics endpoints (B1–B9)."""
    entry = _ANALYTICS_VIEWS.get((kind or '').strip().lower())
    if not entry:
        raise AgentToolError(
            f"unknown analytics kind '{kind}'. Valid: {', '.join(sorted(_ANALYTICS_VIEWS))}"
        )
    try:
        days = max(1, min(int(days or 30), 365))
    except (TypeError, ValueError):
        days = 30
    return _call_view(_resolve(*entry), {'days': days})


def tool_search_users(role: str = None, q: str = None, limit: int = 20, **_):
    """Search users inside the caller's institution by name / email / roll no."""
    data = _call_view(
        _resolve('app.institution.routes', 'list_users'),
        {'role': role, 'q': q, 'page': 1, 'per_page': max(1, min(int(limit or 20), 50))},
    )
    users = data.get('users', [])
    # Trim to the fields an answer actually needs — keeps the observation small
    # and avoids feeding incidental PII-ish columns back into the model.
    return {
        'total': data.get('total', len(users)),
        'users': [{
            'id': u.get('id'), 'full_name': u.get('full_name'),
            'email': u.get('email'), 'role': u.get('role'),
            'roll_number': u.get('roll_number'), 'is_active': u.get('is_active'),
        } for u in users],
    }


def tool_list_sessions(status: str = None, days: int = 30, limit: int = 20, **_):
    """List lab sessions for this institution, newest first."""
    data = _call_view(
        _resolve('app.institution.extended', 'list_sessions'),
        {'status': status, 'days': days, 'per_page': max(1, min(int(limit or 20), 50)), 'page': 1},
    )
    sessions = data.get('sessions', data if isinstance(data, list) else [])
    return {
        'total': data.get('total', len(sessions)),
        'sessions': [{
            'id': s.get('id'), 'title': s.get('title'), 'status': s.get('status'),
            'scheduled_at': s.get('scheduled_at'),
            'subject_name': s.get('subject_name'), 'section_name': s.get('section_name'),
            'instructor_name': s.get('instructor_name'),
            'student_count': s.get('student_count'),
        } for s in sessions],
    }


def tool_explain_at_risk_students(limit: int = 10, **_):
    """Compose at-risk mastery, grade distribution and attendance into one view."""
    out = {}
    for key, kind in (('at_risk', 'at_risk'), ('grades', 'grades'), ('attendance', 'attendance')):
        try:
            out[key] = tool_get_analytics(kind=kind, days=30)
        except AgentToolError as exc:
            out[key] = {'error': str(exc)}
    students = (out.get('at_risk') or {}).get('at_risk_students') or []
    out['at_risk'] = {
        'threshold': (out.get('at_risk') or {}).get('threshold'),
        'count': len(students),
        'students': students[:max(1, min(int(limit or 10), 50))],
    }
    return out


def tool_draft_announcement(target: str = 'all', title: str = '', message: str = '',
                            department_id: str = None, batch_id: str = None,
                            section_id: str = None, academic_year=None, **_):
    """
    Compose an announcement draft. **Never sends.** The returned payload is what
    `POST /api/ai/agent/runs/<id>/apply` will forward to the existing
    `/institution/announcements/targeted` endpoint once the admin confirms.
    """
    title = (title or '').strip()
    message = (message or '').strip()
    if not title or not message:
        raise AgentToolError('draft_announcement needs both a title and a message')
    if target not in ('all', 'students', 'instructors'):
        target = 'all'

    payload = {'target': target, 'title': title, 'message': message}
    for key, val in (('department_id', department_id), ('batch_id', batch_id),
                     ('section_id', section_id), ('academic_year', academic_year)):
        if val:
            payload[key] = val

    # Tell the admin how many people this would reach, without sending anything.
    recipients = None
    try:
        users = _call_view(_resolve('app.institution.routes', 'list_users'),
                           {'role': None if target == 'all' else target[:-1]})
        recipients = users.get('total')
    except AgentToolError:
        pass

    return {
        'draft': payload,
        'estimated_recipients': recipients,
        'requires_confirmation': True,
        'note': 'Nothing has been sent. The admin must confirm this draft.',
    }


# name → (callable, one-line description, arg spec shown to the planner)
TOOLS = {
    'get_analytics': (
        tool_get_analytics,
        'Read an institution analytics report.',
        {'kind': f"one of: {', '.join(sorted(_ANALYTICS_VIEWS))}", 'days': 'integer, default 30'},
    ),
    'search_users': (
        tool_search_users,
        'Find students or instructors in this institution.',
        {'role': "'student' | 'instructor' | omit for any", 'q': 'name/email/roll search text',
         'limit': 'integer, max 50'},
    ),
    'list_sessions': (
        tool_list_sessions,
        'List lab sessions with subject, section and instructor names.',
        {'status': "'scheduled' | 'live' | 'ended' | 'cancelled' | omit for any",
         'days': 'integer, default 30', 'limit': 'integer, max 50'},
    ),
    'explain_at_risk_students': (
        tool_explain_at_risk_students,
        'Combined at-risk mastery + grades + attendance picture.',
        {'limit': 'integer, how many students to include'},
    ),
    'draft_announcement': (
        tool_draft_announcement,
        'Compose an announcement draft for admin confirmation. Does NOT send.',
        {'target': "'all' | 'students' | 'instructors'", 'title': 'string', 'message': 'string',
         'department_id': 'optional', 'batch_id': 'optional', 'section_id': 'optional',
         'academic_year': 'optional integer'},
    ),
}

# Tools whose result is a proposal awaiting human confirmation.
CONFIRM_TOOLS = {'draft_announcement'}


def _tool_catalog() -> str:
    lines = []
    for name, (_fn, desc, spec) in TOOLS.items():
        args = ', '.join(f'{k}: {v}' for k, v in spec.items())
        lines.append(f'- {name}({args})\n    {desc}')
    return '\n'.join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# Planner / synthesis prompts
# ══════════════════════════════════════════════════════════════════════════════

_PLANNER_SYSTEM = """You are the planning step of an assistant for a university \
Institution Admin dashboard. You do not answer the user directly; you decide \
which single tool to call next.

Available tools:
{catalog}

Reply with ONE JSON object and nothing else. Two valid shapes:
  {{"tool": "<tool name>", "args": {{...}}}}   — call a tool
  {{"tool": null, "reason": "<why no tool is needed>"}}  — you have enough information

Rules:
- Never invent a tool name or an argument name.
- Prefer one tool call. Only ask for another if the previous observation is genuinely insufficient.
- All data is already scoped to this admin's own institution; never ask for another institution.
- If the user wants to notify people, use draft_announcement — it only drafts, it never sends."""

_ANSWER_SYSTEM = """You are an assistant for a university Institution Admin dashboard.

Answer the admin's question using ONLY the tool observations provided. Rules:
- Lead with the direct answer, then the supporting numbers.
- Quote real figures from the observations. Never estimate or invent a number.
- If an observation is empty or zero, say the data isn't there yet rather than implying a finding.
- Plain text. Short paragraphs or '- ' bullets. No markdown headings, no code fences.
- Under 1200 characters.
- If a draft announcement was produced, summarise it and state clearly that nothing has been sent \
and the admin must confirm it."""


def _extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model reply. Returns {} on failure."""
    if not text:
        return {}
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group())
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


def _truncate(obj) -> str:
    blob = json.dumps(obj, default=str)
    if len(blob) <= MAX_OBSERVATION_CHARS:
        return blob
    return blob[:MAX_OBSERVATION_CHARS] + '… (truncated)'


# ══════════════════════════════════════════════════════════════════════════════
# Run loop
# ══════════════════════════════════════════════════════════════════════════════

def run_agent(prompt: str, institution_id: str, user_id: str, role: str) -> dict:
    """
    Plan → call tools → answer. Returns a dict ready to persist as an AIAgentRun
    and to hand back to the client:

        {status, answer, tool_calls: [{tool, args, result|error}], total_tokens,
         pending_action: {...} | None}

    Raises AIDisabled / AIQuotaExceeded straight through from the gate so the
    route can map them to 403 / 429.
    """
    tool_calls = []
    total_tokens = 0
    pending_action = None

    planner_history = [
        {'role': 'system', 'content': _PLANNER_SYSTEM.format(catalog=_tool_catalog())},
        {'role': 'user', 'content': prompt},
    ]

    for _step in range(MAX_STEPS):
        text, _model, is_fallback, usage = guarded_ai_call(
            'agent',
            institution_id=institution_id, user_id=user_id, role=role,
            messages=planner_history, pool='quality', max_tokens=320, temperature=0.1,
        )
        total_tokens += (usage or {}).get('total_tokens', 0)

        if is_fallback or not text:
            break

        plan = _extract_json(text)
        tool_name = plan.get('tool')
        if not tool_name:
            break

        entry = TOOLS.get(tool_name)
        if not entry:
            # Tell the planner it hallucinated and let it retry within budget.
            planner_history.append({'role': 'assistant', 'content': text})
            planner_history.append({
                'role': 'user',
                'content': f"There is no tool named '{tool_name}'. Choose one of: "
                           f"{', '.join(TOOLS)}.",
            })
            continue

        fn = entry[0]
        args = plan.get('args') if isinstance(plan.get('args'), dict) else {}

        try:
            result = fn(**args)
            call_record = {'tool': tool_name, 'args': args, 'result': result}
            if tool_name in CONFIRM_TOOLS:
                pending_action = {'tool': tool_name, 'payload': result.get('draft')}
        except AgentToolError as exc:
            call_record = {'tool': tool_name, 'args': args, 'error': str(exc)}
        except Exception as exc:                       # noqa: BLE001 — tool must not 500 the run
            log.warning('[ai.agent] tool %s failed: %s', tool_name, exc)
            call_record = {'tool': tool_name, 'args': args, 'error': 'tool execution failed'}

        tool_calls.append(call_record)

        planner_history.append({'role': 'assistant', 'content': text})
        planner_history.append({
            'role': 'user',
            'content': f'Observation from {tool_name}:\n{_truncate(call_record.get("result") or call_record.get("error"))}\n\n'
                       'Call another tool only if this is genuinely insufficient, '
                       'otherwise reply {"tool": null}.',
        })

        if pending_action:
            break   # a proposal is terminal — the admin decides next

    # ── Synthesis ────────────────────────────────────────────────────────────
    observations = '\n\n'.join(
        f'{c["tool"]} → ' + _truncate(c.get('result') if 'result' in c else {'error': c.get('error')})
        for c in tool_calls
    ) or '(no tools were called — answer from general knowledge of the dashboard, ' \
         'and say plainly if you do not have the data)'

    answer, _model, is_fallback, usage = guarded_ai_call(
        'agent',
        institution_id=institution_id, user_id=user_id, role=role,
        messages=[
            {'role': 'system', 'content': _ANSWER_SYSTEM},
            {'role': 'user', 'content': f'Admin question: {prompt}\n\nTool observations:\n{observations}'},
        ],
        pool='quality', max_tokens=520, temperature=0.3,
    )
    total_tokens += (usage or {}).get('total_tokens', 0)

    if is_fallback or not answer:
        answer = ('The AI models are all rate-limited right now, so I could not write up an answer. '
                  'The raw tool results are included below.')

    return {
        'status': 'pending_confirm' if pending_action else 'completed',
        'answer': answer,
        'tool_calls': tool_calls,
        'total_tokens': total_tokens,
        'pending_action': pending_action,
    }
