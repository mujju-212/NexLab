"""
Instructor Blueprint
Handles: experiments, sessions, live monitoring, grading, viva, analytics
"""
from flask import Blueprint, request, jsonify, g, current_app
from app.auth.utils import require_role
from app.extensions import db, socketio
from app.models.experiment import Experiment, TestCase, ContentModule, QuizQuestion, ContentProgress
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt, CodeVersion
from app.models.grading import Grade, InlineComment, VivaSession
from app.models.knowledge import StudentRanking, ConceptMastery, FocusScore
from app.models.feedback import PlagiarismFlag, SessionFeedback, Notification
from app.models.academic import SectionSubject, Section, SectionStudent
from app.models.subject import Subject
from app.models.user import User
from app.models.conductor import Checkpoint, CheckpointProgress, LivePageState
from app.models.proctor_event import ProctorEvent
from app.ai.groq_client import groq_single
from app.institution.audit import write_audit
from app.services.content_publish import publish_experiment_content
from sqlalchemy import func, or_, and_, case
from datetime import datetime, timedelta, timezone
import uuid
import re
import json
import subprocess

instructor_bp = Blueprint('instructor', __name__)


def _parse_iso(raw):
    """Parse an ISO-8601 timestamp string into a naive UTC datetime."""
    if not raw:
        return None
    try:
        s = str(raw).strip()
        if s.endswith('Z'):
            s = s[:-1] + '+00:00'
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None



def _instructor_ss_query():
    """Query SectionSubjects for current instructor or co-instructor (or all for institution_admin)."""
    q = SectionSubject.query.filter_by(institution_id=g.institution_id)
    if g.role != 'institution_admin':
        q = q.filter(or_(
            SectionSubject.instructor_id == g.user_id,
            SectionSubject.co_instructor_id == g.user_id,
        ))
    return q


# ── Instructor Dashboard + Teaching Assignments ────────────────────────────────

@instructor_bp.route('/section-subjects', methods=['GET'])
@require_role('instructor', 'institution_admin')
def my_section_subjects():
    """All section-subjects assigned to this instructor (with names + headcount)."""
    assignments = _instructor_ss_query().all()
    if not assignments and g.role == 'instructor':
        assignments = SectionSubject.query.filter_by(institution_id=g.institution_id).all()

    if not assignments:
        return jsonify({'section_subjects': []}), 200

    subject_ids = {ss.subject_id for ss in assignments if ss.subject_id}
    section_ids = {ss.section_id for ss in assignments if ss.section_id}

    subjects = {s.id: s for s in Subject.query.filter(Subject.id.in_(subject_ids)).all()} if subject_ids else {}
    sections = {s.id: s for s in Section.query.filter(Section.id.in_(section_ids)).all()} if section_ids else {}

    batch_ids = {s.batch_id for s in sections.values() if s.batch_id}
    from app.models.academic import Batch, AcademicYear, Department
    batches = {b.id: b for b in Batch.query.filter(Batch.id.in_(batch_ids)).all()} if batch_ids else {}
    year_ids = {b.year_id for b in batches.values() if b.year_id}
    years = {y.id: y for y in AcademicYear.query.filter(AcademicYear.id.in_(year_ids)).all()} if year_ids else {}
    dept_ids = ({b.department_id for b in batches.values() if getattr(b, "department_id", None)} |
                {s.department_id for s in subjects.values() if getattr(s, "department_id", None)})
    departments = {d.id: d for d in Department.query.filter(Department.id.in_(dept_ids)).all()} if dept_ids else {}

    student_counts = {}
    if section_ids:
        counts = db.session.query(
            SectionStudent.section_id, func.count(SectionStudent.student_id)
        ).filter(SectionStudent.section_id.in_(section_ids)).group_by(SectionStudent.section_id).all()
        student_counts = {sec_id: c for sec_id, c in counts}

    exp_counts = {}
    if subject_ids:
        counts = db.session.query(
            Experiment.subject_id, func.count(Experiment.id)
        ).filter(
            Experiment.institution_id == g.institution_id,
            Experiment.subject_id.in_(subject_ids)
        ).group_by(Experiment.subject_id).all()
        exp_counts = {subj_id: c for subj_id, c in counts}

    result = []
    for ss in assignments:
        subject = subjects.get(ss.subject_id)
        section = sections.get(ss.section_id)
        batch = batches.get(section.batch_id) if section else None
        year = years.get(batch.year_id) if batch else None
        dept_id = (getattr(subject, "department_id", None) if subject else None) or (getattr(batch, "department_id", None) if batch else None)
        dept = departments.get(dept_id) if dept_id else None
        result.append({
            'section_subject_id': ss.id,
            'subject_id': ss.subject_id,
            'subject_name': subject.name if subject else '',
            'subject_code': subject.code if subject else '',
            'total_marks': getattr(subject, 'total_marks', 100) if subject else 100,
            'icon': (getattr(subject, 'icon', None) or 'datastruct') if subject else 'datastruct',
            'subject_icon': (getattr(subject, 'icon', None) or 'datastruct') if subject else 'datastruct',
            'description': subject.description if subject else '',
            'department_id': dept.id if dept else None,
            'department_name': dept.name if dept else 'General Department',
            'department_code': dept.code if dept else 'GEN',
            'year_id': year.id if year else None,
            'academic_year': year.year_label if year else 'Current Year',
            'batch_id': batch.id if batch else None,
            'batch_name': batch.name if batch else 'General Batch',
            'section_id': ss.section_id,
            'section_name': section.name if section else '',
            'student_count': student_counts.get(ss.section_id, 0),
            'experiment_count': exp_counts.get(ss.subject_id, 0),
        })
    return jsonify({'section_subjects': result}), 200


@instructor_bp.route('/subjects/<subject_id>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def update_instructor_subject(subject_id):
    """Allows an instructor to update subject details/icon for their assigned subject."""
    if g.role == 'instructor':
        assignment = SectionSubject.query.filter_by(
            subject_id=subject_id,
            instructor_id=g.user_id
        ).first()
        if not assignment:
            subject = Subject.query.filter_by(id=subject_id, institution_id=g.institution_id).first_or_404()
        else:
            subject = Subject.query.get_or_404(subject_id)
    else:
        subject = Subject.query.filter_by(id=subject_id, institution_id=g.institution_id).first_or_404()

    data = request.get_json() or {}
    changed = []
    for field in ('name', 'code', 'description', 'icon', 'total_marks'):
        if field in data:
            setattr(subject, field, data[field])
            changed.append(field)
    db.session.commit()
    return jsonify({'subject': subject.to_dict(), 'message': 'Subject updated successfully'}), 200




@instructor_bp.route('/dashboard', methods=['GET'])
@require_role('instructor', 'institution_admin')
def instructor_dashboard():
    """Aggregate stats for the instructor dashboard.

    Perf-pass notes (2026-09-16): SectionSubject is fetched ONCE (was three
    separate scans), Grade rows for my experiments load ONCE and are shared
    with _dashboard_stats (was twice — a full grade-table round per view),
    the finals list is capped, and the performance donut is a SQL aggregate
    instead of loading every StudentRanking row into Python.
    """
    now = datetime.utcnow()

    # Only sessions whose section-subject this instructor teaches — one fetch
    # feeds both the id list and the section list below.
    my_ss_rows = SectionSubject.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id
    ).all()
    if not my_ss_rows or g.role == 'institution_admin':
        my_ss_rows = SectionSubject.query.filter_by(
            institution_id=g.institution_id).all()
    my_ss_ids = [ss.id for ss in my_ss_rows]
    my_section_ids = list({ss.section_id for ss in my_ss_rows if ss.section_id})
    my_subject_ids = list({ss.subject_id for ss in my_ss_rows if ss.subject_id})

    active_sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(my_ss_ids),
        LabSession.status == 'active',
    ).all() if my_ss_ids else []
    upcoming_sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(my_ss_ids),
        LabSession.status.in_(['scheduled', 'active']),
        or_(
            LabSession.status == 'active',
            LabSession.scheduled_at >= now - timedelta(hours=4)
        )
    ).order_by(LabSession.scheduled_at.asc()).limit(15).all() if my_ss_ids else []

    # Collect all experiments relevant to this instructor:
    # 1. Authored by this instructor
    # 2. Associated with subjects this instructor teaches
    exp_filter = [Experiment.instructor_id == g.user_id]
    if my_subject_ids:
        exp_filter.append(Experiment.subject_id.in_(my_subject_ids))
    if g.role == 'institution_admin' and not my_subject_ids:
        exp_filter = [Experiment.institution_id == g.institution_id]

    my_exp_ids = [
        row[0] for row in db.session.query(Experiment.id).filter(
            Experiment.institution_id == g.institution_id,
            or_(*exp_filter)
        ).all()
    ]

    # Students across the instructor's assigned sections
    enrolled_sids = [
        r[0] for r in db.session.query(SectionStudent.student_id).filter(
            SectionStudent.section_id.in_(my_section_ids)).distinct().all()
    ] if my_section_ids else []

    # Graded (student, experiment) pairs — loaded ONCE here, passed down.
    graded_pairs = set()
    grades_map = {}
    if my_exp_ids:
        for gr in Grade.query.with_entities(
                Grade.student_id, Grade.experiment_id, Grade.final_grade
        ).filter(Grade.experiment_id.in_(my_exp_ids)).all():
            graded_pairs.add((gr.student_id, gr.experiment_id))
            grades_map[(gr.student_id, gr.experiment_id)] = gr.final_grade

    # Pending grading: final submissions with no Grade row yet.
    pending = []
    sub_conditions = []
    if my_exp_ids:
        sub_conditions.append(CodeAttempt.experiment_id.in_(my_exp_ids))
    if enrolled_sids:
        sub_conditions.append(CodeAttempt.student_id.in_(enrolled_sids))

    if sub_conditions:
        finals = CodeAttempt.query.filter(
            or_(*sub_conditions),
            CodeAttempt.is_final_submission == True,  # noqa: E712
        ).order_by(CodeAttempt.submitted_at.desc()).limit(200).all()
        # Batch user + experiment lookups
        pending_student_ids = {a.student_id for a in finals}
        pending_exp_ids = {a.experiment_id for a in finals}
        pending_users = {u.id: u for u in User.query.filter(User.id.in_(pending_student_ids)).all()} if pending_student_ids else {}
        pending_exps = {e.id: e for e in Experiment.query.filter(Experiment.id.in_(pending_exp_ids)).all()} if pending_exp_ids else {}
        seen = set()
        for att in finals:
            pair = (att.student_id, att.experiment_id)
            if pair in graded_pairs or pair in seen:
                continue
            seen.add(pair)
            u = pending_users.get(att.student_id)
            exp = pending_exps.get(att.experiment_id)
            pending.append({
                'student_id': att.student_id,
                'experiment_id': att.experiment_id,
                'session_id': att.session_id,
                'student_name': u.full_name if u else 'Unknown',
                'roll_number': u.roll_number if u else '',
                'experiment_title': exp.title if exp else 'Unknown',
                'submitted_at': att.submitted_at.isoformat() if att.submitted_at else None,
                'test_cases_passed': att.test_cases_passed,
                'test_cases_total': att.test_cases_total,
            })

    # Recent Submissions for the dashboard card
    recent_submissions = []
    if sub_conditions:
        all_finals = CodeAttempt.query.filter(
            or_(*sub_conditions),
            CodeAttempt.is_final_submission == True,  # noqa: E712
        ).order_by(CodeAttempt.submitted_at.desc()).limit(10).all()

        sub_student_ids = {a.student_id for a in all_finals}
        sub_exp_ids = {a.experiment_id for a in all_finals}
        sub_users = {u.id: u for u in User.query.filter(User.id.in_(sub_student_ids)).all()} if sub_student_ids else {}
        sub_exps = {e.id: e for e in Experiment.query.filter(Experiment.id.in_(sub_exp_ids)).all()} if sub_exp_ids else {}

        for att in all_finals[:6]:
            u = sub_users.get(att.student_id)
            e = sub_exps.get(att.experiment_id)
            final_grade = grades_map.get((att.student_id, att.experiment_id))
            is_graded = (att.student_id, att.experiment_id) in graded_pairs

            total_tc = att.test_cases_total if att.test_cases_total is not None else (TestCase.query.filter_by(experiment_id=att.experiment_id).count() or 0)
            passed_tc = att.test_cases_passed if att.test_cases_passed is not None else (total_tc if is_graded else 0)

            recent_submissions.append({
                'id': att.id,
                'student_id': att.student_id,
                'student_name': u.full_name if u else 'Student',
                'experiment_id': att.experiment_id,
                'experiment_title': e.title if e else 'Lab Assignment',
                'test_cases_passed': passed_tc,
                'test_cases_total': total_tc,
                'submitted_at': att.submitted_at.isoformat() if att.submitted_at else None,
                'is_graded': is_graded,
                'grade': round(final_grade, 1) if final_grade is not None else None,
            })

    # Dynamic Concept Mastery Snapshot from real ConceptMastery rows
    cm_q = db.session.query(
        ConceptMastery.concept,
        func.avg(ConceptMastery.mastery_score).label('avg_score'),
        func.count(ConceptMastery.student_id).label('student_count')
    )
    if enrolled_sids:
        cm_q = cm_q.filter(ConceptMastery.student_id.in_(enrolled_sids))
    else:
        cm_q = cm_q.filter(ConceptMastery.institution_id == g.institution_id)

    top_cm_rows = cm_q.group_by(ConceptMastery.concept).order_by(
        func.count(ConceptMastery.student_id).desc(),
        func.avg(ConceptMastery.mastery_score).desc()
    ).limit(5).all()

    color_gradients = [
        'linear-gradient(90deg, #8b5cf6, #7c3aed)',
        'linear-gradient(90deg, #3b82f6, #06b6d4)',
        'linear-gradient(90deg, #10b981, #059669)',
        'linear-gradient(90deg, #ec4899, #f43f5e)',
        'linear-gradient(90deg, #f59e0b, #d97706)',
    ]

    concept_mastery = []
    if top_cm_rows:
        for idx, row in enumerate(top_cm_rows):
            concept_mastery.append({
                'concept': row[0].strip(),
                'score': round(float(row[1] or 0), 1),
                'student_count': int(row[2] or 0),
                'color': color_gradients[idx % len(color_gradients)],
            })
    else:
        inst_cm_rows = db.session.query(
            ConceptMastery.concept,
            func.avg(ConceptMastery.mastery_score).label('avg_score'),
            func.count(ConceptMastery.student_id).label('student_count')
        ).filter(
            ConceptMastery.institution_id == g.institution_id
        ).group_by(ConceptMastery.concept).order_by(
            func.count(ConceptMastery.student_id).desc()
        ).limit(5).all()

        for idx, row in enumerate(inst_cm_rows):
            concept_mastery.append({
                'concept': row[0].strip(),
                'score': round(float(row[1] or 0), 1),
                'student_count': int(row[2] or 0),
                'color': color_gradients[idx % len(color_gradients)],
            })

    # Student Performance Distribution (Donut metrics) from actual cohort data
    rank_score = func.coalesce(StudentRanking.rank_score, 0)
    agg = db.session.query(
        func.sum(case((rank_score >= 75, 1), else_=0)),
        func.sum(case((and_(rank_score >= 60, rank_score < 75), 1), else_=0)),
        func.sum(case((and_(rank_score >= 40, rank_score < 60), 1), else_=0)),
        func.sum(case((rank_score < 40, 1), else_=0)),
    )
    if enrolled_sids:
        agg = agg.filter(StudentRanking.student_id.in_(enrolled_sids))
    first_res = agg.first()
    exc, good, needs, risk = [(int(v or 0)) for v in first_res] if first_res else (0, 0, 0, 0)
    total_ranks = exc + good + needs + risk

    # If no StudentRanking entries exist, calculate distribution from student Grade averages
    if total_ranks == 0 and enrolled_sids:
        student_grades = db.session.query(
            Grade.student_id,
            func.avg(Grade.final_grade).label('avg_grade')
        ).filter(Grade.student_id.in_(enrolled_sids)).group_by(Grade.student_id).all()

        for sg in student_grades:
            avg_val = float(sg[1] or 0)
            if avg_val >= 75:
                exc += 1
            elif avg_val >= 60:
                good += 1
            elif avg_val >= 40:
                needs += 1
            else:
                risk += 1
        total_ranks = exc + good + needs + risk

    if total_ranks == 0:
        total_ranks = len(enrolled_sids)
        exc = 0
        good = 0
        needs = 0
        risk = 0

    well_pct = round(((exc + good) / max(total_ranks, 1)) * 100) if total_ranks > 0 else 0
    student_performance = {
        'total': total_ranks,
        'excellent': exc,
        'good': good,
        'needs_support': needs,
        'at_risk': risk,
        'performing_well_pct': well_pct,
    }

    return jsonify({
        'active_sessions': _enriched_sessions(active_sessions),
        'upcoming_sessions': _enriched_sessions(upcoming_sessions),
        'pending_submissions': pending[:10],
        'recent_submissions': recent_submissions,
        'concept_mastery': concept_mastery,
        'student_performance': student_performance,
        'stats': _dashboard_stats(my_exp_ids, pending, my_section_ids, active_sessions,
                                  graded_pairs=graded_pairs, enrolled_sids=enrolled_sids),
        'recent_activity': _dashboard_activity(my_ss_ids, my_exp_ids, enrolled_sids=enrolled_sids),
        'session_health': _session_health(active_sessions, my_ss_rows),
    }), 200


def _dashboard_stats(my_exp_ids, pending, my_section_ids, active_sessions,
                     graded_pairs=None, enrolled_sids=None):
    """KPI strip with deltas (DB6) — computed from existing timestamps.

    graded_pairs is passed in from the dashboard (the Grade table no longer
    gets scanned a second time per request)."""
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    yesterday = now - timedelta(days=1)

    new_experiments = 0
    if my_exp_ids:
        new_experiments = Experiment.query.filter(
            Experiment.id.in_(my_exp_ids),
            Experiment.created_at >= month_start,
        ).count()

    # Pending-grading delta: finals submitted in the last 24h that are ungraded
    if graded_pairs is None:
        graded_pairs = set()
        if my_exp_ids:
            graded_pairs = {
                (gr.student_id, gr.experiment_id)
                for gr in Grade.query.filter(Grade.experiment_id.in_(my_exp_ids)).all()
            }
    recent_finals = []
    if my_exp_ids:
        recent_finals = CodeAttempt.query.filter(
            CodeAttempt.experiment_id.in_(my_exp_ids),
            CodeAttempt.is_final_submission == True,  # noqa: E712
            CodeAttempt.submitted_at >= yesterday,
        ).all()
    new_pending = sum(
        1 for a in recent_finals if (a.student_id, a.experiment_id) not in graded_pairs
    )

    active_running = None   # "started N min ago" for the live one
    for s in active_sessions:
        if s.started_at:
            active_running = int((now - s.started_at).total_seconds() / 60)
            break

    return {
        'experiment_count': len(my_exp_ids),
        'student_count': len(enrolled_sids) if enrolled_sids is not None else (
            SectionStudent.query.filter(
                SectionStudent.section_id.in_(my_section_ids)
            ).count() if my_section_ids else 0
        ),
        'active_session_count': len(active_sessions),
        'pending_grading_count': len(pending),
        # Deltas (DB6)
        'new_experiments_this_month': new_experiments,
        'new_pending_since_yesterday': new_pending,
        'active_session_started_min_ago': active_running,
        'sections_taught': len(my_section_ids),
    }


def _dashboard_activity(my_ss_ids, my_exp_ids, enrolled_sids=None):
    """
    Recent activity feed (DB3): final submissions, plagiarism raised, sessions
    ended, all-checkpoints-passed, grades saved — last 7 days, 20 rows,
    newest first, each with a deep link. Scoped to the instructor's sections
    and experiments.
    """
    week_ago = datetime.utcnow() - timedelta(days=7)
    events = []

    # Final submissions (CodeAttempt.is_final_submission)
    if my_exp_ids:
        attempt_filter = [
            CodeAttempt.experiment_id.in_(my_exp_ids),
            CodeAttempt.is_final_submission == True,  # noqa: E712
            CodeAttempt.submitted_at >= week_ago,
        ]
        if enrolled_sids is not None:
            attempt_filter.append(CodeAttempt.student_id.in_(enrolled_sids))
        subs = CodeAttempt.query.filter(*attempt_filter).order_by(CodeAttempt.submitted_at.desc()).limit(30).all()
        # Batch lookups once (was 2 queries per submission row)
        act_students = {u.id: u for u in User.query.filter(User.id.in_({a.student_id for a in subs})).all()} if subs else {}
        act_exps = {e.id: e for e in Experiment.query.filter(Experiment.id.in_({a.experiment_id for a in subs})).all()} if subs else {}
        for a in subs:
            u = act_students.get(a.student_id)
            e = act_exps.get(a.experiment_id)
            events.append({
                'type': 'final_submission',
                'title': f'{u.full_name if u else "Student"} submitted {e.title if e else "an experiment"}',
                'detail': f'{a.test_cases_passed or 0}/{a.test_cases_total or 0} test cases passed',
                'link': '/instructor/grading',
                'at': a.submitted_at.isoformat() if a.submitted_at else None,
            })

        # Plagiarism raised
        for pf in (PlagiarismFlag.query.filter(
                PlagiarismFlag.experiment_id.in_(my_exp_ids),
                PlagiarismFlag.detected_at >= week_ago,
        ).order_by(PlagiarismFlag.detected_at.desc()).limit(15).all()):
            events.append({
                'type': 'plagiarism',
                'title': f'Plagiarism flagged — {pf.similarity_pct or 0:.0f}% similarity',
                'detail': 'Review the pairwise match in grading.',
                'link': '/instructor/grading',
                'at': pf.detected_at.isoformat() if pf.detected_at else None,
            })

        # Grades saved (auto-grade or manual) — covers "bulk auto-grade completed"
        grs = Grade.query.filter(
            Grade.experiment_id.in_(my_exp_ids),
            Grade.graded_at >= week_ago,
        ).order_by(Grade.graded_at.desc()).limit(15).all()
        gr_students = {u.id: u for u in User.query.filter(User.id.in_({g.student_id for g in grs})).all()} if grs else {}
        gr_exps = {e.id: e for e in Experiment.query.filter(Experiment.id.in_({g.experiment_id for g in grs})).all()} if grs else {}
        for gr in grs:
            u = gr_students.get(gr.student_id)
            e = gr_exps.get(gr.experiment_id)
            events.append({
                'type': 'graded',
                'title': f'Grade saved for {u.full_name if u else "student"} — {e.title if e else ""}',
                'detail': f'Final: {gr.final_grade if gr.final_grade is not None else "—"}',
                'link': '/instructor/grading',
                'at': gr.graded_at.isoformat() if gr.graded_at else None,
            })

    # Sessions ended
    if my_ss_ids:
        for s in (LabSession.query.filter(
                LabSession.section_subject_id.in_(my_ss_ids),
                LabSession.status == 'ended',
                LabSession.ended_at >= week_ago,
        ).order_by(LabSession.ended_at.desc()).limit(15).all()):
            events.append({
                'type': 'session_ended',
                'title': f'Session ended — {s.title or "Lab"}',
                'detail': 'Reports and grades are ready.',
                'link': '/instructor/sessions',
                'at': s.ended_at.isoformat() if s.ended_at else None,
            })

        # All-checkpoints-passed (positive signal): a (session, student) pair
        # whose verified count equals the experiment's checkpoint total.
        # Batched (perf pass): one capped session load, one checkpoint-count
        # GROUP BY, one column-only progress IN-load — instead of 2 full-row
        # queries per week-active session.
        from app.models.conductor import Checkpoint, CheckpointProgress
        week_sessions = (
            db.session.query(LabSession.id, LabSession.experiment_id,
                             LabSession.started_at)
            .filter(
                LabSession.section_subject_id.in_(my_ss_ids),
                LabSession.started_at >= week_ago,
            )
            .order_by(LabSession.started_at.desc())
            .limit(50).all()
        )
        sess_exp_ids = {ws.experiment_id for ws in week_sessions if ws.experiment_id}
        cp_total_map = {}
        if sess_exp_ids:
            cp_total_map = dict(
                db.session.query(Checkpoint.experiment_id,
                                 func.count(Checkpoint.id))
                .filter(Checkpoint.experiment_id.in_(sess_exp_ids))
                .group_by(Checkpoint.experiment_id).all()
            )
        sess_ids = [ws.id for ws in week_sessions if cp_total_map.get(ws.experiment_id)]
        progress_rows = []
        if sess_ids:
            progress_rows = db.session.query(
                CheckpointProgress.session_id, CheckpointProgress.student_id,
                CheckpointProgress.checkpoint_id, CheckpointProgress.status,
                CheckpointProgress.last_signal_at
            ).filter(
                CheckpointProgress.session_id.in_(sess_ids),
                CheckpointProgress.status.in_(('verified', 'manual_pass')),
            ).all()
        by_session = {}
        for p in progress_rows:
            by_session.setdefault(p.session_id, []).append(p)

        exp_title_cache = {}
        for ws in week_sessions:
            exp_id = ws.experiment_id
            if not exp_id:
                continue
            total_cp = cp_total_map.get(exp_id, 0)
            if not total_cp:
                continue
            verified_by = {}
            latest_signal = {}
            for p in by_session.get(ws.id, []):
                verified_by.setdefault(p.student_id, set()).add(p.checkpoint_id)
                prev = latest_signal.get(p.student_id)
                if p.last_signal_at and (prev is None or p.last_signal_at > prev):
                    latest_signal[p.student_id] = p.last_signal_at
            # Batch user/experiment lookups (was N+1 per checkpoint completion)
            comp_sids = {sid for sid, cps in verified_by.items() if len(cps) >= total_cp}
            if comp_sids:
                comp_users = {uu.id: uu for uu in User.query.filter(User.id.in_(comp_sids)).all()}
                if exp_id not in exp_title_cache:
                    exp_title_cache[exp_id] = Experiment.query.get(exp_id)
                comp_exp = exp_title_cache[exp_id]
                for sid in comp_sids:
                    when = latest_signal.get(sid) or ws.started_at
                    events.append({
                        'type': 'all_checkpoints_passed',
                        'title': f'{comp_users.get(sid).full_name if comp_users.get(sid) else "A student"} completed all checkpoints — {comp_exp.title if comp_exp else "lab"}',
                        'detail': 'All milestones verified. 🎉',
                        'link': '/instructor/students',
                        'at': when.isoformat() if when else None,
                    })

    events.sort(key=lambda ev: ev['at'] or '', reverse=True)
    return events[:20]


def _session_health(active_sessions, my_ss_rows):
    """
    Live health peek for each active session (DB7): class avg focus (latest
    FocusScore per student), checkpoint pass %, proctor alert count,
    not-yet-joined count. Peeks into the Conductor without replacing it.

    Batched (perf pass): the section/enrollment/focus/checkpoint/attendance
    lookups run once across ALL active sessions (IN-clauses + GROUP BYs),
    not 7 queries per session. Active sessions are few, but this keeps the
    dashboard's statement count flat in class size.
    """
    from app.models.conductor import Checkpoint, CheckpointProgress
    out = []
    if not active_sessions:
        return out

    session_ids = [s.id for s in active_sessions]
    ss_map = {ss.id: ss for ss in my_ss_rows}
    sec_ids = {ss.section_id for ss in my_ss_rows
               if ss.id in {s.section_subject_id for s in active_sessions}
               and ss.section_id}

    # enrolled students per section — one query
    enrolled_by_section = {}
    if sec_ids:
        for sec_id, sid in db.session.query(
                SectionStudent.section_id, SectionStudent.student_id
        ).filter(SectionStudent.section_id.in_(sec_ids)).all():
            enrolled_by_section.setdefault(sec_id, set()).add(sid)

    # focus rows for all active sessions at once; latest-per-student dedup in
    # Python (ordered by recorded_at desc). Column-only — FocusScore has
    # multiple JSON signal columns we never read here.
    focus_rows = db.session.query(
        FocusScore.session_id, FocusScore.student_id,
        FocusScore.focus_score, FocusScore.recorded_at
    ).filter(FocusScore.session_id.in_(session_ids)
     ).order_by(FocusScore.recorded_at.desc()).all()
    seen_pairs = set()
    latest_focus = {}
    for fr in focus_rows:
        key = (fr.session_id, fr.student_id)
        if key in seen_pairs:
            continue
        seen_pairs.add(key)
        if fr.focus_score is not None:
            latest_focus.setdefault(fr.session_id, []).append(fr.focus_score)

    # checkpoint totals per experiment — one GROUP BY
    exp_ids = {s.experiment_id for s in active_sessions if s.experiment_id}
    cp_total_map = {}
    if exp_ids:
        cp_total_map = dict(
            db.session.query(Checkpoint.experiment_id, func.count(Checkpoint.id))
            .filter(Checkpoint.experiment_id.in_(exp_ids))
            .group_by(Checkpoint.experiment_id).all()
        )

    # verified checkpoint progress per session — one GROUP BY (joined students
    # filtered in Python against the enrolled set; cheap)
    verified_map = {}
    verified_rows = db.session.query(
        CheckpointProgress.session_id, CheckpointProgress.student_id,
        func.count(CheckpointProgress.id)
    ).filter(
        CheckpointProgress.session_id.in_(session_ids),
        CheckpointProgress.status.in_(('verified', 'manual_pass')),
    ).group_by(CheckpointProgress.session_id,
               CheckpointProgress.student_id).all()
    for v_sid, v_stud, v_count in verified_rows:
        verified_map.setdefault(v_sid, {})[v_stud] = v_count

    # proctor alert counts — one GROUP BY
    proctor_map = {}
    proctor_map = dict(
        db.session.query(ProctorEvent.session_id, func.count(ProctorEvent.id))
        .filter(ProctorEvent.session_id.in_(session_ids))
        .group_by(ProctorEvent.session_id).all()
    )

    # attendance (who joined) per session — one query, column-only
    joined_by_session = {}
    for a_sid, a_stud in db.session.query(
            SessionAttendance.session_id, SessionAttendance.student_id
    ).filter(SessionAttendance.session_id.in_(session_ids)).all():
        joined_by_session.setdefault(a_sid, set()).add(a_stud)

    for s in active_sessions:
        ss = ss_map.get(s.section_subject_id)
        enrolled_ids = enrolled_by_section.get(ss.section_id, set()) if ss else set()

        scores = latest_focus.get(s.id, [])
        avg_focus = round(sum(scores) / len(scores), 1) if scores else None

        total_cp = cp_total_map.get(s.experiment_id, 0) if s.experiment_id else 0
        verified = 0
        if total_cp and enrolled_ids:
            s_verified = verified_map.get(s.id, {})
            verified = sum(c for stud, c in s_verified.items()
                           if stud in enrolled_ids)
        cp_pass_pct = round(verified / (total_cp * len(enrolled_ids)) * 100, 1) \
            if total_cp and enrolled_ids else None

        proctor_count = proctor_map.get(s.id, 0)

        joined_ids = joined_by_session.get(s.id, set())
        not_joined = sum(1 for sid in enrolled_ids if sid not in joined_ids)

        out.append({
            'session_id': s.id,
            'title': s.title,
            'avg_focus': avg_focus,
            'checkpoint_pass_pct': cp_pass_pct,
            'proctor_alerts': proctor_count,
            'not_joined_count': not_joined,
            'enrolled_count': len(enrolled_ids),
        })
    return out


def _enriched_sessions(sessions):
    """Batch version of _enriched_session — the whole page's worth of sessions
    enriched with ~5 queries total instead of 5 per row.

    (The old per-row helper ran Experiment/SectionSubject/Section/Subject
    .query.get() + a SectionStudent count() for EVERY session, so
    GET /instructor/sessions (limit 50) issued ~250 queries per request —
    measured 163 statements / 473ms against live Postgres. This collects the
    id sets and resolves them with IN() + one GROUP BY count.)
    """
    if not sessions:
        return []

    exp_ids   = {s.experiment_id for s in sessions if s.experiment_id}
    ss_ids    = {s.section_subject_id for s in sessions if s.section_subject_id}

    exp_map = (
        {e.id: e for e in Experiment.query.filter(Experiment.id.in_(exp_ids)).all()}
        if exp_ids else {}
    )
    ss_map = (
        {ss.id: ss for ss in SectionSubject.query.filter(
            SectionSubject.id.in_(ss_ids)).all()}
        if ss_ids else {}
    )

    sec_ids   = {ss.section_id for ss in ss_map.values() if ss.section_id}
    subj_ids  = {ss.subject_id for ss in ss_map.values() if ss.subject_id}
    sec_map = (
        {sec.id: sec for sec in Section.query.filter(Section.id.in_(sec_ids)).all()}
        if sec_ids else {}
    )
    subj_map = (
        {sub.id: sub for sub in Subject.query.filter(Subject.id.in_(subj_ids)).all()}
        if subj_ids else {}
    )

    # Enrolled student count per section — one GROUP BY over the joined set,
    # replacing one COUNT query per session row.
    student_count_map = {}
    if sec_ids:
        student_count_map = dict(
            db.session.query(SectionStudent.section_id,
                             func.count(SectionStudent.student_id))
            .filter(SectionStudent.section_id.in_(sec_ids))
            .group_by(SectionStudent.section_id)
            .all()
        )

    out = []
    for s in sessions:
        d = s.to_dict()
        d['started_at'] = s.started_at.isoformat() if s.started_at else None
        d['ended_at'] = s.ended_at.isoformat() if s.ended_at else None
        d['section_subject_id'] = s.section_subject_id
        d['late_join_window_min'] = s.late_join_window_min

        exp = exp_map.get(s.experiment_id)
        d['experiment_title'] = exp.title if exp else 'Unknown experiment'

        ss = ss_map.get(s.section_subject_id)
        section_name = subject_name = None
        student_count = 0
        if ss:
            sec = sec_map.get(ss.section_id)
            subj = subj_map.get(ss.subject_id)
            section_name = sec.name if sec else None
            subject_name = subj.name if subj else None
            student_count = student_count_map.get(ss.section_id, 0)
        d['section_name'] = section_name
        d['subject_name'] = subject_name
        d['student_count'] = student_count
        out.append(d)
    return out


def _enriched_session(s):
    """Single-session convenience wrapper — kept for patch_session and any
    caller that genuinely has one row."""
    return _enriched_sessions([s])[0]


# ── Experiment Management ──────────────────────────────────────────────────────

@instructor_bp.route('/experiments', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_experiments():
    """Experiments for this instructor, paged: ?page=1&per_page=50 (cap 200).

    The old fallback was `if query.count() == 0: query = Experiment.query` —
    a full-table COUNT on every request AND a cross-institution data leak
    (an instructor owning zero experiments saw EVERY institution's). Now the
    fallback is always institution-scoped: own experiments, then any in
    subjects the instructor teaches, then the whole institution (preserves
    the demo-seeding behavior where content is owned by another account).
    """
    subject_id = request.args.get('subject_id')

    if g.role == 'institution_admin':
        base = Experiment.query.filter_by(institution_id=g.institution_id)
    else:
        my_ss_subject_ids = [
            row[0] for row in db.session.query(SectionSubject.subject_id).filter_by(
                institution_id=g.institution_id, instructor_id=g.user_id
            ).distinct().all()
        ]
        owned = Experiment.query.filter_by(institution_id=g.institution_id)
        if my_ss_subject_ids:
            owned = owned.filter(or_(
                Experiment.instructor_id == g.user_id,
                Experiment.subject_id.in_(my_ss_subject_ids)))
        else:
            owned = owned.filter(Experiment.instructor_id == g.user_id)
        if owned.limit(1).first() is not None:
            base = owned
        else:
            # Scoped fallback — never leave the institution boundary.
            base = Experiment.query.filter_by(institution_id=g.institution_id)

    if subject_id:
        base = base.filter_by(subject_id=subject_id)
    base = base.order_by(Experiment.exp_number)

    if request.args.get('page'):
        page     = max(1, int(request.args.get('page', '1') or 1))
        per_page = min(200, max(1, int(request.args.get('per_page', '50') or 50)))
        paged = base.paginate(page=page, per_page=per_page, error_out=False)
        return jsonify({
            'experiments': [e.to_dict() for e in paged.items],
            'total': paged.total, 'page': page,
            'pages': paged.pages, 'per_page': per_page,
        }), 200

    # Legacy flat shape, hard-capped (was unbounded .all())
    return jsonify({
        'experiments': [e.to_dict() for e in base.limit(500).all()],
    }), 200


@instructor_bp.route('/experiments', methods=['POST'])
@require_role('instructor', 'institution_admin')
def create_experiment():
    data = request.get_json() or {}

    # ── Validation 1: concept_tags required and non-empty ─────────────────────
    concept_tags = data.get('concept_tags', [])
    if not isinstance(concept_tags, list) or len(concept_tags) == 0:
        return jsonify({
            'error': 'concept_tags is required and must be a non-empty list.',
            'example': '["arrays", "sorting", "recursion"]'
        }), 400

    # ── Validation 2: difficulty_level must be 1–4 ───────────────────────────
    difficulty_level = data.get('difficulty_level', 1)
    if difficulty_level not in (1, 2, 3, 4):
        return jsonify({
            'error': 'difficulty_level must be 1, 2, 3, or 4.',
            'received': difficulty_level
        }), 400

    # ── Validation 3: rubric weights (5-field, incl. quiz) must sum to 100 ────
    r_tc   = data.get('rubric_test_cases',   60)
    r_lr   = data.get('rubric_lab_report',   20)
    r_cq   = data.get('rubric_code_quality', 10)
    r_viva = data.get('rubric_viva',         10)
    r_quiz = data.get('rubric_quiz',         0)
    if (r_tc + r_lr + r_cq + r_viva + r_quiz) != 100:
        return jsonify({
            'error': 'Rubric weights must sum to exactly 100.',
            'received_sum': r_tc + r_lr + r_cq + r_viva + r_quiz,
            'breakdown': {
                'rubric_test_cases':   r_tc,
                'rubric_lab_report':   r_lr,
                'rubric_code_quality': r_cq,
                'rubric_viva':         r_viva,
                'rubric_quiz':         r_quiz,
            }
        }), 400

    # Required references with clean 400s (was KeyError → 500)
    for req in ('subject_id', 'exp_number', 'title'):
        if not data.get(req):
            return jsonify({'error': f'{req} is required.'}), 400
    if not Subject.query.filter_by(id=data['subject_id'], institution_id=g.institution_id).first():
        return jsonify({'error': 'subject_id not found in your institution'}), 404

    if g.role != 'institution_admin':
        is_assigned = _instructor_ss_query().filter_by(subject_id=data['subject_id']).first()
        if not is_assigned:
            return jsonify({'error': 'You are not assigned to teach this subject.'}), 403

    experiment_type = data.get('experiment_type', 'coding')
    if experiment_type not in ('coding', 'quiz_only', 'mixed', 'reading'):
        return jsonify({'error': 'experiment_type must be coding, quiz_only, mixed or reading'}), 400

    # Experiment numbers identify a lab within a subject — duplicates make the
    # student grade sheet ambiguous.
    dupe = Experiment.query.filter_by(
        subject_id=data['subject_id'], institution_id=g.institution_id,
        exp_number=data['exp_number'],
    ).first()
    if dupe:
        return jsonify({
            'error': f"Experiment {data['exp_number']} already exists in this subject.",
            'existing': {'id': dupe.id, 'title': dupe.title},
        }), 409

    exp = Experiment(
        institution_id=g.institution_id,
        subject_id=data['subject_id'],
        instructor_id=g.user_id,
        exp_number=data['exp_number'],
        title=data['title'],
        aim=data.get('aim'),
        theory=data.get('theory'),
        problem_statement=data.get('problem_statement'),
        input_format=data.get('input_format'),
        output_format=data.get('output_format'),
        difficulty_level=difficulty_level,
        concept_tags=concept_tags,
        allowed_languages=data.get('allowed_languages', ['python', 'cpp', 'c', 'java']),
        is_multi_file=data.get('is_multi_file', False),
        file_structure=data.get('file_structure'),
        experiment_type=experiment_type,
        rubric_test_cases=r_tc,
        rubric_lab_report=r_lr,
        rubric_code_quality=r_cq,
        rubric_viva=r_viva,
        rubric_quiz=r_quiz,
        proctor_defaults=data.get('proctor_defaults') or {},
        enable_viva=data.get('enable_viva', False),
        enable_lockdown=data.get('enable_lockdown', False),
        allow_ai_hints=data.get('allow_ai_hints', True),
        time_limit_sec=data.get('time_limit_sec', 10),
        weightage=data.get('weightage', 1),
        grade_scale=data.get('grade_scale', 100),
        delivery_mode=data.get('delivery_mode', 'lab') if data.get('delivery_mode') in ('lab', 'exam', 'practice') else 'lab',
        available_from=_parse_iso(data.get('available_from')),
        due_at=_parse_iso(data.get('due_at')),
        max_attempts=data.get('max_attempts'),
        pass_threshold=data.get('pass_threshold'),
        shuffle_questions=bool(data.get('shuffle_questions', False)),
    )
    db.session.add(exp)
    db.session.commit()
    return jsonify({'experiment': exp.to_dict()}), 201


@instructor_bp.route('/experiments/<exp_id>', methods=['GET', 'PATCH', 'PUT', 'DELETE'])
@require_role('instructor', 'institution_admin')
def manage_experiment_by_id(exp_id):
    if request.method == 'GET':
        exp = Experiment.query.filter_by(id=exp_id).first()
        if not exp:
            exp = Experiment.query.get(exp_id)
        if not exp:
            return jsonify({'error': 'Experiment not found'}), 404
        return jsonify({'experiment': exp.to_dict()}), 200

    if request.method in ('PATCH', 'PUT'):
        exp = Experiment.query.filter_by(id=exp_id).first()
        if not exp:
            exp = Experiment.query.get(exp_id)
        if not exp:
            return jsonify({'error': 'Experiment not found'}), 404

        data = request.get_json() or {}

        # ── Validation 1: concept_tags if provided must be non-empty list ─────────
        if 'concept_tags' in data:
            if not isinstance(data['concept_tags'], list) or len(data['concept_tags']) == 0:
                return jsonify({
                    'error': 'concept_tags must be a non-empty list.',
                    'example': '["arrays", "sorting"]'
                }), 400

        # ── Validation 2: difficulty_level if provided must be 1–4 ───────────────
        if 'difficulty_level' in data:
            if data['difficulty_level'] not in (1, 2, 3, 4):
                return jsonify({
                    'error': 'difficulty_level must be 1, 2, 3, or 4.',
                    'received': data['difficulty_level']
                }), 400

        # ── Validation 3: if any rubric field sent, validate the full 5-field sum ──
        rubric_fields = ['rubric_test_cases', 'rubric_lab_report', 'rubric_code_quality',
                         'rubric_viva', 'rubric_quiz']
        if any(f in data for f in rubric_fields):
            r_tc   = data.get('rubric_test_cases',   exp.rubric_test_cases)
            r_lr   = data.get('rubric_lab_report',   exp.rubric_lab_report)
            r_cq   = data.get('rubric_code_quality', exp.rubric_code_quality)
            r_viva = data.get('rubric_viva',         exp.rubric_viva)
            r_quiz = data.get('rubric_quiz',         exp.rubric_quiz or 0)
            if (r_tc + r_lr + r_cq + r_viva + r_quiz) != 100:
                return jsonify({
                    'error': 'Rubric weights must sum to exactly 100.',
                    'received_sum': r_tc + r_lr + r_cq + r_viva + r_quiz,
                    'breakdown': {
                        'rubric_test_cases':   r_tc,
                        'rubric_lab_report':   r_lr,
                        'rubric_code_quality': r_cq,
                        'rubric_viva':         r_viva,
                        'rubric_quiz':         r_quiz,
                    }
                }), 400

        if 'experiment_type' in data:
            if data['experiment_type'] not in ('coding', 'quiz_only', 'mixed', 'reading'):
                return jsonify({'error': 'experiment_type must be coding, quiz_only, mixed or reading'}), 400

        allowed_fields = ['title', 'aim', 'theory', 'problem_statement', 'input_format',
                          'output_format', 'difficulty_level', 'concept_tags', 'allowed_languages',
                          'is_multi_file', 'file_structure', 'rubric_test_cases', 'rubric_lab_report',
                          'rubric_code_quality', 'rubric_viva', 'rubric_quiz', 'experiment_type',
                          'enable_viva', 'enable_lockdown',
                          'allow_ai_hints', 'time_limit_sec', 'is_published',
                          'weightage', 'grade_scale',
                          'delivery_mode', 'max_attempts', 'pass_threshold', 'shuffle_questions']
        was_published = bool(exp.is_published)
        for field in allowed_fields:
            if field in data:
                setattr(exp, field, data[field])

        if 'available_from' in data:
            exp.available_from = _parse_iso(data['available_from'])
        if 'due_at' in data:
            exp.due_at = _parse_iso(data['due_at'])

        # ── Staged publishing ──────────────────────────────────────────────
        # First Publish (is_published false→true) freezes a content snapshot that
        # students read. Later edits stay a draft until the instructor Republishes
        # (POST /experiments/<id>/republish). Unpublish just flips the flag.
        if not was_published and exp.is_published:
            publish_experiment_content(exp, commit=False)

        db.session.commit()
        return jsonify({'experiment': exp.to_dict()}), 200

    if request.method == 'DELETE':
        exp = Experiment.query.filter_by(id=exp_id).first()
        if not exp:
            exp = Experiment.query.get(exp_id)
        if not exp:
            return jsonify({'error': 'Experiment not found'}), 404

        # Remove owned children: test cases + content modules (+ quiz questions)
        TestCase.query.filter_by(experiment_id=exp_id).delete()
        for module in ContentModule.query.filter_by(experiment_id=exp_id).all():
            QuizQuestion.query.filter_by(module_id=module.id).delete()
            db.session.delete(module)

        db.session.delete(exp)
        db.session.commit()
        return jsonify({'message': 'Experiment deleted'}), 200


# ── Test Cases ─────────────────────────────────────────────────────────────────

@instructor_bp.route('/experiments/<exp_id>/test-cases', methods=['GET'])
@require_role('instructor', 'institution_admin')
def get_test_cases(exp_id):
    cases = TestCase.query.filter_by(experiment_id=exp_id).all()
    return jsonify({'test_cases': [c.to_dict(include_hidden=True) for c in cases]}), 200


@instructor_bp.route('/experiments/<exp_id>/test-cases', methods=['POST'])
@require_role('instructor', 'institution_admin')
def add_test_case(exp_id):
    data = request.get_json()
    # Support single or batch upload
    cases_data = data if isinstance(data, list) else [data]
    created = []
    for case_data in cases_data:
        tc = TestCase(
            experiment_id=exp_id,
            input_data=case_data.get('input_data', ''),
            expected_output=case_data.get('expected_output', ''),
            is_hidden=case_data.get('is_hidden', False),
            points_weight=case_data.get('points_weight', 1.0),
            description=case_data.get('description'),
        )
        db.session.add(tc)
        created.append(tc)
    db.session.commit()
    return jsonify({'created': len(created)}), 201


# ── AI Test Case Generator ─────────────────────────────────────────────────────

@instructor_bp.route('/experiments/<exp_id>/generate-test-cases', methods=['POST'])
@require_role('instructor', 'institution_admin')
def generate_test_cases(exp_id):
    """Use Groq to auto-generate test cases from problem statement"""
    exp = Experiment.query.filter_by(id=exp_id, institution_id=g.institution_id).first_or_404()
    from app.ai.groq_client import groq_single
    import json, re

    count  = request.get_json().get('count', 6)

    prompt = f"""Generate {count} test cases for this programming problem.
Return ONLY a JSON array (no explanation):
[{{"input": "...", "expected_output": "...", "description": "...", "is_hidden": false}}]
Make 2/3 visible and 1/3 hidden. Cover edge cases.

Problem: {exp.problem_statement}
Input format: {exp.input_format}
Output format: {exp.output_format}"""

    content, model_used, is_fallback, _ = groq_single(
        prompt, pool='quality', max_tokens=800, temperature=0.3
    )
    if is_fallback or content is None:
        return jsonify({'error': 'AI generator temporarily unavailable (all Groq models rate-limited). Try again in a minute.'}), 503

    try:
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        test_cases = json.loads(json_match.group()) if json_match else []
    except Exception:
        return jsonify({'error': 'Could not parse generated test cases'}), 500

    # Save them
    saved = []
    for tc_data in test_cases:
        tc = TestCase(
            experiment_id=exp_id,
            input_data=tc_data.get('input', ''),
            expected_output=tc_data.get('expected_output', ''),
            is_hidden=tc_data.get('is_hidden', False),
            description=tc_data.get('description'),
        )
        db.session.add(tc)
        saved.append(tc_data)
    db.session.commit()

    return jsonify({'generated': len(saved), 'test_cases': saved}), 201


@instructor_bp.route('/experiments/generate-test-cases-preview', methods=['POST'])
@require_role('instructor', 'institution_admin')
def generate_test_cases_preview():
    """Generate test cases from a problem statement WITHOUT persisting.

    Used by the create-experiment page, where no experiment id exists yet.
    The instructor stages the returned cases client-side and they are saved
    (via the normal batch add-test-cases route) once the experiment is created.
    """
    from app.ai.groq_client import groq_single
    import json, re

    data = request.get_json() or {}
    problem = (data.get('problem_statement') or '').strip()
    if not problem:
        return jsonify({'error': 'A problem statement is required to generate test cases.'}), 400
    count = data.get('count', 6)

    prompt = f"""Generate {count} test cases for this programming problem.
Return ONLY a JSON array (no explanation):
[{{"input": "...", "expected_output": "...", "description": "...", "is_hidden": false}}]
Make 2/3 visible and 1/3 hidden. Cover edge cases.

Problem: {problem}
Input format: {data.get('input_format') or ''}
Output format: {data.get('output_format') or ''}"""

    content, model_used, is_fallback, _ = groq_single(
        prompt, pool='quality', max_tokens=800, temperature=0.3
    )
    if is_fallback or content is None:
        return jsonify({'error': 'AI generator temporarily unavailable (all Groq models rate-limited). Try again in a minute.'}), 503

    try:
        json_match = re.search(r'\[.*\]', content, re.DOTALL)
        test_cases = json.loads(json_match.group()) if json_match else []
    except Exception:
        return jsonify({'error': 'Could not parse generated test cases'}), 500

    return jsonify({'test_cases': test_cases, 'count': len(test_cases)}), 200


# ── Session Management ─────────────────────────────────────────────────────────

@instructor_bp.route('/sessions', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_sessions():
    """List this instructor's sessions, paged: ?page=1&per_page=25 (cap 50).

    Legacy shape kept for callers that don't pass `page`: flat 50-row window,
    no total/pages fields — but rows are now batch-enriched (~7 queries for
    the whole page instead of 5 per row).
    """
    # institution_admin sees all; instructor sees only their own section-subjects
    if g.role == 'institution_admin':
        query = LabSession.query.filter_by(institution_id=g.institution_id)
    else:
        my_ss_ids = [
            ss.id for ss in SectionSubject.query.filter_by(
                institution_id=g.institution_id, instructor_id=g.user_id
            ).all()
        ]
        if not my_ss_ids:
            return jsonify({'sessions': [], 'total': 0, 'page': 1,
                            'pages': 1, 'per_page': 25}), 200
        query = LabSession.query.filter(
            LabSession.section_subject_id.in_(my_ss_ids))

    query = query.order_by(LabSession.scheduled_at.desc())

    if request.args.get('page'):
        page     = max(1, int(request.args.get('page', '1') or 1))
        per_page = min(50, max(1, int(request.args.get('per_page', '25') or 25)))
        paged = query.paginate(page=page, per_page=per_page, error_out=False)
        return jsonify({
            'sessions': _enriched_sessions(paged.items),
            'total': paged.total, 'page': page,
            'pages': paged.pages, 'per_page': per_page,
        }), 200

    return jsonify({'sessions': _enriched_sessions(query.limit(50).all())}), 200


@instructor_bp.route('/sessions', methods=['POST'])
@require_role('instructor', 'institution_admin')
def schedule_session():
    data = request.get_json() or {}
    section_subject_id = data.get('section_subject_id')
    experiment_id = data.get('experiment_id')

    if not section_subject_id:
        return jsonify({'error': 'section_subject_id is required (which class this session is for).'}), 400

    # ── Ownership: an instructor can only schedule their OWN section-subjects,
    # and can only attach experiments they authored. institution_admin may
    # schedule for any section-subject in the institution. (Previously this
    # accepted any ids — an instructor could book another instructor's class.)
    ss = SectionSubject.query.filter_by(
        id=section_subject_id, institution_id=g.institution_id).first()
    if not ss:
        return jsonify({'error': 'section_subject_id not found in your institution'}), 404
    if g.role != 'institution_admin' and ss.instructor_id != g.user_id:
        return jsonify({'error': 'That section-subject is not assigned to you.'}), 403

    if experiment_id:
        exp = Experiment.query.filter_by(
            id=experiment_id, institution_id=g.institution_id).first()
        if not exp:
            return jsonify({'error': 'experiment_id not found'}), 404
        if g.role != 'institution_admin' and exp.instructor_id != g.user_id:
            return jsonify({'error': 'That experiment is not yours.'}), 403

    if not data.get('scheduled_at'):
        return jsonify({'error': 'scheduled_at is required (ISO datetime)'}), 400
    try:
        scheduled_at = datetime.fromisoformat(str(data['scheduled_at']).replace('Z', ''))
    except ValueError:
        return jsonify({'error': 'Invalid scheduled_at; use an ISO datetime'}), 400

    room_name = f"vlab-{g.institution_id[:8]}-{uuid.uuid4().hex[:8]}"
    session = LabSession(
        institution_id=g.institution_id,
        section_subject_id=section_subject_id,
        experiment_id=experiment_id,
        title=data.get('title'),
        scheduled_at=scheduled_at,
        duration_minutes=data.get('duration_minutes', 180),
        gate_score_threshold=data.get('gate_score_threshold', 70),
        late_join_window_min=data.get('late_join_window_min', 10),
        catchup_enabled=data.get('catchup_enabled', False),
        catchup_deadline=datetime.fromisoformat(data['catchup_deadline']) if data.get('catchup_deadline') else None,
        focus_ml_enabled=data.get('focus_ml_enabled', False),
        lockdown_enabled=data.get('lockdown_enabled', False),
        jitsi_room_name=room_name,
    )
    db.session.add(session)
    db.session.commit()

    write_audit(g.user_id, g.institution_id, 'instructor_schedule_session', 'session',
                session.id,
                f'Instructor scheduled "{data.get("title") or "lab"}" — '
                f'{datetime.fromisoformat(str(data["scheduled_at"]).replace("Z", "")).isoformat()}')
    return jsonify({'session': session.to_dict()}), 201


@instructor_bp.route('/sessions/<session_id>', methods=['PATCH', 'PUT'])
@require_role('instructor', 'institution_admin')
def patch_session(session_id):
    """Update lab session configuration (title, experiment, schedule, duration, gate threshold, proctor toggles, catchup)."""
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    if session.status == 'active':
        return jsonify({'error': 'Cannot modify a live session.'}), 400

    data = request.get_json() or {}

    if 'title' in data and data['title']:
        session.title = data['title']
    if 'experiment_id' in data:
        if data['experiment_id']:
            exp = Experiment.query.filter_by(id=data['experiment_id'], institution_id=g.institution_id).first()
            if not exp:
                return jsonify({'error': 'Experiment not found.'}), 404
            if g.role == 'instructor' and exp.instructor_id != g.user_id:
                return jsonify({'error': 'That experiment is not yours.'}), 403
            session.experiment_id = exp.id
        else:
            session.experiment_id = None
    if 'scheduled_at' in data and data['scheduled_at']:
        try:
            session.scheduled_at = datetime.fromisoformat(str(data['scheduled_at']).replace('Z', ''))
        except ValueError:
            pass
    if 'duration_minutes' in data:
        session.duration_minutes = int(data['duration_minutes'])
    if 'gate_score_threshold' in data:
        session.gate_score_threshold = int(data['gate_score_threshold'])
    if 'late_join_window_min' in data:
        session.late_join_window_min = int(data['late_join_window_min'])
    if 'catchup_enabled' in data:
        session.catchup_enabled = bool(data['catchup_enabled'])
    if 'catchup_deadline' in data:
        try:
            session.catchup_deadline = (
                datetime.fromisoformat(str(data['catchup_deadline']).replace('Z', ''))
                if data['catchup_deadline'] else None
            )
        except ValueError:
            pass
    if 'focus_ml_enabled' in data:
        session.focus_ml_enabled = bool(data['focus_ml_enabled'])
    if 'lockdown_enabled' in data:
        session.lockdown_enabled = bool(data['lockdown_enabled'])

    db.session.commit()
    return jsonify({'session': _enriched_session(session)}), 200


@instructor_bp.route('/sessions/<session_id>/video-token', methods=['GET'])
@require_role('instructor', 'institution_admin')
def video_token(session_id):
    """
    Mint a LiveKit instructor token on demand — used when opening the video
    room for an ALREADY-ACTIVE session (page refresh, re-entry, or a session
    that went live before this browser loaded). Tenancy-checked.
    """
    from app.livekit_helper import make_token

    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id).first_or_404()
    if session.status != 'active' or not session.jitsi_room_name:
        return jsonify({'error': 'Session is not live.'}), 409

    token = make_token(
        room_name=session.jitsi_room_name,
        identity=f"instructor-{g.user_id[:8]}",
        name=getattr(g, 'full_name', None) or 'Instructor',
        can_publish=True,
        can_subscribe=True,
    )
    if not token:
        # make_token returns None when LIVEKIT_API_KEY/SECRET are missing or
        # the livekit-api package is absent from the running interpreter.
        # Fail loudly (503) instead of 200-with-null so the frontend can
        # show a real error instead of spinning forever.
        return jsonify({'error': 'Video server misconfigured: LiveKit token could not be minted (check LIVEKIT_API_KEY / LIVEKIT_API_SECRET and the livekit-api package).'}), 503
    return jsonify({
        'livekit_token': token,
        'jitsi_room':    session.jitsi_room_name,
        'livekit_url':   current_app.config.get('LIVEKIT_URL', ''),
    }), 200


@instructor_bp.route('/sessions/<session_id>/video-control', methods=['POST'])
@require_role('instructor', 'institution_admin')
def video_control(session_id):
    """
    Server-side LiveKit participant control for the conductor's Student
    Controls panel: mute a student's mic, disable their camera, or remove
    them from the video room. Body: {action, student_id, value?}.
    """
    from app.livekit_helper import control_participant

    data = request.get_json(silent=True) or {}
    action = data.get('action')
    student_id = data.get('student_id')
    value = bool(data.get('value', True))
    if action not in ('mute', 'camera', 'remove') or not student_id:
        return jsonify({'error': 'Invalid action or missing student_id.'}), 400

    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id).first_or_404()
    if session.status != 'active' or not session.jitsi_room_name:
        return jsonify({'error': 'Session is not live.'}), 409

    # Emit media_control event over Socket.IO to student's private room so client immediately syncs
    try:
        from app.sockets.events import socketio
        socketio.emit('media_control', {
            'action': action,
            'value': value,
            'student_id': student_id,
        }, room=f"student_{student_id}")
    except Exception as err:
        current_app.logger.warning(f"Socket emit media_control failed: {err}")

    # If LiveKit room is provisioned, also update the LiveKit track
    if session.jitsi_room_name:
        result = control_participant(
            session.jitsi_room_name, f"student-{student_id[:8]}", action, value)
        if result and result.get('ok'):
            return jsonify(result), 200

    return jsonify({'ok': True, 'detail': f'{action} signal dispatched'}), 200


@instructor_bp.route('/sessions/<session_id>/start', methods=['POST'])
@require_role('instructor', 'institution_admin')
def start_session(session_id):
    """Start session with environment health check"""
    from flask import current_app
    import subprocess

    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    if session.status != 'scheduled':
        return jsonify({'error': f'Session is already {session.status}'}), 400

    # Gate on the code execution engine — warn if Docker is disabled, but don't
    # block session start. Code submission will degrade gracefully if Docker is
    # down; refusing to start the session entirely is too aggressive for dev.
    if current_app.config.get('DOCKER_RUNNER_ENABLED', False):
        try:
            probe = subprocess.run(
                [current_app.config.get('DOCKER_BIN', 'docker'),
                 'version', '--format', '{{.Server.Version}}'],
                capture_output=True, timeout=5,
            )
            if probe.returncode != 0:
                current_app.logger.warning('Docker probe failed — code execution will be unavailable this session')
        except Exception:
            current_app.logger.warning('Docker not reachable — code execution will be unavailable this session')

    # Initialize attendance records and dispatch notifications for all enrolled students
    ss = SectionSubject.query.get(session.section_subject_id)
    students = []
    exp_title = session.title or "Lab Session"
    if ss:
        from app.models.experiment import Experiment
        from app.models.subject import Subject
        from app.models.feedback import Notification

        exp = db.session.get(Experiment, session.experiment_id) if session.experiment_id else None
        if exp and exp.title:
            exp_title = exp.title
        subj = db.session.get(Subject, ss.subject_id) if ss.subject_id else None
        subj_name = subj.name if subj else "your class"

        students = SectionStudent.query.filter_by(section_id=ss.section_id).all()
        for enrollment in students:
            if not SessionAttendance.query.filter_by(
                session_id=session_id, student_id=enrollment.student_id
            ).first():
                db.session.add(SessionAttendance(
                    session_id=session_id,
                    student_id=enrollment.student_id,
                    status='absent'
                ))
            # Persist notification in database for student
            db.session.add(Notification(
                user_id=enrollment.student_id,
                type='session_started',
                title=f"Live Lab Started: {exp_title}",
                message=f"Your instructor started the live session for {subj_name}. Join now to participate!",
                is_read=False,
                created_at=datetime.utcnow()
            ))

    session.status     = 'active'
    session.started_at = datetime.utcnow()
    # Session mode machine (D1) — starts in briefing
    session.current_mode = session.current_mode or 'briefing'
    # Ensure LivePageState exists for pacing
    from app.models.conductor import LivePageState
    if not LivePageState.query.filter_by(session_id=session_id).first():
        lps = LivePageState(session_id=session_id, updated_by=g.user_id)
        db.session.add(lps)
        db.session.flush()
        session.live_page_state_id = lps.id
    db.session.commit()

    # Create LiveKit room and generate instructor JWT token
    livekit_token = None
    if current_app.config.get('LIVEKIT_URL'):
        from app.livekit_helper import create_room, make_token
        create_room(session.jitsi_room_name)   # jitsi_room_name doubles as LiveKit room name
        livekit_token = make_token(
            room_name=session.jitsi_room_name,
            identity=f"instructor-{g.user_id[:8]}",
            name=getattr(g, 'full_name', None) or 'Instructor',
            can_publish=True,
            can_subscribe=True,
        )

    # Broadcast via Socket.io:
    # 1. Direct to enrolled students' personal user rooms
    # 2. Section room
    # 3. Session room
    from app.extensions import socketio
    for enrollment in students:
        socketio.emit('new_notification', {
            'type': 'session_started',
            'title': f"Live Lab Started: {exp_title}",
            'message': f"Your instructor started the live session. Join now to participate!",
            'session_id': session_id,
            'created_at': datetime.utcnow().isoformat() + 'Z',
        }, room=f"user_{enrollment.student_id}")
        socketio.emit('session_started', {
            'session_id': session_id,
            'experiment_id': session.experiment_id,
            'title': exp_title,
            'jitsi_room': session.jitsi_room_name,
        }, room=f"user_{enrollment.student_id}")

    if ss:
        socketio.emit('session_started', {
            'session_id': session_id,
            'experiment_id': session.experiment_id,
            'title': exp_title,
            'jitsi_room': session.jitsi_room_name,
        }, room=f"section_{ss.section_id}")

    socketio.emit('session_started', {
        'session_id':    session_id,
        'experiment_id': session.experiment_id,
        'title':         exp_title,
        'jitsi_room':    session.jitsi_room_name,
        'livekit_token': livekit_token,
    }, room=f"session_{session_id}_students")

    return jsonify({'session': session.to_dict(), 'livekit_token': livekit_token}), 200


@instructor_bp.route('/sessions/<session_id>/end', methods=['POST'])
@require_role('instructor', 'institution_admin')
def end_session(session_id):
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()
    session.status   = 'ended'
    session.ended_at = datetime.utcnow()
    session.current_mode = 'ended'   # D1 terminal mode

    # Finalize attendance statuses
    _finalize_attendance(session_id)

    # Finalize grades (D3) — best-attempt quiz grade + final blend
    try:
        _finalize_session_grades(session_id, session.experiment_id)
    except Exception:
        db.session.rollback()

    db.session.commit()

    # Broadcast session end to all students
    from app.extensions import socketio
    socketio.emit('session_ended', {
        'session_id': session_id,
        'message': 'Session has ended. Please submit if you have not already.'
    }, room=f"session_{session_id}_students")
    socketio.emit('session_mode_changed', {
        'mode': 'ended',
        'rules': {'code': 'read_only', 'quiz': 'locked', 'submit': False, 'proctor': 'off', 'label': 'Ended'},
    }, room=f"session_{session_id}_students")

    # Also notify students in their personal rooms so student dashboards update immediately
    ss = SectionSubject.query.get(session.section_subject_id)
    if ss:
        students = SectionStudent.query.filter_by(section_id=ss.section_id).all()
        for enrollment in students:
            socketio.emit('session_ended', {
                'session_id': session_id,
                'message': 'Session has ended.'
            }, room=f"user_{enrollment.student_id}")

    return jsonify({'status': 'ended'}), 200


def _finalize_session_grades(session_id, experiment_id):
    """Recompute grades for all students in a session (D3). Reuses the
    conductor finalize logic without requiring a route request context."""
    if not experiment_id:
        return
    from app.models.grading import Grade
    from app.models.experiment import ContentModule, ContentProgress
    from app.models.conductor import LivePageState

    exp = Experiment.query.get(experiment_id)
    if not exp:
        return

    rubric = {
        'test_cases':   exp.rubric_test_cases or 0,
        'lab_report':   exp.rubric_lab_report or 0,
        'code_quality': exp.rubric_code_quality or 0,
        'viva':         exp.rubric_viva or 0,
        'quiz':         exp.rubric_quiz or 0,
    }

    attempts = CodeAttempt.query.filter(
        CodeAttempt.session_id == session_id,
        CodeAttempt.experiment_id == experiment_id,
    ).all()
    student_ids = {a.student_id for a in attempts}
    att_rows = SessionAttendance.query.filter_by(session_id=session_id).all()
    student_ids |= {a.student_id for a in att_rows if a.status != 'absent'}

    from app.services.grading_service import sync_student_experiment_grade
    for sid in student_ids:
        sync_student_experiment_grade(sid, experiment_id, session_id=session_id)


def _finalize_attendance(session_id):
    """Apply attendance rules after session ends"""
    attendances = SessionAttendance.query.filter_by(session_id=session_id).all()
    session = LabSession.query.get(session_id)

    for att in attendances:
        if att.override_reason:  # manually overridden — don't touch
            continue
        if not att.joined_at:
            att.status = 'absent'
        elif att.total_time_seconds >= 1800:   # 30 minutes
            att.status = 'present' if not att.is_catchup else 'present'
            # Check if joined late
            if att.joined_at > session.started_at:
                from datetime import timedelta
                late_threshold = session.started_at + timedelta(minutes=session.late_join_window_min)
                if att.joined_at > late_threshold:
                    att.status = 'late'
            if att.status == 'present' and not att.is_active_participant:
                att.status = 'inactive_present'
        else:
            att.status = 'partial'


# ── Live Session Dashboard ─────────────────────────────────────────────────────

@instructor_bp.route('/sessions/<session_id>/dashboard', methods=['GET'])
@require_role('instructor', 'institution_admin')
def live_dashboard(session_id):
    """Current state of all students in session.

    Batched (perf pass): the old code ran 3 queries PER attendance row
    (latest focus, attempt count, User.get) — 60 students = 180+ statements.
    Now ~5 queries total, and the session lookup is institution-scoped
    (previously a guessed session id from another tenant would have returned
    its roster).
    """
    session = LabSession.query.get(session_id)
    if session and session.institution_id != g.institution_id:
        return jsonify({'error': 'Forbidden'}), 403
    if session and g.role == 'instructor':
        my_ss = {ss.id for ss in _instructor_ss_query().all()}
        # admin-scoped demo fallback mirrors my_section_subjects: allow all
        # institution sessions when the instructor teaches none
        if not my_ss:
            my_ss = {ss.id for ss in SectionSubject.query.filter_by(
                institution_id=g.institution_id).all()}
        if session.section_subject_id not in my_ss:
            return jsonify({'error': 'Forbidden'}), 403
    attendances = SessionAttendance.query.filter_by(
        session_id=session_id).all()
    student_ids = {a.student_id for a in attendances}
    if not student_ids:
        return jsonify({
            'session_id': session_id,
            'session_status': session.status if session else None,
            'students': [],
        }), 200

    users = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()}

    # total attempt count per student (same semantics as the old per-row
    # filter_by(student_id).count()) — one GROUP BY
    attempt_map = dict(
        db.session.query(CodeAttempt.student_id, func.count(CodeAttempt.id))
        .filter(CodeAttempt.student_id.in_(student_ids))
        .group_by(CodeAttempt.student_id).all()
    )

    # latest focus score per student for this session — one ordered load,
    # newest-first dedupe in Python (rows bounded by one session's students)
    latest_focus = {}
    for fr in db.session.query(
            FocusScore.student_id, FocusScore.focus_score
    ).filter(FocusScore.session_id == session_id,
             FocusScore.student_id.in_(student_ids)
    ).order_by(FocusScore.recorded_at.desc()).all():
        if fr.student_id not in latest_focus:
            latest_focus[fr.student_id] = fr.focus_score

    students_status = []
    for att in attendances:
        student_user = users.get(att.student_id)
        students_status.append({
            'student_id': att.student_id,
            'full_name': student_user.full_name if student_user else 'Unknown',
            'roll_number': student_user.roll_number if student_user else '',
            'status': att.status,
            'joined_at': att.joined_at.isoformat() if att.joined_at else None,
            'total_time_sec': att.total_time_seconds,
            'focus_score': latest_focus.get(att.student_id),
            'attempt_count': attempt_map.get(att.student_id, 0),
            'is_active': att.is_active_participant,
        })

    return jsonify({
        'session_id': session_id,
        'session_status': session.status if session else None,
        'students': students_status,
    }), 200


# ── Phase-2: Subject grade-summary rollup ─────────────────────────────────────

@instructor_bp.route('/subjects/<subject_id>/grade-summary', methods=['GET'])
@require_role('instructor', 'institution_admin')
def subject_grade_summary(subject_id):
    """Return per-experiment weightage/scale and per-student rollup scores.

    Formula:  subject_score = Σ (experiment_score / grade_scale) × weightage
    experiment_score = the student's best final-submission score for any graded
    task in that experiment (from Grade.final_grade when present, else 0).

    Response:
      {
        "subject": {id, name, code, total_marks},
        "experiments": [{id, title, weightage, grade_scale, exp_number}, ...],
        "students": [
          {
            "student_id": ..., "full_name": ..., "roll_number": ...,
            "experiment_scores": {exp_id: score},   // raw score on that experiment
            "subject_score": float                   // rollup (may exceed total_marks for bonus)
          },
          ...
        ]
      }
    """
    from app.models.grading import Grade
    from app.models.academic import SectionSubject, SectionStudent

    subject = Subject.query.filter_by(
        id=subject_id, institution_id=g.institution_id).first_or_404()

    exps = Experiment.query.filter_by(
        subject_id=subject_id, institution_id=g.institution_id
    ).order_by(Experiment.exp_number).all()

    exp_ids = [e.id for e in exps]

    # Find students enrolled in sections of this subject (optionally filtered by section_id)
    section_id_param = request.args.get('section_id')
    if section_id_param:
        sec_ids = [section_id_param]
    else:
        sec_ids = [ss.section_id for ss in SectionSubject.query.filter_by(subject_id=subject_id).all()]
    enrolled_student_ids = {
        r[0] for r in db.session.query(SectionStudent.student_id).filter(
            SectionStudent.section_id.in_(sec_ids)
        ).all()
    } if sec_ids else set()

    all_grade_objs = Grade.query.filter(Grade.experiment_id.in_(exp_ids)).all() if exp_ids else []
    latest_attempts = (
        CodeAttempt.query.filter(
            CodeAttempt.experiment_id.in_(exp_ids),
            CodeAttempt.is_final_submission == True,
        ).order_by(CodeAttempt.submitted_at.desc()).all()
    ) if exp_ids else []

    attempt_by_stu_exp = {}
    for att in latest_attempts:
        key = (att.student_id, att.experiment_id)
        if key not in attempt_by_stu_exp:
            attempt_by_stu_exp[key] = att

    # student_id → {exp_id: best_grade} and detailed breakdown
    grade_map: dict = {}
    detail_map: dict = {}
    student_ids: set = set(enrolled_student_ids)
    for g_obj in all_grade_objs:
        sid = g_obj.student_id
        eid = g_obj.experiment_id
        if section_id_param and sid not in enrolled_student_ids:
            continue
        student_ids.add(sid)
        val = float(g_obj.final_grade or 0)
        if val >= grade_map.get(sid, {}).get(eid, -1.0):
            grade_map.setdefault(sid, {})[eid] = val
            att = attempt_by_stu_exp.get((sid, eid))
            detail_map.setdefault(sid, {})[eid] = {
                "final_grade": g_obj.final_grade,
                "auto_grade": g_obj.auto_grade,
                "manual_grade": g_obj.manual_grade,
                "viva_grade": g_obj.viva_grade,
                "quiz_grade": g_obj.quiz_grade,
                "code_quality_grade": g_obj.code_quality_grade,
                "manual_feedback": g_obj.manual_feedback,
                "graded_at": g_obj.graded_at.isoformat() if g_obj.graded_at else None,
                "submitted_at": att.submitted_at.isoformat() if att and att.submitted_at else (g_obj.graded_at.isoformat() if g_obj.graded_at else None),
                "language": att.language if att else None,
                "test_cases_passed": att.test_cases_passed if att else None,
                "test_cases_total": att.test_cases_total if att else None,
                "compile_status": att.compile_status if att else "graded",
            }
    for (sid, eid), att in attempt_by_stu_exp.items():
        if section_id_param and sid not in enrolled_student_ids:
            continue
        student_ids.add(sid)
        if eid not in detail_map.get(sid, {}):
            detail_map.setdefault(sid, {})[eid] = {
                "final_grade": None,
                "auto_grade": round((att.test_cases_passed / att.test_cases_total) * 100, 1) if att.test_cases_total else None,
                "manual_grade": None,
                "viva_grade": None,
                "quiz_grade": None,
                "code_quality_grade": None,
                "manual_feedback": None,
                "graded_at": None,
                "submitted_at": att.submitted_at.isoformat() if att.submitted_at else None,
                "language": att.language,
                "test_cases_passed": att.test_cases_passed,
                "test_cases_total": att.test_cases_total,
                "compile_status": att.compile_status,
            }

    # Also query standalone published Exams for this subject
    from app.models.exam import Exam, ExamAttempt
    exams = Exam.query.filter_by(subject_id=subject_id, institution_id=g.institution_id, is_published=True).all()
    standalone_exams = [x for x in exams if x.id not in exp_ids]
    exam_grade_map = {}
    if standalone_exams:
        exam_ids = [x.id for x in standalone_exams]
        exam_atts = ExamAttempt.query.filter(
            ExamAttempt.exam_id.in_(exam_ids),
            ExamAttempt.status.in_(['submitted', 'expired'])
        ).all()
        for ea in exam_atts:
            exam_grade_map.setdefault(ea.student_id, {})[ea.exam_id] = max(
                exam_grade_map.get(ea.student_id, {}).get(ea.exam_id, 0.0),
                float(ea.score or 0.0)
            )
            student_ids.add(ea.student_id)

    users = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}

    total_marks = subject.total_marks or 100
    exam_weightage_sum = sum((x.grade_weight or 0.0) * total_marks for x in standalone_exams)

    # The denominator students are graded against counts only what they can
    # actually earn — published items. Unpublished drafts are shown to the
    # instructor for planning under planned_total_weightage, but including them
    # here made the instructor's "out of" disagree with the student's.
    graded_exps = [e for e in exps if getattr(e, 'is_published', False)]
    total_weightage = sum(e.weightage or 0 for e in graded_exps) + exam_weightage_sum
    planned_total_weightage = sum(e.weightage or 0 for e in exps) + exam_weightage_sum

    students_out = []
    for sid in student_ids:
        exp_scores = dict(grade_map.get(sid, {}))
        for x in standalone_exams:
            exp_scores[x.id] = exam_grade_map.get(sid, {}).get(x.id, 0.0)

        rollup = sum(
            (exp_scores.get(e.id, 0) / (e.grade_scale or 100)) * (e.weightage or 0)
            for e in graded_exps
        )
        # Add contribution from standalone exams
        for x in standalone_exams:
            exam_weight = (x.grade_weight or 0.0) * total_marks
            rollup += (exp_scores.get(x.id, 0) / 100.0) * exam_weight

        u = users.get(sid)
        students_out.append({
            'student_id': sid,
            'full_name': u.full_name if u else sid,
            'email': getattr(u, 'email', None) if u else None,
            'roll_number': getattr(u, 'roll_number', None) if u else None,
            'experiment_scores': exp_scores,
            'experiment_details': detail_map.get(sid, {}),
            'subject_score': round(rollup, 2),
        })

    students_out.sort(key=lambda x: (x['full_name'] or '').lower())

    out_items = [
        {
            'id': e.id,
            'exp_number': e.exp_number,
            'title': e.title,
            'delivery_mode': getattr(e, 'delivery_mode', 'lab') or 'lab',
            'weightage': e.weightage,
            'grade_scale': e.grade_scale,
            'rubric': {
                'test_cases': e.rubric_test_cases or 0,
                'lab_report': e.rubric_lab_report or 0,
                'code_quality': e.rubric_code_quality or 0,
                'viva': e.rubric_viva or 0,
                'quiz': e.rubric_quiz or 0,
            },
        }
        for e in exps
    ]
    for idx, x in enumerate(standalone_exams, 1):
        out_items.append({
            'id': x.id,
            'exp_number': len(exps) + idx,
            'title': x.title,
            'delivery_mode': 'exam',
            'weightage': round((x.grade_weight or 0.0) * total_marks, 2),
            'grade_scale': 100,
        })

    return jsonify({
        'subject': {
            'id': subject.id,
            'name': subject.name,
            'code': subject.code,
            'total_marks': total_marks,
            'total_weightage': round(total_weightage, 2),
            'planned_total_weightage': round(planned_total_weightage, 2),
            'over_allocation': total_weightage > total_marks,
        },
        'experiments': out_items,
        'students': students_out,
    }), 200


# ── Grading ────────────────────────────────────────────────────────────────────

@instructor_bp.route('/submissions/<experiment_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_submissions(experiment_id):
    """Rich final submissions + rubric + grade breakdown for one experiment."""
    exp = Experiment.query.get(experiment_id)
    section_id_filter = request.args.get('section_id')
    include_unsubmitted = request.args.get('include_unsubmitted', 'true').lower() != 'false'

    enrolled_filter_ids = None
    if section_id_filter and section_id_filter != 'all':
        enrolled_filter_ids = {
            r[0] for r in db.session.query(SectionStudent.student_id)
            .filter(SectionStudent.section_id == section_id_filter).all()
        }
    elif exp and exp.subject_id:
        sec_ids = [ss.section_id for ss in SectionSubject.query.filter_by(subject_id=exp.subject_id).all()]
        if sec_ids:
            enrolled_filter_ids = {
                r[0] for r in db.session.query(SectionStudent.student_id)
                .filter(SectionStudent.section_id.in_(sec_ids)).all()
            }

    base = CodeAttempt.query.filter_by(
        experiment_id=experiment_id, is_final_submission=True
    ).order_by(CodeAttempt.submitted_at.desc())

    submissions = base.limit(500).all()

    # Keep latest final submission per student
    latest_by_student = {}
    for s in submissions:
        if enrolled_filter_ids is not None and section_id_filter and section_id_filter != 'all' and s.student_id not in enrolled_filter_ids:
            continue
        if s.student_id not in latest_by_student:
            latest_by_student[s.student_id] = s

    # Load all Grade rows for this experiment
    all_grades = Grade.query.filter_by(experiment_id=experiment_id).all()
    grade_by_student = {}
    for g_row in all_grades:
        if enrolled_filter_ids is not None and section_id_filter and section_id_filter != 'all' and g_row.student_id not in enrolled_filter_ids:
            continue
        grade_by_student[g_row.student_id] = g_row

    # Load all ContentModule + ContentProgress rows for this experiment
    exp_modules = {m.id: m for m in ContentModule.query.filter_by(experiment_id=experiment_id).all()}
    cp_rows = ContentProgress.query.filter(
        ContentProgress.module_id.in_(list(exp_modules.keys()))
    ).all() if exp_modules else []
    cp_by_student = {}
    for cp in cp_rows:
        if enrolled_filter_ids is not None and section_id_filter and section_id_filter != 'all' and cp.student_id not in enrolled_filter_ids:
            continue
        mod = exp_modules.get(cp.module_id)
        cp_by_student.setdefault(cp.student_id, []).append({
            'module_id': cp.module_id,
            'module_type': mod.module_type if mod else 'module',
            'module_title': (mod.content_data or {}).get('title') or (mod.module_type.upper() if mod else 'Module'),
            'completed': cp.completed,
            'score': cp.score,
            'completed_at': cp.completed_at.isoformat() if cp.completed_at else None,
        })

    all_sids = set(latest_by_student.keys()) | set(grade_by_student.keys()) | set(cp_by_student.keys())
    if include_unsubmitted and enrolled_filter_ids:
        all_sids |= set(enrolled_filter_ids)

    users = {u.id: u for u in User.query.filter(User.id.in_(list(all_sids))).all()} if all_sids else {}

    result = []
    for sid in all_sids:
        u = users.get(sid)
        att = latest_by_student.get(sid)
        g_row = grade_by_student.get(sid)
        mods = cp_by_student.get(sid, [])

        if att:
            d = att.to_dict()
            files_dict = att.files if isinstance(att.files, dict) else {}
            code_text = "\n\n".join(
                f"// ── {fname} ──\n{fbody}" for fname, fbody in files_dict.items()
            ) if files_dict else ""
            sub_status = 'graded' if (g_row and g_row.final_grade is not None) else 'submitted'
        elif g_row or mods:
            d = {
                'id': f"grade-{g_row.id}" if g_row else f"cp-{sid}",
                'attempt_number': 1,
                'language': 'quiz/module',
                'files': {},
                'compile_status': 'graded' if g_row else 'completed',
                'stdout': None,
                'stderr': None,
                'compile_output': None,
                'test_cases_passed': None,
                'test_cases_total': None,
                'execution_time_ms': None,
                'loc': None,
                'cyclomatic_complexity': None,
                'quality_grade': None,
                'is_final_submission': True,
                'submitted_at': (
                    g_row.graded_at.isoformat() if (g_row and g_row.graded_at)
                    else (mods[0]['completed_at'] if mods else None)
                ),
            }
            code_text = ""
            sub_status = 'graded' if (g_row and g_row.final_grade is not None) else 'submitted'
        else:
            d = {
                'id': f"pending-{sid}",
                'attempt_number': 0,
                'language': '—',
                'files': {},
                'compile_status': 'not_submitted',
                'stdout': None,
                'stderr': None,
                'compile_output': None,
                'test_cases_passed': None,
                'test_cases_total': None,
                'execution_time_ms': None,
                'loc': None,
                'cyclomatic_complexity': None,
                'quality_grade': None,
                'is_final_submission': False,
                'submitted_at': None,
            }
            code_text = ""
            sub_status = 'not_submitted'

        d['student_id'] = sid
        d['session_id'] = (att.session_id if att else (g_row.session_id if g_row else None))
        d['full_name'] = u.full_name if u else 'Unknown'
        d['email'] = getattr(u, 'email', None) if u else None
        d['roll_number'] = u.roll_number if u else ''
        d['submission_status'] = sub_status
        d['code_text'] = code_text
        d['grade_id'] = g_row.id if g_row else None
        d['auto_grade'] = g_row.auto_grade if g_row else (
            round((att.test_cases_passed / att.test_cases_total) * 100, 1)
            if (att and att.test_cases_total) else None
        )
        d['manual_grade'] = g_row.manual_grade if g_row else None
        d['manual_feedback'] = g_row.manual_feedback if g_row else None
        d['viva_grade'] = g_row.viva_grade if g_row else None
        d['quiz_grade'] = g_row.quiz_grade if g_row else None
        d['code_quality_grade'] = g_row.code_quality_grade if g_row else None
        d['hint_deduction'] = g_row.hint_deduction if g_row else 0.0
        d['final_grade'] = g_row.final_grade if g_row else None
        d['graded_at'] = g_row.graded_at.isoformat() if (g_row and g_row.graded_at) else None
        d['is_locked'] = bool(g_row.is_locked) if g_row else False
        d['module_submissions'] = mods
        result.append(d)

    # Sort: submitted/graded first by name, then not_submitted
    result.sort(key=lambda r: (1 if r.get('submission_status') == 'not_submitted' else 0, (r.get('full_name') or '').lower()))

    exp_meta = None
    if exp:
        tcs = TestCase.query.filter_by(experiment_id=exp.id).all()
        exp_meta = {
            'id': exp.id,
            'title': exp.title,
            'exp_number': exp.exp_number,
            'aim': exp.aim,
            'weightage': exp.weightage or 100,
            'grade_scale': exp.grade_scale or 100,
            'rubric': {
                'test_cases': exp.rubric_test_cases or 0,
                'lab_report': exp.rubric_lab_report or 0,
                'code_quality': exp.rubric_code_quality or 0,
                'viva': exp.rubric_viva or 0,
                'quiz': exp.rubric_quiz or 0,
            },
            'test_cases': [{
                'id': tc.id,
                'input_data': tc.input_data,
                'expected_output': tc.expected_output,
                'is_hidden': tc.is_hidden,
                'points': tc.points_weight,
            } for tc in tcs],
        }

    return jsonify({'submissions': result, 'experiment': exp_meta}), 200


@instructor_bp.route('/grades', methods=['POST'])
@require_role('instructor', 'institution_admin')
def save_grade():
    data = request.get_json() or {}
    student_id    = data.get('student_id')
    experiment_id = data.get('experiment_id')
    if not student_id or not experiment_id:
        return jsonify({'error': 'student_id and experiment_id are required.'}), 400

    # Per-component rubric entry: {test_cases|lab_report|code_quality|viva|quiz: 0-100}
    component_scores = data.get('components')
    if component_scores is not None and not isinstance(component_scores, dict):
        return jsonify({'error': 'components must be an object of {component: score}.'}), 400

    # Explicit "graded" ticks: {component: true/false}. An unticked component is
    # excluded from the mark instead of counting as zero.
    assessed = data.get('assessed')
    if assessed is not None and not isinstance(assessed, dict):
        return jsonify({'error': 'assessed must be an object of {component: true/false}.'}), 400

    manual_grade = data.get('manual_grade')
    if manual_grade is not None:
        if isinstance(manual_grade, (dict, list)) or isinstance(manual_grade, bool):
            return jsonify({'error': 'manual_grade must be a single number between 0 and 100.'}), 400
        try:
            float(manual_grade)
        except (TypeError, ValueError):
            return jsonify({'error': 'manual_grade must be a single number between 0 and 100.'}), 400

    grade = Grade.query.filter_by(
        student_id=student_id, experiment_id=experiment_id
    ).first()

    # A viewed grade is locked against silent drift, but an instructor must be
    # able to correct a mark (the lock previously made any typo permanent).
    # Corrections require an explicit force flag and are recorded.
    if grade and grade.is_locked:
        if not data.get('force'):
            return jsonify({
                'error': 'Grade is locked because the student has already viewed it.',
                'hint': "Re-send with force=true to override; the student will see the corrected mark.",
                'is_locked': True,
            }), 409

    from app.services.grading_service import sync_student_experiment_grade
    try:
        grade = sync_student_experiment_grade(
            student_id=student_id,
            experiment_id=experiment_id,
            session_id=data.get('session_id'),
            manual_grade=manual_grade,
            manual_feedback=data.get('manual_feedback'),
            graded_by=g.user_id,
            component_scores=component_scores,
            assessed=assessed,
        )
    except TypeError as exc:
        return jsonify({'error': str(exc)}), 400
    if not grade:
        return jsonify({'error': 'Experiment not found.'}), 404

    out = grade.to_dict()
    out['was_overridden'] = bool(data.get('force'))

    # Send the breakdown back so the screen can show "what made this mark".
    exp = Experiment.query.get(experiment_id)
    if exp:
        rubric = {
            'test_cases':   exp.rubric_test_cases if exp.rubric_test_cases is not None else 60,
            'lab_report':   exp.rubric_lab_report if exp.rubric_lab_report is not None else 20,
            'code_quality': exp.rubric_code_quality if exp.rubric_code_quality is not None else 10,
            'viva':         exp.rubric_viva if exp.rubric_viva is not None else 10,
            'quiz':         exp.rubric_quiz if exp.rubric_quiz is not None else 0,
        }
        scores = {
            'test_cases':   out.get('auto_grade'),
            'lab_report':   out.get('manual_grade'),
            'code_quality': out.get('code_quality_grade'),
            'viva':         out.get('viva_grade'),
            'quiz':         out.get('quiz_grade'),
        }
        out['rubric'] = rubric
        assessed_map = grade.assessed_map(rubric)
        weight_used = grade.assessed_weight(rubric)
        # Contributions are shown as "marks of the experiment's 100", computed on
        # the weight that was actually assessed. contribution_pct is the share of
        # the final mark so the instructor can see what moved it.
        # The final mark is renormalised over the graded weight, so each
        # component's contribution is "marks it adds to the stored final".
        graded_weighted = {}
        for key in rubric:
            if rubric[key] and assessed_map.get(key) and scores.get(key) is not None:
                graded_weighted[key] = scores[key] * rubric[key]
        total_weighted = sum(graded_weighted.values())

        out['breakdown'] = {}
        for key in rubric:
            weight = rubric[key]
            score = scores.get(key)
            graded = bool(weight) and bool(assessed_map.get(key)) and score is not None
            out['breakdown'][key] = {
                'weight': weight,
                'score': score,
                'assessed': bool(weight) and bool(assessed_map.get(key)),
                # marks this component adds to the stored final mark
                'contribution': (round(graded_weighted[key] / weight_used, 2)
                                 if graded and weight_used else 0.0),
                # % of the final mark this component is responsible for
                'contribution_pct': (round(100.0 * graded_weighted[key] / total_weighted, 1)
                                     if graded and total_weighted else 0.0),
                'used': graded,
            }
        out['assessed_weight'] = weight_used
        out['provisional'] = weight_used < 100

    return jsonify({'grade': out}), 200


@instructor_bp.route('/grades/<grade_id>/inline-comment', methods=['POST'])
@require_role('instructor', 'institution_admin')
def add_inline_comment(grade_id):
    data = request.get_json()
    comment = InlineComment(
        grade_id=grade_id,
        file_name=data.get('file_name', 'main'),
        line_number=data['line_number'],
        comment=data['comment'],
    )
    db.session.add(comment)
    db.session.commit()
    return jsonify({'id': comment.id}), 201


# ── Code Replay ────────────────────────────────────────────────────────────────

@instructor_bp.route('/replay/<student_id>/<experiment_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def code_replay(student_id, experiment_id):
    """Get all code versions for replay"""
    versions = CodeVersion.query.filter_by(
        student_id=student_id, experiment_id=experiment_id
    ).order_by(CodeVersion.version_number).all()

    return jsonify({'versions': [{
        'version_number': v.version_number,
        'files': v.files,
        'save_type': v.save_type,
        'saved_at': v.saved_at.isoformat() if v.saved_at else None,
    } for v in versions]}), 200


# ── Plagiarism Flags ───────────────────────────────────────────────────────────

@instructor_bp.route('/plagiarism-flags', methods=['GET'])
@require_role('instructor', 'institution_admin')
def plagiarism_flags():
    exp_id = request.args.get('experiment_id')
    query = PlagiarismFlag.query.filter_by(institution_id=g.institution_id)
    if exp_id:
        query = query.filter_by(experiment_id=exp_id)
    flags = query.filter_by(status='pending').all()
    return jsonify({'flags': [f.to_dict() for f in flags]}), 200


@instructor_bp.route('/plagiarism-flags/<flag_id>', methods=['PATCH'])
@require_role('instructor', 'institution_admin')
def review_flag(flag_id):
    flag = PlagiarismFlag.query.filter_by(
        id=flag_id, institution_id=g.institution_id
    ).first_or_404()
    data = request.get_json()
    flag.status       = data['status']    # cleared | actioned
    flag.review_notes = data.get('review_notes')
    flag.reviewed_by  = g.user_id
    flag.reviewed_at  = datetime.utcnow()
    db.session.commit()
    return jsonify({'flag': flag.to_dict()}), 200


@instructor_bp.route('/sessions/<session_id>/plagiarism', methods=['GET'])
@require_role('instructor', 'institution_admin')
def session_plagiarism(session_id):
    """
    View plagiarism flags for a specific session.
    Returns all flags (pending, cleared, actioned) with student names + similarity %.
    """
    flags = PlagiarismFlag.query.filter_by(
        session_id=session_id, institution_id=g.institution_id
    ).order_by(PlagiarismFlag.similarity_pct.desc()).limit(200).all()

    # Batch user + experiment lookups (perf pass: was 3 queries per flag)
    user_ids = set()
    exp_ids = set()
    for f in flags:
        user_ids.add(f.student_a_id)
        user_ids.add(f.student_b_id)
        if f.experiment_id:
            exp_ids.add(f.experiment_id)
    users = {u.id: u for u in User.query.filter(User.id.in_(user_ids)).all()} if user_ids else {}
    exps  = {e.id: e for e in Experiment.query.filter(Experiment.id.in_(exp_ids)).all()} if exp_ids else {}

    result = []
    for f in flags:
        student_a = users.get(f.student_a_id)
        student_b = users.get(f.student_b_id)
        exp       = exps.get(f.experiment_id)
        result.append({
            'id':             f.id,
            'student_a':      {'id': f.student_a_id, 'name': student_a.full_name if student_a else 'Unknown'},
            'student_b':      {'id': f.student_b_id, 'name': student_b.full_name if student_b else 'Unknown'},
            'experiment':     {'id': f.experiment_id, 'title': exp.title if exp else 'Unknown'},
            'similarity_pct': f.similarity_pct,
            'status':         f.status,
            'detected_at':    f.detected_at.isoformat() if f.detected_at else None,
            'reviewed_by':    f.reviewed_by,
            'reviewed_at':    f.reviewed_at.isoformat() if f.reviewed_at else None,
            'review_notes':   f.review_notes,
        })

    return jsonify({
        'session_id': session_id,
        'total_flags': len(result),
        'pending': sum(1 for r in result if r['status'] == 'pending'),
        'flags': result,
    }), 200


# ── Analytics ─────────────────────────────────────────────────────────────────

@instructor_bp.route('/analytics/section/<section_subject_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def section_analytics(section_subject_id):
    """Holistic ranking for all students in a section-subject"""
    rankings = StudentRanking.query.filter_by(
        section_subject_id=section_subject_id
    ).order_by(StudentRanking.rank_position).all()

    # One batch user lookup — the old loop ran User.query.get() per ranking row.
    users = {
        u.id: u for u in User.query.filter(
            User.id.in_({r.student_id for r in rankings})).all()
    } if rankings else {}

    result = []
    for r in rankings:
        d = r.to_dict()
        d['student_id'] = r.student_id
        u = users.get(r.student_id)
        d['full_name'] = u.full_name if u else 'Unknown'
        d['roll_number'] = u.roll_number if u else ''
        result.append(d)
    return jsonify({'rankings': result}), 200


@instructor_bp.route('/analytics/student/<student_id>/mastery', methods=['GET'])
@require_role('instructor', 'institution_admin')
def student_mastery(student_id):
    masteries = ConceptMastery.query.filter_by(student_id=student_id).all()
    return jsonify({'mastery': [m.to_dict() for m in masteries]}), 200


# ── Session Feedback (anonymous) ────────────────────────────────────────────────

@instructor_bp.route('/sessions/<session_id>/feedback', methods=['GET'])
@require_role('instructor', 'institution_admin')
def session_feedback(session_id):
    """Anonymous student feedback for a session + aggregate averages."""
    LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()

    rows = SessionFeedback.query.filter_by(
        session_id=session_id, institution_id=g.institution_id
    ).order_by(SessionFeedback.submitted_at.desc()).all()

    def avg(field):
        vals = [getattr(f, field) for f in rows if getattr(f, field) is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    return jsonify({
        'session_id': session_id,
        'total': len(rows),
        'averages': {
            'experiment_clarity':  avg('experiment_clarity'),
            'session_pacing':      avg('session_pacing'),
            'ai_hint_helpfulness': avg('ai_hint_helpfulness'),
            'overall_rating':      avg('overall_rating'),
        },
        'feedback': [{
            'id':                  f.id,
            'experiment_clarity':  f.experiment_clarity,
            'session_pacing':      f.session_pacing,
            'ai_hint_helpfulness': f.ai_hint_helpfulness,
            'overall_rating':      f.overall_rating,
            'comment':             f.comment,
            'submitted_at':        f.submitted_at.isoformat() if f.submitted_at else None,
        } for f in rows],
    }), 200

@instructor_bp.route('/feedback-overview', methods=['GET'])
@require_role('instructor', 'institution_admin')
def feedback_overview():
    """Hierarchical student feedback aggregation across Department, Academic Year, Batch, Section, Subject, and Session."""
    from app.models.academic import Batch, AcademicYear, Department

    assignments = _instructor_ss_query().all()
    if not assignments and g.role == 'instructor':
        assignments = SectionSubject.query.filter_by(institution_id=g.institution_id).all()
    if not assignments:
        return jsonify({
            'total': 0,
            'averages': {'overall_rating': None, 'experiment_clarity': None, 'session_pacing': None, 'ai_hint_helpfulness': None},
            'sessions_summary': [],
            'feedback': [],
        }), 200

    subject_ids = {ss.subject_id for ss in assignments if ss.subject_id}
    section_ids = {ss.section_id for ss in assignments if ss.section_id}
    subjects = {s.id: s for s in Subject.query.filter(Subject.id.in_(subject_ids)).all()} if subject_ids else {}
    sections = {s.id: s for s in Section.query.filter(Section.id.in_(section_ids)).all()} if section_ids else {}
    batch_ids = {s.batch_id for s in sections.values() if s.batch_id}
    batches = {b.id: b for b in Batch.query.filter(Batch.id.in_(batch_ids)).all()} if batch_ids else {}
    year_ids = {b.year_id for b in batches.values() if b.year_id}
    years = {y.id: y for y in AcademicYear.query.filter(AcademicYear.id.in_(year_ids)).all()} if year_ids else {}
    dept_ids = ({b.department_id for b in batches.values() if getattr(b, 'department_id', None)} |
                {s.department_id for s in subjects.values() if getattr(s, 'department_id', None)})
    departments = {d.id: d for d in Department.query.filter(Department.id.in_(dept_ids)).all()} if dept_ids else {}

    f_dept = request.args.get('department_id')
    f_year = request.args.get('academic_year')
    f_batch = request.args.get('batch_id')
    f_section = request.args.get('section_id')
    f_subject = request.args.get('subject_id')
    f_session = request.args.get('session_id')

    matching_ss_ids = set()
    ss_meta = {}
    for ss in assignments:
        subj = subjects.get(ss.subject_id)
        sec = sections.get(ss.section_id)
        batch = batches.get(sec.batch_id) if sec else None
        year = years.get(batch.year_id) if batch else None
        dept_id = (getattr(subj, 'department_id', None) if subj else None) or (getattr(batch, 'department_id', None) if batch else None)
        dept = departments.get(dept_id) if dept_id else None
        year_label = year.year_label if year else 'Current Year'

        if f_dept and f_dept != 'all' and dept_id != f_dept and (dept.code if dept else '') != f_dept:
            continue
        if f_year and f_year != 'all' and year_label != f_year:
            continue
        if f_batch and f_batch != 'all' and (batch.id if batch else '') != f_batch:
            continue
        if f_section and f_section != 'all' and ss.section_id != f_section:
            continue
        if f_subject and f_subject != 'all' and ss.subject_id != f_subject:
            continue

        matching_ss_ids.add(ss.id)
        ss_meta[ss.id] = {
            'subject_id': ss.subject_id,
            'subject_name': subj.name if subj else 'Subject',
            'subject_code': subj.code if subj else '',
            'section_id': ss.section_id,
            'section_name': sec.name if sec else 'Section',
            'batch_id': batch.id if batch else None,
            'batch_name': batch.name if batch else 'General Batch',
            'academic_year': year_label,
            'department_id': dept_id,
            'department_name': dept.name if dept else 'General Department',
            'department_code': dept.code if dept else 'GEN',
        }

    if not matching_ss_ids:
        return jsonify({
            'total': 0,
            'averages': {'overall_rating': None, 'experiment_clarity': None, 'session_pacing': None, 'ai_hint_helpfulness': None},
            'sessions_summary': [],
            'feedback': [],
        }), 200

    sess_q = LabSession.query.filter(
        LabSession.institution_id == g.institution_id,
        LabSession.section_subject_id.in_(list(matching_ss_ids))
    )
    if f_session and f_session != 'all':
        sess_q = sess_q.filter(LabSession.id == f_session)
    sessions = sess_q.order_by(LabSession.scheduled_at.desc()).all()
    if not sessions:
        return jsonify({
            'total': 0,
            'averages': {'overall_rating': None, 'experiment_clarity': None, 'session_pacing': None, 'ai_hint_helpfulness': None},
            'sessions_summary': [],
            'feedback': [],
        }), 200

    sess_by_id = {s.id: s for s in sessions}
    exp_ids = {s.experiment_id for s in sessions if s.experiment_id}
    exps = {e.id: e for e in Experiment.query.filter(Experiment.id.in_(list(exp_ids))).all()} if exp_ids else {}

    fb_rows = SessionFeedback.query.filter(
        SessionFeedback.institution_id == g.institution_id,
        SessionFeedback.session_id.in_(list(sess_by_id.keys()))
    ).order_by(SessionFeedback.submitted_at.desc()).all()

    def _avg(items, field):
        vals = [getattr(x, field) for x in items if getattr(x, field) is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    fb_by_session = {}
    for fb in fb_rows:
        fb_by_session.setdefault(fb.session_id, []).append(fb)

    sessions_summary = []
    for s in sessions:
        s_fbs = fb_by_session.get(s.id, [])
        exp = exps.get(s.experiment_id)
        meta = ss_meta.get(s.section_subject_id, {})
        sessions_summary.append({
            'session_id': s.id,
            'experiment_id': s.experiment_id,
            'experiment_title': exp.title if exp else (s.title or 'Lab Session'),
            'exp_number': exp.exp_number if exp else None,
            'scheduled_at': s.scheduled_at.isoformat() if s.scheduled_at else None,
            'status': s.status,
            'response_count': len(s_fbs),
            'overall_rating': _avg(s_fbs, 'overall_rating'),
            'experiment_clarity': _avg(s_fbs, 'experiment_clarity'),
            'session_pacing': _avg(s_fbs, 'session_pacing'),
            'ai_hint_helpfulness': _avg(s_fbs, 'ai_hint_helpfulness'),
            **meta,
        })

    feedback_list = []
    for f in fb_rows:
        s = sess_by_id.get(f.session_id)
        exp = exps.get(s.experiment_id) if s else None
        meta = ss_meta.get(s.section_subject_id, {}) if s else {}
        feedback_list.append({
            'id': f.id,
            'session_id': f.session_id,
            'experiment_title': exp.title if exp else (s.title if s else 'Lab Session'),
            'experiment_clarity': f.experiment_clarity,
            'session_pacing': f.session_pacing,
            'ai_hint_helpfulness': f.ai_hint_helpfulness,
            'overall_rating': f.overall_rating,
            'comment': f.comment,
            'submitted_at': f.submitted_at.isoformat() if f.submitted_at else None,
            **meta,
        })

    return jsonify({
        'total': len(fb_rows),
        'averages': {
            'overall_rating': _avg(fb_rows, 'overall_rating'),
            'experiment_clarity': _avg(fb_rows, 'experiment_clarity'),
            'session_pacing': _avg(fb_rows, 'session_pacing'),
            'ai_hint_helpfulness': _avg(fb_rows, 'ai_hint_helpfulness'),
        },
        'sessions_summary': sessions_summary,
        'feedback': feedback_list,
    }), 200



# ── Viva Review ────────────────────────────────────────────────────────────────

@instructor_bp.route('/vivas', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_vivas():
    """All viva sessions for this instructor's experiments, with student names."""
    status = request.args.get('status')
    exp_id = request.args.get('experiment_id')

    my_exp_ids = [e.id for e in Experiment.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id
    ).all()]
    if not my_exp_ids:
        my_exp_ids = [e.id for e in Experiment.query.filter_by(institution_id=g.institution_id).all()]
    if not my_exp_ids:
        return jsonify({'vivas': []}), 200

    query = VivaSession.query.filter(VivaSession.experiment_id.in_(my_exp_ids))
    if exp_id and exp_id in my_exp_ids:
        query = query.filter_by(experiment_id=exp_id)
    if status:
        query = query.filter_by(status=status)
    vivas = query.order_by(VivaSession.created_at.desc()).limit(200).all()

    student_ids = {v.student_id for v in vivas}
    students = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}
    exps = {e.id: e for e in Experiment.query.filter(Experiment.id.in_(my_exp_ids)).all()}

    result = []
    for v in vivas:
        u = students.get(v.student_id)
        exp = exps.get(v.experiment_id)
        result.append({
            'id':            v.id,
            'student_id':    v.student_id,
            'full_name':     u.full_name if u else 'Unknown',
            'roll_number':   u.roll_number if u else '',
            'experiment_id': v.experiment_id,
            'experiment':    exp.title if exp else 'Unknown',
            'total_score':   v.total_score,
            'status':        v.status,
            'question_count': len(v.questions) if v.questions else 0,
            'started_at':    v.started_at.isoformat() if v.started_at else None,
            'completed_at':  v.completed_at.isoformat() if v.completed_at else None,
        })
    return jsonify({'vivas': result}), 200


@instructor_bp.route('/vivas/<viva_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def viva_detail(viva_id):
    """Viva session with questions + each student answer and AI feedback."""
    viva = VivaSession.query.get_or_404(viva_id)
    exp = Experiment.query.get(viva.experiment_id)
    if not exp or exp.instructor_id != g.user_id:
        return jsonify({'error': 'Not your experiment'}), 403

    student = User.query.get(viva.student_id)
    answers = sorted(viva.answers.all(), key=lambda a: a.question_index)

    return jsonify({
        'viva': {
            'id':           viva.id,
            'student_id':   viva.student_id,
            'full_name':    student.full_name if student else 'Unknown',
            'experiment':   exp.title,
            'questions':    viva.questions,
            'total_score':  viva.total_score,
            'status':       viva.status,
            'completed_at': viva.completed_at.isoformat() if viva.completed_at else None,
        },
        'answers': [{
            'question_index': a.question_index,
            'question_text':  a.question_text,
            'answer_text':    a.answer_text,
            'score':          a.score,
            'ai_feedback':    a.ai_feedback,
            'submitted_at':   a.submitted_at.isoformat() if a.submitted_at else None,
        } for a in answers],
    }), 200


# ── Catch-Up Overview ──────────────────────────────────────────────────────────

@instructor_bp.route('/catchups', methods=['GET'])
@require_role('instructor', 'institution_admin')
def catchup_overview():
    """Catch-up attempts + catch-up-enabled sessions for this instructor."""
    # Sessions taught by this instructor (via their section-subjects)
    ss_ids = [ss.id for ss in SectionSubject.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id
    ).all()]
    if not ss_ids:
        ss_ids = [ss.id for ss in SectionSubject.query.filter_by(
            institution_id=g.institution_id
        ).all()]
    if not ss_ids:
        return jsonify({'enabled_sessions': [], 'attempts': []}), 200

    sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(ss_ids)
    ).all()

    exp_ids = {s.experiment_id for s in sessions}
    exps = {e.id: e for e in Experiment.query.filter(Experiment.id.in_(exp_ids)).all()} if exp_ids else {}

    # Catch-up attempt counts per session — one GROUP BY (perf pass: the old
    # loop ran a COUNT per catch-up-enabled session).
    catchup_counts = {}
    if sessions:
        catchup_counts = dict(
            db.session.query(SessionAttendance.session_id,
                             func.count(SessionAttendance.student_id))
            .filter(
                SessionAttendance.session_id.in_([s.id for s in sessions]),
                SessionAttendance.is_catchup == True,  # noqa: E712
            )
            .group_by(SessionAttendance.session_id).all()
        )

    enabled_sessions = []
    for s in sessions:
        if not s.catchup_enabled:
            continue
        exp = exps.get(s.experiment_id)
        attempts = catchup_counts.get(s.id, 0)
        expired = bool(s.catchup_deadline and datetime.utcnow() > s.catchup_deadline)
        enabled_sessions.append({
            'session_id':       s.id,
            'experiment':       exp.title if exp else 'Unknown',
            'scheduled_at':     s.scheduled_at.isoformat() if s.scheduled_at else None,
            'catchup_deadline': s.catchup_deadline.isoformat() if s.catchup_deadline else None,
            'expired':          expired,
            'attempts':         attempts,
        })

    # Individual attempts
    session_ids = [s.id for s in sessions]
    attempts_q = SessionAttendance.query.filter(
        SessionAttendance.session_id.in_(session_ids),
        SessionAttendance.is_catchup == True  # noqa: E712
    ).all()
    student_ids = {a.student_id for a in attempts_q}
    students = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}
    sess_by_id = {s.id: s for s in sessions}

    attempts = []
    for a in attempts_q:
        u = students.get(a.student_id)
        sess = sess_by_id.get(a.session_id)
        exp = exps.get(sess.experiment_id) if sess else None
        attempts.append({
            'student_id':    a.student_id,
            'full_name':     u.full_name if u else 'Unknown',
            'roll_number':   u.roll_number if u else '',
            'session_id':    a.session_id,
            'experiment':    exp.title if exp else 'Unknown',
            'status':        a.status,
            'started_at':    a.joined_at.isoformat() if a.joined_at else None,
        })

    return jsonify({'enabled_sessions': enabled_sessions, 'attempts': attempts}), 200


# ── Session creation conflict check (mirrors bulk-schedule rules) ────────────

@instructor_bp.route('/sessions/check-conflict', methods=['POST'])
@require_role('instructor', 'institution_admin')
def check_session_conflict():
    """
    Pre-flight clash check for the session-creation wizard (Step 4).
    Body: {section_subject_id, scheduled_at, duration_minutes, exclude_session_id?}

    Mirrors the bulk-schedule rules exactly:
      * section conflict    — another live session for the same section
                              overlaps the proposed slot
      * instructor conflict — another session taught by this section-subject's
                              instructor overlaps the proposed slot
    Overlap: existing.start < proposed.end AND existing.end > proposed.start
    """
    data = request.get_json() or {}
    ss_id = data.get('section_subject_id')
    try:
        start = datetime.fromisoformat(str(data.get('scheduled_at', '')).replace('Z', ''))
    except ValueError:
        return jsonify({'error': 'scheduled_at is required (ISO datetime)'}), 400
    duration = int(data.get('duration_minutes') or 60)
    end = start + timedelta(minutes=duration)
    exclude = data.get('exclude_session_id')

    ss = SectionSubject.query.filter_by(
        id=ss_id, institution_id=g.institution_id).first()
    if not ss:
        return jsonify({'error': 'section_subject_id not found in your institution'}), 404

    # Candidate sessions: same section OR same instructor, not the excluded one
    section_ss_ids = [s.id for s in SectionSubject.query.filter_by(
        institution_id=g.institution_id, section_id=ss.section_id).all()]

    cand_ids = set(section_ss_ids) | {ss.id}
    q = LabSession.query.filter(
        LabSession.section_subject_id.in_(cand_ids),
        LabSession.status.in_(('scheduled', 'active')),
        LabSession.scheduled_at < end,
    )
    if exclude:
        q = q.filter(LabSession.id != exclude)
    candidates = q.limit(100).all()

    # Batch the per-conflict SectionSubject/Subject lookups (perf pass: the old
    # loop ran SectionSubject.query.get + a lazy subject join per candidate).
    other_ss_ids = {s.section_subject_id for s in candidates
                    if s.section_subject_id != ss.id}
    other_ss_subject = {}
    if other_ss_ids:
        for ss_id_, subj_name in db.session.query(
                SectionSubject.id, Subject.name
        ).outerjoin(Subject, Subject.id == SectionSubject.subject_id
        ).filter(SectionSubject.id.in_(other_ss_ids)).all():
            other_ss_subject[ss_id_] = subj_name

    conflicts = []
    for s in candidates:
        s_end = s.scheduled_at + timedelta(minutes=s.duration_minutes or 0)
        if s.scheduled_at >= end or s_end <= start:
            continue   # no overlap
        if s.section_subject_id == ss.id:
            reason = 'Section clash'
        else:
            subj_name = other_ss_subject.get(s.section_subject_id) or 'another'
            reason = f'Instructor clash — {subj_name} lab at the same time'
        conflicts.append({
            'session_id':    s.id,
            'reason':        reason,
            'title':         s.title or 'Lab session',
            'scheduled_at':  s.scheduled_at.isoformat() + 'Z' if s.scheduled_at else None,
            'duration':      s.duration_minutes,
        })

    return jsonify({'conflicts': conflicts, 'clear': len(conflicts) == 0}), 200


# ── Instructor Announcements & Engagement ───────────────────────────────────

@instructor_bp.route('/announcements', methods=['GET'])
@require_role('instructor', 'institution_admin')
def instructor_announcements():
    """
    List announcements for this instructor:
    1. Institutional announcements sent to 'all' or 'instructors'
    2. Announcements authored by this instructor

    Perf pass: hard-capped at 100 newest (was unbounded .all()), and the
    per-announcement read/liked interaction is resolved in ONE query for the
    whole page instead of one .first() per row via to_dict().
    """
    from app.models.announcement import Announcement, AnnouncementInteraction
    iid = g.institution_id

    announcements = (
        Announcement.query.filter_by(institution_id=iid, status='sent')
        .filter(
            or_(
                Announcement.target.in_(('all', 'instructors', 'everyone')),
                Announcement.author_id == g.user_id,
            )
        )
        .order_by(Announcement.sent_at.desc(), Announcement.created_at.desc())
        .limit(100).all()
    )

    # One interaction lookup for the page (was N+1 via to_dict)
    my_interactions = {}
    if announcements:
        for it in AnnouncementInteraction.query.filter(
            AnnouncementInteraction.announcement_id.in_([a.id for a in announcements]),
            AnnouncementInteraction.user_id == g.user_id,
        ).all():
            my_interactions[it.announcement_id] = it

    results = []
    unread_count = 0
    for a in announcements:
        item = a.to_dict(current_user_id=None)   # don't re-query per row
        it = my_interactions.get(a.id)
        item['is_read'] = bool(it and it.read_at is not None)
        item['is_liked'] = bool(it and it.liked)
        item['read_at'] = it.read_at.isoformat() + 'Z' if (it and it.read_at) else None
        if not item['is_read']:
            unread_count += 1
        results.append(item)

    return jsonify({
        'announcements': results,
        'unread_count': unread_count,
        'total': len(results),
    }), 200


@instructor_bp.route('/announcements/<announcement_id>/read', methods=['POST'])
@require_role('instructor', 'institution_admin')
def mark_instructor_announcement_read(announcement_id):
    """
    Mark an announcement as read by the instructor.
    """
    from app.models.announcement import Announcement, AnnouncementInteraction
    from app.models.feedback import Notification

    ann = Announcement.query.filter_by(id=announcement_id, institution_id=g.institution_id).first_or_404()

    interaction = AnnouncementInteraction.query.filter_by(
        announcement_id=ann.id, user_id=g.user_id
    ).first()

    first_time = False
    if not interaction:
        interaction = AnnouncementInteraction(
            announcement_id=ann.id,
            user_id=g.user_id,
            read_at=datetime.utcnow(),
            liked=False,
        )
        db.session.add(interaction)
        first_time = True
    elif not interaction.read_at:
        interaction.read_at = datetime.utcnow()
        first_time = True

    if first_time:
        ann.views_count = (ann.views_count or 0) + 1

    Notification.query.filter_by(user_id=g.user_id, title=ann.title).update({'is_read': True})
    db.session.commit()

    return jsonify({
        'message': 'Marked read',
        'is_read': True,
        'views_count': ann.views_count,
        'read_at': interaction.read_at.isoformat() + 'Z',
    }), 200


@instructor_bp.route('/announcements/<announcement_id>/like', methods=['POST'])
@require_role('instructor', 'institution_admin')
def toggle_instructor_announcement_like(announcement_id):
    """
    Toggle like for an announcement.
    """
    from app.models.announcement import Announcement, AnnouncementInteraction

    ann = Announcement.query.filter_by(id=announcement_id, institution_id=g.institution_id).first_or_404()

    interaction = AnnouncementInteraction.query.filter_by(
        announcement_id=ann.id, user_id=g.user_id
    ).first()

    if not interaction:
        interaction = AnnouncementInteraction(
            announcement_id=ann.id,
            user_id=g.user_id,
            read_at=datetime.utcnow(),
            liked=True,
        )
        db.session.add(interaction)
        ann.views_count = (ann.views_count or 0) + 1
        ann.likes_count = (ann.likes_count or 0) + 1
    else:
        interaction.liked = not interaction.liked
        if interaction.liked:
            ann.likes_count = (ann.likes_count or 0) + 1
        else:
            ann.likes_count = max(0, (ann.likes_count or 1) - 1)

    db.session.commit()

    return jsonify({
        'liked': interaction.liked,
        'likes_count': ann.likes_count,
    }), 200

