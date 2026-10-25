"""
app/admin/content.py — Platform Admin: content control (Phase 3).

Gives the orphaned course-management capability a real home, plus problem
bank health. Every mutation is audited; reads never are.

  Courses   : list / create / update / publish / delete (delete blocked while
              learners have progress rows on the course's exercises)
  Exercises : add / update / delete under a course
  Problems  : health list (missing test cases, duplicate sources, disabled)
              + enable/disable
"""
from datetime import datetime

from flask import Blueprint, jsonify, request, g

from app.auth.utils import require_role
from app.extensions import db
from app.models.academic import AuditLog
from app.models.platform_content import PlatformCourse, PlatformExercise, PlatformProgress
from app.models.practice import Problem, PracticeTestCase, PracticeSubmission

admin_content_bp = Blueprint('admin_content', __name__)


def _audit(action, detail, target_type, target_id, severity='medium'):
    db.session.add(AuditLog(
        institution_id=None, actor_id=g.user_id, action=action,
        target_type=target_type, target_id=target_id, detail=detail,
        module='Platform Content', severity=severity))


def _course_row(c, exercise_counts=None, solve_counts=None):
    return {
        'id': c.id, 'slug': c.slug, 'title': c.title, 'description': c.description,
        'difficulty': c.difficulty, 'language': c.language, 'tags': c.tags or [],
        'is_published': bool(c.is_published), 'order_index': c.order_index,
        'exercise_count': (exercise_counts or {}).get(c.id, 0),
        'solves_count': (solve_counts or {}).get(c.id, 0),
        'created_at': c.created_at.isoformat() + 'Z' if c.created_at else None,
    }


def _course_stats():
    ex_counts = dict(db.session.query(
        PlatformExercise.course_id, db.func.count(PlatformExercise.id))
        .group_by(PlatformExercise.course_id).all())
    solve_counts = dict(db.session.query(
        PlatformExercise.course_id, db.func.count(PlatformProgress.id))
        .join(PlatformExercise, PlatformProgress.exercise_id == PlatformExercise.id)
        .filter(PlatformProgress.status == 'solved')
        .group_by(PlatformExercise.course_id).all())
    return ex_counts, solve_counts


# ── courses ────────────────────────────────────────────────────────────────

@admin_content_bp.route('/content/courses', methods=['GET'])
@require_role('platform_admin')
def list_courses():
    ex_counts, solve_counts = _course_stats()
    courses = PlatformCourse.query.order_by(PlatformCourse.order_index.asc()).all()
    return jsonify({'courses': [_course_row(c, ex_counts, solve_counts) for c in courses]}), 200


@admin_content_bp.route('/content/courses', methods=['POST'])
@require_role('platform_admin')
def create_course():
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    slug = (data.get('slug') or '').strip()
    if not title or not slug:
        return jsonify({'error': 'title and slug are required.'}), 400
    if PlatformCourse.query.filter_by(slug=slug).first():
        return jsonify({'error': 'Slug already exists.'}), 409
    course = PlatformCourse(
        slug=slug, title=title, description=data.get('description'),
        difficulty=data.get('difficulty', 'beginner'), tags=data.get('tags') or [],
        language=data.get('language', 'python'), order_index=int(data.get('order_index') or 0),
        is_published=bool(data.get('is_published', False)),
    )
    db.session.add(course)
    db.session.flush()
    _audit('admin.content.course_create', f'Created platform course {title!r} ({slug})',
           'course', course.id)
    db.session.commit()
    return jsonify({'course': _course_row(course)}), 201


@admin_content_bp.route('/content/courses/<course_id>', methods=['PATCH'])
@require_role('platform_admin')
def update_course(course_id):
    course = PlatformCourse.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found.'}), 404
    data = request.get_json() or {}
    changed = []
    for field in ('title', 'description', 'difficulty', 'language'):
        if field in data and data[field] is not None:
            setattr(course, field, data[field]); changed.append(field)
    if 'tags' in data and data['tags'] is not None:
        course.tags = data['tags']; changed.append('tags')
    if 'order_index' in data and data['order_index'] is not None:
        course.order_index = int(data['order_index']); changed.append('order_index')
    if 'is_published' in data:
        if data['is_published'] and not course.is_published:
            if not PlatformExercise.query.filter_by(course_id=course.id).count():
                return jsonify({'error': 'Add at least one exercise before publishing.'}), 400
        course.is_published = bool(data['is_published']); changed.append('is_published')
    if not changed:
        return jsonify({'error': 'Nothing to update.'}), 400
    _audit('admin.content.course_update',
           f'Updated course {course.slug!r}: {", ".join(changed)}', 'course', course.id)
    db.session.commit()
    return jsonify({'course': _course_row(course)}), 200


@admin_content_bp.route('/content/courses/<course_id>', methods=['DELETE'])
@require_role('platform_admin')
def delete_course(course_id):
    course = PlatformCourse.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found.'}), 404
    ex_ids = [e.id for e in PlatformExercise.query.filter_by(course_id=course.id).all()]
    progress = PlatformProgress.query.filter(
        PlatformProgress.exercise_id.in_(ex_ids)).count() if ex_ids else 0
    if progress > 0:
        return jsonify({
            'error': f'Cannot delete: {progress} learner progress row(s) reference this course. '
                     'Unpublish it instead.',
        }), 409
    PlatformExercise.query.filter_by(course_id=course.id).delete(synchronize_session=False)
    db.session.delete(course)
    _audit('admin.content.course_delete', f'Deleted platform course {course.slug!r}',
           'course', course_id, severity='high')
    db.session.commit()
    return jsonify({'deleted': True}), 200


# ── exercises ──────────────────────────────────────────────────────────────

def _ex_row(e):
    return {
        'id': e.id, 'course_id': e.course_id, 'order_index': e.order_index,
        'title': e.title, 'description': e.description, 'exercise_type': e.exercise_type,
        'difficulty': e.difficulty, 'xp_reward': e.xp_reward,
        'tags': e.tags or [], 'solves_count': e.solves_count or 0,
        'is_published': bool(e.is_published),
        'test_case_count': len(e.test_cases or []),
        'mcq_options': e.mcq_options, 'starter_code': e.starter_code,
        'allowed_languages': e.allowed_languages,
    }


@admin_content_bp.route('/content/courses/<course_id>/exercises', methods=['GET'])
@require_role('platform_admin')
def list_exercises(course_id):
    if not PlatformCourse.query.get(course_id):
        return jsonify({'error': 'Course not found.'}), 404
    exs = PlatformExercise.query.filter_by(course_id=course_id) \
        .order_by(PlatformExercise.order_index.asc()).all()
    return jsonify({'exercises': [_ex_row(e) for e in exs]}), 200


@admin_content_bp.route('/content/courses/<course_id>/exercises', methods=['POST'])
@require_role('platform_admin')
def create_exercise(course_id):
    course = PlatformCourse.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found.'}), 404
    data = request.get_json() or {}
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'title is required.'}), 400
    ex = PlatformExercise(
        course_id=course_id, title=title,
        order_index=int(data.get('order_index') or 0),
        description=data.get('description'),
        exercise_type=data.get('exercise_type') or 'coding',
        difficulty=data.get('difficulty') or 'easy',
        xp_reward=int(data.get('xp_reward') or 10),
        starter_code=data.get('starter_code'),
        allowed_languages=data.get('allowed_languages') or ['python'],
        test_cases=data.get('test_cases') or [],
        mcq_options=data.get('mcq_options'),
        mcq_answer=(data.get('mcq_answer') or '').upper() or None,
        mcq_explanation=data.get('mcq_explanation'),
        tags=data.get('tags') or [],
        is_published=bool(data.get('is_published', True)),
    )
    db.session.add(ex)
    db.session.flush()
    _audit('admin.content.exercise_create',
           f'Added exercise {title!r} to course {course.slug!r}', 'exercise', ex.id)
    db.session.commit()
    return jsonify({'exercise': _ex_row(ex)}), 201


@admin_content_bp.route('/content/exercises/<exercise_id>', methods=['PATCH'])
@require_role('platform_admin')
def update_exercise(exercise_id):
    ex = PlatformExercise.query.get(exercise_id)
    if not ex:
        return jsonify({'error': 'Exercise not found.'}), 404
    data = request.get_json() or {}
    changed = []
    for field in ('title', 'description', 'exercise_type', 'difficulty',
                  'starter_code', 'allowed_languages', 'test_cases',
                  'mcq_options', 'mcq_explanation', 'tags'):
        if field in data and data[field] is not None:
            setattr(ex, field, data[field]); changed.append(field)
    if 'mcq_answer' in data and data['mcq_answer']:
        ex.mcq_answer = str(data['mcq_answer']).upper(); changed.append('mcq_answer')
    for field in ('xp_reward', 'order_index'):
        if field in data and data[field] is not None:
            setattr(ex, field, int(data[field])); changed.append(field)
    if 'is_published' in data:
        ex.is_published = bool(data['is_published']); changed.append('is_published')
    if not changed:
        return jsonify({'error': 'Nothing to update.'}), 400
    _audit('admin.content.exercise_update',
           f'Updated exercise {ex.title!r}: {", ".join(changed)}', 'exercise', ex.id)
    db.session.commit()
    return jsonify({'exercise': _ex_row(ex)}), 200


@admin_content_bp.route('/content/exercises/<exercise_id>', methods=['DELETE'])
@require_role('platform_admin')
def delete_exercise(exercise_id):
    ex = PlatformExercise.query.get(exercise_id)
    if not ex:
        return jsonify({'error': 'Exercise not found.'}), 404
    progress = PlatformProgress.query.filter_by(exercise_id=exercise_id).count()
    if progress > 0:
        return jsonify({
            'error': f'Cannot delete: {progress} learner progress row(s) reference this exercise.',
        }), 409
    db.session.delete(ex)
    _audit('admin.content.exercise_delete', f'Deleted exercise {ex.title!r}',
           'exercise', exercise_id, severity='high')
    db.session.commit()
    return jsonify({'deleted': True}), 200


# ── problem bank health ────────────────────────────────────────────────────

@admin_content_bp.route('/content/problems', methods=['GET'])
@require_role('platform_admin')
def problem_bank_health():
    """?filter=all|no_tests|disabled|zero_solves&page=&per_page="""
    filt = (request.args.get('filter') or 'all')
    page = max(1, int(request.args.get('page', 1)))
    per_page = min(int(request.args.get('per_page', 25)), 100)

    q = Problem.query
    if filt == 'disabled':
        q = q.filter_by(is_active=False)
    elif filt == 'no_tests':
        q = (q.filter(~Problem.id.in_(db.session.query(PracticeTestCase.problem_id).distinct())))
    elif filt == 'zero_solves':
        q = (q.filter(Problem.is_active.is_(True))
              .filter(~Problem.id.in_(
                  db.session.query(PracticeSubmission.problem_id)
                  .filter(PracticeSubmission.status == 'Accepted').distinct())))

    total = q.count()
    rows = q.order_by(Problem.created_at.desc()) \
            .paginate(page=page, per_page=per_page, error_out=False).items

    # summary counts for the filter badges
    no_tests = db.session.query(Problem.id).filter(~Problem.id.in_(
        db.session.query(PracticeTestCase.problem_id).distinct())).count()
    disabled = Problem.query.filter_by(is_active=False).count()

    def _row(p):
        return {
            'id': p.id, 'slug': p.slug, 'lc_id': p.lc_id, 'title': p.title,
            'difficulty': p.difficulty, 'nexlab_topic': p.nexlab_topic,
            'is_active': bool(p.is_active), 'acceptance': p.acceptance,
        }
    return jsonify({
        'filter': filt, 'total': total, 'page': page,
        'pages': max(1, -(-total // per_page)),
        'summary': {'no_test_cases': no_tests, 'disabled': disabled,
                    'total': Problem.query.count()},
        'problems': [_row(p) for p in rows],
    }), 200


@admin_content_bp.route('/content/problems/<problem_id>', methods=['PATCH'])
@require_role('platform_admin')
def toggle_problem(problem_id):
    p = Problem.query.get(problem_id)
    if not p:
        return jsonify({'error': 'Problem not found.'}), 404
    data = request.get_json() or {}
    if 'is_active' not in data:
        return jsonify({'error': 'is_active is required.'}), 400
    p.is_active = bool(data['is_active'])
    _audit('admin.content.problem_toggle',
           f'{"Enabled" if p.is_active else "Disabled"} problem {p.slug!r}',
           'problem', p.id, severity='medium')
    db.session.commit()
    return jsonify({'problem': {'id': p.id, 'slug': p.slug, 'is_active': p.is_active}}), 200
