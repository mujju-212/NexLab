"""
Completion & Attendance Rollups Engine
Calculates experiment completion coverage, attendance history, active coding ratios,
and packages the comprehensive Student 360 academic record payload.
"""
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy import func
from app.extensions import db
from app.models.user import User
from app.models.experiment import Experiment
from app.models.submission import CodeAttempt
from app.models.grading import Grade
from app.models.session import LabSession, SessionAttendance
from app.models.academic import Section, SectionStudent, SectionSubject, Department
from app.analytics.scope import resolve_scope_entities
from app.analytics.metrics import compute_student_atomic_metrics
from app.analytics.risk import compute_student_risk
from app.analytics.mastery import compute_scoped_mastery
from app.analytics.ranking import get_student_all_ranks

# One definition of attendance credit for the whole platform: a late arrival is
# not a no-show, and a partial attendance is half-way. Every analytics surface
# (metrics layer, instructor tabs, institution tabs) imports this map.
ATT_CREDIT_MAP = {
    'present': 1.0,
    'late': 0.8,
    'partial': 0.6,
    'inactive_present': 0.5,
    'absent': 0.0,
}


def compute_student_completion_rollup(
    student_id: str,
    scope_level: str = 'subject',
    scope_id: Optional[str] = None,
    institution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Computes completed vs assigned experiments, pending items, and completion rate
    for a given student within scope.
    """
    entities = resolve_scope_entities(scope_level, scope_id, institution_id)
    scope_exp_ids = entities.get('experiment_ids', [])

    if not scope_exp_ids:
        # Fallback: if no scope specified, grab all experiments in the student's enrolled sections
        enrolled_secs = SectionStudent.query.filter_by(student_id=student_id).all()
        sec_ids = [es.section_id for es in enrolled_secs]
        if sec_ids:
            sss = SectionSubject.query.filter(SectionSubject.section_id.in_(sec_ids)).all()
            sub_ids = [s.subject_id for s in sss]
            if sub_ids:
                exps = Experiment.query.filter(Experiment.subject_id.in_(sub_ids)).all()
                scope_exp_ids = [e.id for e in exps]

    if not scope_exp_ids and institution_id:
        exps = Experiment.query.filter_by(institution_id=institution_id).all()
        scope_exp_ids = [e.id for e in exps]

    all_experiments = Experiment.query.filter(Experiment.id.in_(scope_exp_ids)).all()
    exp_map = {e.id: e for e in all_experiments}
    assigned_count = len(all_experiments)

    # Completed experiments: final submission or non-null grade
    completed_submissions = (
        db.session.query(CodeAttempt.experiment_id)
        .filter(
            CodeAttempt.student_id == student_id,
            CodeAttempt.experiment_id.in_(scope_exp_ids),
            CodeAttempt.is_final_submission == True,
        )
        .distinct()
        .all()
    )
    completed_exp_ids = {r[0] for r in completed_submissions}

    graded = (
        db.session.query(Grade.experiment_id)
        .filter(
            Grade.student_id == student_id,
            Grade.experiment_id.in_(scope_exp_ids),
            Grade.final_grade.isnot(None),
        )
        .distinct()
        .all()
    )
    for g in graded:
        completed_exp_ids.add(g[0])

    completed_count = len(completed_exp_ids)
    pct = round(100.0 * (completed_count / max(1, assigned_count)), 1) if assigned_count > 0 else 0.0

    completed_list = []
    pending_list = []

    for eid, exp in exp_map.items():
        item = {
            'experiment_id': exp.id,
            'title': exp.title,
            'difficulty': getattr(exp, 'difficulty', 'medium'),
            'category': getattr(exp, 'category', None),
        }
        if eid in completed_exp_ids:
            completed_list.append(item)
        else:
            pending_list.append(item)

    return {
        'assigned': assigned_count,
        'completed': completed_count,
        'completion_pct': pct,
        'completed_experiments': completed_list,
        'pending_experiments': pending_list,
    }


def compute_student_attendance_rollup(
    student_id: str,
    scope_level: str = 'subject',
    scope_id: Optional[str] = None,
    institution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Computes session attendance history, present rate, and active coder rate.
    """
    entities = resolve_scope_entities(scope_level, scope_id, institution_id)
    scope_session_ids = entities.get('session_ids', [])

    q = (
        db.session.query(SessionAttendance, LabSession)
        .join(LabSession, SessionAttendance.session_id == LabSession.id)
        .filter(SessionAttendance.student_id == student_id)
    )

    if scope_session_ids:
        q = q.filter(SessionAttendance.session_id.in_(scope_session_ids))
    elif institution_id:
        q = q.filter(LabSession.institution_id == institution_id)

    q = q.order_by(LabSession.scheduled_at.desc())
    records = q.all()

    scheduled_count = len(records)
    present_count = 0
    active_count = 0
    late_count = 0
    absent_count = 0
    partial_count = 0
    credit_sum = 0.0
    sessions_history = []

    # ONE attendance definition, shared with the instructor and institution
    # surfaces: present 1.0, late 0.8, partial 0.6, inactive 0.5, absent 0.
    ATT_CREDIT = ATT_CREDIT_MAP

    for att, sess in records:
        status = (att.status or 'absent').lower()
        credit = ATT_CREDIT.get(status, 0.0)
        credit_sum += credit
        is_pres = credit >= 0.5
        if status == 'present':
            present_count += 1
        elif status == 'late':
            present_count += 1
            late_count += 1
        elif status == 'partial':
            partial_count += 1
        else:
            absent_count += 1

        is_act = bool(att.is_active_participant)
        if is_act:
            active_count += 1

        exp_title = (getattr(sess, 'title', None)) or (
            sess.experiment.title if getattr(sess, 'experiment', None) else 'Lab Session'
        )
        sessions_history.append({
            'session_id': sess.id,
            'scheduled_at': sess.scheduled_at.isoformat() if sess.scheduled_at else None,
            'status': status,
            'is_present': is_pres,
            'is_active_participant': is_act,
            'total_time_seconds': att.total_time_seconds or 0,
            'is_catchup': bool(att.is_catchup),
            'experiment_id': sess.experiment_id,
            'experiment_title': exp_title,
        })

    rate = round(100.0 * (credit_sum / scheduled_count), 1) if scheduled_count > 0 else None
    active_rate = round(100.0 * (active_count / max(1, present_count)), 1) if present_count > 0 else None

    return {
        'scheduled': scheduled_count,
        'present': present_count,
        'late': late_count,
        'partial': partial_count,
        'absent': absent_count,
        'active_participants': active_count,
        'attendance_rate': rate,
        'active_rate': active_rate,
        'sessions': sessions_history[:50],  # Latest 50 sessions
    }


def get_student_360_overview(
    student_id: str,
    scope_level: str = 'subject',
    scope_id: Optional[str] = None,
    institution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Assembles the complete Student 360 profile payload including:
      - Student profile details
      - Completion metrics
      - Attendance metrics
      - Scoped grades & trends
      - Scoped concept mastery
      - Unified risk score & explainability
      - Multi-scope rankings
    """
    student = User.query.get(student_id)
    if not student:
        return {'error': 'Student not found'}

    iid = institution_id or student.institution_id

    # 1. Enrolled Section & Department metadata
    sec_student = SectionStudent.query.filter_by(student_id=student_id).first()
    sec_info = None
    if sec_student:
        sec = Section.query.get(sec_student.section_id)
        if sec:
            sec_info = {'id': sec.id, 'name': sec.name}

    dept_info = None
    if student.department_id:
        dept = Department.query.get(student.department_id)
        if dept:
            dept_info = {'id': dept.id, 'name': dept.name, 'code': dept.code}

    full_name = getattr(student, 'full_name', None) or getattr(student, 'name', None) or 'Student'
    student_profile = {
        'id': student.id,
        'name': full_name,
        'full_name': full_name,
        'email': student.email,
        'roll_number': student.roll_number,
        'avatar_url': getattr(student, 'avatar_url', None),
        'section': sec_info,
        'department': dept_info,
    }

    # 2. Completion Rollup
    completion = compute_student_completion_rollup(student_id, scope_level, scope_id, iid)

    # 3. Attendance Rollup
    attendance = compute_student_attendance_rollup(student_id, scope_level, scope_id, iid)

    # 4. Atomic metrics & Risk score
    start_dt = datetime.utcnow().replace(month=1, day=1) if datetime.utcnow().month > 6 else datetime.utcnow().replace(year=datetime.utcnow().year-1, month=7, day=1)
    end_dt = datetime.utcnow()
    atomic = compute_student_atomic_metrics(
        student_id=student_id,
        institution_id=iid,
        window_start=start_dt,
        window_end=end_dt,
    )
    risk = compute_student_risk(student_metrics=atomic)

    # 5. Scoped Mastery
    mastery = compute_scoped_mastery(
        student_id=student_id,
        scope_level=scope_level,
        scope_id=scope_id,
        institution_id=iid,
    )

    # 6. Multi-scope Rankings
    ranks = get_student_all_ranks(student_id=student_id, institution_id=iid)

    # 7. Grade summary & recent grades
    grades_rows = (
        Grade.query
        .filter(Grade.student_id == student_id, Grade.final_grade.isnot(None))
        .order_by(Grade.created_at.desc())
        .limit(20)
        .all()
    )
    grade_list = []
    for g in grades_rows:
        exp = getattr(g, 'experiment', None) or (Experiment.query.get(g.experiment_id) if g.experiment_id else None)
        exp_name = exp.title if exp else 'Experiment'
        grade_list.append({
            'experiment_id': g.experiment_id,
            'experiment_title': exp_name,
            'final_grade': float(g.final_grade),
            'auto_grade': float(g.auto_grade) if g.auto_grade is not None else None,
            'manual_grade': float(g.manual_grade) if g.manual_grade is not None else None,
            'created_at': g.created_at.isoformat() if g.created_at else None,
        })

    avg_grade = float(atomic.get('grade_avg', {}).get('value') or 0.0)

    return {
        'student': student_profile,
        'scope': {'level': scope_level, 'id': scope_id},
        'completion': completion,
        'attendance': attendance,
        'grades': {
            'avg_grade': avg_grade,
            'count': len(grade_list),
            'history': grade_list,
        },
        'mastery': mastery,
        'risk': risk,
        'ranks': ranks,
    }
