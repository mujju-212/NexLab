"""
Institution Blueprint — Institution Admin routes
Manages: users, academic structure, sections, subjects, environment profiles
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role, require_institution
from app.extensions import db
from app.models.user import User
from app.models.academic import AcademicYear, Batch, Section, SectionStudent, SectionSubject
from app.models.subject import Subject, EnvironmentProfile
from app.models.feedback import Notification
from datetime import datetime
import bcrypt, uuid, csv, io

institution_bp = Blueprint('institution', __name__)


# ── User Management ────────────────────────────────────────────────────────────

@institution_bp.route('/users', methods=['GET'])
@require_role('institution_admin')
def list_users():
    role = request.args.get('role')
    query = User.query.filter_by(institution_id=g.institution_id)
    if role:
        query = query.filter_by(role=role)
    users = query.order_by(User.full_name).all()
    return jsonify({'users': [u.to_dict() for u in users]}), 200


@institution_bp.route('/users', methods=['POST'])
@require_role('institution_admin')
def create_user():
    data = request.get_json()
    if User.query.filter_by(email=data['email'].lower()).first():
        return jsonify({'error': 'Email already exists'}), 409

    user = User(
        institution_id=g.institution_id,
        email=data['email'].lower().strip(),
        password_hash=bcrypt.hashpw(data.get('password', 'Welcome@123').encode(),
                                    bcrypt.gensalt()).decode(),
        full_name=data['full_name'],
        role=data['role'],
        roll_number=data.get('roll_number'),
        phone=data.get('phone'),
    )
    db.session.add(user)
    db.session.commit()
    return jsonify({'user': user.to_dict()}), 201


@institution_bp.route('/users/bulk-upload', methods=['POST'])
@require_role('institution_admin')
def bulk_upload_users():
    """CSV bulk upload for students. Columns: email, full_name, roll_number, phone"""
    file = request.files.get('file')
    if not file:
        return jsonify({'error': 'CSV file required'}), 400

    content = file.read().decode('utf-8')
    reader = csv.DictReader(io.StringIO(content))
    created, skipped = [], []

    for row in reader:
        email = row.get('email', '').lower().strip()
        if not email:
            continue
        if User.query.filter_by(email=email).first():
            skipped.append(email)
            continue

        user = User(
            institution_id=g.institution_id,
            email=email,
            password_hash=bcrypt.hashpw('Welcome@123'.encode(), bcrypt.gensalt()).decode(),
            full_name=row.get('full_name', '').strip(),
            role='student',
            roll_number=row.get('roll_number', '').strip(),
            phone=row.get('phone', '').strip(),
        )
        db.session.add(user)
        created.append(email)

    db.session.commit()
    return jsonify({'created': len(created), 'skipped': len(skipped), 'skipped_emails': skipped}), 201


@institution_bp.route('/users/<user_id>/toggle-active', methods=['PATCH'])
@require_role('institution_admin')
def toggle_user_active(user_id):
    user = User.query.filter_by(id=user_id, institution_id=g.institution_id).first_or_404()
    user.is_active = not user.is_active
    db.session.commit()
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
    return jsonify({'year': year.to_dict()}), 201


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
    return jsonify({'batch': batch.to_dict()}), 201


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
    return jsonify({'section': section.to_dict()}), 201


@institution_bp.route('/sections/<section_id>/enroll', methods=['POST'])
@require_role('institution_admin')
def enroll_students(section_id):
    """Enroll students into a section"""
    data = request.get_json()
    student_ids = data.get('student_ids', [])
    enrolled = 0
    for sid in student_ids:
        if not SectionStudent.query.filter_by(section_id=section_id, student_id=sid).first():
            db.session.add(SectionStudent(section_id=section_id, student_id=sid))
            enrolled += 1
    db.session.commit()
    return jsonify({'enrolled': enrolled}), 200


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
    )
    db.session.add(subject)
    db.session.commit()
    return jsonify({'subject': subject.to_dict()}), 201


@institution_bp.route('/section-subjects', methods=['POST'])
@require_role('institution_admin')
def assign_subject():
    """Assign a subject + instructor to a section"""
    data = request.get_json()
    ss = SectionSubject(
        institution_id=g.institution_id,
        section_id=data['section_id'],
        subject_id=data['subject_id'],
        instructor_id=data['instructor_id'],
        co_instructor_id=data.get('co_instructor_id'),
    )
    db.session.add(ss)
    db.session.commit()
    return jsonify({'section_subject': ss.to_dict()}), 201


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
