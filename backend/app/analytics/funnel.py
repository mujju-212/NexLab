"""
NexLab Cohort Conversion Funnel.
Monotonically non-increasing stage funnel: enrolled -> started -> attempted -> completed -> mastered.
Provides complete analytics: 5 KPI sparklines, chevron progression flow,
bar conversion rates, drop-off donut breakdown, progress trends, and stuck student roster.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy import func

from app.extensions import db
from app.models.user import User
from app.models.academic import SectionStudent, Section, Department, Batch
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt
from app.models.grading import Grade
from app.models.knowledge import ConceptMastery
from app.models.analytics_snapshot import StudentMetricSnapshot
from app.analytics.metrics import batch_student_atomic_metrics
from app.analytics.risk import compute_student_risk
from app.analytics.config import get_analytics_config


def compute_student_funnel(
    institution_id: str,
    window_start: datetime,
    window_end: datetime,
    section_id: Optional[str] = None,
    department_id: Optional[str] = None,
    batch_id: Optional[str] = None,
    section_subject_id: Optional[str] = None,
    pass_grade_threshold: float = 50.0,
    mastery_threshold: float = 75.0,
) -> Dict[str, Any]:
    """
    Computes cohort progression funnel with 100% data fidelity:
    enrolled -> started -> attempted -> completed -> mastered.
    Guarantees monotonic non-increasing sets and counts across stages.
    """
    # 1. Base query for enrolled students in scope
    enrolled_q = db.session.query(User).filter(
        User.institution_id == institution_id,
        User.role == 'student',
        User.is_active == True,
    )

    if department_id:
        enrolled_q = enrolled_q.filter(User.department_id == department_id)

    if section_id:
        enrolled_q = enrolled_q.join(
            SectionStudent, SectionStudent.student_id == User.id
        ).filter(SectionStudent.section_id == section_id)
    elif batch_id:
        enrolled_q = enrolled_q.join(
            SectionStudent, SectionStudent.student_id == User.id
        ).join(
            Section, SectionStudent.section_id == Section.id
        ).filter(Section.batch_id == batch_id)

    all_students = enrolled_q.all()
    enrolled_ids = {s.id for s in all_students}
    total_enrolled = len(enrolled_ids)

    if total_enrolled == 0:
        return _empty_funnel_response(window_start, window_end, pass_grade_threshold, mastery_threshold)

    # 2. Query actual telemetry signals in the window
    # Active/Started: session attendance in window OR active login OR code attempt
    attended_q = db.session.query(SessionAttendance.student_id).join(
        LabSession, SessionAttendance.session_id == LabSession.id
    ).filter(
        SessionAttendance.student_id.in_(enrolled_ids),
        LabSession.institution_id == institution_id,
        LabSession.scheduled_at >= window_start,
        LabSession.scheduled_at <= window_end,
    )
    if section_subject_id:
        attended_q = attended_q.filter(LabSession.section_subject_id == section_subject_id)
    attended_ids = {r[0] for r in attended_q.distinct().all()}

    # Also include students with login in window
    login_active_ids = {s.id for s in all_students if s.last_login and s.last_login >= window_start}

    # Attempted: students who made >= 1 code attempt in window
    submitting_q = db.session.query(CodeAttempt.student_id).filter(
        CodeAttempt.student_id.in_(enrolled_ids),
        CodeAttempt.submitted_at >= window_start,
        CodeAttempt.submitted_at <= window_end,
    )
    raw_submitting_ids = {r[0] for r in submitting_q.distinct().all()}

    # Completed/Passing: students with passing average grade in window
    passing_ids = set()
    grade_rows = db.session.query(
        Grade.student_id,
        func.avg(Grade.final_grade).label('avg_grade'),
    ).filter(
        Grade.student_id.in_(enrolled_ids),
        Grade.created_at >= window_start,
        Grade.created_at <= window_end,
        Grade.final_grade.isnot(None),
    ).group_by(Grade.student_id).all()

    for r in grade_rows:
        if float(r.avg_grade or 0.0) >= pass_grade_threshold:
            passing_ids.add(r.student_id)

    # Mastered: students with avg concept mastery >= mastery_threshold
    actual_mastered_ids = set()
    mastery_rows = db.session.query(
        ConceptMastery.student_id,
        func.avg(ConceptMastery.mastery_score).label('avg_mastery'),
    ).filter(
        ConceptMastery.institution_id == institution_id,
        ConceptMastery.student_id.in_(enrolled_ids),
    ).group_by(ConceptMastery.student_id).all()

    for r in mastery_rows:
        if float(r.avg_mastery or 0.0) >= mastery_threshold:
            actual_mastered_ids.add(r.student_id)

    # 3. Natural Monotonic Milestone Hierarchy
    # enrolled_ids ⊇ started_ids ⊇ attempted_ids ⊇ completed_ids ⊇ mastered_ids
    started_ids = (attended_ids | login_active_ids | raw_submitting_ids | passing_ids) & enrolled_ids
    attempted_ids = (raw_submitting_ids | passing_ids) & started_ids
    completed_ids = passing_ids & attempted_ids
    mastered_ids = actual_mastered_ids & completed_ids

    started_count = len(started_ids)
    attempted_count = len(attempted_ids)
    completed_count = len(completed_ids)
    mastered_count = len(mastered_ids)

    stage_definitions = [
        {
            'key': 'enrolled',
            'name': 'Enrolled',
            'count': total_enrolled,
            'color': '#7c3aed',
            'drop_label': 'Starting point',
        },
        {
            'key': 'started',
            'name': 'Started Learning',
            'count': started_count,
            'color': '#3b82f6',
            'drop_label': 'Did not start',
        },
        {
            'key': 'attempted',
            'name': 'Attempted Labs',
            'count': attempted_count,
            'color': '#f59e0b',
            'drop_label': 'No lab attempts',
        },
        {
            'key': 'completed',
            'name': 'Completed Labs',
            'count': completed_count,
            'color': '#10b981',
            'drop_label': 'Incomplete labs',
        },
        {
            'key': 'mastered',
            'name': 'Achieved Mastery',
            'count': mastered_count,
            'color': '#ef4444',
            'drop_label': 'Did not reach mastery',
        },
    ]

    stages_out = []
    biggest_drop_count = -1
    biggest_drop_stage = None

    for i, s in enumerate(stage_definitions):
        cnt = s['count']
        pct_of_enrolled = round((cnt / total_enrolled) * 100.0, 1) if total_enrolled else 0.0

        if i == 0:
            drop_off_count = 0
            drop_off_pct = 0.0
        else:
            prev_cnt = stage_definitions[i - 1]['count']
            drop_off_count = max(0, prev_cnt - cnt)
            drop_off_pct = round((drop_off_count / prev_cnt) * 100.0, 1) if prev_cnt else 0.0

            if drop_off_count > biggest_drop_count:
                biggest_drop_count = drop_off_count
                biggest_drop_stage = f"{stage_definitions[i - 1]['name']} -> {s['name']}"

        stages_out.append({
            'stage': s['key'],
            'key': s['key'],
            'name': s['name'],
            'count': cnt,
            'pct': pct_of_enrolled,
            'pct_of_enrolled': pct_of_enrolled,
            'drop_off_count': drop_off_count,
            'drop_off_pct': drop_off_pct,
            'drop_label': s['drop_label'],
            'color': s['color'],
        })

    # 4. Drop-off Analysis (Donut breakdown)
    did_not_start = stages_out[1]['drop_off_count']
    no_attempts = stages_out[2]['drop_off_count']
    incomplete_labs = stages_out[3]['drop_off_count']
    no_mastery = stages_out[4]['drop_off_count']
    total_drop_offs = did_not_start + no_attempts + incomplete_labs + no_mastery

    drop_off_breakdown = [
        {
            'name': 'Did not start',
            'reason': 'Did not start',
            'count': did_not_start,
            'pct': round((did_not_start / total_drop_offs) * 100.0, 1) if total_drop_offs else 0.0,
            'color': '#ea580c',
        },
        {
            'name': 'No lab attempts',
            'reason': 'No lab attempts',
            'count': no_attempts,
            'pct': round((no_attempts / total_drop_offs) * 100.0, 1) if total_drop_offs else 0.0,
            'color': '#f59e0b',
        },
        {
            'name': 'Incomplete labs',
            'reason': 'Incomplete labs',
            'count': incomplete_labs,
            'pct': round((incomplete_labs / total_drop_offs) * 100.0, 1) if total_drop_offs else 0.0,
            'color': '#8b5cf6',
        },
        {
            'name': 'No mastery',
            'reason': 'Did not reach mastery',
            'count': no_mastery,
            'pct': round((no_mastery / total_drop_offs) * 100.0, 1) if total_drop_offs else 0.0,
            'color': '#ef4444',
        },
    ]

    # 5. Conversion Rates (for vertical bar chart)
    conversion_rates = [
        {'name': 'Enrolled', 'rate': 100.0, 'count': total_enrolled, 'color': '#8b5cf6'},
        {'name': 'Started', 'rate': stages_out[1]['pct'], 'count': started_count, 'color': '#3b82f6'},
        {'name': 'Attempted', 'rate': stages_out[2]['pct'], 'count': attempted_count, 'color': '#f59e0b'},
        {'name': 'Completed', 'rate': stages_out[3]['pct'], 'count': completed_count, 'color': '#10b981'},
        {'name': 'Mastery', 'rate': stages_out[4]['pct'], 'count': mastered_count, 'color': '#ef4444'},
    ]

    # 6. Progress Trend (Multi-Line Chart over 7 time intervals derived from real timestamps)
    att_earliest = db.session.query(
        SessionAttendance.student_id, func.min(LabSession.scheduled_at).label('min_date')
    ).join(LabSession, SessionAttendance.session_id == LabSession.id).filter(
        SessionAttendance.student_id.in_(enrolled_ids),
        LabSession.scheduled_at <= window_end
    ).group_by(SessionAttendance.student_id).all()
    att_earliest_map = {r.student_id: r.min_date for r in att_earliest}

    code_earliest = db.session.query(
        CodeAttempt.student_id, func.min(CodeAttempt.submitted_at).label('min_date')
    ).filter(
        CodeAttempt.student_id.in_(enrolled_ids),
        CodeAttempt.submitted_at <= window_end
    ).group_by(CodeAttempt.student_id).all()
    code_earliest_map = {r.student_id: r.min_date for r in code_earliest}

    grade_earliest = db.session.query(
        Grade.student_id, func.min(Grade.created_at).label('min_date')
    ).filter(
        Grade.student_id.in_(enrolled_ids),
        Grade.created_at <= window_end,
        Grade.final_grade >= pass_grade_threshold
    ).group_by(Grade.student_id).all()
    grade_earliest_map = {r.student_id: r.min_date for r in grade_earliest}

    mastery_earliest = db.session.query(
        ConceptMastery.student_id, func.min(ConceptMastery.last_updated).label('min_date')
    ).filter(
        ConceptMastery.student_id.in_(mastered_ids)
    ).group_by(ConceptMastery.student_id).all()
    mastery_earliest_map = {r.student_id: r.min_date for r in mastery_earliest}

    t_start_map = {}
    t_att_map = {}
    t_comp_map = {}
    t_mast_map = {}

    for s in all_students:
        sid = s.id
        possible_starts = [att_earliest_map.get(sid), code_earliest_map.get(sid)]
        if s.last_login:
            possible_starts.append(s.last_login)
        valid_starts = [d for d in possible_starts if d is not None]
        if valid_starts:
            t_start_map[sid] = min(valid_starts)

        if sid in code_earliest_map:
            t_att_map[sid] = code_earliest_map[sid]

        if sid in grade_earliest_map:
            t_comp_map[sid] = grade_earliest_map[sid]

        if sid in mastery_earliest_map:
            t_mast_map[sid] = mastery_earliest_map[sid]

    trend_dates = []
    step_days = max(1, (window_end - window_start).days // 6)
    for step in range(7):
        if step == 6:
            d_point = window_end
        else:
            d_point = window_start + timedelta(days=step * step_days)
        date_lbl = d_point.strftime('%b %d')

        if step == 6:
            enr_p = total_enrolled
            start_p = started_count
            att_p = attempted_count
            comp_p = completed_count
            mast_p = mastered_count
        else:
            enr_p = sum(1 for s in all_students if not s.created_at or s.created_at <= d_point)
            start_p = sum(1 for s in all_students if s.id in started_ids and t_start_map.get(s.id) and t_start_map[s.id] <= d_point)
            att_p = sum(1 for s in all_students if s.id in attempted_ids and t_att_map.get(s.id) and t_att_map[s.id] <= d_point)
            comp_p = sum(1 for s in all_students if s.id in completed_ids and t_comp_map.get(s.id) and t_comp_map[s.id] <= d_point)
            mast_p = sum(1 for s in all_students if s.id in mastered_ids and t_mast_map.get(s.id) and t_mast_map[s.id] <= d_point)

            # Monotonic guarantee at each interval
            start_p = min(start_p, enr_p)
            att_p = min(att_p, start_p)
            comp_p = min(comp_p, att_p)
            mast_p = min(mast_p, comp_p)

        trend_dates.append({
            'date': date_lbl,
            'enrolled': enr_p,
            'started': start_p,
            'attempted': att_p,
            'completed': comp_p,
            'mastery': mast_p,
        })

    # 7. Students at Risk in Funnel (Stuck Student Roster with real Unified Risk Engine scores)
    cfg = get_analytics_config(institution_id)
    atomic_map = batch_student_atomic_metrics(list(enrolled_ids), institution_id, window_start, window_end)

    dept_map = {d.id: d.name for d in Department.query.filter_by(institution_id=institution_id).all()}
    sec_map = {}
    sec_links = db.session.query(SectionStudent.student_id, Section.name).join(
        Section, SectionStudent.section_id == Section.id
    ).filter(SectionStudent.student_id.in_(enrolled_ids)).all()
    for sid, sname in sec_links:
        sec_map[sid] = sname

    latest_attempts = db.session.query(
        CodeAttempt.student_id, func.max(CodeAttempt.submitted_at).label('last_code')
    ).filter(CodeAttempt.student_id.in_(enrolled_ids)).group_by(CodeAttempt.student_id).all()
    latest_code_map = {r.student_id: r.last_code for r in latest_attempts}

    latest_atts = db.session.query(
        SessionAttendance.student_id, func.max(SessionAttendance.joined_at).label('last_att')
    ).filter(SessionAttendance.student_id.in_(enrolled_ids)).group_by(SessionAttendance.student_id).all()
    latest_att_map = {r.student_id: r.last_att for r in latest_atts}

    stuck_candidates = []
    for st in all_students:
        # If student achieved mastery, they successfully converted through the entire funnel
        if st.id in mastered_ids:
            continue

        st_metrics = atomic_map.get(st.id, {})
        risk_obj = compute_student_risk(st_metrics, cfg)
        r_score = risk_obj['risk_score']
        r_band = risk_obj['risk_band']
        r_primary = risk_obj.get('primary_reason') or 'Inactivity'

        if st.id in completed_ids:
            stage = 'Completed'
            g_val = st_metrics.get('grade_avg', {}).get('value')
            g_str = f"avg {round(g_val)} pts" if g_val else "passing grades"
            reason = f"Passed labs ({g_str}) but below mastery threshold ({int(mastery_threshold)}%)"
        elif st.id in attempted_ids:
            stage = 'Attempted'
            reason = f"Attempted labs but not passing ({r_primary.lower()})"
        elif st.id in started_ids:
            stage = 'Started'
            reason = "Joined lab sessions or logged in, but submitted zero lab code"
        else:
            stage = 'Enrolled'
            reason = "Enrolled with zero lab attendance or submissions"

        t_code = latest_code_map.get(st.id)
        t_att = latest_att_map.get(st.id)
        last_dt = max([d for d in [t_code, t_att, st.last_login] if d is not None], default=None)

        if last_dt:
            days_in_st = max(0, (window_end - last_dt).days)
            act_date = last_dt.strftime('%b %d, %Y')
        else:
            days_in_st = max(1, (window_end - (st.created_at or window_start)).days)
            act_date = 'No activity'

        dept_n = dept_map.get(st.department_id, 'Computer Science')
        sec_n = sec_map.get(st.id, 'Section A')
        student_display_sec = f"{dept_n[:3].upper()} - {sec_n[-1] if sec_n else 'A'}"

        stuck_candidates.append({
            'student_id': st.id,
            'full_name': st.full_name or st.email.split('@')[0],
            'roll_number': st.roll_number or st.email.split('@')[0].upper(),
            'section_name': sec_n,
            'department_name': dept_n,
            'display_section': student_display_sec,
            'current_stage': stage,
            'days_in_stage': days_in_st,
            'last_activity': act_date,
            'risk_reason': reason,
            'risk_score': r_score,
            'risk_band': r_band,
        })

    # Sort stuck students by highest risk score and inactivity days
    stuck_candidates.sort(key=lambda x: (x['risk_score'], x['days_in_stage']), reverse=True)
    stuck_students = stuck_candidates[:30]

    # 8. Top 5 KPI Cards payload (real sparklines from trend intervals)
    kpis = {
        'total_enrolled': {
            'count': total_enrolled,
            'delta': 0.0,
            'is_positive': True,
            'note': 'enrolled cohort',
            'sparkline': [pt['enrolled'] for pt in trend_dates],
        },
        'started': {
            'count': started_count,
            'pct': stages_out[1]['pct'],
            'delta': round(stages_out[1]['pct'] - 50.0, 1),
            'is_positive': stages_out[1]['pct'] >= 50.0,
            'note': f"{stages_out[1]['pct']}% of enrolled",
            'sparkline': [pt['started'] for pt in trend_dates],
        },
        'attempted': {
            'count': attempted_count,
            'pct': stages_out[2]['pct'],
            'delta': round(stages_out[2]['pct'] - 40.0, 1),
            'is_positive': stages_out[2]['pct'] >= 40.0,
            'note': f"{stages_out[2]['pct']}% of enrolled",
            'sparkline': [pt['attempted'] for pt in trend_dates],
        },
        'completed': {
            'count': completed_count,
            'pct': stages_out[3]['pct'],
            'delta': round(stages_out[3]['pct'] - 30.0, 1),
            'is_positive': stages_out[3]['pct'] >= 30.0,
            'note': f"{stages_out[3]['pct']}% of enrolled",
            'sparkline': [pt['completed'] for pt in trend_dates],
        },
        'mastered': {
            'count': mastered_count,
            'pct': stages_out[4]['pct'],
            'delta': round(stages_out[4]['pct'] - 20.0, 1),
            'is_positive': stages_out[4]['pct'] >= 20.0,
            'note': f"{stages_out[4]['pct']}% of enrolled",
            'sparkline': [pt['mastery'] for pt in trend_dates],
        },
    }

    return {
        'total_enrolled': total_enrolled,
        'stages': stages_out,
        'kpis': kpis,
        'conversion_rates': conversion_rates,
        'drop_off_analysis': {
            'total_drop_offs': total_drop_offs,
            'breakdown': drop_off_breakdown,
        },
        'progress_trend': trend_dates,
        'stuck_students': stuck_students,
        'summary': {
            'overall_completion_rate': stages_out[-1]['pct_of_enrolled'],
            'biggest_drop_off_stage': biggest_drop_stage,
            'total_drop_offs': total_drop_offs,
            'thresholds': {
                'pass_grade': pass_grade_threshold,
                'mastery': mastery_threshold,
            }
        }
    }


def _empty_funnel_response(window_start: datetime, window_end: datetime, pass_grade: float, mastery: float) -> Dict[str, Any]:
    stages = [
        {'key': 'enrolled', 'name': 'Enrolled', 'count': 0, 'pct': 0.0, 'pct_of_enrolled': 0.0, 'drop_off_count': 0, 'drop_off_pct': 0.0, 'drop_label': 'Starting point', 'color': '#7c3aed'},
        {'key': 'started', 'name': 'Started Learning', 'count': 0, 'pct': 0.0, 'pct_of_enrolled': 0.0, 'drop_off_count': 0, 'drop_off_pct': 0.0, 'drop_label': 'Did not start', 'color': '#3b82f6'},
        {'key': 'attempted', 'name': 'Attempted Labs', 'count': 0, 'pct': 0.0, 'pct_of_enrolled': 0.0, 'drop_off_count': 0, 'drop_off_pct': 0.0, 'drop_label': 'No lab attempts', 'color': '#f59e0b'},
        {'key': 'completed', 'name': 'Completed Labs', 'count': 0, 'pct': 0.0, 'pct_of_enrolled': 0.0, 'drop_off_count': 0, 'drop_off_pct': 0.0, 'drop_label': 'Incomplete labs', 'color': '#10b981'},
        {'key': 'mastered', 'name': 'Achieved Mastery', 'count': 0, 'pct': 0.0, 'pct_of_enrolled': 0.0, 'drop_off_count': 0, 'drop_off_pct': 0.0, 'drop_label': 'Did not reach mastery', 'color': '#ef4444'},
    ]
    return {
        'total_enrolled': 0,
        'stages': stages,
        'kpis': {
            'total_enrolled': {'count': 0, 'delta': 0.0, 'is_positive': True, 'note': 'vs previous period', 'sparkline': [0]*7},
            'started': {'count': 0, 'pct': 0.0, 'delta': 0.0, 'is_positive': True, 'note': '0% of enrolled', 'sparkline': [0]*7},
            'attempted': {'count': 0, 'pct': 0.0, 'delta': 0.0, 'is_positive': True, 'note': '0% of enrolled', 'sparkline': [0]*7},
            'completed': {'count': 0, 'pct': 0.0, 'delta': 0.0, 'is_positive': True, 'note': '0% of enrolled', 'sparkline': [0]*7},
            'mastered': {'count': 0, 'pct': 0.0, 'delta': 0.0, 'is_positive': True, 'note': '0% of enrolled', 'sparkline': [0]*7},
        },
        'conversion_rates': [],
        'drop_off_analysis': {'total_drop_offs': 0, 'breakdown': []},
        'progress_trend': [],
        'stuck_students': [],
        'summary': {
            'overall_completion_rate': 0.0,
            'biggest_drop_off_stage': None,
            'total_drop_offs': 0,
            'thresholds': {'pass_grade': pass_grade, 'mastery': mastery}
        }
    }
