"""
PDF Lab Record Generation Service
Primary: pdfkit (wkhtmltopdf) — works on Windows and Linux
Fallback: save to local /tmp if Cloudinary not configured (dev mode)
"""
from flask import render_template, current_app
from app.extensions import db
from app.models.user import User
from app.models.subject import Subject
from app.models.experiment import Experiment
from app.models.submission import CodeAttempt
from app.models.grading import Grade
from app.models.session import SessionAttendance
from app.models.knowledge import ConceptMastery
from app.models.institution import Institution
from datetime import datetime
import os


def generate_lab_record_pdf(student_id: str, subject_id: str, institution_id: str) -> str:
    """
    Generate PDF lab record for a student for a subject.
    Returns either a Cloudinary secure URL (production) or a local file path (dev).
    """
    # ── Fetch all data ────────────────────────────────────────────────────
    student     = User.query.get(student_id)
    subject     = Subject.query.get(subject_id)
    institution = Institution.query.get(institution_id)

    experiments = Experiment.query.filter_by(
        subject_id=subject_id, institution_id=institution_id, is_published=True
    ).order_by(Experiment.exp_number).all()

    lab_entries = []
    for exp in experiments:
        submission = CodeAttempt.query.filter_by(
            student_id=student_id,
            experiment_id=exp.id,
            is_final_submission=True
        ).order_by(CodeAttempt.submitted_at.desc()).first()

        grade = Grade.query.filter_by(
            student_id=student_id, experiment_id=exp.id
        ).first()

        lab_entries.append({
            'exp':        exp,
            'submission': submission,
            'grade':      grade,
            'date':       submission.submitted_at if submission else None,
        })

    # Attendance summary (filter to sessions for this subject)
    from app.models.session import LabSession
    from app.models.academic import SectionSubject
    ss_ids = [
        ss.id for ss in SectionSubject.query.filter_by(
            subject_id=subject_id, institution_id=institution_id
        ).all()
    ]
    session_ids = [
        s.id for s in LabSession.query.filter(
            LabSession.section_subject_id.in_(ss_ids)
        ).all()
    ] if ss_ids else []

    all_attendances = SessionAttendance.query.filter(
        SessionAttendance.student_id == student_id,
        SessionAttendance.session_id.in_(session_ids)
    ).all() if session_ids else []

    present_count  = sum(1 for a in all_attendances if a.status in ('present', 'late'))
    total_sessions = len(all_attendances)

    # Mastery summary
    masteries = ConceptMastery.query.filter_by(
        student_id=student_id, institution_id=institution_id
    ).order_by(ConceptMastery.mastery_score.desc()).all()

    # ── Render HTML ───────────────────────────────────────────────────────
    try:
        html_string = render_template(
            'lab_record/template.html',
            student=student,
            subject=subject,
            institution=institution,
            lab_entries=lab_entries,
            present_count=present_count,
            total_sessions=total_sessions,
            masteries=masteries,
            generated_at=datetime.utcnow().strftime('%d %B %Y, %I:%M %p UTC'),
        )
    except Exception as e:
        current_app.logger.warning(f"HTML template render failed: {e} — using plain HTML")
        html_string = _fallback_html(student, subject, lab_entries, present_count, total_sessions)

    # ── Generate PDF ──────────────────────────────────────────────────────
    pdf_bytes = _render_pdf(html_string)

    # ── Upload or save locally ────────────────────────────────────────────
    cloud_name = current_app.config.get('CLOUDINARY_CLOUD_NAME', '')
    api_key    = current_app.config.get('CLOUDINARY_API_KEY', '')

    if cloud_name and api_key:
        return _upload_cloudinary(pdf_bytes, institution_id, student_id, subject_id)
    else:
        return _save_local(pdf_bytes, institution_id, student_id, subject_id)


def _render_pdf(html_string: str) -> bytes:
    """Try pdfkit first (works on Windows), fall back to WeasyPrint on Linux"""
    # Option 1: pdfkit (requires wkhtmltopdf installed)
    try:
        import pdfkit
        options = {
            'page-size': 'A4',
            'margin-top': '15mm',
            'margin-bottom': '15mm',
            'margin-left': '15mm',
            'margin-right': '15mm',
            'encoding': 'UTF-8',
            'quiet': '',
        }
        # pdfkit.from_string returns bytes
        pdf = pdfkit.from_string(html_string, False, options=options)
        return pdf
    except Exception as pdfkit_err:
        current_app.logger.warning(f"pdfkit failed: {pdfkit_err} — trying WeasyPrint")

    # Option 2: WeasyPrint (requires GTK — works on Linux/Mac)
    try:
        from weasyprint import HTML
        return HTML(string=html_string).write_pdf()
    except Exception as wp_err:
        current_app.logger.warning(f"WeasyPrint failed: {wp_err} — saving HTML as fallback")

    # Option 3: Return HTML as bytes (dev-mode ultimate fallback)
    return html_string.encode('utf-8')


def _upload_cloudinary(pdf_bytes: bytes, institution_id, student_id, subject_id) -> str:
    """Upload to Cloudinary and return secure URL"""
    import cloudinary
    import cloudinary.uploader
    cloudinary.config(
        cloud_name=current_app.config['CLOUDINARY_CLOUD_NAME'],
        api_key=current_app.config['CLOUDINARY_API_KEY'],
        api_secret=current_app.config['CLOUDINARY_API_SECRET'],
    )
    result = cloudinary.uploader.upload(
        pdf_bytes,
        resource_type='raw',
        public_id=f"lab_records/{institution_id}/{student_id}/{subject_id}",
        overwrite=True,
        format='pdf',
    )
    return result['secure_url']


def _save_local(pdf_bytes: bytes, institution_id, student_id, subject_id) -> str:
    """Dev fallback: save PDF to local backend/lab_records/ folder, return relative path"""
    import pathlib
    out_dir = pathlib.Path(__file__).parent.parent.parent / 'lab_records'
    out_dir.mkdir(exist_ok=True)
    filename = f"{institution_id}_{student_id}_{subject_id}.pdf"
    path = out_dir / filename
    path.write_bytes(pdf_bytes)
    base_url = current_app.config.get('BASE_URL', 'http://localhost:5000')
    current_app.logger.info(f"PDF saved locally (no Cloudinary): {path}")
    return f"{base_url}/lab_records/{filename}"


def _fallback_html(student, subject, lab_entries, present_count, total_sessions) -> str:
    """Minimal HTML lab record when template is missing"""
    name    = student.full_name if student else 'Unknown'
    subj    = subject.name if subject else 'Unknown Subject'
    rows    = ''.join(
        f"<tr><td>{e['exp'].exp_number}</td><td>{e['exp'].title}</td>"
        f"<td>{'Submitted' if e['submission'] else 'Not submitted'}</td>"
        f"<td>{e['grade'].final_grade if e['grade'] and e['grade'].final_grade is not None else '-'}</td></tr>"
        for e in lab_entries
    )
    return f"""<!DOCTYPE html><html><head><style>
body{{font-family:Arial,sans-serif;margin:30px}}
table{{border-collapse:collapse;width:100%}}
th,td{{border:1px solid #ccc;padding:8px;text-align:left}}
th{{background:#f0f0f0}}
</style></head><body>
<h1>Lab Record</h1>
<p><b>Student:</b> {name} &nbsp; <b>Subject:</b> {subj}</p>
<p><b>Attendance:</b> {present_count}/{total_sessions} sessions</p>
<table><tr><th>#</th><th>Experiment</th><th>Status</th><th>Grade</th></tr>
{rows}
</table>
<p><small>Generated: {datetime.utcnow().strftime('%d %B %Y %H:%M UTC')}</small></p>
</body></html>"""
