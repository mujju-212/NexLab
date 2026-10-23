import json
import re
import uuid
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.planner import RecurringPlan
from app.models.session import LabSession
from app.models.academic import AcademicYear, Batch, Department, Section, SectionSubject, SectionStudent
from app.models.subject import Subject
from app.models.user import User

planner_bp = Blueprint('institution_planner', __name__)

DAY_MAP = {
    'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6,
    'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3, 'Friday': 4, 'Saturday': 5, 'Sunday': 6
}


def _parse_time_str(t_str):
    """Parse 24-hour or AM/PM time strings into validated (hour, minute)."""
    if not isinstance(t_str, str) or not t_str.strip():
        raise ValueError('Start time is required')
    match = re.fullmatch(r"\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*", t_str, re.IGNORECASE)
    if not match:
        raise ValueError('Start time must look like 09:00, 14:30, or 2:30 PM')
    hour, minute = int(match.group(1)), int(match.group(2))
    suffix = (match.group(3) or '').upper()
    if minute > 59 or (suffix and not 1 <= hour <= 12) or (not suffix and hour > 23):
        raise ValueError('Start time is outside the valid clock range')
    if suffix == 'PM' and hour < 12:
        hour += 12
    elif suffix == 'AM' and hour == 12:
        hour = 0
    return hour, minute


@planner_bp.route('/recurring-plans', methods=['GET'])
@require_role('institution_admin', 'instructor')
def get_recurring_plans():
    """
    List recurring plans with filters and overall planner statistics.
    Query params: status, department_id, batch_id, academic_year_id, search, page, per_page
    """
    # Ensure tables exist
    try:
        db.create_all()
    except Exception:
        pass

    institution_id = g.institution_id
    query = RecurringPlan.query.filter_by(institution_id=institution_id)

    status = request.args.get('status', '').strip().lower()
    if status and status != 'all' and status != 'all status':
        query = query.filter_by(status=status)

    dept_id = request.args.get('department_id', '').strip()
    if dept_id and dept_id != 'all':
        query = query.filter_by(department_id=dept_id)

    batch_id = request.args.get('batch_id', '').strip()
    if batch_id and batch_id != 'all':
        query = query.filter_by(batch_id=batch_id)

    search = request.args.get('search', '').strip().lower()
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            db.or_(
                RecurringPlan.name.ilike(search_pattern),
                RecurringPlan.description.ilike(search_pattern)
            )
        )

    all_plans = query.order_by(RecurringPlan.created_at.asc()).all()

    # Calculate overall metrics across the institution (unfiltered for top KPIs)
    total_inst_plans = RecurringPlan.query.filter_by(institution_id=institution_id).all()
    active_plans_count = sum(1 for p in total_inst_plans if p.status == 'active')
    total_sessions_generated = sum(p.sessions_generated_count or 0 for p in total_inst_plans)
    
    # Calculate covered sections
    covered_sections = set()
    for p in total_inst_plans:
        for s in p.get_sections():
            if isinstance(s, dict):
                covered_sections.add(s.get('name') or s.get('id'))
            elif s:
                covered_sections.add(str(s))
    sections_covered_count = len(covered_sections)

    stats = {
        'total_plans': len(total_inst_plans),
        'active_plans': active_plans_count,
        'sessions_generated': total_sessions_generated,
        'sections_covered': sections_covered_count,
        'conflict_rate': 0,
        'on_track_pct': 100,
    }

    return jsonify({
        'plans': [p.to_dict() for p in all_plans],
        'total': len(all_plans),
        'stats': stats,
    }), 200


@planner_bp.route('/recurring-plans', methods=['POST'])
@require_role('institution_admin')
def create_recurring_plan():
    """
    Create a new recurring plan and optionally generate lab sessions.
    """
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Plan Name is required'}), 400

    try:
        start_date_s = data.get('start_date')
        end_date_s = data.get('end_date')
        if not start_date_s or not end_date_s:
            raise ValueError('Start date and end date are required')
        start_date = datetime.strptime(str(start_date_s)[:10], '%Y-%m-%d').date()
        end_date = datetime.strptime(str(end_date_s)[:10], '%Y-%m-%d').date()
        if end_date < start_date:
            raise ValueError('End date must be on or after the start date')
        schedule_days = data.get('schedule_days')
        if not isinstance(schedule_days, list) or not schedule_days:
            raise ValueError('Choose at least one weekday')
        invalid_days = [d for d in schedule_days if d not in DAY_MAP]
        if invalid_days:
            raise ValueError('One or more selected weekdays are invalid')
        start_time = data.get('start_time')
        _parse_time_str(start_time)
        duration = int(data.get('duration_minutes') or 0)
        if not 15 <= duration <= 480:
            raise ValueError('Duration must be between 15 and 480 minutes')
        sections = data.get('sections')
        subjects = data.get('subjects')
        if not isinstance(sections, list) or not sections:
            raise ValueError('Choose at least one section')
        if not isinstance(subjects, list) or not subjects:
            raise ValueError('Choose at least one subject')
        status = (data.get('status') or 'active').lower()
        if status not in ('active', 'draft', 'paused'):
            raise ValueError('Plan status must be active, draft, or paused')
    except (TypeError, ValueError) as exc:
        return jsonify({'error': str(exc)}), 400

    department_id = data.get('department_id')
    batch_id = data.get('batch_id')
    academic_year_id = data.get('academic_year_id')
    if department_id and not Department.query.filter_by(id=department_id, institution_id=g.institution_id).first():
        return jsonify({'error': 'Selected department is not in this institution'}), 400
    batch = Batch.query.filter_by(id=batch_id, institution_id=g.institution_id).first() if batch_id else None
    if batch_id and not batch:
        return jsonify({'error': 'Selected batch is not in this institution'}), 400
    if batch and department_id and batch.department_id and batch.department_id != department_id:
        return jsonify({'error': 'Selected batch does not belong to the selected department'}), 400
    year = AcademicYear.query.filter_by(id=academic_year_id, institution_id=g.institution_id).first() if academic_year_id else None
    if academic_year_id and not year:
        return jsonify({'error': 'Selected academic year is not in this institution'}), 400
    if batch and year and batch.year_id != year.id:
        return jsonify({'error': 'Selected batch does not belong to the selected academic year'}), 400

    plan = RecurringPlan(
        institution_id=g.institution_id,
        name=name,
        description=data.get('description', ''),
        department_id=data.get('department_id'),
        batch_id=data.get('batch_id'),
        academic_year_id=data.get('academic_year_id'),
        sections_json=json.dumps(sections),
        subjects_json=json.dumps(subjects),
        schedule_days_json=json.dumps(schedule_days),
        start_time=start_time,
        duration_minutes=duration,
        start_date=start_date,
        end_date=end_date,
        room=data.get('room', 'Lab 1 (Main Block)'),
        instructor_id=data.get('instructor_id'),
        status=status,
        sessions_generated_count=0
    )

    db.session.add(plan)
    db.session.flush()

    # Generate initial sessions if status is active
    if status == 'active':
        try:
            created_count = _generate_sessions_for_plan(plan)
            plan.sessions_generated_count = created_count
        except ValueError as exc:
            db.session.rollback()
            return jsonify({'error': str(exc)}), 400

    db.session.commit()
    return jsonify({'plan': plan.to_dict(), 'message': 'Recurring plan created successfully'}), 201


@planner_bp.route('/recurring-plans/<plan_id>', methods=['GET'])
@require_role('institution_admin', 'instructor')
def get_single_plan(plan_id):
    plan = RecurringPlan.query.filter_by(id=plan_id, institution_id=g.institution_id).first()
    if not plan:
        return jsonify({'error': 'Plan not found'}), 404
    return jsonify({'plan': plan.to_dict()}), 200


@planner_bp.route('/recurring-plans/<plan_id>', methods=['PUT'])
@require_role('institution_admin')
def update_recurring_plan(plan_id):
    plan = RecurringPlan.query.filter_by(id=plan_id, institution_id=g.institution_id).first()
    if not plan:
        return jsonify({'error': 'Plan not found'}), 404

    data = request.get_json() or {}

    # Existing generated instances have no plan foreign key, so changing the
    # recurrence cannot be reconciled safely. Reject a changed schedule instead
    # of silently changing the rule while leaving old dates in every role's view.
    current_sections = plan.get_sections()
    current_subjects = plan.get_subjects()
    current_days = plan.get_schedule_days()
    candidate_sections = data.get('sections', current_sections)
    candidate_subjects = data.get('subjects', current_subjects)
    candidate_days = data.get('schedule_days', current_days)
    candidate_time = data.get('start_time', plan.start_time)
    candidate_duration = data.get('duration_minutes', plan.duration_minutes)
    candidate_start = plan.start_date
    candidate_end = plan.end_date
    try:
        if 'start_date' in data:
            candidate_start = datetime.strptime(str(data['start_date'])[:10], '%Y-%m-%d').date()
        if 'end_date' in data:
            candidate_end = datetime.strptime(str(data['end_date'])[:10], '%Y-%m-%d').date()
        if candidate_end < candidate_start:
            raise ValueError('End date must be on or after the start date')
        if not isinstance(candidate_days, list) or not candidate_days or any(d not in DAY_MAP for d in candidate_days):
            raise ValueError('Choose at least one valid weekday')
        candidate_hour, candidate_minute = _parse_time_str(candidate_time)
        candidate_duration = int(candidate_duration)
        if not 15 <= candidate_duration <= 480:
            raise ValueError('Duration must be between 15 and 480 minutes')
    except (TypeError, ValueError) as exc:
        return jsonify({'error': str(exc)}), 400

    try:
        old_hour, old_minute = _parse_time_str(plan.start_time)
    except ValueError:
        old_hour, old_minute = None, None
    schedule_changed = any([
        candidate_start != plan.start_date,
        candidate_end != plan.end_date,
        candidate_days != current_days,
        (candidate_hour, candidate_minute) != (old_hour, old_minute),
        candidate_duration != plan.duration_minutes,
        candidate_sections != current_sections,
        candidate_subjects != current_subjects,
        data.get('batch_id', plan.batch_id) != plan.batch_id,
        data.get('department_id', plan.department_id) != plan.department_id,
        data.get('academic_year_id', plan.academic_year_id) != plan.academic_year_id,
        data.get('instructor_id', plan.instructor_id) != plan.instructor_id,
        data.get('room', plan.room) != plan.room,
        data.get('name', plan.name) != plan.name,
    ])
    if (plan.sessions_generated_count or 0) > 0 and schedule_changed:
        return jsonify({
            'error': 'This plan already has generated sessions. Create a new plan or edit the individual scheduled sessions; the recurrence cannot safely rewrite existing class dates.'
        }), 409

    if 'name' in data:
        plan.name = data['name'].strip()
    if 'description' in data:
        plan.description = data['description']
    if 'department_id' in data:
        plan.department_id = data['department_id']
    if 'batch_id' in data:
        plan.batch_id = data['batch_id']
    if 'academic_year_id' in data:
        plan.academic_year_id = data['academic_year_id']
    if 'sections' in data:
        plan.sections_json = json.dumps(data['sections'])
    if 'subjects' in data:
        plan.subjects_json = json.dumps(data['subjects'])
    if 'schedule_days' in data:
        plan.schedule_days_json = json.dumps(data['schedule_days'])
    if 'start_time' in data:
        plan.start_time = data['start_time']
    if 'duration_minutes' in data:
        plan.duration_minutes = candidate_duration
    if 'start_date' in data:
        plan.start_date = candidate_start
    if 'end_date' in data:
        plan.end_date = candidate_end
    if 'room' in data:
        plan.room = data['room']
    if 'instructor_id' in data:
        plan.instructor_id = data['instructor_id']

    prev_status = plan.status
    if 'status' in data:
        new_status = data['status'].lower()
        if new_status in ('active', 'draft', 'paused'):
            plan.status = new_status
            if prev_status == 'draft' and new_status == 'active' and plan.sessions_generated_count == 0:
                try:
                    created_count = _generate_sessions_for_plan(plan)
                    plan.sessions_generated_count = created_count
                except ValueError as exc:
                    db.session.rollback()
                    return jsonify({'error': str(exc)}), 400

    db.session.commit()
    return jsonify({'plan': plan.to_dict(), 'message': 'Plan updated successfully'}), 200


@planner_bp.route('/recurring-plans/<plan_id>', methods=['DELETE'])
@require_role('institution_admin')
def delete_recurring_plan(plan_id):
    plan = RecurringPlan.query.filter_by(id=plan_id, institution_id=g.institution_id).first()
    if not plan:
        return jsonify({'error': 'Plan not found'}), 404

    db.session.delete(plan)
    db.session.commit()
    return jsonify({'message': f'Plan "{plan.name}" deleted successfully'}), 200


@planner_bp.route('/recurring-plans/<plan_id>/duplicate', methods=['POST'])
@require_role('institution_admin')
def duplicate_recurring_plan(plan_id):
    source = RecurringPlan.query.filter_by(id=plan_id, institution_id=g.institution_id).first()
    if not source:
        return jsonify({'error': 'Source plan not found'}), 404

    new_plan = RecurringPlan(
        institution_id=source.institution_id,
        name=f"{source.name} (Copy)",
        description=source.description,
        department_id=source.department_id,
        batch_id=source.batch_id,
        academic_year_id=source.academic_year_id,
        sections_json=source.sections_json,
        subjects_json=source.subjects_json,
        schedule_days_json=source.schedule_days_json,
        start_time=source.start_time,
        duration_minutes=source.duration_minutes,
        start_date=source.start_date,
        end_date=source.end_date,
        room=source.room,
        instructor_id=source.instructor_id,
        status='draft',
        sessions_generated_count=0
    )

    db.session.add(new_plan)
    db.session.commit()
    return jsonify({'plan': new_plan.to_dict(), 'message': 'Plan duplicated as draft'}), 201


@planner_bp.route('/recurring-plans/<plan_id>/generate', methods=['POST'])
@require_role('institution_admin')
def trigger_generation(plan_id):
    plan = RecurringPlan.query.filter_by(id=plan_id, institution_id=g.institution_id).first()
    if not plan:
        return jsonify({'error': 'Plan not found'}), 404

    count = _generate_sessions_for_plan(plan)
    plan.sessions_generated_count = (plan.sessions_generated_count or 0) + count
    plan.status = 'active'
    db.session.commit()
    return jsonify({
        'plan': plan.to_dict(),
        'sessions_generated': count,
        'message': f'Successfully generated {count} sessions for {plan.name}'
    }), 200


@planner_bp.route('/recurring-plans/templates', methods=['GET'])
@require_role('institution_admin', 'instructor')
def get_plan_templates():
    """Return pre-configured timetable planner templates"""
    templates = [
        {
            'id': 'tpl_cse_core',
            'name': 'CSE Core Labs Semester Track',
            'description': 'Standard weekly recurring schedule for core data structures, algorithms, and networking labs.',
            'department_name': 'Computer Science & Engineering',
            'schedule_days': ['Mon', 'Wed', 'Fri'],
            'start_time': '09:00 AM',
            'duration_minutes': 60,
            'subjects_suggested': ['Data Structures', 'Computer Networks', 'Database Systems'],
            'sections_suggested': ['A', 'B'],
        },
        {
            'id': 'tpl_workshop_block',
            'name': 'Intensive Lab Practical Block',
            'description': 'Single extended weekend or afternoon session for hands-on compiler design and machine learning experiments.',
            'department_name': 'Computer Science & Engineering',
            'schedule_days': ['Sat'],
            'start_time': '10:00 AM',
            'duration_minutes': 120,
            'subjects_suggested': ['Machine Learning', 'Web Technologies'],
            'sections_suggested': ['B'],
        },
        {
            'id': 'tpl_biweekly_prog',
            'name': 'Bi-Weekly Programming Practicals',
            'description': 'Alternating Tuesday and Thursday laboratory sessions for object-oriented and systems programming.',
            'department_name': 'Computer Science & Engineering',
            'schedule_days': ['Tue', 'Thu'],
            'start_time': '02:00 PM',
            'duration_minutes': 90,
            'subjects_suggested': ['OOP Concepts Lab', 'Python Programming'],
            'sections_suggested': ['A', 'B'],
        },
        {
            'id': 'tpl_first_year',
            'name': 'First-Year Engineering Lab Foundation',
            'description': 'Introductory computing and hardware architecture timetable slot.',
            'department_name': 'Computer Science & Engineering',
            'schedule_days': ['Mon', 'Wed'],
            'start_time': '11:00 AM',
            'duration_minutes': 60,
            'subjects_suggested': ['Operating Systems', 'Information Security'],
            'sections_suggested': ['A'],
        }
    ]
    return jsonify({'templates': templates}), 200


@planner_bp.route('/recurring-plans/conflicts', methods=['GET'])
@require_role('institution_admin', 'instructor')
def check_plan_conflicts():
    """Analyze timetable clashing between sections and instructors"""
    iid = g.institution_id
    sessions = (
        db.session.query(LabSession, SectionSubject)
        .join(SectionSubject, SectionSubject.id == LabSession.section_subject_id)
        .filter(
            LabSession.institution_id == iid,
            LabSession.status.in_(['scheduled', 'active']),
            LabSession.scheduled_at.isnot(None),
        )
        .all()
    )

    conflicts = []
    n = len(sessions)
    for i in range(n):
        sess_a, ss_a = sessions[i]
        start_a = sess_a.scheduled_at
        end_a = start_a + timedelta(minutes=sess_a.duration_minutes or 60)

        for j in range(i + 1, n):
            sess_b, ss_b = sessions[j]
            start_b = sess_b.scheduled_at
            end_b = start_b + timedelta(minutes=sess_b.duration_minutes or 60)

            # Check overlap: (start_a < end_b) and (start_b < end_a)
            if start_a < end_b and start_b < end_a:
                conflict_type = None
                reason = None
                if ss_a.instructor_id and ss_a.instructor_id == ss_b.instructor_id:
                    conflict_type = 'instructor_clash'
                    inst = User.query.get(ss_a.instructor_id)
                    reason = f"Instructor {inst.full_name if inst else 'Unknown'} double-booked"
                elif ss_a.section_id and ss_a.section_id == ss_b.section_id:
                    conflict_type = 'section_clash'
                    sec = Section.query.get(ss_a.section_id)
                    reason = f"Section {sec.name if sec else 'Unknown'} scheduled in overlapping slots"

                if conflict_type:
                    conflicts.append({
                        'type': conflict_type,
                        'reason': reason,
                        'session_1': {
                            'id': sess_a.id,
                            'title': sess_a.title,
                            'scheduled_at': sess_a.scheduled_at.isoformat() if sess_a.scheduled_at else None,
                        },
                        'session_2': {
                            'id': sess_b.id,
                            'title': sess_b.title,
                            'scheduled_at': sess_b.scheduled_at.isoformat() if sess_b.scheduled_at else None,
                        },
                    })

    has_conflicts = len(conflicts) > 0
    total_sess_count = len(sessions)
    conflict_count = len(conflicts)
    on_track_pct = 100 if not has_conflicts else max(0, round(((total_sess_count - conflict_count) / max(total_sess_count, 1)) * 100, 1))

    if not has_conflicts:
        msg = f"No timetable conflicts detected! All {total_sess_count} active sessions are running cleanly."
    else:
        msg = f"Detected {conflict_count} schedule conflict(s) across {total_sess_count} scheduled sessions."

    return jsonify({
        'has_conflicts': has_conflicts,
        'conflict_count': conflict_count,
        'conflicts': conflicts,
        'on_track_pct': on_track_pct,
        'message': msg,
    }), 200


def _resolve_plan_section_subjects(plan):
    """Resolve every explicitly selected section/subject pair without broad fallbacks."""
    raw_sections = plan.get_sections()
    raw_subjects = plan.get_subjects()
    if not raw_sections or not raw_subjects:
        raise ValueError('Choose at least one section and one subject')

    section_query = Section.query.filter_by(institution_id=plan.institution_id)
    if plan.batch_id:
        section_query = section_query.filter_by(batch_id=plan.batch_id)
    available_sections = section_query.all()
    selected_sections = []
    for item in raw_sections:
        token = str((item.get('id') or item.get('name')) if isinstance(item, dict) else item).strip()
        match = next((s for s in available_sections if s.id == token), None)
        if match is None:
            matches = [s for s in available_sections if s.name.casefold() == token.casefold()]
            if len(matches) != 1:
                raise ValueError(f'Section "{token}" was not found in the selected batch')
            match = matches[0]
        if match not in selected_sections:
            selected_sections.append(match)

    available_subjects = Subject.query.filter_by(institution_id=plan.institution_id).all()
    selected_subjects = []
    for item in raw_subjects:
        if isinstance(item, dict):
            token = str(item.get('id') or item.get('name') or item.get('code') or '').strip()
        else:
            token = str(item or '').strip()
        match = next((s for s in available_subjects if s.id == token), None)
        if match is None:
            matches = [s for s in available_subjects if
                       s.name.casefold() == token.casefold() or
                       (s.code and s.code.casefold() == token.casefold())]
            if len(matches) != 1:
                raise ValueError(f'Subject "{token}" was not found in this institution')
            match = matches[0]
        if match not in selected_subjects:
            selected_subjects.append(match)

    instructor = None
    if plan.instructor_id:
        instructor = User.query.filter_by(
            id=plan.instructor_id,
            institution_id=plan.institution_id,
            role='instructor',
            is_active=True,
        ).first()
        if not instructor:
            raise ValueError('Selected instructor is not an active instructor in this institution')

    resolved = []
    for section in selected_sections:
        for subject in selected_subjects:
            rows = SectionSubject.query.filter_by(
                institution_id=plan.institution_id,
                section_id=section.id,
                subject_id=subject.id,
            ).all()
            if instructor:
                assigned = [r for r in rows if r.instructor_id == instructor.id or r.co_instructor_id == instructor.id]
                if assigned:
                    resolved.append(assigned[0])
                elif rows:
                    raise ValueError(
                        f'{instructor.full_name} is not assigned to {subject.name} for section {section.name}. '
                        'Update the section subject assignment first.'
                    )
                else:
                    assignment = SectionSubject(
                        institution_id=plan.institution_id,
                        section_id=section.id,
                        subject_id=subject.id,
                        instructor_id=instructor.id,
                    )
                    db.session.add(assignment)
                    resolved.append(assignment)
            elif rows:
                resolved.append(rows[0])
            else:
                raise ValueError(
                    f'No instructor assignment exists for {subject.name}, section {section.name}. '
                    'Assign an instructor or select one in the plan.'
                )

    db.session.flush()
    return resolved


def _generate_sessions_for_plan(plan):
    """Create idempotent LabSession records for each selected weekday and class."""
    hour, minute = _parse_time_str(plan.start_time)
    schedule_days = plan.get_schedule_days()
    target_weekdays = sorted({DAY_MAP[d] for d in schedule_days if d in DAY_MAP})
    if not target_weekdays:
        raise ValueError('Choose at least one valid weekday')

    ss_rows = _resolve_plan_section_subjects(plan)
    campus_tz = ZoneInfo('Asia/Kolkata')
    utc_tz = ZoneInfo('UTC')
    cur = plan.start_date
    created_count = 0
    session_num = 1
    while cur <= plan.end_date:
        if cur.weekday() in target_weekdays:
            local_dt = datetime(cur.year, cur.month, cur.day, hour, minute, tzinfo=campus_tz)
            slot_time = local_dt.astimezone(utc_tz).replace(tzinfo=None)
            for ss in ss_rows:
                existing = LabSession.query.filter_by(
                    institution_id=plan.institution_id,
                    section_subject_id=ss.id,
                    scheduled_at=slot_time,
                ).first()
                if not existing:
                    base_room = re.sub(r'[^a-z0-9-]+', '-', (plan.room or 'lab').lower()).strip('-')[:24] or 'lab'
                    unique_room = f'{base_room}-{plan.id[:8]}-{ss.id[:6]}-{cur:%Y%m%d}'
                    db.session.add(LabSession(
                        institution_id=plan.institution_id,
                        section_subject_id=ss.id,
                        title=f'{plan.name} — Session {session_num}',
                        scheduled_at=slot_time,
                        duration_minutes=plan.duration_minutes,
                        status='scheduled',
                        jitsi_room_name=unique_room,
                    ))
                    created_count += 1
            session_num += 1
        cur += timedelta(days=1)
    return created_count
