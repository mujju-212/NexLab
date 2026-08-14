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

departments_bp = Blueprint('departments', __name__)


# ══════════════════════════════════════════════════════════════════════════════
# DEPARTMENTS
# ══════════════════════════════════════════════════════════════════════════════

@departments_bp.route('/departments', methods=['GET'])
@require_role('institution_admin', 'instructor')
def list_departments():
    depts = Department.query.filter_by(institution_id=g.institution_id).order_by(Department.name).all()
    return jsonify({'departments': [d.to_dict() for d in depts]}), 200


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
    )
    db.session.add(dept)
    db.session.commit()
    return jsonify({'department': dept.to_dict()}), 201


@departments_bp.route('/departments/<dept_id>', methods=['PATCH'])
@require_role('institution_admin')
def update_department(dept_id):
    dept = Department.query.filter_by(id=dept_id, institution_id=g.institution_id).first_or_404()
    data = request.get_json() or {}
    for field in ('name', 'code'):
        if field in data:
            setattr(dept, field, data[field])
    db.session.commit()
    return jsonify({'department': dept.to_dict()}), 200


@departments_bp.route('/departments/<dept_id>', methods=['DELETE'])
@require_role('institution_admin')
def delete_department(dept_id):
    dept = Department.query.filter_by(id=dept_id, institution_id=g.institution_id).first_or_404()

    in_use = User.query.filter_by(department_id=dept_id).count()
    if in_use:
        return jsonify({
            'error': f'Cannot delete: {in_use} user(s) are still assigned to this department. '
                     f'Reassign them first.'
        }), 409

    db.session.delete(dept)
    db.session.commit()
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

    if 'name' in data:
        section.name = data['name']

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
    return jsonify({'section': section.to_dict()}), 200


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

    db.session.delete(section)
    db.session.commit()
    return jsonify({'message': 'Section deleted'}), 200
