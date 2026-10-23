"""
Knowledge Map Dashboard Analytics Builder
Fuses Academic ConceptMastery with Track 2 Practice Topic Strength
into an interactive hierarchical mindmap graph, concept diagnostics,
and tailored learning path unlocks with verified mathematical formulas.
"""
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from collections import defaultdict
from app.extensions import db
from app.models.user import User
from app.models.knowledge import ConceptMastery, ExperimentConcept
from app.models.academic import Section, SectionStudent, SectionSubject, Department
from app.models.subject import Subject
from app.models.experiment import Experiment
from app.models.grading import Grade
from app.models.submission import CodeAttempt
from app.models.practice import Problem, PracticeSubmission, StudentXP, PlatformRating
from app.platform_rank.practice_mastery import get_practice_topic_mastery
from app.platform_rank.unlock import check_content_unlocks
from app.platform_rank.blended import _canonicalize_topic


# Domain taxonomy grouping for CS curriculum mindmap
CURRICULUM_TAXONOMY = {
    'Data Structures': {
        'id': 'domain-dsa',
        'color': '#38bdf8',
        'concepts': [
            {'name': 'Arrays', 'sub_aliases': ['array', 'arrays', 'arrays & strings', 'arrays & lists']},
            {'name': 'Linked Lists', 'sub_aliases': ['linked list', 'linked lists']},
            {'name': 'Stacks & Queues', 'sub_aliases': ['stack', 'stacks', 'queues', 'queue', 'stacks & queues']},
            {'name': 'Trees', 'sub_aliases': ['tree', 'trees', 'binary tree', 'tree algorithms']},
            {'name': 'Graphs', 'sub_aliases': ['graph', 'graphs', 'trees & graphs']},
        ]
    },
    'Algorithms': {
        'id': 'domain-algo',
        'color': '#f59e0b',
        'concepts': [
            {'name': 'Sorting', 'sub_aliases': ['sorting', 'sort', 'mergesort', 'quicksort']},
            {'name': 'Searching', 'sub_aliases': ['searching', 'binary search', 'search']},
            {'name': 'Greedy', 'sub_aliases': ['greedy', 'greedy algorithms']},
            {'name': 'Dynamic Programming', 'sub_aliases': ['dp', 'dynamic programming']},
            {'name': 'Recursion', 'sub_aliases': ['recursion', 'backtracking', 'recursion & backtracking']},
        ]
    },
    'Databases': {
        'id': 'domain-dbms',
        'color': '#10b981',
        'concepts': [
            {'name': 'SQL Basics', 'sub_aliases': ['sql', 'sql queries', 'sql basics', 'sql & relational algebra']},
            {'name': 'Relational Model', 'sub_aliases': ['relational model', 'schema', 'er diagram']},
            {'name': 'Normalization', 'sub_aliases': ['normalization', '1nf', '2nf', '3nf', 'bcnf']},
            {'name': 'Transactions', 'sub_aliases': ['transactions', 'acid', 'concurrency control']},
            {'name': 'Query Optimization', 'sub_aliases': ['indexing', 'query optimization', 'explain']},
        ]
    },
    'Operating Systems': {
        'id': 'domain-os',
        'color': '#f97316',
        'concepts': [
            {'name': 'Processes', 'sub_aliases': ['process', 'processes', 'threads', 'process scheduling', 'scheduling']},
            {'name': 'Memory Mgmt', 'sub_aliases': ['paging', 'virtual memory', 'memory management', 'pointers & memory']},
            {'name': 'File Systems', 'sub_aliases': ['inodes', 'file systems', 'io scheduling']},
        ]
    },
    'Computer Networks': {
        'id': 'domain-cn',
        'color': '#06b6d4',
        'concepts': [
            {'name': 'OSI Model', 'sub_aliases': ['osi', 'osi model', 'layers', 'computer networks basics']},
            {'name': 'TCP/IP', 'sub_aliases': ['tcp', 'udp', 'ip', 'tcp/ip', 'handshake']},
            {'name': 'Routing', 'sub_aliases': ['routing', 'ospf', 'bgp', 'packet routing', 'routing basics']},
            {'name': 'Network Security', 'sub_aliases': ['tls', 'ssl', 'firewall', 'network security']},
        ]
    }
}


def _get_status_band(score: float, is_evaluated: bool) -> Dict[str, str]:
    """Classifies score into standard UI bands."""
    if not is_evaluated:
        return {'status': 'Not Started', 'color': '#94a3b8', 'band': 'not_started'}
    if score >= 80.0:
        return {'status': 'Strong', 'color': '#10b981', 'band': 'strong'}
    elif score >= 60.0:
        return {'status': 'Good', 'color': '#10b981', 'band': 'good'}
    elif score >= 40.0:
        return {'status': 'Moderate', 'color': '#f59e0b', 'band': 'moderate'}
    elif score > 0.0:
        return {'status': 'Weak', 'color': '#ef4444', 'band': 'weak'}
    else:
        return {'status': 'Not Started', 'color': '#94a3b8', 'band': 'not_started'}


def build_knowledge_map_dashboard_payload(
    student_id: str,
    view: str = 'blended',
    subject: str = 'all',
    topic: str = 'all',
    period: str = '30d',
    institution_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Build a knowledge map from measured student observations only.

    Blended scores use the configured 60/40 weights when both tracks exist;
    when only one track is measured, that score is shown as-is rather than
    replacing the missing track with a synthetic zero or baseline.
    """
    student = db.session.get(User, student_id)
    iid = institution_id or (student.institution_id if student else None)
    view = view if view in ('blended', 'academic', 'practice') else 'blended'
    days = {'30d': 30, '30': 30, '60d': 60, '60': 60, '90d': 90, '90': 90, '12w': 84,
            'semester': 120, 'this_semester': 120}.get(period)
    window_start = datetime.utcnow() - timedelta(days=days) if days else None

    # Keep academic observations institution-scoped and period-scoped by their
    # recorded update time; mastery is a snapshot, not an invented history.
    academic_q = ConceptMastery.query.filter_by(student_id=student_id)
    if iid:
        academic_q = academic_q.filter_by(institution_id=iid)
    academic_q = academic_q.filter(ConceptMastery.experiment_count > 0)
    if window_start is not None:
        academic_q = academic_q.filter(ConceptMastery.last_updated >= window_start)
    academic_rows = academic_q.all()
    academic_accum = defaultdict(list)
    for row in academic_rows:
        if row.mastery_score is not None and row.concept:
            academic_accum[_canonicalize_topic(row.concept)].append(float(row.mastery_score))
    academic_scores = {key: sum(values) / len(values) for key, values in academic_accum.items() if values}

    practice_rows = get_practice_topic_mastery(student_id, window_start=window_start)
    practice_accum = defaultdict(list)
    for row in practice_rows:
        if row.get('topic') and row.get('strength') is not None:
            practice_accum[_canonicalize_topic(row['topic'])].append(float(row['strength']))
    practice_scores = {key: sum(values) / len(values) for key, values in practice_accum.items() if values}

    def _score_for(canonical: str):
        acad = academic_scores.get(canonical)
        prac = practice_scores.get(canonical)
        if view == 'academic':
            return (round(acad, 1), acad, None) if acad is not None else (None, None, None)
        if view == 'practice':
            return (round(prac, 1), None, prac) if prac is not None else (None, None, None)
        if acad is not None and prac is not None:
            # Normalize the available weights (0.60 + 0.40 = 1.00).
            return (round(0.60 * acad + 0.40 * prac, 1), acad, prac)
        if acad is not None:
            return (round(acad, 1), acad, None)
        if prac is not None:
            return (round(prac, 1), None, prac)
        return (None, acad, prac)

    # Construct only concepts with at least one measurement for this view.
    domain_nodes = []
    observed_concepts = []
    observed_canonicals = set()
    for domain_name, domain_info in CURRICULUM_TAXONOMY.items():
        nodes = []
        domain_scores = []
        for concept_spec in domain_info['concepts']:
            aliases = [concept_spec['name'], *concept_spec.get('sub_aliases', [])]
            canonical = next((_canonicalize_topic(alias) for alias in aliases
                              if _canonicalize_topic(alias) in academic_scores or
                                 _canonicalize_topic(alias) in practice_scores),
                             _canonicalize_topic(concept_spec['name']))
            score, academic, practice = _score_for(canonical)
            # Also match observed labels via their aliases, even when the
            # canonical form is the alias rather than the curriculum label.
            if score is None:
                for alias in aliases:
                    candidate = _canonicalize_topic(alias)
                    score, academic, practice = _score_for(candidate)
                    if score is not None:
                        canonical = candidate
                        break
            if score is None or canonical in observed_canonicals:
                continue
            observed_canonicals.add(canonical)

            if score >= 80:
                status, color, band = 'Strong', '#10b981', 'strong'
            elif score >= 60:
                status, color, band = 'Good', '#10b981', 'good'
            elif score >= 40:
                status, color, band = 'Moderate', '#f59e0b', 'moderate'
            else:
                status, color, band = 'Weak', '#ef4444', 'weak'

            node = {
                'id': f"concept-{concept_spec['name'].lower().replace(' ', '-').replace('&', 'and')}",
                'name': concept_spec['name'],
                'domain': domain_name,
                'score': score,
                'status': status,
                'color': color,
                'band': band,
                'academic_score': round(academic, 1) if academic is not None else None,
                'practice_strength': round(practice, 1) if practice is not None else None,
                'blended_score': score,
                'is_evaluated': True,
            }
            nodes.append(node)
            observed_concepts.append(node)
            domain_scores.append(score)

        if nodes:
            domain_nodes.append({
                'id': domain_info['id'],
                'name': domain_name,
                'score': round(sum(domain_scores) / len(domain_scores), 1),
                'color': domain_info['color'],
                'concepts': nodes,
            })

    if subject and subject.lower() != 'all':
        domain_nodes = [d for d in domain_nodes if d['name'].lower() == subject.lower()]
        observed_concepts = [c for c in observed_concepts if c['domain'].lower() == subject.lower()]

    overall_scores = [c['score'] for c in observed_concepts]
    overall = round(sum(overall_scores) / len(overall_scores), 1) if overall_scores else None
    strong_count = sum(1 for c in observed_concepts if c['score'] >= 80)
    needs_work_count = sum(1 for c in observed_concepts if c['score'] < 60)
    histogram = [
        sum(1 for c in observed_concepts if lo <= c['score'] < hi)
        for lo, hi in ((0, 20), (20, 40), (40, 60), (60, 80), (80, 101))
    ]

    ranked_desc = sorted(observed_concepts, key=lambda row: row['score'], reverse=True)
    top_strengths = []
    for idx, concept in enumerate([row for row in ranked_desc if row['score'] >= 80][:5]):
        code = ('DSA' if concept['domain'] == 'Data Structures' else
                'DBMS' if concept['domain'] == 'Databases' else
                'CN' if concept['domain'] == 'Computer Networks' else
                'OS' if concept['domain'] == 'Operating Systems' else 'Algorithms')
        top_strengths.append({
            'rank': idx + 1, 'name': f"{concept['name']} ({code})",
            'concept_name': concept['name'], 'subject_code': code, 'score': concept['score'],
        })

    focus_rows = sorted([row for row in observed_concepts if row['score'] < 75], key=lambda row: row['score'])[:5]
    focus_next = [
        {'rank': idx + 1, 'name': row['name'], 'concept_name': row['name'], 'score': row['score']}
        for idx, row in enumerate(focus_rows)
    ]

    selected_name = topic if topic and topic.lower() != 'all' else (focus_rows[0]['name'] if focus_rows else (ranked_desc[0]['name'] if ranked_desc else None))
    matched = next((row for row in observed_concepts if selected_name and row['name'].lower() == selected_name.lower()), None)
    if matched is None and selected_name:
        aliases_by_name = {spec['name'].lower(): spec.get('sub_aliases', []) for info in CURRICULUM_TAXONOMY.values() for spec in info['concepts']}
        requested_aliases = {selected_name.lower(), *[v.lower() for v in aliases_by_name.get(selected_name.lower(), [])]}
        matched = next((row for row in observed_concepts if row['name'].lower() in requested_aliases), None)

    concept_details = None
    if matched is not None:
        matched_canon = _canonicalize_topic(matched['name'])
        # Topic diagnostics use the student's real submissions, within the same
        # period. Missing attempts/grades remain null rather than becoming 0.
        practice_q = (db.session.query(PracticeSubmission, Problem)
                      .join(Problem, PracticeSubmission.problem_id == Problem.id)
                      .filter(PracticeSubmission.student_id == student_id,
                              PracticeSubmission.is_run.is_(False)))
        if window_start is not None:
            practice_q = practice_q.filter(PracticeSubmission.submitted_at >= window_start)
        p_rows = []
        for sub_row, problem in practice_q.all():
            if problem.nexlab_topic and _canonicalize_topic(problem.nexlab_topic) == matched_canon:
                p_rows.append((sub_row, problem))
        attempted = len(p_rows)
        solved = sum(1 for sub_row, _ in p_rows if sub_row.status == 'Accepted')
        acceptance = round(100.0 * solved / attempted, 1) if attempted else None
        times = [sub_row.time_ms for sub_row, _ in p_rows if sub_row.time_ms is not None and sub_row.time_ms > 0]
        avg_mins = round(sum(times) / len(times) / 60000, 1) if times else None

        # Experiments are limited to this student's enrolled section-subjects.
        sec_rows = SectionStudent.query.filter_by(student_id=student_id).all()
        sec_ids = [row.section_id for row in sec_rows]
        ss_q = SectionSubject.query.filter(SectionSubject.section_id.in_(sec_ids)) if sec_ids else SectionSubject.query.filter(db.literal(False))
        if iid:
            ss_q = ss_q.filter(SectionSubject.institution_id == iid)
        enrolled_subject_ids = {row.subject_id for row in ss_q.all()}
        assigned_exp_ids = [row.id for row in Experiment.query.filter(Experiment.subject_id.in_(enrolled_subject_ids), Experiment.is_published.is_(True)).all()] if enrolled_subject_ids else []
        if iid and assigned_exp_ids:
            assigned_exp_ids = [row.id for row in Experiment.query.filter(Experiment.id.in_(assigned_exp_ids), Experiment.institution_id == iid, Experiment.is_published.is_(True)).all()]

        exp_links = ExperimentConcept.query.filter(ExperimentConcept.concept.ilike(f"%{matched['name']}%"))
        if assigned_exp_ids:
            exp_links = exp_links.filter(ExperimentConcept.experiment_id.in_(assigned_exp_ids))
        else:
            exp_links = exp_links.filter(db.literal(False))
        linked_ids = {link.experiment_id for link in exp_links.all()}
        grade_q = Grade.query.filter(Grade.student_id == student_id,
                                     Grade.experiment_id.in_(linked_ids) if linked_ids else db.literal(False),
                                     Grade.final_grade.isnot(None))
        if window_start is not None:
            grade_q = grade_q.filter(Grade.created_at >= window_start)
        grades = grade_q.order_by(Grade.created_at.desc()).all()
        exp_by_id = {row.id: row for row in Experiment.query.filter(Experiment.id.in_(linked_ids)).all()} if linked_ids else {}
        latest_grades = {}
        for grade in grades:
            latest_grades.setdefault(grade.experiment_id, grade)
        weighted_sum = weight_sum = 0.0
        for exp_id, grade in latest_grades.items():
            exp = exp_by_id.get(exp_id)
            scale = float(exp.grade_scale or 0) if exp else 0
            weight = float(exp.weightage or 0) if exp else 0
            if scale <= 0 or weight <= 0:
                continue
            percent = max(0.0, min(100.0, float(grade.final_grade) / scale * 100.0))
            weighted_sum += percent * weight
            weight_sum += weight
        avg_grade = round(weighted_sum / weight_sum, 1) if weight_sum else None
        latest_title = None
        if grades:
            latest_exp = exp_by_id.get(grades[0].experiment_id)
            latest_title = latest_exp.title if latest_exp else None

        if matched['practice_strength'] is None and matched['academic_score'] is not None:
            callout = 'This score is based on recorded academic mastery; no matching practice score is available.'
        elif matched['academic_score'] is None and matched['practice_strength'] is not None:
            callout = 'This score is based on recorded practice activity; no matching academic mastery score is available.'
        else:
            callout = 'This score combines measured academic mastery and practice activity.'
        concept_details = {
            'id': matched['id'], 'name': matched['name'], 'domain': matched['domain'],
            'breadcrumb': f"{matched['domain']} > {matched['name']}",
            'status_badge': matched['status'], 'mastery_score': matched['score'],
            'practice_strength': matched['practice_strength'],
            'academic_strength': matched['academic_score'],
            'callout_reason': callout, 'recommended_steps': [],
            'practice_stats': {
                'attempted': attempted if attempted else None,
                'solved': solved if attempted else None,
                'acceptance_rate': acceptance, 'avg_time_mins': avg_mins,
            },
            'experiment_stats': {
                'count': len(latest_grades) if latest_grades else None,
                'avg_grade': avg_grade, 'last_submission': latest_title,
            },
        }

    # Unlocks are rule targets; their progress inputs come only from stored counts.
    unlock_data = check_content_unlocks(student_id)
    standing = db.session.get(PlatformRating, student_id)
    rating_num = float(standing.rating) if standing and (standing.problems_solved or 0) > 0 else None
    easy_num = int(standing.easy_solved or 0) if standing else 0
    med_num = int(standing.medium_solved or 0) if standing else 0
    unlocks_list = [
        {'id': 'unlock-1', 'title': 'Solve 15 Easy problems for Medium Tier',
         'current_display': f'{easy_num} / 15', 'progress_pct': min(100, round(easy_num / 15.0 * 100)),
         'icon': 'check' if unlock_data.get('medium_unlocked') else 'lock', 'color': 'gold'},
        {'id': 'unlock-2', 'title': 'Solve 20 Medium problems for Hard Tier',
         'current_display': f'{med_num} / 20', 'progress_pct': min(100, round(med_num / 20.0 * 100)),
         'icon': 'check' if unlock_data.get('hard_unlocked') else 'shield', 'color': 'purple'},
    ]
    if rating_num is not None:
        unlocks_list.append({
            'id': 'unlock-3', 'title': 'Reach 1,500 Platform Rating',
            'current_display': f'{round(rating_num)} / 1,500',
            'progress_pct': min(100, round(rating_num / 1500.0 * 100)),
            'icon': 'trophy', 'color': 'amber',
        })

    return {
        'student_id': student_id, 'view_mode': view, 'subject_filter': subject,
        'topic_filter': topic, 'period_filter': period,
        'kpi_summary': {
            'blended_mastery_score': overall,
            'blended_delta': None,
            'concepts_mastered': strong_count if observed_concepts else None,
            'total_concepts': len(observed_concepts) if observed_concepts else None,
            'mastery_bars': histogram,
            'strong_areas_count': strong_count if observed_concepts else None,
            'areas_to_improve_count': needs_work_count if observed_concepts else None,
            'not_started_count': None,
        },
        'mindmap': {
            'root': {'id': 'root-cs', 'name': 'Computer Science', 'score': overall, 'color': '#7c3aed'},
            'domains': domain_nodes,
        },
        'concept_details': concept_details,
        'top_strengths': top_strengths,
        'focus_next': focus_next,
        'learning_path_unlocks': unlocks_list,
    }
