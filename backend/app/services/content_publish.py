"""
Content Publishing — staged draft -> republish snapshot service.

The instructor's live ContentPage / ContentModule / QuizQuestion rows are their
working *draft*. When they Publish or Republish, we freeze a self-contained
snapshot of that tree onto `Experiment.published_content`. Students read ONLY
the snapshot, so edits stay invisible until the instructor explicitly republishes.

Snapshot shape:
{
  "published_at": "<iso-z>",
  "pages":   [ {id, title, display_order, is_live, release_at(iso|null)} ],
  "modules": [ {id, page_id, type, title, display_order, min_watch_pct, content_data,
                questions?: [ {id, question_text, options, correct_answer, points, explanation} ],
                test_cases?: [ {input, expected, hidden, weight, tc_id, description?} ] } ]
}

ORM row IDs are preserved inside the snapshot so ContentProgress (keyed by
module_id) and per-question analytics stay stable across republishes.
"""
from datetime import datetime

from app.extensions import db
from app.models.experiment import (
    Experiment, ContentPage, ContentModule, QuizQuestion, TestCase, _iso_z,
)


def _serialize_page(p):
    return {
        'id': p.id,
        'title': p.title,
        'display_order': p.display_order,
        'is_live': bool(p.is_live),
        'release_at': p.release_at.isoformat() if p.release_at else None,
    }


def _resolve_test_cases(exp, module):
    """Effective test cases for an 'assign' module, resolved at publish time.

    Prefer the experiment's official TestCase table rows (source of truth);
    fall back to test cases embedded in the module's content_data.
    """
    official = TestCase.query.filter_by(experiment_id=exp.id).all() if exp else []
    cases = []
    if official:
        for tc in official:
            row = {
                'input': tc.input_data or '',
                'expected': tc.expected_output or '',
                'hidden': bool(tc.is_hidden),
                'weight': tc.points_weight or 1,
                'tc_id': tc.id,
            }
            if not tc.is_hidden and tc.description:
                row['description'] = tc.description
            cases.append(row)
    else:
        cfg = module.content_data or {}
        for tc in (cfg.get('test_cases') or []):
            if isinstance(tc, dict):
                cases.append({
                    'input': tc.get('input', ''),
                    'expected': tc.get('expected', ''),
                    'hidden': bool(tc.get('hidden')),
                    'weight': tc.get('weight', 1) or 1,
                    'tc_id': tc.get('tc_id'),
                    'description': tc.get('description'),
                })
    return cases


def serialize_experiment_content(exp):
    """Freeze the live content tree of `exp` into a JSON-serializable snapshot."""
    pages = ContentPage.query.filter_by(experiment_id=exp.id)\
        .order_by(ContentPage.display_order, ContentPage.created_at).all()

    modules = ContentModule.query.filter_by(experiment_id=exp.id)\
        .order_by(ContentModule.display_order).all()

    modules_out = []
    for m in modules:
        entry = {
            'id': m.id,
            'page_id': m.page_id,
            'type': m.module_type,
            'title': m.title,
            'display_order': m.display_order,
            'min_watch_pct': m.min_watch_pct,
            'content_data': m.content_data or {},
        }
        if m.module_type == 'quiz':
            qs = QuizQuestion.query.filter_by(module_id=m.id).all()
            entry['questions'] = [{
                'id': q.id,
                'question_text': q.question_text,
                'options': q.options,
                'correct_answer': q.correct_answer,
                'points': q.points,
                'explanation': q.explanation,
            } for q in qs]
        elif m.module_type == 'assign':
            entry['test_cases'] = _resolve_test_cases(exp, m)
        modules_out.append(entry)

    return {
        'published_at': _iso_z(datetime.utcnow()),
        'pages': [_serialize_page(p) for p in pages],
        'modules': modules_out,
    }


def publish_experiment_content(exp, commit=True):
    """Snapshot the live content tree onto the experiment and clear the dirty flag.

    Used for both the first Publish and every Republish. Sets is_published=True.
    """
    exp.published_content = serialize_experiment_content(exp)
    exp.content_published_at = datetime.utcnow()
    exp.content_dirty = False
    exp.is_published = True
    if commit:
        db.session.commit()
    return exp


def mark_content_dirty(exp_id, commit=True):
    """Flag that live edits exist which are not yet in the published snapshot.

    Only meaningful once an experiment has been published at least once — a
    still-draft experiment shows no 'unpublished changes' badge.
    """
    exp = db.session.get(Experiment, exp_id) if hasattr(db.session, 'get') \
        else Experiment.query.get(exp_id)
    if exp is None or not exp.is_published:
        return
    if not exp.content_dirty:
        exp.content_dirty = True
        if commit:
            db.session.commit()


# ── Snapshot read helpers (used by the student blueprint) ──────────────────────

def get_published_module(snapshot, module_id):
    """Return the snapshot module dict with the given id, or None."""
    if not snapshot:
        return None
    for m in snapshot.get('modules', []) or []:
        if m.get('id') == module_id:
            return m
    return None


def resolve_published_snapshot(exp):
    """Return the published snapshot for a published experiment.

    Lazily backfills legacy experiments that were published before snapshots
    existed (so there is no regression for already-live content). Returns None
    when the experiment is not published — the caller then falls back to reading
    the live rows (needed for the conductor 'launch unpublished quiz live' flow).
    """
    if exp is None or not exp.is_published:
        return None
    if exp.published_content is None:
        publish_experiment_content(exp)   # lazy backfill + commit
    return exp.published_content


def _parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace('Z', '+00:00')).replace(tzinfo=None)
    except Exception:
        return None


class SnapshotPage:
    """Read-only stand-in for ContentPage built from a snapshot dict. Exposes the
    same attributes/method the student read path already uses."""
    def __init__(self, d):
        self.id = d['id']
        self.title = d.get('title')
        self.display_order = d.get('display_order', 0)
        self.is_live = bool(d.get('is_live'))
        self.release_at = _parse_dt(d.get('release_at'))

    def is_visible_to_students(self):
        if self.is_live:
            return True
        if self.release_at is not None and datetime.utcnow() >= self.release_at:
            return True
        return False


class SnapshotModule:
    """Read-only stand-in for ContentModule built from a snapshot dict."""
    def __init__(self, d):
        self.id = d['id']
        self.page_id = d.get('page_id')
        self.module_type = d.get('type')
        self.title = d.get('title')
        self.display_order = d.get('display_order', 0)
        self.min_watch_pct = d.get('min_watch_pct')
        self.content_data = d.get('content_data') or {}
        self.questions = d.get('questions') or []
        self.test_cases = d.get('test_cases')


def snapshot_to_objects(snapshot):
    """Convert a snapshot dict into (pages, modules) lists of stand-in objects,
    ordered by display_order — mirroring the live ORM queries."""
    pages = [SnapshotPage(p) for p in
             sorted(snapshot.get('pages', []) or [], key=lambda x: (x.get('display_order') or 0))]
    modules = [SnapshotModule(m) for m in
               sorted(snapshot.get('modules', []) or [], key=lambda x: (x.get('display_order') or 0))]
    return pages, modules
