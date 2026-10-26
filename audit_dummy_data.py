"""
audit_dummy_data.py — scan the frontend for hardcoded / dummy fallback data.

Finds the patterns that actually surface fake numbers on a fresh install:
  1. `x = apiValue || <number>`      -> fake count when API returns 0/undefined
  2. `x = apiValue || [ {...} ]`     -> fake chart series
  3. hardcoded demo years / names / counts
"""
import re
from pathlib import Path

ROOT = Path("/home/user/frontend")
SKIP = {"node_modules", ".next", ".git", "dist", "build"}

FILES = []
for pattern in ("app/**/*.tsx", "app/**/*.ts", "components/**/*.tsx",
                "components/**/*.ts", "services/**/*.ts", "lib/**/*.ts"):
    for p in ROOT.glob(pattern):
        if any(s in p.parts for s in SKIP):
            continue
        FILES.append(p)

NUMERIC_FALLBACK = re.compile(r"\|\|\s*(\d{1,4})\s*(?:[,;)\]\n]|$)")
STYLE_HINT = re.compile(
    r"(style|width|height|margin|padding|border|fontSize|top|left|right|bottom|"
    r"zIndex|opacity|radius|gap|flex|size|lineHeight|min|max|index|length|"
    r"cols|rows|span|stroke|duration|delay|scale|offset|limit|per_page|days|"
    r"timeout|interval|throttle|slice|precision|toFixed|Math|parseInt|Number|"
    r"year|month|grade_scale|weightage|max_marks|pass_threshold|total_marks|"
    r"minutes|seconds|ms|px|deg|percent|threshold|gate_score|order|page)", re.I)

HARDCODED = [
    (re.compile(r"36 Students"), "hardcoded '36 Students' dropdown copy"),
    (re.compile("2024[\u2013-]2025"), "hardcoded academic year 2024-2025"),
    (re.compile(r"\|\|\s*126\b"), "fake submission count (|| 126)"),
    (re.compile(r"\|\|\s*28\b"), "fake student count (|| 28)"),
    (re.compile(r"\|\|\s*142\b"), "fake solved count (|| 142)"),
    (re.compile(r"\|\|\s*68\b"), "fake violation count (|| 68)"),
    (re.compile(r"\|\|\s*36\b"), "fake section count (|| 36)"),
    (re.compile(r"\|\|\s*(120|152|128|38)\b"), "fake headcount fallback"),
    (re.compile(r"Dr\. Priya Sharma"), "hardcoded instructor name"),
    (re.compile(r"NDU2024004"), "hardcoded roll number"),
]

findings = []
for f in FILES:
    try:
        lines = f.read_text(errors="ignore").splitlines()
    except Exception:
        continue
    rel = f.relative_to(ROOT)
    for i, line in enumerate(lines, 1):
        s = line.strip()
        if s.startswith(("//", "*", "/*")):
            continue
        for m in NUMERIC_FALLBACK.finditer(line):
            if STYLE_HINT.search(line):
                continue
            findings.append((str(rel), i, "NUMERIC FALLBACK", s[:140]))
            break
        if re.search(r"\|\|\s*\[\s*$", line) or re.search(r"\|\|\s*\[\s*\{", line):
            findings.append((str(rel), i, "ARRAY FALLBACK -> fake chart data", s[:140]))
        for pat, why in HARDCODED:
            if pat.search(line):
                findings.append((str(rel), i, f"HARDCODED: {why}", s[:140]))
                break

print(f"Scanned {len(FILES)} frontend files\n")
by_type = {}
for rel, i, kind, text in findings:
    by_type.setdefault(kind, []).append((rel, i, text))

for kind in sorted(by_type):
    rows = by_type[kind]
    print("=" * 78)
    print(f"{kind}   [{len(rows)}]")
    print("=" * 78)
    seen = set()
    for rel, i, text in rows:
        if (rel, text) in seen:
            continue
        seen.add((rel, text))
        print(f"  {rel}:{i}\n     {text}")
    print()

print("=" * 78)
print(f"TOTAL: {len(findings)} findings in {len({f[0] for f in findings})} files")
