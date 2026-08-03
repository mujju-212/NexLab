"""
ML Model 2: Knowledge Tracing — Concept Mastery Update
Formula-based (DPKT paper difficulty-aware weighting).
No training needed. Runs after each experiment submission.
"""
from datetime import datetime
from app.extensions import db
from app.models.knowledge import ConceptMastery


# Difficulty weights from DPKT paper
DIFFICULTY_WEIGHTS = {1: 0.6, 2: 0.8, 3: 1.0, 4: 1.2}

# Hint deduction lookup
HINT_DEDUCTIONS = {0: 0.0, 1: 0.03, 2: 0.07, 3: 0.12}


def update_concept_mastery(student_id: str, institution_id: str,
                           concept_tags: list, result: dict) -> dict:
    """
    Update mastery for all concepts tagged on a submitted experiment.

    result dict expected:
        passed (bool)         — did student pass all required test cases
        score_pct (float)     — 0.0–1.0 final score percentage
        attempt_count (int)   — number of attempts before passing
        hints_used (int)      — number of hints used (0–3+)
        difficulty (int)      — experiment difficulty level (1–4)
    """
    passed        = result.get('passed', False)
    score_pct     = result.get('score_pct', 0.0)
    attempts      = result.get('attempt_count', 1)
    hints         = min(result.get('hints_used', 0), 3)
    difficulty    = result.get('difficulty', 1)

    diff_weight   = DIFFICULTY_WEIGHTS.get(difficulty, 1.0)
    attempt_factor = max(0.5, 1 - (attempts - 1) * 0.1)
    hint_factor   = max(0.6, 1 - hints * 0.1)

    updates = {}
    for concept in (concept_tags or []):
        # Fetch or create mastery record
        mastery = ConceptMastery.query.filter_by(
            student_id=student_id, concept=concept
        ).first()

        if not mastery:
            mastery = ConceptMastery(
                student_id=student_id,
                institution_id=institution_id,
                concept=concept,
                mastery_score=0.0,
                experiment_count=0
            )
            db.session.add(mastery)

        current = mastery.mastery_score

        if passed:
            gain = 15 * diff_weight * attempt_factor * hint_factor * score_pct
        else:
            gain = -5 * diff_weight

        # Exponential moving average — harder to gain at high mastery
        new_score = current + gain * (1 - current / 100)
        new_score = max(0.0, min(100.0, new_score))

        mastery.mastery_score   = round(new_score, 2)
        mastery.experiment_count += 1
        mastery.last_updated    = datetime.utcnow()

        updates[concept] = round(new_score, 2)

    db.session.commit()
    return updates


def get_mastery_map(student_id: str) -> dict:
    """Return all concept mastery scores for a student"""
    records = ConceptMastery.query.filter_by(student_id=student_id).all()
    return {r.concept: r.mastery_score for r in records}


def get_weak_concepts(student_id: str, threshold: float = 50.0) -> list:
    """Return concepts below mastery threshold — used for adaptive content suggestions"""
    records = ConceptMastery.query.filter_by(student_id=student_id).filter(
        ConceptMastery.mastery_score < threshold
    ).all()
    return [{'concept': r.concept, 'mastery': r.mastery_score} for r in records]
