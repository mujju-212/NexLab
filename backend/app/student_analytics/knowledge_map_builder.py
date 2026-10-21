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
    """
    Constructs the complete knowledge map dashboard response matching real DB stats.
    Formula: Blended Score = 0.60 * Academic Mastery + 0.40 * Practice Strength
    """
    student = db.session.get(User, student_id)
    iid = institution_id or (student.institution_id if student else None)

    # 1. Fetch real academic ConceptMastery records from DB
    q_acad = ConceptMastery.query.filter_by(student_id=student_id)
    if iid:
        q_acad = q_acad.filter_by(institution_id=iid)
    acad_records = q_acad.all()
    acad_map = {r.concept.strip().lower(): float(r.mastery_score or 0.0) for r in acad_records}

    # 2. Fetch real practice topic strength
    practice_list = get_practice_topic_mastery(student_id)
    practice_map = {p['topic'].strip().lower(): float(p.get('strength', 0.0)) for p in practice_list}

    # 3. Assemble hierarchical domain and concept nodes with verified blended calculations
    domain_nodes = []
    all_evaluated_concepts = []
    strong_areas_count = 0
    areas_to_improve_count = 0
    not_started_count = 0
    mastered_count = 0

    for domain_name, d_info in CURRICULUM_TAXONOMY.items():
        concept_nodes = []
        domain_scores = []

        for c in d_info['concepts']:
            c_name = c['name']
            c_lower = c_name.lower()

            # Find matching academic score
            acad_val = None
            for alias in c.get('sub_aliases', [c_lower]):
                if alias in acad_map:
                    acad_val = acad_map[alias]
                    break

            # Find matching practice score
            prac_val = None
            for alias in c.get('sub_aliases', [c_lower]):
                if alias in practice_map:
                    prac_val = practice_map[alias]
                    break

            is_evaluated = (acad_val is not None) or (prac_val is not None)

            # Apply formula: Blended Score = 0.60 * Academic Mastery + 0.40 * Practice Strength
            # Academic Mastery defaults to 70.0 base score if not evaluated yet but practice exists
            eff_acad = acad_val if acad_val is not None else (70.0 if prac_val is not None else 0.0)
            eff_prac = prac_val if prac_val is not None else 0.0

            if view == 'academic':
                final_score = round(eff_acad, 1) if acad_val is not None else 0.0
            elif view == 'practice':
                final_score = round(eff_prac, 1) if prac_val is not None else 0.0
            else:  # blended
                if is_evaluated:
                    final_score = round(0.60 * eff_acad + 0.40 * eff_prac, 1)
                else:
                    final_score = 0.0

            band_info = _get_status_band(final_score, is_evaluated)
            if band_info['band'] == 'strong':
                strong_areas_count += 1
                mastered_count += 1
            elif band_info['band'] == 'good':
                if final_score >= 75.0:
                    mastered_count += 1
            elif band_info['band'] in ('moderate', 'weak'):
                areas_to_improve_count += 1
            elif band_info['band'] == 'not_started':
                not_started_count += 1

            c_obj = {
                'id': f"concept-{c_name.lower().replace(' ', '-').replace('&', 'and')}",
                'name': c_name,
                'domain': domain_name,
                'score': final_score,
                'status': band_info['status'],
                'color': band_info['color'],
                'band': band_info['band'],
                'academic_score': round(acad_val, 1) if acad_val is not None else None,
                'practice_strength': round(prac_val, 1) if prac_val is not None else None,
                'blended_score': final_score,
                'is_evaluated': is_evaluated,
            }
            concept_nodes.append(c_obj)
            all_evaluated_concepts.append(c_obj)
            domain_scores.append(final_score)

        avg_domain = round(sum(domain_scores) / max(1, len(domain_scores)), 1)
        domain_nodes.append({
            'id': d_info['id'],
            'name': domain_name,
            'score': avg_domain,
            'color': d_info['color'],
            'concepts': concept_nodes,
        })

    total_concepts_count = len(all_evaluated_concepts)
    evaluated_scores = [c['score'] for c in all_evaluated_concepts if c['is_evaluated']]
    overall_blended = round(sum(evaluated_scores) / max(1, len(evaluated_scores)), 1) if evaluated_scores else 0.0

    # 4. Filter nodes if specific subject requested
    if subject != 'all':
        matching_domains = [d for d in domain_nodes if d['name'].lower() == subject.lower() or subject.lower() in d['name'].lower()]
        if matching_domains:
            domain_nodes = matching_domains
            subj_concepts = [c for c in all_evaluated_concepts if c['domain'].lower() == subject.lower() or subject.lower() in c['domain'].lower()]
            if subj_concepts:
                all_evaluated_concepts = subj_concepts
                total_concepts_count = len(subj_concepts)
                subj_eval = [c['score'] for c in subj_concepts if c['is_evaluated']]
                overall_blended = round(sum(subj_eval) / max(1, len(subj_eval)), 1) if subj_eval else 0.0
                mastered_count = sum(1 for c in subj_concepts if c['score'] >= 75)
                strong_areas_count = sum(1 for c in subj_concepts if c['score'] >= 80)
                areas_to_improve_count = sum(1 for c in subj_concepts if 0 < c['score'] < 60)
                not_started_count = sum(1 for c in subj_concepts if not c['is_evaluated'] or c['score'] == 0)

    # 5. Top Strengths (real evaluated concepts sorted by score DESC)
    evaluated_only = [c for c in all_evaluated_concepts if c['is_evaluated']]
    sorted_desc = sorted(evaluated_only, key=lambda x: x['score'], reverse=True)
    top_strengths = []
    for idx, c in enumerate(sorted_desc[:5]):
        sub_code = (
            'DSA' if c['domain'] == 'Data Structures'
            else 'DBMS' if c['domain'] == 'Databases'
            else 'CN' if c['domain'] == 'Computer Networks'
            else 'OS' if c['domain'] == 'Operating Systems'
            else 'Algorithms'
        )
        top_strengths.append({
            'rank': idx + 1,
            'name': f"{c['name']} ({sub_code})",
            'concept_name': c['name'],
            'subject_code': sub_code,
            'score': c['score'],
        })

    # 6. Focus Next (evaluated concepts with score < 75 sorted ASC)
    sorted_asc = sorted([c for c in evaluated_only if c['score'] < 75], key=lambda x: x['score'])
    if not sorted_asc:
        sorted_asc = sorted(all_evaluated_concepts, key=lambda x: x['score'])

    focus_next = []
    for idx, c in enumerate(sorted_asc[:5]):
        sub_code = (
            'OS' if c['domain'] == 'Operating Systems'
            else 'DBMS' if c['domain'] == 'Databases'
            else ''
        )
        display_name = f"{c['name']} ({sub_code})" if sub_code else c['name']
        focus_next.append({
            'rank': idx + 1,
            'name': display_name,
            'concept_name': c['name'],
            'score': c['score'],
        })

    # 7. Concept Details payload for selected or default topic
    selected_concept_name = topic if (topic != 'all' and topic) else (focus_next[0]['concept_name'] if focus_next else 'Arrays')
    matched_c = next((c for c in all_evaluated_concepts if c['name'].lower() == selected_concept_name.lower()), None)
    if not matched_c and all_evaluated_concepts:
        matched_c = all_evaluated_concepts[0]

    # Query real practice stats for this concept
    c_prob_attempts = 0
    c_prob_solved = 0
    c_times = []
    all_student_subs = PracticeSubmission.query.filter_by(student_id=student_id).all()
    for s in all_student_subs:
        p = db.session.get(Problem, s.problem_id) if s.problem_id else None
        if p and (matched_c['name'].lower() in (p.nexlab_topic or '').lower() or (p.nexlab_topic or '').lower() in matched_c['name'].lower()):
            c_prob_attempts += 1
            if s.status == 'Accepted':
                c_prob_solved += 1
            if s.time_ms:
                c_times.append(s.time_ms)

    c_acc = round(100.0 * c_prob_solved / max(1, c_prob_attempts)) if c_prob_attempts > 0 else 0
    c_avg_mins = round((sum(c_times) / len(c_times)) / 60000, 1) if c_times else 0

    # Query real experiment stats for this concept
    exp_links = ExperimentConcept.query.filter(ExperimentConcept.concept.ilike(f"%{matched_c['name']}%")).all()
    matched_eids = [el.experiment_id for el in exp_links]
    c_grades = Grade.query.filter(Grade.student_id == student_id, Grade.experiment_id.in_(matched_eids), Grade.final_grade.isnot(None)).all() if matched_eids else []
    c_exp_avg = round(sum(float(g.final_grade) for g in c_grades) / len(c_grades)) if c_grades else 0
    last_exp_title = 'Lab Assignment'
    if c_grades:
        last_exp = db.session.get(Experiment, c_grades[0].experiment_id)
        if last_exp:
            last_exp_title = last_exp.title

    concept_details = {
        'id': matched_c['id'],
        'name': matched_c['name'],
        'domain': matched_c.get('domain', 'Computer Science'),
        'breadcrumb': f"{matched_c.get('domain', 'Computer Science')} > {matched_c['name']}",
        'status_badge': matched_c.get('status', 'Not Started'),
        'mastery_score': matched_c['score'],
        'practice_strength': matched_c.get('practice_strength') or 0.0,
        'academic_strength': matched_c.get('academic_score') or 0.0,
        'callout_reason': f"Attempted {c_prob_attempts} practice problems with {c_acc}% acceptance rate.",
        'recommended_steps': [
            {
                'step': 1,
                'title': f"Practice foundational problems on {matched_c['name']}",
                'action_label': 'Start Practice',
                'action_link': f"/student/practice?topic={matched_c['name'].replace(' ', '+')}",
            },
            {
                'step': 2,
                'title': 'Review lecture & textbook notes',
                'action_label': 'Review Notes',
                'action_link': '/student/subjects',
            },
            {
                'step': 3,
                'title': 'Complete associated lab experiment',
                'action_label': 'Go to Lab',
                'action_link': '/student/subjects',
            },
        ],
        'practice_stats': {
            'attempted': c_prob_attempts,
            'solved': c_prob_solved,
            'acceptance_rate': c_acc,
            'avg_time_mins': c_avg_mins,
        },
        'experiment_stats': {
            'count': len(c_grades),
            'avg_grade': c_exp_avg,
            'last_submission': last_exp_title,
        }
    }

    # 8. Learning Path & Unlocks from real unlock engine
    unlock_data = check_content_unlocks(student_id)
    standing = db.session.get(PlatformRating, student_id)
    rating_num = round(float(standing.rating or 1000.0)) if standing else 1000
    easy_num = standing.easy_solved if standing else 0
    med_num = standing.medium_solved if standing else 0

    unlocks_list = [
        {
            'id': 'unlock-1',
            'title': 'Solve 15 Easy problems for Medium Tier',
            'current_display': f'{easy_num} / 15',
            'progress_pct': min(100, round((easy_num / 15.0) * 100)),
            'icon': 'lock' if not unlock_data.get('medium_unlocked') else 'check',
            'color': 'gold',
        },
        {
            'id': 'unlock-2',
            'title': 'Solve 20 Medium problems for Hard Tier',
            'current_display': f'{med_num} / 20',
            'progress_pct': min(100, round((med_num / 20.0) * 100)),
            'icon': 'shield' if not unlock_data.get('hard_unlocked') else 'check',
            'color': 'purple',
        },
        {
            'id': 'unlock-3',
            'title': 'Reach 1,500 Platform Rating',
            'current_display': f'{rating_num} / 1,500',
            'progress_pct': min(100, round((rating_num / 1500.0) * 100)),
            'icon': 'trophy',
            'color': 'amber',
        },
    ]

    return {
        'student_id': student_id,
        'view_mode': view,
        'subject_filter': subject,
        'topic_filter': topic,
        'period_filter': period,
        'kpi_summary': {
            'blended_mastery_score': overall_blended,
            'blended_delta': f'{overall_blended}%',
            'concepts_mastered': mastered_count,
            'total_concepts': total_concepts_count,
            'mastery_bars': [mastered_count],
            'strong_areas_count': strong_areas_count,
            'areas_to_improve_count': areas_to_improve_count,
            'not_started_count': not_started_count,
        },
        'mindmap': {
            'root': {
                'id': 'root-cs',
                'name': 'Computer Science',
                'score': overall_blended,
                'color': '#7c3aed',
            },
            'domains': domain_nodes,
        },
        'concept_details': concept_details,
        'top_strengths': top_strengths,
        'focus_next': focus_next,
        'learning_path_unlocks': unlocks_list,
    }
