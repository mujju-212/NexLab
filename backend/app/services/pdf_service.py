"""
PDF Lab Record Generation Service
Uses WeasyPrint to generate a professional PDF from HTML template.
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
import cloudinary.uploader


def generate_lab_record_pdf(student_id: str, subject_id: str, institution_id: str) -> str:
    """
    Generate PDF lab record for a student for a subject.
    Uploads to Cloudinary, returns secure URL.
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

        attendance = SessionAttendance.query.filter_by(
            student_id=student_id
        ).first()   # simplified — get from session link

        lab_entries.append({
            'exp': exp,
            'submission': submission,
            'grade': grade,
            'date': submission.submitted_at if submission else None,
        })

    # Attendance summary
    all_attendances = SessionAttendance.query.filter_by(student_id=student_id).all()
    present_count = sum(1 for a in all_attendances if a.status in ('present', 'late'))
    total_sessions = len(all_attendances)

    # Mastery summary
    masteries = ConceptMastery.query.filter_by(
        student_id=student_id, institution_id=institution_id
    ).order_by(ConceptMastery.mastery_score.desc()).all()

    # ── Render HTML → PDF ─────────────────────────────────────────────────
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

    try:
        from weasyprint import HTML
        pdf_bytes = HTML(string=html_string).write_pdf()
    except Exception as e:
        current_app.logger.error(f"WeasyPrint PDF generation failed: {e}")
        raise

    # ── Upload to Cloudinary ──────────────────────────────────────────────
    result = cloudinary.uploader.upload(
        pdf_bytes,
        resource_type='raw',
        public_id=f"lab_records/{institution_id}/{student_id}/{subject_id}",
        overwrite=True,
        format='pdf',
    )
    return result['secure_url']
