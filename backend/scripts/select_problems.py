"""
Select ALL quality-passing problems from problems_raw.json -> problems_nexlab.json.
Run: python scripts/select_problems.py   (no network; reads local raw dump)

This replaces the old TARGET_COUNTS per-topic *selection* cap (which limited the
library to 589) with a single quality bar and NO per-topic cap: every problem that
passes is kept. At full scale (~2797) that means no category is thin by selection —
only by how many such problems exist in the source (e.g. Shell has a handful on
LeetCode, and that is a data floor, not a bug).

Quality bar — a problem is kept iff ALL hold:
  1. non-empty description
  2. >= 1 non-empty constraint
  3. >= 1 example with a parseable Output (mirrors seed_problems.parse_example_io,
     so anything kept here will actually seed a visible sample test case)

Writes:
  - problems_nexlab.json     all kept problems, same schema (this is what the DB
                             seeder reads)
  - by_topic/<topic>.json    grouped by balanced nexlab_topic (derived artifact)
  - index.json               totals + per-topic / per-difficulty counts (derived)

Also prints the natural (derive_primary) and balanced (topic_balance.balance)
distributions at several caps, so seed_problems.TOPIC_CAP can be chosen from real
numbers instead of guessed. balance() never drops a problem — it only relabels each
problem within its own tags — so the cap is a labeling knob, not a selection knob.
"""
import sys, os, json, re
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)                     # topic_balance.py lives in scripts/
import topic_balance as tb

PROBLEMS_DIR = os.path.join(HERE, '..', '..', 'docs', '05-platform-expansion', 'problems')
RAW_FILE     = os.path.join(PROBLEMS_DIR, 'problems_raw.json')
OUT_FILE     = os.path.join(PROBLEMS_DIR, 'problems_nexlab.json')
BY_TOPIC_DIR = os.path.join(PROBLEMS_DIR, 'by_topic')
INDEX_FILE   = os.path.join(PROBLEMS_DIR, 'index.json')

NUM_TOPICS = len(tb.KNOWN_TOPICS)            # 30
SECTION_ORDER = ['Foundations', 'Data Structures', 'Algorithms', 'Graphs', 'SQL & Shell', 'Other']

# Mirror seed_problems.parse_example_io's ACCEPT condition exactly: an example is
# usable iff it has an "Output:" whose captured value (up to Explanation/end) is
# non-empty after stripping.
_OUT_RE = re.compile(r'Output:\s*(.*?)(?=\n\s*Explanation:|$)', re.S | re.I)


def has_parseable_example(examples):
    for ex in examples or []:
        if isinstance(ex, dict):
            m = _OUT_RE.search(ex.get('example_text', '') or '')
            if m and m.group(1).strip():
                return True
    return False


def _is_sql_or_shell(topics):
    """SQL/Shell problems are schema/command based — they legitimately ship with no
    'Constraints:' section, so the constraints gate must not apply to them (else the
    whole SQL & Shell section collapses to ~1)."""
    return any(tb.alias(t) in ('SQL', 'Shell') for t in (topics or []))


def quality(p):
    """Return None if the problem passes the bar, else a short reject reason.
    Every kept problem has a parseable example, so the seeder can give it a visible
    sample test case with real expected output — which is the whole point."""
    if not (p.get('description') or '').strip():
        return 'no-description'
    if not has_parseable_example(p.get('examples')):
        return 'no-parseable-example'
    if not _is_sql_or_shell(p.get('topics')) and \
       not [c for c in (p.get('constraints') or []) if str(c).strip()]:
        return 'no-constraints'
    return None


def print_dist(label, counts):
    by_sec = {}
    for topic, c in counts.items():
        by_sec.setdefault(tb.section_of(topic), []).append((topic, c))
    vals = list(counts.values()) or [0]
    avg = sum(vals) / len(vals)
    thin_t, fat_t = max(8, avg * 0.3), avg * 2       # flags scale with library size
    print(f"\n  [{label}]  topics={len(counts)}  min={min(vals)}  max={max(vals)}  avg={avg:.0f}")
    for sec in SECTION_ORDER:
        if sec not in by_sec:
            continue
        rows = sorted(by_sec[sec], key=lambda x: -x[1])
        print(f"    {sec} ({sum(c for _, c in rows)})")
        for topic, c in rows:
            flag = '  <-- thin' if c < thin_t else ('  <-- fat' if c > fat_t else '')
            print(f"        {topic:<22} {c:4d}{flag}")


def main():
    with open(RAW_FILE, encoding='utf-8') as f:
        raw = json.load(f)
    print(f"Loaded {len(raw)} raw problems")

    seen, deduped, dupes = set(), [], 0
    for p in raw:
        slug = (p.get('slug') or '').strip()
        if not slug:
            continue
        if slug in seen:
            dupes += 1
            continue
        seen.add(slug)
        deduped.append(p)

    kept, rejected = [], Counter()
    for p in deduped:
        why = quality(p)
        if why:
            rejected[why] += 1
        else:
            kept.append(p)

    print(f"  dupes removed         : {dupes}")
    print(f"  rejected (low quality): {sum(rejected.values())}  {dict(rejected)}")
    print(f"  KEPT                  : {len(kept)}")

    items = [(p['slug'].strip(), p.get('topics', [])) for p in kept]

    # Show how balance() spreads at several caps so TOPIC_CAP can be chosen from real
    # numbers. 2x the average bucket matches the historically-tuned 40@589.
    print_dist('natural (derive_primary, no balancing)',
               Counter(tb.derive_primary(ts) for _, ts in items))
    cap_2x = max(40, round(2 * len(items) / NUM_TOPICS))
    for cap in sorted({40, round(1.5 * len(items) / NUM_TOPICS), cap_2x}):
        print_dist(f'balanced cap={cap}', Counter(tb.balance(items, cap=cap).values()))

    # Assign the display topic used for the derived artifacts. The DB seeder
    # re-derives this itself from its own TOPIC_CAP, so this is only a placeholder.
    assign = tb.balance(items, cap=cap_2x)
    for p in kept:
        p['nexlab_topic'] = assign.get(p['slug'].strip()) or tb.derive_primary(p.get('topics', []))

    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(kept, f, ensure_ascii=False, indent=2)
    print(f"\n  [OK] wrote problems_nexlab.json  ({len(kept)} problems)")

    # Regenerate derived artifacts. Nothing at runtime reads these (the DB is seeded
    # from problems_nexlab.json); they are kept only so the folder stays coherent.
    os.makedirs(BY_TOPIC_DIR, exist_ok=True)
    for fn in os.listdir(BY_TOPIC_DIR):
        if fn.endswith('.json'):
            os.remove(os.path.join(BY_TOPIC_DIR, fn))
    groups = {}
    for p in kept:
        groups.setdefault(p['nexlab_topic'], []).append(p)
    for topic, plist in groups.items():
        safe = topic.lower().replace(' ', '_').replace('/', '_')
        with open(os.path.join(BY_TOPIC_DIR, f'{safe}.json'), 'w', encoding='utf-8') as f:
            json.dump([{'slug': x['slug'], 'title': x.get('title'),
                        'difficulty': x.get('difficulty'),
                        'nexlab_topic': x['nexlab_topic']} for x in plist],
                      f, ensure_ascii=False, indent=2)

    diff = Counter(p.get('difficulty', 'Medium') for p in kept)
    index = {
        'total': len(kept),
        'source': 'leetcode',
        'by_topic': {t: len(v) for t, v in sorted(groups.items(), key=lambda kv: -len(kv[1]))},
        'by_difficulty': dict(diff),
    }
    with open(INDEX_FILE, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)
    print(f"  [OK] wrote by_topic/ ({len(groups)} topics) + index.json")
    print(f"\nNext: set seed_problems.TOPIC_CAP ~= {cap_2x} (or your pick above), then run:")
    print(f"      python scripts/seed_problems.py")


if __name__ == '__main__':
    main()
