"""
Institution Blueprint — Institution Admin routes
Manages: users, academic structure, sections, subjects, environment profiles,
         announcements, analytics, audit log, force logout
"""
from flask import Blueprint, request, jsonify, g, make_response
from app.auth.utils import require_role, require_institution
from app.extensions import db
from app.models.user import User
from app.models.academic import (
    AcademicYear, Batch, Department, Section, SectionStudent, SectionSubject,
)
from app.models.subject import Subject, EnvironmentProfile
from app.models.experiment import Experiment
from app.models.feedback import Notification
from app.models.session import LabSession
from app.institution.quota import student_quota, student_headroom
from datetime import datetime, timedelta
from sqlalchemy import func
import bcrypt, uuid, csv, io

institution_bp = Blueprint('institution', __name__)


# ── User Management ────────────────────────────────────────────────────────────

@institution_bp.route('/users', methods=['GET'])
@require_role('institution_admin')
def list_users():
    """
    List/search users within this institution.
    Params: ?role=student&department_id=...&q=jane (matches name or email)
            &page=1&per_page=50  — omit page to get every match (legacy shape)
    """
    role          = request.args.get('role')
    department_id = request.args.get('department_id')
    q             = (request.args.get('q', '') or '').strip()

    query = User.query.filter_by(institution_id=g.institution_id)
    if role:
        query = query.filter_by(role=role)
    if department_id:
        query = query.filter_by(department_id=department_id)
    if q:
        like = f'%{q}%'
        query = query.filter(db.or_(User.full_name.ilike(like), User.email.ilike(like),
                                     User.roll_number.ilike(like), User.staff_id.ilike(like)))

    query = query.order_by(User.full_name)
    total = query.count()

    if request.args.get('page'):
        page     = max(int(request.args.get('page', 1)), 1)
        per_page = min(int(request.args.get('per_page', 50)), 200)
        paged    = query.paginate(page=page, per_page=per_page, error_out=False)
        return jsonify({
            'users': [u.to_dict() for u in paged.items],
            'total': total, 'page': page, 'pages': paged.pages, 'per_page': per_page,
        }), 200

    return jsonify({'users': [u.to_dict() for u in query.all()], 'total': total}), 200


@institution_bp.route('/users/<user_id>', methods=['GET'])
@require_role('institution_admin')
def get_user(user_id):
    """
    One user's full record: profile, section enrolments, and — for instructors —
    the subjects they teach. Saves the client fetching the whole user list.
    """
    user = User.query.filter_by(
        id=user_id, institution_id=g.institution_id
    ).first_or_404()
    data = user.to_dict()

    dept = Department.query.get(user.department_id) if user.department_id else None
    data['department_name'] = dept.name if dept else None

    enrolments = []
    if user.role == 'student':
        rows = db.session.query(SectionStudent, Section, Batch).join(
            Section, Section.id == SectionStudent.section_id
        ).outerjoin(Batch, Batch.id == Section.batch_id).filter(
            SectionStudent.student_id == user_id,
            Section.institution_id == g.institution_id,
        ).all()
        enrolments = [{
            'section_id':   sec.id,
            'section_name': sec.name,
            'batch_id':     sec.batch_id,
            'batch_name':   batch.name if batch else None,
            'program':      batch.program if batch else None,
            'enrolled_at':  link.enrolled_at.isoformat() if link.enrolled_at else None,
        } for link, sec, batch in rows]

    teaching = []
    if user.role in ('instructor', 'institution_admin'):
        rows = SectionSubject.query.filter(
            SectionSubject.institution_id == g.institution_id,
            db.or_(SectionSubject.instructor_id == user_id,
                   SectionSubject.co_instructor_id == user_id),
        ).all()
        teaching = [_ss_dict(ss) for ss in rows]

    return jsonify({'user': data, 'enrolments': enrolments, 'teaching': teaching}), 200


@institution_bp.route('/users', methods=['POST'])
@require_role('institution_admin')
def create_user():
    """
    Direct user onboarding (student, instructor, or another institution_admin).
    Body: {
      full_name, email, role, password?,
      roll_number?, staff_id?, department_id?, year_of_study?, semester?, phone?
    }
    Never requires OTP — this is a trusted, admin-initiated creation.
    """
    data = request.get_json()
    if User.query.filter_by(email=data['email'].lower()).first():
        return jsonify({'error': 'Email already exists'}), 409

    if data.get('role') == 'student':
        blocked = student_headroom(g.institution_id, adding=1)
        if blocked:
            return jsonify(blocked), 409

    user = User(
        institution_id=g.institution_id,
        email=data['email'].lower().strip(),
        password_hash=bcrypt.hashpw(data.get('password', 'Welcome@123').encode(),
                                    bcrypt.gensalt()).decode(),
        full_name=data['full_name'],
        first_name=data.get('first_name'),
        last_name=data.get('last_name'),
        role=data['role'],
        roll_number=data.get('roll_number'),
        staff_id=data.get('staff_id'),
        department_id=data.get('department_id'),
        year_of_study=data.get('year_of_study'),
        semester=data.get('semester'),
        phone=data.get('phone'),
    )
    db.session.add(user)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'create_user', 'user', user.id,
                 f"Created {user.role} {user.full_name} ({user.email})")
    return jsonify({'user': user.to_dict()}), 201


@institution_bp.route('/users/<user_id>', methods=['PATCH'])
@require_role('institution_admin')
def update_user(user_id):
    """
    Edit an existing user's profile fields.
    Editable: full_name, first_name, last_name, phone, roll_number, staff_id,
              department_id, year_of_study, semester.
    Role and email are changed via their own dedicated endpoints (below) for auditability.
    """
    user = User.query.filter_by(id=user_id, institution_id=g.institution_id).first_or_404()
    data = request.get_json() or {}

    editable = ['full_name', 'first_name', 'last_name', 'phone', 'roll_number',
                'staff_id', 'department_id', 'year_of_study', 'semester']
    changed = []
    for field in editable:
        if field in data:
            setattr(user, field, data[field])
            changed.append(field)

    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'edit_user_profile', 'user', user_id,
                 detail=f"Updated fields: {', '.join(changed)}")
    return jsonify({'user': user.to_dict()}), 200


@institution_bp.route('/users/<user_id>/role', methods=['PATCH'])
@require_role('institution_admin')
def change_user_role(user_id):
    """
    Change a user's role. Body: {"role": "instructor"}
    Cannot be used to create/demote platform_admin accounts.
    """
    ALLOWED_ROLES = ('student', 'instructor', 'institution_admin')
    user = User.query.filter_by(id=user_id, institution_id=g.institution_id).first_or_404()
    new_role = (request.get_json() or {}).get('role')

    if new_role not in ALLOWED_ROLES:
        return jsonify({'error': f'role must be one of {ALLOWED_ROLES}'}), 400

    old_role = user.role
    user.role = new_role
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'change_user_role', 'user', user_id,
                 detail=f'{old_role} -> {new_role}')
    return jsonify({'user': user.to_dict()}), 200


@institution_bp.route('/users/<user_id>', methods=['DELETE'])
@require_role('institution_admin')
def delete_user(user_id):
    """
    Permanently remove a user from the institution.
    Prefer deactivation (toggle-active) for users with any activity history —
    this is only safe for users with no submissions/grades/sessions on record,
    to avoid orphaning foreign-key-referenced data.
    """
    user = User.query.filter_by(id=user_id, institution_id=g.institution_id).first_or_404()

    if user.id == g.user_id:
        return jsonify({'error': 'You cannot delete your own account'}), 400

    from app.models.submission import CodeAttempt, CodeVersion
    from app.models.grading import Grade
    has_activity = (
        CodeAttempt.query.filter_by(student_id=user_id).first() or
        CodeVersion.query.filter_by(student_id=user_id).first() or
        Grade.query.filter_by(student_id=user_id).first()
    )
    if has_activity:
        return jsonify({
            'error': 'This user has submission/grade history and cannot be deleted. '
                     'Deactivate the account instead to preserve records.'
        }), 409

    name, email = user.full_name, user.email
    db.session.delete(user)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'delete_user', 'user', user_id,
                 detail=f'Deleted {name} ({email})')
    return jsonify({'message': f'{name} has been removed'}), 200


@institution_bp.route('/users/bulk-upload', methods=['POST'])
@require_role('institution_admin')
def bulk_upload_users():
    """
    CSV bulk upload for students AND/OR faculty in one file.
    Columns: email, full_name, role, roll_number, staff_id, department_code,
             year_of_study, semester, phone

    - role: 'student' or 'instructor'. Defaults to 'student' if the column is
      missing/blank, so existing student-only CSVs keep working unchanged.
    - department_code: looked up against this institution's departments (by
      `code`); rows with an unrecognised code are still created, just without
      a department assigned.
    """
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'CSV file required'}), 400

    from app.models.academic import Department
    dept_by_code = {
        d.code: d.id for d in Department.query.filter_by(institution_id=g.institution_id).all() if d.code
    }

    content = file.read().decode('utf-8')
    reader = csv.DictReader(io.StringIO(content))
    created, skipped, rejected = [], [], []

    # Plan cap is checked per row so a 500-row CSV fills the remaining seats
    # instead of being rejected wholesale.
    quota     = student_quota(g.institution_id)
    seats     = quota['remaining']          # None => uncapped
    new_students = 0

    for row in reader:
        email = row.get('email', '').lower().strip()
        if not email:
            continue
        if User.query.filter_by(email=email).first():
            skipped.append(email)
            continue

        role = (row.get('role', '') or 'student').strip().lower()
        if role not in ('student', 'instructor'):
            role = 'student'

        if role == 'student' and seats is not None and new_students >= seats:
            rejected.append(email)
            continue

        dept_code = (row.get('department_code', '') or '').strip().upper()
        year_raw  = (row.get('year_of_study', '') or '').strip()
        sem_raw   = (row.get('semester', '') or '').strip()

        user = User(
            institution_id=g.institution_id,
            email=email,
            password_hash=bcrypt.hashpw('Welcome@123'.encode(), bcrypt.gensalt()).decode(),
            full_name=row.get('full_name', '').strip(),
            role=role,
            roll_number=row.get('roll_number', '').strip() or None,
            staff_id=row.get('staff_id', '').strip() or None,
            department_id=dept_by_code.get(dept_code),
            year_of_study=int(year_raw) if year_raw.isdigit() else None,
            semester=int(sem_raw) if sem_raw.isdigit() else None,
            phone=row.get('phone', '').strip(),
        )
        db.session.add(user)
        created.append(email)
        if role == 'student':
            new_students += 1

    db.session.commit()
    if created:
        _write_audit(g.user_id, g.institution_id, 'bulk_upload', 'user', None,
                     f"Bulk upload: {len(created)} created, {len(skipped)} duplicate(s), "
                     f"{len(rejected)} over plan limit")
    payload = {
        'created': len(created), 'skipped': len(skipped), 'skipped_emails': skipped,
    }
    if rejected:
        payload['rejected_over_limit'] = rejected
        payload['message'] = (f"{len(rejected)} student row(s) skipped — the "
                              f"{quota['plan']} plan allows {quota['limit']} students.")
    return jsonify(payload), 201


@institution_bp.route('/users/<user_id>/toggle-active', methods=['PATCH'])
@require_role('institution_admin')
def toggle_user_active(user_id):
    user = User.query.filter_by(id=user_id, institution_id=g.institution_id).first_or_404()

    # Re-activating a student consumes a seat, so it goes through the same cap.
    if not user.is_active and user.role == 'student':
        blocked = student_headroom(g.institution_id, adding=1)
        if blocked:
            return jsonify(blocked), 409

    user.is_active = not user.is_active
    db.session.commit()
    _write_audit(g.user_id, g.institution_id,
                 'activate_user' if user.is_active else 'deactivate_user',
                 'user', user_id,
                 f"{'Activated' if user.is_active else 'Deactivated'} "
                 f"{user.full_name} ({user.email})")
    return jsonify({'is_active': user.is_active}), 200


# ── Academic Structure ─────────────────────────────────────────────────────────

@institution_bp.route('/academic-years', methods=['GET', 'POST'])
@require_role('institution_admin')
def academic_years():
    if request.method == 'GET':
        years = AcademicYear.query.filter_by(institution_id=g.institution_id).all()
        return jsonify({'years': [y.to_dict() for y in years]}), 200

    data = request.get_json()
    year = AcademicYear(
        institution_id=g.institution_id,
        year_label=data['year_label'],
        is_active=data.get('is_active', True)
    )
    db.session.add(year)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'create_academic_year', 'academic_year',
                 year.id, f"Created academic year {year.year_label}")
    return jsonify({'year': year.to_dict()}), 201


@institution_bp.route('/academic-years/<year_id>', methods=['PATCH'])
@require_role('institution_admin')
def update_academic_year(year_id):
    year = AcademicYear.query.filter_by(id=year_id, institution_id=g.institution_id).first_or_404()
    data = request.get_json() or {}
    changed = []
    for field in ('year_label', 'is_active'):
        if field in data:
            setattr(year, field, data[field])
            changed.append(field)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'update_academic_year', 'academic_year',
                 year_id, f"Updated {year.year_label} ({', '.join(changed) or 'no change'})")
    return jsonify({'year': year.to_dict()}), 200


@institution_bp.route('/academic-years/<year_id>', methods=['DELETE'])
@require_role('institution_admin')
def delete_academic_year(year_id):
    year = AcademicYear.query.filter_by(id=year_id, institution_id=g.institution_id).first_or_404()

    in_use = Batch.query.filter_by(year_id=year_id).count()
    if in_use:
        return jsonify({
            'error': f'Cannot delete: {in_use} department(s)/batch(es) still belong to this year. '
                     f'Remove them first.'
        }), 409

    label = year.year_label
    db.session.delete(year)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'delete_academic_year', 'academic_year',
                 year_id, f"Deleted academic year {label}")
    return jsonify({'message': 'Academic year deleted'}), 200


@institution_bp.route('/batches', methods=['GET', 'POST'])
@require_role('institution_admin')
def batches():
    if request.method == 'GET':
        year_id = request.args.get('year_id')
        query = Batch.query.filter_by(institution_id=g.institution_id)
        if year_id:
            query = query.filter_by(year_id=year_id)
        return jsonify({'batches': [b.to_dict() for b in query.all()]}), 200

    data = request.get_json()
    batch = Batch(
        institution_id=g.institution_id,
        year_id=data['year_id'],
        name=data['name'],
        program=data.get('program'),
    )
    db.session.add(batch)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'create_batch', 'batch', batch.id,
                 f"Created department/batch {batch.name}")
    return jsonify({'batch': batch.to_dict()}), 201


@institution_bp.route('/batches/<batch_id>', methods=['PATCH'])
@require_role('institution_admin')
def update_batch(batch_id):
    batch = Batch.query.filter_by(id=batch_id, institution_id=g.institution_id).first_or_404()
    data = request.get_json() or {}
    changed = []
    for field in ('name', 'program', 'year_id'):
        if field in data:
            setattr(batch, field, data[field])
            changed.append(field)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'update_batch', 'batch', batch_id,
                 f"Updated {batch.name} ({', '.join(changed) or 'no change'})")
    return jsonify({'batch': batch.to_dict()}), 200


@institution_bp.route('/batches/<batch_id>', methods=['DELETE'])
@require_role('institution_admin')
def delete_batch(batch_id):
    batch = Batch.query.filter_by(id=batch_id, institution_id=g.institution_id).first_or_404()

    in_use = Section.query.filter_by(batch_id=batch_id).count()
    if in_use:
        return jsonify({
            'error': f'Cannot delete: {in_use} section(s) still belong to this department/batch. '
                     f'Remove them first.'
        }), 409

    name = batch.name
    db.session.delete(batch)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'delete_batch', 'batch', batch_id,
                 f"Deleted department/batch {name}")
    return jsonify({'message': 'Batch deleted'}), 200


def _own_section(section_id):
    """Fetch a section that belongs to the caller's institution, or 404."""
    return Section.query.filter_by(
        id=section_id, institution_id=g.institution_id
    ).first_or_404()


@institution_bp.route('/sections', methods=['GET', 'POST'])
@require_role('institution_admin')
def sections():
    if request.method == 'GET':
        batch_id = request.args.get('batch_id')
        query = Section.query.filter_by(institution_id=g.institution_id)
        if batch_id:
            query = query.filter_by(batch_id=batch_id)
        return jsonify({'sections': [s.to_dict() for s in query.all()]}), 200

    data = request.get_json()
    section = Section(
        institution_id=g.institution_id,
        batch_id=data['batch_id'],
        name=data['name'],
    )
    db.session.add(section)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'create_section', 'section', section.id,
                 f"Created section {section.name}")
    return jsonify({'section': section.to_dict()}), 201


@institution_bp.route('/sections/<section_id>/enroll', methods=['POST'])
@require_role('institution_admin')
def enroll_students(section_id):
    """Enroll students into a section"""
    section = _own_section(section_id)
    data = request.get_json() or {}
    student_ids = data.get('student_ids', [])

    # Only students of this institution may be enrolled.
    valid = {u.id for u in User.query.filter(
        User.institution_id == g.institution_id,
        User.role == 'student',
        User.id.in_(student_ids or ['-']),
    ).all()}
    rejected = [sid for sid in student_ids if sid not in valid]

    enrolled = 0
    for sid in student_ids:
        if sid in valid and not SectionStudent.query.filter_by(
            section_id=section_id, student_id=sid
        ).first():
            db.session.add(SectionStudent(section_id=section_id, student_id=sid))
            enrolled += 1
    db.session.commit()

    if enrolled:
        _write_audit(g.user_id, g.institution_id, 'enroll_students', 'section', section_id,
                     f"Enrolled {enrolled} student(s) into section {section.name}")
    return jsonify({'enrolled': enrolled, 'rejected': rejected}), 200


@institution_bp.route('/sections/<section_id>/students', methods=['GET'])
@require_role('institution_admin')
def section_students(section_id):
    """Students actually enrolled in one section, with their enrolment date."""
    _own_section(section_id)
    rows = db.session.query(SectionStudent, User).join(
        User, User.id == SectionStudent.student_id
    ).filter(SectionStudent.section_id == section_id).all()

    students = []
    for link, user in rows:
        d = user.to_dict()
        d['enrolled_at'] = link.enrolled_at.isoformat() if link.enrolled_at else None
        students.append(d)
    students.sort(key=lambda s: (s.get('roll_number') or '', s['full_name']))
    return jsonify({'students': students, 'count': len(students)}), 200


@institution_bp.route('/sections/<section_id>/students/<student_id>', methods=['DELETE'])
@require_role('institution_admin')
def unenroll_student(section_id, student_id):
    """Remove one student from a section. The user account is untouched."""
    section = _own_section(section_id)
    link = SectionStudent.query.filter_by(
        section_id=section_id, student_id=student_id
    ).first_or_404()
    student = User.query.filter_by(
        id=student_id, institution_id=g.institution_id
    ).first_or_404()

    db.session.delete(link)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'unenroll_student', 'section', section_id,
                 f"Removed {student.full_name} from section {section.name}")
    return jsonify({'message': f'{student.full_name} removed from {section.name}'}), 200


@institution_bp.route('/sections/<section_id>/transfer', methods=['POST'])
@require_role('institution_admin')
def transfer_students(section_id):
    """
    Move students from this section into another one.
    Body: {"student_ids": [...], "to_section_id": "..."}
    Skips students already in the destination instead of erroring.
    """
    src  = _own_section(section_id)
    data = request.get_json() or {}
    dest_id = data.get('to_section_id')
    student_ids = data.get('student_ids', [])

    if not dest_id:
        return jsonify({'error': 'to_section_id is required'}), 400
    if dest_id == section_id:
        return jsonify({'error': 'Source and destination sections are the same'}), 400
    dest = _own_section(dest_id)

    moved = 0
    for sid in student_ids:
        link = SectionStudent.query.filter_by(section_id=section_id, student_id=sid).first()
        if not link:
            continue
        db.session.delete(link)
        if not SectionStudent.query.filter_by(section_id=dest_id, student_id=sid).first():
            db.session.add(SectionStudent(section_id=dest_id, student_id=sid))
        moved += 1
    db.session.commit()

    _write_audit(g.user_id, g.institution_id, 'transfer_students', 'section', section_id,
                 f"Moved {moved} student(s) from {src.name} to {dest.name}")
    return jsonify({'moved': moved, 'to_section_id': dest_id}), 200


# ── Subject & Section-Subject Assignment ──────────────────────────────────────

@institution_bp.route('/subjects', methods=['GET', 'POST'])
@require_role('institution_admin')
def subjects():
    if request.method == 'GET':
        subs = Subject.query.filter_by(institution_id=g.institution_id).all()
        return jsonify({'subjects': [s.to_dict() for s in subs]}), 200

    data = request.get_json()
    subject = Subject(
        institution_id=g.institution_id,
        name=data['name'],
        code=data.get('code'),
        description=data.get('description'),
        env_profile_id=data.get('env_profile_id'),
        total_marks=data.get('total_marks', 100),
    )
    db.session.add(subject)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'create_subject', 'subject', subject.id,
                 f"Created subject {subject.name}"
                 + (f" ({subject.code})" if subject.code else ''))
    return jsonify({'subject': subject.to_dict()}), 201


@institution_bp.route('/subjects/<subject_id>', methods=['PATCH'])
@require_role('institution_admin')
def update_subject(subject_id):
    subject = Subject.query.filter_by(id=subject_id, institution_id=g.institution_id).first_or_404()
    data = request.get_json() or {}
    changed = []
    for field in ('name', 'code', 'description', 'env_profile_id', 'total_marks'):
        if field in data:
            setattr(subject, field, data[field])
            changed.append(field)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'update_subject', 'subject', subject_id,
                 f"Updated {subject.name} ({', '.join(changed) or 'no change'})")
    return jsonify({'subject': subject.to_dict()}), 200


@institution_bp.route('/subjects/<subject_id>', methods=['DELETE'])
@require_role('institution_admin')
def delete_subject(subject_id):
    subject = Subject.query.filter_by(id=subject_id, institution_id=g.institution_id).first_or_404()

    assigned    = SectionSubject.query.filter_by(subject_id=subject_id).count()
    experiments = Experiment.query.filter_by(subject_id=subject_id).count()
    if assigned or experiments:
        return jsonify({
            'error': f'Cannot delete: subject has {assigned} section assignment(s) and '
                     f'{experiments} experiment(s). Remove those first.'
        }), 409

    name = subject.name
    db.session.delete(subject)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'delete_subject', 'subject', subject_id,
                 f"Deleted subject {name}")
    return jsonify({'message': 'Subject deleted'}), 200


def _ss_dict(ss, section=None, subject=None):
    """Assignment enriched with the names an admin screen needs."""
    section  = section  or Section.query.get(ss.section_id)
    subject  = subject  or Subject.query.get(ss.subject_id)
    lead     = User.query.get(ss.instructor_id)    if ss.instructor_id    else None
    co       = User.query.get(ss.co_instructor_id) if ss.co_instructor_id else None
    return {
        'id':                  ss.id,
        'section_id':          ss.section_id,
        'section_name':        section.name if section else None,
        'batch_id':            section.batch_id if section else None,
        'subject_id':          ss.subject_id,
        'subject_name':        subject.name if subject else None,
        'subject_code':        subject.code if subject else None,
        'instructor_id':       ss.instructor_id,
        'instructor_name':     lead.full_name if lead else None,
        'co_instructor_id':    ss.co_instructor_id,
        'co_instructor_name':  co.full_name if co else None,
        'created_at':          ss.created_at.isoformat() if ss.created_at else None,
    }


def _own_instructor(user_id, field):
    """Validate that `user_id` is an active instructor in this institution."""
    if not user_id:
        return None
    user = User.query.filter_by(id=user_id, institution_id=g.institution_id).first()
    if not user or user.role not in ('instructor', 'institution_admin'):
        raise ValueError(f'{field} must be an instructor of this institution')
    return user


@institution_bp.route('/section-subjects', methods=['POST'])
@require_role('institution_admin')
def assign_subject():
    """Assign a subject + instructor to a section."""
    data = request.get_json() or {}
    for field in ('section_id', 'subject_id', 'instructor_id'):
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400

    section = _own_section(data['section_id'])
    subject = Subject.query.filter_by(
        id=data['subject_id'], institution_id=g.institution_id
    ).first_or_404()
    try:
        lead = _own_instructor(data['instructor_id'], 'instructor_id')
        _own_instructor(data.get('co_instructor_id'), 'co_instructor_id')
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    existing = SectionSubject.query.filter_by(
        section_id=data['section_id'], subject_id=data['subject_id']
    ).first()
    if existing:
        return jsonify({
            'error': f'{subject.name} is already assigned to section {section.name}.',
            'section_subject_id': existing.id,
        }), 409

    ss = SectionSubject(
        institution_id=g.institution_id,
        section_id=data['section_id'],
        subject_id=data['subject_id'],
        instructor_id=data['instructor_id'],
        co_instructor_id=data.get('co_instructor_id'),
    )
    db.session.add(ss)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'assign_instructor', 'section', section.id,
                 f"Assigned {subject.name} to section {section.name} "
                 f"under {lead.full_name if lead else 'unknown'}")
    return jsonify({'section_subject': _ss_dict(ss, section, subject)}), 201


@institution_bp.route('/section-subjects', methods=['GET'])
@require_role('institution_admin')
def list_section_subjects():
    """
    All subject+instructor assignments for this institution.
    Filters: ?section_id=...&subject_id=...&instructor_id=...
    """
    q = SectionSubject.query.filter_by(institution_id=g.institution_id)
    for param, column in (('section_id',    SectionSubject.section_id),
                          ('subject_id',    SectionSubject.subject_id),
                          ('instructor_id', SectionSubject.instructor_id)):
        value = request.args.get(param)
        if value:
            q = q.filter(column == value)
    rows = q.order_by(SectionSubject.created_at.desc()).all()
    return jsonify({'section_subjects': [_ss_dict(ss) for ss in rows]}), 200


@institution_bp.route('/sections/<section_id>/subjects', methods=['GET'])
@require_role('institution_admin')
def section_subjects(section_id):
    """Subjects taught in one section, with the assigned instructors."""
    section = _own_section(section_id)
    rows = SectionSubject.query.filter_by(
        institution_id=g.institution_id, section_id=section_id
    ).all()
    return jsonify({
        'section_subjects': [_ss_dict(ss, section) for ss in rows],
        'count': len(rows),
    }), 200


@institution_bp.route('/section-subjects/<ss_id>', methods=['PATCH'])
@require_role('institution_admin')
def update_section_subject(ss_id):
    """
    Reassign an existing subject slot — typically swapping the instructor when
    someone leaves mid-semester. Pass co_instructor_id: null to clear it.
    """
    ss = SectionSubject.query.filter_by(
        id=ss_id, institution_id=g.institution_id
    ).first_or_404()
    data = request.get_json() or {}

    try:
        if 'instructor_id' in data:
            if not data['instructor_id']:
                return jsonify({'error': 'instructor_id cannot be empty'}), 400
            _own_instructor(data['instructor_id'], 'instructor_id')
        if 'co_instructor_id' in data and data['co_instructor_id']:
            _own_instructor(data['co_instructor_id'], 'co_instructor_id')
    except ValueError as exc:
        return jsonify({'error': str(exc)}), 400

    before = _ss_dict(ss)
    for field in ('instructor_id', 'co_instructor_id'):
        if field in data:
            setattr(ss, field, data[field] or None)
    db.session.commit()

    after = _ss_dict(ss)
    if before['instructor_id'] != after['instructor_id']:
        _write_audit(g.user_id, g.institution_id, 'reassign_instructor', 'section',
                     ss.section_id,
                     f"{after['subject_name']} / section {after['section_name']}: "
                     f"{before['instructor_name']} → {after['instructor_name']}")
    return jsonify({'section_subject': after}), 200


@institution_bp.route('/section-subjects/<ss_id>', methods=['DELETE'])
@require_role('institution_admin')
def delete_section_subject(ss_id):
    """
    Remove a subject from a section. Refused while lab sessions reference it,
    so history is never orphaned — cancel or delete those first.
    """
    ss = SectionSubject.query.filter_by(
        id=ss_id, institution_id=g.institution_id
    ).first_or_404()
    info = _ss_dict(ss)

    sessions = LabSession.query.filter_by(section_subject_id=ss_id).count()
    if sessions:
        return jsonify({
            'error': f'Cannot remove: {sessions} lab session(s) are attached to this '
                     f'assignment. Cancel or delete them first.'
        }), 409

    db.session.delete(ss)
    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'unassign_instructor', 'section',
                 info['section_id'],
                 f"Removed {info['subject_name']} from section {info['section_name']}")
    return jsonify({'message': 'Assignment removed'}), 200


# ── Environment Profiles ───────────────────────────────────────────────────────

@institution_bp.route('/environments', methods=['GET'])
@require_institution
def list_environments():
    """Get all available environment profiles (platform defaults + institution custom)"""
    defaults = EnvironmentProfile.query.filter_by(is_platform_default=True).all()
    custom   = EnvironmentProfile.query.filter_by(institution_id=g.institution_id).all()
    return jsonify({
        'platform_defaults': [e.to_dict() for e in defaults],
        'custom': [e.to_dict() for e in custom]
    }), 200


@institution_bp.route('/environments/request', methods=['POST'])
@require_role('instructor', 'institution_admin')
def request_custom_environment():
    """Instructor requests a custom Docker environment"""
    data = request.get_json()
    profile = EnvironmentProfile(
        institution_id=g.institution_id,
        name=data['name'].lower().replace(' ', '-'),
        display_name=data['display_name'],
        docker_image=f"virtuallab/{data['name'].lower().replace(' ', '-')}:latest",
        is_platform_default=False,
        pip_packages=data.get('pip_packages', []),
        apt_packages=data.get('apt_packages', []),
        build_status='pending',
        created_by=g.user_id,
    )
    db.session.add(profile)
    db.session.commit()

    # Notify platform admins
    # (Platform admin gets notified to review and build)
    return jsonify({
        'profile': profile.to_dict(),
        'message': 'Environment request submitted. Admin will review and build.'
    }), 201


# ── Institution Dashboard ──────────────────────────────────────────────────────

@institution_bp.route('/dashboard', methods=['GET'])
@require_role('institution_admin')
def institution_dashboard():
    from app.models.session import LabSession
    iid = g.institution_id

    instructors = User.query.filter_by(institution_id=iid, role='instructor').count()
    students    = User.query.filter_by(institution_id=iid, role='student').count()
    subjects_count = Subject.query.filter_by(institution_id=iid).count()
    live_sessions  = LabSession.query.filter_by(institution_id=iid, status='active').count()

    upcoming = LabSession.query.filter_by(
        institution_id=iid, status='scheduled'
    ).order_by(LabSession.scheduled_at).limit(5).all()

    return jsonify({
        'stats': {
            'instructors': instructors,
            'students': students,
            'subjects': subjects_count,
            'live_sessions': live_sessions,
        },
        'upcoming_sessions': [s.to_dict() for s in upcoming],
    }), 200


# ── Announcements ──────────────────────────────────────────────────────────────

@institution_bp.route('/announcements', methods=['POST'])
@require_role('institution_admin')
def send_announcement():
    """
    Broadcast announcement to all users or a specific role/section.
    Creates one Notification row per target user.

    Body: {
        title, message,
        target: 'all' | 'students' | 'instructors',
        section_id: (optional — scope to one section only)
    }
    """
    data       = request.get_json()
    title      = data.get('title', '')
    message    = data.get('message', '')
    target     = data.get('target', 'all')        # all | students | instructors
    section_id = data.get('section_id')           # optional scope

    if not title or not message:
        return jsonify({'error': 'title and message required'}), 400

    # Build target user list
    query = User.query.filter_by(institution_id=g.institution_id, is_active=True)

    if target == 'students':
        query = query.filter_by(role='student')
    elif target == 'instructors':
        query = query.filter_by(role='instructor')
    # 'all' → no extra filter

    if section_id:
        # Scope to students in a specific section (404s if it is not ours, so an
        # announcement can never leak into another institution's section).
        _own_section(section_id)
        enrolled_ids = [
            e.student_id
            for e in SectionStudent.query.filter_by(section_id=section_id).all()
        ]
        query = query.filter(User.id.in_(enrolled_ids))

    users = query.all()
    created = 0
    for user in users:
        notif = Notification(
            user_id=user.id,
            type='announcement',
            title=title,
            message=message,
        )
        db.session.add(notif)
        created += 1

    # Push via SocketIO to online users
    from app.extensions import socketio
    socketio.emit('new_announcement', {
        'title': title,
        'message': message,
        'from': 'Institution Admin',
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"institution_{g.institution_id}")

    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'send_announcement', 'announcement', None,
                 f"\"{title}\" sent to {created} {target}"
                 + (f" in one section" if section_id else ""))
    return jsonify({'sent_to': created, 'target': target}), 201


@institution_bp.route('/announcements/recent', methods=['GET'])
@require_role('institution_admin')
def recent_announcements():
    """
    Last 20 announcements sent by this institution, deduplicated.
    Returns one row per unique (title, message, created_at) broadcast,
    not one row per recipient.
    """
    from sqlalchemy import text as sa_text
    iid = g.institution_id

    # Fetch deduplicated announcements using GROUP BY on the logical broadcast key.
    # We pick the minimum Notification.id per group so the result is deterministic.
    dedup_rows = db.session.execute(sa_text("""
        SELECT
            MIN(n.id)         AS id,
            n.title,
            n.message,
            n.type,
            MIN(n.created_at) AS created_at,
            COUNT(n.id)       AS recipient_count
        FROM notifications n
        JOIN users u ON n.user_id = u.id
        WHERE u.institution_id = :iid
          AND n.type = 'announcement'
        GROUP BY n.title, n.message, n.type, DATE_TRUNC('minute', n.created_at)
        ORDER BY created_at DESC
        LIMIT 20
    """), {'iid': iid}).fetchall()

    result = [{
        'id':              r.id,
        'title':           r.title,
        'message':         r.message,
        'type':            r.type,
        'created_at':      r.created_at.isoformat() if r.created_at else None,
        'recipient_count': r.recipient_count,
    } for r in dedup_rows]

    return jsonify({'announcements': result}), 200


# ── Force Logout ───────────────────────────────────────────────────────────────

@institution_bp.route('/users/<user_id>/force-logout', methods=['POST'])
@require_role('institution_admin')
def force_logout_user(user_id):
    """
    Force-logout a user by setting force_logout_at to the current timestamp.
    The JWT middleware rejects any token whose iat is before force_logout_at,
    so all existing sessions are instantly invalidated.
    Also emits a SocketIO kick event to disconnect them from live sessions.
    """
    user = User.query.filter_by(
        id=user_id, institution_id=g.institution_id
    ).first_or_404()

    _apply_force_logout(user)
    db.session.commit()

    # Kick from any active SocketIO rooms
    from app.extensions import socketio
    socketio.emit('force_logout', {
        'reason': 'Logged out by administrator',
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"user_{user_id}")

    # Write audit log
    _write_audit(
        actor_id=g.user_id,
        institution_id=g.institution_id,
        action='force_logout',
        target_type='user',
        target_id=user_id,
        detail=f"Force-logged out {user.full_name} ({user.email})"
    )

    return jsonify({'message': f'{user.full_name} has been logged out'}), 200


# ── Audit Log ──────────────────────────────────────────────────────────────────

@institution_bp.route('/audit-log', methods=['GET'])
@require_role('institution_admin')
def get_audit_log():
    """
    View admin action history for this institution.

    Query params: ?limit=50&offset=0&action=force_logout&days=30&q=<text>
    Also accepts explicit date bounds: ?from=YYYY-MM-DD&to=YYYY-MM-DD (when given,
    they override `days`).
    Rows carry `actor_name`/`actor_email` resolved in one extra query — the raw
    actor_id is useless to a human reading the table.
    Also returns `actions`: every distinct action present in the window, so the
    UI can build its filter dropdown without a second round trip.
    """
    from app.models.academic import AuditLog
    limit  = min(max(int(request.args.get('limit', 50) or 50), 1), 500)
    offset = max(int(request.args.get('offset', 0) or 0), 0)
    action = request.args.get('action')
    days   = int(request.args.get('days', 30) or 30)
    search = (request.args.get('q') or '').strip()

    query = AuditLog.query.filter_by(institution_id=g.institution_id)

    # Explicit date range overrides the rolling `days` window.
    date_from = request.args.get('from')
    date_to   = request.args.get('to')
    if date_from or date_to:
        if date_from:
            try:
                start = datetime.strptime(date_from, '%Y-%m-%d')
                query = query.filter(AuditLog.created_at >= start)
            except ValueError:
                pass
        if date_to:
            try:
                end = datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)
                query = query.filter(AuditLog.created_at < end)
            except ValueError:
                pass
        since = None
    else:
        since = datetime.utcnow() - timedelta(days=days)
        query = query.filter(AuditLog.created_at >= since)

    if action:
        query = query.filter_by(action=action)
    if search:
        query = query.filter(AuditLog.detail.ilike(f'%{search}%'))

    total = query.count()
    logs = (query.order_by(AuditLog.created_at.desc())
                 .offset(offset).limit(limit).all())

    # Resolve actor names in one pass instead of N queries.
    actor_ids = {l.actor_id for l in logs if l.actor_id}
    actors = {}
    if actor_ids:
        actors = {
            u.id: u for u in User.query.filter(User.id.in_(actor_ids)).all()
        }

    rows = []
    for l in logs:
        row = l.to_dict()
        actor = actors.get(l.actor_id)
        row['actor_name']  = actor.full_name if actor else 'Deleted user'
        row['actor_email'] = actor.email if actor else None
        row['actor_role']  = actor.role if actor else None
        rows.append(row)

    distinct_actions = []
    if since:
        distinct_actions = [
            a[0] for a in db.session.query(AuditLog.action)
            .filter(AuditLog.institution_id == g.institution_id,
                    AuditLog.created_at >= since)
            .distinct().order_by(AuditLog.action).all()
        ]

    return jsonify({
        'logs':    rows,
        'total':   total,
        'limit':   limit,
        'offset':  offset,
        'days':    days,
        'actions': distinct_actions,
    }), 200


@institution_bp.route('/audit-log/export', methods=['GET'])
@require_role('institution_admin')
def export_audit_log():
    """
    CSV export of the audit log.
    Query params: ?days=30&action=<filter>&q=<search>
    Also accepts explicit date bounds: ?from=YYYY-MM-DD&to=YYYY-MM-DD (when given,
    they override `days`).
    Same filters as GET /audit-log but returns all rows (no pagination limit).
    """
    from app.models.academic import AuditLog
    action  = request.args.get('action')
    days    = int(request.args.get('days', 90) or 90)
    search  = (request.args.get('q') or '').strip()

    since = datetime.utcnow() - timedelta(days=days)
    query = AuditLog.query.filter_by(
        institution_id=g.institution_id
    )

    date_from = request.args.get('from')
    date_to   = request.args.get('to')
    if date_from or date_to:
        if date_from:
            try:
                start = datetime.strptime(date_from, '%Y-%m-%d')
                query = query.filter(AuditLog.created_at >= start)
            except ValueError:
                pass
        if date_to:
            try:
                end = datetime.strptime(date_to, '%Y-%m-%d') + timedelta(days=1)
                query = query.filter(AuditLog.created_at < end)
            except ValueError:
                pass
    else:
        query = query.filter(AuditLog.created_at >= since)

    if action:
        query = query.filter_by(action=action)
    if search:
        query = query.filter(AuditLog.detail.ilike(f'%{search}%'))

    logs = query.order_by(AuditLog.created_at.desc()).all()

    # Resolve actor names
    actor_ids = {l.actor_id for l in logs if l.actor_id}
    actors = {u.id: u for u in User.query.filter(User.id.in_(actor_ids)).all()} if actor_ids else {}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Timestamp (UTC)', 'Actor Name', 'Actor Email', 'Actor Role',
                     'Action', 'Target Type', 'Target ID', 'Detail'])

    for l in logs:
        actor = actors.get(l.actor_id)
        writer.writerow([
            l.created_at.strftime('%Y-%m-%d %H:%M:%S') if l.created_at else '',
            actor.full_name if actor else 'Deleted user',
            actor.email if actor else '',
            actor.role if actor else '',
            l.action,
            l.target_type or '',
            l.target_id or '',
            l.detail or '',
        ])

    iid = g.institution_id
    response = make_response(output.getvalue())
    response.headers['Content-Type'] = 'text/csv'
    response.headers['Content-Disposition'] = (
        f'attachment; filename="audit_log_{iid[:8]}_{days}d.csv"'
    )
    return response


def _apply_force_logout(user):
    """Set force_logout_at on a user, invalidating all tokens issued before now.
    Call db.session.commit() after — this helper does NOT commit so it can be
    batched with other mutations (e.g. bulk operations)."""
    user.force_logout_at = datetime.utcnow()


def _write_audit(actor_id, institution_id, action, target_type, target_id, detail=''):
    """Helper — write one audit log row. Delegates to the shared writer so all
    three institution blueprints share one implementation."""
    from app.institution.audit import write_audit
    write_audit(actor_id, institution_id, action, target_type, target_id, detail)


# ── Per-Institution Analytics ──────────────────────────────────────────────────

@institution_bp.route('/analytics/overview', methods=['GET'])
@require_role('institution_admin')
def analytics_overview():
    """
    High-level institution analytics with flexible date range.

    Query params:
      ?days=30          — convenience: last N days from now (default 30)
      ?from=YYYY-MM-DD  — explicit start date (overrides days)
      ?to=YYYY-MM-DD    — explicit end date (defaults to now)
    """
    from app.models.submission import CodeAttempt
    from app.models.knowledge import ConceptMastery
    from app.models.academic import SectionSubject

    iid = g.institution_id

    # ── Date range resolution ────────────────────────────────────────────────
    date_to   = datetime.utcnow()
    date_from = date_to - timedelta(days=30)
    days      = 30

    from_str = request.args.get('from')
    to_str   = request.args.get('to')
    if from_str:
        try:
            date_from = datetime.strptime(from_str, '%Y-%m-%d')
        except ValueError:
            return jsonify({'error': 'Invalid `from` date; use YYYY-MM-DD'}), 400
    elif request.args.get('days'):
        days      = int(request.args.get('days', 30))
        date_from = date_to - timedelta(days=days)
    if to_str:
        try:
            date_to = datetime.strptime(to_str, '%Y-%m-%d')
        except ValueError:
            return jsonify({'error': 'Invalid `to` date; use YYYY-MM-DD'}), 400

    days = max(1, (date_to - date_from).days)

    # Sessions in window
    total_sessions = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.scheduled_at >= date_from,
        LabSession.scheduled_at <= date_to,
    ).count()

    completed_sessions = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.status == 'ended',
        LabSession.scheduled_at >= date_from,
        LabSession.scheduled_at <= date_to,
    ).count()

    # Total students
    total_students = User.query.filter_by(
        institution_id=iid, role='student', is_active=True
    ).count()

    # Students at risk — avg mastery < 40%
    at_risk_subq = db.session.query(
        ConceptMastery.student_id,
        func.avg(ConceptMastery.mastery_score).label('avg_mastery')
    ).filter_by(institution_id=iid).group_by(
        ConceptMastery.student_id
    ).subquery()

    at_risk_count = db.session.query(at_risk_subq).filter(
        at_risk_subq.c.avg_mastery < 40
    ).count()

    # Active instructors in window — via SectionSubject join
    active_session_ssids = db.session.query(
        func.distinct(LabSession.section_subject_id)
    ).filter(
        LabSession.institution_id == iid,
        LabSession.scheduled_at >= date_from,
        LabSession.scheduled_at <= date_to,
    ).all()

    active_ssids = [r[0] for r in active_session_ssids if r[0]]
    active_instructors = db.session.query(
        func.count(func.distinct(SectionSubject.instructor_id))
    ).filter(
        SectionSubject.id.in_(active_ssids)
    ).scalar() or 0

    # Peak usage: count sessions per hour-of-day
    all_sessions = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.started_at.isnot(None),
        LabSession.started_at >= date_from,
        LabSession.started_at <= date_to,
    ).all()

    hour_counts = {}
    for s in all_sessions:
        if s.started_at:
            h = s.started_at.hour
            hour_counts[h] = hour_counts.get(h, 0) + 1

    peak_hours = sorted(hour_counts.items(), key=lambda x: x[1], reverse=True)[:3]

    return jsonify({
        'period_days': days,
        'date_from': date_from.strftime('%Y-%m-%d'),
        'date_to':   date_to.strftime('%Y-%m-%d'),
        'sessions': {
            'total': total_sessions,
            'completed': completed_sessions,
            'completion_rate_pct': round(
                (completed_sessions / total_sessions * 100) if total_sessions else 0, 1
            ),
        },
        'students': {
            'total': total_students,
            'at_risk': at_risk_count,
            'at_risk_pct': round(
                (at_risk_count / total_students * 100) if total_students else 0, 1
            ),
        },
        'instructors': {'active_this_period': active_instructors},
        'peak_hours': [{'hour': h, 'session_count': c} for h, c in peak_hours],
    }), 200


@institution_bp.route('/analytics/students-at-risk', methods=['GET'])
@require_role('institution_admin')
def students_at_risk():
    """List of students with avg concept mastery below threshold (default 40%)"""
    from app.models.knowledge import ConceptMastery
    from sqlalchemy import func

    threshold = float(request.args.get('threshold', 40.0))

    at_risk = db.session.query(
        ConceptMastery.student_id,
        func.avg(ConceptMastery.mastery_score).label('avg_mastery'),
        func.count(ConceptMastery.concept).label('concepts_tracked')
    ).filter_by(
        institution_id=g.institution_id
    ).group_by(
        ConceptMastery.student_id
    ).having(
        func.avg(ConceptMastery.mastery_score) < threshold
    ).all()

    result = []
    for row in at_risk:
        user = User.query.get(row.student_id)
        if user:
            result.append({
                'student_id':       row.student_id,
                'full_name':        user.full_name,
                'email':            user.email,
                'roll_number':      user.roll_number,
                'avg_mastery':      round(float(row.avg_mastery), 1),
                'concepts_tracked': row.concepts_tracked,
            })

    result.sort(key=lambda x: x['avg_mastery'])
    return jsonify({'at_risk_students': result, 'threshold': threshold}), 200


@institution_bp.route('/analytics/section-comparison', methods=['GET'])
@require_role('institution_admin')
def section_comparison():
    """
    Compare grade-based performance across all sections.
    Uses Grade.final_grade (actual graded scores) averaged per section
    — not the holistic rank_score engagement metric.
    """
    from app.models.grading import Grade
    from app.models.academic import SectionSubject
    from app.models.session import LabSession

    sections = Section.query.filter_by(institution_id=g.institution_id).all()
    result = []

    for sec in sections:
        ss_ids = [ss.id for ss in SectionSubject.query.filter_by(section_id=sec.id).all()]

        # Resolve session→experiment→grade via LabSession link
        avg_grade = None
        grade_count = 0
        if ss_ids:
            session_ids = [
                r[0] for r in db.session.query(LabSession.id)
                .filter(LabSession.section_subject_id.in_(ss_ids)).all()
            ]
            if session_ids:
                row = db.session.query(
                    func.avg(Grade.final_grade).label('avg_grade'),
                    func.count(Grade.id).label('grade_count'),
                ).filter(
                    Grade.session_id.in_(session_ids),
                    Grade.final_grade.isnot(None),
                ).first()
                if row and row.avg_grade is not None:
                    avg_grade = round(float(row.avg_grade), 1)
                    grade_count = row.grade_count

        enrolled = SectionStudent.query.filter_by(section_id=sec.id).count()
        result.append({
            'section_id':    sec.id,
            'section_name':  sec.name,
            'enrolled':      enrolled,
            'avg_grade':     avg_grade,   # None = no grades yet
            'graded_count':  grade_count,
        })

    result.sort(key=lambda x: (x['avg_grade'] or 0), reverse=True)
    return jsonify({'sections': result}), 200


# ── Single-record GETs (subject + section-subject) ────────────────────────────

@institution_bp.route('/subjects/<subject_id>', methods=['GET'])
@require_role('institution_admin')
def get_subject(subject_id):
    """Return full detail for one subject belonging to this institution."""
    subject = Subject.query.filter_by(
        id=subject_id, institution_id=g.institution_id
    ).first_or_404()
    return jsonify({'subject': subject.to_dict()}), 200


@institution_bp.route('/section-subjects/<ss_id>', methods=['GET'])
@require_role('institution_admin')
def get_section_subject(ss_id):
    """Return enriched detail for one SectionSubject assignment."""
    ss = SectionSubject.query.filter_by(
        id=ss_id, institution_id=g.institution_id
    ).first_or_404()
    return jsonify({'section_subject': _ss_dict(ss)}), 200


# ── Announcement management (edit / delete / resend + rich targeting) ─────────

@institution_bp.route('/announcements/<notification_id>', methods=['PATCH'])
@require_role('institution_admin')
def edit_announcement(notification_id):
    """
    Edit the title/message of one announcement broadcast.
    Updates ALL Notification rows that share the same (title, message, minute-bucket)
    so all recipients see the corrected text.

    Body: {title?, message?}
    """
    from sqlalchemy import text as sa_text
    data = request.get_json() or {}
    new_title   = data.get('title')
    new_message = data.get('message')

    if not new_title and not new_message:
        return jsonify({'error': 'Provide at least one of title or message'}), 400

    # Find the anchor row — must belong to a user in this institution
    anchor = db.session.execute(sa_text("""
        SELECT n.id, n.title, n.message, n.created_at
        FROM notifications n
        JOIN users u ON n.user_id = u.id
        WHERE n.id = :nid
          AND u.institution_id = :iid
          AND n.type = 'announcement'
        LIMIT 1
    """), {'nid': notification_id, 'iid': g.institution_id}).fetchone()

    if not anchor:
        return jsonify({'error': 'Announcement not found'}), 404

    # Propagate the edit to all rows that are part of the same broadcast
    db.session.execute(sa_text("""
        UPDATE notifications n
        SET title   = COALESCE(:new_title, n.title),
            message = COALESCE(:new_message, n.message)
        FROM users u
        WHERE n.user_id = u.id
          AND u.institution_id = :iid
          AND n.type = 'announcement'
          AND n.title = :old_title
          AND n.message = :old_message
          AND DATE_TRUNC('minute', n.created_at) = DATE_TRUNC('minute', :created_at)
    """), {
        'new_title':   new_title,
        'new_message': new_message,
        'iid':         g.institution_id,
        'old_title':   anchor.title,
        'old_message': anchor.message,
        'created_at':  anchor.created_at,
    })
    db.session.commit()

    _write_audit(g.user_id, g.institution_id, 'edit_announcement', 'announcement',
                 notification_id, f'Edited announcement "{anchor.title}"')
    return jsonify({'message': 'Announcement updated'}), 200


@institution_bp.route('/announcements/<notification_id>', methods=['DELETE'])
@require_role('institution_admin')
def delete_announcement(notification_id):
    """
    Delete all Notification rows belonging to one announcement broadcast.
    Identified by the same (title, message, minute-bucket) group as the given row.
    """
    from sqlalchemy import text as sa_text

    anchor = db.session.execute(sa_text("""
        SELECT n.id, n.title, n.message, n.created_at
        FROM notifications n
        JOIN users u ON n.user_id = u.id
        WHERE n.id = :nid
          AND u.institution_id = :iid
          AND n.type = 'announcement'
        LIMIT 1
    """), {'nid': notification_id, 'iid': g.institution_id}).fetchone()

    if not anchor:
        return jsonify({'error': 'Announcement not found'}), 404

    result = db.session.execute(sa_text("""
        DELETE FROM notifications
        WHERE id IN (
            SELECT n.id
            FROM notifications n
            JOIN users u ON n.user_id = u.id
            WHERE u.institution_id = :iid
              AND n.type = 'announcement'
              AND n.title = :title
              AND n.message = :message
              AND DATE_TRUNC('minute', n.created_at) = DATE_TRUNC('minute', :created_at)
        )
    """), {
        'iid':        g.institution_id,
        'title':      anchor.title,
        'message':    anchor.message,
        'created_at': anchor.created_at,
    })
    db.session.commit()

    _write_audit(g.user_id, g.institution_id, 'delete_announcement', 'announcement',
                 notification_id, f'Deleted announcement "{anchor.title}" ({result.rowcount} rows removed)')
    return jsonify({'message': 'Announcement deleted', 'rows_removed': result.rowcount}), 200


@institution_bp.route('/announcements/<notification_id>/resend', methods=['POST'])
@require_role('institution_admin')
def resend_announcement(notification_id):
    """
    Resend an existing announcement to users who currently lack a copy.
    Useful when new students join after the original broadcast.

    Body: {target: 'all'|'students'|'instructors', section_id?: '...'}
    """
    from sqlalchemy import text as sa_text

    # Fetch the original broadcast text
    anchor = db.session.execute(sa_text("""
        SELECT n.id, n.title, n.message
        FROM notifications n
        JOIN users u ON n.user_id = u.id
        WHERE n.id = :nid
          AND u.institution_id = :iid
          AND n.type = 'announcement'
        LIMIT 1
    """), {'nid': notification_id, 'iid': g.institution_id}).fetchone()

    if not anchor:
        return jsonify({'error': 'Announcement not found'}), 404

    data       = request.get_json() or {}
    target     = data.get('target', 'all')
    section_id = data.get('section_id')

    # Determine target users — same logic as send_announcement
    query = User.query.filter_by(institution_id=g.institution_id, is_active=True)
    if target == 'students':
        query = query.filter_by(role='student')
    elif target == 'instructors':
        query = query.filter_by(role='instructor')
    if section_id:
        _own_section(section_id)
        enrolled_ids = [e.student_id for e in SectionStudent.query.filter_by(section_id=section_id).all()]
        query = query.filter(User.id.in_(enrolled_ids))

    # Only send to users who don't already have this notification
    target_users = query.all()
    if target_users:
        target_uid_list = [u.id for u in target_users]
        existing_ids = {
            r[0] for r in db.session.execute(sa_text("""
                SELECT user_id FROM notifications
                WHERE title = :title AND message = :message AND type = 'announcement'
                  AND user_id IN :uids
            """), {
                'title':   anchor.title,
                'message': anchor.message,
                'uids':    tuple(target_uid_list),
            }).fetchall()
        }
    else:
        existing_ids = set()

    created = 0
    for user in target_users:
        if user.id not in existing_ids:
            db.session.add(Notification(
                user_id=user.id,
                type='announcement',
                title=anchor.title,
                message=anchor.message,
            ))
            created += 1

    db.session.commit()
    _write_audit(g.user_id, g.institution_id, 'resend_announcement', 'announcement',
                 notification_id, f'Resent "{anchor.title}" to {created} new recipients')
    return jsonify({'resent_to': created, 'target': target}), 200


@institution_bp.route('/announcements/targeted', methods=['POST'])
@require_role('institution_admin')
def send_targeted_announcement():
    """
    Send an announcement with rich targeting: department, batch, year, or a
    combination of those — in addition to the existing all/students/section targets.

    Body: {
        title, message,
        target: 'all' | 'students' | 'instructors',   # base filter
        department_id?: '...',  # further narrow by department
        batch_id?:      '...',  # further narrow to one batch
        academic_year?: 2024,   # further narrow to one year (Batch.year)
        section_id?:    '...',  # further narrow to one section
    }
    """
    from app.models.academic import Batch
    data       = request.get_json() or {}
    title      = (data.get('title') or '').strip()
    message    = (data.get('message') or '').strip()
    target     = data.get('target', 'all')

    if not title or not message:
        return jsonify({'error': 'title and message are required'}), 400

    query = User.query.filter_by(institution_id=g.institution_id, is_active=True)

    if target == 'students':
        query = query.filter_by(role='student')
    elif target == 'instructors':
        query = query.filter_by(role='instructor')

    # ── Optional filters ─────────────────────────────────────────────────────
    dept_id   = data.get('department_id')
    batch_id  = data.get('batch_id')
    acad_year = data.get('academic_year')
    section_id = data.get('section_id')

    if dept_id:
        dept = Department.query.filter_by(id=dept_id, institution_id=g.institution_id).first()
        if not dept:
            return jsonify({'error': 'department_id not found'}), 404
        query = query.filter_by(department_id=dept_id)

    if batch_id:
        # scope to students enrolled in some section of this batch
        batch_section_ids = [
            s.id for s in Section.query.filter_by(
                institution_id=g.institution_id, batch_id=batch_id
            ).all()
        ]
        batch_student_ids = [
            ss.student_id for ss in SectionStudent.query.filter(
                SectionStudent.section_id.in_(batch_section_ids)
            ).all()
        ]
        query = query.filter(User.id.in_(batch_student_ids))

    elif acad_year:
        # Look up all batches in this institution for the given academic year.
        # Batch links to AcademicYear via year_id; year_label is like "2024-2025"
        # and we accept the leading 4-digit year number.
        from app.models.academic import AcademicYear as _AY, Batch as _Batch
        year_num = str(acad_year)
        year_ids = [
            ay.id for ay in _AY.query.filter_by(institution_id=g.institution_id).all()
            if ay.year_label and ay.year_label.startswith(year_num)
        ]
        year_batches = (_Batch.query.filter_by(institution_id=g.institution_id)
                                .filter(_Batch.year_id.in_(year_ids)).all()
                        if year_ids else [])
        year_section_ids = [
            s.id for b in year_batches
            for s in Section.query.filter_by(batch_id=b.id).all()
        ]
        year_student_ids = [
            ss.student_id for ss in SectionStudent.query.filter(
                SectionStudent.section_id.in_(year_section_ids)
            ).all()
        ]
        query = query.filter(User.id.in_(year_student_ids))

    if section_id:
        _own_section(section_id)
        enrolled_ids = [e.student_id for e in SectionStudent.query.filter_by(section_id=section_id).all()]
        query = query.filter(User.id.in_(enrolled_ids))

    users = query.all()
    created = 0
    for user in users:
        db.session.add(Notification(
            user_id=user.id,
            type='announcement',
            title=title,
            message=message,
        ))
        created += 1

    from app.extensions import socketio as _sio
    _sio.emit('new_announcement', {
        'title':   title,
        'message': message,
        'from':    'Institution Admin',
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"institution_{g.institution_id}")

    db.session.commit()
    scope_desc = '/'.join(filter(None, [
        dept_id and 'dept', batch_id and 'batch', acad_year and f'year:{acad_year}',
        section_id and 'section',
    ])) or target
    _write_audit(g.user_id, g.institution_id, 'send_announcement', 'announcement',
                 None, f'"{title}" sent to {created} users ({scope_desc})')
    return jsonify({'sent_to': created, 'target': target}), 201


# ── Session admin actions (cancel-with-reason, reschedule) ────────────────────

@institution_bp.route('/sessions/<session_id>/cancel', methods=['POST'])
@require_role('institution_admin')
def admin_cancel_session(session_id):
    """
    Admin-side session cancellation with a mandatory reason.
    Notifies enrolled students via SocketIO and creates notifications.

    Body: {reason: 'Lab equipment unavailable'}
    """
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    if session.status in ('ended', 'cancelled'):
        return jsonify({'error': f'Session is already {session.status}'}), 409

    data   = request.get_json() or {}
    reason = (data.get('reason') or '').strip()
    if not reason:
        return jsonify({'error': 'reason is required'}), 400

    session.status            = 'cancelled'
    session.ended_at          = datetime.utcnow()
    # Store reason in the title prefix since LabSession has no cancellation_reason column;
    # the audit log also captures the full reason string below.
    if session.title:
        session.title = f'[CANCELLED] {session.title}'

    # Notify enrolled students
    ss = SectionSubject.query.get(session.section_subject_id)
    if ss:
        enrolled = [
            link.student_id for link in SectionStudent.query.filter_by(section_id=ss.section_id).all()
        ]
        for student_id in enrolled:
            db.session.add(Notification(
                user_id=student_id,
                type='session_cancelled',
                title='Lab Session Cancelled',
                message=f'The lab session has been cancelled by the institution. Reason: {reason}',
            ))

    db.session.commit()

    from app.extensions import socketio as _sio
    _sio.emit('session_cancelled', {
        'session_id': session_id,
        'reason':     reason,
    }, room=f"session_{session_id}_students")

    _write_audit(g.user_id, g.institution_id, 'cancel_session', 'session',
                 session_id, f'Cancelled session: {reason}')
    return jsonify({'message': 'Session cancelled', 'reason': reason}), 200


@institution_bp.route('/sessions/<session_id>/reschedule', methods=['POST'])
@require_role('institution_admin')
def admin_reschedule_session(session_id):
    """
    Reschedule a cancelled (or scheduled) session to a new time.
    Resets status to 'scheduled' and sets scheduled_at.

    Body: {scheduled_at: 'YYYY-MM-DDTHH:MM:SS', reason?: '...'}
    """
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    if session.status == 'ended':
        return jsonify({'error': 'Ended sessions cannot be rescheduled'}), 409

    data = request.get_json() or {}
    new_time_str = data.get('scheduled_at')
    if not new_time_str:
        return jsonify({'error': 'scheduled_at is required (YYYY-MM-DDTHH:MM:SS)'}), 400

    try:
        new_time = datetime.strptime(new_time_str, '%Y-%m-%dT%H:%M:%S')
    except ValueError:
        try:
            new_time = datetime.strptime(new_time_str, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            return jsonify({'error': 'scheduled_at must be YYYY-MM-DDTHH:MM:SS'}), 400

    old_time            = session.scheduled_at
    session.scheduled_at = new_time
    session.status       = 'scheduled'
    session.cancellation_reason = None  # clear old cancel reason

    db.session.commit()

    _write_audit(g.user_id, g.institution_id, 'reschedule_session', 'session',
                 session_id,
                 f'Rescheduled from {old_time.strftime("%Y-%m-%d %H:%M") if old_time else "?"}'
                 f' to {new_time.strftime("%Y-%m-%d %H:%M")}'
                 + (f'. Reason: {data.get("reason")}' if data.get('reason') else ''))
    return jsonify({'message': 'Session rescheduled', 'scheduled_at': new_time.isoformat()}), 200


# ── Bulk user actions ─────────────────────────────────────────────────────────

@institution_bp.route('/users/bulk-action', methods=['POST'])
@require_role('institution_admin')
def bulk_user_action():
    """
    Apply an action to one or more users in batch.

    Body: {
        user_ids: ['...', '...'],
        action: 'deactivate' | 'activate' | 'force_logout'
                | 'change_role' | 'section_assign' | 'delete',
        # action-specific extra fields:
        role?:         'student' | 'instructor',    # for change_role
        section_id?:   '...',                        # for section_assign
    }

    Returns {processed, skipped, errors[]} so the UI can show a summary.
    """
    data     = request.get_json() or {}
    user_ids = data.get('user_ids', [])
    action   = data.get('action', '')

    valid_actions = ('deactivate', 'activate', 'force_logout',
                     'change_role', 'section_assign', 'delete')
    if action not in valid_actions:
        return jsonify({'error': f'action must be one of: {", ".join(valid_actions)}'}), 400
    if not user_ids:
        return jsonify({'error': 'user_ids is required'}), 400

    # Validate all IDs belong to this institution upfront
    users = User.query.filter(
        User.id.in_(user_ids),
        User.institution_id == g.institution_id,
    ).all()
    found_ids = {u.id for u in users}
    not_found = [uid for uid in user_ids if uid not in found_ids]

    # Prevent admin from acting on themselves
    self_attempt = g.user_id in found_ids

    processed = 0
    skipped   = 0
    errors    = []

    if action == 'deactivate':
        for user in users:
            if user.id == g.user_id:
                skipped += 1; continue
            user.is_active = False
            _apply_force_logout(user)   # invalidate existing tokens too
            processed += 1

    elif action == 'activate':
        for user in users:
            user.is_active = True
            processed += 1

    elif action == 'force_logout':
        for user in users:
            if user.id == g.user_id:
                skipped += 1; continue
            _apply_force_logout(user)
            processed += 1

    elif action == 'change_role':
        new_role = data.get('role')
        if new_role not in ('student', 'instructor'):
            return jsonify({'error': 'role must be "student" or "instructor"'}), 400
        for user in users:
            if user.id == g.user_id:
                skipped += 1; continue
            user.role = new_role
            processed += 1

    elif action == 'section_assign':
        section_id = data.get('section_id')
        if not section_id:
            return jsonify({'error': 'section_id is required for section_assign'}), 400
        _own_section(section_id)
        for user in users:
            if user.role != 'student':
                errors.append({'user_id': user.id, 'reason': 'Not a student'})
                skipped += 1; continue
            if not SectionStudent.query.filter_by(
                section_id=section_id, student_id=user.id
            ).first():
                db.session.add(SectionStudent(section_id=section_id, student_id=user.id))
                processed += 1
            else:
                skipped += 1

    elif action == 'delete':
        for user in users:
            if user.id == g.user_id:
                skipped += 1; continue
            db.session.delete(user)
            processed += 1

    db.session.commit()

    # Emit force_logout socket events for relevant actions
    if action in ('deactivate', 'force_logout'):
        from app.extensions import socketio as _sio
        for uid in [u.id for u in users if u.id != g.user_id]:
            _sio.emit('force_logout', {
                'reason': 'Logged out by administrator',
            }, room=f"user_{uid}")

    _write_audit(g.user_id, g.institution_id, f'bulk_{action}', 'user', None,
                 f'{action} applied to {processed} user(s)'
                 + (f'; {skipped} skipped' if skipped else ''))

    return jsonify({
        'processed': processed,
        'skipped':   skipped,
        'not_found': not_found,
        'errors':    errors,
        'self_skipped': self_attempt and action != 'activate',
    }), 200


# ── Department — user listing and analytics ───────────────────────────────────

@institution_bp.route('/departments/<dept_id>/users', methods=['GET'])
@require_role('institution_admin')
def department_users(dept_id):
    """
    List all users in a department.
    Params: ?role=student|instructor  — optional filter
    """
    dept = Department.query.filter_by(
        id=dept_id, institution_id=g.institution_id
    ).first_or_404()

    query = User.query.filter_by(department_id=dept_id, institution_id=g.institution_id)
    role = request.args.get('role')
    if role:
        query = query.filter_by(role=role)

    users = query.order_by(User.full_name).all()
    return jsonify({
        'department': dept.to_dict(),
        'users':      [u.to_dict() for u in users],
        'count':      len(users),
    }), 200


@institution_bp.route('/departments/<dept_id>/analytics', methods=['GET'])
@require_role('institution_admin')
def department_analytics(dept_id):
    """
    Aggregate stats for one department:
    - user counts by role
    - avg grade, avg attendance % across department students
    """
    from app.models.grading import Grade
    from app.models.session import SessionAttendance

    dept = Department.query.filter_by(
        id=dept_id, institution_id=g.institution_id
    ).first_or_404()

    students    = User.query.filter_by(department_id=dept_id, role='student').all()
    instructors = User.query.filter_by(department_id=dept_id, role='instructor').all()
    student_ids = [s.id for s in students]

    avg_grade      = None
    avg_attendance = None

    if student_ids:
        grade_row = db.session.query(
            func.avg(Grade.final_grade)
        ).filter(
            Grade.student_id.in_(student_ids),
            Grade.final_grade.isnot(None),
        ).scalar()
        if grade_row is not None:
            avg_grade = round(float(grade_row), 1)

        total_sessions  = LabSession.query.filter_by(institution_id=g.institution_id).count()
        attended_row = db.session.query(
            func.avg(
                db.session.query(func.count(SessionAttendance.session_id)).filter(
                    SessionAttendance.student_id == SessionAttendance.student_id
                ).correlate(SessionAttendance).as_scalar()
            )
        )
        # Simpler: compute average attendance across all dept students
        att_rows = db.session.query(
            SessionAttendance.student_id,
            func.count(SessionAttendance.session_id).label('attended'),
        ).filter(
            SessionAttendance.student_id.in_(student_ids),
        ).group_by(SessionAttendance.student_id).all()

        if att_rows and total_sessions:
            total_pct = sum(
                (r.attended / total_sessions * 100) for r in att_rows
            )
            avg_attendance = round(total_pct / len(att_rows), 1)

    return jsonify({
        'department':  dept.to_dict(),
        'students':    len(students),
        'instructors': len(instructors),
        'avg_grade':       avg_grade,
        'avg_attendance':  avg_attendance,
    }), 200


# ── Student enrollment history / audit ───────────────────────────────────────

@institution_bp.route('/students/<student_id>/enrollment-history', methods=['GET'])
@require_role('institution_admin')
def student_enrollment_history(student_id):
    """
    Queryable enrollment + transfer history for one student.
    Returns every SectionStudent record (past and present) ordered by enrolled_at.
    Each row includes section name, batch, and academic year for full audit trail.
    """
    from app.models.academic import AcademicYear

    student = User.query.filter_by(
        id=student_id, institution_id=g.institution_id, role='student'
    ).first_or_404()

    rows = db.session.query(SectionStudent, Section).join(
        Section, Section.id == SectionStudent.section_id
    ).filter(
        SectionStudent.student_id == student_id
    ).order_by(SectionStudent.enrolled_at).all()

    # Preload batches
    batch_ids = {sec.batch_id for _, sec in rows if sec.batch_id}
    from app.models.academic import Batch
    batches = {b.id: b for b in Batch.query.filter(Batch.id.in_(batch_ids)).all()} if batch_ids else {}

    history = []
    for link, sec in rows:
        batch   = batches.get(sec.batch_id)
        history.append({
            'section_id':    sec.id,
            'section_name':  sec.name,
            'batch_id':      sec.batch_id,
            'batch_name':    batch.name if batch else None,
            'academic_year': batch.year if batch else None,
            'enrolled_at':   link.enrolled_at.isoformat() if link.enrolled_at else None,
        })

    return jsonify({
        'student':         student.to_dict(),
        'enrollment_history': history,
        'total':           len(history),
    }), 200


# ─────────────────────────────────────────────────────────────────────────────
# Task #47 — Quality-of-life endpoints
# ─────────────────────────────────────────────────────────────────────────────

def _parse_tz_offset(tz_offset_str: str | None) -> int:
    """Parse ?tz_offset=+05:30 or ±HH:MM or ±HH into total offset minutes.
    Returns 0 (UTC) for any invalid/missing value."""
    if not tz_offset_str:
        return 0
    try:
        raw = tz_offset_str.strip()
        sign = -1 if raw.startswith('-') else 1
        raw  = raw.lstrip('+-')
        if ':' in raw:
            h, m = raw.split(':')
        else:
            h, m = raw, '0'
        return sign * (int(h) * 60 + int(m))
    except Exception:
        return 0


# ── Global Search ─────────────────────────────────────────────────────────────
@institution_bp.route('/search', methods=['GET'])
@require_role('institution_admin')
def global_search():
    """
    Cross-entity search for the institution admin dashboard.

    Query param:
      ?q=<term>          — required; min 2 characters
      ?types=users,sections,sessions   — comma-separated entity types to include;
             defaults to all three when absent
      ?limit=20          — max results per type (default 20, cap 100)

    Returns up to `limit` hits per enabled type:
      users    — matches on full_name / email / roll_number / staff_id
      sections — matches on section name
      sessions — matches on session title / experiment title / jitsi_room_name

    Each hit includes a 'type' discriminator so the client can route the result.
    """
    q = (request.args.get('q', '') or '').strip()
    if len(q) < 2:
        return jsonify({'error': 'Query must be at least 2 characters'}), 400

    types_param = request.args.get('types', 'users,sections,sessions')
    enabled     = {t.strip().lower() for t in types_param.split(',')}
    limit       = min(int(request.args.get('limit', 20)), 100)
    like        = f'%{q}%'

    results = []

    # ── Users ─────────────────────────────────────────────────────────────────
    if 'users' in enabled:
        users = User.query.filter(
            User.institution_id == g.institution_id,
            db.or_(
                User.full_name.ilike(like),
                User.email.ilike(like),
                User.roll_number.ilike(like),
                User.staff_id.ilike(like),
            )
        ).order_by(User.full_name).limit(limit).all()

        for u in users:
            results.append({
                'type':        'user',
                'id':          u.id,
                'label':       u.full_name or u.email,
                'sub_label':   u.roll_number or u.staff_id or u.email,
                'role':        u.role,
                'is_active':   u.is_active,
            })

    # ── Sections ──────────────────────────────────────────────────────────────
    if 'sections' in enabled:
        sections = Section.query.filter(
            Section.institution_id == g.institution_id,
            Section.name.ilike(like),
        ).order_by(Section.name).limit(limit).all()

        for sec in sections:
            results.append({
                'type':       'section',
                'id':         sec.id,
                'label':      sec.name,
                'sub_label':  f'batch: {sec.batch_id}',
                'batch_id':   sec.batch_id,
            })

    # ── Sessions ──────────────────────────────────────────────────────────────
    if 'sessions' in enabled:
        from app.models.session import LabSession

        sess_q = LabSession.query.filter(
            LabSession.institution_id == g.institution_id,
            db.or_(
                LabSession.title.ilike(like),
                LabSession.jitsi_room_name.ilike(like),
            )
        ).order_by(LabSession.scheduled_at.desc()).limit(limit).all()

        for sess in sess_q:
            results.append({
                'type':           'session',
                'id':             sess.id,
                'label':          sess.title or sess.id,
                'sub_label':      sess.status,
                'scheduled_at':   sess.scheduled_at.isoformat() if sess.scheduled_at else None,
                'status':         sess.status,
                'section_subject_id': sess.section_subject_id,
            })

    return jsonify({
        'query':   q,
        'count':   len(results),
        'results': results,
    }), 200


# ── Dashboard date-range helper (UTC-offset-aware) ────────────────────────────
@institution_bp.route('/analytics/date-range', methods=['GET'])
@require_role('institution_admin')
def analytics_date_range():
    """
    Utility endpoint that resolves the effective UTC date window for a given
    ?tz_offset=+HH:MM and ?days=N (or ?from / ?to in local time).

    Clients can call this first to confirm what window they'll get back from
    analytics endpoints before making additional requests, or they can just
    pass tz_offset to the analytics endpoints directly.

    This endpoint also serves as contract documentation: any analytics endpoint
    that accepts ?tz_offset will interpret the from/to dates in local time and
    store/return all datetimes as UTC.

    Returns the resolved UTC window and local window for display.
    """
    tz_minutes = _parse_tz_offset(request.args.get('tz_offset'))
    offset     = timedelta(minutes=tz_minutes)

    from_str = request.args.get('from')
    to_str   = request.args.get('to')
    days     = int(request.args.get('days', 30))

    if from_str and to_str:
        try:
            # Interpret from/to as local time → shift to UTC
            local_start = datetime.strptime(from_str, '%Y-%m-%d')
            local_end   = datetime.strptime(to_str,   '%Y-%m-%d').replace(
                              hour=23, minute=59, second=59)
            utc_start   = local_start - offset
            utc_end     = local_end   - offset
        except ValueError:
            return jsonify({'error': 'Invalid date format; use YYYY-MM-DD'}), 400
    else:
        utc_end   = datetime.utcnow()
        utc_start = utc_end - timedelta(days=days)
        local_start = utc_start + offset
        local_end   = utc_end   + offset

    return jsonify({
        'tz_offset_minutes': tz_minutes,
        'utc': {
            'from': utc_start.strftime('%Y-%m-%dT%H:%M:%S'),
            'to':   utc_end.strftime('%Y-%m-%dT%H:%M:%S'),
        },
        'local': {
            'from': local_start.strftime('%Y-%m-%dT%H:%M:%S'),
            'to':   local_end.strftime('%Y-%m-%dT%H:%M:%S'),
        },
    }), 200


# ── Saved Dashboard Filters ───────────────────────────────────────────────────
@institution_bp.route('/dashboard/filters', methods=['GET'])
@require_role('institution_admin')
def get_dashboard_filters():
    """
    Retrieve the calling admin's saved dashboard filters from AuditLog.
    Filters are serialised as JSON text in the `detail` column of the most
    recent 'dashboard_filter_save' entry for this admin — no extra table needed.
    """
    from app.models.academic import AuditLog
    import json as _json

    entry = AuditLog.query.filter_by(
        institution_id=g.institution_id,
        actor_id=g.user_id,
        action='dashboard_filter_save',
    ).order_by(AuditLog.created_at.desc()).first()

    if not entry:
        return jsonify({'filters': {}}), 200

    try:
        filters = _json.loads(entry.detail or '{}')
    except ValueError:
        filters = {}
    return jsonify({'filters': filters, 'saved_at': entry.created_at.isoformat()}), 200


@institution_bp.route('/dashboard/filters', methods=['POST'])
@require_role('institution_admin')
def save_dashboard_filters():
    """
    Persist the calling admin's dashboard filters.

    Body: any JSON object (date range, role filter, section filter, etc.).
    Serialised to the audit log `detail` column — no schema migration needed.
    """
    import json as _json
    filters = request.get_json(silent=True) or {}
    _write_audit(
        actor_id=g.user_id,
        institution_id=g.institution_id,
        action='dashboard_filter_save',
        target_type='dashboard',
        target_id=g.institution_id,
        detail=_json.dumps(filters),
    )
    db.session.commit()
    return jsonify({'message': 'Filters saved', 'filters': filters}), 200
