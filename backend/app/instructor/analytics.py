"""
Instructor analytics — 6 tabbed analytics endpoints reusing institution
aggregation patterns, scoped to the instructor's SectionSubjects.

All endpoints support ?section_subject_id=, ?from=YYYY-MM-DD, ?to=YYYY-MM-DD, ?days=N.

Tabs:
  A — Experiments (diffculty, avg score, completion %, attempts, quality, hint usage)
  B — Student trajectory (ConceptMastery + Grade over time + ranking components)
  C — Class trends (avg score, attendance, focus, completion over time)
  D — Focus/engagement (FocusScore + attempts + time-on-task + hint reliance)
  E — Integrity (ProctorEvent + PlagiarismFlag + weighted integrity score)
  F — AI usage (AIUsageLog per experiment + per student)
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.experiment import Experiment, TestCase
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt
from app.models.grading import Grade, HintLog
from app.models.knowledge import ConceptMastery, StudentRanking, FocusScore
from app.models.academic import SectionSubject, SectionStudent
from app.models.feedback import PlagiarismFlag
from app.models.proctor_event import ProctorEvent
from app.models.ai_usage import AIUsageLog
from app.models.user import User
from datetime import datetime, timedelta
from sqlalchemy import func

analytics_bp = Blueprint('instructor_analytics', __name__)


def _my_ss_ids():
    """Return list of SectionSubject IDs this instructor teaches."""
    return [
        ss.id for ss in SectionSubject.query.filter_by(
            institution_id=g.institution_id, instructor_id=g.user_id
        ).all()
    ]


def _my_exp_ids():
    """Return list of experiment IDs belonging to this instructor."""
    return [
        e.id for e in Experiment.query.filter_by(
            institution_id=g.institution_id, instructor_id=g.user_id
        ).all()
    ]


def _date_window(default_days=30):
    """Parse ?from=YYYY-MM-DD&to=YYYY-MM-DD / ?days=N from request args."""
    from_str = request.args.get('from')
    to_str   = request.args.get('to')
    if from_str and to_str:
        try:
            start = datetime.strptime(from_str, '%Y-%m-%d')
            end   = datetime.strptime(to_str, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
            return start, end
        except ValueError:
            pass
    days  = int(request.args.get('days', default_days))
    end   = datetime.utcnow()
    start = end - timedelta(days=days)
    return start, end


def _get_ss_filter():
    """Return section_subject_id filter from request args or None."""
    return request.args.get('section_subject_id')


def _session_ids_for_ss(ss_ids, start=None, end=None):
    """Get LabSession IDs for the given section-subject IDs within date range."""
    q = db.session.query(LabSession.id).filter(
        LabSession.section_subject_id.in_(ss_ids))
    if start:
        q = q.filter(LabSession.scheduled_at >= start)
    if end:
        q = q.filter(LabSession.scheduled_at <= end)
    return [r[0] for r in q.all()]


# ══════════════════════════════════════════════════════════════════════════════
# TAB A — Experiment analytics
# ══════════════════════════════════════════════════════════════════════════════

@analytics_bp.route('/experiments', methods=['GET'])
@require_role('instructor', 'institution_admin')
def analytics_experiments():
    """Per-experiment: difficulty, avg score, completion %, avg attempts,
    avg exec time, quality distribution, hint usage per experiment."""
    my_exp_ids = _my_exp_ids()
    if not my_exp_ids:
        return jsonify({'experiments': []}), 200

    experiments = Experiment.query.filter(
        Experiment.id.in_(my_exp_ids)
    ).order_by(Experiment.exp_number).all()

    rows = []
    for exp in experiments:
        # Grades
        grades = Grade.query.filter_by(experiment_id=exp.id).all()
        finals = [g.final_grade for g in grades if g.final_grade is not None]
        avg_score = round(sum(finals) / len(finals), 1) if finals else None

        # Attempts
        attempts = CodeAttempt.query.filter_by(experiment_id=exp.id).all()
        total_attempts = len(attempts)
        unique_students = len({a.student_id for a in attempts})
        avg_attempts = round(total_attempts / unique_students, 1) if unique_students else 0

        # Final submissions
        finals_attempts = [a for a in attempts if a.is_final_submission]
        completed = len(finals_attempts)
        completion_pct = round(completed / unique_students * 100, 1) if unique_students else 0

        # Avg exec time for final submissions
        exec_times = [a.execution_time_ms for a in finals_attempts if a.execution_time_ms]
        avg_exec_time = round(sum(exec_times) / len(exec_times), 1) if exec_times else None

        # Quality distribution
        quality_dist = {}
        for a in finals_attempts:
            if a.quality_grade:
                quality_dist[a.quality_grade] = quality_dist.get(a.quality_grade, 0) + 1

        # Comparison: test_cases_passed / total
        tc_passed = sum(a.test_cases_passed or 0 for a in finals_attempts)
        tc_total  = sum(a.test_cases_total or 0 for a in finals_attempts)
        avg_tc_score = round(tc_passed / tc_total * 100, 1) if tc_total else None

        # Hint usage per experiment
        hint_count = HintLog.query.filter_by(experiment_id=exp.id).count()
        hint_usage_avg = round(hint_count / unique_students, 1) if unique_students else 0

        # Difficulty (from concept_tags / difficulty_level)
        difficulty = exp.difficulty_level

        rows.append({
            'experiment_id': exp.id,
            'exp_number': exp.exp_number,
            'title': exp.title,
            'difficulty': difficulty,
            'avg_score': avg_score,
            'avg_tc_score': avg_tc_score,
            'completion_pct': completion_pct,
            'total_students': unique_students,
            'avg_attempts': avg_attempts,
            'avg_exec_time_ms': avg_exec_time,
            'quality_distribution': quality_dist,
            'hint_usage_per_student': hint_usage_avg,
        })

    return jsonify({'experiments': rows}), 200


# ══════════════════════════════════════════════════════════════════════════════
# TAB B — Student trajectory
# ══════════════════════════════════════════════════════════════════════════════

@analytics_bp.route('/student/<student_id>/trajectory', methods=['GET'])
@require_role('instructor', 'institution_admin')
def student_trajectory(student_id):
    """ConceptMastery + Grade over time (time axis = session scheduled_at).
    Plus class-average baseline overlay and per-session ranking components."""
    my_ss_ids = _my_ss_ids()
    if not my_ss_ids:
        return jsonify({'error': 'No sections assigned'}), 403

    # Verify student belongs to one of our sections
    student = User.query.filter_by(id=student_id, role='student').first()
    if not student:
        return jsonify({'error': 'Student not found'}), 404

    # Grades over time
    grades = Grade.query.filter_by(student_id=student_id).order_by(Grade.created_at).all()
    grade_timeline = []
    for g in grades:
        sess = LabSession.query.get(g.session_id)
        grade_timeline.append({
            'session_id': g.session_id,
            'scheduled_at': sess.scheduled_at.isoformat() if sess else None,
            'experiment_id': g.experiment_id,
            'final_grade': g.final_grade,
            'auto_grade': g.auto_grade,
            'quiz_grade': g.quiz_grade,
            'viva_grade': g.viva_grade,
            'code_quality_grade': g.code_quality_grade,
            'hint_deduction': g.hint_deduction,
        })

    # Class average baseline for same experiments
    exp_ids = [g.experiment_id for g in grades if g.experiment_id]
    class_avg = {}
    if exp_ids:
        for eid in exp_ids:
            others = Grade.query.filter(
                Grade.experiment_id == eid,
                Grade.final_grade.isnot(None),
            ).all()
            vals = [g.final_grade for g in others]
            if vals:
                class_avg[eid] = round(sum(vals) / len(vals), 1)

    for point in grade_timeline:
        point['class_avg'] = class_avg.get(point['experiment_id'])

    # ConceptMastery
    mastery = ConceptMastery.query.filter_by(student_id=student_id).all()
    concepts = []
    for m in mastery:
        concepts.append({
            'concept': m.concept,
            'mastery_score': m.mastery_score,
            'experiment_count': m.experiment_count,
        })

    # Per-session ranking components
    ranking = StudentRanking.query.filter_by(student_id=student_id).order_by(
        StudentRanking.updated_at.desc()).first()
    components = None
    if ranking:
        components = {
            'mastery': ranking.mastery_score,
            'engagement': ranking.engagement_score,
            'effort': ranking.effort_score,
            'efficiency': ranking.efficiency_score,
            'consistency': ranking.consistency_score,
            'rank_score': ranking.rank_score,
            'rank_position': ranking.rank_position,
        }

    return jsonify({
        'student': {'id': student.id, 'full_name': student.full_name, 'roll_number': student.roll_number},
        'grade_timeline': grade_timeline,
        'concepts': concepts,
        'ranking_components': components,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# TAB C — Class trends
# ══════════════════════════════════════════════════════════════════════════════

@analytics_bp.route('/trends', methods=['GET'])
@require_role('instructor', 'institution_admin')
def trends():
    """Avg score, attendance, focus, completion-rate trends over time.
    Supports cohort comparison: if multiple sections of a subject, one line per section."""
    my_ss_ids = _my_ss_ids()
    if not my_ss_ids:
        return jsonify({'trends': []}), 200

    start, end = _date_window(30)
    ss_filter = _get_ss_filter()
    if ss_filter and ss_filter in my_ss_ids:
        my_ss_ids = [ss_filter]

    # Bucket by week
    sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(my_ss_ids),
        LabSession.scheduled_at >= start,
        LabSession.scheduled_at <= end,
    ).order_by(LabSession.scheduled_at).all()

    if not sessions:
        return jsonify({'trends': []}), 200

    # Group by week
    from collections import defaultdict
    weekly = defaultdict(lambda: {
        'scores': [], 'attendance': [], 'focus': [], 'completion': [],
        'session_count': 0,
    })

    for sess in sessions:
        week_key = sess.scheduled_at.strftime('%Y-W%W')
        weekly[week_key]['session_count'] += 1

        # Scores
        exp_grades = Grade.query.filter(
            Grade.session_id == sess.id,
            Grade.final_grade.isnot(None),
        ).all()
        scores = [g.final_grade for g in exp_grades]
        if scores:
            weekly[week_key]['scores'].extend(scores)

        # Attendance
        present = SessionAttendance.query.filter_by(
            session_id=sess.id, status='present'
        ).count()
        enrolled = SectionStudent.query.join(
            SectionSubject, SectionSubject.section_id == SectionStudent.section_id
        ).filter(
            SectionSubject.id == sess.section_subject_id
        ).count()
        if enrolled > 0:
            weekly[week_key]['attendance'].append(present / enrolled * 100)

        # Focus
        focus_rows = FocusScore.query.filter_by(session_id=sess.id).all()
        focuses = [f.focus_score for f in focus_rows if f.focus_score is not None]
        if focuses:
            weekly[week_key]['focus'].append(round(sum(focuses) / len(focuses), 1))

        # Completion rate
        attempts = CodeAttempt.query.filter(
            CodeAttempt.session_id == sess.id,
            CodeAttempt.is_final_submission == True,
        ).all()
        unique_completed = len({a.student_id for a in attempts})
        if enrolled > 0:
            weekly[week_key]['completion'].append(unique_completed / enrolled * 100)

    trends = []
    for week in sorted(weekly.keys()):
        w = weekly[week]
        trends.append({
            'week': week,
            'session_count': w['session_count'],
            'avg_score': round(sum(w['scores']) / len(w['scores']), 1) if w['scores'] else None,
            'avg_attendance': round(sum(w['attendance']) / len(w['attendance']), 1) if w['attendance'] else None,
            'avg_focus': round(sum(w['focus']) / len(w['focus']), 1) if w['focus'] else None,
            'avg_completion': round(sum(w['completion']) / len(w['completion']), 1) if w['completion'] else None,
        })

    return jsonify({'trends': trends}), 200


# ══════════════════════════════════════════════════════════════════════════════
# TAB D — Focus / engagement
# ══════════════════════════════════════════════════════════════════════════════

@analytics_bp.route('/engagement', methods=['GET'])
@require_role('instructor', 'institution_admin')
def engagement():
    """FocusScore + attempts + time-on-task + hint reliance.
    Normalized per-experiment."""
    my_ss_ids = _my_ss_ids()
    my_exp_ids = _my_exp_ids()
    if not my_ss_ids or not my_exp_ids:
        return jsonify({'engagement': []}), 200

    start, end = _date_window(30)
    ss_filter = _get_ss_filter()
    if ss_filter and ss_filter in my_ss_ids:
        my_ss_ids = [ss_filter]

    session_ids = _session_ids_for_ss(my_ss_ids, start, end)
    if not session_ids:
        return jsonify({'engagement': []}), 200

    # FocusScore
    focus_rows = FocusScore.query.filter(
        FocusScore.session_id.in_(session_ids)
    ).all()

    by_student = {}
    for f in focus_rows:
        by_student.setdefault(f.student_id, []).append(f)

    # HintLog
    hint_rows = HintLog.query.filter(
        HintLog.experiment_id.in_(my_exp_ids)
    ).all()
    hint_by_student = {}
    for h in hint_rows:
        hint_by_student[h.student_id] = hint_by_student.get(h.student_id, 0) + 1

    # CodeAttempts
    attempt_rows = CodeAttempt.query.filter(
        CodeAttempt.session_id.in_(session_ids)
    ).all()
    attempts_by_student = {}
    for a in attempt_rows:
        attempts_by_student.setdefault(a.student_id, []).append(a)

    # CodeVersion for save_type engagement signal (A10)
    from app.models.submission import CodeVersion
    version_rows = CodeVersion.query.filter(
        CodeVersion.session_id.in_(session_ids),
        CodeVersion.save_type.in_(['on_run', 'on_submit', 'auto']),
    ).all()
    version_by_student = {}
    for v in version_rows:
        version_by_student.setdefault(v.student_id, []).append(v)

    student_ids = list(set(
        list(by_student.keys()) + list(hint_by_student.keys()) +
        list(attempts_by_student.keys()) + list(version_by_student.keys())
    ))
    users_map = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()}

    results = []
    exp_count = len(my_exp_ids) or 1

    for sid in student_ids:
        focuses = by_student.get(sid, [])
        avg_focus = round(sum(f.focus_score for f in focuses if f.focus_score) / len(focuses), 1) if focuses else None

        attempts = attempts_by_student.get(sid, [])
        attempt_count = len(attempts)
        time_on_task = sum(a.execution_time_ms or 0 for a in attempts) / 1000.0  # seconds

        hint_count = hint_by_student.get(sid, 0)
        hint_reliance = round(hint_count / exp_count, 2)

        # Save-type ratio for disengagement signal (A10)
        versions = version_by_student.get(sid, [])
        auto_count = sum(1 for v in versions if v.save_type == 'auto')
        manual_count = sum(1 for v in versions if v.save_type in ('on_run', 'on_submit'))
        total_v = len(versions)
        auto_ratio = round(auto_count / total_v, 2) if total_v else 0

        u = users_map.get(sid)
        results.append({
            'student_id': sid,
            'full_name': u.full_name if u else '',
            'roll_number': u.roll_number if u else '',
            'avg_focus_score': avg_focus,
            'attempt_count': attempt_count,
            'time_on_task_sec': round(time_on_task, 1),
            'hint_reliance': hint_reliance,
            'auto_save_ratio': auto_ratio,
        })

    results.sort(key=lambda r: r['avg_focus_score'] or 0)

    return jsonify({'engagement': results}), 200


# ══════════════════════════════════════════════════════════════════════════════
# TAB E — Integrity
# ══════════════════════════════════════════════════════════════════════════════

@analytics_bp.route('/integrity', methods=['GET'])
@require_role('instructor', 'institution_admin')
def integrity():
    """ProctorEvent + PlagiarismFlag + weighted integrity score.
    Integrity score = 100 - min(100, tab_switch*0.5 + fullscreen_exit*1 + copy_paste*3 + lockdown_violation*5)
    """
    my_ss_ids = _my_ss_ids()
    if not my_ss_ids:
        return jsonify({'integrity': []}), 200

    start, end = _date_window(30)
    ss_filter = _get_ss_filter()
    if ss_filter and ss_filter in my_ss_ids:
        my_ss_ids = [ss_filter]

    session_ids = _session_ids_for_ss(my_ss_ids, start, end)
    if not session_ids:
        return jsonify({'integrity': []}), 200

    # ProctorEvents
    try:
        pe_rows = ProctorEvent.query.filter(
            ProctorEvent.session_id.in_(session_ids)
        ).all()
    except Exception:
        pe_rows = []

    # Per-student event counts
    from collections import defaultdict
    pe_by_student = defaultdict(lambda: defaultdict(int))
    for pe in pe_rows:
        pe_by_student[pe.student_id][pe.event_type] += 1

    # PlagiarismFlags
    all_student_ids = list({pe.student_id for pe in pe_rows})
    # Also get students enrolled in these sections
    section_ids = {ss.section_id for ss in SectionSubject.query.filter(
        SectionSubject.id.in_(my_ss_ids)
    ).all()}
    enrolled_students = SectionStudent.query.filter(
        SectionStudent.section_id.in_(section_ids)
    ).all()
    enrolled_ids = {es.student_id for es in enrolled_students}
    all_student_ids = list(set(all_student_ids) | enrolled_ids)

    # Find plagiarism flags for these students
    plagiarism = PlagiarismFlag.query.filter(
        db.or_(
            PlagiarismFlag.student_a_id.in_(all_student_ids),
            PlagiarismFlag.student_b_id.in_(all_student_ids),
        )
    ).all()

    # Build pairwise cluster view
    clusters = []
    for pf in plagiarism:
        clusters.append({
            'student_a_id': pf.student_a_id,
            'student_b_id': pf.student_b_id,
            'similarity_pct': pf.similarity_pct,
            'status': pf.status,
            'detected_at': pf.detected_at.isoformat() if pf.detected_at else None,
        })

    users_map = {u.id: u for u in User.query.filter(User.id.in_(all_student_ids)).all()}

    results = []
    for sid in all_student_ids:
        events = pe_by_student.get(sid, {})
        tab_switches = events.get('tab_switch', 0)
        fullscreen_exits = events.get('fullscreen_exit', 0)
        copy_pastes = events.get('copy_paste', 0)
        lockdown_violations = events.get('lockdown_violation', 0)

        integrity_score = max(0, 100 - min(100,
            tab_switches * 0.5 +
            fullscreen_exits * 1 +
            copy_pastes * 3 +
            lockdown_violations * 5
        ))

        # Student's plagiarism flags
        student_plagiarism = [
            c for c in clusters
            if c['student_a_id'] == sid or c['student_b_id'] == sid
        ]

        u = users_map.get(sid)
        results.append({
            'student_id': sid,
            'full_name': u.full_name if u else '',
            'roll_number': u.roll_number if u else '',
            'integrity_score': round(integrity_score, 1),
            'proctor_events': {
                'tab_switch': tab_switches,
                'fullscreen_exit': fullscreen_exits,
                'copy_paste': copy_pastes,
                'lockdown_violation': lockdown_violations,
                'total': sum(events.values()),
            },
            'plagiarism_flags': student_plagiarism,
        })

    results.sort(key=lambda r: r['integrity_score'])

    return jsonify({'integrity': results, 'clusters': clusters}), 200


# ══════════════════════════════════════════════════════════════════════════════
# TAB F — AI usage
# ══════════════════════════════════════════════════════════════════════════════

@analytics_bp.route('/ai-usage', methods=['GET'])
@require_role('instructor', 'institution_admin')
def ai_usage_analytics():
    """AIUsageLog per experiment + per student.
    Normalized per-experiment (A5)."""
    my_ss_ids = _my_ss_ids()
    my_exp_ids = _my_exp_ids()
    if not my_exp_ids:
        return jsonify({'ai_usage': []}), 200

    start, end = _date_window(30)
    ss_filter = _get_ss_filter()

    # AIUsageLog scoped to instructor's institution
    logs = AIUsageLog.query.filter(
        AIUsageLog.institution_id == g.institution_id,
        AIUsageLog.created_at >= start,
        AIUsageLog.created_at <= end,
    )

    if ss_filter:
        logs = logs.filter(AIUsageLog.section_subject_id == ss_filter)

    logs = logs.all()

    if not logs:
        return jsonify({'ai_usage': [], 'by_feature': []}), 200

    exp_count = len(my_exp_ids) or 1

    # Per-student aggregation
    from collections import defaultdict
    by_student = defaultdict(lambda: {'tokens': 0, 'cost': 0.0, 'features': defaultdict(int), 'count': 0})
    by_feature = defaultdict(int)

    for log in logs:
        sid = log.user_id or 'unknown'
        by_student[sid]['tokens'] += log.total_tokens or 0
        by_student[sid]['cost'] += float(log.estimated_cost_usd or 0)
        by_student[sid]['features'][log.feature] += 1
        by_student[sid]['count'] += 1
        by_feature[log.feature] += 1

    # Normalize per experiment
    student_ids = list(by_student.keys())
    users_map = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()}

    usage_rows = []
    for sid, data in by_student.items():
        u = users_map.get(sid)
        usage_rows.append({
            'student_id': sid,
            'full_name': u.full_name if u else '',
            'roll_number': u.roll_number if u else '',
            'total_tokens': data['tokens'],
            'estimated_cost_usd': round(data['cost'], 4),
            'total_calls': data['count'],
            'tokens_per_experiment': round(data['tokens'] / exp_count, 1),
            'feature_breakdown': dict(data['features']),
        })

    usage_rows.sort(key=lambda r: r['total_tokens'], reverse=True)

    return jsonify({
        'ai_usage': usage_rows,
        'by_feature': [{'feature': k, 'count': v} for k, v in sorted(by_feature.items(), key=lambda x: -x[1])],
        'normalization_factor': exp_count,
    }), 200