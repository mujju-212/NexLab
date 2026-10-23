"""
Integrity Confidence Engine
Combines discrete ProctorEvents, plagiarism similarity flags, and code progression
anomalies into an explainable Integrity Confidence Score (0–100) and review queue.
"""
from datetime import datetime
from typing import Dict, Any, List, Optional
from collections import defaultdict
from sqlalchemy import or_, desc
from app.extensions import db
from app.models.user import User
from app.models.proctor_event import ProctorEvent
from app.models.feedback import PlagiarismFlag
from app.models.submission import CodeAttempt
from app.models.session import LabSession
from app.analytics.scope import resolve_scope_entities


def compute_integrity_confidence(
    student_id: str,
    session_id: Optional[str] = None,
    institution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Computes integrity confidence score (0–100, 100 = completely trustworthy)
    for a student, evaluating violation density, plagiarism, and code anomalies.
    """
    user = User.query.get(student_id)
    iid = institution_id or (user.institution_id if user else None)

    # 1. Discrete Proctor Events
    pe_query = ProctorEvent.query.filter_by(student_id=student_id)
    if session_id:
        pe_query = pe_query.filter_by(session_id=session_id)
    if iid:
        pe_query = pe_query.filter_by(institution_id=iid)

    events = pe_query.order_by(ProctorEvent.recorded_at.desc()).all()

    violation_counts = defaultdict(int)
    severity_counts = {'high': 0, 'medium': 0, 'low': 0}
    timeline = []

    for ev in events:
        v_type = ev.event_type or 'unknown'
        sev = (ev.severity or 'low').lower()
        if sev not in severity_counts:
            sev = 'low'
        violation_counts[v_type] += 1
        severity_counts[sev] += 1

        timeline.append({
            'id': ev.id,
            'session_id': ev.session_id,
            'event_type': v_type,
            'severity': sev,
            'payload': ev.payload or {},
            'recorded_at': ev.recorded_at.isoformat() if ev.recorded_at else None,
        })

    # 2. Plagiarism Flags
    plag_query = PlagiarismFlag.query.filter(
        or_(
            PlagiarismFlag.student_a_id == student_id,
            PlagiarismFlag.student_b_id == student_id,
        )
    )
    if session_id:
        plag_query = plag_query.filter_by(session_id=session_id)
    if iid:
        plag_query = plag_query.filter_by(institution_id=iid)

    plag_rows = plag_query.all()
    plag_flags = []
    max_plagiarism_similarity = 0.0

    for pf in plag_rows:
        sim = float(pf.similarity_pct or 0.0)
        if sim > max_plagiarism_similarity and pf.status != 'cleared':
            max_plagiarism_similarity = sim
        other_id = pf.student_b_id if pf.student_a_id == student_id else pf.student_a_id
        other_user = User.query.get(other_id)
        plag_flags.append({
            'id': pf.id,
            'similarity_pct': sim,
            'status': pf.status,
            'counterpart_name': other_user.name if other_user else 'Unknown',
            'detected_at': pf.detected_at.isoformat() if pf.detected_at else None,
        })

    # 3. Code Progression Anomaly Detection
    # Look for sudden leaps: e.g. 0/X passed on attempt 1, followed immediately by 100% pass on attempt 2 with zero incremental test-case progression
    ca_query = CodeAttempt.query.filter_by(student_id=student_id)
    if session_id:
        ca_query = ca_query.filter_by(session_id=session_id)
    attempts = ca_query.order_by(CodeAttempt.submitted_at.asc()).all()

    anomalies = []
    prev_passed = None
    prev_total = None
    for a in attempts:
        passed = a.test_cases_passed or 0
        total = getattr(a, 'test_cases_total', None) or getattr(a, 'total_test_cases', 0) or 0
        if prev_passed is not None and prev_total is not None and prev_total > 0:
            if prev_passed == 0 and passed == total and total >= 5:
                # Sudden leap from 0 tests to 100% on a complex problem
                sub_dt = getattr(a, 'submitted_at', getattr(a, 'created_at', None))
                anomalies.append({
                    'type': 'instant_solution_leap',
                    'description': f'Abrupt jump from 0/{prev_total} to {passed}/{total} test cases passed',
                    'attempt_number': a.attempt_number,
                    'experiment_id': a.experiment_id,
                    'created_at': sub_dt.isoformat() if sub_dt else None,
                })
        prev_passed = passed
        prev_total = total

    # 4. Integrity confidence.
    # Severity-weighted via the shared scorer so this endpoint and the
    # instructor integrity list can never disagree (they used to: one ignored
    # severity entirely, the other hardcoded four event types).
    from app.analytics.integrity_score import score_events
    scored = score_events([
        {'event_type': ev.event_type, 'severity': ev.severity} for ev in events
    ])
    n_plag = len(plag_flags)
    deduction = scored['penalty'] + (15.0 * n_plag)
    confidence = max(0.0, round(100.0 - deduction, 1))

    review_recommended = bool(
        confidence < 70.0
        or severity_counts['high'] >= 1
        or len(plag_flags) > 0
        or len(anomalies) > 0
    )

    if confidence >= 85.0:
        band = 'trustworthy'
    elif confidence >= 70.0:
        band = 'minor_flags'
    elif confidence >= 50.0:
        band = 'suspicious'
    else:
        band = 'high_risk'

    return {
        'student_id': student_id,
        'student_name': user.name if user else 'Unknown',
        'integrity_confidence': confidence,
        'confidence_band': band,
        'review_recommended': review_recommended,
        'severity_breakdown': severity_counts,
        'violation_counts': dict(violation_counts),
        'timeline': timeline[:50],  # Latest 50 events
        'plagiarism_flags': plag_flags,
        'code_anomalies': anomalies,
    }


def get_integrity_review_queue(
    scope_level: str = 'institution',
    scope_id: Optional[str] = None,
    institution_id: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Ranks students with active proctoring flags, plagiarism flags, or integrity
    concerns within the academic scope.
    """
    entities = resolve_scope_entities(scope_level, scope_id, institution_id)
    student_ids = entities.get('student_ids', [])

    if not student_ids and institution_id:
        users = User.query.filter_by(institution_id=institution_id, role='student', is_active=True).all()
        student_ids = [u.id for u in users]

    if not student_ids:
        return []

    # Filter to students who have ANY proctor events or plagiarism flags
    flagged_students = set()
    pe_sids = (
        db.session.query(ProctorEvent.student_id)
        .filter(ProctorEvent.student_id.in_(student_ids))
        .distinct()
        .all()
    )
    for row in pe_sids:
        flagged_students.add(row[0])

    pf_sids = (
        db.session.query(PlagiarismFlag.student_a_id)
        .filter(PlagiarismFlag.student_a_id.in_(student_ids))
        .distinct()
        .all()
    )
    for row in pf_sids:
        flagged_students.add(row[0])

    queue = []
    for sid in flagged_students:
        report = compute_integrity_confidence(student_id=sid, institution_id=institution_id)
        if report['review_recommended'] or report['integrity_confidence'] < 85.0:
            queue.append(report)

    # Sort ascending by confidence (lowest confidence / most suspicious first)
    queue.sort(key=lambda x: x['integrity_confidence'])

    return queue[:limit]
