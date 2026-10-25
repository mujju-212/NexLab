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
import json
from pathlib import Path
from urllib.parse import urlparse

from flask import Blueprint, jsonify, request, g

from app.auth.utils import require_role
from app.extensions import db
from app.models.academic import AuditLog
from app.models.platform_content import PlatformCourse, PlatformExercise, PlatformProgress
from app.models.practice import Problem, PracticeTestCase, PracticeSubmission

admin_content_bp = Blueprint('admin_content', __name__)

_EXERCISE_TYPES = {'coding', 'mcq', 'reading', 'simulation'}
_CONTENT_BLOCK_TYPES = {'markdown', 'text', 'code', 'html', 'image', 'video', 'pdf', 'link'}
_BLOCK_CONTENT_FIELDS = {
    'markdown': 'md', 'text': 'html', 'code': 'code', 'html': 'html',
    'image': 'url', 'video': 'url', 'pdf': 'url', 'link': 'url',
}


def _validate_content_blocks(blocks):
    if blocks is None:
        return None
    if not isinstance(blocks, list) or len(blocks) > 40:
        return 'content_blocks must be an array of at most 40 lesson blocks.'
    try:
        if len(json.dumps(blocks, ensure_ascii=False).encode('utf-8')) > 1_000_000:
            return 'Lesson content is too large (maximum 1 MB).'
    except (TypeError, ValueError):
        return 'content_blocks must contain JSON-compatible values.'
    for index, block in enumerate(blocks, 1):
        if not isinstance(block, dict):
            return f'Lesson block {index} must be an object.'
        kind = block.get('module_type')
        if not isinstance(kind, str) or kind not in _CONTENT_BLOCK_TYPES:
            return f'Lesson block {index} has an unsupported type.'
        block_id = block.get('id')
        if block_id is not None and (not isinstance(block_id, str) or len(block_id) > 100):
            return f'Lesson block {index} id must be short text.'
        title = block.get('title', '')
        data = block.get('content_data', {})
        if not isinstance(title, str) or len(title) > 160:
            return f'Lesson block {index} title must be text up to 160 characters.'
        if not isinstance(data, dict):
            return f'Lesson block {index} content_data must be an object.'
        field = _BLOCK_CONTENT_FIELDS[kind]
        value = data.get(field, '')
        limit = 250_000 if field == 'html' else 120_000
        if not isinstance(value, str) or len(value) > limit:
            return f'Lesson block {index} {field} must be text up to {limit} characters.'
        if kind in {'image', 'video', 'pdf', 'link'} and value.strip():
            parsed = urlparse(value.strip())
            is_local = value.startswith('/') and not value.startswith('//') and '..' not in value.split('/')
            if parsed.scheme not in {'http', 'https'} and not is_local:
                return f'Lesson block {index} URL must be http(s) or a safe local path.'
        if 'language' in data and not isinstance(data['language'], str):
            return f'Lesson block {index} language must be text.'
    return None


def _validate_exercise(exercise):
    """Return a publish-blocking error for incomplete learner-facing content."""
    kind = exercise.exercise_type
    if kind not in _EXERCISE_TYPES:
        return 'Exercise type must be coding, mcq, reading, or simulation.'
    blocks = exercise.content_blocks or []
    invalid_blocks = _validate_content_blocks(blocks)
    if invalid_blocks:
        return invalid_blocks
    for index, block in enumerate(blocks, 1):
        if not (block.get('title') or '').strip():
            return f'Lesson block {index} needs a title before publishing.'
        field = _BLOCK_CONTENT_FIELDS[block['module_type']]
        if not block['content_data'].get(field, '').strip():
            return f'Lesson block {index} needs {field} content before publishing.'
    if kind in ('coding', 'reading') and not (exercise.description or '').strip():
        return 'Add a learner-facing description before publishing.'
    if kind == 'coding':
        cases = exercise.test_cases
        if not isinstance(cases, list) or not cases:
            return 'Coding exercises need at least one test case before publishing.'
        for index, case in enumerate(cases, 1):
            if not isinstance(case, dict) or 'input' not in case or 'expected' not in case:
                return f'Test case {index} must include input and expected values.'
            if not isinstance(case.get('input'), str) or not isinstance(case.get('expected'), str):
                return f'Test case {index} input and expected values must be text.'
        langs = exercise.allowed_languages
        if not isinstance(langs, list) or not langs or not all(isinstance(lang, str) and lang.strip() for lang in langs):
            return 'Choose at least one allowed language.'
    elif kind == 'mcq':
        options = exercise.mcq_options
        if not isinstance(options, list) or not 2 <= len(options) <= 4 or not all(isinstance(x, str) and x.strip() for x in options):
            return 'MCQ exercises need two to four non-empty options.'
        answer = (exercise.mcq_answer or '').strip().upper()
        if answer not in ('A', 'B', 'C', 'D') or ord(answer) - ord('A') >= len(options):
            return 'Choose a correct answer that matches one of the provided options.'
    elif kind == 'simulation':
        path = (exercise.simulation_path or '').strip()
        has_inline_html = any(
            block.get('module_type') == 'html' and
            (block.get('content_data', {}).get('html') or '').strip()
            for block in blocks
        )
        if not path and not has_inline_html:
            return 'Add inline HTML lesson content or choose a local /simulations/... .html file.'
        if path and (not path.startswith('/simulations/') or path == '/simulations/' or
                     '..' in path.split('/') or chr(92) in path or '%' in path or
                     '?' in path or '#' in path or not path.lower().endswith('.html')):
            return 'Simulation exercises need a safe local /simulations/... .html path.'
    return None


def _audit(action, detail, target_type, target_id, severity='medium'):
    db.session.add(AuditLog(
        institution_id=None, actor_id=g.user_id, action=action,
        target_type=target_type, target_id=target_id, detail=detail,
        module='Platform Content', severity=severity))


def _course_row(c, exercise_counts=None, solve_counts=None):
    if exercise_counts is None:
        exercise_counts = dict(db.session.query(
            PlatformExercise.course_id, db.func.count(PlatformExercise.id))
            .filter(PlatformExercise.course_id == c.id)
            .group_by(PlatformExercise.course_id).all())
    if solve_counts is None:
        solve_counts = dict(db.session.query(
            PlatformExercise.course_id, db.func.count(PlatformProgress.id))
            .join(PlatformExercise, PlatformProgress.exercise_id == PlatformExercise.id)
            .filter(PlatformExercise.course_id == c.id, PlatformProgress.status == 'solved')
            .group_by(PlatformExercise.course_id).all())
    return {
        'id': c.id, 'slug': c.slug, 'title': c.title, 'description': c.description,
        'difficulty': c.difficulty, 'language': c.language, 'tags': c.tags or [],
        'is_published': bool(c.is_published), 'order_index': c.order_index,
        'exercise_count': exercise_counts.get(c.id, 0),
        'solves_count': solve_counts.get(c.id, 0),
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
    courses = PlatformCourse.query.order_by(
        PlatformCourse.order_index.asc(), PlatformCourse.created_at.asc(), PlatformCourse.id.asc()
    ).all()
    return jsonify({'courses': [_course_row(c, ex_counts, solve_counts) for c in courses]}), 200


@admin_content_bp.route('/content/courses', methods=['POST'])
@require_role('platform_admin')
def create_course():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'A JSON object is required.'}), 400
    title, slug = data.get('title'), data.get('slug')
    if not isinstance(title, str) or not title.strip() or not isinstance(slug, str) or not slug.strip():
        return jsonify({'error': 'title and slug are required.'}), 400
    title, slug = title.strip(), slug.strip()
    if len(slug) > 80 or not slug.replace('-', '').replace('_', '').isalnum() or any(ch.isspace() for ch in slug):
        return jsonify({'error': 'slug must be at most 80 characters and contain only letters, numbers, hyphens, and underscores.'}), 400
    for field in ('description', 'difficulty', 'language'):
        if field in data and data[field] is not None and not isinstance(data[field], str):
            return jsonify({'error': f'{field} must be text.'}), 400
    difficulty = data.get('difficulty', 'beginner')
    if difficulty not in {'beginner', 'intermediate', 'advanced'}:
        return jsonify({'error': 'difficulty must be beginner, intermediate, or advanced.'}), 400
    if 'language' in data and data['language'] is not None and not data['language'].strip():
        return jsonify({'error': 'language cannot be empty.'}), 400
    tags = data.get('tags', [])
    if not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags):
        return jsonify({'error': 'tags must be an array of text values.'}), 400
    if 'is_published' in data and not isinstance(data['is_published'], bool):
        return jsonify({'error': 'is_published must be a boolean.'}), 400
    if data.get('is_published', False):
        return jsonify({'error': 'Create the course as a draft, add a complete exercise, then publish it.'}), 400
    order_value = data.get('order_index', 0)
    if isinstance(order_value, bool) or not str(order_value).isdigit():
        return jsonify({'error': 'order_index must be a non-negative integer.'}), 400
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
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'A JSON object is required.'}), 400
    nullable_fields = {'description'}
    for field in ('title', 'description', 'difficulty', 'language'):
        if field in data and (data[field] is None and field not in nullable_fields or
                              data[field] is not None and not isinstance(data[field], str)):
            return jsonify({'error': f'{field} must be text.'}), 400
    if 'title' in data and data['title'] is not None and not data['title'].strip():
        return jsonify({'error': 'title cannot be empty.'}), 400
    if 'difficulty' in data and data['difficulty'] not in {'beginner', 'intermediate', 'advanced'}:
        return jsonify({'error': 'difficulty must be beginner, intermediate, or advanced.'}), 400
    if 'language' in data and not data['language'].strip():
        return jsonify({'error': 'language cannot be empty.'}), 400
    if 'tags' in data and data['tags'] is not None and (
        not isinstance(data['tags'], list) or not all(isinstance(tag, str) for tag in data['tags'])
    ):
        return jsonify({'error': 'tags must be an array of text values.'}), 400
    if 'order_index' in data and data['order_index'] is not None and (
        isinstance(data['order_index'], bool) or not str(data['order_index']).isdigit()
    ):
        return jsonify({'error': 'order_index must be a non-negative integer.'}), 400
    if 'is_published' in data and not isinstance(data['is_published'], bool):
        return jsonify({'error': 'is_published must be a boolean.'}), 400
    changed = []
    for field in ('title', 'description', 'difficulty', 'language'):
        if field in data and (data[field] is not None or field == 'description'):
            value = data[field].strip() if field in ('title', 'language') and data[field] is not None else data[field]
            setattr(course, field, value); changed.append(field)
    if 'tags' in data and data['tags'] is not None:
        course.tags = data['tags']; changed.append('tags')
    if 'order_index' in data and data['order_index'] is not None:
        course.order_index = int(data['order_index']); changed.append('order_index')
    if 'is_published' in data:
        if not isinstance(data['is_published'], bool):
            return jsonify({'error': 'is_published must be a boolean.'}), 400
        if data['is_published']:
            published_exercises = PlatformExercise.query.filter_by(
                course_id=course.id, is_published=True).order_by(PlatformExercise.order_index.asc()).all()
            if not published_exercises:
                return jsonify({'error': 'Publish at least one complete exercise before publishing the course.'}), 400
            for exercise in published_exercises:
                invalid = _validate_exercise(exercise)
                if invalid:
                    return jsonify({'error': f'Exercise “{exercise.title}” is incomplete: {invalid}'}), 400
        course.is_published = data['is_published']; changed.append('is_published')
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
        'test_cases': e.test_cases or [],
        'content_blocks': e.content_blocks or [],
        'mcq_options': e.mcq_options,
        'mcq_answer': e.mcq_answer,
        'mcq_explanation': e.mcq_explanation,
        'starter_code': e.starter_code,
        'allowed_languages': e.allowed_languages,
        'simulation_path': e.simulation_path,
        'hint_text': e.hint_text,
    }


@admin_content_bp.route('/content/courses/<course_id>/exercises', methods=['GET'])
@require_role('platform_admin')
def list_exercises(course_id):
    if not PlatformCourse.query.get(course_id):
        return jsonify({'error': 'Course not found.'}), 404
    exs = PlatformExercise.query.filter_by(course_id=course_id) \
        .order_by(PlatformExercise.order_index.asc(), PlatformExercise.created_at.asc(), PlatformExercise.id.asc()).all()
    return jsonify({'exercises': [_ex_row(e) for e in exs]}), 200


@admin_content_bp.route('/content/courses/<course_id>/exercises', methods=['POST'])
@require_role('platform_admin')
def create_exercise(course_id):
    course = PlatformCourse.query.get(course_id)
    if not course:
        return jsonify({'error': 'Course not found.'}), 404
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'A JSON object is required.'}), 400
    title = data.get('title')
    if not isinstance(title, str) or not title.strip():
        return jsonify({'error': 'title is required.'}), 400
    title = title.strip()
    for field in ('description', 'hint_text', 'difficulty', 'mcq_answer', 'mcq_explanation', 'simulation_path'):
        if field in data and data[field] is not None and not isinstance(data[field], str):
            return jsonify({'error': f'{field} must be text.'}), 400
    exercise_type = data.get('exercise_type') or 'coding'
    if exercise_type not in _EXERCISE_TYPES:
        return jsonify({'error': 'exercise_type must be coding, mcq, reading, or simulation.'}), 400
    difficulty = data.get('difficulty') or 'easy'
    if difficulty not in {'easy', 'medium', 'hard'}:
        return jsonify({'error': 'difficulty must be easy, medium, or hard.'}), 400
    for field in ('test_cases', 'allowed_languages', 'mcq_options', 'tags'):
        if field in data and data[field] is not None and not isinstance(data[field], list):
            return jsonify({'error': f'{field} must be an array.'}), 400
    test_cases = data.get('test_cases', [])
    content_blocks = data.get('content_blocks', [])
    block_error = _validate_content_blocks(content_blocks)
    if block_error:
        return jsonify({'error': block_error}), 400
    allowed_languages = data.get('allowed_languages', ['python'])
    if not isinstance(test_cases, list) or not isinstance(allowed_languages, list):
        return jsonify({'error': 'test_cases and allowed_languages must be arrays.'}), 400
    if not all(isinstance(x, str) for x in allowed_languages):
        return jsonify({'error': 'allowed_languages must contain only text values.'}), 400
    if not all(isinstance(x, str) for x in (data.get('mcq_options') or [])):
        return jsonify({'error': 'mcq_options must contain only text values.'}), 400
    if not all(isinstance(x, str) for x in (data.get('tags') or [])):
        return jsonify({'error': 'tags must contain only text values.'}), 400
    if not all(isinstance(tc, dict) and isinstance(tc.get('input'), str) and isinstance(tc.get('expected'), str)
               and ('hidden' not in tc or isinstance(tc['hidden'], bool)) for tc in test_cases):
        return jsonify({'error': 'Each test case must have text input and expected values, with an optional boolean hidden flag.'}), 400
    starter_code = data.get('starter_code')
    if starter_code is not None and (not isinstance(starter_code, dict) or not all(
        isinstance(k, str) and isinstance(v, str) for k, v in starter_code.items()
    )):
        return jsonify({'error': 'starter_code must be an object of language-to-code text values.'}), 400
    if data.get('mcq_answer') not in (None, '', 'A', 'B', 'C', 'D', 'a', 'b', 'c', 'd'):
        return jsonify({'error': 'mcq_answer must be A, B, C, or D.'}), 400
    published = data.get('is_published', False)
    if not isinstance(published, bool):
        return jsonify({'error': 'is_published must be a boolean.'}), 400
    for field in ('xp_reward', 'order_index'):
        value = data.get(field)
        if field in data and value is not None and (isinstance(value, bool) or not str(value).lstrip('-').isdigit()):
            return jsonify({'error': f'{field} must be an integer.'}), 400
    try:
        xp_reward = int(data.get('xp_reward', 10))
        if data.get('order_index') is None:
            last_order = db.session.query(db.func.max(PlatformExercise.order_index)).filter_by(course_id=course_id).scalar()
            order_index = (last_order if last_order is not None else -1) + 1
        else:
            order_index = int(data['order_index'])
    except (TypeError, ValueError):
        return jsonify({'error': 'xp_reward and order_index must be integers.'}), 400
    if not 0 <= xp_reward <= 10000:
        return jsonify({'error': 'xp_reward must be between 0 and 10000.'}), 400
    if order_index < 0:
        return jsonify({'error': 'order_index cannot be negative.'}), 400
    ex = PlatformExercise(
        course_id=course_id, title=title,
        order_index=order_index,
        description=data.get('description'),
        hint_text=data.get('hint_text'),
        exercise_type=exercise_type,
        difficulty=data.get('difficulty') or 'easy',
        xp_reward=xp_reward,
        starter_code=data.get('starter_code'),
        allowed_languages=allowed_languages,
        test_cases=test_cases,
        content_blocks=content_blocks,
        mcq_options=data.get('mcq_options'),
        mcq_answer=(data.get('mcq_answer') or '').upper() or None,
        mcq_explanation=data.get('mcq_explanation'),
        simulation_path=data.get('simulation_path'),
        tags=data.get('tags') or [],
        is_published=published,
    )
    if published:
        invalid = _validate_exercise(ex)
        if invalid:
            return jsonify({'error': invalid}), 400
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
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'A JSON object is required.'}), 400
    string_fields = ('title', 'description', 'hint_text', 'exercise_type', 'difficulty', 'mcq_explanation', 'simulation_path')
    nullable_text_fields = {'description', 'hint_text', 'mcq_explanation', 'simulation_path'}
    for field in string_fields:
        if field in data and (data[field] is None and field not in nullable_text_fields or
                              data[field] is not None and not isinstance(data[field], str)):
            return jsonify({'error': f'{field} must be text.'}), 400
    if 'title' in data and data['title'] is not None and not data['title'].strip():
        return jsonify({'error': 'title cannot be empty.'}), 400
    if 'exercise_type' in data and data['exercise_type'] not in _EXERCISE_TYPES:
        return jsonify({'error': 'exercise_type must be coding, mcq, reading, or simulation.'}), 400
    if 'difficulty' in data and data['difficulty'] not in {'easy', 'medium', 'hard'}:
        return jsonify({'error': 'difficulty must be easy, medium, or hard.'}), 400
    for field in ('allowed_languages', 'test_cases', 'mcq_options', 'tags'):
        if field in data and not isinstance(data[field], list):
            return jsonify({'error': f'{field} must be an array.'}), 400
    if 'allowed_languages' in data and data['allowed_languages'] is not None and not all(isinstance(x, str) for x in data['allowed_languages']):
        return jsonify({'error': 'allowed_languages must contain only text values.'}), 400
    if 'tags' in data and data['tags'] is not None and not all(isinstance(x, str) for x in data['tags']):
        return jsonify({'error': 'tags must contain only text values.'}), 400
    if 'mcq_options' in data and data['mcq_options'] is not None and not all(isinstance(x, str) for x in data['mcq_options']):
        return jsonify({'error': 'mcq_options must contain only text values.'}), 400
    if 'test_cases' in data and data['test_cases'] is not None and not all(
        isinstance(tc, dict) and isinstance(tc.get('input'), str) and isinstance(tc.get('expected'), str)
        and ('hidden' not in tc or isinstance(tc['hidden'], bool)) for tc in data['test_cases']
    ):
        return jsonify({'error': 'Each test case must have text input and expected values, with an optional boolean hidden flag.'}), 400
    if 'content_blocks' in data:
        block_error = _validate_content_blocks(data['content_blocks'])
        if block_error:
            return jsonify({'error': block_error}), 400
    if 'starter_code' in data and (
        not isinstance(data['starter_code'], dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in data['starter_code'].items())
    ):
        return jsonify({'error': 'starter_code must be an object of language-to-code text values.'}), 400
    if 'mcq_answer' in data and data['mcq_answer'] not in (None, '', 'A', 'B', 'C', 'D', 'a', 'b', 'c', 'd'):
        return jsonify({'error': 'mcq_answer must be A, B, C, or D.'}), 400
    if 'is_published' in data and not isinstance(data['is_published'], bool):
        return jsonify({'error': 'is_published must be a boolean.'}), 400
    for field in ('xp_reward', 'order_index'):
        value = data.get(field)
        if field in data and value is not None and (isinstance(value, bool) or not str(value).lstrip('-').isdigit()):
            return jsonify({'error': f'{field} must be an integer.'}), 400
    changed = []
    for field in ('title', 'description', 'hint_text', 'exercise_type', 'difficulty',
                  'starter_code', 'allowed_languages', 'test_cases', 'content_blocks',
                  'mcq_options', 'mcq_explanation', 'simulation_path', 'tags'):
        if field in data and (data[field] is not None or field in nullable_text_fields):
            value = data[field].strip() if field == 'title' and data[field] is not None else data[field]
            setattr(ex, field, value); changed.append(field)
    if 'mcq_answer' in data:
        ex.mcq_answer = str(data['mcq_answer'] or '').upper() or None
        changed.append('mcq_answer')
    for field in ('xp_reward', 'order_index'):
        if field in data and data[field] is not None:
            try:
                value = int(data[field])
            except (TypeError, ValueError):
                return jsonify({'error': f'{field} must be an integer.'}), 400
            if field == 'xp_reward' and not 0 <= value <= 10000:
                return jsonify({'error': 'xp_reward must be between 0 and 10000.'}), 400
            if field == 'order_index' and value < 0:
                return jsonify({'error': 'order_index cannot be negative.'}), 400
            setattr(ex, field, value); changed.append(field)
    if 'is_published' in data:
        if not isinstance(data['is_published'], bool):
            return jsonify({'error': 'is_published must be a boolean.'}), 400
        if ex.is_published and not data['is_published']:
            course = PlatformCourse.query.get(ex.course_id)
            remaining = PlatformExercise.query.filter(
                PlatformExercise.course_id == ex.course_id,
                PlatformExercise.is_published.is_(True),
                PlatformExercise.id != ex.id,
            ).count()
            if course and course.is_published and remaining == 0:
                return jsonify({'error': 'Unpublish the course or publish another exercise before unpublishing this one.'}), 409
        ex.is_published = data['is_published']; changed.append('is_published')
    if ex.is_published:
        invalid = _validate_exercise(ex)
        if invalid:
            return jsonify({'error': invalid}), 400
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
    course = PlatformCourse.query.get(ex.course_id)
    remaining_published = PlatformExercise.query.filter(
        PlatformExercise.course_id == ex.course_id,
        PlatformExercise.is_published.is_(True),
        PlatformExercise.id != ex.id,
    ).count()
    if ex.is_published and course and course.is_published and remaining_published == 0:
        return jsonify({'error': 'Unpublish the course or publish another exercise before deleting its last published exercise.'}), 409
    db.session.delete(ex)
    _audit('admin.content.exercise_delete', f'Deleted exercise {ex.title!r}',
           'exercise', exercise_id, severity='high')
    db.session.commit()
    return jsonify({'deleted': True}), 200


# ── bundled simulation HTML source ─────────────────────────────────────────

_SIMULATION_ROOT = Path(__file__).resolve().parents[3] / 'frontend' / 'public' / 'simulations'


@admin_content_bp.route('/content/simulation-assets', methods=['GET'])
@require_role('platform_admin')
def list_simulation_assets():
    if not _SIMULATION_ROOT.is_dir():
        return jsonify({'assets': []}), 200
    assets = []
    for file_path in sorted(_SIMULATION_ROOT.rglob('*.html')):
        resolved = file_path.resolve()
        if _SIMULATION_ROOT.resolve() not in resolved.parents or not resolved.is_file():
            continue
        relative = resolved.relative_to(_SIMULATION_ROOT.resolve()).as_posix()
        assets.append({'path': f'/simulations/{relative}', 'name': relative})
    return jsonify({'assets': assets}), 200


@admin_content_bp.route('/content/simulation-assets/source', methods=['GET'])
@require_role('platform_admin')
def get_simulation_asset_source():
    raw_path = request.args.get('path', '')
    if (not raw_path.startswith('/simulations/') or raw_path.startswith('//') or
            '..' in raw_path.split('/') or chr(92) in raw_path or '%' in raw_path or
            '?' in raw_path or '#' in raw_path or not raw_path.lower().endswith('.html')):
        return jsonify({'error': 'Choose a safe /simulations/... .html file.'}), 400
    root = _SIMULATION_ROOT.resolve()
    candidate = (root / raw_path[len('/simulations/'):]).resolve()
    if root not in candidate.parents or not candidate.is_file() or candidate.suffix.lower() != '.html':
        return jsonify({'error': 'Simulation file not found.'}), 404
    try:
        if candidate.stat().st_size > 250_000:
            return jsonify({'error': 'This simulation file is too large to import (maximum 250 KB).'}), 413
        html = candidate.read_text(encoding='utf-8')
    except (OSError, UnicodeError):
        return jsonify({'error': 'Simulation source could not be read as UTF-8 text.'}), 400
    return jsonify({'path': raw_path, 'html': html}), 200


# ── problem bank health ────────────────────────────────────────────────────

@admin_content_bp.route('/content/problems', methods=['GET'])
@require_role('platform_admin')
def problem_bank_health():
    """?filter=all|no_tests|disabled|zero_solves&page=&per_page="""
    filt = request.args.get('filter') or 'all'
    if filt not in {'all', 'no_tests', 'disabled', 'zero_solves'}:
        return jsonify({'error': 'filter must be all, no_tests, disabled, or zero_solves.'}), 400
    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(max(1, int(request.args.get('per_page', 25))), 100)
    except (TypeError, ValueError):
        return jsonify({'error': 'page and per_page must be integers.'}), 400

    q = Problem.query
    if filt == 'disabled':
        q = q.filter_by(is_active=False)
    elif filt == 'no_tests':
        q = (q.filter(~Problem.id.in_(db.session.query(PracticeTestCase.problem_id).distinct())))
    elif filt == 'zero_solves':
        q = (q.filter(Problem.is_active.is_(True))
              .filter(~Problem.id.in_(
                  db.session.query(PracticeSubmission.problem_id)
                  .filter(PracticeSubmission.status == 'Accepted',
                          PracticeSubmission.is_run.is_(False)).distinct())))

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
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or 'is_active' not in data:
        return jsonify({'error': 'is_active is required.'}), 400
    if not isinstance(data['is_active'], bool):
        return jsonify({'error': 'is_active must be a boolean.'}), 400
    p.is_active = data['is_active']
    _audit('admin.content.problem_toggle',
           f'{"Enabled" if p.is_active else "Disabled"} problem {p.slug!r}',
           'problem', p.id, severity='medium')
    db.session.commit()
    return jsonify({'problem': {'id': p.id, 'slug': p.slug, 'is_active': p.is_active}}), 200
