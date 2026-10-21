"""
Seed NexLab Practice Library problems into the database.
Run: python scripts/seed_problems.py

Reads: docs/05-platform-expansion/problems/problems_nexlab.json
Inserts into: practice_problems + practice_test_cases tables

Two things this seeder does beyond a plain upsert:
  1. Re-derives each problem's `nexlab_topic` from its FULL tag list using a
     balanced priority (scripts/topic_balance.py) so the library's topic buckets
     are even and foundational buckets fill up — instead of the raw JSON's
     "most-specific tag wins", which starved Array→1 and bloated DP→87.
  2. Seeds VISIBLE sample test cases parsed from each problem's examples, so the
     "Test Cases" tab is populated and Run shows input/expected output.
"""
import sys, os, json, re
from collections import Counter

# scripts/ is sys.path[0] when run as `python scripts/seed_problems.py`, so the
# sibling `topic_balance` imports cleanly; also add backend/ for `app`.
sys.path.insert(0, os.path.dirname(__file__))                    # scripts/  (topic_balance)
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))   # backend/  (app)

from app import create_app
from app.extensions import db
from app.models.practice import Problem, PracticeTestCase, StudyPlan, StudyPlanSection
import topic_balance as tb

def _find_problems_file():
    candidates = [
        os.path.join(os.path.dirname(__file__), '..', 'database', 'problems_nexlab.json'),
        os.path.join(os.path.dirname(__file__), '..', '..', 'docs', '05-platform-expansion', 'problems', 'problems_nexlab.json'),
        os.path.join(os.path.dirname(__file__), 'problems_nexlab.json'),
    ]
    for c in candidates:
        if os.path.exists(c):
            return os.path.abspath(c)
    return None

PROBLEMS_FILE = _find_problems_file()

# Soft cap for balanced topic labeling. balance() only RELABELS a problem within its
# own tags (never drops one), so this is a flatten knob, not a selection knob. The key
# fact: the average bucket is n/len(KNOWN_TOPICS) (~92 at 2776 problems). A cap ABOVE
# that average is individually satisfiable, so balance() leaves the natural shape in
# place — the huge algorithmic buckets stay huge and the small foundational ones stay
# thin (Queue → 7, the sparse "1–2 per category" look). A cap BELOW the average is
# infeasible for the whole set, which forces balance() to shed the bloated buckets into
# their smaller valid co-tags until the distribution is as flat as the tag graph allows
# (min ≈ 28 at 2776) — no thin categories, which is the goal. We sit at ~60% of the
# average; the floor of 40 keeps a small library (~589) at the historically-tuned value.
def _topic_cap(n):
    return max(40, round(0.6 * n / len(tb.KNOWN_TOPICS)))

# ── Study Plan definitions ────────────────────────────────────────────────────
STUDY_PLANS = [
    {
        'slug': 'nexlab-75',
        'title': 'NexLab 75',
        'description': 'The 75 most essential problems every developer must know. Covers all major patterns.',
        'icon': '🎯',
        'estimated_days': 75,
        'difficulty_mix': 'Easy–Hard',
        'badge_id': 'nexlab75',
        'order_index': 0,
        'sections': [
            ('Arrays & Hashing',        ['two-sum', 'contains-duplicate', 'valid-anagram',
                                          'group-anagrams', 'top-k-frequent-elements',
                                          'product-of-array-except-self', 'longest-consecutive-sequence']),
            ('Two Pointers',            ['valid-palindrome', '3sum', 'container-with-most-water']),
            ('Sliding Window',          ['best-time-to-buy-and-sell-stock', 'longest-substring-without-repeating-characters',
                                          'longest-repeating-character-replacement', 'minimum-window-substring']),
            ('Stack',                   ['valid-parentheses', 'min-stack', 'evaluate-reverse-polish-notation', 'daily-temperatures']),
            ('Binary Search',           ['binary-search', 'search-a-2d-matrix', 'koko-eating-bananas', 'find-minimum-in-rotated-sorted-array']),
            ('Linked List',             ['reverse-linked-list', 'merge-two-sorted-lists', 'linked-list-cycle',
                                          'reorder-list', 'remove-nth-node-from-end-of-list', 'lru-cache']),
            ('Trees',                   ['invert-binary-tree', 'maximum-depth-of-binary-tree',
                                          'same-tree', 'subtree-of-another-tree', 'lowest-common-ancestor-of-a-binary-search-tree',
                                          'binary-tree-level-order-traversal', 'validate-binary-search-tree', 'kth-smallest-element-in-a-bst']),
            ('Heap / Priority Queue',   ['kth-largest-element-in-a-stream', 'last-stone-weight',
                                          'k-closest-points-to-origin', 'find-median-from-data-stream']),
            ('Backtracking',            ['subsets', 'combination-sum', 'permutations', 'word-search']),
            ('Graphs',                  ['number-of-islands', 'clone-graph', 'max-area-of-island',
                                          'pacific-atlantic-water-flow', 'course-schedule', 'number-of-connected-components-in-an-undirected-graph']),
            ('Dynamic Programming',     ['climbing-stairs', 'house-robber', 'house-robber-ii', 'longest-palindromic-substring',
                                          'palindromic-substrings', 'coin-change', 'maximum-product-subarray',
                                          'word-break', 'longest-increasing-subsequence', 'unique-paths', 'jump-game']),
            ('Greedy & Bit Manipulation', ['maximum-subarray', 'jump-game-ii', 'number-of-1-bits', 'counting-bits', 'reverse-bits']),
        ]
    },
    {
        'slug': 'beginner-path',
        'title': 'Beginner Path',
        'description': '30 beginner-friendly problems. Master the basics of arrays, strings, and math.',
        'icon': '🌱',
        'estimated_days': 30,
        'difficulty_mix': 'Easy',
        'badge_id': 'beginner_path',
        'order_index': 1,
        'sections': [
            ('Arrays Basics',   ['two-sum', 'best-time-to-buy-and-sell-stock', 'contains-duplicate',
                                  'maximum-subarray', 'move-zeroes', 'find-the-duplicate-number']),
            ('Strings',         ['valid-palindrome', 'valid-anagram', 'reverse-string',
                                  'first-unique-character-in-a-string', 'longest-common-prefix']),
            ('Math & Sorting',  ['fizz-buzz', 'palindrome-number', 'count-primes',
                                  'majority-element', 'missing-number', 'single-number']),
            ('Basic DS',        ['valid-parentheses', 'reverse-linked-list', 'merge-two-sorted-lists',
                                  'maximum-depth-of-binary-tree', 'invert-binary-tree']),
            ('Easy Patterns',   ['climbing-stairs', 'house-robber', 'binary-search',
                                  'number-of-1-bits', 'reverse-bits', 'number-of-islands', 'flood-fill']),
        ]
    },
    {
        'slug': 'dp-mastery',
        'title': 'DP Mastery',
        'description': '50 problems covering every Dynamic Programming pattern from basics to advanced.',
        'icon': '🧠',
        'estimated_days': 50,
        'difficulty_mix': 'Medium–Hard',
        'badge_id': 'dp_mastery',
        'order_index': 2,
        'sections': [
            ('1D DP Basics',    ['climbing-stairs', 'house-robber', 'house-robber-ii', 'jump-game',
                                  'jump-game-ii', 'maximum-subarray', 'coin-change', 'word-break']),
            ('2D DP',           ['unique-paths', 'unique-paths-ii', 'minimum-path-sum',
                                  'triangle', 'edit-distance', 'longest-common-subsequence']),
            ('String DP',       ['longest-palindromic-substring', 'palindromic-substrings',
                                  'longest-palindromic-subsequence', 'regular-expression-matching', 'wildcard-matching']),
            ('Knapsack',        ['partition-equal-subset-sum', 'target-sum', 'last-stone-weight-ii',
                                  'combination-sum-iv', 'perfect-squares', 'coin-change-2']),
            ('Subsequences',    ['longest-increasing-subsequence', 'number-of-longest-increasing-subsequence',
                                  'russian-doll-envelopes', 'maximum-length-of-pair-chain']),
            ('Interval DP',     ['burst-balloons', 'strange-printer', 'minimum-cost-tree-from-leaf-values']),
            ('State Machine',   ['best-time-to-buy-and-sell-stock-with-cooldown',
                                  'best-time-to-buy-and-sell-stock-with-transaction-fee',
                                  'best-time-to-buy-and-sell-stock-iii', 'best-time-to-buy-and-sell-stock-iv']),
            ('Advanced',        ['maximal-square', 'maximal-rectangle', 'dungeon-game',
                                  'cherry-pickup', 'minimum-falling-path-sum']),
        ]
    },
    {
        'slug': 'trees-and-graphs',
        'title': 'Trees & Graphs',
        'description': '40 problems covering tree traversals, graph algorithms, and network problems.',
        'icon': '🌳',
        'estimated_days': 40,
        'difficulty_mix': 'Easy–Hard',
        'badge_id': 'trees_graphs',
        'order_index': 3,
        'sections': [
            ('Tree Basics',         ['maximum-depth-of-binary-tree', 'invert-binary-tree', 'same-tree',
                                      'symmetric-tree', 'subtree-of-another-tree', 'path-sum']),
            ('Tree Traversals',     ['binary-tree-level-order-traversal', 'binary-tree-right-side-view',
                                      'binary-tree-zigzag-level-order-traversal', 'construct-binary-tree-from-preorder-and-inorder-traversal']),
            ('BST',                 ['validate-binary-search-tree', 'kth-smallest-element-in-a-bst',
                                      'lowest-common-ancestor-of-a-binary-search-tree',
                                      'insert-into-a-binary-search-tree', 'delete-node-in-a-bst']),
            ('Advanced Trees',      ['serialize-and-deserialize-binary-tree', 'binary-tree-maximum-path-sum',
                                      'count-complete-tree-nodes', 'flatten-binary-tree-to-linked-list']),
            ('Graph Basics',        ['number-of-islands', 'max-area-of-island', 'clone-graph',
                                      'flood-fill', 'surrounded-regions']),
            ('Graph Algorithms',    ['course-schedule', 'course-schedule-ii', 'pacific-atlantic-water-flow',
                                      'number-of-connected-components-in-an-undirected-graph',
                                      'graph-valid-tree', 'redundant-connection',
                                      'word-ladder', 'network-delay-time']),
        ]
    },
    {
        'slug': 'sql-50',
        'title': 'SQL 50',
        'description': 'Master SQL with 50 problems from basic queries to advanced window functions.',
        'icon': '🗄️',
        'estimated_days': 30,
        'difficulty_mix': 'Easy–Hard',
        'badge_id': 'sql_50',
        'order_index': 4,
        'sections': [
            ('Basic Queries',   ['recyclable-and-low-fat-products', 'find-customer-referee',
                                  'big-countries', 'article-views-i', 'invalid-tweets']),
            ('Joins',           ['replace-employee-id-with-the-unique-identifier', 'product-sales-analysis-i',
                                  'customer-who-visited-but-did-not-make-any-transactions',
                                  'rising-temperature', 'average-time-of-process-per-machine',
                                  'employee-bonus', 'students-and-examinations', 'managers-with-at-least-5-direct-reports']),
            ('Aggregation',     ['not-boring-movies', 'average-selling-price', 'project-employees-i',
                                  'percentage-of-users-attended-a-contest', 'queries-quality-and-percentage',
                                  'monthly-transactions-i', 'immediate-food-delivery-ii', 'game-play-analysis-iv']),
            ('Subqueries',      ['employees-whose-manager-left-the-company', 'exchange-seats',
                                  'movie-rating', 'restaurant-growth', 'friend-requests-ii',
                                  'investments-in-2016', 'department-top-three-salaries']),
            ('Advanced',        ['fix-names-in-a-table', 'patients-with-a-condition',
                                  'delete-duplicate-emails', 'second-highest-salary',
                                  'group-sold-products-by-the-date', 'list-the-products-ordered-in-a-period',
                                  'find-users-with-valid-e-mails']),
        ]
    },
]


def parse_example_io(example_text):
    """Parse a LeetCode-style example blob into (input, expected).

    example_text looks like:
        Input: nums = [2,7,11,15], target = 9
        Output: [0,1]
        Explanation: ...
    Returns (input_str, output_str) or None when no Output can be found
    (PracticeTestCase.expected is NOT NULL, so an example with no Output is skipped).
    Mirrors the frontend parseExample() so the Test Cases tab and Examples block agree.
    """
    if not example_text:
        return None
    in_m = re.search(r'Input:\s*(.*?)(?=\n\s*Output:|\n\s*Explanation:|$)',
                     example_text, re.S | re.I)
    out_m = re.search(r'Output:\s*(.*?)(?=\n\s*Explanation:|$)',
                      example_text, re.S | re.I)
    if not out_m:
        return None
    expected = out_m.group(1).strip()
    if not expected:
        return None
    inp = in_m.group(1).strip() if in_m else ''
    return inp, expected


def seed_sample_cases(problem, examples):
    """Replace this problem's visible sample cases with ones parsed from its
    examples. Only touches is_sample=True rows, so instructor-added hidden cases
    (is_sample=False) survive a reseed. Returns the number of sample cases written."""
    # PLT-05: If problem already has curated test cases (from seed_test_cases.py), do not overwrite
    if PracticeTestCase.query.filter_by(problem_id=problem.id, is_sample=False).count() > 0:
        return 0

    PracticeTestCase.query.filter_by(problem_id=problem.id, is_sample=True).delete()
    n = 0
    for ex in (examples or []):
        io = parse_example_io(ex.get('example_text', '') if isinstance(ex, dict) else '')
        if not io:
            continue
        inp, expected = io
        db.session.add(PracticeTestCase(
            problem_id  = problem.id,
            input_data  = inp,
            expected    = expected,
            is_sample   = True,
            order_index = (ex.get('example_num') or (n + 1)) - 1,
        ))
        n += 1
    return n


def print_distribution(assign, cap):
    """Print the final topic distribution grouped by section, flagging thin/fat
    buckets. Called on every reseed so the run self-documents its result — this is
    what the throwaway scripts/_analyze_topics.py printed, baked into the seeder so
    no separate analysis pass (or working shell) is needed to see the outcome.

    `assign` is the {slug: topic} map that was actually written, so the counts are
    exactly the library's post-reseed topic buckets. Flags scale with the library:
    thin = below 30% of the average bucket (min floor 8), fat = above 2x average, so
    the same code reads sensibly at 589 and at 2797. Shell (a handful, tagged only
    'Shell') and SQL (tagged only 'Database') have no co-tags to rebalance into, so
    they are expected floors, not tuning failures."""
    counts = Counter(assign.values())
    by_sec = {}
    for topic, c in counts.items():
        by_sec.setdefault(tb.section_of(topic), []).append((topic, c))
    order = ['Foundations', 'Data Structures', 'Algorithms', 'Graphs', 'SQL & Shell', 'Other']
    vals = list(counts.values()) or [0]
    avg = sum(vals) / len(vals)
    thin_t, fat_t = max(8, avg * 0.3), avg * 2
    print(f"  Topic distribution (cap={cap}, {len(counts)} topics, avg={avg:.0f}):")
    for sec in order:
        if sec not in by_sec:
            continue
        rows = sorted(by_sec[sec], key=lambda x: -x[1])
        tot = sum(c for _, c in rows)
        print(f"    {sec} ({tot})")
        for topic, c in rows:
            flag = '  <-- thin' if c < thin_t else ('  <-- fat' if c > fat_t else '')
            print(f"        {topic:<22} {c:4d}{flag}")
    thin = sorted(t for t, c in counts.items() if c < thin_t)
    print(f"    min={min(vals)}  max={max(vals)}  thin={thin or 'none'}")


def _seed_fallback_problems():
    """Fallback when problems_nexlab.json is missing: seeds 78 problems from seed_test_cases.py
    and all problem slugs mentioned in STUDY_PLANS."""
    try:
        from seed_test_cases import TEST_CASES
        slugs = set(TEST_CASES.keys())
    except Exception:
        slugs = set()

    for plan in STUDY_PLANS:
        for _, plan_slugs in plan.get('sections', []):
            slugs.update(plan_slugs)

    inserted = 0
    updated = 0
    for idx, slug in enumerate(sorted(slugs)):
        existing = Problem.query.filter_by(slug=slug).first()
        title = slug.replace('-', ' ').title()
        if existing:
            updated += 1
        else:
            p = Problem(
                slug=slug,
                lc_id=str(idx + 1),
                title=title,
                difficulty='Medium',
                nexlab_topic='Algorithms',
                topics=['Algorithm'],
                description=f'Solve the challenge: {title}.',
                examples=[],
                constraints=[],
                hints=[],
                acceptance=0.65,
                source='nexlab',
            )
            db.session.add(p)
            inserted += 1
    db.session.commit()
    print(f"  [OK] Fallback Problems: {inserted} inserted, {updated} updated")


def seed_problems():
    if not PROBLEMS_FILE or not os.path.exists(PROBLEMS_FILE):
        print("⚠️ Warning: problems_nexlab.json not found! Falling back to curated problem set from seed_test_cases.py and study plans...")
        _seed_fallback_problems()
        return

    with open(PROBLEMS_FILE, 'r', encoding='utf-8') as f:
        problems_data = json.load(f)

    print(f"Loaded {len(problems_data)} problems from JSON")

    # Balanced topic assignment across the WHOLE set (needs every problem's tags
    # at once), keyed by slug. Overrides the raw JSON's nexlab_topic.
    items = [(p.get('slug', '').strip(), p.get('topics', []))
             for p in problems_data if p.get('slug', '').strip()]
    cap = _topic_cap(len(items))
    balanced = tb.balance(items, cap=cap)
    print_distribution(balanced, cap)

    inserted = 0
    updated = 0
    cases = 0
    for item in problems_data:
        slug = item.get('slug', '').strip()
        if not slug:
            continue

        topic = balanced.get(slug) or tb.derive_primary(item.get('topics', []))

        existing = Problem.query.filter_by(slug=slug).first()
        if existing:
            existing.title         = item.get('title', existing.title)
            existing.difficulty    = item.get('difficulty', existing.difficulty)
            existing.nexlab_topic  = topic
            existing.topics        = item.get('topics', existing.topics)
            existing.description   = item.get('description', existing.description)
            existing.examples      = item.get('examples', existing.examples)
            existing.constraints   = item.get('constraints', existing.constraints)
            existing.hints         = item.get('hints', existing.hints)
            existing.acceptance    = item.get('acceptance', existing.acceptance)
            existing.lc_id         = str(item.get('id', existing.lc_id or ''))
            p = existing
            updated += 1
        else:
            p = Problem(
                slug          = slug,
                lc_id         = str(item.get('id', '')),
                title         = item.get('title', slug),
                difficulty    = item.get('difficulty', 'Medium'),
                nexlab_topic  = topic,
                topics        = item.get('topics', []),
                description   = item.get('description', ''),
                examples      = item.get('examples', []),
                constraints   = item.get('constraints', []),
                hints         = item.get('hints', []),
                acceptance    = float(item.get('acceptance', 0)),
                source        = item.get('source', 'leetcode'),
            )
            db.session.add(p)
            db.session.flush()   # assign p.id before creating its test cases
            inserted += 1

        cases += seed_sample_cases(p, item.get('examples', []))

    db.session.commit()
    print(f"  [OK] Problems: {inserted} inserted, {updated} updated")
    print(f"  [OK] Sample test cases seeded: {cases}")


def seed_study_plans():
    for plan_def in STUDY_PLANS:
        sections = plan_def.pop('sections', [])
        existing = StudyPlan.query.filter_by(slug=plan_def['slug']).first()
        if existing:
            plan = existing
        else:
            plan = StudyPlan(**plan_def)
            db.session.add(plan)
            db.session.flush()

        # Update total_problems count
        total = sum(len(slugs) for _, slugs in sections)
        plan.total_problems = total

        # Rebuild sections
        StudyPlanSection.query.filter_by(plan_id=plan.id).delete()
        for idx, (title, slugs) in enumerate(sections):
            sec = StudyPlanSection(
                plan_id=plan.id,
                title=title,
                order_index=idx,
                problem_ids=slugs,
            )
            db.session.add(sec)

    db.session.commit()
    print(f"  [OK] Study plans: {len(STUDY_PLANS)} upserted")


if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        print("=" * 50)
        print("NexLab Practice Library — DB Seed")
        print("=" * 50)
        try:
            seed_problems()
        except Exception as e:
            print(f"⚠️ Error seeding problems: {e}")
        try:
            seed_study_plans()
        except Exception as e:
            print(f"⚠️ Error seeding study plans: {e}")
        print("=" * 50)
        print("DONE [OK]")
