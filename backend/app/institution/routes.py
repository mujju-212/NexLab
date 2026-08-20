"""
Institution Blueprint — Institution Admin routes
Manages: users, academic structure, sections, subjects, environment profiles,
         announcements, analytics, audit log, force logout
"""
from flask import Blueprint, request, jsonify, g
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
    """Last 20 announcements sent by this institution"""
    # Get distinct announcements (by title+message+created_at) for this institution
    from sqlalchemy import distinct
    recent = Notification.query.join(
        User, Notification.user_id == User.id
    ).filter(
        User.institution_id == g.institution_id,
        Notification.type == 'announcement'
    ).order_by(Notification.created_at.desc()).limit(20).all()

    return jsonify({'announcements': [n.to_dict() for n in recent]}), 200


# ── Force Logout ───────────────────────────────────────────────────────────────

@institution_bp.route('/users/<user_id>/force-logout', methods=['POST'])
@require_role('institution_admin')
def force_logout_user(user_id):
    """
    Force-logout a user by invalidating their JWT.
    Stores the user_id in a blocklist table — auth middleware checks it on each request.
    Also emits a SocketIO kick event to disconnect them live.
    """
    user = User.query.filter_by(
        id=user_id, institution_id=g.institution_id
    ).first_or_404()

    # Store force-logout timestamp — any token issued before this is rejected
    user.force_logout_at = datetime.utcnow()
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

    since = datetime.utcnow() - timedelta(days=days)
    query = AuditLog.query.filter_by(
        institution_id=g.institution_id
    ).filter(AuditLog.created_at >= since)

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
    High-level institution analytics:
    - Total sessions last 30 days
    - Average experiment completion rate
    - Students at risk (concept mastery < 40%)
    - Peak usage hours
    - Instructor activity levels
    """
    from app.models.submission import CodeAttempt
    from app.models.knowledge import ConceptMastery
    from sqlalchemy import func

    iid   = g.institution_id
    since = datetime.utcnow() - timedelta(days=30)

    # Sessions this month
    total_sessions = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.scheduled_at >= since
    ).count()

    completed_sessions = LabSession.query.filter(
        LabSession.institution_id == iid,
        LabSession.status == 'ended',
        LabSession.scheduled_at >= since
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

    # Active instructors this month — via SectionSubject join
    from app.models.academic import SectionSubject
    active_session_ssids = db.session.query(
        func.distinct(LabSession.section_subject_id)
    ).filter(
        LabSession.institution_id == iid,
        LabSession.scheduled_at >= since
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
        LabSession.started_at.isnot(None)
    ).all()

    hour_counts = {}
    for s in all_sessions:
        if s.started_at:
            h = s.started_at.hour
            hour_counts[h] = hour_counts.get(h, 0) + 1

    peak_hours = sorted(hour_counts.items(), key=lambda x: x[1], reverse=True)[:3]

    return jsonify({
        'period_days': 30,
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
        'instructors': {'active_this_month': active_instructors},
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
    """Compare performance across all sections in the institution"""
    from app.models.knowledge import StudentRanking
    from app.models.academic import SectionSubject

    sections = Section.query.filter_by(institution_id=g.institution_id).all()
    result = []

    for sec in sections:
        ss_ids = [ss.id for ss in SectionSubject.query.filter_by(section_id=sec.id).all()]
        rankings = StudentRanking.query.filter(
            StudentRanking.section_subject_id.in_(ss_ids)
        ).all() if ss_ids else []
        if not rankings:
            avg_score = 0
        else:
            scores = [r.rank_score for r in rankings if r.rank_score is not None]
            avg_score = sum(scores) / len(scores) if scores else 0

        enrolled = SectionStudent.query.filter_by(section_id=sec.id).count()
        result.append({
            'section_id':   sec.id,
            'section_name': sec.name,
            'enrolled':     enrolled,
            'avg_score':    round(avg_score, 1),
        })

    result.sort(key=lambda x: x['avg_score'], reverse=True)
    return jsonify({'sections': result}), 200
