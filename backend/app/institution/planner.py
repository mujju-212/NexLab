import json
import uuid
from datetime import datetime, timedelta, date
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
    """Parses '09:00', '9:00 AM', '14:30', etc. into (hour, minute)"""
    if not t_str:
        return 9, 0
    t_clean = t_str.strip().upper()
    is_pm = 'PM' in t_clean
    is_am = 'AM' in t_clean
    t_clean = t_clean.replace('AM', '').replace('PM', '').strip()
    parts = t_clean.split(':')
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 else 0
    if is_pm and h < 12:
        h += 12
    elif is_am and h == 12:
        h = 0
    return h, m


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

    start_date_s = data.get('start_date') or '2026-09-01'
    end_date_s = data.get('end_date') or '2026-12-15'

    try:
        start_date = datetime.strptime(start_date_s[:10], '%Y-%m-%d').date()
        end_date = datetime.strptime(end_date_s[:10], '%Y-%m-%d').date()
    except Exception:
        start_date = date(2026, 9, 1)
        end_date = date(2026, 12, 15)

    sections = data.get('sections') or ['A', 'B']
    subjects = data.get('subjects') or []
    schedule_days = data.get('schedule_days') or ['Mon', 'Wed', 'Fri']
    start_time = data.get('start_time') or '09:00'
    duration = int(data.get('duration_minutes') or 60)
    status = data.get('status') or 'active'

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
        created_count = _generate_sessions_for_plan(plan)
        plan.sessions_generated_count = created_count

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
        plan.duration_minutes = int(data['duration_minutes'])
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
                created_count = _generate_sessions_for_plan(plan)
                plan.sessions_generated_count = created_count

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
    plan.sessions_generated_count = count
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
    """
    Resolves the plan's sections and subjects against the database, returning matching
    SectionSubject rows. If none exist but sections and subjects are matched, creates them.
    """
    raw_sections = plan.get_sections()
    raw_subjects = plan.get_subjects()

    sec_q = Section.query.filter_by(institution_id=plan.institution_id)
    if plan.batch_id:
        sec_q = sec_q.filter_by(batch_id=plan.batch_id)
    all_secs = sec_q.all()

    sec_tokens = {
        (s.get('id') or s.get('name') if isinstance(s, dict) else str(s)).strip()
        for s in raw_sections if s
    }
    matched_secs = [
        s for s in all_secs
        if not sec_tokens or s.id in sec_tokens or s.name in sec_tokens
    ] or all_secs

    all_subjs = Subject.query.filter_by(institution_id=plan.institution_id).all()
    subj_tokens = set()
    for sub in raw_subjects:
        if isinstance(sub, dict):
            for k in ('id', 'name', 'code'):
                if sub.get(k):
                    subj_tokens.add(str(sub[k]).strip())
        elif sub:
            subj_tokens.add(str(sub).strip())

    matched_subjs = [
        sub for sub in all_subjs
        if not subj_tokens or sub.id in subj_tokens or sub.name in subj_tokens or (sub.code and sub.code in subj_tokens)
    ] or all_subjs

    ss_rows = []
    if matched_secs and matched_subjs:
        sec_ids = [s.id for s in matched_secs]
        sub_ids = [s.id for s in matched_subjs]
        ss_rows = SectionSubject.query.filter(
            SectionSubject.institution_id == plan.institution_id,
            SectionSubject.section_id.in_(sec_ids),
            SectionSubject.subject_id.in_(sub_ids),
        ).all()

        if not ss_rows and plan.instructor_id:
            for sec in matched_secs:
                for sub in matched_subjs:
                    ss = SectionSubject(
                        institution_id=plan.institution_id,
                        section_id=sec.id,
                        subject_id=sub.id,
                        instructor_id=plan.instructor_id,
                    )
                    db.session.add(ss)
                    ss_rows.append(ss)
            db.session.flush()

    if not ss_rows:
        fallback_ss = SectionSubject.query.filter_by(institution_id=plan.institution_id).first()
        if fallback_ss:
            ss_rows = [fallback_ss]

    return ss_rows


def _generate_sessions_for_plan(plan):
    """
    Helper to create real LabSession records for a RecurringPlan.
    """
    hour, minute = _parse_time_str(plan.start_time)
    schedule_days = plan.get_schedule_days()
    target_weekdays = [DAY_MAP[d] for d in schedule_days if d in DAY_MAP]
    if not target_weekdays:
        target_weekdays = [0]  # Monday default

    ss_rows = _resolve_plan_section_subjects(plan)
    if not ss_rows:
        return 0

    cur = plan.start_date
    created_count = 0
    session_num = 1
    while cur <= plan.end_date:
        if cur.weekday() in target_weekdays:
            slot_time = datetime(cur.year, cur.month, cur.day, hour, minute)
            for ss in ss_rows:
                title = f"{plan.name} — Session {session_num}"
                existing = LabSession.query.filter_by(
                    institution_id=plan.institution_id,
                    section_subject_id=ss.id,
                    scheduled_at=slot_time,
                ).first()

                if not existing:
                    sess = LabSession(
                        institution_id=plan.institution_id,
                        section_subject_id=ss.id,
                        title=title,
                        scheduled_at=slot_time,
                        duration_minutes=plan.duration_minutes or 60,
                        status='scheduled',
                        jitsi_room_name=plan.room or 'Lab 1 (Main Block)',
                    )
                    db.session.add(sess)
                    created_count += 1
            session_num += 1
        cur += timedelta(days=1)

    return created_count
