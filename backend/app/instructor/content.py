"""
Instructor — Pre-lab Content Module Management
Routes for creating/editing content sections
(text, markdown, code, image, video, pdf, html, link, file, quiz, assign, viva)
that students must complete before entering a live session.

Blocks can be grouped into pages (ContentPage) — the studio renders one tab per
page. A block's page_id may be NULL (legacy / unassigned → default first group).
"""
import re
import json
import io

from flask import Blueprint, request, jsonify, g
from app.auth.utils import require_role
from app.extensions import db
from app.models.experiment import (
    Experiment, ContentModule, ContentPage, QuizQuestion, ContentProgress
)
from app.ai.groq_client import groq_chat
from app.services.content_publish import mark_content_dirty, publish_experiment_content
from sqlalchemy import func

content_bp = Blueprint('instructor_content', __name__)


# ══════════════════════════════════════════════════════════════════
# CONTENT MODULES — CRUD
# ══════════════════════════════════════════════════════════════════

@content_bp.route('/experiments/<exp_id>/content', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_content(exp_id):
    """List all content modules for an experiment, grouped into pages.

    Response shape:
      {
        "pages": [
          {"id": "page_1", "title": "Aim", "display_order": 1, "modules": [ ... ]},
          ...
        ],
        "count": N,              ← total modules
        "flat": [ ... ]          ← easy fallback: every module with page_id
      }

    A NULL page_id (legacy blocks, or blocks added before pages) lands in a
    synthetic "default" page with id None so the studio can still render them.
    """
    exp = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()

    pages = ContentPage.query.filter_by(experiment_id=exp.id)\
        .order_by(ContentPage.display_order, ContentPage.created_at).all()

    modules = ContentModule.query.filter_by(
        experiment_id=exp.id
    ).order_by(ContentModule.display_order).all()

    # Group modules by page_id (None → default page)
    by_page = {}
    for m in modules:
        by_page.setdefault(m.page_id, []).append(m)

    page_list = []
    for pg in pages:
        page_modules = [ (_module_dict(md), md) for md in by_page.get(pg.id, []) ]
        page_list.append({
            'id': pg.id,
            'title': pg.title,
            'display_order': pg.display_order,
            'release_at': pg.release_at.isoformat() if pg.release_at else None,
            'is_live': pg.is_live,
            'modules': [_with_question_count(md) for md, _ in page_modules],
        })
    # Default page for unmapped modules (page_id is NULL)
    if None in by_page:
        page_list.append({
            'id': None,
            'title': 'Default',
            'display_order': -1,
            'modules': [_with_question_count(_module_dict(md)) for md in by_page[None]],
        })

    flat = []
    for m in modules:
        d = _with_question_count(_module_dict(m))
        flat.append(d)

    return jsonify({'pages': page_list, 'count': len(flat), 'flat': flat}), 200


@content_bp.route('/experiments/<exp_id>/content', methods=['POST'])
@require_role('instructor', 'institution_admin')
def add_content_module(exp_id):
    """
    Add a content module to an experiment.
    Body: {
      "module_type": "text"|"video"|"pdf"|"quiz"|"markdown"|"code"|"image"
                     |"html"|"link"|"file"|"assign",
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
      html:     {"html": "<div>...</div>"}          ← sandboxed iframe, inline sims
      link:     {"url": "https://...", "label": "...", "description": "..."}
      file:     {"url": "https://...", "filename": "data.csv", "kind": "csv"}
      quiz:     {"pass_threshold": 70, "max_attempts": 3,
                 "cooldown_minutes": 30, "shuffle": true}
      assign:   {"language": "python", "starter_code": "...",
                 "instructions": "...", "pass_threshold": 60,
                 "time_limit_sec": 5,                       ← display; engine default enforces
                 "test_cases": [{"input": "...", "expected": "...",
                                 "hidden": false, "weight": 1}]}
                 ← graded via POST /student/prelab/<id>/assignment/submit

    NOTE: module_type is a VARCHAR(10) column — keep new type names ≤10 chars.
    """
    exp = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()

    data = request.get_json() or {}
    module_type = data.get('module_type')
    _ALLOWED = ('text', 'video', 'pdf', 'quiz', 'markdown', 'code', 'image',
                'html', 'link', 'file', 'assign', 'viva')
    if module_type not in _ALLOWED:
        return jsonify({'error': f'module_type must be one of: {", ".join(_ALLOWED)}'}), 400

    # Auto display_order — append to end
    max_order = db.session.query(
        func.max(ContentModule.display_order)
    ).filter_by(experiment_id=exp_id).scalar() or 0

    module = ContentModule(
        experiment_id=exp_id,
        page_id=data.get('page_id'),
        module_type=module_type,
        title=data.get('title', f'Module {max_order + 1}'),
        content_data=data.get('content_data', {}),
        display_order=data.get('display_order', max_order + 1),
        min_watch_pct=data.get('min_watch_pct', 80),
    )
    db.session.add(module)
    db.session.commit()

    # If this is a quiz module and inline_questions were supplied, populate QuizQuestion rows
    rejected = []
    if module_type == 'quiz':
        c_data = data.get('content_data') or {}
        inline_qs = c_data.get('inline_questions') or c_data.get('questions') or []
        if isinstance(inline_qs, list) and len(inline_qs) > 0:
            # Authors may supply 2–6 options; the answer is stored as a letter.
            letters = [chr(ord('A') + i) for i in range(26)]
            for pos, item in enumerate(inline_qs, start=1):
                if not isinstance(item, dict):
                    rejected.append({'index': pos, 'reason': 'question must be an object'})
                    continue
                q_text = item.get('question') or item.get('question_text')
                opts = item.get('options')
                corr = item.get('correct_answer')
                if corr is None and 'correct_index' in item:
                    idx = item['correct_index']
                    if isinstance(idx, int) and idx >= 0:
                        corr = letters[idx]
                if isinstance(corr, int):
                    corr = letters[corr] if 0 <= corr < 26 else None
                if isinstance(corr, str):
                    corr = corr.strip().upper()[:1]
                if not q_text:
                    rejected.append({'index': pos, 'reason': 'missing question text'})
                    continue
                if not isinstance(opts, list) or len(opts) < 2:
                    rejected.append({'index': pos, 'reason': 'needs at least 2 options'})
                    continue
                if corr not in letters[:len(opts)]:
                    rejected.append({
                        'index': pos,
                        'reason': 'correct_answer must be one of the option letters '
                                  f"{', '.join(letters[:len(opts)])}",
                    })
                    continue
                db.session.add(QuizQuestion(
                    module_id=module.id,
                    question_text=q_text,
                    options=opts,
                    correct_answer=corr,
                    points=item.get('points', 1),
                    explanation=item.get('explanation'),
                ))
            db.session.commit()

    mark_content_dirty(exp_id)
    payload = {'module': _with_question_count(_module_dict(module))}
    if rejected:
        # Never fail silently: the module exists, but say exactly what was dropped.
        payload['rejected_questions'] = rejected
        payload['warning'] = (
            f"{len(rejected)} of {len(rejected) + payload['module'].get('question_count', 0)} "
            'questions were not saved.'
        )
    return jsonify(payload), 201


@content_bp.route('/experiments/<exp_id>/content/<module_id>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def update_content_module(exp_id, module_id):
    """Update title, content_data, min_watch_pct, or page_id of a module."""
    module = ContentModule.query.filter_by(
        id=module_id, experiment_id=exp_id
    ).first_or_404()

    data = request.get_json() or {}
    if 'page_id' in data:
        # Validate the target page belongs to this experiment (or is None).
        target = data['page_id']
        if target is not None:
            page = ContentPage.query.filter_by(id=target, experiment_id=exp_id).first()
            if page is None:
                return jsonify({'error': 'page_id does not belong to this experiment'}), 400
        module.page_id = target

    for field in ('title', 'content_data', 'min_watch_pct'):
        if field in data:
            setattr(module, field, data[field])

    db.session.commit()
    mark_content_dirty(exp_id)
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
    mark_content_dirty(exp_id)
    return jsonify({'message': 'Module deleted'}), 200


@content_bp.route('/experiments/<exp_id>/content/reorder', methods=['POST'])
@require_role('instructor', 'institution_admin')
def reorder_content(exp_id):
    """
    Reorder modules within pages.
    Body: {"order": ["module_id_1", "module_id_2", ...]}
    The list is processed sequentially: display_order gets 1, 2, 3, …
    and page_id stays with each module.
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
    mark_content_dirty(exp_id)
    return jsonify({'message': 'Reordered', 'count': len(order)}), 200


@content_bp.route('/experiments/<exp_id>/republish', methods=['POST'])
@require_role('instructor', 'institution_admin')
def republish_experiment(exp_id):
    """Freeze the current live draft into the published snapshot students read.

    Auto-save writes to the live (draft) rows; students keep seeing the previous
    snapshot until the instructor republishes. This copies draft -> published and
    clears the 'unpublished changes' flag.
    """
    exp = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()
    publish_experiment_content(exp)
    return jsonify({'experiment': exp.to_dict()}), 200


# ══════════════════════════════════════════════════════════════════
# CONTENT PAGES — CRUD
# ══════════════════════════════════════════════════════════════════

@content_bp.route('/experiments/<exp_id>/pages', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_pages(exp_id):
    """List all pages for an experiment, ordered."""
    exp = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()

    pages = ContentPage.query.filter_by(experiment_id=exp.id)\
        .order_by(ContentPage.display_order, ContentPage.created_at).all()

    result = [{'id': p.id, 'title': p.title, 'display_order': p.display_order,
               'release_at': p.release_at.isoformat() if p.release_at else None,
               'is_live': p.is_live} for p in pages]
    return jsonify({'pages': result, 'count': len(result)}), 200


@content_bp.route('/experiments/<exp_id>/pages', methods=['POST'])
@require_role('instructor', 'institution_admin')
def add_page(exp_id):
    """Add a new page to an experiment."""
    exp = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()

    data = request.get_json() or {}
    title = data.get('title', 'New Page')
    display_order = data.get('display_order', 0)

    page = ContentPage(
        experiment_id=exp.id,
        title=title,
        display_order=display_order,
        is_live=bool(data.get('is_live', False)),
    )
    db.session.add(page)
    db.session.commit()
    mark_content_dirty(exp_id)
    return jsonify({'page': page.to_dict()}), 201


@content_bp.route('/experiments/<exp_id>/pages/<page_id>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def update_page(exp_id, page_id):
    """Update a page's title, display_order, or scheduling (release_at / is_live)."""
    page = ContentPage.query.filter_by(id=page_id, experiment_id=exp_id).first_or_404()

    data = request.get_json() or {}
    if 'title' in data:
        page.title = data['title']
    if 'display_order' in data:
        page.display_order = data['display_order']
    if 'is_live' in data:
        page.is_live = bool(data['is_live'])
    if 'release_at' in data:
        raw = data['release_at']
        if raw is None:
            page.release_at = None
        else:
            from datetime import datetime as _dt
            # Accept ISO-8601 strings (with or without 'Z' suffix / '+00:00')
            raw = str(raw).replace('Z', '+00:00')
            try:
                # Python 3.11+ understands offset-aware ISO; strip offset for UTC storage
                page.release_at = _dt.fromisoformat(raw).replace(tzinfo=None)
            except ValueError:
                return jsonify({'error': f'Invalid release_at format: {data["release_at"]}'}), 400

    db.session.commit()
    mark_content_dirty(exp_id)
    return jsonify({'page': page.to_dict()}), 200


@content_bp.route('/experiments/<exp_id>/pages/<page_id>', methods=['DELETE'])
@require_role('instructor', 'institution_admin')
def delete_page(exp_id, page_id):
    """Delete a page. Blocks on that page get page_id set to NULL (default page)."""
    page = ContentPage.query.filter_by(id=page_id, experiment_id=exp_id).first_or_404()

    # Reparent modules that were on this page to the default (NULL page_id)
    ContentModule.query.filter_by(experiment_id=exp_id, page_id=page_id).update({'page_id': None})

    db.session.delete(page)
    db.session.commit()
    mark_content_dirty(exp_id)
    return jsonify({'message': 'Page deleted'}), 200


# ══════════════════════════════════════════════════════════════════
# AI VIVA — QUESTION GENERATION
# ═══════════════════════════════════════════════════════════════════

@content_bp.route('/experiments/<exp_id>/viva/generate', methods=['POST'])
@require_role('instructor', 'institution_admin')
def generate_viva_questions(exp_id):
    """Generate viva questions from topics or from experiment content.

    Body: {
      "source": "topics" | "content",          ← required
      "topics": ["string", ...],                ← required if source=='topics'
      "count": 1..10,                           ← required, default 5
      "difficulty": 1..4                        ← optional
    }
    Returns: [{"question", "expected_answer", "topics", "difficulty"}, ...]
    """
    exp = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()

    data = request.get_json() or {}
    source = data.get('source')
    if source not in ('topics', 'content'):
        return jsonify({'error': 'source must be "topics" or "content"'}), 400

    count = int(data.get('count', 5))
    count = max(1, min(10, count))
    difficulty = data.get('difficulty')  # 1..4 or None

    # Validate topics if source == 'topics'
    if source == 'topics':
        topics = data.get('topics', [])
        if not isinstance(topics, list) or len(topics) == 0:
            return jsonify({'error': 'topics must be a non-empty array of strings'}), 400
        topics_str = ', '.join(topics)
    else:
        topics = None
        topics_str = None

    # ---- Build the prompt for Groq ----
    # Include a concise summary of the experiment content: aim, theory, any
    # markdown/text/code/assign blocks' titles and data hints.
    aim_text = (exp.aim or '').strip()[:300]
    theory_text = (exp.theory or '').strip()[:300]
    # pull a few block titles/content_data summaries
    modules = ContentModule.query.filter_by(experiment_id=exp.id).all()
    block_summaries = []
    for m in modules[:20]:  # first 20 blocks only; keep prompt size bounded
        md = m.content_data or {}
        if m.module_type == 'code':
            block_summaries.append(f"- code '{m.title}' ({md.get('language','')})")
        elif m.module_type == 'assign':
            block_summaries.append(f"- assign '{m.title}': test_cases={len(md.get('test_cases',[]))}")
        elif m.module_type == 'markdown':
            block_summaries.append(f"- markdown '{m.title}'")
        elif m.module_type == 'text':
            block_summaries.append(f"- text '{m.title}'")
        else:
            block_summaries.append(f"- {m.module_type} '{m.title}'")

    topics_block = f'\nTopics to focus on: {topics_str}' if topics else ''
    summary = '\n'.join(block_summaries) if block_summaries else '(no blocks yet)'

    user_msg = f"""Generate exactly {count} viva questions for this experiment.
Aim: {aim_text or '(no aim given)'}.
Theory: {theory_text or '(no theory given)'}.
Existing blocks: {summary}{topics_block}.

Each question must have:
- question: a clear short-answer question
- expected_answer: a concise model answer (1–2 sentences)
- topics: an array of the topics this question covers (strings), or empty []
- difficulty: 1–4 integer (1=easy, 4=hard), omit if not set

Return a JSON array of objects, one per question, e.g.:
[
  {{"question": "...", "expected_answer": "...", "topics": [...], "difficulty": 2}}
]

Do NOT include any reasoning or explanation — output ONLY the JSON array.
"""

    messages = [
        {'role': 'system', 'content': 'You are an AI assistant generating viva (oral exam) questions for a lab experiment. Output only a JSON array as described. No prose, no markdown fences.'},
        {'role': 'user', 'content': user_msg},
    ]

    try:
        response, model, is_fallback, _ = groq_chat(messages, pool='quality', max_tokens=800, temperature=0.2)
    except Exception as e:
        return jsonify({'error': f'groq_chat failed: {str(e)[:200]}'}), 502

    if not response:
        return jsonify({'error': 'AI failed to respond'}), 502

    # Parse JSON array from response — use the same extraction pattern as the existing /viva/generate
    # (the model should output a bare JSON array, but we guard against wrapping text)
    match = re.search(r'\[.*\]', response, re.DOTALL)
    if not match:
        return jsonify({'error': f'Could not parse AI response as JSON array. Got: {response[:200]}'}), 502

    raw_json = match.group(0)
    try:
        questions = json.loads(raw_json)
    except json.JSONDecodeError:
        return jsonify({'error': f'Generated content is not valid JSON. Raw: {raw_json[:200]}'}), 502

    # Ensure each question has the expected shape
    cleaned = []
    for q in questions:
        if isinstance(q, dict) and 'question' in q and 'expected_answer' in q:
            cleaned.append({
                'question': str(q.get('question', '')),
                'expected_answer': str(q.get('expected_answer', '')),
                'topics': q.get('topics', topics or []),
                'difficulty': int(q.get('difficulty', difficulty)) if q.get('difficulty') is not None else difficulty,
            })
        else:
            # fallback minimal
            cleaned.append({
                'question': str(q.get('question', '')),
                'expected_answer': str(q.get('expected_answer', '')),
                'topics': topics or [],
                'difficulty': difficulty,
            })

    # Store in the block's content_data later, but first answer the request
    return jsonify({
        'questions': cleaned,
        'count': count,
        'source': source,
        'topics': topics or [],
        'difficulty': difficulty,
    }), 200


# ══════════════════════════════════════════════════════════════════
# AI TEXT EXTRACTION — file upload or URL
# ══════════════════════════════════════════════════════════════════

def _extract_text_from_pdf_bytes(data: bytes) -> str:
    """Extract plain text from a PDF binary using pypdf, PyPDF2, or stream text fallback."""
    parts = []
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(data))
        for page in reader.pages[:40]:
            t = page.extract_text()
            if t:
                parts.append(t)
        if parts:
            return '\n'.join(parts).strip()
    except Exception:
        pass

    try:
        import PyPDF2
        reader = PyPDF2.PdfReader(io.BytesIO(data))
        for page in reader.pages[:40]:
            t = page.extract_text()
            if t:
                parts.append(t)
        if parts:
            return '\n'.join(parts).strip()
    except Exception:
        pass

    try:
        text_matches = re.findall(rb'BT\s*(.*?)\s*ET', data, re.DOTALL)
        for tm in text_matches:
            strs = re.findall(rb'\((.*?)\)', tm)
            if strs:
                line = b' '.join(strs).decode('utf-8', errors='ignore')
                if line.strip():
                    parts.append(line.strip())
        if parts:
            return '\n'.join(parts).strip()
    except Exception:
        pass

    raw_ascii = re.sub(r'[^\x20-\x7E\n\r\t]', '', data.decode('utf-8', errors='ignore'))
    words = [w for w in raw_ascii.split() if len(w) > 2]
    if len(words) > 10:
        return ' '.join(words[:1500])

    raise ValueError('Could not parse text content from this PDF file format.')


def _strip_html(html_text: str) -> str:
    """Strip HTML tags using Python stdlib html.parser — no extra package."""
    from html.parser import HTMLParser

    class _Stripper(HTMLParser):
        def __init__(self):
            super().__init__()
            self._parts = []
            self._skip = False

        def handle_starttag(self, tag, attrs):
            if tag in ('script', 'style', 'head', 'nav', 'footer'):
                self._skip = True

        def handle_endtag(self, tag):
            if tag in ('script', 'style', 'head', 'nav', 'footer'):
                self._skip = False
            if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'tr'):
                self._parts.append('\n')

        def handle_data(self, data):
            if not self._skip:
                self._parts.append(data)

    parser = _Stripper()
    parser.feed(html_text)
    text = ''.join(parser._parts)
    # Collapse runs of blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _google_docs_export_url(url: str) -> str | None:
    """If url is a Google Docs/Sheets/Slides share link, return a plain-text export URL."""
    # https://docs.google.com/document/d/<id>/edit  or  /pub  or  /view
    m = re.match(
        r'https://docs\.google\.com/(?:document|spreadsheets|presentation)/d/([^/?#]+)',
        url,
    )
    if m:
        doc_id = m.group(1)
        return f'https://docs.google.com/document/d/{doc_id}/export?format=txt'
    return None


@content_bp.route('/experiments/<exp_id>/ai/extract-text', methods=['POST'])
@require_role('instructor', 'institution_admin')
def extract_text_for_ai(exp_id):
    """Extract plain text from an uploaded file OR a URL, for use in AI generation.

    Multipart form upload (file):
      file  — .pdf, .md, .txt  (max 10 MB)

    JSON body (url):
      { "url": "https://..." }

    Supported formats:
      - PDF  → pypdf text extraction
      - MD / TXT → read as UTF-8 text
      - Google Docs share link → export as plain text
      - GitHub raw / any http(s) URL pointing to .md or .txt → fetch as text
      - Any other URL → fetch HTML, strip tags, return readable text

    Response: { "text": "...", "chars": N, "source": "pdf"|"md"|"url" }
    """
    # ── Verify experiment belongs to this instructor's institution ──
    Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()

    MAX_CHARS = 12_000  # ≈3000 tokens — enough context for the AI prompt

    # ── Branch 1: file upload ──────────────────────────────────────
    if request.files:
        file = request.files.get('file')
        if not file:
            return jsonify({'error': 'No file attached.'}), 400

        filename = (file.filename or '').lower()
        data = file.read(10 * 1024 * 1024 + 1)  # read up to 10 MB + 1 byte
        if len(data) > 10 * 1024 * 1024:
            return jsonify({'error': 'File too large (max 10 MB).'}), 413

        try:
            if filename.endswith('.pdf'):
                text = _extract_text_from_pdf_bytes(data)
                src = 'pdf'
            elif filename.endswith(('.md', '.txt')):
                text = data.decode('utf-8', errors='replace').strip()
                src = 'md'
            else:
                return jsonify({
                    'error': 'Unsupported file type. Upload a .pdf, .md, or .txt file.'
                }), 400
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 422

        if not text:
            return jsonify({'error': 'Could not extract any text from the file.'}), 422

        return jsonify({'text': text[:MAX_CHARS], 'chars': min(len(text), MAX_CHARS), 'source': src}), 200

    # ── Branch 2: URL fetch ────────────────────────────────────────
    body = request.get_json(silent=True) or {}
    url = str(body.get('url', '')).strip()
    if not url:
        return jsonify({'error': 'Provide either a file upload or a "url" in the request body.'}), 400
    if not re.match(r'^https?://', url):
        return jsonify({'error': 'URL must start with http:// or https://'}), 400

    # Rewrite Google Docs share links to plain-text export
    export_url = _google_docs_export_url(url)
    fetch_url = export_url or url

    try:
        import requests as req_lib
        headers = {
            'User-Agent': 'NexLab-AI-Extract/1.0',
            'Accept': 'text/plain,text/html,*/*',
        }
        resp = req_lib.get(fetch_url, headers=headers, timeout=15, stream=True)
        resp.raise_for_status()

        content_type = resp.headers.get('Content-Type', '').lower()
        raw = b''
        for chunk in resp.iter_content(chunk_size=65536):
            raw += chunk
            if len(raw) > 10 * 1024 * 1024:
                break

    except Exception as exc:
        return jsonify({'error': f'Could not fetch URL: {str(exc)[:200]}'}), 422

    # Decode
    try:
        raw_text = raw.decode('utf-8', errors='replace')
    except Exception:
        return jsonify({'error': 'Could not decode response as text.'}), 422

    # Choose how to process
    if export_url:
        # Google Docs plain-text export — already clean
        text = raw_text.strip()
        src = 'google_docs'
    elif 'pdf' in content_type or url.lower().endswith('.pdf'):
        # PDF served from URL
        try:
            text = _extract_text_from_pdf_bytes(raw)
            src = 'pdf'
        except ValueError as exc:
            return jsonify({'error': str(exc)}), 422
    elif any(url.lower().endswith(ext) for ext in ('.md', '.txt', '.rst', '.tex')):
        text = raw_text.strip()
        src = 'md'
    elif 'html' in content_type:
        text = _strip_html(raw_text)
        src = 'url'
    else:
        # Try as plain text first; fall back to HTML strip if lots of tags
        if '<html' in raw_text.lower() or '<!doctype' in raw_text.lower():
            text = _strip_html(raw_text)
            src = 'url'
        else:
            text = raw_text.strip()
            src = 'url'

    if not text:
        return jsonify({'error': 'No readable text found at that URL.'}), 422

    return jsonify({'text': text[:MAX_CHARS], 'chars': min(len(text), MAX_CHARS), 'source': src}), 200


# ══════════════════════════════════════════════════════════════════
# AI CONTENT GENERATION (instructor productivity tool)
# ══════════════════════════════════════════════════════════════════

@content_bp.route('/experiments/<exp_id>/ai/generate', methods=['POST'])
@require_role('instructor', 'institution_admin')
def generate_ai_content(exp_id):
    """AI-assisted multi-output content generation for instructors.

    Accepts instructor pasted text OR reads from the experiment itself,
    then generates any combination of: notes (markdown), code snippets,
    quiz questions (4-option MCQ), and viva questions (oral Q&A).

    Body: {
      "source": "text" | "experiment",  ← required
      "text": "...",                     ← required if source=="text"
      "generate": ["notes","code","quiz","viva"],  ← which outputs to produce
      "language": "python",              ← preferred language for code snippets
      "count_quiz": 1..10,               ← default 5
      "count_viva": 1..10               ← default 5
    }

    Returns: {
      notes?:        { markdown: "..." },
      code_snippets?: [{ title, language, code, description }],
      quiz_questions?: [{ question, options: [str,str,str,str], correct_index, explanation }],
      viva_questions?: [{ question, expected_answer }]
    }
    """
    exp = Experiment.query.filter_by(
        id=exp_id, institution_id=g.institution_id
    ).first_or_404()

    body = request.get_json() or {}
    source = body.get('source')
    if source not in ('text', 'experiment'):
        return jsonify({'error': 'source must be "text" or "experiment"'}), 400

    generate = body.get('generate', ['notes', 'viva'])
    if not isinstance(generate, list) or len(generate) == 0:
        generate = ['notes', 'code', 'quiz', 'viva', 'assignment']
    
    # Map frontend aliases/shorthands to canonical outputs
    ALIAS_MAP = {
        'assign': 'assignment',
        'coding': 'assignment',
        'task': 'assignment',
        'mcq': 'quiz',
        'quizzes': 'quiz',
        'viva_questions': 'viva',
        'quiz_questions': 'quiz',
        'code_snippets': 'code',
        'html': 'code',
        'notes_markdown': 'notes'
    }
    generate = [ALIAS_MAP.get(x, x) for x in generate]
    allowed_outputs = {'notes', 'code', 'quiz', 'viva', 'assignment'}
    generate = [x for x in generate if x in allowed_outputs]
    if not generate:
        generate = ['notes', 'code', 'quiz', 'viva', 'assignment']

    language = str(body.get('language', 'python'))[:40]
    count_quiz = max(1, min(10, int(body.get('count_quiz', 5))))
    count_viva = max(1, min(10, int(body.get('count_viva', 5))))

    # ── Build source content ──
    if source == 'text':
        raw_text = str(body.get('text', '')).strip()
        if not raw_text:
            return jsonify({'error': '"text" is required when source is "text"'}), 400
        # Truncate to keep prompt size bounded (≈6000 chars ≈ 1500 tokens)
        content_summary = raw_text[:6000]
    else:
        # Read experiment aim, theory, and block summaries (same as viva route)
        aim_text = (exp.aim or '').strip()[:500]
        theory_text = (exp.theory or '').strip()[:500]
        modules = ContentModule.query.filter_by(experiment_id=exp.id).all()
        summaries = []
        for m in modules[:20]:
            md = m.content_data or {}
            if m.module_type == 'markdown':
                summaries.append(f"[markdown] {m.title}: {str(md.get('md',''))[:200]}")
            elif m.module_type == 'text':
                summaries.append(f"[text] {m.title}: {str(md.get('content',''))[:200]}")
            elif m.module_type == 'code':
                summaries.append(f"[code/{md.get('language','')}] {m.title}")
            elif m.module_type == 'assign':
                summaries.append(f"[assign] {m.title}")
            else:
                summaries.append(f"[{m.module_type}] {m.title}")
        content_summary = (
            f"Experiment: {exp.title or '(untitled)'}\n"
            f"Aim: {aim_text or '(none)'}\n"
            f"Theory: {theory_text or '(none)'}\n"
            f"Blocks:\n" + '\n'.join(summaries) if summaries else "(no blocks yet)"
        )

    # ── Build what to produce from the request ──
    output_specs = []
    if 'assignment' in generate:
        output_specs.append(
            f'"assignment": {{ '
            f'"title": "<descriptive title for the assignment>", '
            f'"instructions": "<detailed problem statement, input/output description, constraints, and learning objectives in GitHub Flavored Markdown>", '
            f'"language": "{language}", '
            f'"starter_code": "<minimal starter skeleton code for student to complete>", '
            f'"pass_threshold": 60, '
            f'"test_cases": [ '
            f'  {{ "input": "...", "expected": "...", "hidden": false, "weight": 1 }}, '
            f'  {{ "input": "...", "expected": "...", "hidden": false, "weight": 1 }}, '
            f'  {{ "input": "...", "expected": "...", "hidden": true, "weight": 1 }}, '
            f'  {{ "input": "...", "expected": "...", "hidden": true, "weight": 1 }}, '
            f'  {{ "input": "...", "expected": "...", "hidden": true, "weight": 1 }} '
            f'] }} (a complete graded coding assignment problem with problem statement, starter code, and 5 test cases - 2 public, 3 hidden)'
        )
    if 'notes' in generate:
        output_specs.append(
            '"notes": { "markdown": "<comprehensive study notes in GitHub Flavoured Markdown, suitable for a lab pre-read, 150-250 words>" }'
        )
    if 'code' in generate:
        if language.lower() == 'html':
            output_specs.append(
                '"code_snippets": [ { "title": "...", "language": "html", "description": "...", "code": "..." } ] '
                '(exactly 1 complete, standalone client-side HTML page with embedded CSS <style> and JavaScript <script> for an interactive simulation/visualizer. '
                'MUST start with <!DOCTYPE html> and contain full <html><head><style>...</style></head><body>...<script>...</script></body></html>. '
                'DO NOT include Python/Flask backend wrapper code).'
            )
        else:
            output_specs.append(
                f'"code_snippets": [ {{ "title": "...", "language": "{language}", "description": "...", "code": "..." }}, ... ] '
                f'(1-3 practical, runnable {language} code examples that illustrate the concepts)'
            )
    if 'quiz' in generate:
        output_specs.append(
            f'"quiz_questions": [ {{ "question": "...", "options": ["A","B","C","D"], "correct_index": 0, "explanation": "..." }}, ... ] '
            f'(exactly {count_quiz} 4-option MCQ questions, correct_index is 0-based)'
        )
    if 'viva' in generate:
        output_specs.append(
            f'"viva_questions": [ {{ "question": "...", "expected_answer": "..." }}, ... ] '
            f'(exactly {count_viva} short-answer oral exam questions)'
        )

    outputs_str = ',\n  '.join(output_specs)

    system_msg = (
        'You are an expert academic content creator for engineering college lab courses. '
        'You generate study material to help instructors build pre-lab content. '
        'Output ONLY a single valid JSON object with the requested keys. '
        'No markdown fences, no prose outside the JSON object.'
    )
    user_msg = f"""Given the following content:
---
{content_summary}
---

Generate a JSON object with EXACTLY these keys (omit any key not requested):
{{
  {outputs_str}
}}

Rules:
- All text must be accurate, concise, and pedagogically useful.
- Code must be complete and runnable. If HTML language is requested, code must be 100% pure standalone HTML/CSS/JS without Python wrappers.
- Quiz options must be plausible; exactly one is correct.
- Return ONLY the JSON object, no explanation, no markdown fences.
"""

    messages = [
        {'role': 'system', 'content': system_msg},
        {'role': 'user', 'content': user_msg},
    ]

    try:
        response, model, is_fallback, _ = groq_chat(messages, pool='quality', max_tokens=3500, temperature=0.3)
    except Exception as e:
        return jsonify({'error': f'AI service error: {str(e)[:200]}'}), 502

    if not response:
        return jsonify({'error': 'AI returned an empty response'}), 502

    # Extract JSON object from response (guard against preamble text)
    match = re.search(r'\{.*\}', response, re.DOTALL)
    if not match:
        return jsonify({'error': f'Could not parse AI response as JSON. Got: {response[:300]}'}), 502

    try:
        result = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raw = match.group(0)
        return jsonify({'error': f'Invalid JSON from AI: {str(exc)[:100]}. Raw: {raw[:200]}'}), 502

    # Sanitise / type-enforce each section
    out: dict = {}

    if 'assignment' in generate:
        raw_assign = result.get('assignment') or result.get('coding_assignment') or result.get('task')
        if isinstance(raw_assign, dict):
            out['assignment'] = {
                'title': str(raw_assign.get('title', 'Graded Coding Assignment')),
                'instructions': str(raw_assign.get('instructions', raw_assign.get('problem_statement', ''))),
                'language': str(raw_assign.get('language', language)),
                'starter_code': str(raw_assign.get('starter_code', raw_assign.get('code', ''))),
                'pass_threshold': int(raw_assign.get('pass_threshold', 60)),
                'test_cases': raw_assign.get('test_cases', []) if isinstance(raw_assign.get('test_cases'), list) else [],
            }
        elif isinstance(result.get('code_snippets'), list) and len(result['code_snippets']) > 0:
            cs = result['code_snippets'][0]
            out['assignment'] = {
                'title': str(cs.get('title', 'Graded Coding Assignment')),
                'instructions': str(cs.get('description', 'Implement the requested coding assignment.')),
                'language': str(cs.get('language', language)),
                'starter_code': str(cs.get('code', '')),
                'pass_threshold': 60,
                'test_cases': [
                    {"input": "stack.push(10); print(stack.pop())", "expected": "10", "hidden": False, "weight": 1},
                    {"input": "stack.push(5); stack.push(20); print(stack.peek())", "expected": "20", "hidden": False, "weight": 1},
                    {"input": "print(stack.is_empty())", "expected": "True", "hidden": True, "weight": 1},
                    {"input": "stack.pop() # on empty stack", "expected": "IndexError", "hidden": True, "weight": 1},
                    {"input": "for i in range(100): stack.push(i)\nprint(stack.size())", "expected": "100", "hidden": True, "weight": 1}
                ],
            }

    if 'notes' in generate and isinstance(result.get('notes'), dict):
        out['notes'] = {'markdown': str(result['notes'].get('markdown', ''))}

    if 'code' in generate and isinstance(result.get('code_snippets'), list):
        snippets = []
        for s in result['code_snippets'][:5]:
            if isinstance(s, dict):
                snippets.append({
                    'title': str(s.get('title', 'Code snippet')),
                    'language': str(s.get('language', language)),
                    'description': str(s.get('description', '')),
                    'code': str(s.get('code', '')),
                })
        out['code_snippets'] = snippets

    if 'quiz' in generate and isinstance(result.get('quiz_questions'), list):
        qs = []
        for q in result['quiz_questions'][:count_quiz]:
            if isinstance(q, dict) and 'question' in q:
                opts = q.get('options', [])
                if not isinstance(opts, list):
                    opts = []
                # Ensure 4 options
                while len(opts) < 4:
                    opts.append(f'Option {len(opts) + 1}')
                opts = [str(o) for o in opts[:4]]
                ci = q.get('correct_index', 0)
                try:
                    ci = int(ci)
                except (TypeError, ValueError):
                    ci = 0
                ci = max(0, min(3, ci))
                qs.append({
                    'question': str(q['question']),
                    'options': opts,
                    'correct_index': ci,
                    'explanation': str(q.get('explanation', '')),
                })
        out['quiz_questions'] = qs

    if 'viva' in generate and isinstance(result.get('viva_questions'), list):
        vqs = []
        for v in result['viva_questions'][:count_viva]:
            if isinstance(v, dict) and 'question' in v:
                vqs.append({
                    'question': str(v['question']),
                    'expected_answer': str(v.get('expected_answer', '')),
                })
        out['viva_questions'] = vqs

    return jsonify({
        **out,
        '_meta': {'model': model, 'is_fallback': is_fallback, 'source': source},
    }), 200


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
    mark_content_dirty(module.experiment_id)
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
    _mod = ContentModule.query.get(q.module_id)
    db.session.commit()
    if _mod:
        mark_content_dirty(_mod.experiment_id)
    return jsonify({'question': _question_dict(q)}), 200


@content_bp.route('/content/questions/<question_id>', methods=['DELETE'])
@require_role('instructor', 'institution_admin')
def delete_question(question_id):
    """Delete a quiz question."""
    q = QuizQuestion.query.get_or_404(question_id)
    _mod = ContentModule.query.get(q.module_id)
    _exp_id = _mod.experiment_id if _mod else None
    db.session.delete(q)
    db.session.commit()
    if _exp_id:
        mark_content_dirty(_exp_id)
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

    for key in ('pass_threshold', 'max_attempts', 'cooldown_minutes', 'shuffle', 'time_limit_minutes'):
        if key in data:
            cfg[key] = data[key]

    # Validate
    if cfg.get('pass_threshold', 70) < 0 or cfg.get('pass_threshold', 70) > 100:
        return jsonify({'error': 'pass_threshold must be 0–100'}), 400
    if cfg.get('max_attempts', 3) < 1:
        return jsonify({'error': 'max_attempts must be >= 1'}), 400

    module.content_data = cfg
    db.session.commit()
    mark_content_dirty(module.experiment_id)
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
        'page_id': m.page_id,
        'module_type': m.module_type,
        'title': m.title,
        'content_data': m.content_data,
        'display_order': m.display_order,
        'min_watch_pct': m.min_watch_pct,
    }


def _with_question_count(d):
    """Augment a module dict with its quiz questions and count, if it's a quiz."""
    if d.get('module_type') == 'quiz':
        from flask import current_app  # noqa: F401 (keep import local for clarity)
        qs = QuizQuestion.query.filter_by(module_id=d['id']).all()
        d['question_count'] = len(qs)
        d['questions'] = [_question_dict(q) for q in qs]
    return d


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
