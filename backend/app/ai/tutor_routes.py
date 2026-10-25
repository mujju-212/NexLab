"""app/ai/tutor_routes.py — tutor memory API + the save_learning_goal tool."""
from flask import Blueprint, jsonify, request, g

from app.auth.utils import require_role
from app.extensions import db
from app.models.ai_memory import AILearnerMemory

tutor_bp = Blueprint('ai_tutor', __name__)


@tutor_bp.route('/tutor/profile', methods=['GET'])
@require_role('student', 'platform_user')
def get_profile():
    mem = AILearnerMemory.query.filter_by(user_id=g.user_id).first()
    return jsonify({'profile': mem.to_dict() if mem else {
        'user_id': g.user_id, 'goal': None, 'preferred_language': None,
        'tutor_notes': None, 'snapshot_at': None,
    }}), 200


@tutor_bp.route('/tutor/profile', methods=['PATCH'])
@require_role('student', 'platform_user')
def update_profile():
    from app.ai.learner_context import save_learning_goal
    data = request.get_json() or {}
    mem = save_learning_goal(
        g.user_id,
        goal=data.get('goal'),
        preferred_language=data.get('preferred_language'),
    )
    return jsonify({'profile': mem.to_dict()}), 200


# ── harness tool (registered into STUDENT_TOOLS / PLATFORM_USER_TOOLS) ─────

def save_learning_goal_tool(**kwargs):
    """Tool the tutor itself calls to remember the learner's goal/language.
    Executes as the calling user (g.user_id) — the harness never passes an id."""
    from app.ai.learner_context import save_learning_goal
    goal = kwargs.get('goal')
    language = kwargs.get('preferred_language')
    note = kwargs.get('note')
    if not any((goal, language, note)):
        return {'error': 'Provide goal, preferred_language, and/or note.'}
    mem = save_learning_goal(g.user_id, goal=goal, preferred_language=language, note=note)
    return {
        'saved': True,
        'memory': {'goal': mem.goal, 'preferred_language': mem.preferred_language},
    }


SAVE_GOAL_DESC = ('save_learning_goal(goal?, preferred_language?, note?) — Persist the '
                  'learner\'s long-term goal, preferred programming language, or a short '
                  'tutor observation to durable memory. Ask the learner for their goal '
                  'early, save it once, and reference it in later sessions.')
