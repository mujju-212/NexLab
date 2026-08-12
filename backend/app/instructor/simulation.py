"""
Instructor — Simulation Upload & Serve
Instructors upload custom HTML simulations (single or multi-file zip).
These render in a resizable iframe panel inside the student's session.
"""
import os, uuid, zipfile, json
from flask import Blueprint, request, jsonify, g, send_from_directory, current_app
from werkzeug.utils import secure_filename
from app.auth.utils import require_role
from app.extensions import db
from app.models.experiment import Experiment

simulation_bp = Blueprint('instructor_simulation', __name__)

ALLOWED_EXTENSIONS = {'html', 'css', 'js', 'png', 'jpg', 'svg', 'zip'}
SIMULATION_DIR     = os.path.join(os.path.dirname(__file__), '..', '..', 'simulations')


def _sim_dir(exp_id: str) -> str:
    path = os.path.join(SIMULATION_DIR, exp_id)
    os.makedirs(path, exist_ok=True)
    return path


def _allowed(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# ══════════════════════════════════════════════════════════════════
# UPLOAD AI PROMPT
# ══════════════════════════════════════════════════════════════════

@simulation_bp.route('/experiments/<exp_id>/simulation/prompt', methods=['GET'])
@require_role('instructor', 'institution_admin')
def get_simulation_prompt(exp_id):
    """
    Returns the pre-written AI prompt that instructors paste into
    ChatGPT/Claude to get a simulation HTML that fits the platform's
    iframe panel (600×400, self-contained, no external deps).
    """
    exp = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()

    prompt = f"""You are creating a standalone educational simulation for a virtual lab platform.

Experiment: {exp.title}
Problem: {exp.problem_statement or exp.aim or 'General programming experiment'}

REQUIREMENTS (follow exactly):
1. Output a SINGLE self-contained HTML file (or a zip of HTML + CSS + JS)
2. All CSS and JavaScript must be INLINE or in the same zip — NO external CDN links
3. Target viewport: 600px wide × 400px tall — design for this size
4. Must work in an iframe (no window.top access, no alerts/confirm dialogs)
5. Use only vanilla HTML/CSS/JavaScript — NO React, Vue, Angular
6. The simulation must visually demonstrate the experiment concept
7. Include interactive elements if possible (buttons, sliders, step-through)
8. Background color: #0f0f23 (dark), text color: #e2e8f0 (light)
9. Primary accent color: #6366f1 (indigo)
10. If multi-file: include an index.html as the entry point

Upload the output to the platform's simulation uploader.
The simulation will auto-resize to fill the available panel."""

    return jsonify({
        'experiment_title': exp.title,
        'prompt': prompt,
        'instructions': (
            'Copy the prompt above, paste into ChatGPT or Claude, '
            'then upload the returned HTML file (or zip) below.'
        ),
    }), 200


# ══════════════════════════════════════════════════════════════════
# UPLOAD SIMULATION
# ══════════════════════════════════════════════════════════════════

@simulation_bp.route('/experiments/<exp_id>/simulation/upload', methods=['POST'])
@require_role('instructor', 'institution_admin')
def upload_simulation(exp_id):
    """
    Upload a simulation file.
    Accepts: single .html file OR .zip archive.
    The zip must contain index.html at root.
    """
    exp = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'Empty filename'}), 400

    if not _allowed(file.filename):
        return jsonify({'error': f'Only {ALLOWED_EXTENSIONS} are allowed'}), 400

    sim_dir = _sim_dir(exp_id)
    filename = secure_filename(file.filename)
    ext      = filename.rsplit('.', 1)[1].lower()

    # Clear any previous simulation
    for f in os.listdir(sim_dir):
        os.remove(os.path.join(sim_dir, f))

    if ext == 'zip':
        # Extract zip
        zip_path = os.path.join(sim_dir, filename)
        file.save(zip_path)
        with zipfile.ZipFile(zip_path, 'r') as zf:
            # Security: only allow safe extensions inside zip
            for member in zf.namelist():
                member_ext = member.rsplit('.', 1)[-1].lower() if '.' in member else ''
                if member_ext not in ALLOWED_EXTENSIONS:
                    return jsonify({'error': f'Zip contains disallowed file: {member}'}), 400
            zf.extractall(sim_dir)
        os.remove(zip_path)

        # Verify index.html exists
        if not os.path.exists(os.path.join(sim_dir, 'index.html')):
            return jsonify({'error': 'Zip must contain index.html at root'}), 400

        entry = 'index.html'
        files_extracted = os.listdir(sim_dir)
    else:
        # Single HTML file — save as index.html always
        file.save(os.path.join(sim_dir, 'index.html'))
        entry  = 'index.html'
        files_extracted = ['index.html']

    # Save simulation metadata on the experiment
    exp.simulation_entry  = entry
    exp.simulation_files  = json.dumps(files_extracted)
    db.session.commit()

    return jsonify({
        'message':         'Simulation uploaded successfully',
        'entry_point':     entry,
        'files_extracted': files_extracted,
        'preview_url':     f'/api/instructor/experiments/{exp_id}/simulation/preview',
    }), 201


# ══════════════════════════════════════════════════════════════════
# SERVE / PREVIEW
# ══════════════════════════════════════════════════════════════════

@simulation_bp.route('/experiments/<exp_id>/simulation/preview', methods=['GET'])
@require_role('instructor', 'institution_admin')
def preview_simulation(exp_id):
    """Serve the simulation's index.html for instructor preview."""
    sim_dir = _sim_dir(exp_id)
    if not os.path.exists(os.path.join(sim_dir, 'index.html')):
        return jsonify({'error': 'No simulation uploaded for this experiment'}), 404
    return send_from_directory(sim_dir, 'index.html')


@simulation_bp.route('/experiments/<exp_id>/simulation/asset/<path:filename>', methods=['GET'])
def serve_simulation_asset(exp_id, filename):
    """Serve simulation assets (CSS, JS, images). Public — no auth needed for iframe."""
    sim_dir = _sim_dir(exp_id)
    safe    = secure_filename(filename)
    if not os.path.exists(os.path.join(sim_dir, safe)):
        return jsonify({'error': 'Asset not found'}), 404
    return send_from_directory(sim_dir, safe)


@simulation_bp.route('/experiments/<exp_id>/simulation', methods=['GET'])
@require_role('instructor', 'institution_admin')
def simulation_info(exp_id):
    """Get simulation status for an experiment."""
    exp     = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()
    sim_dir = _sim_dir(exp_id)
    has_sim = os.path.exists(os.path.join(sim_dir, 'index.html'))

    return jsonify({
        'has_simulation':  has_sim,
        'entry_point':     exp.simulation_entry if has_sim else None,
        'files':           json.loads(exp.simulation_files) if exp.simulation_files else [],
        'preview_url':     f'/api/instructor/experiments/{exp_id}/simulation/preview' if has_sim else None,
    }), 200


@simulation_bp.route('/experiments/<exp_id>/simulation', methods=['DELETE'])
@require_role('instructor', 'institution_admin')
def delete_simulation(exp_id):
    """Remove uploaded simulation."""
    exp     = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()
    sim_dir = _sim_dir(exp_id)

    for f in os.listdir(sim_dir):
        os.remove(os.path.join(sim_dir, f))

    exp.simulation_entry = None
    exp.simulation_files = None
    db.session.commit()
    return jsonify({'message': 'Simulation deleted'}), 200
