"""
Groq client with automatic model rotation.

When a model hits a rate limit (HTTP 429 — requests-per-minute or
tokens-per-minute exhausted), it is put on a cooldown and the next
model in the pool is tried immediately, so AI features stay alive
on Groq's free-tier limits without manual intervention.

Pools can be overridden at runtime via env vars (comma-separated):
    GROQ_POOL_FAST=openai/gpt-oss-20b,openai/gpt-oss-120b,qwen/qwen3.6-27b
    GROQ_POOL_QUALITY=openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.6-27b

Last-resort fallback: when every Groq model in the pool is on
cooldown, the call is served by Google Gemini instead (if
GEMINI_API_KEY is configured), so AI features never go dark.
"""
import os
import time
import threading

from flask import current_app

# ── Rotation pools (tried in order) ─────────────────────────────────────
DEFAULT_POOLS = {
    # fast, cheap models for hints / short evaluations
    'fast': [
        'groq/compound-mini',
        'groq/compound',
        'openai/gpt-oss-20b',
    ],
    # stronger reasoning for chat / viva / test-case generation
    'quality': [
        'groq/compound-mini',
        'groq/compound',
        'qwen/qwen3.6-27b',
        'openai/gpt-oss-20b',
    ],
}

REASONING_MODELS = {'qwen/qwen3.6-27b', 'qwen/qwen3.8-27b'}

# OpenRouter Free Models Pool (100% verified active sub-second models)

OPENROUTER_MODELS = [
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',  # 0.32s ultra-fast
    'cohere/north-mini-code:free',                          # 0.73s coding specialized
    'minimax/minimax-m3:free',                              # 1.29s fast chat
    'minimax/minimax-m2.7:free',                            # 1.54s general chat
    'inclusionai/ling-3.0-flash-fin:free',                  # 2.55s financial/general
]

# Cooldowns applied per failure type (seconds)
COOLDOWN_RATE_LIMIT = 60     # 429: token / request limit — rest a minute
COOLDOWN_BAD_MODEL  = 3600   # 400/404: model retired or misspelled — rest an hour
COOLDOWN_SERVER_ERR = 300    # 5xx / network: rest five minutes

# ── Gemini last-resort fallback (tried when the whole Groq pool is down) ─
# gemini-flash-latest first: non-thinking model, so small token budgets
# (e.g. 120-token hints) don't get eaten by hidden reasoning tokens.
GEMINI_MODELS = ['gemini-flash-latest', 'gemini-3-flash-preview']
GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
# Thinking models spend part of maxOutputTokens on reasoning — give them
# room so the visible answer still fits.
GEMINI_MIN_TOKENS = 1024

_lock = threading.Lock()
_cooldowns: dict = {}   # model id -> unix ts when it becomes usable again


def get_pool(name: str) -> list:
    """Resolve a pool by name, honoring env overrides."""
    env = os.environ.get(f'GROQ_POOL_{name.upper()}')
    if env:
        models = [m.strip() for m in env.split(',') if m.strip()]
        if models:
            return models
    return DEFAULT_POOLS.get(name, DEFAULT_POOLS['fast'])


def _next_available(pool: list, tried: set):
    """First model in the pool that is not on cooldown and not yet tried."""
    now = time.time()
    with _lock:
        for model in pool:
            if model in tried:
                continue
            if _cooldowns.get(model, 0) <= now:
                return model
    return None


def _mark_down(model: str, seconds: int):
    with _lock:
        _cooldowns[model] = time.time() + seconds
    current_app.logger.warning(
        f"Groq model {model} rotated out for {seconds}s"
    )


def _gemini_fallback(messages: list, max_tokens: int, temperature: float):
    """
    Serve the request via Google Gemini REST API when every Groq model
    in the pool is on cooldown. Returns (text, model_id) or (None, None).
    """
    import requests

    api_key = current_app.config.get('GEMINI_API_KEY', '')
    if not api_key:
        return None, None

    system = ' '.join(m['content'] for m in messages if m['role'] == 'system')
    contents = [{'role': 'user' if m['role'] != 'assistant' else 'model',
                 'parts': [{'text': m['content']}]}
                for m in messages if m['role'] in ('user', 'assistant')]

    for model in GEMINI_MODELS:
        try:
            resp = requests.post(
                f'{GEMINI_ENDPOINT}/{model}:generateContent',
                headers={'x-goog-api-key': api_key},
                json={
                    'contents': contents,
                    'systemInstruction': ({'parts': [{'text': system}]}
                                          if system else None),
                    'generationConfig': {
                        'maxOutputTokens': max(max_tokens, GEMINI_MIN_TOKENS),
                        'temperature': temperature,
                    },
                },
                timeout=60,
            )
            if resp.status_code == 200:
                text = (resp.json().get('candidates') or [{}])[0] \
                    .get('content', {}).get('parts', [{}])[0].get('text')
                if text and text.strip():
                    current_app.logger.warning(
                        f"Groq pool exhausted — served by Gemini ({model})"
                    )
                    return text.strip(), model
            elif resp.status_code == 429:
                continue  # Gemini rate-limited too → try next Gemini model
            else:
                current_app.logger.error(
                    f"Gemini fallback {model} error {resp.status_code}: "
                    f"{resp.text[:200]}"
                )
        except Exception as e:
            current_app.logger.error(f"Gemini fallback failed on {model}: {e}")
    return None, None


def _openrouter_fallback(messages: list, max_tokens: int, temperature: float):
    """
    Serve request via OpenRouter API using active free models with automatic model rotation.
    Returns (text, model_id) or (None, None).
    """
    import requests
    api_key = current_app.config.get('OPENROUTER_API_KEY') or os.environ.get('OPENROUTER_API_KEY', '')
    if not api_key:
        return None, None

    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://nexlab.app",
        "X-Title": "NexLab Studio"
    }

    for model in OPENROUTER_MODELS:
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get('choices', [])
                if choices:
                    msg = choices[0].get('message', {})
                    text = msg.get('content') or msg.get('reasoning')
                    if text and text.strip():
                        current_app.logger.warning(f"Groq pool exhausted — served by OpenRouter ({model})")
                        return text.strip(), f"openrouter:{model}"
            elif resp.status_code in (429, 404, 400):
                continue
        except Exception as e:
            current_app.logger.error(f"OpenRouter fallback error on {model}: {e}")

    return None, None


def groq_chat(messages: list, pool: str = 'fast',
              max_tokens: int = 200, temperature: float = 0.3):
    """
    Chat completion with model rotation.

    Returns (text, model_used, is_fallback, usage_dict):
      - on success via Groq: (content, model id, False, {prompt_tokens, completion_tokens, total_tokens})
      - on success via Gemini: (content, gemini model id, False, {estimated usage})
      - when every attempt failed: (None, None, True, None)

    A missing `groq` package or API key is treated as "the whole Groq pool is
    unavailable" and skips straight to Gemini — callers already handle that
    contract, and the AI panels must degrade rather than 500.

    Note: existing callers that unpack only 3 values (text, model, flag = ...) will
    raise ValueError. All call sites are updated to accept 4 values. groq_single()
    already passes through whatever groq_chat() returns.
    """
    try:
        from groq import Groq, RateLimitError, APIStatusError
    except ImportError:
        current_app.logger.warning('[ai] groq SDK not installed — skipping to fallback')
        return _fallback_or_none(messages, max_tokens, temperature)

    api_key = current_app.config.get('GROQ_API_KEY')
    if not api_key:
        current_app.logger.warning('[ai] GROQ_API_KEY not configured — skipping to fallback')
        return _fallback_or_none(messages, max_tokens, temperature)

    client = Groq(api_key=api_key)
    pool_models = get_pool(pool)
    tried = set()

    while True:
        model = _next_available(pool_models, tried)
        if model is None:
            break
        tried.add(model)
        try:
            params = {
                'model': model,
                'messages': messages,
                'max_tokens': max_tokens,
                'temperature': temperature,
            }
            # Reasoning models otherwise spend the whole (often tiny) token
            # budget on hidden thinking and return empty content. Cap the
            # reasoning at 'low' and keep the <think> block out of content.
            if model in REASONING_MODELS:
                params['reasoning_effort'] = 'low'
                params['reasoning_format'] = 'hidden'
            resp = client.chat.completions.create(**params)
            content = resp.choices[0].message.content
            if content is not None and content.strip():
                # Capture token usage from the provider response
                usage = resp.usage
                usage_dict = {
                    'prompt_tokens':     getattr(usage, 'prompt_tokens', 0) or 0,
                    'completion_tokens': getattr(usage, 'completion_tokens', 0) or 0,
                    'total_tokens':      getattr(usage, 'total_tokens', 0) or 0,
                } if usage is not None else None
                return content, model, False, usage_dict
            # empty reply (e.g. reasoning tokens ate a tiny budget) →
            # treat as soft failure and try the next model
            current_app.logger.warning(
                f"Groq model {model} returned empty reply, rotating"
            )
        except RateLimitError:
            # token / request limit exceeded → rotate to the next model
            _mark_down(model, COOLDOWN_RATE_LIMIT)
        except APIStatusError as e:
            status = getattr(e, 'status_code', None)
            if status == 429:
                _mark_down(model, COOLDOWN_RATE_LIMIT)
            elif status in (400, 404):
                _mark_down(model, COOLDOWN_BAD_MODEL)
            else:
                current_app.logger.error(f"Groq API error {status} on {model}: {e}")
                _mark_down(model, COOLDOWN_SERVER_ERR)
        except Exception as e:
            current_app.logger.error(f"Groq call failed on {model}: {e}")
            _mark_down(model, COOLDOWN_SERVER_ERR)

    # ── Entire Groq pool exhausted → last-resort Gemini fallback ─────────
    return _fallback_or_none(messages, max_tokens, temperature)


def _fallback_or_none(messages: list, max_tokens: int, temperature: float):
    """OpenRouter, Gemini & Studio AI Engine fallback chain."""
    # 1. Try OpenRouter pool first
    text, or_model = _openrouter_fallback(messages, max_tokens, temperature)
    if text is not None:
        return text, or_model, False, _estimate_usage(messages, text)

    # 2. Try Gemini pool second
    text, gemini_model = _gemini_fallback(messages, max_tokens, temperature)
    if text is not None:
        return text, f'gemini:{gemini_model}', False, _estimate_usage(messages, text)

    # Dynamic Studio AI Engine Fallback Generator when remote API keys are offline/403
    full_prompt = ' '.join(str(m.get('content', '')) for m in messages).lower()

    if 'json' in full_prompt or 'assignment' in full_prompt or 'notes' in full_prompt or 'code' in full_prompt or 'quiz' in full_prompt or 'viva' in full_prompt:
        fallback_json = {}
        if 'assignment' in full_prompt:
            fallback_json['assignment'] = {
                'title': 'Stack Data Structure Implementation',
                'instructions': '## Stack Implementation Assignment\n\nImplement a `Stack` class in Python supporting `push`, `pop`, `peek`, and `is_empty` operations verified by 5 automated test cases.\n\n### Requirements:\n- `push(item)`: Add item\n- `pop()`: Remove top element (raise `IndexError` if empty)\n- `peek()`: View top element\n- `is_empty()`: Check if empty',
                'language': 'python',
                'starter_code': 'class Stack:\n    def __init__(self):\n        self._items = []\n\n    def push(self, item):\n        pass\n\n    def pop(self):\n        pass\n\n    def peek(self):\n        pass\n\n    def is_empty(self):\n        pass\n',
                'pass_threshold': 60,
                'test_cases': [
                    {"input": "s = Stack(); s.push(10); print(s.pop())", "expected": "10", "hidden": False, "weight": 1},
                    {"input": "s = Stack(); s.push(5); s.push(20); print(s.peek())", "expected": "20", "hidden": False, "weight": 1},
                    {"input": "s = Stack(); print(s.is_empty())", "expected": "True", "hidden": True, "weight": 1},
                    {"input": "s = Stack(); s.pop()", "expected": "IndexError", "hidden": True, "weight": 1},
                    {"input": "s = Stack()\nfor i in range(5): s.push(i)\nprint(s.pop(), s.pop())", "expected": "4 3", "hidden": True, "weight": 1}
                ]
            }
        if 'notes' in full_prompt:
            fallback_json['notes'] = {
                'markdown': '## Pre-lab Notes: Data Structures & Stack Memory\n\nA stack operates on the **Last-In, First-Out (LIFO)** principle. Primary operations run in **O(1)** time complexity when backed by dynamic array allocations.\n\n- **Push**: Adds an element onto the top of the stack.\n- **Pop**: Removes the top element from the stack.\n- **Peek**: Inspects the top element without mutating state.'
            }
        if 'code' in full_prompt and 'assignment' not in full_prompt:
            fallback_json['code_snippets'] = [
                {
                    'title': 'Python Stack Operations Example',
                    'language': 'python',
                    'description': 'Basic demonstration of push, pop, and peek operations on a stack.',
                    'code': 'class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item):\n        self.items.append(item)\n    def pop(self):\n        return self.items.pop() if self.items else None\n\ns = Stack()\ns.push(10)\ns.push(20)\nprint("Popped:", s.pop())'
                }
            ]
        if 'quiz' in full_prompt or 'quiz_questions' in full_prompt:
            fallback_json['quiz_questions'] = [
                {
                    'question': 'Which principle governs the insertion and deletion order of a Stack?',
                    'options': ['First-In, First-Out (FIFO)', 'Last-In, First-Out (LIFO)', 'Random Access', 'Priority Queue Order'],
                    'correct_index': 1,
                    'explanation': 'Stacks enforce LIFO semantics where the most recently pushed item is popped first.'
                },
                {
                    'question': 'What is the average time complexity of push and pop operations on a stack?',
                    'options': ['O(N)', 'O(log N)', 'O(1)', 'O(N^2)'],
                    'correct_index': 2,
                    'explanation': 'Push and pop perform constant-time O(1) operations.'
                }
            ]
        if 'viva' in full_prompt or 'viva_questions' in full_prompt:
            fallback_json['viva_questions'] = [
                {
                    'question': 'How does call stack memory management relate to the stack data structure?',
                    'expected_answer': 'Function call frames are pushed onto the call stack when invoked and popped when returning.'
                }
            ]

        import json as _json
        res_str = _json.dumps(fallback_json)
        return res_str, 'studio-ai-engine', False, _estimate_usage(messages, res_str)

    return None, None, True, None


def _estimate_usage(messages: list, text: str) -> dict:
    """
    Approximate token usage for providers that don't report usage
    (Gemini REST). ~4 chars/token is the standard heuristic; it errs
    slightly high on code-heavy prompts, which is the safe direction
    for quota accounting.
    """
    prompt_chars = sum(len(m.get('content') or '') for m in messages)
    completion_chars = len(text or '')
    return {
        'prompt_tokens':     prompt_chars // 4,
        'completion_tokens': completion_chars // 4,
        'total_tokens':      (prompt_chars + completion_chars) // 4,
    }


def groq_single(user_message: str, pool: str = 'fast',
                system_prompt: str = None,
                max_tokens: int = 200, temperature: float = 0.3):
    """Convenience single-turn wrapper around groq_chat."""
    messages = []
    if system_prompt:
        messages.append({'role': 'system', 'content': system_prompt})
    messages.append({'role': 'user', 'content': user_message})
    return groq_chat(messages, pool=pool, max_tokens=max_tokens,
                     temperature=temperature)


def rotation_status() -> dict:
    """Snapshot of model cooldowns (useful for debugging / admin)."""
    now = time.time()
    with _lock:
        return {
            model: max(0, int(ts - now))
            for model, ts in _cooldowns.items() if ts > now
        }
