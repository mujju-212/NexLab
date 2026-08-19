"""
NexLab Practice Library — balanced topic derivation
====================================================
Re-derives each problem's single `nexlab_topic` from its full LeetCode tag list
so that the library's topic buckets are BALANCED and foundational buckets fill up
(instead of the old "most-specific tag wins", which starved Array→1 while
Dynamic Programming ballooned to 87).

Two stages:
  1. ALIAS   — fold LeetCode's ~70-tag vocabulary into our 30 display topics.
  2. BALANCE — assign each problem to its highest-priority candidate topic, then
               greedily shed problems from over-`CAP` buckets into a smaller,
               still-valid co-tag (a problem is only ever placed in a topic it is
               actually tagged with). This fills the small foundational buckets
               from the bloated algorithmic ones without inventing memberships.

Imported by both `scripts/seed_problems.py` (production reseed) and
`scripts/_analyze_topics.py` (report / tuning). Self-contained: no app imports.
"""
from collections import Counter

# ── The 30 display topics, grouped by the section the frontend renders ──────────
SECTIONS = {
    'Foundations':     ['Array', 'Matrix', 'String', 'Math', 'Number Theory', 'Sorting', 'Recursion'],
    'Data Structures': ['Hash Table', 'Linked List', 'Stack', 'Monotonic Stack', 'Queue', 'Heap',
                        'Tree', 'Trie', 'Binary Search Tree', 'Segment Tree', 'Design'],
    'Algorithms':      ['Binary Search', 'Two Pointers', 'Sliding Window', 'Prefix Sum',
                        'Greedy', 'Backtracking', 'Dynamic Programming', 'Bit Manipulation'],
    'Graphs':          ['Graph', 'Union Find'],
    'SQL & Shell':     ['SQL', 'Shell'],
}
KNOWN_TOPICS = {t for topics in SECTIONS.values() for t in topics}

# ── Alias: raw LeetCode tag → one of our 30 topics ──────────────────────────────
# Tags already equal to a display topic (Array, String, Graph, …) need no entry;
# they map to themselves in `alias()`.
ALIASES = {
    # SQL / Shell
    'Database': 'SQL',
    'Shell': 'Shell',
    # Heap
    'Heap (Priority Queue)': 'Heap',
    # Trees
    'Binary Tree': 'Tree',
    # Graph family (traversals + graph algorithms all fold into Graph)
    'Depth-First Search': 'Graph',
    'Breadth-First Search': 'Graph',
    'Topological Sort': 'Graph',
    'Shortest Path': 'Graph',
    'Minimum Spanning Tree': 'Graph',
    'Strongly Connected Component': 'Graph',
    'Biconnected Component': 'Graph',
    'Eulerian Circuit': 'Graph',
    'Bidirectional Search': 'Graph',
    # Recursion
    'Divide and Conquer': 'Recursion',
    # Dynamic Programming
    'Memoization': 'Dynamic Programming',
    'Game Theory': 'Dynamic Programming',
    # Range-query structures
    'Binary Indexed Tree': 'Segment Tree',
    # Monotonic
    'Monotonic Queue': 'Monotonic Stack',
    # Lists
    'Doubly-Linked List': 'Linked List',
    # Design-ish structures / paradigms
    'Ordered Set': 'Design',
    'Iterator': 'Design',
    'Data Stream': 'Design',
    'Randomized': 'Design',
    'Reservoir Sampling': 'Design',
    'Rejection Sampling': 'Design',
    'Interactive': 'Design',
    'Concurrency': 'Design',
    # Sorting family
    'Merge Sort': 'Sorting',
    'Bucket Sort': 'Sorting',
    'Counting Sort': 'Sorting',
    'Radix Sort': 'Sorting',
    'Quickselect': 'Sorting',
    'Line Sweep': 'Sorting',
    # Hashing
    'Counting': 'Hash Table',
    'Hash Function': 'Hash Table',
    # Strings
    'String Matching': 'String',
    'Rolling Hash': 'String',
    'Suffix Array': 'String',
    # Array-flavoured
    'Simulation': 'Array',
    'Enumeration': 'Array',
    # Math-flavoured
    'Combinatorics': 'Math',
    'Probability and Statistics': 'Math',
    'Geometry': 'Math',
    'Brainteaser': 'Math',
    # Bit
    'Bitmask': 'Bit Manipulation',
}

# ── Priority: which candidate wins when a problem has several ───────────────────
# Lower rank = chosen first. Ordered most-specialised → most-generic. This decides
# each problem's *initial* bucket (and is the tiebreak during rebalancing); the
# CAP-based shedding below then flattens the tail.
PRIORITY = [
    # domain / highly specialised — if tagged, that IS the problem
    'SQL', 'Shell',
    'Union Find', 'Trie', 'Segment Tree', 'Binary Search Tree',
    'Monotonic Stack', 'Design',
    # distinct algorithmic techniques
    'Backtracking', 'Dynamic Programming', 'Bit Manipulation',
    'Sliding Window', 'Two Pointers', 'Binary Search', 'Prefix Sum', 'Greedy',
    'Graph',
    # data structures
    'Heap', 'Stack', 'Queue', 'Linked List', 'Trie', 'Tree', 'Hash Table',
    # foundations (narrow → broad)
    'Number Theory', 'Recursion', 'Sorting', 'Matrix', 'String', 'Math',
    'Array',
]
_RANK = {t: i for i, t in enumerate(PRIORITY)}
_FALLBACK = 'Array'


def alias(tag):
    """Map one raw tag to a display topic, or None if it isn't one we track."""
    if tag in KNOWN_TOPICS:
        return tag
    return ALIASES.get(tag)


def candidates(topics):
    """Ordered, de-duplicated list of display-topic candidates for a problem,
    best (highest priority) first."""
    seen = []
    for t in topics or []:
        mapped = alias(t)
        if mapped and mapped not in seen:
            seen.append(mapped)
    seen.sort(key=lambda t: _RANK.get(t, 999))
    return seen


def derive_primary(topics):
    """The un-balanced pick: highest-priority candidate (fallback Array)."""
    cands = candidates(topics)
    return cands[0] if cands else _FALLBACK


def balance(items, cap=40):
    """items: list of (key, topics_list). Returns {key: topic}.

    Assign each to its top candidate, then repeatedly move a problem out of any
    over-`cap` bucket into its smallest still-valid alternative candidate, filling
    the smallest buckets first. Deterministic (stable ordering by key)."""
    items = list(items)
    cand_map = {k: candidates(ts) for k, ts in items}
    assign = {}
    counts = Counter()
    for k, _ in items:
        c = cand_map[k]
        t = c[0] if c else _FALLBACK
        assign[k] = t
        counts[t] += 1

    def best_alt(k, cur):
        alts = [c for c in cand_map[k] if c != cur]
        if not alts:
            return None
        # smallest current bucket wins; priority breaks ties
        return min(alts, key=lambda c: (counts[c], _RANK.get(c, 999)))

    # Bounded loop: each iteration moves exactly one problem; cap iterations.
    for _ in range(len(items) * 4):
        over = [t for t, c in counts.items() if c > cap]
        if not over:
            break
        over.sort(key=lambda t: -counts[t])         # relieve the biggest first
        moved = False
        for t in over:
            movers = []
            for k in assign:
                if assign[k] != t:
                    continue
                alt = best_alt(k, t)
                if alt is not None and counts[alt] < counts[t] - 1:
                    movers.append((k, alt))
            if not movers:
                continue
            # fill the smallest destination bucket first; stable by key
            movers.sort(key=lambda ka: (counts[ka[1]], ka[0]))
            k, alt = movers[0]
            counts[t] -= 1
            counts[alt] += 1
            assign[k] = alt
            moved = True
            break
        if not moved:
            break
    return assign


def section_of(topic):
    for sec, topics in SECTIONS.items():
        if topic in topics:
            return sec
    return 'Other'
