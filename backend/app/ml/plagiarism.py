"""
Plagiarism Detection — Token-based TF-IDF similarity.
Runs as background job ~1 hour after session ends.
No ML training needed.

Two-stage approach:
  Stage 1: Fast difflib pre-filter (> 0.60 ratio)
  Stage 2: TF-IDF cosine similarity on token-normalized code (more accurate)
"""
import re
from difflib import SequenceMatcher
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from datetime import datetime


# ── Code Normalization ─────────────────────────────────────────────────────────

def _strip_comments(code: str) -> str:
    """Remove single-line and block comments"""
    code = re.sub(r'#.*$',      '', code, flags=re.MULTILINE)
    code = re.sub(r'//.*$',     '', code, flags=re.MULTILINE)
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    return code


def _normalize_identifiers(code: str) -> str:
    """Replace all variable/function names with generic tokens.
    Keeps language keywords and structure intact.
    This prevents trivial renaming from defeating plagiarism detection.
    """
    # Tokenize identifiers (words not starting with digit)
    tokens = re.findall(r'[A-Za-z_][A-Za-z0-9_]*', code)

    # Python/C/Java/JS keywords to keep as-is
    KEYWORDS = {
        'if','else','elif','for','while','do','return','break','continue',
        'class','def','import','from','in','not','and','or','is','None',
        'True','False','void','int','float','double','char','String','bool',
        'public','private','static','final','new','this','super','extends',
        'try','except','catch','finally','throw','throws','raise',
        'print','len','range','append','input','output','main','self',
    }

    seen = {}
    counter = [0]

    def replace_token(match):
        word = match.group(0)
        if word in KEYWORDS:
            return word
        if word not in seen:
            seen[word] = f'VAR{counter[0]}'
            counter[0] += 1
        return seen[word]

    return re.sub(r'[A-Za-z_][A-Za-z0-9_]*', replace_token, code)


def normalize_code(code: str) -> str:
    """Full normalization pipeline"""
    code = _strip_comments(code)
    code = _normalize_identifiers(code)
    code = re.sub(r'\s+', ' ', code).strip()
    return code


# ── Similarity Functions ───────────────────────────────────────────────────────

def compute_difflib_similarity(code_a: str, code_b: str) -> float:
    """Fast SequenceMatcher similarity — used as pre-filter."""
    return SequenceMatcher(None, normalize_code(code_a), normalize_code(code_b)).ratio()


def compute_tfidf_similarity(codes: list[str]) -> list[list[float]]:
    """
    Compute pairwise TF-IDF cosine similarity for a batch of code strings.
    More accurate than difflib — detects structural similarity even after
    identifier renaming.

    Returns NxN matrix of similarity scores (0.0 to 1.0).
    """
    normalized = [normalize_code(c) for c in codes]
    vectorizer = TfidfVectorizer(
        analyzer='char_wb',   # character n-grams — language-agnostic
        ngram_range=(3, 5),   # 3–5 char n-grams capture code structure
        min_df=1,
        sublinear_tf=True,
    )
    try:
        tfidf_matrix = vectorizer.fit_transform(normalized)
        sim_matrix   = cosine_similarity(tfidf_matrix)
        return sim_matrix.tolist()
    except Exception:
        # Fallback: pairwise difflib
        n = len(codes)
        matrix = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(n):
                if i == j:
                    matrix[i][j] = 1.0
                else:
                    matrix[i][j] = compute_difflib_similarity(codes[i], codes[j])
        return matrix


# ── Session-Level Check ────────────────────────────────────────────────────────

def check_session_plagiarism(session_id: str, experiment_id: str,
                              institution_id: str) -> list:
    """
    Compare all final submissions in a session.
    Two-stage: difflib pre-filter → TF-IDF precise check.
    Returns list of flagged pairs above threshold.
    """
    from flask import current_app
    from app.extensions import db
    from app.models.submission import CodeAttempt
    from app.models.feedback import PlagiarismFlag

    threshold = current_app.config.get('PLAGIARISM_THRESHOLD', 0.80)

    submissions = CodeAttempt.query.filter_by(
        session_id=session_id,
        experiment_id=experiment_id,
        is_final_submission=True
    ).all()

    if len(submissions) < 2:
        return []

    codes = [_get_primary_code(s.files) for s in submissions]
    sids  = [s.student_id for s in submissions]

    # Stage 1: Build candidate pairs via difflib (fast pre-filter)
    candidates = []
    for i in range(len(submissions)):
        for j in range(i + 1, len(submissions)):
            if not codes[i] or not codes[j]:
                continue
            quick_sim = compute_difflib_similarity(codes[i], codes[j])
            if quick_sim >= 0.55:   # loose pre-filter
                candidates.append((i, j, quick_sim))

    if not candidates:
        return []

    # Stage 2: TF-IDF on all codes together
    sim_matrix = compute_tfidf_similarity(codes)

    flagged = []
    for i, j, _ in candidates:
        tfidf_sim = sim_matrix[i][j]
        if tfidf_sim >= threshold:
            flag = PlagiarismFlag(
                institution_id=institution_id,
                experiment_id=experiment_id,
                session_id=session_id,
                student_a_id=sids[i],
                student_b_id=sids[j],
                similarity_pct=round(tfidf_sim * 100, 1),
                detected_at=datetime.utcnow(),
                status='pending'
            )
            db.session.add(flag)
            flagged.append({
                'student_a':      sids[i],
                'student_b':      sids[j],
                'similarity_pct': round(tfidf_sim * 100, 1),
                'method':         'tfidf_cosine',
            })

    if flagged:
        db.session.commit()

    return flagged


def _get_primary_code(files: dict) -> str:
    """Extract primary file code from files JSON"""
    if not files:
        return ''
    if 'main' in files:
        return files['main']
    return next(iter(files.values()), '')


# ── Standalone test (no DB needed) ────────────────────────────────────────────

def check_two_codes(code_a: str, code_b: str) -> dict:
    """
    Compare exactly two code strings.
    Used by the test endpoint and ad-hoc checks.
    """
    difflib_sim = compute_difflib_similarity(code_a, code_b)
    tfidf_sim   = compute_tfidf_similarity([code_a, code_b])[0][1]
    verdict     = 'FLAGGED' if tfidf_sim >= 0.80 else (
                  'SUSPICIOUS' if tfidf_sim >= 0.60 else 'CLEAN')
    return {
        'difflib_similarity': round(difflib_sim * 100, 1),
        'tfidf_similarity':   round(tfidf_sim * 100, 1),
        'verdict':            verdict,
    }
