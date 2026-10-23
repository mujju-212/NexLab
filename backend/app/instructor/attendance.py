"""
Instructor — Attendance Management
Hierarchical filtering (Year -> Section -> Subject -> Experiment -> Session),
session attendance register with Focus Scores, student attendance profile drill-down,
and manual attendance override + export.
"""
import io, csv
from datetime import datetime
from flask import Blueprint, request, jsonify, g, make_response
from sqlalchemy import func, or_
from app.auth.utils import require_role
from app.extensions import db
from app.models.session import LabSession, SessionAttendance
from app.models.user import User
from app.models.academic import AcademicYear, Batch, Section, SectionSubject, SectionStudent
from app.models.subject import Subject
from app.models.experiment import Experiment
from app.models.knowledge import FocusScore

attendance_bp = Blueprint('instructor_attendance', __name__)


# ── Hierarchical Filter Structure ──────────────────────────────────────────────

@attendance_bp.route('/attendance/filter-tree', methods=['GET'])
@require_role('instructor', 'institution_admin')
def get_attendance_filter_tree():
    """
    Returns the complete cascading hierarchy for the instructor:
    Academic Years -> Sections -> Subjects -> Experiments -> Sessions.
    """
    iid = g.institution_id

    # 1. Academic Years
    years = AcademicYear.query.filter_by(institution_id=iid).order_by(
        AcademicYear.is_active.desc(), AcademicYear.created_at.desc()
    ).all()
    years_data = [y.to_dict() for y in years]

    # 2. Teaching Assignments (SectionSubject)
    if g.role == 'institution_admin':
        assignments = SectionSubject.query.filter_by(institution_id=iid).all()
    else:
        assignments = SectionSubject.query.filter_by(
            institution_id=iid, instructor_id=g.user_id
        ).all()
        if not assignments:
            assignments = SectionSubject.query.filter_by(institution_id=iid).all()

    ss_ids = [ss.id for ss in assignments]
    section_ids = list({ss.section_id for ss in assignments if ss.section_id})
    subject_ids = list({ss.subject_id for ss in assignments if ss.subject_id})

    # 3. Sections & Batches
    sections = Section.query.filter(Section.id.in_(section_ids)).all() if section_ids else []
    batch_ids = list({s.batch_id for s in sections if s.batch_id})
    batches = {b.id: b for b in Batch.query.filter(Batch.id.in_(batch_ids)).all()} if batch_ids else {}

    sections_data = []
    for sec in sections:
        b = batches.get(sec.batch_id)
        sections_data.append({
            'id': sec.id,
            'name': sec.name,
            'section_code': sec.section_code or '',
            'batch_id': sec.batch_id,
            'batch_name': b.name if b else '',
            'year_id': b.year_id if b else None,
        })
    sections_data.sort(key=lambda x: (x.get('batch_name') or '', x.get('name') or ''))

    # 4. Subjects mapped to section
    subjects = {s.id: s for s in Subject.query.filter(Subject.id.in_(subject_ids)).all()} if subject_ids else {}
    ss_data = []
    for ss in assignments:
        subj = subjects.get(ss.subject_id)
        if subj:
            ss_data.append({
                'section_subject_id': ss.id,
                'section_id': ss.section_id,
                'subject_id': subj.id,
                'name': subj.name,
                'code': subj.code or '',
                'icon': getattr(subj, 'icon', None) or 'datastruct',
            })
    ss_data.sort(key=lambda x: x['name'])

    # 5. Experiments
    exp_query = Experiment.query.filter(
        Experiment.institution_id == iid,
        Experiment.subject_id.in_(subject_ids)
    ) if subject_ids else Experiment.query.filter_by(id='none')
    experiments = exp_query.order_by(Experiment.exp_number.asc()).all()
    experiments_data = [{
        'id': e.id,
        'subject_id': e.subject_id,
        'exp_number': e.exp_number,
        'title': e.title,
    } for e in experiments]

    # 6. Sessions
    sessions_query = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.section_subject_id.in_(ss_ids)
    ) if ss_ids else LabSession.query.filter_by(id='none')
    sessions = sessions_query.order_by(LabSession.scheduled_at.desc()).all()
    sessions_data = []
    for s in sessions:
        ss_obj = next((item for item in assignments if item.id == s.section_subject_id), None)
        sessions_data.append({
            'id': s.id,
            'title': s.title or (f"Session {s.scheduled_at.strftime('%b %d, %H:%M') if s.scheduled_at else ''}"),
            'scheduled_at': s.scheduled_at.isoformat() if s.scheduled_at else None,
            'duration_minutes': s.duration_minutes,
            'status': s.status,
            'experiment_id': s.experiment_id,
            'section_subject_id': s.section_subject_id,
            'section_id': ss_obj.section_id if ss_obj else None,
            'subject_id': ss_obj.subject_id if ss_obj else None,
        })

    return jsonify({
        'years': years_data,
        'sections': sections_data,
        'section_subjects': ss_data,
        'experiments': experiments_data,
        'sessions': sessions_data,
    }), 200


# ── Session Attendance Register ────────────────────────────────────────────────

@attendance_bp.route('/sessions/<session_id>/attendance', methods=['GET'])
@require_role('instructor', 'institution_admin')
def get_attendance(session_id):
    """Full attendance list for a session with student names, focus scores, and enrolled section students."""
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    attendances = SessionAttendance.query.filter_by(session_id=session_id).all()
    att_by_student = {a.student_id: a for a in attendances}

    enrolled_ids = []
    if session.section_subject_id:
        ss = SectionSubject.query.get(session.section_subject_id)
        if ss:
            enrolled_students = SectionStudent.query.filter_by(section_id=ss.section_id).all()
            enrolled_ids = [es.student_id for es in enrolled_students]

    all_student_ids = list(set(list(att_by_student.keys()) + enrolled_ids))
    students = {
        u.id: u for u in User.query.filter(User.id.in_(all_student_ids)).all()
    } if all_student_ids else {}

    # Query focus scores for this session
    focus_scores = dict(db.session.query(
        FocusScore.student_id, func.avg(FocusScore.focus_score)
    ).filter(
        FocusScore.session_id == session_id,
        FocusScore.focus_score.isnot(None)
    ).group_by(FocusScore.student_id).all()) if all_student_ids else {}

    result = []
    for sid in all_student_ids:
        u = students.get(sid)
        a = att_by_student.get(sid)
        if a:
            d = a.to_dict()
            d['is_recorded'] = True
        else:
            # No attendance row is missing evidence, not proof of absence.
            # Only an explicitly stored 'absent' status may be counted absent.
            d = {
                'student_id': sid,
                'status': 'not_recorded',
                'joined_at': None,
                'total_time_seconds': None,
                'is_active_participant': None,
                'override_reason': None,
                'is_recorded': False,
            }
        d['full_name']   = u.full_name if u else 'Unknown'
        d['roll_number'] = u.roll_number if u else ''
        d['email']       = u.email if u else ''
        d['focus_score'] = round(focus_scores[sid], 1) if sid in focus_scores else None
        result.append(d)

    result.sort(key=lambda x: (x.get('roll_number') or '', x.get('full_name') or ''))
    avg_focus = round(sum(focus_scores.values()) / len(focus_scores), 1) if focus_scores else None

    recorded_total = sum(1 for row in result if row.get('is_recorded'))
    return jsonify({
        'attendance': result,
        'total': len(result),
        'recorded_total': recorded_total,
        'unrecorded_total': max(0, len(result) - recorded_total),
        'avg_focus_score': avg_focus,
        'session': {
            'id': session.id,
            'title': session.title,
            'status': session.status,
            'scheduled_at': session.scheduled_at.isoformat() if session.scheduled_at else None,
            'duration_minutes': session.duration_minutes,
        }
    }), 200


@attendance_bp.route('/sessions/<session_id>/attendance/<student_id>/override', methods=['POST'])
@require_role('instructor', 'institution_admin')
def override_attendance(session_id, student_id):
    """
    Manually override a student's attendance status.
    Body: {"status": "present" | "absent" | "late" | "partial",
           "reason": "Internet disconnected"}
    """
    LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    data   = request.get_json() or {}
    status = data.get('status')
    if status not in ('present', 'absent', 'late', 'partial', 'inactive_present'):
        return jsonify({'error': 'Invalid status'}), 400

    reason = data.get('reason', 'Manual override by instructor')
    att = SessionAttendance.query.filter_by(
        session_id=session_id, student_id=student_id
    ).first()

    from datetime import datetime
    if not att:
        att = SessionAttendance(
            session_id=session_id,
            student_id=student_id,
            status=status,
            joined_at=datetime.utcnow() if status in ('present', 'late') else None,
            override_reason=reason,
            override_by=g.user_id
        )
        db.session.add(att)
    else:
        att.status          = status
        att.override_reason = reason
        att.override_by     = g.user_id
        if status in ('present', 'late') and not att.joined_at:
            att.joined_at = datetime.utcnow()

    db.session.commit()

    return jsonify({'message': 'Attendance overridden', 'status': status}), 200


@attendance_bp.route('/sessions/<session_id>/attendance/export', methods=['GET'])
@require_role('instructor', 'institution_admin')
def export_attendance(session_id):
    """Download attendance as CSV with focus scores."""
    sess = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    attendances = SessionAttendance.query.filter_by(session_id=session_id).all()
    att_by_student = {a.student_id: a for a in attendances}

    from app.models.academic import SectionSubject, SectionStudent
    enrolled_ids = []
    if sess.section_subject_id:
        ss = SectionSubject.query.get(sess.section_subject_id)
        if ss:
            enrolled_students = SectionStudent.query.filter_by(section_id=ss.section_id).all()
            enrolled_ids = [es.student_id for es in enrolled_students]

    all_student_ids = list(set(list(att_by_student.keys()) + enrolled_ids))
    students = {
        u.id: u for u in User.query.filter(User.id.in_(all_student_ids)).all()
    } if all_student_ids else {}

    focus_scores = dict(db.session.query(
        FocusScore.student_id, func.avg(FocusScore.focus_score)
    ).filter(
        FocusScore.session_id == session_id,
        FocusScore.focus_score.isnot(None)
    ).group_by(FocusScore.student_id).all()) if all_student_ids else {}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Roll Number', 'Full Name', 'Email',
        'Status', 'Joined At', 'Total Time (min)',
        'Focus Score (%)', 'Is Active Participant', 'Override Reason'
    ])

    sorted_sids = sorted(all_student_ids, key=lambda sid: (
        (students.get(sid).roll_number if students.get(sid) else '') or '',
        (students.get(sid).full_name if students.get(sid) else '') or ''
    ))

    for sid in sorted_sids:
        u = students.get(sid)
        a = att_by_student.get(sid)
        st = a.status if a else 'not_recorded'
        j_at = a.joined_at.strftime('%Y-%m-%d %H:%M:%S') if (a and a.joined_at) else ''
        t_sec = a.total_time_seconds if (a and a.total_time_seconds is not None) else ''
        is_act = ('Yes' if a.is_active_participant else 'No') if a else ''
        ovr = (a.override_reason or '') if a else ''
        f_score = round(focus_scores[sid], 1) if sid in focus_scores else ''

        writer.writerow([
            u.roll_number if u else '',
            u.full_name if u else 'Unknown',
            u.email if u else '',
            st,
            j_at,
            round(float(t_sec) / 60, 1) if t_sec != '' else '',
            f_score,
            is_act,
            ovr,
        ])

    session_label = sess.scheduled_at.strftime('%Y%m%d') if sess.scheduled_at else 'session'
    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = (
        f'attachment; filename="attendance_{session_label}.csv"'
    )
    return response


@attendance_bp.route('/sessions/<session_id>/attendance/summary', methods=['GET'])
@require_role('instructor', 'institution_admin')
def attendance_summary(session_id):
    """Quick count of each status for a session."""
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    attendances = SessionAttendance.query.filter_by(session_id=session_id).all()
    att_by_student = {a.student_id: a for a in attendances}

    from app.models.academic import SectionSubject, SectionStudent
    enrolled_ids = []
    if session.section_subject_id:
        ss = SectionSubject.query.get(session.section_subject_id)
        if ss:
            enrolled_students = SectionStudent.query.filter_by(section_id=ss.section_id).all()
            enrolled_ids = [es.student_id for es in enrolled_students]

    all_ids = set(list(att_by_student.keys()) + enrolled_ids)
    summary = {}
    for sid in all_ids:
        a = att_by_student.get(sid)
        st = a.status if a else 'not_recorded'
        summary[st] = summary.get(st, 0) + 1

    return jsonify({
        'session_id': session_id,
        'total':      len(all_ids),
        'breakdown':  summary,
    }), 200


# ── Single Student Drill-Down & Search ─────────────────────────────────────────

@attendance_bp.route('/attendance/student/<student_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def get_student_attendance_history(student_id):
    """
    Returns complete multi-session attendance history for a single student across
    subjects and sessions taught by this instructor (or all sessions if institution_admin).
    """
    iid = g.institution_id
    student = User.query.filter_by(id=student_id, role='student').first_or_404()

    # Determine sections this student is enrolled in
    enrolled_sec_ids = [
        ss.section_id for ss in SectionStudent.query.filter_by(student_id=student_id).all()
    ]

    # SectionSubjects for instructor
    if g.role == 'institution_admin':
        my_ss = SectionSubject.query.filter_by(institution_id=iid).all()
    else:
        my_ss = SectionSubject.query.filter_by(
            institution_id=iid, instructor_id=g.user_id
        ).all()
        if not my_ss:
            my_ss = SectionSubject.query.filter_by(institution_id=iid).all()

    my_ss_ids = [ss.id for ss in my_ss]
    my_sec_ids = {ss.section_id for ss in my_ss}

    # Intersect student's sections with instructor's sections
    relevant_ss = [ss for ss in my_ss if ss.section_id in enrolled_sec_ids]
    relevant_ss_ids = [ss.id for ss in relevant_ss]

    # Also include any session where attendance record already exists for this student
    existing_att = SessionAttendance.query.filter_by(student_id=student_id).all()
    existing_sess_ids = [a.session_id for a in existing_att]

    query = LabSession.query.filter(
        LabSession.institution_id == iid,
        or_(
            LabSession.section_subject_id.in_(relevant_ss_ids) if relevant_ss_ids else False,
            LabSession.id.in_(existing_sess_ids) if existing_sess_ids else False,
        )
    )
    sessions = query.order_by(LabSession.scheduled_at.desc()).all()

    # Metadata lookups
    ss_map = {ss.id: ss for ss in my_ss}
    sec_ids = list({ss.section_id for ss in ss_map.values() if ss.section_id})
    sections = {s.id: s for s in Section.query.filter(Section.id.in_(sec_ids)).all()} if sec_ids else {}
    subj_ids = list({ss.subject_id for ss in ss_map.values() if ss.subject_id})
    subjects = {s.id: s for s in Subject.query.filter(Subject.id.in_(subj_ids)).all()} if subj_ids else {}

    exp_ids = list({s.experiment_id for s in sessions if s.experiment_id})
    experiments = {e.id: e for e in Experiment.query.filter(Experiment.id.in_(exp_ids)).all()} if exp_ids else {}

    att_map = {a.session_id: a for a in existing_att}

    # Query student's focus scores for these sessions
    session_ids = [s.id for s in sessions]
    focus_scores = dict(db.session.query(
        FocusScore.session_id, func.avg(FocusScore.focus_score)
    ).filter(
        FocusScore.student_id == student_id,
        FocusScore.session_id.in_(session_ids),
        FocusScore.focus_score.isnot(None)
    ).group_by(FocusScore.session_id).all()) if session_ids else {}

    history = []
    status_counts = {'present': 0, 'late': 0, 'absent': 0, 'partial': 0, 'inactive_present': 0}
    focus_values = []

    for s in sessions:
        ss_obj = ss_map.get(s.section_subject_id)
        sec = sections.get(ss_obj.section_id) if ss_obj else None
        subj = subjects.get(ss_obj.subject_id) if ss_obj else None
        exp = experiments.get(s.experiment_id)
        att = att_map.get(s.id)

        status = att.status if att else ('absent' if s.status == 'ended' else 'scheduled')
        if status in status_counts:
            status_counts[status] += 1

        f_score = round(focus_scores[s.id], 1) if s.id in focus_scores else None
        if f_score is not None:
            focus_values.append(f_score)

        history.append({
            'session_id': s.id,
            'session_title': s.title or f"Lab Session",
            'scheduled_at': s.scheduled_at.isoformat() if s.scheduled_at else None,
            'session_status': s.status,
            'duration_minutes': s.duration_minutes,
            'subject_id': subj.id if subj else None,
            'subject_name': subj.name if subj else 'Unknown Subject',
            'subject_code': subj.code if subj else '',
            'experiment_id': exp.id if exp else None,
            'experiment_title': exp.title if exp else 'Unknown Experiment',
            'exp_number': exp.exp_number if exp else None,
            'section_name': sec.name if sec else '',
            'status': status,
            'joined_at': att.joined_at.isoformat() if (att and att.joined_at) else None,
            'total_time_seconds': att.total_time_seconds if att else 0,
            'focus_score': f_score,
            'override_reason': att.override_reason if att else None,
        })

    total_past_sessions = status_counts['present'] + status_counts['late'] + status_counts['absent'] + status_counts['partial'] + status_counts['inactive_present']
    attended = status_counts['present'] + status_counts['late']
    att_rate = round((attended / total_past_sessions) * 100, 1) if total_past_sessions > 0 else 0.0
    avg_focus = round(sum(focus_values) / len(focus_values), 1) if focus_values else None

    # Student's primary section
    first_sec = sections.get(enrolled_sec_ids[0]) if enrolled_sec_ids else None
    batch = Batch.query.get(first_sec.batch_id) if (first_sec and first_sec.batch_id) else None

    return jsonify({
        'student': {
            'id': student.id,
            'full_name': student.full_name,
            'roll_number': student.roll_number or '—',
            'email': student.email,
            'section_name': first_sec.name if first_sec else '',
            'batch_name': batch.name if batch else '',
        },
        'summary': {
            'total_sessions': len(sessions),
            'past_sessions': total_past_sessions,
            'attended': attended,
            'attendance_rate': att_rate,
            'avg_focus_score': avg_focus,
            'breakdown': status_counts,
        },
        'history': history,
    }), 200


@attendance_bp.route('/attendance/students/search', methods=['GET'])
@require_role('instructor', 'institution_admin')
def search_attendance_students():
    """
    Search students by name or roll number across the instructor's assigned sections.
    """
    q = (request.args.get('q') or '').strip()
    if not q:
        return jsonify({'students': []}), 200

    iid = g.institution_id
    if g.role == 'institution_admin':
        assignments = SectionSubject.query.filter_by(institution_id=iid).all()
    else:
        assignments = SectionSubject.query.filter_by(
            institution_id=iid, instructor_id=g.user_id
        ).all()
        if not assignments:
            assignments = SectionSubject.query.filter_by(institution_id=iid).all()

    section_ids = list({ss.section_id for ss in assignments if ss.section_id})
    if not section_ids:
        return jsonify({'students': []}), 200

    enrolled = SectionStudent.query.filter(SectionStudent.section_id.in_(section_ids)).all()
    student_ids = list({es.student_id for es in enrolled})
    if not student_ids:
        return jsonify({'students': []}), 200

    pattern = f"%{q}%"
    matches = User.query.filter(
        User.id.in_(student_ids),
        User.role == 'student',
        or_(
            User.full_name.ilike(pattern),
            User.roll_number.ilike(pattern),
            User.email.ilike(pattern),
        )
    ).limit(20).all()

    sec_map = {es.student_id: es.section_id for es in enrolled}
    sections = {s.id: s.name for s in Section.query.filter(Section.id.in_(section_ids)).all()}

    results = []
    for m in matches:
        sec_name = sections.get(sec_map.get(m.id))
        results.append({
            'id': m.id,
            'full_name': m.full_name,
            'roll_number': m.roll_number or '',
            'email': m.email,
            'section_name': sec_name or '',
        })

    return jsonify({'students': results}), 200

