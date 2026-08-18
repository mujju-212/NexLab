"""
Instructor — Pre-lab Content Module Management
Routes for creating/editing content sections
(text, markdown, code, image, video, pdf, quiz) that students must complete
before entering a live session.
"""
from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.experiment import (
    Experiment, ContentModule, QuizQuestion, ContentProgress
)
from sqlalchemy import func

content_bp = Blueprint('instructor_content', __name__)


# ══════════════════════════════════════════════════════════════════
# CONTENT MODULES — CRUD
# ══════════════════════════════════════════════════════════════════

@content_bp.route('/experiments/<exp_id>/content', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_content(exp_id):
    """List all content modules for an experiment (ordered)."""
    exp = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()

    modules = ContentModule.query.filter_by(
        experiment_id=exp.id
    ).order_by(ContentModule.display_order).all()

    result = []
    for m in modules:
        d = _module_dict(m)
        if m.module_type == 'quiz':
            d['question_count'] = QuizQuestion.query.filter_by(module_id=m.id).count()
        result.append(d)

    return jsonify({'content_modules': result, 'count': len(result)}), 200


@content_bp.route('/experiments/<exp_id>/content', methods=['POST'])
@require_role('instructor', 'institution_admin')
def add_content_module(exp_id):
    """
    Add a content module to an experiment.
    Body: {
      "module_type": "text"|"video"|"pdf"|"quiz"|"markdown"|"code"|"image",
      "title": "...",
      "content_data": { ... },   ← type-specific
      "display_order": 1,        ← optional, auto-assigned if missing
      "min_watch_pct": 80        ← video only
    }

    content_data shapes:
      text:     {"html": "<p>...</p>"}
      markdown: {"md": "# heading\n..."}            ← rendered client-side
      code:     {"language": "python", "code": "...",
                 "runnable": true, "stdin": ""}     ← runnable via /execution/playground
      image:    {"url": "https://...", "alt": "...", "caption": "..."}
      video:    {"url": "https://youtube.com/...", "duration_sec": 300}
      pdf:      {"url": "https://cloudinary.com/...", "pages": 12}
      quiz:     {"pass_threshold": 70, "max_attempts": 3,
                 "cooldown_minutes": 30, "shuffle": true}

    NOTE: module_type is a VARCHAR(10) column — keep new type names ≤10 chars.
    """
    exp = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()

    data = request.get_json() or {}
    module_type = data.get('module_type')
    _ALLOWED = ('text', 'video', 'pdf', 'quiz', 'markdown', 'code', 'image')
    if module_type not in _ALLOWED:
        return jsonify({'error': f'module_type must be one of: {", ".join(_ALLOWED)}'}), 400

    # Auto display_order — append to end
    max_order = db.session.query(
        func.max(ContentModule.display_order)
    ).filter_by(experiment_id=exp_id).scalar() or 0

    module = ContentModule(
        experiment_id=exp_id,
        module_type=module_type,
        title=data.get('title', f'Module {max_order + 1}'),
        content_data=data.get('content_data', {}),
        display_order=data.get('display_order', max_order + 1),
        min_watch_pct=data.get('min_watch_pct', 80),
    )
    db.session.add(module)
    db.session.commit()
    return jsonify({'module': _module_dict(module)}), 201


@content_bp.route('/experiments/<exp_id>/content/<module_id>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def update_content_module(exp_id, module_id):
    """Update title, content_data, or min_watch_pct of a module."""
    module = ContentModule.query.filter_by(
        id=module_id, experiment_id=exp_id
    ).first_or_404()

    data = request.get_json() or {}
    for field in ('title', 'content_data', 'min_watch_pct'):
        if field in data:
            setattr(module, field, data[field])

    db.session.commit()
    return jsonify({'module': _module_dict(module)}), 200


@content_bp.route('/experiments/<exp_id>/content/<module_id>', methods=['DELETE'])
@require_role('instructor', 'institution_admin')
def delete_content_module(exp_id, module_id):
    """Delete a content module (cascades quiz questions)."""
    module = ContentModule.query.filter_by(
        id=module_id, experiment_id=exp_id
    ).first_or_404()

    # Remove all quiz questions
    QuizQuestion.query.filter_by(module_id=module_id).delete()
    db.session.delete(module)
    db.session.commit()
    return jsonify({'message': 'Module deleted'}), 200


@content_bp.route('/experiments/<exp_id>/content/reorder', methods=['POST'])
@require_role('instructor', 'institution_admin')
def reorder_content(exp_id):
    """
    Reorder modules.
    Body: {"order": ["module_id_1", "module_id_2", ...]}
    """
    data = request.get_json() or {}
    order = data.get('order', [])
    if not order:
        return jsonify({'error': 'order list is required'}), 400

    for idx, module_id in enumerate(order, start=1):
        ContentModule.query.filter_by(
            id=module_id, experiment_id=exp_id
        ).update({'display_order': idx})

    db.session.commit()
    return jsonify({'message': 'Reordered', 'count': len(order)}), 200


# ══════════════════════════════════════════════════════════════════
# QUIZ QUESTIONS — CRUD
# ══════════════════════════════════════════════════════════════════

@content_bp.route('/content/<module_id>/questions', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_questions(module_id):
    """List all quiz questions for a module."""
    module = ContentModule.query.get_or_404(module_id)
    if module.module_type != 'quiz':
        return jsonify({'error': 'Not a quiz module'}), 400

    questions = QuizQuestion.query.filter_by(module_id=module_id).all()
    return jsonify({'questions': [_question_dict(q) for q in questions]}), 200


@content_bp.route('/content/<module_id>/questions', methods=['POST'])
@require_role('instructor', 'institution_admin')
def add_questions(module_id):
    """
    Add one or more questions to a quiz module.
    Body: single object OR list of:
    {
      "question_text": "...",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "B",
      "points": 1,
      "explanation": "..."
    }
    """
    module = ContentModule.query.get_or_404(module_id)
    if module.module_type != 'quiz':
        return jsonify({'error': 'Not a quiz module'}), 400

    data = request.get_json() or {}
    items = data if isinstance(data, list) else [data]

    created = []
    for item in items:
        if not item.get('question_text') or not item.get('options') or not item.get('correct_answer'):
            return jsonify({'error': 'question_text, options, and correct_answer are required'}), 400
        if len(item['options']) != 4:
            return jsonify({'error': 'Exactly 4 options required'}), 400
        if item['correct_answer'] not in ('A', 'B', 'C', 'D'):
            return jsonify({'error': 'correct_answer must be A, B, C, or D'}), 400

        q = QuizQuestion(
            module_id=module_id,
            question_text=item['question_text'],
            options=item['options'],
            correct_answer=item['correct_answer'],
            points=item.get('points', 1),
            explanation=item.get('explanation'),
        )
        db.session.add(q)
        created.append(q)

    db.session.commit()
    return jsonify({
        'created': len(created),
        'questions': [_question_dict(q) for q in created],
    }), 201


@content_bp.route('/content/questions/<question_id>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def update_question(question_id):
    """Update a quiz question."""
    q = QuizQuestion.query.get_or_404(question_id)
    data = request.get_json() or {}
    for field in ('question_text', 'options', 'correct_answer', 'points', 'explanation'):
        if field in data:
            setattr(q, field, data[field])
    db.session.commit()
    return jsonify({'question': _question_dict(q)}), 200


@content_bp.route('/content/questions/<question_id>', methods=['DELETE'])
@require_role('instructor', 'institution_admin')
def delete_question(question_id):
    """Delete a quiz question."""
    q = QuizQuestion.query.get_or_404(question_id)
    db.session.delete(q)
    db.session.commit()
    return jsonify({'message': 'Question deleted'}), 200


# ══════════════════════════════════════════════════════════════════
# QUIZ CONFIG (pass threshold, attempts, cooldown, shuffle)
# ══════════════════════════════════════════════════════════════════

@content_bp.route('/content/<module_id>/quiz-config', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def update_quiz_config(module_id):
    """
    Update quiz strictness settings stored in content_data.
    Body: {"pass_threshold": 70, "max_attempts": 3,
           "cooldown_minutes": 30, "shuffle": true}
    """
    module = ContentModule.query.get_or_404(module_id)
    if module.module_type != 'quiz':
        return jsonify({'error': 'Not a quiz module'}), 400

    data = request.get_json() or {}
    cfg = dict(module.content_data or {})  # copy so SQLAlchemy detects mutation

    for key in ('pass_threshold', 'max_attempts', 'cooldown_minutes', 'shuffle'):
        if key in data:
            cfg[key] = data[key]

    # Validate
    if cfg.get('pass_threshold', 70) < 0 or cfg.get('pass_threshold', 70) > 100:
        return jsonify({'error': 'pass_threshold must be 0–100'}), 400
    if cfg.get('max_attempts', 3) < 1:
        return jsonify({'error': 'max_attempts must be >= 1'}), 400

    module.content_data = cfg
    db.session.commit()
    return jsonify({'module': _module_dict(module)}), 200


# ══════════════════════════════════════════════════════════════════
# STUDENT PROGRESS (instructor view — how many completed pre-lab)
# ══════════════════════════════════════════════════════════════════

@content_bp.route('/experiments/<exp_id>/content/progress-summary', methods=['GET'])
@require_role('instructor', 'institution_admin')
def content_progress_summary(exp_id):
    """
    Per-module completion count — how many students completed each module.
    Useful to see if students are ready for the live session.
    """
    modules = ContentModule.query.filter_by(
        experiment_id=exp_id
    ).order_by(ContentModule.display_order).all()

    result = []
    for m in modules:
        completed_count = ContentProgress.query.filter_by(
            module_id=m.id, completed=True
        ).count()
        result.append({
            'module_id': m.id,
            'title': m.title,
            'module_type': m.module_type,
            'completed_by': completed_count,
        })

    return jsonify({'modules': result}), 200


# ══════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════

def _module_dict(m):
    return {
        'id': m.id,
        'module_type': m.module_type,
        'title': m.title,
        'content_data': m.content_data,
        'display_order': m.display_order,
        'min_watch_pct': m.min_watch_pct,
    }


def _question_dict(q):
    return {
        'id': q.id,
        'module_id': q.module_id,
        'question_text': q.question_text,
        'options': q.options,
        'correct_answer': q.correct_answer,
        'points': q.points,
        'explanation': q.explanation,
    }
