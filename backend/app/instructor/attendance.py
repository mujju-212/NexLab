"""
Instructor — Attendance Management
Manual attendance override + export.
"""
import io, csv
from flask import Blueprint, request, jsonify, g, make_response
from app.auth.utils import require_role
from app.extensions import db
from app.models.session import LabSession, SessionAttendance
from app.models.user import User

attendance_bp = Blueprint('instructor_attendance', __name__)


@attendance_bp.route('/sessions/<session_id>/attendance', methods=['GET'])
@require_role('instructor', 'institution_admin')
def get_attendance(session_id):
    """Full attendance list for a session with student names."""
    LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    attendances = SessionAttendance.query.filter_by(session_id=session_id).all()

    student_ids = [a.student_id for a in attendances]
    students    = {
        u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()
    }

    result = []
    for a in attendances:
        u = students.get(a.student_id)
        d = a.to_dict()
        d['full_name']   = u.full_name if u else 'Unknown'
        d['roll_number'] = u.roll_number if u else ''
        d['email']       = u.email if u else ''
        result.append(d)

    return jsonify({'attendance': result, 'total': len(result)}), 200


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

    att = SessionAttendance.query.filter_by(
        session_id=session_id, student_id=student_id
    ).first_or_404()

    data   = request.get_json() or {}
    status = data.get('status')
    if status not in ('present', 'absent', 'late', 'partial', 'inactive_present'):
        return jsonify({'error': 'Invalid status'}), 400

    att.status          = status
    att.override_reason = data.get('reason', 'Manual override by instructor')
    att.override_by     = g.user_id
    db.session.commit()

    return jsonify({'message': 'Attendance overridden', 'status': status}), 200


@attendance_bp.route('/sessions/<session_id>/attendance/export', methods=['GET'])
@require_role('instructor', 'institution_admin')
def export_attendance(session_id):
    """Download attendance as CSV."""
    sess = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    attendances = SessionAttendance.query.filter_by(session_id=session_id).all()
    student_ids = [a.student_id for a in attendances]
    students    = {
        u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()
    }

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Roll Number', 'Full Name', 'Email',
        'Status', 'Joined At', 'Total Time (min)',
        'Is Active Participant', 'Override Reason'
    ])

    for a in attendances:
        u = students.get(a.student_id)
        writer.writerow([
            u.roll_number if u else '',
            u.full_name if u else 'Unknown',
            u.email if u else '',
            a.status,
            a.joined_at.strftime('%Y-%m-%d %H:%M:%S') if a.joined_at else '',
            round(a.total_time_seconds / 60, 1) if a.total_time_seconds else 0,
            'Yes' if a.is_active_participant else 'No',
            a.override_reason or '',
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
    LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    attendances = SessionAttendance.query.filter_by(session_id=session_id).all()
    summary = {}
    for a in attendances:
        summary[a.status] = summary.get(a.status, 0) + 1

    return jsonify({
        'session_id': session_id,
        'total':      len(attendances),
        'breakdown':  summary,
    }), 200
