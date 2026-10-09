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
    # Batch ALL grades, attempts, hints — 3 queries total instead of 3×N
    all_grades = Grade.query.filter(Grade.experiment_id.in_(my_exp_ids)).all() if my_exp_ids else []
    all_attempts = CodeAttempt.query.filter(CodeAttempt.experiment_id.in_(my_exp_ids)).all() if my_exp_ids else []
    hint_counts = dict(
        db.session.query(HintLog.experiment_id, db.func.count(HintLog.id))
        .filter(HintLog.experiment_id.in_(my_exp_ids))
        .group_by(HintLog.experiment_id).all()
    ) if my_exp_ids else {}

    grades_by_exp = {}
    attempts_by_exp = {}
    for g in all_grades:
        grades_by_exp.setdefault(g.experiment_id, []).append(g)
    for a in all_attempts:
        attempts_by_exp.setdefault(a.experiment_id, []).append(a)

    for exp in experiments:
        grades = grades_by_exp.get(exp.id, [])
        finals = [g.final_grade for g in grades if g.final_grade is not None]
        avg_score = round(sum(finals) / len(finals), 1) if finals else None

        attempts = attempts_by_exp.get(exp.id, [])
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

        # Hint usage per experiment (from pre-batched aggregate)
        hint_count = hint_counts.get(exp.id, 0)
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

    # Grades over time — batch session lookups (was N+1)
    grades = Grade.query.filter_by(student_id=student_id).order_by(Grade.created_at).all()
    session_ids = {g.session_id for g in grades if g.session_id}
    sessions_map = {
        s.id: s for s in LabSession.query.filter(LabSession.id.in_(session_ids)).all()
    } if session_ids else {}
    grade_timeline = []
    for g in grades:
        sess = sessions_map.get(g.session_id)
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

    # Class average baseline — one grouped aggregate (was per-experiment loop)
    exp_ids = list({g.experiment_id for g in grades if g.experiment_id})
    class_avg = {}
    if exp_ids:
        agg = db.session.query(
            Grade.experiment_id,
            db.func.avg(Grade.final_grade),
        ).filter(
            Grade.experiment_id.in_(exp_ids),
            Grade.final_grade.isnot(None),
        ).group_by(Grade.experiment_id).all()
        class_avg = {eid: round(avg, 1) for eid, avg in agg if avg is not None}

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

    from app.analytics.ranking import get_student_all_ranks
    from app.analytics.advanced import forecast_student_trajectory
    all_ranks = get_student_all_ranks(student_id=student_id, institution_id=g.institution_id)
    forecast = forecast_student_trajectory(student_id=student_id, institution_id=g.institution_id)

    return jsonify({
        'student': {'id': student.id, 'full_name': student.full_name, 'roll_number': student.roll_number},
        'grade_timeline': grade_timeline,
        'concepts': concepts,
        'ranking_components': components,
        'multi_scope_ranks': all_ranks,
        'forecast': forecast,
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

    # Batch all per-session data — 5 bulk queries instead of 5×N
    session_ids = [sess.id for sess in sessions]
    sess_id_to_ssid = {sess.id: sess.section_subject_id for sess in sessions}

    # 1. Grades
    all_grades = db.session.query(
        Grade.session_id, Grade.final_grade,
    ).filter(
        Grade.session_id.in_(session_ids),
        Grade.final_grade.isnot(None),
    ).all() if session_ids else []
    grades_by_sess = defaultdict(list)
    for sid, fg in all_grades:
        grades_by_sess[sid].append(fg)

    # 2. Attendance counts
    present_counts = dict(
        db.session.query(
            SessionAttendance.session_id,
            db.func.count(SessionAttendance.student_id),
        ).filter(
            SessionAttendance.session_id.in_(session_ids),
            SessionAttendance.status == 'present',
        ).group_by(SessionAttendance.session_id).all()
    ) if session_ids else {}

    # 3. Enrolled counts per section_subject
    ss_ids = set(sess_id_to_ssid.values())
    enrolled_counts = dict(
        db.session.query(
            SectionSubject.id,
            db.func.count(SectionStudent.student_id),
        ).join(
            SectionSubject, SectionSubject.section_id == SectionStudent.section_id
        ).filter(
            SectionSubject.id.in_(ss_ids),
        ).group_by(SectionSubject.id).all()
    ) if ss_ids else {}

    # 4. Focus scores
    all_focus = db.session.query(
        FocusScore.session_id, FocusScore.focus_score,
    ).filter(
        FocusScore.session_id.in_(session_ids),
        FocusScore.focus_score.isnot(None),
    ).all() if session_ids else []
    focus_by_sess = defaultdict(list)
    for sid, fsc in all_focus:
        focus_by_sess[sid].append(fsc)

    # 5. Completion (unique students per session with final submissions)
    completion_counts = {}
    if session_ids:
        uniq = db.session.query(
            CodeAttempt.session_id, CodeAttempt.student_id,
        ).filter(
            CodeAttempt.session_id.in_(session_ids),
            CodeAttempt.is_final_submission == True,
        ).distinct().all()
        for csid, cstu in uniq:
            completion_counts.setdefault(csid, set()).add(cstu)

    for sess in sessions:
        week_key = sess.scheduled_at.strftime('%Y-W%W')
        weekly[week_key]['session_count'] += 1

        # Scores (from batch)
        scores = grades_by_sess.get(sess.id, [])
        if scores:
            weekly[week_key]['scores'].extend(scores)

        # Attendance
        present = present_counts.get(sess.id, 0)
        enrolled = enrolled_counts.get(sess_id_to_ssid[sess.id], 0)
        if enrolled > 0:
            weekly[week_key]['attendance'].append(present / enrolled * 100)

        # Focus (from batch)
        focuses = focus_by_sess.get(sess.id, [])
        if focuses:
            weekly[week_key]['focus'].append(round(sum(focuses) / len(focuses), 1))

        # Completion rate
        unique_completed = len(completion_counts.get(sess.id, set()))
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

    # SQL aggregate per student — 4 queries total (was: load full tables into RAM)
    focus_avg = dict(db.session.query(
        FocusScore.student_id, db.func.avg(FocusScore.focus_score),
    ).filter(
        FocusScore.session_id.in_(session_ids),
        FocusScore.focus_score.isnot(None),
    ).group_by(FocusScore.student_id).all()) if session_ids else {}

    hint_by_student = dict(db.session.query(
        HintLog.student_id, db.func.count(HintLog.id),
    ).filter(HintLog.experiment_id.in_(my_exp_ids)).group_by(HintLog.student_id).all()) if my_exp_ids else {}

    attempt_stats = {}
    if session_ids:
        aq = db.session.query(
            CodeAttempt.student_id,
            db.func.count(CodeAttempt.id),
            db.func.coalesce(db.func.sum(CodeAttempt.execution_time_ms), 0),
        ).filter(
            CodeAttempt.session_id.in_(session_ids),
        ).group_by(CodeAttempt.student_id).all()
        for row in aq:
            attempt_stats[row[0]] = (row[1], row[2])

    # CodeVersion save-type counts per student
    from app.models.submission import CodeVersion
    version_by_student = {}
    if session_ids:
        vq = db.session.query(
            CodeVersion.student_id, CodeVersion.save_type, db.func.count(CodeVersion.id),
        ).filter(
            CodeVersion.session_id.in_(session_ids),
            CodeVersion.save_type.in_(['on_run', 'on_submit', 'auto']),
        ).group_by(CodeVersion.student_id, CodeVersion.save_type).all()
        for vsid, vtype, vcount in vq:
            version_by_student.setdefault(vsid, {})[vtype] = vcount

    student_ids = list(set(
        list(focus_avg.keys()) + list(hint_by_student.keys()) +
        list(attempt_stats.keys()) + list(version_by_student.keys())
    ))
    users_map = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}

    results = []
    exp_count = len(my_exp_ids) or 1

    for sid in student_ids:
        avg_focus = focus_avg.get(sid)

        at_info = attempt_stats.get(sid, (0, 0))
        attempt_count = at_info[0] if isinstance(at_info, tuple) else 0
        time_on_task = (at_info[1] if isinstance(at_info, tuple) else 0) / 1000.0

        hint_count = hint_by_student.get(sid, 0)
        hint_reliance = round(hint_count / exp_count, 2)

        # Save-type ratio for disengagement signal (A10)
        vtypes = version_by_student.get(sid, {})
        auto_count = vtypes.get('auto', 0)
        manual_count = vtypes.get('on_run', 0) + vtypes.get('on_submit', 0)
        total_v = auto_count + manual_count
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

    # ProctorEvents — aggregate in SQL (was loading full table into RAM)
    from collections import defaultdict
    pe_by_student = defaultdict(lambda: defaultdict(int))
    try:
        pe_agg = db.session.query(
            ProctorEvent.student_id, ProctorEvent.event_type,
            db.func.count(ProctorEvent.id),
        ).filter(
            ProctorEvent.session_id.in_(session_ids)
        ).group_by(ProctorEvent.student_id, ProctorEvent.event_type).all()
        for psid, ptype, pcount in pe_agg:
            pe_by_student[psid][ptype] = pcount
        all_student_ids = list(pe_by_student.keys())
    except Exception:
        all_student_ids = []
        # Fallback if proctor_event table is unavailable — try a plain query
        try:
            pe_rows = ProctorEvent.query.filter(
                ProctorEvent.session_id.in_(session_ids)
            ).all()
            for pe in pe_rows:
                pe_by_student[pe.student_id][pe.event_type] += 1
            all_student_ids = list({pe.student_id for pe in pe_rows})
        except Exception:
            all_student_ids = []

    # PlagiarismFlags
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

    # AIUsageLog — aggregate in SQL (was loading all rows into RAM)
    logs = AIUsageLog.query.filter(
        AIUsageLog.institution_id == g.institution_id,
        AIUsageLog.created_at >= start,
        AIUsageLog.created_at <= end,
    )

    if ss_filter:
        logs = logs.filter(AIUsageLog.section_subject_id == ss_filter)

    # Perf pass: `logs` only ever fed a truthiness gate below, but the old
    # code materialized every AIUsageLog row in the window (full ORM objects
    # with prompt/response text) into RAM to answer it. A LIMIT 1 probe does.
    if logs.first() is None:
        return jsonify({'ai_usage': [], 'by_feature': []}), 200

    exp_count = len(my_exp_ids) or 1

    # Per-student aggregation — use SQL group-by for tokens + calls
    from collections import defaultdict
    # Aggregate: total_tokens, estimated_cost, call_count, and feature breakdown
    by_feature = defaultdict(int)

    # Student-level aggregates from SQL
    student_query_rows = db.session.query(
        AIUsageLog.user_id,
        db.func.coalesce(db.func.sum(AIUsageLog.total_tokens), 0),
        db.func.coalesce(db.func.sum(AIUsageLog.estimated_cost_usd), 0.0),
        db.func.count(AIUsageLog.id),
    ).filter(
        AIUsageLog.institution_id == g.institution_id,
        AIUsageLog.created_at >= start,
        AIUsageLog.created_at <= end,
    ).group_by(AIUsageLog.user_id).all() if logs else []
    student_agg = {r[0]: (r[1], r[2], r[3]) for r in student_query_rows}

    # Feature breakdown per student
    feature_agg = defaultdict(lambda: defaultdict(int))
    feature_rows = db.session.query(
        AIUsageLog.user_id, AIUsageLog.feature, db.func.count(AIUsageLog.id),
    ).filter(
        AIUsageLog.institution_id == g.institution_id,
        AIUsageLog.created_at >= start,
        AIUsageLog.created_at <= end,
    ).group_by(AIUsageLog.user_id, AIUsageLog.feature).all() if logs else []
    for fsid, ffeat, fcount in feature_rows:
        feature_agg[fsid][ffeat] = fcount
        by_feature[ffeat] += fcount

    student_ids = list(student_agg.keys())
    users_map = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}

    usage_rows = []
    for sid, (tokens, cost, call_count) in student_agg.items():
        u = users_map.get(sid)
        usage_rows.append({
            'student_id': sid,
            'full_name': u.full_name if u else '',
            'roll_number': u.roll_number if u else '',
            'total_tokens': tokens,
            'estimated_cost_usd': round(cost, 4),
            'total_calls': call_count,
            'tokens_per_experiment': round(tokens / exp_count, 1),
            'feature_breakdown': dict(feature_agg.get(sid, {})),
        })

    usage_rows.sort(key=lambda r: r['total_tokens'], reverse=True)

    return jsonify({
        'ai_usage': usage_rows,
        'by_feature': [{'feature': k, 'count': v} for k, v in sorted(by_feature.items(), key=lambda x: -x[1])],
        'normalization_factor': exp_count,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# TAB B helper — lightweight roster (avoids loading the full integrity endpoint
# just to populate the trajectory student picker)
# ══════════════════════════════════════════════════════════════════════════════

@analytics_bp.route('/roster', methods=['GET'])
@require_role('instructor', 'institution_admin')
def roster():
    """Students in the instructor's sections — id/name/roll only."""
    my_ss_ids = _my_ss_ids()
    if not my_ss_ids:
        return jsonify({'roster': []}), 200

    section_ids = {ss.section_id for ss in SectionSubject.query.filter(
        SectionSubject.id.in_(my_ss_ids)).all()}
    enrolled = SectionStudent.query.filter(
        SectionStudent.section_id.in_(section_ids),
    ).with_entities(SectionStudent.student_id).all()
    student_ids = [r[0] for r in enrolled]
    if not student_ids:
        return jsonify({'roster': []}), 200

    users = User.query.filter(
        User.id.in_(student_ids), User.role == 'student',
    ).with_entities(User.id, User.full_name, User.roll_number).all()
    roster = [
        {'student_id': uid, 'full_name': name, 'roll_number': roll}
        for uid, name, roll in users
    ]
    roster.sort(key=lambda r: (r['full_name'] or '').lower())
    return jsonify({'roster': roster}), 200