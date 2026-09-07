"""
Instructor Blueprint
Handles: experiments, sessions, live monitoring, grading, viva, analytics
"""
from flask import Blueprint, request, jsonify, g, current_app
from app.auth.utils import require_role
from app.extensions import db
from app.models.experiment import Experiment, TestCase, ContentModule, QuizQuestion
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt, CodeVersion
from app.models.grading import Grade, InlineComment, VivaSession
from app.models.knowledge import StudentRanking, ConceptMastery, FocusScore
from app.models.feedback import PlagiarismFlag, SessionFeedback
from app.models.academic import SectionSubject, Section, SectionStudent
from app.models.subject import Subject
from app.models.user import User
from datetime import datetime, timedelta
import uuid

instructor_bp = Blueprint('instructor', __name__)


# ── Instructor Dashboard + Teaching Assignments ────────────────────────────────

@instructor_bp.route('/section-subjects', methods=['GET'])
@require_role('instructor', 'institution_admin')
def my_section_subjects():
    """All section-subjects assigned to this instructor (with names + headcount)."""
    from sqlalchemy import func
    from app.models.subject import Subject
    from app.models.academic import Section, SectionStudent

    if g.role == 'institution_admin':
        assignments = SectionSubject.query.filter_by(institution_id=g.institution_id).all()
    else:
        assignments = SectionSubject.query.filter_by(
            institution_id=g.institution_id, instructor_id=g.user_id
        ).all()
        if not assignments:
            assignments = SectionSubject.query.filter_by(institution_id=g.institution_id).all()

    if not assignments:
        return jsonify({'section_subjects': []}), 200

    subject_ids = {ss.subject_id for ss in assignments if ss.subject_id}
    section_ids = {ss.section_id for ss in assignments if ss.section_id}

    subjects = {s.id: s for s in Subject.query.filter(Subject.id.in_(subject_ids)).all()} if subject_ids else {}
    sections = {s.id: s for s in Section.query.filter(Section.id.in_(section_ids)).all()} if section_ids else {}

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
        result.append({
            'section_subject_id': ss.id,
            'subject_id': ss.subject_id,
            'subject_name': subject.name if subject else '',
            'subject_code': subject.code if subject else '',
            'icon': (getattr(subject, 'icon', None) or 'datastruct') if subject else 'datastruct',
            'subject_icon': (getattr(subject, 'icon', None) or 'datastruct') if subject else 'datastruct',
            'description': subject.description if subject else '',
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
    """Aggregate stats for the instructor dashboard."""
    now = datetime.utcnow()

    # Only sessions whose section-subject this instructor teaches
    my_ss_ids = [
        ss.id for ss in SectionSubject.query.filter_by(
            institution_id=g.institution_id, instructor_id=g.user_id
        ).all()
    ]

    active_sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(my_ss_ids),
        LabSession.status == 'active',
    ).all() if my_ss_ids else []
    upcoming_sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(my_ss_ids),
        LabSession.status == 'scheduled',
        LabSession.scheduled_at >= now,
    ).order_by(LabSession.scheduled_at.asc()).limit(5).all() if my_ss_ids else []

    my_exp_ids = [
        e.id for e in Experiment.query.filter_by(
            institution_id=g.institution_id, instructor_id=g.user_id
        ).all()
    ]

    # Students across the instructor's assigned sections
    my_section_ids = [
        ss.section_id for ss in SectionSubject.query.filter_by(
            institution_id=g.institution_id, instructor_id=g.user_id
        ).all()
    ]
    student_count = SectionStudent.query.filter(
        SectionStudent.section_id.in_(my_section_ids)
    ).count() if my_section_ids else 0

    # Pending grading: final submissions with no Grade row yet
    pending = []
    if my_exp_ids:
        graded_pairs = {
            (gr.student_id, gr.experiment_id)
            for gr in Grade.query.filter(Grade.experiment_id.in_(my_exp_ids)).all()
        }
        finals = CodeAttempt.query.filter(
            CodeAttempt.experiment_id.in_(my_exp_ids),
            CodeAttempt.is_final_submission == True,  # noqa: E712
        ).order_by(CodeAttempt.submitted_at.desc()).all()
        # Batch user + experiment lookups (was N+1 per submission)
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

    return jsonify({
        'active_sessions': [_enriched_session(s) for s in active_sessions],
        'upcoming_sessions': [_enriched_session(s) for s in upcoming_sessions],
        'pending_submissions': pending[:10],
        'stats': _dashboard_stats(my_exp_ids, pending, my_section_ids, active_sessions),
        'recent_activity': _dashboard_activity(my_ss_ids, my_exp_ids),
        'session_health': _session_health(active_sessions, my_ss_ids),
    }), 200


def _dashboard_stats(my_exp_ids, pending, my_section_ids, active_sessions):
    """KPI strip with deltas (DB6) — computed from existing timestamps."""
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
        'student_count': SectionStudent.query.filter(
            SectionStudent.section_id.in_(my_section_ids)
        ).count() if my_section_ids else 0,
        'active_session_count': len(active_sessions),
        'pending_grading_count': len(pending),
        # Deltas (DB6)
        'new_experiments_this_month': new_experiments,
        'new_pending_since_yesterday': new_pending,
        'active_session_started_min_ago': active_running,
        'sections_taught': len(my_section_ids),
    }


def _dashboard_activity(my_ss_ids, my_exp_ids):
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
        subs = CodeAttempt.query.filter(
            CodeAttempt.experiment_id.in_(my_exp_ids),
            CodeAttempt.is_final_submission == True,  # noqa: E712
            CodeAttempt.submitted_at >= week_ago,
        ).order_by(CodeAttempt.submitted_at.desc()).limit(30).all()
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
        from app.models.conductor import Checkpoint, CheckpointProgress
        for s in (LabSession.query.filter(
                LabSession.section_subject_id.in_(my_ss_ids),
                LabSession.started_at >= week_ago,
        ).all()):
            exp_id = s.experiment_id
            if not exp_id:
                continue
            total_cp = Checkpoint.query.filter_by(experiment_id=exp_id).count()
            if not total_cp:
                continue
            progress = CheckpointProgress.query.filter_by(session_id=s.id).all()
            verified_by = {}
            latest_signal = {}
            for p in progress:
                if p.status in ('verified', 'manual_pass'):
                    verified_by.setdefault(p.student_id, set()).add(p.checkpoint_id)
                    prev = latest_signal.get(p.student_id)
                    if p.last_signal_at and (prev is None or p.last_signal_at > prev):
                        latest_signal[p.student_id] = p.last_signal_at
            # Batch user/experiment lookups (was N+1 per checkpoint completion)
            comp_sids = {sid for sid, cps in verified_by.items() if len(cps) >= total_cp}
            if comp_sids:
                comp_users = {uu.id: uu for uu in User.query.filter(User.id.in_(comp_sids)).all()}
                comp_exp = Experiment.query.get(exp_id)
                for sid in comp_sids:
                    when = latest_signal.get(sid) or s.started_at
                    events.append({
                        'type': 'all_checkpoints_passed',
                        'title': f'{comp_users.get(sid).full_name if comp_users.get(sid) else "A student"} completed all checkpoints — {comp_exp.title if comp_exp else "lab"}',
                        'detail': 'All milestones verified. 🎉',
                        'link': '/instructor/students',
                        'at': when.isoformat() if when else None,
                    })

    events.sort(key=lambda ev: ev['at'] or '', reverse=True)
    return events[:20]


def _session_health(active_sessions, my_ss_ids):
    """
    Live health peek for each active session (DB7): class avg focus (latest
    FocusScore per student), checkpoint pass %, proctor alert count,
    not-yet-joined count. Peeks into the Conductor without replacing it.
    """
    from app.models.conductor import Checkpoint, CheckpointProgress
    out = []
    for s in active_sessions:
        enrolled_ids = []
        ss = SectionSubject.query.get(s.section_subject_id)
        if ss:
            enrolled_ids = [r.student_id for r in SectionStudent.query.filter_by(
                section_id=ss.section_id).all()]

        # Latest focus score per student, then class average
        focus_rows = FocusScore.query.filter_by(session_id=s.id).order_by(
            FocusScore.recorded_at.desc()).all()
        seen, latest_focus = set(), []
        for f in focus_rows:
            if f.student_id in seen:
                continue
            seen.add(f.student_id)
            if f.focus_score is not None:
                latest_focus.append(f.focus_score)
        avg_focus = round(sum(latest_focus) / len(latest_focus), 1) if latest_focus else None

        # Checkpoint pass %
        total_cp = Checkpoint.query.filter_by(experiment_id=s.experiment_id).count() if s.experiment_id else 0
        verified = 0
        if total_cp and enrolled_ids:
            verified = CheckpointProgress.query.filter(
                CheckpointProgress.session_id == s.id,
                CheckpointProgress.student_id.in_(enrolled_ids),
                CheckpointProgress.status.in_(('verified', 'manual_pass')),
            ).count()
        cp_pass_pct = round(verified / (total_cp * len(enrolled_ids)) * 100, 1) \
            if total_cp and enrolled_ids else None

        # Proctor alerts
        from app.models.proctor_event import ProctorEvent
        proctor_count = ProctorEvent.query.filter_by(session_id=s.id).count()

        # Not yet joined
        joined_ids = {a.student_id for a in SessionAttendance.query.filter_by(
            session_id=s.id).all()}
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


def _enriched_session(s):
    """Session dict with human-readable labels for the frontend."""
    d = s.to_dict()
    d['started_at'] = s.started_at.isoformat() if s.started_at else None
    d['ended_at'] = s.ended_at.isoformat() if s.ended_at else None
    d['section_subject_id'] = s.section_subject_id
    d['late_join_window_min'] = s.late_join_window_min

    exp = Experiment.query.get(s.experiment_id)
    d['experiment_title'] = exp.title if exp else 'Unknown experiment'

    ss = SectionSubject.query.get(s.section_subject_id)
    section_name = subject_name = None
    student_count = 0
    if ss:
        sec = Section.query.get(ss.section_id)
        subj = Subject.query.get(ss.subject_id)
        section_name = sec.name if sec else None
        subject_name = subj.name if subj else None
        student_count = SectionStudent.query.filter_by(section_id=ss.section_id).count()
    d['section_name'] = section_name
    d['subject_name'] = subject_name
    d['student_count'] = student_count
    return d


# ── Experiment Management ──────────────────────────────────────────────────────

@instructor_bp.route('/experiments', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_experiments():
    subject_id = request.args.get('subject_id')
    if g.role == 'institution_admin':
        query = Experiment.query.filter_by(institution_id=g.institution_id)
    else:
        query = Experiment.query.filter_by(institution_id=g.institution_id)
        if query.count() == 0:
            query = Experiment.query
    if subject_id:
        query = query.filter_by(subject_id=subject_id)
    exps = query.order_by(Experiment.exp_number).all()
    return jsonify({'experiments': [e.to_dict() for e in exps]}), 200


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

    experiment_type = data.get('experiment_type', 'coding')
    if experiment_type not in ('coding', 'quiz_only', 'mixed', 'reading'):
        return jsonify({'error': 'experiment_type must be coding, quiz_only, mixed or reading'}), 400

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
                          'weightage', 'grade_scale']
        was_published = bool(exp.is_published)
        for field in allowed_fields:
            if field in data:
                setattr(exp, field, data[field])

        # ── Staged publishing ──────────────────────────────────────────────
        # First Publish (is_published false→true) freezes a content snapshot that
        # students read. Later edits stay a draft until the instructor Republishes
        # (POST /experiments/<id>/republish). Unpublish just flips the flag.
        if not was_published and exp.is_published:
            from app.services.content_publish import publish_experiment_content
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
    # institution_admin sees all; instructor sees only their own section-subjects
    if g.role == 'institution_admin':
        sessions = LabSession.query.filter_by(
            institution_id=g.institution_id
        ).order_by(LabSession.scheduled_at.desc()).limit(50).all()
    else:
        my_ss_ids = [
            ss.id for ss in SectionSubject.query.filter_by(
                institution_id=g.institution_id, instructor_id=g.user_id
            ).all()
        ]
        sessions = LabSession.query.filter(
            LabSession.section_subject_id.in_(my_ss_ids)
        ).order_by(LabSession.scheduled_at.desc()).limit(50).all() if my_ss_ids else []
    return jsonify({'sessions': [_enriched_session(s) for s in sessions]}), 200


@instructor_bp.route('/sessions', methods=['POST'])
@require_role('instructor', 'institution_admin')
def schedule_session():
    data = request.get_json() or {}
    section_subject_id = data.get('section_subject_id')
    experiment_id = data.get('experiment_id')

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

    from app.institution.audit import write_audit
    write_audit(g.user_id, g.institution_id, 'instructor_schedule_session', 'session',
                session.id,
                f'Instructor scheduled "{data.get("title") or "lab"}" — '
                f'{datetime.fromisoformat(str(data["scheduled_at"]).replace("Z", "")).isoformat()}')
    return jsonify({'session': session.to_dict()}), 201


@instructor_bp.route('/sessions/<session_id>', methods=['PATCH', 'PUT'])
@require_role('instructor', 'institution_admin')
def patch_session(session_id):
    """Update lab session configuration (title, experiment, schedule, duration, gate threshold, proctor toggles)."""
    session = LabSession.query.filter_by(
        id=session_id, institution_id=g.institution_id
    ).first_or_404()
    data = request.get_json() or {}

    if 'title' in data and data['title']:
        session.title = data['title']
    if 'experiment_id' in data:
        session.experiment_id = data['experiment_id']
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

    quiz_modules = ContentModule.query.filter_by(
        experiment_id=experiment_id, module_type='quiz').all()

    for sid in student_ids:
        finals = [a for a in attempts if a.student_id == sid and a.is_final_submission]
        best_auto = None
        if finals:
            best_auto = max(
                (a.test_cases_passed / a.test_cases_total * 100 if a.test_cases_total else 0)
                for a in finals
            )
        quality_scores = [a.quality_grade for a in finals if a.quality_grade]
        quality_score = None
        if quality_scores:
            grade_map = {'A': 10, 'B': 8, 'C': 6, 'D': 4, 'E': 2, 'F': 0}
            quality_score = max(grade_map.get(q, 0) for q in quality_scores)

        quiz_scores = []
        for qm in quiz_modules:
            cp = ContentProgress.query.filter_by(student_id=sid, module_id=qm.id).first()
            if cp and cp.score is not None:
                quiz_scores.append(cp.score)
        quiz_grade = round(sum(quiz_scores) / len(quiz_scores), 2) if quiz_scores else None

        grade = Grade.query.filter_by(
            student_id=sid, experiment_id=experiment_id, session_id=session_id).first()
        if not grade:
            grade = Grade(student_id=sid, experiment_id=experiment_id, session_id=session_id)
            db.session.add(grade)
        if best_auto is not None:
            grade.auto_grade = round(best_auto, 2)
        if quality_score is not None:
            grade.code_quality_grade = quality_score
        grade.quiz_grade = quiz_grade
        if not grade.graded_at:
            grade.graded_at = datetime.utcnow()
        grade.calculate_final(rubric)


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
    """Current state of all students in session"""
    attendances = SessionAttendance.query.filter_by(session_id=session_id).all()
    students_status = []

    for att in attendances:
        # Get latest focus score
        latest_focus = FocusScore.query.filter_by(
            student_id=att.student_id, session_id=session_id
        ).order_by(FocusScore.recorded_at.desc()).first()

        # Get latest code attempt count
        attempt_count = CodeAttempt.query.filter_by(
            student_id=att.student_id
        ).count()

        student_user = User.query.get(att.student_id)
        students_status.append({
            'student_id': att.student_id,
            'full_name': student_user.full_name if student_user else 'Unknown',
            'roll_number': student_user.roll_number if student_user else '',
            'status': att.status,
            'joined_at': att.joined_at.isoformat() if att.joined_at else None,
            'total_time_sec': att.total_time_seconds,
            'focus_score': latest_focus.focus_score if latest_focus else None,
            'attempt_count': attempt_count,
            'is_active': att.is_active_participant,
        })

    session = LabSession.query.get(session_id)
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

    subject = Subject.query.filter_by(
        id=subject_id, institution_id=g.institution_id).first_or_404()

    exps = Experiment.query.filter_by(
        subject_id=subject_id, institution_id=g.institution_id
    ).order_by(Experiment.exp_number).all()

    exp_ids = [e.id for e in exps]

    # Fetch the best final grade per (student, experiment)
    from sqlalchemy import func as sqfunc
    grade_rows = (
        db.session.query(
            Grade.student_id,
            Grade.experiment_id,
            sqfunc.max(Grade.final_grade).label('best_grade')
        )
        .filter(Grade.experiment_id.in_(exp_ids))
        .group_by(Grade.student_id, Grade.experiment_id)
        .all()
    ) if exp_ids else []

    # student_id → {exp_id: best_grade}
    grade_map: dict = {}
    student_ids: set = set()
    for row in grade_rows:
        grade_map.setdefault(row.student_id, {})[row.experiment_id] = float(row.best_grade or 0)
        student_ids.add(row.student_id)

    users = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}

    students_out = []
    for sid, exp_scores in grade_map.items():
        rollup = sum(
            (exp_scores.get(e.id, 0) / (e.grade_scale or 100)) * (e.weightage or 0)
            for e in exps
        )
        u = users.get(sid)
        students_out.append({
            'student_id': sid,
            'full_name': u.full_name if u else sid,
            'roll_number': getattr(u, 'roll_number', None) if u else None,
            'experiment_scores': exp_scores,
            'subject_score': round(rollup, 2),
        })

    students_out.sort(key=lambda x: x['full_name'])

    return jsonify({
        'subject': {
            'id': subject.id,
            'name': subject.name,
            'code': subject.code,
            'total_marks': subject.total_marks,
        },
        'experiments': [
            {
                'id': e.id,
                'exp_number': e.exp_number,
                'title': e.title,
                'weightage': e.weightage,
                'grade_scale': e.grade_scale,
            }
            for e in exps
        ],
        'students': students_out,
    }), 200


# ── Grading ────────────────────────────────────────────────────────────────────

@instructor_bp.route('/submissions/<experiment_id>', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_submissions(experiment_id):
    submissions = CodeAttempt.query.filter_by(
        experiment_id=experiment_id, is_final_submission=True
    ).order_by(CodeAttempt.submitted_at.desc()).all()

    student_ids = [s.student_id for s in submissions]
    students = {u.id: u for u in User.query.filter(User.id.in_(student_ids)).all()} if student_ids else {}

    result = []
    for s in submissions:
        d = s.to_dict()
        u = students.get(s.student_id)
        d['student_id'] = s.student_id
        d['session_id'] = s.session_id
        d['full_name'] = u.full_name if u else 'Unknown'
        d['roll_number'] = u.roll_number if u else ''
        result.append(d)
    return jsonify({'submissions': result}), 200


@instructor_bp.route('/grades', methods=['POST'])
@require_role('instructor', 'institution_admin')
def save_grade():
    data = request.get_json()
    student_id    = data['student_id']
    experiment_id = data['experiment_id']

    grade = Grade.query.filter_by(
        student_id=student_id, experiment_id=experiment_id
    ).first()

    if not grade:
        grade = Grade(student_id=student_id, experiment_id=experiment_id,
                      session_id=data.get('session_id'))
        db.session.add(grade)

    if grade.is_locked:
        return jsonify({'error': 'Grade is locked (student has viewed it)'}), 409

    grade.manual_grade    = data.get('manual_grade')
    grade.manual_feedback = data.get('manual_feedback')
    grade.graded_by       = g.user_id
    grade.graded_at       = datetime.utcnow()

    # ── Auto-populate auto_grade from the best code submission ────────────────
    # Pick the final submission with the most test cases passed
    best_submission = CodeAttempt.query.filter_by(
        student_id=student_id,
        experiment_id=experiment_id,
        is_final_submission=True,
    ).order_by(
        CodeAttempt.test_cases_passed.desc()
    ).first()

    if best_submission and best_submission.test_cases_total and best_submission.test_cases_total > 0:
        # auto_grade = % of test cases passed (0–100)
        grade.auto_grade = round(
            (best_submission.test_cases_passed / best_submission.test_cases_total) * 100, 1
        )
        # code_quality_grade: radon quality_grade mapped to 0–10 scale
        quality_map = {'A': 10, 'B': 8, 'C': 6, 'D': 4, 'E': 2, 'F': 0}
        if best_submission.quality_grade:
            grade.code_quality_grade = quality_map.get(best_submission.quality_grade, 5)
    elif best_submission:
        # submitted but no test cases configured — treat as full marks
        grade.auto_grade = 100.0

    # ── Recalculate final from all 4 components ───────────────────────────────
    exp = Experiment.query.get(experiment_id)
    rubric = {
        'test_cases':   exp.rubric_test_cases,
        'lab_report':   exp.rubric_lab_report,
        'code_quality': exp.rubric_code_quality,
        'viva':         exp.rubric_viva,
    }
    grade.calculate_final(rubric)
    db.session.commit()

    return jsonify({'grade': grade.to_dict()}), 200


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
    from app.models.user import User
    from app.models.experiment import Experiment as Exp

    flags = PlagiarismFlag.query.filter_by(
        session_id=session_id, institution_id=g.institution_id
    ).order_by(PlagiarismFlag.similarity_pct.desc()).all()

    result = []
    for f in flags:
        student_a = User.query.get(f.student_a_id)
        student_b = User.query.get(f.student_b_id)
        exp       = Exp.query.get(f.experiment_id)
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

    result = []
    for r in rankings:
        d = r.to_dict()
        d['student_id'] = r.student_id
        u = User.query.get(r.student_id)
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


# ── Viva Review ────────────────────────────────────────────────────────────────

@instructor_bp.route('/vivas', methods=['GET'])
@require_role('instructor', 'institution_admin')
def list_vivas():
    """All viva sessions for this instructor's experiments, with student names."""
    status = request.args.get('status')

    my_exp_ids = [e.id for e in Experiment.query.filter_by(
        institution_id=g.institution_id, instructor_id=g.user_id
    ).all()]
    if not my_exp_ids:
        return jsonify({'vivas': []}), 200

    query = VivaSession.query.filter(VivaSession.experiment_id.in_(my_exp_ids))
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
        return jsonify({'enabled_sessions': [], 'attempts': []}), 200

    sessions = LabSession.query.filter(
        LabSession.section_subject_id.in_(ss_ids)
    ).all()

    exp_ids = {s.experiment_id for s in sessions}
    exps = {e.id: e for e in Experiment.query.filter(Experiment.id.in_(exp_ids)).all()} if exp_ids else {}

    enabled_sessions = []
    for s in sessions:
        if not s.catchup_enabled:
            continue
        exp = exps.get(s.experiment_id)
        attempts = SessionAttendance.query.filter_by(session_id=s.id, is_catchup=True).count()
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
    candidates = q.all()

    conflicts = []
    for s in candidates:
        s_end = s.scheduled_at + timedelta(minutes=s.duration_minutes or 0)
        if s.scheduled_at >= end or s_end <= start:
            continue   # no overlap
        if s.section_subject_id == ss.id:
            reason = 'Section clash'
        else:
            other = SectionSubject.query.get(s.section_subject_id)
            reason = f'Instructor clash — {other.subject.name if other and other.subject else "another"} lab at the same time'
        conflicts.append({
            'session_id':    s.id,
            'reason':        reason,
            'title':         s.title or 'Lab session',
            'scheduled_at':  s.scheduled_at.isoformat() + 'Z' if s.scheduled_at else None,
            'duration':      s.duration_minutes,
        })

    return jsonify({'conflicts': conflicts, 'clear': len(conflicts) == 0}), 200
