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
        'openai/gpt-oss-20b',       # primary: 9 reasoning tokens at low effort
        'openai/gpt-oss-120b',
        'qwen/qwen3.6-27b',
        'llama-3.1-8b-instant',     # kept as future fallback; will 404 until key gains access
        'llama-3.3-70b-versatile',
    ],
    # stronger reasoning for chat / viva / test-case generation
    'quality': [
        'openai/gpt-oss-120b',      # primary: stronger reasoning, still low-effort-capable
        'openai/gpt-oss-20b',
        'qwen/qwen3.6-27b',
        'llama-3.3-70b-versatile',  # kept as future fallback
        'llama-3.1-8b-instant',
    ],
}

# Models that accept OpenAI-style reasoning controls.  Sending these params
# to non-reasoning models (e.g. llama, qwen) triggers a 400 error, so they
# are only included when the selected model is in this set.
# reasoning_effort=low caps internal thinking tokens; reasoning_format=hidden
# keeps the <think> block out of the visible content field.
REASONING_MODELS = frozenset({
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-safeguard-20b',
})

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


def groq_chat(messages: list, pool: str = 'fast',
              max_tokens: int = 200, temperature: float = 0.3):
    """
    Chat completion with model rotation.

    Returns (text, model_used, is_fallback, usage_dict):
      - on success via Groq: (content, model id, False, {prompt_tokens, completion_tokens, total_tokens})
      - on success via Gemini: (content, gemini model id, False, None)  # Gemini REST has no usage field
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
    """Gemini last resort, normalised to groq_chat's 4-tuple contract."""
    text, gemini_model = _gemini_fallback(messages, max_tokens, temperature)
    if text is not None:
        return text, f'gemini:{gemini_model}', False, None  # Gemini REST has no token usage field
    return None, None, True, None


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
