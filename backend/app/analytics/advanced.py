"""
Advanced Instructor Analytics Engine
Provides:
  1. Struggle Quadrant (effort vs outcome median split)
  2. Error-Pattern Clustering (parsing stderr by error signature)
  3. Code-Evolution Replay (timeline reconstruction from CodeVersion & CodeAttempt)
  4. Trajectory Forecasting (grade and mastery trend projection)
"""
import re
import statistics
from datetime import datetime
from typing import Dict, Any, List, Optional
from collections import defaultdict
from sqlalchemy import func
from app.extensions import db
from app.models.user import User
from app.models.submission import CodeAttempt, CodeVersion
from app.models.grading import Grade, HintLog
from app.models.experiment import Experiment
from app.analytics.scope import resolve_scope_entities


def compute_struggle_quadrant(
    scope_level: str = 'institution',
    scope_id: Optional[str] = None,
    institution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Computes 2D Effort vs Outcome scatter coordinates and partitions students into
    four pedagogical quadrants using cohort median splits:
      - Thriving: High Effort, High Outcome
      - Struggling (Grinding): High Effort, Low Outcome (High Priority for Intervention)
      - Coasting: Low Effort, High Outcome (Needs Deeper Challenge)
      - Disengaged: Low Effort, Low Outcome (At-Risk of Drop/Incompletion)
    """
    entities = resolve_scope_entities(scope_level, scope_id, institution_id)
    student_ids = entities.get('student_ids', [])

    if not student_ids and institution_id:
        users = User.query.filter_by(institution_id=institution_id, role='student', is_active=True).all()
        student_ids = [u.id for u in users]

    if not student_ids:
        return {
            'medians': {'effort': 50.0, 'outcome': 50.0},
            'quadrants': {'thriving': 0, 'struggling': 0, 'coasting': 0, 'disengaged': 0},
            'students': [],
        }

    # Fetch attempts per student
    attempt_counts = dict(
        db.session.query(CodeAttempt.student_id, func.count(CodeAttempt.id))
        .filter(CodeAttempt.student_id.in_(student_ids))
        .group_by(CodeAttempt.student_id)
        .all()
    )

    # Fetch hints per student
    hint_counts = dict(
        db.session.query(HintLog.student_id, func.count(HintLog.id))
        .filter(HintLog.student_id.in_(student_ids))
        .group_by(HintLog.student_id)
        .all()
    )

    # Fetch avg grades
    grade_avgs = dict(
        db.session.query(Grade.student_id, func.avg(Grade.final_grade))
        .filter(Grade.student_id.in_(student_ids), Grade.final_grade.isnot(None))
        .group_by(Grade.student_id)
        .all()
    )

    user_map = {u.id: u.name for u in User.query.filter(User.id.in_(student_ids)).all()}

    records = []
    effort_vals = []
    outcome_vals = []

    for sid in student_ids:
        atts = attempt_counts.get(sid, 0)
        hints = hint_counts.get(sid, 0)
        # Effort: normalized metric based on execution iterations and hint lookups
        effort = min(100.0, (atts * 8.0) + (hints * 5.0))
        outcome = float(grade_avgs.get(sid, 0.0) or 0.0)

        records.append({
            'student_id': sid,
            'student_name': user_map.get(sid, 'Student'),
            'effort': round(effort, 1),
            'outcome': round(outcome, 1),
            'attempt_count': atts,
            'hint_count': hints,
        })
        effort_vals.append(effort)
        outcome_vals.append(outcome)

    # Compute cohort medians
    med_effort = round(statistics.median(effort_vals) if effort_vals else 0.0, 1)
    med_outcome = round(statistics.median(outcome_vals) if outcome_vals else 0.0, 1)

    quadrant_counts = {'thriving': 0, 'struggling': 0, 'coasting': 0, 'disengaged': 0}

    for r in records:
        # No effort and no outcome => never assessed, not "thriving" by median tie.
        if r['effort'] == 0 and r['outcome'] == 0:
            r['quadrant'] = 'disengaged'
            r['assessed'] = False
            quadrant_counts['disengaged'] += 1
            continue

        r['assessed'] = True
        high_eff = r['effort'] >= med_effort
        high_out = r['outcome'] >= med_outcome

        if high_eff and high_out:
            q_label = 'thriving'
        elif high_eff and not high_out:
            q_label = 'struggling'
        elif not high_eff and high_out:
            q_label = 'coasting'
        else:
            q_label = 'disengaged'

        r['quadrant'] = q_label
        quadrant_counts[q_label] += 1

    return {
        'medians': {'effort': med_effort, 'outcome': med_outcome},
        'quadrants': quadrant_counts,
        'total_students': len(records),
        'students': records,
    }


def cluster_error_patterns(
    experiment_id: str,
    institution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Parses and clusters compiler stderr / test failures across all attempts of an experiment.
    Groups recurring bugs into standardized error signatures for targeted classroom reviews.
    """
    exp = Experiment.query.get(experiment_id)
    exp_title = exp.title if exp else 'Experiment'

    q = CodeAttempt.query.filter(
        CodeAttempt.experiment_id == experiment_id,
        (CodeAttempt.compile_status != 'success') | (CodeAttempt.stderr.isnot(None)),
    )
    attempts = q.all()

    total_failed = len(attempts)
    clusters = defaultdict(lambda: {'count': 0, 'students': set(), 'samples': []})

    pattern_python = re.compile(r'([A-Za-z0-9_]+Error|Exception): (.+)')
    pattern_cpp = re.compile(r'error: (.+)')

    for a in attempts:
        raw_err = (a.stderr or a.compile_output or '').strip()
        if not raw_err:
            if a.compile_status == 'timeout':
                sig = 'TimeLimitExceeded: Process timed out'
            else:
                sig = f'ExecutionFailure: {a.compile_status}'
        else:
            # Try matching standard error signatures
            py_match = pattern_python.search(raw_err)
            cpp_match = pattern_cpp.search(raw_err)
            if py_match:
                sig = f"{py_match.group(1)}: {py_match.group(2)[:60]}"
            elif cpp_match:
                sig = f"CompileError: {cpp_match.group(1)[:60]}"
            else:
                # Take first non-empty line up to 70 chars
                first_line = raw_err.split('\n')[0].strip()
                sig = first_line[:70] if first_line else 'Unknown Error'

        clusters[sig]['count'] += 1
        clusters[sig]['students'].add(a.student_id)
        if len(clusters[sig]['samples']) < 2 and raw_err:
            clusters[sig]['samples'].append(raw_err[:200])

    cluster_list = []
    for sig, data in clusters.items():
        cluster_list.append({
            'signature': sig,
            'occurrences': data['count'],
            'affected_students_count': len(data['students']),
            'percentage': round(100.0 * (data['count'] / max(1, total_failed)), 1),
            'sample_snippets': data['samples'],
        })

    cluster_list.sort(key=lambda x: x['occurrences'], reverse=True)

    return {
        'experiment_id': experiment_id,
        'experiment_title': exp_title,
        'total_failed_attempts': total_failed,
        'clusters': cluster_list[:15],  # Top 15 error clusters
    }


def get_attempt_replay(
    student_id: str,
    experiment_id: str,
) -> Dict[str, Any]:
    """
    Reconstructs the step-by-step code evolution and convergence timeline
    for a student on an experiment using CodeVersion diffs and CodeAttempt execution states.
    """
    student = User.query.get(student_id)
    exp = Experiment.query.get(experiment_id)

    versions = (
        CodeVersion.query.filter_by(student_id=student_id, experiment_id=experiment_id)
        .order_by(CodeVersion.version_number.asc())
        .all()
    )

    attempts = (
        CodeAttempt.query.filter_by(student_id=student_id, experiment_id=experiment_id)
        .order_by(CodeAttempt.attempt_number.asc())
        .all()
    )

    version_timeline = []
    for v in versions:
        version_timeline.append({
            'version_number': v.version_number,
            'save_type': v.save_type,
            'is_full_snapshot': v.is_full_snapshot,
            'diff_from_prev': v.diff_from_prev,
            'files': v.files if v.is_full_snapshot else None,
            'saved_at': v.saved_at.isoformat() if v.saved_at else None,
        })

    convergence_curve = []
    stuck_episodes = 0
    consecutive_same_error = 0
    last_status = None
    time_to_first_pass = None
    first_activity_time = None

    if versions and versions[0].saved_at:
        first_activity_time = versions[0].saved_at
    elif attempts and attempts[0].created_at:
        first_activity_time = attempts[0].created_at

    for a in attempts:
        passed = a.test_cases_passed or 0
        total = getattr(a, 'test_cases_total', None) or getattr(a, 'total_test_cases', 1) or 1
        ratio = round(float(passed) / max(1, total), 2)
        convergence_curve.append({
            'attempt_number': a.attempt_number,
            'passed': passed,
            'total': total,
            'ratio': ratio,
            'compile_status': a.compile_status,
            'submitted_at': a.created_at.isoformat() if a.created_at else None,
        })

        if passed > 0 and time_to_first_pass is None and first_activity_time and a.created_at:
            time_to_first_pass = int((a.created_at - first_activity_time).total_seconds())

        if a.compile_status == last_status and a.compile_status != 'success':
            consecutive_same_error += 1
            if consecutive_same_error == 3:
                stuck_episodes += 1
        else:
            consecutive_same_error = 0
        last_status = a.compile_status

    final_attempt = attempts[-1] if attempts else None
    final_tot = getattr(final_attempt, 'test_cases_total', None) or getattr(final_attempt, 'total_test_cases', 0) if final_attempt else 0
    solved = bool(final_attempt and final_attempt.test_cases_passed == final_tot and final_tot > 0)

    return {
        'student_id': student_id,
        'student_name': student.name if student else 'Student',
        'experiment_id': experiment_id,
        'experiment_title': exp.title if exp else 'Experiment',
        'total_versions': len(versions),
        'total_attempts': len(attempts),
        'is_solved': solved,
        'time_to_first_pass_seconds': time_to_first_pass,
        'stuck_episodes': stuck_episodes,
        'convergence_curve': convergence_curve,
        'versions': version_timeline,
    }


def forecast_student_trajectory(
    student_id: str,
    scope_level: str = 'subject',
    scope_id: Optional[str] = None,
    institution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Projects end-of-term academic trajectory based on historical grade slope,
    mastery velocity, and recent submission pacing.
    """
    user = User.query.get(student_id)
    grades = (
        Grade.query.filter(Grade.student_id == student_id, Grade.final_grade.isnot(None))
        .order_by(Grade.created_at.asc())
        .all()
    )

    vals = [float(g.final_grade) for g in grades]
    n = len(vals)

    if n == 0:
        return {
            'student_id': student_id,
            'trajectory': 'insufficient_data',
            'current_avg': 0.0,
            'projected_final': 0.0,
            'confidence_interval': [0.0, 0.0],
            'sample_size': 0,
            'is_sufficient': False,
        }

    current_avg = round(sum(vals) / n, 1)

    # Linear slope
    if n >= 2:
        x_mean = (n - 1) / 2.0
        y_mean = sum(vals) / n
        denom = sum((i - x_mean) ** 2 for i in range(n))
        numer = sum((i - x_mean) * (vals[i] - y_mean) for i in range(n))
        slope = (numer / denom) if denom != 0 else 0.0
    else:
        slope = 0.0

    # Project 5 experiments into the future
    future_delta = slope * 5.0
    projected = round(max(0.0, min(100.0, current_avg + future_delta)), 1)
    margin = 8.0 if n >= 4 else 15.0

    lower_bound = round(max(0.0, projected - margin), 1)
    upper_bound = round(min(100.0, projected + margin), 1)

    if slope >= 1.5:
        traj = 'accelerating'
    elif slope <= -1.5:
        traj = 'declining'
    else:
        traj = 'steady'

    return {
        'student_id': student_id,
        'student_name': user.name if user else 'Student',
        'trajectory': traj,
        'trend_slope_per_assignment': round(slope, 2),
        'current_avg': current_avg,
        'projected_final': projected,
        'confidence_interval': [lower_bound, upper_bound],
        'sample_size': n,
        'is_sufficient': bool(n >= 3),
    }
