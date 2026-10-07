"""
NexLab Cohort Conversion Funnel.
Monotonically non-increasing stage funnel: enrolled -> active -> submitting -> passing -> mastered.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime
from sqlalchemy import func

from app.extensions import db
from app.models.user import User
from app.models.academic import SectionStudent
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt
from app.models.grading import Grade
from app.models.knowledge import ConceptMastery


def compute_student_funnel(
    institution_id: str,
    window_start: datetime,
    window_end: datetime,
    section_id: Optional[str] = None,
    section_subject_id: Optional[str] = None,
    pass_grade_threshold: float = 50.0,
    mastery_threshold: float = 75.0,
) -> Dict[str, Any]:
    """
    Computes cohort progression funnel.
    Guarantees monotonic non-increasing counts across stages:
    enrolled >= active >= submitting >= passing >= mastered.
    """
    # 1. Enrolled student IDs
    if section_id:
        enrolled_q = db.session.query(SectionStudent.student_id).join(
            User, SectionStudent.student_id == User.id
        ).filter(
            SectionStudent.section_id == section_id,
            User.institution_id == institution_id,
            User.role == 'student',
            User.is_active == True,
        ).distinct()
    else:
        enrolled_q = db.session.query(User.id).filter(
            User.institution_id == institution_id,
            User.role == 'student',
            User.is_active == True,
        )

    enrolled_ids = {r[0] for r in enrolled_q.all()}
    total_enrolled = len(enrolled_ids)

    if total_enrolled == 0:
        return {
            'total_enrolled': 0,
            'stages': [
                {'stage': 'enrolled', 'count': 0, 'pct_of_enrolled': 0.0, 'drop_off_count': 0, 'drop_off_pct': 0.0},
                {'stage': 'active', 'count': 0, 'pct_of_enrolled': 0.0, 'drop_off_count': 0, 'drop_off_pct': 0.0},
                {'stage': 'submitting', 'count': 0, 'pct_of_enrolled': 0.0, 'drop_off_count': 0, 'drop_off_pct': 0.0},
                {'stage': 'passing', 'count': 0, 'pct_of_enrolled': 0.0, 'drop_off_count': 0, 'drop_off_pct': 0.0},
                {'stage': 'mastered', 'count': 0, 'pct_of_enrolled': 0.0, 'drop_off_count': 0, 'drop_off_pct': 0.0},
            ],
            'summary': {
                'overall_completion_rate': 0.0,
                'biggest_drop_off_stage': None,
            }
        }

    # 2. Active: attended >= 1 session in window
    active_q = db.session.query(SessionAttendance.student_id).join(
        LabSession, SessionAttendance.session_id == LabSession.id
    ).filter(
        SessionAttendance.student_id.in_(enrolled_ids),
        LabSession.institution_id == institution_id,
        LabSession.scheduled_at >= window_start,
        LabSession.scheduled_at <= window_end,
        SessionAttendance.status.in_(['present', 'late', 'partial', 'inactive_present']),
    )
    if section_subject_id:
        active_q = active_q.filter(LabSession.section_subject_id == section_subject_id)

    active_ids = {r[0] for r in active_q.distinct().all()}

    # 3. Submitting: active students who made >= 1 submission
    submitting_q = db.session.query(CodeAttempt.student_id).filter(
        CodeAttempt.student_id.in_(active_ids),
        CodeAttempt.submitted_at >= window_start,
        CodeAttempt.submitted_at <= window_end,
    )
    submitting_ids = {r[0] for r in submitting_q.distinct().all()}

    # 4. Passing: submitting students whose average grade is >= pass_grade_threshold
    passing_ids = set()
    if submitting_ids:
        grade_rows = db.session.query(
            Grade.student_id,
            func.avg(Grade.final_grade).label('avg_grade'),
        ).filter(
            Grade.student_id.in_(submitting_ids),
            Grade.created_at >= window_start,
            Grade.created_at <= window_end,
            Grade.final_grade.isnot(None),
        ).group_by(Grade.student_id).all()

        for r in grade_rows:
            if float(r.avg_grade or 0.0) >= pass_grade_threshold:
                passing_ids.add(r.student_id)

    # 5. Mastered: passing students whose avg concept mastery >= mastery_threshold
    mastered_ids = set()
    if passing_ids:
        mastery_rows = db.session.query(
            ConceptMastery.student_id,
            func.avg(ConceptMastery.mastery_score).label('avg_mastery'),
        ).filter(
            ConceptMastery.institution_id == institution_id,
            ConceptMastery.student_id.in_(passing_ids),
        ).group_by(ConceptMastery.student_id).all()

        for r in mastery_rows:
            if float(r.avg_mastery or 0.0) >= mastery_threshold:
                mastered_ids.add(r.student_id)

    stage_counts = [
        ('enrolled', len(enrolled_ids)),
        ('active', len(active_ids)),
        ('submitting', len(submitting_ids)),
        ('passing', len(passing_ids)),
        ('mastered', len(mastered_ids)),
    ]

    stages_out = []
    biggest_drop_count = -1
    biggest_drop_stage = None

    for i, (name, count) in enumerate(stage_counts):
        pct_of_enrolled = round((count / total_enrolled) * 100.0, 1) if total_enrolled else 0.0
        
        if i == 0:
            drop_off_count = 0
            drop_off_pct = 0.0
        else:
            prev_count = stage_counts[i - 1][1]
            drop_off_count = max(0, prev_count - count)
            drop_off_pct = round((drop_off_count / prev_count) * 100.0, 1) if prev_count else 0.0
            
            if drop_off_count > biggest_drop_count:
                biggest_drop_count = drop_off_count
                biggest_drop_stage = f"{stage_counts[i - 1][0]} -> {name}"

        stages_out.append({
            'stage': name,
            'count': count,
            'pct_of_enrolled': pct_of_enrolled,
            'drop_off_count': drop_off_count,
            'drop_off_pct': drop_off_pct,
        })

    return {
        'total_enrolled': total_enrolled,
        'stages': stages_out,
        'summary': {
            'overall_completion_rate': stages_out[-1]['pct_of_enrolled'],
            'biggest_drop_off_stage': biggest_drop_stage,
            'thresholds': {
                'pass_grade': pass_grade_threshold,
                'mastery': mastery_threshold,
            }
        }
    }
