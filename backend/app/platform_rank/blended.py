"""
Blended Knowledge Map Engine
Fuses Track 1 Academic Concept Mastery with Track 2 Practice Topic Strength
into a unified honest competency map.
"""
from typing import Dict, Any, List, Optional
from app.models.knowledge import ConceptMastery
from app.platform_rank.practice_mastery import get_practice_topic_mastery


# Mapping canonical concept aliases between lab experiments and practice problems
TOPIC_SYNONYMS = {
    'arrays': 'Arrays & Strings',
    'strings': 'Arrays & Strings',
    'array': 'Arrays & Strings',
    'string': 'Arrays & Strings',
    'arrays & strings': 'Arrays & Strings',
    'linked lists': 'Linked Lists',
    'linked list': 'Linked Lists',
    'pointers': 'Pointers & Memory',
    'memory': 'Pointers & Memory',
    'pointers & memory': 'Pointers & Memory',
    'trees': 'Trees & Graphs',
    'graphs': 'Trees & Graphs',
    'binary trees': 'Trees & Graphs',
    'trees & graphs': 'Trees & Graphs',
    'dynamic programming': 'Dynamic Programming',
    'dp': 'Dynamic Programming',
    'recursion': 'Recursion & Backtracking',
    'backtracking': 'Recursion & Backtracking',
    'stacks': 'Stacks & Queues',
    'queues': 'Stacks & Queues',
    'sorting': 'Sorting & Searching',
    'searching': 'Sorting & Searching',
    'hash tables': 'Hash Maps & Sets',
    'hash map': 'Hash Maps & Sets',
}


def _canonicalize_topic(name: str) -> str:
    cleaned = (name or '').strip().lower()
    return TOPIC_SYNONYMS.get(cleaned, (name or 'General').strip().title())


def expand_topic_aliases(name: str) -> List[str]:
    """
    Expands a canonical or raw topic name into all possible synonyms/aliases
    used across Problem.nexlab_topic, ConceptMastery.concept, etc.
    e.g. 'Arrays & Strings' -> ['Arrays & Strings', 'Array', 'Arrays', 'String', 'Strings']
    """
    if not name:
        return []
    cleaned = name.strip().lower()
    canonical = TOPIC_SYNONYMS.get(cleaned, name.strip().title())

    aliases = {name.strip(), canonical}
    for syn_raw, can_target in TOPIC_SYNONYMS.items():
        if can_target.lower() == canonical.lower():
            aliases.add(syn_raw.title())
            aliases.add(syn_raw)
            aliases.add(syn_raw.capitalize())
            aliases.add(syn_raw.lower())

    return list(aliases)


def compute_blended_knowledge_map(
    student_id: str,
    institution_id: Optional[str] = None,
    weight_academic: float = 0.6,
    weight_practice: float = 0.4,
) -> Dict[str, Any]:
    """
    Computes blended mastery fusing Academic ConceptMastery and Practice Topic Strength.
    Formula: blended = w_a × academic_mastery + w_p × practice_strength
    """
    # 1. Fetch academic mastery rows
    q = ConceptMastery.query.filter_by(student_id=student_id)
    if institution_id:
        q = q.filter_by(institution_id=institution_id)
    academic_rows = q.all()

    academic_map: Dict[str, List[float]] = {}
    for row in academic_rows:
        canon = _canonicalize_topic(row.concept)
        academic_map.setdefault(canon, []).append(float(row.mastery_score or 0.0))

    # Average academic score per canonical topic
    academic_scores = {k: sum(v) / len(v) for k, v in academic_map.items()}

    # 2. Fetch practice topic mastery
    practice_list = get_practice_topic_mastery(student_id)
    practice_scores: Dict[str, float] = {}
    for p in practice_list:
        canon = _canonicalize_topic(p['topic'])
        practice_scores[canon] = float(p.get('strength', 0.0))

    # 3. Fuse topics present in either or both tracks
    all_topics = set(academic_scores.keys()).union(set(practice_scores.keys()))
    if not all_topics:
        all_topics = {
            'Arrays & Strings',
            'Linked Lists',
            'Pointers & Memory',
            'Recursion & Backtracking',
            'Trees & Graphs',
            'Dynamic Programming',
        }

    knowledge_map = []
    total_blended = 0.0

    for topic in sorted(all_topics):
        acad = academic_scores.get(topic)
        prac = practice_scores.get(topic)

        # Formula: Blended Score = 0.60 * Academic Mastery + 0.40 * Practice Strength
        # Academic Mastery derived from ConceptMastery.mastery_score (or 70.0 base score if not evaluated)
        # Practice Strength derived from PracticeSubmission.passed / total and topic strength
        effective_acad = float(acad) if acad is not None else 70.0
        effective_prac = float(prac) if prac is not None else 0.0

        if acad is not None and prac is not None:
            blended = round((acad * weight_academic) + (prac * weight_practice), 1)
        elif acad is not None:
            blended = round((acad * weight_academic) + (effective_prac * weight_practice), 1)
        elif prac is not None:
            blended = round((effective_acad * weight_academic) + (prac * weight_practice), 1)
        else:
            blended = 0.0

        total_blended += blended

        if blended >= 80:
            band = 'Mastered'
            action = 'Strong foundation. Ready for advanced optimization and contest challenges.'
        elif blended >= 60:
            band = 'Proficient'
            action = 'Solid comprehension. Practice timed problem variations to build fluency.'
        elif blended >= 40:
            band = 'Developing'
            action = 'Needs reinforcement. Review core textbook algorithms and solve 3-5 Medium exercises.'
        else:
            band = 'Critical Gap'
            action = 'High priority gap. Review foundational pre-lab concepts and debug trace examples.'

        if acad is not None and prac is not None:
            confidence = 'High'
        elif acad is not None or prac is not None:
            confidence = 'Medium'
        else:
            confidence = 'Low'

        knowledge_map.append({
            'topic': topic,
            'academic_score': round(acad, 1) if acad is not None else None,
            'practice_strength': round(prac, 1) if prac is not None else None,
            'blended_score': blended,
            'band': band,
            'confidence': confidence,
            'recommended_action': action,
        })

    # Sort descending by blended score
    knowledge_map.sort(key=lambda x: x['blended_score'], reverse=True)

    avg_blended = round(total_blended / max(1, len(knowledge_map)), 1)
    strong_topics = [k['topic'] for k in knowledge_map if k['blended_score'] >= 70][:3]
    weak_topics = [k['topic'] for k in reversed(knowledge_map) if k['blended_score'] < 60][:3]

    return {
        'student_id': student_id,
        'average_blended_mastery': avg_blended,
        'weights': {'academic': weight_academic, 'practice': weight_practice},
        'strong_topics': strong_topics,
        'focus_topics': weak_topics,
        'knowledge_map': knowledge_map,
    }
