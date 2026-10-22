"""Grading Service — Canonical multi-component grading & rollup engine.

Aggregates:
  1. Auto-grade & code quality (0–100 scale) from final CodeAttempt submissions.
  2. Quiz grade (0–100 scale) from ContentModule(module_type='quiz') via ContentProgress.
  3. Viva grade (0–100 scale) from ContentModule(module_type='viva') via ContentProgress or VivaSession fallback.
  4. Hint deductions from HintLog (capped at 15.0%).
  5. Recalculates Grade.final_grade using the Experiment's 5-component rubric.
"""

from datetime import datetime
from app.extensions import db
from app.models.experiment import Experiment, ContentModule, ContentProgress
from app.models.grading import Grade, HintLog
from app.models.submission import CodeAttempt


def sync_student_experiment_grade(
    student_id: str,
    experiment_id: str,
    session_id: str = None,
    manual_grade: float = None,
    manual_feedback: str = None,
    graded_by: str = None,
) -> Grade:
    """Synchronize, calculate, and persist a student's Grade for an experiment.

    Pulls together code attempts, quiz modules, viva modules, and hint logs,
    applies the experiment's full 5-component rubric, and calculates the final grade.
    """
    exp = Experiment.query.get(experiment_id)
    if not exp:
        return None

    rubric = {
        'test_cases':   exp.rubric_test_cases if exp.rubric_test_cases is not None else 60,
        'lab_report':   exp.rubric_lab_report if exp.rubric_lab_report is not None else 20,
        'code_quality': exp.rubric_code_quality if exp.rubric_code_quality is not None else 10,
        'viva':         exp.rubric_viva if exp.rubric_viva is not None else 10,
        'quiz':         exp.rubric_quiz if exp.rubric_quiz is not None else 0,
    }

    grade = Grade.query.filter_by(
        student_id=student_id,
        experiment_id=experiment_id,
    ).first()

    if not grade:
        grade = Grade(
            student_id=student_id,
            experiment_id=experiment_id,
            session_id=session_id,
        )
        db.session.add(grade)
    elif session_id and not grade.session_id:
        grade.session_id = session_id

    # 1. Auto Grade and Code Quality from final CodeAttempt
    attempts = CodeAttempt.query.filter_by(
        student_id=student_id,
        experiment_id=experiment_id,
        is_final_submission=True,
    ).order_by(CodeAttempt.test_cases_passed.desc(), CodeAttempt.submitted_at.desc()).all()

    if attempts:
        best_attempt = attempts[0]
        if best_attempt.test_cases_total and best_attempt.test_cases_total > 0:
            grade.auto_grade = round(
                (best_attempt.test_cases_passed / best_attempt.test_cases_total) * 100.0, 1
            )
        elif best_attempt.compile_status in ('success', 'graded'):
            grade.auto_grade = 100.0

        # Quality score map normalized to 0–100 scale (INS-02)
        quality_map = {'A': 100.0, 'B': 80.0, 'C': 60.0, 'D': 40.0, 'E': 20.0, 'F': 0.0}
        quality_scores = [
            quality_map.get(a.quality_grade)
            for a in attempts
            if a.quality_grade and a.quality_grade in quality_map
        ]
        if quality_scores:
            grade.code_quality_grade = max(quality_scores)
        elif best_attempt.quality_grade in quality_map:
            grade.code_quality_grade = quality_map[best_attempt.quality_grade]

    # 2. Quiz Grade across all 'quiz' ContentModules for this experiment
    quiz_modules = ContentModule.query.filter_by(
        experiment_id=experiment_id,
        module_type='quiz',
    ).all()
    if quiz_modules:
        quiz_mod_ids = [m.id for m in quiz_modules]
        q_progress = ContentProgress.query.filter(
            ContentProgress.student_id == student_id,
            ContentProgress.module_id.in_(quiz_mod_ids),
            ContentProgress.completed == True,  # noqa: E712
        ).all()
        q_scores = [p.score for p in q_progress if p.score is not None]
        if q_scores:
            grade.quiz_grade = round(sum(q_scores) / len(quiz_modules), 2)

    # 3. Viva Grade across all 'viva' ContentModules for this experiment
    viva_modules = ContentModule.query.filter_by(
        experiment_id=experiment_id,
        module_type='viva',
    ).all()
    v_scores = []
    if viva_modules:
        viva_mod_ids = [m.id for m in viva_modules]
        v_progress = ContentProgress.query.filter(
            ContentProgress.student_id == student_id,
            ContentProgress.module_id.in_(viva_mod_ids),
            ContentProgress.completed == True,  # noqa: E712
        ).all()
        v_scores = [p.score for p in v_progress if p.score is not None]

    if v_scores:
        grade.viva_grade = round(sum(v_scores) / len(viva_modules), 2)
    else:
        # Fallback to VivaSession if any live viva was conducted
        from app.models.grading import VivaSession
        vs = VivaSession.query.filter_by(
            student_id=student_id,
            experiment_id=experiment_id,
        ).order_by(VivaSession.created_at.desc()).first()
        if vs and vs.total_score is not None:
            grade.viva_grade = round(float(vs.total_score), 2)

    # 4. HintLog deduction (capped at 15.0%) — HintLog records 1 row per hint used
    hint_count = HintLog.query.filter_by(
        student_id=student_id,
        experiment_id=experiment_id,
    ).count()
    hint_schedule = {0: 0.0, 1: 3.0, 2: 7.0, 3: 12.0}
    grade.hint_deduction = min(15.0, float(hint_schedule.get(hint_count, 15.0 if hint_count > 3 else 0.0)))

    # 5. Manual overrides
    if manual_grade is not None:
        grade.manual_grade = float(manual_grade)
    if manual_feedback is not None:
        grade.manual_feedback = manual_feedback
    if graded_by is not None:
        grade.graded_by = graded_by

    if not grade.graded_at:
        grade.graded_at = datetime.utcnow()

    # 6. Recalculate final score with full rubric
    grade.calculate_final(rubric)
    db.session.commit()
    return grade
