"""
Scoped Mastery & Prerequisite Dependency Engine
Computes concept mastery filtered to curriculum scopes (subject, experiment, section)
and analyzes concept prerequisite dependency graphs to identify blocked knowledge paths.
"""
from typing import Dict, Any, List, Optional
from sqlalchemy import func
from app.extensions import db
from app.models.knowledge import ConceptMastery, ExperimentConcept, ConceptPrereq
from app.models.experiment import Experiment
from app.analytics.scope import resolve_scope_entities


def compute_scoped_mastery(
    student_id: str,
    scope_level: str = 'subject',
    scope_id: Optional[str] = None,
    institution_id: Optional[str] = None,
    min_sample_size: int = 3,
) -> Dict[str, Any]:
    """
    Computes concept mastery for a student scoped to a specific academic boundary
    (default: subject). Links experiments in scope to concepts via ExperimentConcept.
    
    Returns:
    {
        'scope': {'level': scope_level, 'id': scope_id},
        'scope_avg': float,
        'concepts': [
            {
                'concept': str,
                'mastery_score': float,
                'experiment_count': int,
                'is_weak': bool,
                'status': 'mastered' | 'progressing' | 'struggling'
            }
        ],
        'weak_concepts': [str, ...],
        'sample_size': int,
        'is_sufficient': bool
    }
    """
    entities = resolve_scope_entities(scope_level, scope_id, institution_id)
    experiment_ids = entities.get('experiment_ids', [])

    # Find concepts tied to these experiments
    target_concepts = []
    if experiment_ids:
        exp_concepts = (
            ExperimentConcept.query
            .filter(ExperimentConcept.experiment_id.in_(experiment_ids))
            .all()
        )
        target_concepts = list({ec.concept for ec in exp_concepts})

    # If no explicit ExperimentConcept mapping was configured, query student's existing ConceptMastery rows
    q = ConceptMastery.query.filter_by(student_id=student_id)
    if target_concepts:
        q = q.filter(ConceptMastery.concept.in_(target_concepts))
    elif institution_id:
        q = q.filter(ConceptMastery.institution_id == institution_id)

    mastery_rows = q.all()

    concepts_data = []
    weak_concepts = []
    total_score = 0.0

    for m in mastery_rows:
        score = float(m.mastery_score or 0.0)
        total_score += score
        is_weak = score < 50.0

        if score >= 75.0:
            status = 'mastered'
        elif score >= 50.0:
            status = 'progressing'
        else:
            status = 'struggling'

        if is_weak:
            weak_concepts.append(m.concept)

        concepts_data.append({
            'concept': m.concept,
            'mastery_score': round(score, 1),
            'experiment_count': getattr(m, 'experiment_count', 1) or 1,
            'is_weak': is_weak,
            'status': status,
            'last_updated': m.last_updated.isoformat() if getattr(m, 'last_updated', None) else None,
        })

    # Sort struggling concepts first, then ascending score
    concepts_data.sort(key=lambda x: x['mastery_score'])

    sample_size = len(concepts_data)
    scope_avg = round(total_score / sample_size, 1) if sample_size > 0 else 0.0

    return {
        'scope': {'level': scope_level, 'id': scope_id},
        'scope_avg': scope_avg,
        'concepts': concepts_data,
        'weak_concepts': weak_concepts,
        'sample_size': sample_size,
        'is_sufficient': bool(sample_size >= min_sample_size),
    }


def get_concept_prerequisite_graph(
    student_id: str,
    subject_id: Optional[str] = None,
    mastery_threshold: float = 50.0,
) -> Dict[str, Any]:
    """
    Constructs the directed dependency graph of concepts and computes blocked paths
    for a student.
    
    If concept A requires concept B, and student's mastery(B) < mastery_threshold,
    then concept A is considered 'blocked' due to deficiency in prerequisite B.
    """
    prereq_q = ConceptPrereq.query
    if subject_id:
        prereq_q = prereq_q.filter(
            (ConceptPrereq.subject_id == subject_id) | (ConceptPrereq.subject_id.is_(None))
        )
    prereqs = prereq_q.all()

    # Get student's current mastery
    st_mastery = {
        m.concept: float(m.mastery_score or 0.0)
        for m in ConceptMastery.query.filter_by(student_id=student_id).all()
    }

    nodes = {}
    edges = []
    blocked_concepts = []

    # Populate unique concept nodes
    for p in prereqs:
        for c in (p.concept, p.requires_concept):
            if c not in nodes:
                c_score = st_mastery.get(c, 0.0)
                nodes[c] = {
                    'id': c,
                    'concept': c,
                    'mastery_score': c_score,
                    'is_deficient': c_score < mastery_threshold,
                    'is_blocked': False,
                    'missing_prereqs': [],
                }

        edges.append({
            'source': p.requires_concept,
            'target': p.concept,
            'label': 'prerequisite_for',
        })

    # Identify blocked concepts
    for p in prereqs:
        req_score = st_mastery.get(p.requires_concept, 0.0)
        if req_score < mastery_threshold:
            if p.concept in nodes:
                nodes[p.concept]['is_blocked'] = True
                nodes[p.concept]['missing_prereqs'].append({
                    'prerequisite': p.requires_concept,
                    'current_mastery': req_score,
                    'required_mastery': mastery_threshold,
                })
                if p.concept not in blocked_concepts:
                    blocked_concepts.append(p.concept)

    return {
        'subject_id': subject_id,
        'nodes': list(nodes.values()),
        'edges': edges,
        'blocked_concepts': blocked_concepts,
        'total_dependencies': len(edges),
    }
