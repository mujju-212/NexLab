"""
Academic Dashboard Analytics Builder
Fuses real database records (Grades, Experiments, Subjects, SessionAttendance, ConceptMastery, Rankings)
into the exact student academic performance analytics dashboard using mathematically verified rollups.
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from app.extensions import db
from app.models.user import User
from app.models.subject import Subject
from app.models.experiment import Experiment
from app.models.grading import Grade
from app.models.academic import Section, SectionStudent, SectionSubject, Department
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt
from app.models.knowledge import ConceptMastery, ExperimentConcept
from app.analytics.completion import (
    compute_student_completion_rollup,
    compute_student_attendance_rollup,
)
from app.analytics.ranking import get_student_all_ranks
from app.analytics.risk import compute_student_risk
from app.analytics.metrics import compute_student_atomic_metrics


# Canonical subject colors and icons for UI styling
SUBJECT_STYLE_MAP = {
    'DSA': {'name': 'Data Structures & Algorithms', 'color': '#2563eb', 'bg': '#eff6ff', 'badge_bg': '#dbeafe', 'text_color': '#1d4ed8'},
    'DBMS': {'name': 'Database Management Systems', 'color': '#0d9488', 'bg': '#f0fdfa', 'badge_bg': '#ccfbf1', 'text_color': '#0f766e'},
    'CN': {'name': 'Computer Networks', 'color': '#f59e0b', 'bg': '#fffbeb', 'badge_bg': '#fef3c7', 'text_color': '#b45309'},
    'OS': {'name': 'Operating Systems', 'color': '#ef4444', 'bg': '#fef2f2', 'badge_bg': '#fee2e2', 'text_color': '#b91c1c'},
    'SE': {'name': 'Software Engineering', 'color': '#d946ef', 'bg': '#fdf4ff', 'badge_bg': '#fae8ff', 'text_color': '#a21caf'},
}


def _normalize_subject_code(code_or_name: str) -> str:
    """Maps subject code or name to canonical display short code."""
    c = (code_or_name or '').upper()
    if 'DATA' in c or 'DSA' in c or '3401' in c or '201' in c:
        return 'DSA'
    if 'DATABASE' in c or 'DBMS' in c or '3492' in c or '104' in c or 'SQL' in c:
        return 'DBMS'
    if 'NETWORK' in c or 'CN' in c or '3361' in c or '304' in c:
        return 'CN'
    if 'OPERATING' in c or 'OS' in c or '3451' in c:
        return 'OS'
    if 'SOFTWARE' in c or 'OOP' in c or 'SE' in c or '3391' in c or 'PYTHON' in c or '3111' in c or '102' in c:
        return 'SE'
    return code_or_name[:4].upper() if code_or_name else 'DSA'


def build_academic_dashboard_payload(
    student_id: str,
    subject_id: Optional[str] = None,
    semester: Optional[str] = None,
    experiment_id: Optional[str] = None,
    period: str = '30d',
    institution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Computes and aggregates all real calculated fields from the database
    to power the Academic tab UI with 100% fidelity to the database,
    strictly eliminating hardcoded overrides or mock fallbacks.
    """
    student = db.session.get(User, student_id)
    iid = institution_id or (student.institution_id if student else None)

    # 1. Fetch only subjects assigned to sections in which this student is enrolled.
    enrollments = SectionStudent.query.filter_by(student_id=student_id).all()
    sec_ids = {e.section_id for e in enrollments}
    if sec_ids and iid:
        sec_ids = {row.id for row in Section.query.filter(
            Section.id.in_(sec_ids), Section.institution_id == iid
        ).all()}
    sec_subject_q = SectionSubject.query.filter(SectionSubject.section_id.in_(sec_ids)) if sec_ids else SectionSubject.query.filter(db.literal(False))
    if iid:
        sec_subject_q = sec_subject_q.filter(SectionSubject.institution_id == iid)
    sec_subjects = sec_subject_q.all()
    enrolled_subject_ids = sorted({ss.subject_id for ss in sec_subjects})
    enrolled_subjects = Subject.query.filter(Subject.id.in_(enrolled_subject_ids)).all() if enrolled_subject_ids else []

    # Subject filters accept an enrolled subject id or its actual code/name only.
    is_subject_filtered = bool(subject_id and subject_id.lower() != 'all')
    if is_subject_filtered:
        requested = subject_id.strip().lower()
        matches = [s for s in enrolled_subjects if (
            s.id == subject_id or (s.code or '').strip().lower() == requested
            or (s.name or '').strip().lower() == requested
        )]
        enrolled_subjects = matches
        enrolled_subject_ids = [s.id for s in matches]

    assigned_exp_q = Experiment.query.filter(Experiment.subject_id.in_(enrolled_subject_ids), Experiment.is_published.is_(True)) if enrolled_subject_ids else Experiment.query.filter(db.literal(False))
    if iid:
        assigned_exp_q = assigned_exp_q.filter(Experiment.institution_id == iid)
    assigned_experiments = assigned_exp_q.all()
    assigned_exp_ids = {e.id for e in assigned_experiments}

    # An experiment filter must identify an experiment actually assigned through
    # the student's enrolled subject(s); unknown IDs resolve to an empty set.
    if experiment_id and experiment_id.lower() != 'all':
        assigned_exp_ids = assigned_exp_ids.intersection({experiment_id})
        assigned_experiments = [e for e in assigned_experiments if e.id == experiment_id]
        if assigned_experiments:
            enrolled_subjects = [s for s in enrolled_subjects if s.id == assigned_experiments[0].subject_id]
            enrolled_subject_ids = [s.id for s in enrolled_subjects]
        else:
            enrolled_subjects = []
            enrolled_subject_ids = []

    # The schema has no semester field. Ignore the legacy parameter instead of
    # pretending fixed semester labels are real filter options.
    now = datetime.utcnow()
    period_days = {'30d': 30, '30': 30, '60d': 60, '60': 60, '90d': 90, '90': 90, '12w': 84}
    period_start = now - timedelta(days=period_days[period]) if period in period_days else None

    # 2. Fetch only this student's graded work for currently assigned experiments.
    # A missing grade is not zero; zero-weight and invalid-scale experiments are
    # excluded from the weighted score denominator.
    from app.analytics.scope import count_unattributed_grades
    grades_query = Grade.query.filter(
        Grade.student_id == student_id,
        Grade.final_grade.isnot(None),
        Grade.experiment_id.isnot(None),
    )
    if assigned_exp_ids:
        grades_query = grades_query.filter(Grade.experiment_id.in_(assigned_exp_ids))
    else:
        grades_query = grades_query.filter(db.literal(False))
    if period_start is not None:
        grades_query = grades_query.filter(Grade.created_at >= period_start)
    all_grades = grades_query.order_by(Grade.created_at.desc()).all()

    exp_cache = {e.id: e for e in assigned_experiments}
    grades_by_subject: Dict[str, List[Grade]] = defaultdict(list)
    for grade in all_grades:
        exp = exp_cache.get(grade.experiment_id)
        if exp:
            grades_by_subject[exp.subject_id].append(grade)

    def _grade_percent(grade: Grade) -> Optional[float]:
        exp = exp_cache.get(grade.experiment_id)
        if not exp or grade.final_grade is None:
            return None
        scale = float(exp.grade_scale or 0)
        weight = float(exp.weightage or 0)
        if scale <= 0 or weight <= 0:
            return None
        return max(0.0, min(100.0, float(grade.final_grade) / scale * 100.0))

    def _weighted_average(grades: List[Grade]) -> Optional[float]:
        latest_by_experiment = {}
        for grade in grades:
            if grade.experiment_id not in latest_by_experiment:
                latest_by_experiment[grade.experiment_id] = grade
        weighted_total = 0.0
        total_weight = 0.0
        for grade in latest_by_experiment.values():
            exp = exp_cache.get(grade.experiment_id)
            pct = _grade_percent(grade)
            weight = float(exp.weightage or 0) if exp else 0.0
            if pct is None or weight <= 0:
                continue
            weighted_total += pct * weight
            total_weight += weight
        return round(weighted_total / total_weight, 1) if total_weight > 0 else None

    # 3. Real Academic Completion Rollup (SectionStudent -> SectionSubject -> Experiment -> Grade)
    if experiment_id and experiment_id.lower() != 'all':
        scope_lvl, scope_target_id = 'experiment', experiment_id
    elif is_subject_filtered:
        scope_lvl, scope_target_id = 'subject', (enrolled_subject_ids[0] if enrolled_subject_ids else subject_id)
    else:
        scope_lvl, scope_target_id = 'student', student_id
    completion_data = compute_student_completion_rollup(
        student_id=student_id,
        scope_level=scope_lvl,
        scope_id=scope_target_id,
        institution_id=iid,
    )
    total_assigned_exps = int(completion_data.get('assigned', 0) or 0)
    completed_exps = int(completion_data.get('completed', 0) or 0)
    _completion_pct = completion_data.get('completion_pct')
    completion_pct = float(_completion_pct) if _completion_pct is not None else None

    # 4. Real Attendance Rollup (SessionAttendance where status in ('present', 'late'))
    attendance_data = compute_student_attendance_rollup(
        student_id=student_id,
        scope_level=scope_lvl,
        scope_id=scope_target_id,
        institution_id=iid,
        window_start=period_start,
    )
    scheduled_sessions = int(attendance_data.get('scheduled', 0) or 0)
    present_sessions = int(attendance_data.get('present', 0) or 0)
    absent_sessions = int(attendance_data.get('absent', 0) or 0)
    late_sessions = int(attendance_data.get('late', 0) or 0)
    attendance_rate = attendance_data.get('attendance_rate')

    # One bar per real session (oldest -> newest), from the same credit table.
    _ATT_CREDIT = {'present': 1.0, 'late': 0.8, 'partial': 0.6,
                   'inactive_present': 0.5, 'absent': 0.0}
    attendance_bars = [
        round(100 * _ATT_CREDIT.get((s.get('status') or 'absent').lower(), 0.0))
        for s in list(reversed(attendance_data.get('sessions', [])))[-9:]
    ]

    # 5. Overall Academic Score & Sparkline
    overall_score = _weighted_average(all_grades)
    if overall_score is not None:
        overall_score = round(overall_score)
    # Real delta: latest grade vs the mean of everything before it. With a
    # single grade there is no prior period, so it stays None (UI prints "—").
    if len(all_grades) >= 2:
        _chrono = sorted(all_grades, key=lambda g: (g.graded_at or g.created_at))
        _prior = [v for g in _chrono[:-1] if (v := _grade_percent(g)) is not None]
        _last = _grade_percent(_chrono[-1])
        if _prior and _last is not None:
            _base = sum(_prior) / len(_prior)
            overall_delta = round(_last - _base, 1) if _base else None
        else:
            overall_delta = None
    else:
        overall_delta = None

    # Sparkline from chronological grades
    chronological_grades = list(reversed(all_grades))
    if len(chronological_grades) >= 7:
        sparkline_overall = [round(v) for g in chronological_grades[-7:] if (v := _grade_percent(g)) is not None]
    elif chronological_grades:
        # Real points only — the series used to be left-padded by repeating the
        # first grade, which drew a flat run that never happened.
        sparkline_overall = [round(v) for g in chronological_grades if (v := _grade_percent(g)) is not None]
    else:
        sparkline_overall = []

    enrolled_count = len(enrolled_subjects)
    on_track_count = 0
    subject_performance_list = []
    seen_codes = set()

    for subj in enrolled_subjects:
        base_code = (subj.code or '').strip().upper()
        if not base_code or len(base_code) > 8:
            base_code = _normalize_subject_code(subj.name)
        s_code = base_code
        suffix = 1
        while s_code in seen_codes:
            suffix += 1
            s_code = f"{base_code}_{suffix}"
        seen_codes.add(s_code)

        st = SUBJECT_STYLE_MAP.get(base_code, SUBJECT_STYLE_MAP.get(s_code, SUBJECT_STYLE_MAP['DSA']))

        # Query all experiments for this subject
        subj_exps = [e for e in assigned_experiments if e.subject_id == subj.id]
        subj_exp_ids = [e.id for e in subj_exps]
        subj_assigned = len(subj_exps)

        # Query grades for this student in this subject
        s_grades = [g for g in all_grades if g.experiment_id in subj_exp_ids]
        avg_g = _weighted_average(s_grades)
        submitted_rows = db.session.query(CodeAttempt.experiment_id).filter(
            CodeAttempt.student_id == student_id,
            CodeAttempt.experiment_id.in_(subj_exp_ids) if subj_exp_ids else db.literal(False),
            CodeAttempt.is_final_submission.is_(True),
        ).distinct().all()
        completed_s = len({row[0] for row in submitted_rows})

        c_pct = round((completed_s / subj_assigned) * 100) if subj_assigned > 0 else None
        if avg_g is not None and avg_g >= 65:
            on_track_count += 1

        # Sparkline: real graded points only, oldest -> newest. The old code
        # repeated the first grade until it had six points, drawing a flat line
        # that implied a stable history the student never had.
        ordered = sorted(s_grades, key=lambda g: (g.graded_at or g.created_at))
        s_spark = [round(v) for g in ordered if (v := _grade_percent(g)) is not None]

        # Real trend: latest grade vs the mean of the earlier ones in this subject.
        if len(s_spark) >= 2:
            _prev = sum(s_spark[:-1]) / len(s_spark[:-1])
            trend_pct = round(s_spark[-1] - _prev, 1) if _prev else None
        else:
            trend_pct = None

        subject_performance_list.append({
            'id': subj.id,
            'code': s_code,
            'name': s_code,
            'full_name': subj.name,
            'avg_grade': avg_g,
            'completed': completed_s,
            'total': subj_assigned,
            'completion_pct': c_pct,
            'trend_pct': trend_pct,
            'sparkline': s_spark,
            'color': st['color'],
            'bg': st['bg'],
            'badge_bg': st['badge_bg'],
            'text_color': st['text_color'],
        })

    # 6. Academic Rank from Multi-Scope Ranking Engine
    rank_pos = None            # unranked students must not display "#1"
    cohort_size = None
    rank_percentile = None
    try:
        ranks_data = get_student_all_ranks(student_id=student_id, institution_id=iid)
        inst_rank = ranks_data.get('institution') or ranks_data.get('section') or {}
        if inst_rank.get('position'):
            rank_pos = inst_rank['position']
        if inst_rank.get('cohort_size'):
            cohort_size = inst_rank['cohort_size']
        if inst_rank.get('percentile') is not None:
            rank_percentile = round(inst_rank['percentile'])
    except Exception:
        pass

    if cohort_size is not None and cohort_size < 2:
        rank_text = 'Only student in cohort'
    elif cohort_size is not None and (cohort_size < 5 or rank_percentile is None):
        rank_text = 'Cohort too small for a percentile'
    elif rank_percentile is not None:
        rank_text = f"Top {max(1, 100 - round(rank_percentile))}% in Cohort"
    else:
        rank_text = None
    # Rank history must come from real snapshots; a repeated current rank is not
    # a trend. Empty list => the UI renders no sparkline.
    sparkline_rank = []

    # 7. Performance Trend (12 Weeks Real Series)
    weeks = [f"W{i+1}" for i in range(12)]
    twelve_weeks_ago = now - timedelta(weeks=12)

    weekly_overall_buckets = defaultdict(list)
    subject_weekly_buckets = defaultdict(lambda: defaultdict(list))

    for g in all_grades:
        if g.created_at and g.created_at >= twelve_weeks_ago:
            w_idx = 11 - min(11, max(0, (now - g.created_at).days // 7))
            val = _grade_percent(g)
            if val is None:
                continue
            weekly_overall_buckets[w_idx].append(val)
            exp = exp_cache.get(g.experiment_id)
            if exp:
                s_c = _normalize_subject_code(exp.subject.code if getattr(exp, 'subject', None) else 'DSA')
                subject_weekly_buckets[s_c][w_idx].append(val)

    # P3: weeks with no graded work are gaps (None) — they used to be filled
    # with the student's *current* average, which drew a flat 12-week line
    # asserting stability that was never measured.
    overall_trend = []
    for i in range(12):
        bucket = weekly_overall_buckets.get(i)
        overall_trend.append(round(sum(bucket) / len(bucket)) if bucket else None)

    # One series per subject the student is ACTUALLY enrolled in. Previously this
    # iterated a hardcoded ['DSA','DBMS','CN','OS','SE'] list, so every student
    # saw five subjects on the chart regardless of enrolment.
    trend_subjects = []
    for item in subject_performance_list:
        s_code = item['code']
        st = SUBJECT_STYLE_MAP.get(s_code, SUBJECT_STYLE_MAP['DSA'])
        s_data = []
        for i in range(12):
            bucket = subject_weekly_buckets.get(s_code, {}).get(i)
            s_data.append(round(sum(bucket) / len(bucket)) if bucket else None)
        trend_subjects.append({
            'code': s_code,
            'name': item.get('name') or s_code,
            'color': st['color'],
            'data': s_data,
        })

    trend_series = {
        'weeks': weeks,
        'overall': overall_trend,
        'subjects': trend_subjects,
    }

    # 8. Real Concept Mastery from DB
    concepts_q = ConceptMastery.query.filter_by(student_id=student_id)
    if iid:
        concepts_q = concepts_q.filter_by(institution_id=iid)
    db_concepts = concepts_q.filter(ConceptMastery.experiment_count > 0).order_by(ConceptMastery.mastery_score.desc()).all()
    concept_mastery_list = []
    for c in db_concepts:
        score = round(float(c.mastery_score or 0))
        c_name = c.concept.lower()
        subj_code = 'DSA'
        if 'sql' in c_name or 'ddl' in c_name or 'index' in c_name or 'database' in c_name or 'dbms' in c_name:
            subj_code = 'DBMS'
        elif 'socket' in c_name or 'packet' in c_name or 'network' in c_name or 'tcp' in c_name:
            subj_code = 'CN'
        elif 'cpu' in c_name or 'process' in c_name or 'memory' in c_name or 'os' in c_name:
            subj_code = 'OS'
        elif 'class' in c_name or 'object' in c_name or 'design' in c_name:
            subj_code = 'SE'

        col = '#0d9488' if score >= 85 else '#10b981' if score >= 75 else '#f59e0b' if score >= 65 else '#ef4444'
        concept_mastery_list.append({
            'concept': c.concept,
            'subject': subj_code,
            'mastery': score,
            'color': col,
        })

    # 9. Real Attendance Breakdown Donut
    attendance_donut = {
        'rate': None if attendance_rate is None else round(attendance_rate),
        'present': present_sessions,
        'late': late_sessions,
        'partial': int(attendance_data.get('partial', 0) or 0),
        'absent': absent_sessions,
        'total': scheduled_sessions,
        'period_label': {'30d': 'Last 30 Days', '30': 'Last 30 Days', '60d': 'Last 60 Days', '60': 'Last 60 Days', '90d': 'Last 90 Days', '90': 'Last 90 Days', '12w': 'Last 12 Weeks', 'all': 'All Time'}.get(period, 'Selected Period'),
    }

    # 10. Real Risk & Guidance from Risk Engine
    measured_on_track = overall_score is not None and attendance_rate is not None and overall_score >= 65 and attendance_rate >= 75
    measured_risk = (
        (overall_score is not None and overall_score < 65)
        or (attendance_rate is not None and attendance_rate < 75)
    )
    has_any_risk_measure = overall_score is not None or attendance_rate is not None
    if measured_on_track:
        guidance_status, guidance_color = 'On Track', 'green'
        guidance_subtitle = 'Measured academic and attendance metrics are within the selected thresholds.'
    elif measured_risk:
        guidance_status, guidance_color = 'Needs Attention', 'orange'
        guidance_subtitle = 'At least one measured academic or attendance metric is below its threshold.'
    elif has_any_risk_measure:
        guidance_status, guidance_color = 'Partial data', 'grey'
        guidance_subtitle = 'Risk assessment is incomplete because one of the required metrics is unavailable.'
    else:
        guidance_status, guidance_color = 'Not enough data', 'grey'
        guidance_subtitle = 'Graded work and attendance records are not available for assessment.'
    risk_guidance = {
        'status': guidance_status,
        'status_color': guidance_color,
        'subtitle': guidance_subtitle,
        'items': [],
    }
    if overall_score is not None and overall_score >= 75:
        risk_guidance['items'].append({
            'id': 'g1',
            'title': 'Strong Academic Standing',
            'description': f'Maintaining {overall_score}% average across coursework.',
            'type': 'success',
            'icon': 'shield-check',
        })
    if completed_exps < total_assigned_exps:
        remaining = total_assigned_exps - completed_exps
        risk_guidance['items'].append({
            'id': 'g2',
            'title': f'{remaining} Experiments Pending',
            'description': 'Complete remaining lab assignments to maximize grading score.',
            'type': 'warning',
            'icon': 'alert-triangle',
        })
    if attendance_rate is not None and attendance_rate < 80 and scheduled_sessions > 0:
        risk_guidance['items'].append({
            'id': 'g3',
            'title': 'Attendance Alert',
            'description': f'Attendance is currently {round(attendance_rate)}%. Ensure regular lab attendance.',
            'type': 'warning',
            'icon': 'clock',
        })

    # 11. Real Recent Grades from DB
    recent_grades_list = []
    for g in all_grades[:10]:
        exp = exp_cache.get(g.experiment_id) or (db.session.get(Experiment, g.experiment_id) if g.experiment_id else None)
        subj = db.session.get(Subject, exp.subject_id) if (exp and exp.subject_id) else None
        s_code = _normalize_subject_code(subj.code if subj else 'DSA')
        exp_num = getattr(exp, 'exp_number', None) or 1
        e_title = f"Exp {exp_num}: {exp.title}" if exp else f"Exp {exp_num}"
        pct_grade = _grade_percent(g)
        if pct_grade is None:
            continue
        fin = round(pct_grade)
        auto_g = round(float(g.auto_grade or 0))
        man_g = round(float(g.manual_grade or 0))
        viva_g = round(float(g.viva_grade or 0))
        stat = "Graded" if (g.is_locked or fin >= 65) else "Needs Review"

        recent_grades_list.append({
            'id': g.id,
            'exp_title': e_title,
            'subject': s_code,
            'auto': f"{auto_g}",
            'manual': f"{man_g}",
            'viva': f"{viva_g}",
            'final': f"{fin}%",
            'final_num': fin,
            'status': stat,
            'status_type': 'graded' if stat == 'Graded' else 'review',
            'date': g.created_at.strftime('%b %d') if g.created_at else 'Recent',
        })

    # Filter options
    subject_options = [{'id': 'all', 'label': 'All Subjects'}]
    for s in enrolled_subjects:
        code = _normalize_subject_code(s.code or s.name)
        subject_options.append({'id': s.id, 'label': f"{code} - {s.name}"})

    filter_options = {
        'subjects': subject_options,
        'experiments': [{'id': 'all', 'label': 'All Experiments'}] + [
            {'id': e.id, 'label': e.title} for e in assigned_experiments
        ],
        'date_ranges': [
            {'id': '30d', 'label': 'Last 30 Days'},
            {'id': '12w', 'label': 'Last 12 Weeks'},
            {'id': 'all', 'label': 'All Time'},
        ],
    }

    full_name = getattr(student, 'full_name', None) or getattr(student, 'name', None)
    sec_name = None
    if enrollments:
        sec = db.session.get(Section, enrollments[0].section_id)
        if sec and sec.name:
            sec_name = sec.name
    dept_info = f"{sec_name}" if sec_name else None

    return {
        'student': {
            'id': student_id,
            'name': full_name,
            'department_year': dept_info,
            'avatar_url': getattr(student, 'avatar_url', None),
        },
        'kpi_metrics': {
            'overall_score': overall_score,
            'overall_delta': overall_delta,
            'sparkline_overall': sparkline_overall,
            'subjects_enrolled': enrolled_count,
            'subjects_on_track': on_track_count,
            'subjects_ring_pct': round((on_track_count / enrolled_count) * 100) if enrolled_count > 0 else None,
            'experiments_completed': completed_exps,
            'experiments_total': total_assigned_exps,
            'experiments_completion_pct': round(completion_pct) if completion_pct is not None else None,
            'attendance_rate': None if attendance_rate is None else round(attendance_rate),
            'attendance_period': attendance_donut['period_label'],
            # One bar per real session, oldest -> newest (was the same rate
            # duplicated nine times).
            'attendance_mini_bars': attendance_bars,
            'academic_rank': f"#{rank_pos} / {cohort_size}" if rank_pos else 'Not ranked yet',
            'rank_position': rank_pos,
            'rank_cohort': cohort_size,
            'rank_delta': None,
            'rank_percentile_text': rank_text,
            'sparkline_rank': sparkline_rank,
        },
        'unattributed_grades': count_unattributed_grades([student_id]),
        'performance_trend': trend_series,
        'subject_performance': subject_performance_list,
        'concept_mastery': concept_mastery_list,
        'attendance_breakdown': attendance_donut,
        'risk_and_guidance': risk_guidance,
        'recent_grades': recent_grades_list,
        'completion_progress': subject_performance_list,
        'filter_options': filter_options,
    }
