"""Throwaway analysis + tuning for the balanced nexlab_topic derivation.
Run: python scripts/_analyze_topics.py     (safe to delete afterwards)"""
import json, os
from collections import Counter

import topic_balance as tb  # sibling module (scripts/ is sys.path[0] when run directly)

HERE = os.path.dirname(__file__)
PROBLEMS_FILE = os.path.join(HERE, '..', '..', 'docs', '05-platform-expansion', 'problems', 'problems_nexlab.json')

with open(PROBLEMS_FILE, encoding='utf-8') as f:
    data = json.load(f)

print('TOTAL problems:', len(data))

# ── 1. Raw tag vocabulary + which tags we FAIL to map ──────────────────────────
tagc = Counter()
for p in data:
    for t in p.get('topics', []):
        tagc[t] += 1
print('DISTINCT raw tags:', len(tagc))

unmapped = [(t, c) for t, c in tagc.most_common() if tb.alias(t) is None]
print('--- UNMAPPED raw tags (silently ignored → risk of wrong fallback) ---')
if not unmapped:
    print('  (none — every raw tag maps to a display topic)')
for t, c in unmapped:
    print('  %4d  %s' % (c, t))

# Problems with NO mappable tag (would hit the Array fallback)
no_cand = [p['slug'] for p in data if not tb.candidates(p.get('topics', []))]
print('Problems with zero mappable tags (→ fallback Array): %d' % len(no_cand))
for s in no_cand[:20]:
    print('   ', s)

# ── 2. Current (baked-in) distribution for reference ───────────────────────────
def report(title, assign_map):
    counts = Counter(assign_map.values())
    print('=== %s ===' % title)
    by_sec = {}
    for topic, c in counts.items():
        by_sec.setdefault(tb.section_of(topic), []).append((topic, c))
    order = ['Foundations', 'Data Structures', 'Algorithms', 'Graphs', 'SQL & Shell', 'Other']
    for sec in order:
        if sec not in by_sec:
            continue
        rows = sorted(by_sec[sec], key=lambda x: -x[1])
        tot = sum(c for _, c in rows)
        print('  %-16s (%d)' % (sec, tot))
        for topic, c in rows:
            flag = '  <-- thin' if c < 8 else ('  <-- fat' if c > 50 else '')
            print('      %-22s %3d%s' % (topic, c, flag))
    vals = list(counts.values())
    thin = [t for t, c in counts.items() if c < 8]
    print('  min=%d  max=%d  topics=%d  thin(<8)=%s' % (min(vals), max(vals), len(counts), thin or 'none'))

report('CURRENT baked-in nexlab_topic', {p['slug']: p.get('nexlab_topic') for p in data})

# ── 3. Balanced derivation at several caps ─────────────────────────────────────
items = [(p['slug'], p.get('topics', [])) for p in data]
report('BALANCED derive_primary (no cap)', {k: tb.derive_primary(ts) for k, ts in items})
for cap in (50, 45, 40, 35, 32):
    report('BALANCED cap=%d' % cap, tb.balance(items, cap=cap))
