"""
ML Model 3: Holistic Ranking Score
5-component weighted formula. No training needed.
Runs as background job after each session ends.
"""
import statistics
from datetime import datetime
from app.extensions import db
from app.models.knowledge import StudentRanking, ConceptMastery, FocusScore
from app.models.submission import CodeAttempt
from app.models.session import SessionAttendance
from app.models.grading import Grade


def compute_holistic_rank(student_id: str, section_subject_id: str, institution_id: str) -> float:
    """
    DEPRECATED shim.

    The holistic score used to be computed here with its own priors
    (efficiency 50, consistency 50, a hardcoded attempt curve). That produced a
    second, disagreeing score for the same student. All scoring now lives in
    ``app.analytics.ranking.score_students``; this function keeps the old
    signature for existing callers and returns the canonical value.
    """
    from app.analytics.ranking import compute_section_subject_ranks
    rows = compute_section_subject_ranks(section_subject_id, institution_id, persist=True)
    mine = next((r for r in rows if r['student_id'] == student_id), None)
    return float(mine['rank_score']) if mine and mine.get('rank_score') is not None else 0.0


def _update_rank_positions(section_subject_id: str):
    """Recalculate rank positions (1st, 2nd, ...) for all students"""
    rankings = StudentRanking.query.filter_by(
        section_subject_id=section_subject_id
    ).order_by(StudentRanking.rank_score.desc()).all()

    for position, ranking in enumerate(rankings, start=1):
        ranking.rank_position = position

    db.session.commit()


def compute_rankings_for_section_subject(section_subject_id: str, institution_id: str):
    """Recompute + persist the canonical rankings for one section-subject."""
    from app.analytics.ranking import compute_section_subject_ranks
    return compute_section_subject_ranks(section_subject_id, institution_id, persist=True)
