"""
Code Quality Metrics using radon library.
Calculates: Lines of Code (LOC), Cyclomatic Complexity, Maintainability Index.
Runs on final submission before grading.
"""

COMPLEXITY_WARN_THRESHOLD = 10   # default — overridden by Flask config if available


def analyze_code_quality(code: str, language: str) -> dict:
    """
    Analyze code quality for Python code.
    For C/C++/Java — returns basic LOC metrics only (radon is Python-only).
    """
    result = {
        'loc': 0,
        'lloc': 0,                  # logical lines of code
        'sloc': 0,                  # source lines (non-blank, non-comment)
        'cyclomatic_complexity': None,
        'maintainability_index': None,
        'quality_grade': 'N/A',
        'complexity_warning': False,
        'complexity_detail': []
    }

    if not code:
        return result

    if language == 'python':
        result = _analyze_python(code)
    else:
        result = _analyze_generic(code)

    return result


def _analyze_python(code: str) -> dict:
    """Full radon analysis for Python code"""
    try:
        from radon.metrics import mi_visit, mi_rank
        from radon.complexity import cc_visit, cc_rank, average_complexity
        from radon.raw import analyze

        # Raw metrics
        raw  = analyze(code)
        loc  = raw.loc
        lloc = raw.lloc
        sloc = raw.sloc

        # Cyclomatic complexity per function/class
        cc_results = cc_visit(code)
        avg_cc     = average_complexity(cc_results) if cc_results else 0.0

        # Maintainability index (0-100, higher = better)
        mi       = mi_visit(code, multi=True)
        mi_grade = mi_rank(mi)

        # Threshold — read from Flask config if available, else use module default
        warn_threshold = COMPLEXITY_WARN_THRESHOLD
        try:
            from flask import current_app
            warn_threshold = current_app.config.get(
                'COMPLEXITY_WARN_THRESHOLD', COMPLEXITY_WARN_THRESHOLD
            )
        except RuntimeError:
            pass  # running outside Flask context

        complex_detail = [
            {'name': b.name, 'complexity': b.complexity, 'grade': cc_rank(b.complexity)}
            for b in cc_results
        ]

        return {
            'loc':                    loc,
            'lloc':                   lloc,
            'sloc':                   sloc,
            'cyclomatic_complexity':  round(avg_cc, 2),
            'maintainability_index':  round(mi, 2),
            'quality_grade':          mi_grade,
            'complexity_warning':     avg_cc > warn_threshold,
            'complexity_detail':      complex_detail,
        }

    except Exception as e:
        print(f"[CodeQuality] Analysis failed: {e}")
        return _analyze_generic(code)



def _analyze_generic(code: str) -> dict:
    """Basic LOC analysis for non-Python languages"""
    lines = code.split('\n')
    loc   = len(lines)
    sloc  = sum(1 for l in lines if l.strip() and not l.strip().startswith(('//', '#', '/*', '*')))

    return {
        'loc': loc,
        'lloc': sloc,
        'sloc': sloc,
        'cyclomatic_complexity': None,
        'maintainability_index': None,
        'quality_grade': 'N/A',
        'complexity_warning': False,
        'complexity_detail': [],
    }


def quality_to_score(metrics: dict, max_score: float = 10.0) -> float:
    """
    Convert quality metrics to a numerical score (0–max_score).
    Used for the code quality component of final grade.
    """
    grade_map = {'A': 1.0, 'B': 0.85, 'C': 0.70, 'D': 0.55, 'E': 0.40, 'F': 0.25, 'N/A': 0.70}
    grade = metrics.get('quality_grade', 'N/A')
    multiplier = grade_map.get(grade, 0.70)

    # Penalty for very high complexity
    if metrics.get('complexity_warning', False):
        multiplier = max(0.25, multiplier - 0.15)

    return round(multiplier * max_score, 2)
