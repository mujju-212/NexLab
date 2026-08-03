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


def compute_holistic_rank(student_id: str, section_subject_id: str,
                          institution_id: str) -> float:
    """
    Compute and store holistic rank for a student in a subject section.
    Returns the rank_score (0–100).
    """

    # ── Component 1: Concept Mastery Score (30%) ──────────────────────────
    masteries = ConceptMastery.query.filter_by(student_id=student_id).all()
    mastery_score = (
        statistics.mean([m.mastery_score for m in masteries])
        if masteries else 0.0
    )

    # ── Component 2: Engagement Score (20%) ──────────────────────────────
    # Avg focus score during sessions + prelab completion rate
    focus_records = FocusScore.query.filter_by(student_id=student_id).all()
    avg_focus = (
        statistics.mean([f.focus_score for f in focus_records if f.focus_score is not None])
        if focus_records else 50.0
    )

    # Pre-lab completion rate (ContentProgress — simplified to attendance for now)
    attendances = SessionAttendance.query.filter_by(student_id=student_id).all()
    attended    = sum(1 for a in attendances if a.status in ('present', 'late'))
    total_sessions = len(attendances) if attendances else 1
    prelab_rate = (attended / total_sessions) * 100

    engagement = 0.6 * avg_focus + 0.4 * prelab_rate

    # ── Component 3: Effort Score (20%) ───────────────────────────────────
    # Total lab hours vs max in their section
    total_seconds = sum(a.total_time_seconds for a in attendances)
    total_hours   = total_seconds / 3600

    # Simple normalization: assume max 40 hours per semester is 100%
    effort_score  = min(100.0, (total_hours / 40) * 100)

    # ── Component 4: Efficiency Score (15%) ───────────────────────────────
    # Solve with fewest attempts
    final_submissions = CodeAttempt.query.filter_by(
        student_id=student_id,
        is_final_submission=True
    ).all()

    efficiency_scores = []
    for sub in final_submissions:
        attempt_count = CodeAttempt.query.filter_by(
            student_id=student_id,
            experiment_id=sub.experiment_id
        ).count()
        if attempt_count == 1:   eff = 100.0
        elif attempt_count == 2: eff = 80.0
        elif attempt_count == 3: eff = 65.0
        else: eff = max(40.0, 65.0 - (attempt_count - 3) * 8)
        efficiency_scores.append(eff)

    efficiency = (
        statistics.mean(efficiency_scores) if efficiency_scores else 50.0
    )

    # ── Component 5: Consistency Score (15%) ──────────────────────────────
    grades = Grade.query.filter_by(student_id=student_id).filter(
        Grade.final_grade.isnot(None)
    ).order_by(Grade.created_at).all()

    grade_values = [g.final_grade for g in grades]
    if len(grade_values) > 2:
        stdev = statistics.stdev(grade_values)
        consistency = max(0.0, 100.0 - stdev)
    else:
        consistency = 50.0

    # ── Weighted Final Score ───────────────────────────────────────────────
    rank_score = (
        mastery_score * 0.30 +
        engagement    * 0.20 +
        effort_score  * 0.20 +
        efficiency    * 0.15 +
        consistency   * 0.15
    )
    rank_score = round(rank_score, 2)

    # ── Save to DB ─────────────────────────────────────────────────────────
    ranking = StudentRanking.query.filter_by(
        student_id=student_id,
        section_subject_id=section_subject_id
    ).first()

    if not ranking:
        ranking = StudentRanking(
            student_id=student_id,
            section_subject_id=section_subject_id,
            institution_id=institution_id
        )
        db.session.add(ranking)

    ranking.mastery_score    = round(mastery_score, 2)
    ranking.engagement_score = round(engagement, 2)
    ranking.effort_score     = round(effort_score, 2)
    ranking.efficiency_score = round(efficiency, 2)
    ranking.consistency_score = round(consistency, 2)
    ranking.rank_score       = rank_score
    ranking.updated_at       = datetime.utcnow()

    db.session.commit()

    # ── Update rank positions for all students in this section-subject ─────
    _update_rank_positions(section_subject_id)

    return rank_score


def _update_rank_positions(section_subject_id: str):
    """Recalculate rank positions (1st, 2nd, ...) for all students"""
    rankings = StudentRanking.query.filter_by(
        section_subject_id=section_subject_id
    ).order_by(StudentRanking.rank_score.desc()).all()

    for position, ranking in enumerate(rankings, start=1):
        ranking.rank_position = position

    db.session.commit()
