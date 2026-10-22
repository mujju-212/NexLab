"""
RAG Embedding Helpers — generate embedding vectors for document chunks.

Primary path: Google text-embedding-004 via the Google GenerativeAI SDK (if the
SDK and an API key are configured). 768-dim, matching the document's VECTOR(768).

Fallback path: a deterministic local hash-embedding (MD5 word hash projected
into a fixed dimension). Keeps RAG functional with zero API key / zero network
cost, and is what is used under SQLite or when the SDK is unavailable.

All functions are defensive — they never raise.
"""
import hashlib
import logging
import math
import os

log = logging.getLogger(__name__)

_DIM = 768


def _gemini_embed(client, text: str, dim: int) -> list[float]:
    model = os.environ.get('GEMINI_EMBED_MODEL', 'text-embedding-004')
    if hasattr(client, 'models') and hasattr(client.models, 'embed_content'):
        content = client.models.embed_content(model=model, contents=[text])
        vals = content.embeddings[0].values
    elif hasattr(client, 'embed_content'):
        model_name = model if model.startswith('models/') else f"models/{model}"
        res = client.embed_content(model=model_name, content=text)
        vals = res.get('embedding', []) if isinstance(res, dict) else getattr(res, 'embedding', [])
    else:
        vals = []
    vec = [float(x) for x in vals]
    return vec[:dim] if len(vec) >= dim else vec + [0.0] * (dim - len(vec))


def _embed_local(text: str, dim: int) -> list[float]:
    """Deterministic local fallback: hashed bag-of-words into `dim` buckets."""
    vec = [0.0] * dim
    for tok in (text or '').lower().split():
        h = int(hashlib.md5(tok.encode('utf-8')).hexdigest(), 16)
        for k in range(2):
            vec[(h >> (k * 16)) % dim] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def get_embedding(text: str, dim: int = None) -> list[float]:
    """Return a float vector of length `dim` for `text`. Never raises."""
    dim = dim or _DIM
    if not (text or '').strip():
        return [0.0] * dim
    try:
        import google.generativeai as genai  # type: ignore
        api_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
        if api_key:
            genai.configure(api_key=api_key)
            return _normalise(_gemini_embed(genai, text, dim))
    except Exception as exc:  # pragma: no cover — SDK failure is non-fatal
        log.debug("[rag.embed] gemini embedding unavailable: %s", exc)
    return _embed_local(text, dim)


def embed_chunks(texts: list[str], dim: int = None) -> list[list[float]]:
    return [get_embedding(t, dim) for t in texts]


def cosine_sim(a, b) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def _normalise(v: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / norm for x in v]