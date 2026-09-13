"""
Knowledge Tracing Formula Evaluation — generates trajectory data for the research paper.
Run: cd backend && venv/Scripts/python.exe tests/eval_knowledge_tracing.py

Tests the formula WITHOUT Flask/DB — pure math evaluation.
"""
import os, sys, json

# Replicate the formula from app/ml/knowledge_tracing.py (no DB needed)
DIFFICULTY_WEIGHTS = {1: 0.6, 2: 0.8, 3: 1.0, 4: 1.2}

def mastery_update(current, passed, score_pct, attempt_count, hints_used, difficulty):
    """Replicate the exact formula from knowledge_tracing.py"""
    diff_weight = DIFFICULTY_WEIGHTS.get(difficulty, 1.0)
    attempt_factor = max(0.5, 1 - (attempt_count - 1) * 0.1)
    hint_factor = max(0.6, 1 - hints_used * 0.1)

    if passed:
        gain = 15 * diff_weight * attempt_factor * hint_factor * score_pct
    else:
        gain = -5 * diff_weight

    # Exponential moving average — harder to gain at high mastery
    new_score = current + gain * (1 - current / 100)
    return max(0.0, min(100.0, round(new_score, 2)))


def simulate_student(name, submissions):
    """Simulate a student profile through a sequence of submissions."""
    mastery = 0.0
    trajectory = [{'submission': 0, 'mastery': mastery}]

    for i, sub in enumerate(submissions):
        mastery = mastery_update(
            mastery, sub['passed'], sub['score_pct'],
            sub['attempts'], sub['hints'], sub['difficulty']
        )
        trajectory.append({
            'submission': i + 1,
            'mastery': mastery,
            'difficulty': sub['difficulty'],
            'passed': sub['passed'],
            'hints': sub['hints'],
        })

    return {'name': name, 'final_mastery': mastery, 'trajectory': trajectory}


def main():
    print("="*60)
    print("KNOWLEDGE TRACING FORMULA EVALUATION")
    print("="*60)

    # ── Profile A: Strong student ──
    strong_subs = [
        {'passed': True, 'score_pct': 0.9, 'attempts': 1, 'hints': 0, 'difficulty': 1},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 0, 'difficulty': 1},
        {'passed': True, 'score_pct': 0.95, 'attempts': 1, 'hints': 0, 'difficulty': 2},
        {'passed': True, 'score_pct': 1.0, 'attempts': 2, 'hints': 0, 'difficulty': 2},
        {'passed': True, 'score_pct': 0.85, 'attempts': 1, 'hints': 0, 'difficulty': 2},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 0, 'difficulty': 3},
        {'passed': True, 'score_pct': 0.9, 'attempts': 2, 'hints': 0, 'difficulty': 3},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 0, 'difficulty': 3},
        {'passed': False, 'score_pct': 0.3, 'attempts': 3, 'hints': 0, 'difficulty': 4},
        {'passed': True, 'score_pct': 0.95, 'attempts': 2, 'hints': 0, 'difficulty': 4},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 0, 'difficulty': 4},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 0, 'difficulty': 4},
        {'passed': True, 'score_pct': 0.9, 'attempts': 1, 'hints': 1, 'difficulty': 3},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 0, 'difficulty': 4},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 0, 'difficulty': 4},
        {'passed': True, 'score_pct': 0.95, 'attempts': 1, 'hints': 0, 'difficulty': 3},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 0, 'difficulty': 4},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 0, 'difficulty': 4},
        {'passed': True, 'score_pct': 0.9, 'attempts': 2, 'hints': 0, 'difficulty': 4},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 0, 'difficulty': 4},
    ]

    # ── Profile B: Struggling student who improves ──
    struggling_subs = [
        {'passed': False, 'score_pct': 0.1, 'attempts': 3, 'hints': 2, 'difficulty': 1},
        {'passed': False, 'score_pct': 0.2, 'attempts': 4, 'hints': 3, 'difficulty': 1},
        {'passed': True, 'score_pct': 0.6, 'attempts': 5, 'hints': 3, 'difficulty': 1},
        {'passed': False, 'score_pct': 0.3, 'attempts': 3, 'hints': 2, 'difficulty': 1},
        {'passed': True, 'score_pct': 0.7, 'attempts': 3, 'hints': 2, 'difficulty': 1},
        {'passed': True, 'score_pct': 0.8, 'attempts': 2, 'hints': 1, 'difficulty': 1},
        {'passed': False, 'score_pct': 0.2, 'attempts': 3, 'hints': 2, 'difficulty': 2},
        {'passed': True, 'score_pct': 0.7, 'attempts': 3, 'hints': 1, 'difficulty': 2},
        {'passed': True, 'score_pct': 0.8, 'attempts': 2, 'hints': 1, 'difficulty': 2},
        {'passed': True, 'score_pct': 0.85, 'attempts': 2, 'hints': 0, 'difficulty': 2},
        {'passed': True, 'score_pct': 0.9, 'attempts': 1, 'hints': 0, 'difficulty': 2},
        {'passed': True, 'score_pct': 0.7, 'attempts': 2, 'hints': 1, 'difficulty': 3},
        {'passed': False, 'score_pct': 0.4, 'attempts': 3, 'hints': 2, 'difficulty': 3},
        {'passed': True, 'score_pct': 0.75, 'attempts': 2, 'hints': 1, 'difficulty': 3},
        {'passed': True, 'score_pct': 0.85, 'attempts': 2, 'hints': 0, 'difficulty': 3},
        {'passed': True, 'score_pct': 0.9, 'attempts': 1, 'hints': 0, 'difficulty': 3},
        {'passed': True, 'score_pct': 0.8, 'attempts': 2, 'hints': 0, 'difficulty': 3},
        {'passed': True, 'score_pct': 0.9, 'attempts': 1, 'hints': 0, 'difficulty': 4},
        {'passed': True, 'score_pct': 0.85, 'attempts': 2, 'hints': 0, 'difficulty': 4},
        {'passed': True, 'score_pct': 0.95, 'attempts': 1, 'hints': 0, 'difficulty': 4},
    ]

    # ── Profile C: Hint-dependent student ──
    hint_dep_subs = [
        {'passed': True, 'score_pct': 0.9, 'attempts': 1, 'hints': 3, 'difficulty': 1},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 3, 'difficulty': 1},
        {'passed': True, 'score_pct': 0.85, 'attempts': 2, 'hints': 3, 'difficulty': 2},
        {'passed': True, 'score_pct': 0.9, 'attempts': 1, 'hints': 3, 'difficulty': 2},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 3, 'difficulty': 2},
        {'passed': True, 'score_pct': 0.8, 'attempts': 2, 'hints': 3, 'difficulty': 3},
        {'passed': True, 'score_pct': 0.95, 'attempts': 1, 'hints': 3, 'difficulty': 3},
        {'passed': True, 'score_pct': 0.9, 'attempts': 1, 'hints': 3, 'difficulty': 3},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 3, 'difficulty': 4},
        {'passed': True, 'score_pct': 0.85, 'attempts': 2, 'hints': 3, 'difficulty': 4},
        {'passed': True, 'score_pct': 0.9, 'attempts': 1, 'hints': 3, 'difficulty': 4},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 3, 'difficulty': 4},
        {'passed': True, 'score_pct': 0.9, 'attempts': 1, 'hints': 3, 'difficulty': 3},
        {'passed': True, 'score_pct': 0.95, 'attempts': 1, 'hints': 3, 'difficulty': 4},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 3, 'difficulty': 4},
        {'passed': True, 'score_pct': 0.9, 'attempts': 2, 'hints': 3, 'difficulty': 3},
        {'passed': True, 'score_pct': 0.85, 'attempts': 1, 'hints': 3, 'difficulty': 4},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 3, 'difficulty': 4},
        {'passed': True, 'score_pct': 0.9, 'attempts': 1, 'hints': 3, 'difficulty': 4},
        {'passed': True, 'score_pct': 1.0, 'attempts': 1, 'hints': 3, 'difficulty': 4},
    ]

    # ── Profile D: Inconsistent student ──
    import random
    random.seed(42)
    inconsistent_subs = []
    for i in range(20):
        diff = random.choice([1, 2, 2, 3, 3, 4])
        passed = random.random() > 0.45
        inconsistent_subs.append({
            'passed': passed,
            'score_pct': round(random.uniform(0.5, 1.0), 2) if passed else round(random.uniform(0.1, 0.4), 2),
            'attempts': random.randint(1, 4),
            'hints': random.randint(0, 2),
            'difficulty': diff,
        })

    profiles = [
        simulate_student('Strong Student', strong_subs),
        simulate_student('Struggling to Improving', struggling_subs),
        simulate_student('Hint-Dependent', hint_dep_subs),
        simulate_student('Inconsistent', inconsistent_subs),
    ]

    # ── Verification checks ──
    checks = {
        'mastery_bounded_0_100': True,
        'pass_increases_mastery': True,
        'fail_decreases_mastery': True,
        'hint_penalty_reduces_gain': True,
        'difficulty_weighting_works': True,
    }

    for p in profiles:
        for t in p['trajectory']:
            if t['mastery'] < 0.0 or t['mastery'] > 100.0:
                checks['mastery_bounded_0_100'] = False

    # Test: fail decreases
    m = 50.0
    m_after_fail = mastery_update(m, False, 0.2, 3, 0, 2)
    if m_after_fail >= m:
        checks['fail_decreases_mastery'] = False

    # Test: pass increases from 0
    m_after_pass = mastery_update(0.0, True, 1.0, 1, 0, 2)
    if m_after_pass <= 0.0:
        checks['pass_increases_mastery'] = False

    # Test: hint penalty
    no_hint = mastery_update(30.0, True, 1.0, 1, 0, 2)
    with_hint = mastery_update(30.0, True, 1.0, 1, 3, 2)
    if with_hint >= no_hint:
        checks['hint_penalty_reduces_gain'] = False

    # Test: difficulty weighting
    easy = mastery_update(30.0, True, 1.0, 1, 0, 1)
    hard = mastery_update(30.0, True, 1.0, 1, 0, 4)
    if hard <= easy:
        checks['difficulty_weighting_works'] = False

    output = {
        'formula': 'gain = 15 * diff_weight * attempt_factor * hint_factor * score_pct (pass) or -5 * diff_weight (fail), applied as EMA: new = current + gain * (1 - current/100)',
        'difficulty_weights': DIFFICULTY_WEIGHTS,
        'profiles': profiles,
        'verification_checks': checks,
        'supplementary': {
            'no_hint_gain_at_30': no_hint,
            'with_3_hints_gain_at_30': with_hint,
            'easy_d1_gain_at_30': easy,
            'hard_d4_gain_at_30': hard,
            'fail_from_50': m_after_fail,
        },
        'note': 'Formula-based system (not a learned ML model). Evaluated for mathematical correctness and behavioral plausibility.',
    }

    for p in profiles:
        print(f"\n-- {p['name']} --")
        print(f"  Final mastery: {p['final_mastery']}")
        milestones = [t for t in p['trajectory'] if t['submission'] in [0, 5, 10, 15, 20]]
        for t in milestones:
            print(f"  Sub {t['submission']:>2}: mastery = {t['mastery']:.2f}")

    print(f"\n-- Verification Checks --")
    for check, passed in checks.items():
        print(f"  {'PASS' if passed else 'FAIL'} {check}")

    print(f"\n-- Supplementary --")
    print(f"  Gain at mastery=30, no hints, d=2:   {no_hint}")
    print(f"  Gain at mastery=30, 3 hints, d=2:    {with_hint}")
    print(f"  Gain at mastery=30, easy (d=1):      {easy}")
    print(f"  Gain at mastery=30, hard (d=4):      {hard}")
    print(f"  Fail from mastery=50, d=2:           {m_after_fail}")

    out_path = os.path.join(os.path.dirname(__file__), '..', '..', 'docs', '06-paper', 'evaluation_results', 'knowledge_tracing_eval.json')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\nSaved to {out_path}")

if __name__ == '__main__':
    main()
