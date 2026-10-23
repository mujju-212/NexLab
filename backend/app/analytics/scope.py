"""
Scope Hierarchy Resolver:
Resolves the set of student_ids, experiment_ids, section_subject_ids, and session_ids
across any academic slicing dimension:
  'experiment'  -> Single experiment
  'subject'     -> Subject within curriculum
  'section'     -> Class section
  'year'        -> Academic year / batch
  'department'  -> Academic department
  'institution' -> Entire institution
  'platform'    -> Cross-institution platform
"""
from typing import Dict, List, Optional, Set
from app.extensions import db
from app.models.user import User
from app.models.academic import AcademicYear, Batch, Department, Section, SectionStudent, SectionSubject
from app.models.subject import Subject
from app.models.experiment import Experiment
from app.models.session import LabSession


def resolve_scope_entities(
    scope_level: str,
    scope_id: Optional[str] = None,
    institution_id: Optional[str] = None,
) -> Dict[str, List[str]]:
    """
    Returns a dictionary of resolved ID lists:
    {
        'student_ids': [...],
        'experiment_ids': [...],
        'section_ids': [...],
        'section_subject_ids': [...],
        'session_ids': [...]
    }
    """
    scope_level = (scope_level or 'institution').lower()

    student_ids: Set[str] = set()
    experiment_ids: Set[str] = set()
    section_ids: Set[str] = set()
    ss_ids: Set[str] = set()
    session_ids: Set[str] = set()

    if scope_level == 'experiment' and scope_id:
        experiment_ids.add(scope_id)
        exp = Experiment.query.get(scope_id)
        if exp and exp.subject_id:
            # All sections teaching this subject
            sss = SectionSubject.query.filter_by(subject_id=exp.subject_id).all()
            for s in sss:
                ss_ids.add(s.id)
                section_ids.add(s.section_id)
            if section_ids:
                stud_rows = SectionStudent.query.filter(SectionStudent.section_id.in_(list(section_ids))).all()
                for sr in stud_rows:
                    student_ids.add(sr.student_id)
            sess_rows = LabSession.query.filter(LabSession.experiment_id == scope_id).all()
            for sr in sess_rows:
                session_ids.add(sr.id)

    elif scope_level == 'subject' and scope_id:
        actual_subj_id = scope_id
        ss_match = SectionSubject.query.get(scope_id)
        if ss_match:
            actual_subj_id = ss_match.subject_id
            ss_ids.add(ss_match.id)
            section_ids.add(ss_match.section_id)

        exps = Experiment.query.filter_by(subject_id=actual_subj_id).all()
        for e in exps:
            experiment_ids.add(e.id)
        sss = SectionSubject.query.filter_by(subject_id=actual_subj_id).all()
        for s in sss:
            ss_ids.add(s.id)
            section_ids.add(s.section_id)
        if section_ids:
            stud_rows = SectionStudent.query.filter(SectionStudent.section_id.in_(list(section_ids))).all()
            for sr in stud_rows:
                student_ids.add(sr.student_id)
        if ss_ids:
            sess_rows = LabSession.query.filter(LabSession.section_subject_id.in_(list(ss_ids))).all()
            for sr in sess_rows:
                session_ids.add(sr.id)

    elif scope_level in ('section', 'section_subject') and scope_id:
        actual_section_id = scope_id
        # If scope_id is a section_subject_id, resolve to actual section_id
        ss_match = SectionSubject.query.filter_by(id=scope_id).first()
        if ss_match:
            actual_section_id = ss_match.section_id
            ss_ids.add(ss_match.id)
            sub_exps = Experiment.query.filter_by(subject_id=ss_match.subject_id).all()
            for e in sub_exps:
                experiment_ids.add(e.id)

        section_ids.add(actual_section_id)
        stud_rows = SectionStudent.query.filter_by(section_id=actual_section_id).all()
        for sr in stud_rows:
            student_ids.add(sr.student_id)
        sss = SectionSubject.query.filter_by(section_id=actual_section_id).all()
        for s in sss:
            ss_ids.add(s.id)
            # Find subject experiments
            sub_exps = Experiment.query.filter_by(subject_id=s.subject_id).all()
            for e in sub_exps:
                experiment_ids.add(e.id)
        if ss_ids:
            sess_rows = LabSession.query.filter(LabSession.section_subject_id.in_(list(ss_ids))).all()
            for sr in sess_rows:
                session_ids.add(sr.id)

    elif scope_level in ('year', 'batch') and scope_id:
        # scope_id can be year_id or batch_id
        batches = Batch.query.filter((Batch.id == scope_id) | (Batch.year_id == scope_id)).all()
        b_ids = [b.id for b in batches]
        if not b_ids:
            b_ids = [scope_id]
        secs = Section.query.filter(Section.batch_id.in_(b_ids)).all()
        for s in secs:
            section_ids.add(s.id)
        if section_ids:
            stud_rows = SectionStudent.query.filter(SectionStudent.section_id.in_(list(section_ids))).all()
            for sr in stud_rows:
                student_ids.add(sr.student_id)
            sss = SectionSubject.query.filter(SectionSubject.section_id.in_(list(section_ids))).all()
            for s in sss:
                ss_ids.add(s.id)
            if ss_ids:
                sess_rows = LabSession.query.filter(LabSession.section_subject_id.in_(list(ss_ids))).all()
                for sr in sess_rows:
                    session_ids.add(sr.id)

    elif scope_level == 'department' and scope_id:
        users = User.query.filter_by(department_id=scope_id, role='student', is_active=True).all()
        for u in users:
            student_ids.add(u.id)
        subs = Subject.query.filter_by(department_id=scope_id).all()
        sub_ids = [sub.id for sub in subs]
        if sub_ids:
            exps = Experiment.query.filter(Experiment.subject_id.in_(sub_ids)).all()
            for e in exps:
                experiment_ids.add(e.id)
            sss = SectionSubject.query.filter(SectionSubject.subject_id.in_(sub_ids)).all()
            for s in sss:
                ss_ids.add(s.id)
                section_ids.add(s.section_id)
            if ss_ids:
                sess_rows = LabSession.query.filter(LabSession.section_subject_id.in_(list(ss_ids))).all()
                for sr in sess_rows:
                    session_ids.add(sr.id)

    elif scope_level == 'institution' or (institution_id and not scope_id):
        iid = institution_id
        if iid:
            users = User.query.filter_by(institution_id=iid, role='student', is_active=True).all()
            for u in users:
                student_ids.add(u.id)
            exps = Experiment.query.filter_by(institution_id=iid).all()
            for e in exps:
                experiment_ids.add(e.id)
            secs = Section.query.filter_by(institution_id=iid).all()
            for s in secs:
                section_ids.add(s.id)
            sss = SectionSubject.query.filter_by(institution_id=iid).all()
            for s in sss:
                ss_ids.add(s.id)
            sess_rows = LabSession.query.filter_by(institution_id=iid).all()
            for sr in sess_rows:
                session_ids.add(sr.id)

    elif scope_level == 'platform':
        users = User.query.filter_by(role='student', is_active=True).all()
        for u in users:
            student_ids.add(u.id)

    return {
        'student_ids': list(student_ids),
        'experiment_ids': list(experiment_ids),
        'section_ids': list(section_ids),
        'section_subject_ids': list(ss_ids),
        'session_ids': list(session_ids),
    }


# ── Grade scope rule ─────────────────────────────────────────────────────────
def grade_scope_filter(query, experiment_ids: Optional[List[str]] = None,
                       include_unattributed: bool = False):
    """
    The single definition of "which grades count".

    A grade is attributable only when it points at an experiment. Every
    analytics surface (instructor, student, institution) applies this rule, so a
    student's average is the same number on every screen.

    Grades with ``experiment_id IS NULL`` are counted as *unattributed* and
    reported separately (``count_unattributed_grades``) instead of silently
    bending an average.
    """
    from app.models.experiment import Experiment
    from app.models.grading import Grade

    if include_unattributed:
        return query

    query = query.filter(Grade.experiment_id.isnot(None))
    if experiment_ids is not None:
        if not experiment_ids:
            # An empty scope means "nothing matches", not "everything".
            return query.filter(db.literal(False))
        query = query.filter(Grade.experiment_id.in_(experiment_ids))
    return query


def count_unattributed_grades(student_ids: Optional[List[str]] = None) -> int:
    """How many grade rows exist that cannot be attributed to an experiment."""
    from app.models.grading import Grade
    if not student_ids:
        return 0
    return Grade.query.filter(
        Grade.student_id.in_(student_ids),
        Grade.experiment_id.is_(None),
        Grade.final_grade.isnot(None),
    ).count()
