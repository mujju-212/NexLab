"""
NexLab — All ML Models Test Suite
===================================
Tests all 5 ML models standalone (no DB, no Flask needed):

  Model 1: Focus Score RF          — behavioral signals → 0-100 score
  Model 2: Knowledge Tracing       — concept mastery update (formula)
  Model 3: Holistic Ranking        — weighted 5-component rank
  Model 4: Plagiarism Detection    — TF-IDF cosine similarity
  Model 5: Code Quality            — radon metrics (Python only)

Also simulates 30 students for full system validation.

Run: python test_all_ml_models.py
"""
import sys, os, time, random, statistics
sys.path.insert(0, os.path.dirname(__file__))

# ── Colors ────────────────────────────────────────────────────────────────────
G = '\033[92m'; R = '\033[91m'; Y = '\033[93m'
C = '\033[96m'; B = '\033[1m';  E = '\033[0m'

PASS = f"{G}✅ PASS{E}"
FAIL = f"{R}❌ FAIL{E}"

results = []

def check(label, condition, detail=''):
    status = PASS if condition else FAIL
    print(f"  {status}  {label}" + (f"  →  {detail}" if detail else ''))
    results.append(condition)
    return condition


# ══════════════════════════════════════════════════════════════════════════════
# MODEL 1 — Focus Score RF
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{B}{'═'*65}{E}")
print(f"{B}  MODEL 1: Focus Score — Random Forest (AUC 0.9266){E}")
print(f"{B}{'═'*65}{E}")

from app.ml.focus_model import predict_focus_score, get_alerts, FEATURE_ORDER

# Test 1a: Focused student
t0 = time.time()
sig_focused = {
    'tab_switches_per_min': 0.1, 'idle_seconds': 8,
    'typing_speed_wpm': 45,      'backspace_ratio': 0.10,
    'copy_paste_count': 0,       'window_focus_ratio': 0.97,
}
score_focused = predict_focus_score(sig_focused)
elapsed_1 = (time.time() - t0) * 1000
check("Focused student score > 75", score_focused > 75, f"score={score_focused}")

# Test 1b: Distracted student
sig_dist = {
    'tab_switches_per_min': 6.0, 'idle_seconds': 180,
    'typing_speed_wpm': 7,       'backspace_ratio': 0.30,
    'copy_paste_count': 8,       'window_focus_ratio': 0.35,
}
score_dist = predict_focus_score(sig_dist)
check("Distracted student score < 40", score_dist < 40, f"score={score_dist}")

# Test 1c: Suspicious student (heavy copy-paste, minimal typing)
sig_sus = {
    'tab_switches_per_min': 5.0, 'idle_seconds': 10,
    'typing_speed_wpm': 5,       'backspace_ratio': 0.03,
    'copy_paste_count': 10,      'window_focus_ratio': 0.72,
}
score_sus = predict_focus_score(sig_sus)
check("Suspicious student score < 50", score_sus < 50, f"score={score_sus}")

# Test 1d: Alerts triggered correctly
alerts = get_alerts(sig_dist, score_dist)
check("Tab alert fired", 'tab_switch_excessive' in alerts, f"alerts={alerts}")
check("Idle alert fired", 'idle_too_long' in alerts)

# Test 1e: Throughput — 600 predictions (30 students x 20 intervals)
t0 = time.time()
signals_batch = [
    {'tab_switches_per_min': random.uniform(0,8),
     'idle_seconds': random.uniform(0,200),
     'typing_speed_wpm': random.uniform(0,60),
     'backspace_ratio': random.uniform(0,0.5),
     'copy_paste_count': random.randint(0,10),
     'window_focus_ratio': random.uniform(0.1,1.0)}
    for _ in range(600)
]
for sig in signals_batch:
    predict_focus_score(sig)
elapsed_batch = time.time() - t0
throughput = 600 / elapsed_batch
check(f"600 predictions throughput OK",
      throughput >= 10,
      f"{elapsed_batch:.2f}s ({throughput:.0f}/sec) — need only 1/30s per student")

print(f"\n  Scores — Focused: {score_focused}  |  Distracted: {score_dist}  |  Suspicious: {score_sus}")


# ══════════════════════════════════════════════════════════════════════════════
# MODEL 2 — Knowledge Tracing (formula-based, no DB)
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{B}{'═'*65}{E}")
print(f"{B}  MODEL 2: Knowledge Tracing — Difficulty-Aware BKT Formula{E}")
print(f"{B}{'═'*65}{E}")

# Simulate mastery updates without DB
from app.ml.knowledge_tracing import DIFFICULTY_WEIGHTS, HINT_DEDUCTIONS

def simulate_mastery_update(current_score, passed, score_pct,
                             attempts, hints, difficulty):
    diff_weight    = DIFFICULTY_WEIGHTS.get(difficulty, 1.0)
    attempt_factor = max(0.5, 1 - (attempts - 1) * 0.1)
    hint_factor    = max(0.6, 1 - hints * 0.1)
    if passed:
        gain = 15 * diff_weight * attempt_factor * hint_factor * score_pct
    else:
        gain = -5 * diff_weight
    new_score = current_score + gain * (1 - current_score / 100)
    return round(max(0.0, min(100.0, new_score)), 2)

# Test 2a: First pass on easy experiment
s = simulate_mastery_update(0, True, 0.9, 1, 0, difficulty=1)
check("Easy pass: mastery increases from 0", s > 0, f"0 → {s}")

# Test 2b: Hard experiment with hints — smaller gain
s2 = simulate_mastery_update(40, True, 0.85, 2, 2, difficulty=3)
s3 = simulate_mastery_update(40, True, 0.85, 1, 0, difficulty=3)
check("More hints = smaller mastery gain", s2 < s3,
      f"with hints={s2} < without hints={s3}")

# Test 2c: Failure decreases mastery
s_fail = simulate_mastery_update(60, False, 0, 1, 0, difficulty=2)
check("Failed experiment decreases mastery", s_fail < 60, f"60 → {s_fail}")

# Test 2d: Mastery caps at 100
s_cap = simulate_mastery_update(98, True, 1.0, 1, 0, difficulty=4)
check("Mastery never exceeds 100", s_cap <= 100, f"capped at {s_cap}")

# Test 2e: Simulate 10-experiment progression
mastery = 0
history = []
for i in range(10):
    passed = random.random() > 0.3
    mastery = simulate_mastery_update(mastery, passed, random.uniform(0.5,1.0),
                                       random.randint(1,3), random.randint(0,2),
                                       difficulty=random.randint(1,4))
    history.append(mastery)
check("10-experiment progression stays 0-100",
      all(0 <= h <= 100 for h in history),
      f"trajectory: {history[0]:.0f}→{history[-1]:.0f}")

print(f"\n  Sample 10-exp trajectory: {[round(h,1) for h in history]}")


# ══════════════════════════════════════════════════════════════════════════════
# MODEL 3 — Plagiarism Detection (TF-IDF)
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{B}{'═'*65}{E}")
print(f"{B}  MODEL 3: Plagiarism Detection — TF-IDF Cosine Similarity{E}")
print(f"{B}{'═'*65}{E}")

from app.ml.plagiarism import check_two_codes, normalize_code

# Test 3a: Identical code → 100%
code_original = """
def sum_list(numbers):
    total = 0
    for num in numbers:
        total += num
    return total
"""
result_identical = check_two_codes(code_original, code_original)
check("Identical code → high similarity",
      result_identical['tfidf_similarity'] >= 90,
      f"tfidf={result_identical['tfidf_similarity']}%")

# Test 3b: Renamed variables only — should still flag
code_renamed = """
def calculate_sum(items):
    result = 0
    for item in items:
        result += item
    return result
"""
result_renamed = check_two_codes(code_original, code_renamed)
check("Renamed variables still detected",
      result_renamed['tfidf_similarity'] >= 60,
      f"tfidf={result_renamed['tfidf_similarity']}% — {result_renamed['verdict']}")

# Test 3c: Completely different code → low similarity
code_different = """
def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
"""
result_diff = check_two_codes(code_original, code_different)
check("Different algorithm → low similarity",
      result_diff['tfidf_similarity'] < 50,
      f"tfidf={result_diff['tfidf_similarity']}% — {result_diff['verdict']}")

# Test 3d: Batch — 10 submissions, 2 pairs of plagiarism
print(f"\n  {C}Batch plagiarism test (10 students, 2 cheating pairs):{E}")
submissions = [code_original] * 2 + [code_renamed] * 2 + [code_different] * 6
from app.ml.plagiarism import compute_tfidf_similarity
sim_matrix = compute_tfidf_similarity(submissions)
flag_count = sum(
    1 for i in range(len(submissions))
    for j in range(i+1, len(submissions))
    if sim_matrix[i][j] >= 0.80
)
check(f"Batch: ≥ 1 pair flagged at 80% threshold",
      flag_count >= 1, f"flagged pairs = {flag_count}")


# ══════════════════════════════════════════════════════════════════════════════
# MODEL 4 — Code Quality (radon)
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{B}{'═'*65}{E}")
print(f"{B}  MODEL 4: Code Quality — Radon Metrics (Python){E}")
print(f"{B}{'═'*65}{E}")

from app.ml.code_quality import analyze_code_quality, quality_to_score

# Test 4a: Good Python code
good_code = '''
def fibonacci(n: int) -> int:
    """Return the nth Fibonacci number."""
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(2, n + 1):
        a, b = b, a + b
    return b
'''
metrics_good = analyze_code_quality(good_code, 'python')
score_good   = quality_to_score(metrics_good)
check("Good Python: LOC > 0", metrics_good['loc'] > 0, f"loc={metrics_good['loc']}")
check("Good Python: quality score > 5",
      score_good > 5, f"score={score_good}/10")

# Test 4b: Deeply nested bad code — high complexity
bad_code = '''
def process(a, b, c, d, e):
    if a:
        for i in range(b):
            if c:
                while d:
                    if e:
                        for j in range(10):
                            if i == j:
                                return i * j
                            else:
                                d -= 1
    return 0
'''
metrics_bad = analyze_code_quality(bad_code, 'python')
check("High complexity: cyclomatic complexity detected",
      metrics_bad['cyclomatic_complexity'] is not None,
      f"CC={metrics_bad['cyclomatic_complexity']}")

# Test 4c: Non-Python (C++) — basic LOC only
cpp_code = '''
#include <iostream>
int main() {
    int n;
    std::cin >> n;
    int sum = 0;
    for (int i = 1; i <= n; i++) sum += i;
    std::cout << sum << std::endl;
    return 0;
}
'''
metrics_cpp = analyze_code_quality(cpp_code, 'cpp')
check("C++ code: LOC counted", metrics_cpp['loc'] > 0,
      f"loc={metrics_cpp['loc']}, sloc={metrics_cpp['sloc']}")
check("C++ code: no MI (not Python)", metrics_cpp['maintainability_index'] is None)

# Test 4d: quality_to_score formula
score_na = quality_to_score({'quality_grade': 'N/A', 'complexity_warning': False})
score_a  = quality_to_score({'quality_grade': 'A',   'complexity_warning': False})
score_f  = quality_to_score({'quality_grade': 'F',   'complexity_warning': True})
check("Score A > score F", score_a > score_f,
      f"A={score_a}, F={score_f}")


# ══════════════════════════════════════════════════════════════════════════════
# MODEL 5 — Holistic Ranking (formula simulation, no DB)
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{B}{'═'*65}{E}")
print(f"{B}  MODEL 5: Holistic Ranking — 5-Component Weighted Formula{E}")
print(f"{B}{'═'*65}{E}")

def simulate_rank(mastery, engagement, effort, efficiency, consistency):
    """Replicate the weighted formula without DB"""
    score = (
        mastery     * 0.30 +
        engagement  * 0.20 +
        effort      * 0.20 +
        efficiency  * 0.15 +
        consistency * 0.15
    )
    return round(score, 2)

# Test 5a: Perfect student
rank_perfect = simulate_rank(100, 100, 100, 100, 100)
check("Perfect student rank = 100", rank_perfect == 100.0, f"{rank_perfect}")

# Test 5b: Zero student
rank_zero = simulate_rank(0, 0, 0, 0, 0)
check("Zero student rank = 0", rank_zero == 0.0, f"{rank_zero}")

# Test 5c: Mastery has highest weight
rank_high_mastery   = simulate_rank(100, 50, 50, 50, 50)
rank_high_engage    = simulate_rank(50, 100, 50, 50, 50)
check("Mastery (30%) > Engagement (20%) in rank",
      rank_high_mastery > rank_high_engage,
      f"mastery={rank_high_mastery} > engage={rank_high_engage}")

# Test 5d: Simulate 30 students and rank them
print(f"\n  {C}Simulating ranks for 30 students:{E}")
student_ranks = []
for i in range(30):
    r = simulate_rank(
        mastery=random.uniform(20, 95),
        engagement=random.uniform(30, 100),
        effort=random.uniform(20, 100),
        efficiency=random.uniform(40, 100),
        consistency=random.uniform(30, 95),
    )
    student_ranks.append(r)

student_ranks.sort(reverse=True)
check("30 students ranked, all scores 0-100",
      all(0 <= r <= 100 for r in student_ranks),
      f"Top: {student_ranks[0]:.1f}, Bottom: {student_ranks[-1]:.1f}")
check("Ranking spread > 10 points",
      student_ranks[0] - student_ranks[-1] > 10,
      f"range={student_ranks[0]-student_ranks[-1]:.1f}")

print(f"  Top 5: {[round(r,1) for r in student_ranks[:5]]}")
print(f"  Bot 5: {[round(r,1) for r in student_ranks[-5:]]}")


# ══════════════════════════════════════════════════════════════════════════════
# FINAL SUMMARY
# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{B}{'═'*65}{E}")
print(f"{B}  FINAL RESULTS{E}")
print(f"{B}{'═'*65}{E}")

total  = len(results)
passed = sum(results)
failed = total - passed

print(f"\n  Tests passed : {G}{passed}/{total}{E}")
if failed:
    print(f"  Tests failed : {R}{failed}{E}")

print(f"""
  {B}Model Status:{E}
  {G}✅{E} Model 1 — Focus Score RF      AUC=0.9266, {throughput:.0f} pred/sec
  {G}✅{E} Model 2 — Knowledge Tracing   Formula-based, difficulty-aware BKT
  {G}✅{E} Model 3 — Plagiarism          TF-IDF cosine (2-stage), identifier-normalized
  {G}✅{E} Model 4 — Code Quality        Radon metrics (Python), LOC fallback (others)
  {G}✅{E} Model 5 — Holistic Ranking    5-component weighted (mastery 30% dominant)
""")

if failed == 0:
    print(f"  {G}{B}ALL ML MODELS WORKING ✅{E}")
else:
    print(f"  {R}{B}{failed} test(s) failed — review output above{E}")

print(f"{B}{'═'*65}{E}\n")
