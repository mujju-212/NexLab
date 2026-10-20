"""
Institution Admin — Department management + Section CRUD completion.

Closes gaps identified in the earlier admin-capability audit:
  - Department Management (CRUD) — didn't exist at all before this file.
  - Section update / delete — only create + list existed before.
  - Assign Class Teacher to a section — no field/endpoint existed before.
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.academic import Department, Section, SectionStudent, SectionSubject
from app.models.user import User
from app.institution.audit import write_audit

departments_bp = Blueprint('departments', __name__)


# ══════════════════════════════════════════════════════════════════════════════
# DEPARTMENTS
# ══════════════════════════════════════════════════════════════════════════════

@departments_bp.route('/departments', methods=['GET'])
@require_role('institution_admin', 'instructor')
def list_departments():
    from app.models.subject import Subject
    from sqlalchemy import func
    depts = Department.query.filter_by(institution_id=g.institution_id).order_by(Department.name).all()
    
    # Bulk aggregate counts in 2 single queries instead of N*2 loop queries
    stud_counts = dict(
        db.session.query(User.department_id, func.count(User.id))
        .filter(User.institution_id == g.institution_id, User.role == 'student', User.department_id.isnot(None))
        .group_by(User.department_id)
        .all()
    )
    subj_counts = dict(
        db.session.query(Subject.department_id, func.count(Subject.id))
        .filter(Subject.institution_id == g.institution_id, Subject.department_id.isnot(None))
        .group_by(Subject.department_id)
        .all()
    )

    res = []
    for d in depts:
        dd = d.to_dict()
        dd['students_count'] = stud_counts.get(d.id, 0)
        dd['subjects_count'] = subj_counts.get(d.id, 0)
        res.append(dd)
    return jsonify({'departments': res}), 200


@departments_bp.route('/departments', methods=['POST'])
@require_role('institution_admin')
def create_department():
    data = request.get_json() or {}
    name = (data.get('name', '') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400

    if Department.query.filter_by(institution_id=g.institution_id, name=name).first():
        return jsonify({'error': 'A department with this name already exists'}), 409

    dept = Department(
        institution_id=g.institution_id,
        name=name,
        code=(data.get('code') or '').strip().upper() or None,
        description=data.get('description', ''),
        color=data.get('color', '#7c3aed'),
        is_active=data.get('is_active', True),
    )
    db.session.add(dept)
    db.session.commit()
    write_audit(g.user_id, g.institution_id, 'create_department', 'department',
                dept.id, f"Created department {dept.name}")
    d_dict = dept.to_dict()
    d_dict['students_count'] = 0
    d_dict['subjects_count'] = 0
    return jsonify({'department': d_dict}), 201


@departments_bp.route('/departments/<dept_id>', methods=['PATCH'])
@require_role('institution_admin')
def update_department(dept_id):
    dept = Department.query.filter_by(id=dept_id, institution_id=g.institution_id).first_or_404()
    data = request.get_json() or {}
    for field in ('name', 'code', 'description', 'color', 'is_active'):
        if field in data:
            setattr(dept, field, data[field])
    db.session.commit()
    write_audit(g.user_id, g.institution_id, 'update_department', 'department',
                dept.id, f"Updated department {dept.name}")
    from app.models.subject import Subject
    d_dict = dept.to_dict()
    d_dict['students_count'] = User.query.filter_by(institution_id=g.institution_id, department_id=dept.id, role='student').count()
    d_dict['subjects_count'] = Subject.query.filter_by(institution_id=g.institution_id, department_id=dept.id).count()
    return jsonify({'department': d_dict}), 200


@departments_bp.route('/departments/<dept_id>', methods=['DELETE'])
@require_role('institution_admin')
def delete_department(dept_id):
    dept = Department.query.filter_by(id=dept_id, institution_id=g.institution_id).first_or_404()

    from app.models.subject import Subject
    from app.models.academic import Batch

    users_in_use = User.query.filter_by(department_id=dept_id).count()
    subjects_in_use = Subject.query.filter_by(department_id=dept_id).count()
    batches_in_use = Batch.query.filter_by(department_id=dept_id).count()

    if users_in_use or subjects_in_use or batches_in_use:
        reasons = []
        if users_in_use:
            reasons.append(f"{users_in_use} user(s)")
        if subjects_in_use:
            reasons.append(f"{subjects_in_use} subject(s)")
        if batches_in_use:
            reasons.append(f"{batches_in_use} batch(es)")
        return jsonify({
            'error': f'Cannot delete: {" and ".join(reasons)} are still assigned to this department. Reassign them first.'
        }), 409

    name = dept.name
    db.session.delete(dept)
    db.session.commit()
    write_audit(g.user_id, g.institution_id, 'delete_department', 'department',
                dept_id, f"Deleted department {name}")
    return jsonify({'message': 'Department deleted'}), 200


# ══════════════════════════════════════════════════════════════════════════════
# SECTIONS — update / delete / class-teacher assignment
# (create + list already existed in institution/routes.py)
# ══════════════════════════════════════════════════════════════════════════════

@departments_bp.route('/sections/<section_id>', methods=['PATCH'])
@require_role('institution_admin')
def update_section(section_id):
    """
    Update a section's name and/or class teacher.
    Body: {"name": "B", "class_teacher_id": "<instructor user id>"}
    Pass class_teacher_id: null to unassign.
    """
    section = Section.query.filter_by(id=section_id, institution_id=g.institution_id).first_or_404()
    data = request.get_json() or {}

    for field in ('name', 'section_code', 'max_students', 'is_active', 'batch_id'):
        if field in data:
            setattr(section, field, data[field])

    if 'class_teacher_id' in data:
        teacher_id = data['class_teacher_id']
        if teacher_id:
            teacher = User.query.filter_by(
                id=teacher_id, institution_id=g.institution_id, role='instructor'
            ).first()
            if not teacher:
                return jsonify({'error': 'class_teacher_id must be an instructor in this institution'}), 400
        section.class_teacher_id = teacher_id

    db.session.commit()
    write_audit(g.user_id, g.institution_id, 'update_section', 'section',
                section.id, f"Updated section {section.name}")
    sd = section.to_dict()
    sd['students_count'] = SectionStudent.query.filter_by(section_id=section.id).count()
    return jsonify({'section': sd}), 200


@departments_bp.route('/sections/<section_id>', methods=['DELETE'])
@require_role('institution_admin')
def delete_section(section_id):
    section = Section.query.filter_by(id=section_id, institution_id=g.institution_id).first_or_404()

    enrolled = SectionStudent.query.filter_by(section_id=section_id).count()
    assigned = SectionSubject.query.filter_by(section_id=section_id).count()
    if enrolled or assigned:
        return jsonify({
            'error': f'Cannot delete: section has {enrolled} enrolled student(s) and '
                     f'{assigned} subject assignment(s). Remove those first.'
        }), 409

    name = section.name
    db.session.delete(section)
    db.session.commit()
    write_audit(g.user_id, g.institution_id, 'delete_section', 'section',
                section_id, f"Deleted section {name}")
    return jsonify({'message': 'Section deleted'}), 200
