"""
Groq client with automatic model rotation.

When a model hits a rate limit (HTTP 429 — requests-per-minute or
tokens-per-minute exhausted), it is put on a cooldown and the next
model in the pool is tried immediately, so AI features stay alive
on Groq's free-tier limits without manual intervention.

Pools can be overridden at runtime via env vars (comma-separated):
    GROQ_POOL_FAST=openai/gpt-oss-20b,openai/gpt-oss-120b,qwen/qwen3.6-27b
    GROQ_POOL_QUALITY=openai/gpt-oss-120b,openai/gpt-oss-20b,qwen/qwen3.6-27b

When the primary provider is unavailable, calls rotate through Groq and then
configured OpenRouter and Gemini fallbacks. If every configured provider is
unavailable, the client returns no answer; callers must handle that explicitly.
"""
import os
import time
import threading

from flask import current_app

# ── Rotation pools (tried in order) ─────────────────────────────────────
DEFAULT_POOLS = {
    # fast, cheap models for hints / short evaluations
    'fast': [
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
    ],
    # stronger reasoning for chat / viva / test-case generation
    'quality': [
        'qwen/qwen3.8-27b',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
    ],
}

# Models that accept `reasoning_format` on Groq. Groq's API rejects the
# `reasoning_effort` kwarg for these (their error suggests `reasoning_format`
# instead), so only the format flag is sent here.
REASONING_MODELS = {'qwen/qwen3.8-27b'}
# Models that additionally accept `reasoning_effort`.
REASONING_EFFORT_MODELS = set()

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


def _openrouter_fallback(messages: list, max_tokens: int, temperature: float,
                         json_mode: bool = False, reasoning_effort: str = None):
    """
    Serve request via OpenRouter API using active free models with automatic model rotation.
    Returns (text, model_id) or (None, None).

    json_mode=True forces the response to be a single JSON object (used for the
    planner and content-generation calls, which parse strict JSON).
    reasoning_effort caps hidden/visible thinking on reasoning models; 'low'
    cuts long generations roughly in half without hurting document quality.
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

    # Connect fast, but allow long generations (experiment-suite content can be
    # several thousand tokens on free models) without a read-timeout kill.
    models = list(OPENROUTER_MODELS)
    if max_tokens >= 2000:
        # Big generations: try the fast non-reasoning models first. The free
        # reasoning model spends most of the budget on hidden thinking and can
        # take many minutes for a single large JSON document.
        models = [m for m in models if 'reasoning' not in m] + \
                 [m for m in models if 'reasoning' in m]
    read_timeout = 120 if max_tokens >= 2000 else 45
    for model in models:
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        effort = reasoning_effort or ('low' if json_mode else None)
        if effort:
            payload["reasoning"] = {"effort": effort}
        try:
            resp = requests.post(url, headers=headers, json=payload, timeout=(10, read_timeout))
            if resp.status_code == 200:
                data = resp.json()
                choices = data.get('choices', [])
                if choices:
                    msg = choices[0].get('message', {})
                    text = msg.get('content') or msg.get('reasoning')
                    if text and text.strip():
                        current_app.logger.warning(f"Groq pool exhausted — served by OpenRouter ({model})")
                        return text.strip(), f"openrouter:{model}"
                else:
                    current_app.logger.warning(f"OpenRouter {model} returned 200 with no choices")
            elif resp.status_code == 429:
                current_app.logger.warning(f"OpenRouter {model} rate-limited (429); trying next model")
            elif resp.status_code in (404, 400):
                current_app.logger.warning(f"OpenRouter {model} unavailable (HTTP {resp.status_code}); trying next model")
        except Exception as e:
            current_app.logger.error(f"OpenRouter fallback error on {model}: {e}")

    return None, None


# ═══ Primary provider: DeepSeek-V4 via api.hcnsec.cn (OpenAI-compatible) ═══
# Tried FIRST on every call — the free Groq pool rotates/empties under real
# load and OpenRouter free-tier is the last resort, so the paid-capable
# DeepSeek endpoint is the reliable spine of the chain.

DEEPSEEK_BASE_URL = os.environ.get('DEEPSEEK_BASE_URL', 'https://api.hcnsec.cn/v1')
# Never embed a provider credential in source. If missing, the DeepSeek leg is skipped.
DEEPSEEK_API_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
DEEPSEEK_MODEL_FAST = os.environ.get('DEEPSEEK_MODEL_FAST', 'DeepSeek-V4-Flash')
DEEPSEEK_MODEL_QUALITY = os.environ.get('DEEPSEEK_MODEL_QUALITY', 'DeepSeek-V4-Pro')
# Fail over promptly when this endpoint stalls; the prior 90-second wait made
# browser requests time out before the configured fallback providers could reply.
DEEPSEEK_TIMEOUT_SECONDS = max(5, int(os.environ.get('DEEPSEEK_TIMEOUT_SECONDS', '15')))


def deepseek_chat(messages: list, pool: str = 'fast', max_tokens: int = 1200,
                   temperature: float = 0.4):
    """
    Primary engine. Returns the groq_chat contract:
    (content, model_id, is_fallback, usage_dict) or (None, None, True, None)
    when unavailable — the caller then continues down the chain.
    """
    import requests as _rq
    if not DEEPSEEK_API_KEY or not DEEPSEEK_BASE_URL:
        return None, None, True, None
    model = DEEPSEEK_MODEL_QUALITY if pool == 'quality' else DEEPSEEK_MODEL_FAST
    # Small calls fail over fast; large generations (planner context, content
    # authoring) legitimately need a longer read window on a slow-but-healthy
    # endpoint, so scale the read timeout with the requested output size while
    # keeping a hard bound when the endpoint is truly stalled.
    read_timeout = DEEPSEEK_TIMEOUT_SECONDS
    if max_tokens >= 1500:
        # Large generations need a longer window on a slow-but-healthy endpoint,
        # but the floor is capped so a stalled endpoint still fails over quickly.
        read_timeout = max(read_timeout, 20)
    try:
        resp = _rq.post(
            f'{DEEPSEEK_BASE_URL.rstrip("/")}/chat/completions',
            headers={'Authorization': f'Bearer {DEEPSEEK_API_KEY}',
                     'Content-Type': 'application/json'},
            json={'model': model, 'messages': messages,
                  'max_tokens': max_tokens, 'temperature': temperature},
            timeout=(10, read_timeout),
        )
        if resp.status_code != 200:
            current_app.logger.warning(
                '[ai] DeepSeek-V4 %s HTTP %s — falling through', model, resp.status_code)
            return None, None, True, None
        data = resp.json()
        choice = (data.get('choices') or [{}])[0]
        content = ((choice.get('message') or {}).get('content') or '').strip()
        if not content:
            return None, None, True, None
        usage = data.get('usage') or {}
        usage_dict = {
            'prompt_tokens': usage.get('prompt_tokens', 0) or 0,
            'completion_tokens': usage.get('completion_tokens', 0) or 0,
            'total_tokens': usage.get('total_tokens', 0) or 0,
        }
        return content, f'deepseek/{model}', False, usage_dict
    except Exception as exc:
        current_app.logger.warning('[ai] DeepSeek-V4 call failed: %s — falling through', exc)
        return None, None, True, None


def groq_chat(messages: list, pool: str = 'fast',
              max_tokens: int = 200, temperature: float = 0.3,
              json_mode: bool = False, reasoning_effort: str = None):
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
    # 1. Primary: DeepSeek-V4 (paid-capable, large context)
    ds_content, ds_model, ds_fb, ds_usage = deepseek_chat(
        messages, pool=pool, max_tokens=max_tokens, temperature=temperature)
    if ds_content:
        return ds_content, ds_model, ds_fb, ds_usage

    # 2. Groq pool, then OpenRouter fallback
    try:
        from groq import Groq, RateLimitError, APIStatusError
    except ImportError:
        current_app.logger.warning('[ai] groq SDK not installed — skipping to fallback')
        return _fallback_or_none(messages, max_tokens, temperature,
                                 json_mode=json_mode, reasoning_effort=reasoning_effort)

    api_key = current_app.config.get('GROQ_API_KEY')
    if not api_key:
        current_app.logger.warning('[ai] GROQ_API_KEY not configured — skipping to fallback')
        return _fallback_or_none(messages, max_tokens, temperature,
                                 json_mode=json_mode, reasoning_effort=reasoning_effort)

    client = Groq(api_key=api_key)
    pool_models = get_pool(pool)
    tried = set()

    while True:
        model = _next_available(pool_models, tried)
        if model is None:
            break
        tried.add(model)
        # Two attempts: if the model rejects the reasoning params (400),
        # retry the SAME model once without them instead of rotating it out.
        for _attempt in range(2):
            try:
                params = {
                    'model': model,
                    'messages': messages,
                    'max_tokens': max_tokens,
                    'temperature': temperature,
                }
                if _attempt == 0:
                    # Reasoning models otherwise spend the whole (often tiny)
                    # token budget on hidden thinking and return empty content.
                    # Keep the <think> block out of content.
                    if model in REASONING_MODELS:
                        params['reasoning_format'] = 'hidden'
                    if model in REASONING_EFFORT_MODELS:
                        params['reasoning_effort'] = 'low'
                resp = client.chat.completions.create(**params)
                msg_obj = resp.choices[0].message
                content = getattr(msg_obj, 'content', None) or ''
                if not content.strip() and getattr(msg_obj, 'reasoning_content', None):
                    content = msg_obj.reasoning_content
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
                break
            except RateLimitError:
                # token / request limit exceeded → rotate to the next model
                _mark_down(model, COOLDOWN_RATE_LIMIT)
                break
            except APIStatusError as e:
                status = getattr(e, 'status_code', None)
                if status == 429:
                    _mark_down(model, COOLDOWN_RATE_LIMIT)
                elif status in (400, 404):
                    if (status == 400 and _attempt == 0
                            and 'reasoning' in str(e).lower()):
                        # Model rejected the reasoning kwarg — retry without it.
                        current_app.logger.warning(
                            f"Groq model {model} rejected reasoning params — "
                            f"retrying without them"
                        )
                        continue
                    _mark_down(model, COOLDOWN_BAD_MODEL)
                else:
                    current_app.logger.error(f"Groq API error {status} on {model}: {e}")
                    _mark_down(model, COOLDOWN_SERVER_ERR)
                break
            except Exception as e:
                current_app.logger.error(f"Groq call failed on {model}: {e}")
                _mark_down(model, COOLDOWN_SERVER_ERR)
                break

    # ── Entire Groq pool exhausted → last-resort Gemini fallback ─────────
    return _fallback_or_none(messages, max_tokens, temperature,
                             json_mode=json_mode, reasoning_effort=reasoning_effort)


def _fallback_or_none(messages: list, max_tokens: int, temperature: float,
                      json_mode: bool = False, reasoning_effort: str = None):
    """Try remaining configured providers; return no answer when all are unavailable."""
    # 1. Try OpenRouter pool first
    text, or_model = _openrouter_fallback(messages, max_tokens, temperature,
                                          json_mode=json_mode, reasoning_effort=reasoning_effort)
    if text is not None:
        return text, or_model, False, _estimate_usage(messages, text)

    # 2. Try Gemini pool second
    text, gemini_model = _gemini_fallback(messages, max_tokens, temperature)
    if text is not None:
        return text, f'gemini:{gemini_model}', False, _estimate_usage(messages, text)

    # No canned or synthetic response: callers must handle provider outage explicitly.
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
