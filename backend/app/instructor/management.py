"""
Instructor management endpoints — Tier 1:

/interventions          F1  — record + track actions on at-risk students
/mastery-heatmap        F2  — class-wide students × concepts matrix
/announce               F3  — instructor announcements to their own sections
/extensions             F4  — per-student deadline relief + excused absences
/interventions/due      F1  — open interventions with follow_up reached
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.user import User
from app.models.knowledge import ConceptMastery
from app.models.feedback import Notification
from app.models.academic import SectionSubject, Section, SectionStudent
from app.models.experiment import Experiment, ContentModule, ContentProgress
from app.models.intervention import Intervention, Extension
from sqlalchemy import func
from datetime import datetime

mgmt_bp = Blueprint('instructor_mgmt', __name__)

VALID_ACTIONS = ('talked_to_student', 'extended_deadline', 're_graded',
                 'contacted_guardian', 'tutoring', 'resources_shared', 'other')
VALID_OUTCOMES = ('open', 'improved', 'no_change', 'worsened')


def _my_ss_ids():
    return [ss.id for ss in SectionSubject.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id).all()]


def _my_students():
    """All students in the instructor's sections (id → User)."""
    my_ss = SectionSubject.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id).all()
    section_ids = [ss.section_id for ss in my_ss]
    if not section_ids:
        return {}, []
    enrollments = SectionStudent.query.filter(
        SectionStudent.section_id.in_(section_ids)).all()
    ids = list({e.student_id for e in enrollments})
    users = {u.id: u for u in User.query.filter(User.id.in_(ids)).all()} if ids else {}
    return users, ids


# ══════════════════════════════════════════════════════════════════════════════
# F1 — Interventions
# ══════════════════════════════════════════════════════════════════════════════

@mgmt_bp.route('/interventions', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_interventions():
    """Interventions for my students. ?status=open|resolved, ?student_id=…"""
    users, ids = _my_students()
    q = Intervention.query.filter(
        Intervention.institution_id == g.institution_id,
        Intervention.student_id.in_(ids) if ids else db.false(),
    )
    if g.role == 'instructor':
        q = q.filter(Intervention.created_by == g.user_id)
    status = request.args.get('status')
    if status == 'open':
        q = q.filter(Intervention.outcome == 'open')
    elif status == 'resolved':
        q = q.filter(Intervention.outcome != 'open')
    student_id = request.args.get('student_id')
    if student_id:
        q = q.filter(Intervention.student_id == student_id)

    rows = q.order_by(Intervention.created_at.desc()).limit(200).all()
    return jsonify({'interventions': [r.to_dict() for r in rows],
                    'my_students': sorted(u.full_name for u in users.values())}), 200


@mgmt_bp.route('/interventions', methods=['POST'])
@require_role('instructor', 'institution_admin')
def create_intervention():
    """
    Record an action on a struggling student.
    Body: {student_id, action_type, note?, follow_up_at?}
    """
    data = request.get_json() or {}
    student_id = data.get('student_id')
    action_type = data.get('action_type')

    _, ids = _my_students()
    if student_id not in ids:
        return jsonify({'error': 'That student is not in your sections.'}), 403
    if action_type not in VALID_ACTIONS:
        return jsonify({'error': f'action_type must be one of: {", ".join(VALID_ACTIONS)}'}), 400

    follow_up_at = None
    if data.get('follow_up_at'):
        try:
            follow_up_at = datetime.fromisoformat(str(data['follow_up_at']).replace('Z', ''))
        except ValueError:
            return jsonify({'error': 'Invalid follow_up_at; use an ISO datetime'}), 400
        if follow_up_at <= datetime.utcnow():
            return jsonify({'error': 'follow_up_at must be in the future'}), 400

    row = Intervention(
        institution_id=g.institution_id,
        student_id=student_id,
        created_by=g.user_id,
        action_type=action_type,
        note=(data.get('note') or '').strip() or None,
        follow_up_at=follow_up_at,
        outcome='open',
    )
    db.session.add(row)
    db.session.commit()
    return jsonify({'intervention': row.to_dict()}), 201


@mgmt_bp.route('/interventions/<row_id>/outcome', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def set_outcome(row_id):
    """Close the loop: did it improve? Body: {outcome, outcome_note?}"""
    row = Intervention.query.filter_by(
        id=row_id, institution_id=g.institution_id).first()
    if not row:
        return jsonify({'error': 'Intervention not found.'}), 404
    if g.role == 'instructor' and row.created_by != g.user_id:
        return jsonify({'error': 'Not your intervention.'}), 403

    data = request.get_json() or {}
    outcome = data.get('outcome')
    if outcome not in VALID_OUTCOMES:
        return jsonify({'error': f'outcome must be one of: {", ".join(VALID_OUTCOMES)}'}), 400

    row.outcome = outcome
    row.outcome_note = (data.get('outcome_note') or '').strip() or None
    row.resolved_at = datetime.utcnow() if outcome != 'open' else None
    db.session.commit()
    return jsonify({'intervention': row.to_dict()}), 200


@mgmt_bp.route('/interventions/due', methods=['GET'])
@require_role('instructor', 'institution_admin')
def due_interventions():
    """Open interventions whose follow-up date has arrived — powers the
    attention panel's follow-up reminder."""
    now = datetime.utcnow()
    _, ids = _my_students()
    q = Intervention.query.filter(
        Intervention.institution_id == g.institution_id,
        Intervention.outcome == 'open',
        Intervention.follow_up_at.isnot(None),
        Intervention.follow_up_at <= now,
    )
    if g.role == 'instructor':
        q = q.filter(Intervention.created_by == g.user_id)
    rows = q.order_by(Intervention.follow_up_at.asc()).limit(50).all()
    return jsonify({'due': [r.to_dict() for r in rows]}), 200


# ══════════════════════════════════════════════════════════════════════════════
# F2 — Class concept-mastery heatmap (students × concepts)
# ══════════════════════════════════════════════════════════════════════════════

@mgmt_bp.route('/mastery-heatmap', methods=['GET'])
@require_role('instructor', 'institution_admin')
def mastery_heatmap():
    """
    Aggregate ConceptMastery for every student in my sections → matrix.
    Returns students (rows), concepts (columns, weakest-first), values 0–100,
    per-concept class averages, and flagged weak cells (< threshold).
    """
    users, ids = _my_students()
    if not ids:
        return jsonify({'students': [], 'concepts': [], 'values': [],
                        'concept_avgs': [], 'threshold': 40}), 200

    threshold = request.args.get('threshold', 40, type=int)
    threshold = max(0, min(threshold, 100))

    rows = ConceptMastery.query.filter(
        ConceptMastery.institution_id == g.institution_id,
        ConceptMastery.student_id.in_(ids),
    ).all()

    # Concept ordering: weakest class-average first (the teach-this-next list)
    by_concept = {}
    for r in rows:
        by_concept.setdefault(r.concept, []).append(r.mastery_score or 0)
    concepts = sorted(
        by_concept.keys(),
        key=lambda c: sum(by_concept[c]) / len(by_concept[c]),
    )

    students_out = []
    values = []
    weak_flags = []   # {student_id, concept, mastery}
    for sid in sorted(ids, key=lambda s: users.get(s).full_name if s in users else s):
        u = users.get(sid)
        if not u:
            continue
        row_vals = {}
        for r in rows:
            if r.student_id == sid:
                row_vals[r.concept] = round(r.mastery_score or 0, 1)
        row_list = [row_vals.get(c) for c in concepts]
        values.append({'student_id': sid, 'values': row_list})
        students_out.append({'student_id': sid, 'full_name': u.full_name,
                             'roll_number': u.roll_number})
        for c, v in row_vals.items():
            if v < threshold:
                weak_flags.append({'student_id': sid, 'concept': c, 'mastery': v})

    concept_avgs = [
        {'concept': c,
         'avg': round(sum(by_concept[c]) / len(by_concept[c]), 1),
         'students': len(by_concept[c])}
        for c in concepts
    ]

    return jsonify({
        'students': students_out,
        'concepts': concepts,
        'values': values,
        'concept_avgs': concept_avgs,
        'weak_flags': weak_flags,
        'threshold': threshold,
    }), 200


# ══════════════════════════════════════════════════════════════════════════════
# F3 — Instructor announcements (own sections only)
# ══════════════════════════════════════════════════════════════════════════════

@mgmt_bp.route('/announcements', methods=['POST'])
@require_role('instructor')
def instructor_announce():
    """
    Send an announcement to students of ONE of my section-subjects
    (instructors are deliberately narrower than admins: no all/institution,
    no other teachers' sections).

    Body: {section_subject_id, title, message}
    """
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    message = (data.get('message') or '').strip()
    ss_id = data.get('section_subject_id')

    if not title or not message:
        return jsonify({'error': 'title and message are required'}), 400
    if len(title) > 500 or len(message) > 20_000:
        return jsonify({'error': 'title or message too long'}), 400

    ss = SectionSubject.query.filter_by(
        id=ss_id, institution_id=g.institution_id,
        instructor_id=g.user_id).first()
    if not ss:
        return jsonify({'error': 'That section-subject is not assigned to you.'}), 403

    enrolled = [e.student_id for e in
                SectionStudent.query.filter_by(section_id=ss.section_id).all()]
    if not enrolled:
        return jsonify({'error': 'No students enrolled in this section yet.'}), 400

    created = 0
    for sid in enrolled:
        db.session.add(Notification(
            user_id=sid,
            type='announcement',
            title=title,
            message=message,
        ))
        created += 1
    db.session.commit()

    from app.extensions import socketio
    socketio.emit('new_announcement', {
        'title': title,
        'message': message,
        'from': 'Your Instructor',
        'timestamp': datetime.utcnow().isoformat(),
    }, room=f"institution_{g.institution_id}")

    from app.institution.audit import write_audit
    write_audit(g.user_id, g.institution_id, 'instructor_announcement',
                'announcement', None, f'"{title}" sent to {created} students')
    return jsonify({'sent_to': created}), 201


@mgmt_bp.route('/announcements/recipients', methods=['GET'])
@require_role('instructor')
def announcement_recipients():
    """My section-subjects with headcounts — powers the dropdown."""
    from app.models.subject import Subject
    my_ss = SectionSubject.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id).all()
    # Perf pass: was 3 queries (section, subject, count) per section-subject.
    sec_ids = {ss.section_id for ss in my_ss if ss.section_id}
    subj_ids = {ss.subject_id for ss in my_ss if ss.subject_id}
    sections = {s.id: s for s in Section.query.filter(
        Section.id.in_(sec_ids)).all()} if sec_ids else {}
    subjects = {s.id: s for s in Subject.query.filter(
        Subject.id.in_(subj_ids)).all()} if subj_ids else {}
    counts = dict(db.session.query(
        SectionStudent.section_id, func.count(SectionStudent.student_id)
    ).filter(SectionStudent.section_id.in_(sec_ids)
    ).group_by(SectionStudent.section_id).all()) if sec_ids else {}
    out = []
    for ss in my_ss:
        section = sections.get(ss.section_id)
        subject = subjects.get(ss.subject_id)
        out.append({
            'section_subject_id': ss.id,
            'subject_name': subject.name if subject else '—',
            'section_name': section.name if section else '—',
            'student_count': counts.get(ss.section_id, 0),
        })
    return jsonify({'recipients': out}), 200


# ══════════════════════════════════════════════════════════════════════════════
# F4 — Extensions & excused absences
# ══════════════════════════════════════════════════════════════════════════════

@mgmt_bp.route('/extensions', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_extensions():
    """Extensions granted for one of my experiments. ?experiment_id=…"""
    exp_id = request.args.get('experiment_id')
    q = Extension.query.filter_by(institution_id=g.institution_id)
    if exp_id:
        exp = Experiment.query.filter_by(
            id=exp_id, institution_id=g.institution_id).first()
        if not exp:
            return jsonify({'error': 'Experiment not found.'}), 404
        if g.role == 'instructor' and exp.instructor_id != g.user_id:
            return jsonify({'error': 'That experiment is not yours.'}), 403
        q = q.filter(Extension.experiment_id == exp_id)
    else:
        if g.role == 'instructor':
            my_exp_ids = [e.id for e in Experiment.query.filter_by(
                institution_id=g.institution_id, instructor_id=g.user_id).all()]
            q = q.filter(Extension.experiment_id.in_(my_exp_ids)) if my_exp_ids else q.filter(db.false())
    rows = q.order_by(Extension.created_at.desc()).limit(200).all()
    return jsonify({'extensions': [r.to_dict() for r in rows]}), 200


@mgmt_bp.route('/extensions', methods=['POST'])
@require_role('instructor', 'institution_admin')
def grant_extension():
    """
    Grant deadline relief for one (student, experiment).
    Body: {student_id, experiment_id, extension_until, reason?, excused?}
    extension_until must be in the future. Existing row for the pair is
    replaced (latest grant wins).
    """
    data = request.get_json() or {}
    student_id = data.get('student_id')
    experiment_id = data.get('experiment_id')

    exp = Experiment.query.filter_by(
        id=experiment_id, institution_id=g.institution_id).first()
    if not exp:
        return jsonify({'error': 'Experiment not found.'}), 404
    if g.role == 'instructor' and exp.instructor_id != g.user_id:
        return jsonify({'error': 'That experiment is not yours.'}), 403

    _, ids = _my_students()
    if student_id not in ids:
        return jsonify({'error': 'That student is not in your sections.'}), 403

    try:
        until = datetime.fromisoformat(str(data.get('extension_until', '')).replace('Z', ''))
    except ValueError:
        return jsonify({'error': 'extension_until is required (ISO datetime)'}), 400
    if until <= datetime.utcnow():
        return jsonify({'error': 'extension_until must be in the future'}), 400

    # Latest grant wins — replace any previous one for the pair
    Extension.query.filter_by(
        student_id=student_id, experiment_id=experiment_id).delete()

    row = Extension(
        institution_id=g.institution_id,
        student_id=student_id,
        experiment_id=experiment_id,
        granted_by=g.user_id,
        reason=(data.get('reason') or '').strip() or None,
        extension_until=until,
        excused=bool(data.get('excused', False)),
    )
    db.session.add(row)
    db.session.commit()

    # Notify the student — relief they don't know about doesn't help
    db.session.add(Notification(
        user_id=student_id,
        type='alert',
        title='Deadline extension granted',
        message=(f'Your deadline for "{exp.title}" was extended to '
                 f'{until.strftime("%d %b %Y, %H:%M")}.'
                 + (f' Reason: {row.reason}' if row.reason else '')),
    ))
    db.session.commit()

    return jsonify({'extension': row.to_dict()}), 201


@mgmt_bp.route('/extensions/<row_id>', methods=['DELETE'])
@require_role('instructor', 'institution_admin')
def revoke_extension(row_id):
    row = Extension.query.filter_by(
        id=row_id, institution_id=g.institution_id).first()
    if not row:
        return jsonify({'error': 'Extension not found.'}), 404
    exp = Experiment.query.get(row.experiment_id)
    if g.role == 'instructor' and exp and exp.instructor_id != g.user_id:
        return jsonify({'error': 'That experiment is not yours.'}), 403
    db.session.delete(row)
    db.session.commit()
    return jsonify({'message': 'Extension revoked.'}), 200
