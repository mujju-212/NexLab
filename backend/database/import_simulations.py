"""
Import external 'courses simulation' HTML labs into the NexLab app.

1. Copies each experiment's index.html to
   frontend/public/simulations/<course-slug>/<exp-slug>.html
2. Rethemes the labs to the NexLab purple palette (indigo -> #7c3aed family)
3. Writes an inventory JSON consumed by seed_simulation_courses.py

Usage:
    cd backend
    python database/import_simulations.py
"""
import html as html_lib
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, 'frontend', 'courses simulation')
DEST = os.path.join(ROOT, 'frontend', 'public', 'simulations')
OUT_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        'simulations_inventory.json')

# folder name -> course slug (stable, URL-safe)
COURSE_SLUGS = {
    'python programming lab':              'python-programming-lab',
    'python programming lab - advanced':   'python-programming-advanced',
    'object oriented programming (oop)':   'oop-concepts',
    'data structure - 1':                  'data-structures-1',
    'data structure - 2':                  'data-structures-2',
    'artificial intelligence':             'artificial-intelligence',
    'machine learning virtual lab':        'machine-learning-lab',
}


def slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    s = re.sub(r'-{2,}', '-', s).strip('-')
    return s or 'experiment'


def retheme(html: str) -> str:
    """Shift the labs' indigo accent onto the NexLab purple palette."""
    replacements = [
        # raw hex accents
        ('#4f46e5', '#7c3aed'), ('#4F46E5', '#7c3aed'),
        ('#6366f1', '#9333ea'), ('#6366F1', '#9333ea'),
        ('#818cf8', '#a855f7'),
        ('#eef2ff', '#f7f3ff'),  # indigo-50 style wash
        ('#e0e7ff', '#f3e8ff'),
        ('#c7d2fe', '#e9d5ff'),
        # Tailwind CDN utility classes: indigo-* -> purple-*
        ('indigo-50',  'purple-50'),
        ('indigo-100', 'purple-100'),
        ('indigo-200', 'purple-200'),
        ('indigo-300', 'purple-300'),
        ('indigo-400', 'purple-400'),
        ('indigo-500', 'purple-500'),
        ('indigo-600', 'purple-600'),
        ('indigo-700', 'purple-700'),
        ('indigo-800', 'purple-800'),
        ('indigo-900', 'purple-900'),
        # rgba accents used in inline styles
        ('rgba(79,70,229', 'rgba(124,58,237'),
        ('rgba(99,102,241', 'rgba(147,51,234'),
        # legend text describing accent-colored markers
        ('PC1 = indigo', 'PC1 = purple'),
        ('indigo = PC1', 'purple = PC1'),
        ('+1 = indigo', '+1 = purple'),
        ('highlighted in indigo', 'highlighted in purple'),
        ('the normal indigo', 'the normal purple'),
    ]
    for old, new in replacements:
        html = html.replace(old, new)
    return html


def extract_title(html: str, fallback: str) -> str:
    m = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE | re.DOTALL)
    if m:
        title = html_lib.unescape(m.group(1).strip())
        # drop the generic '— Virtual Lab' suffix / 'X Virtual Lab:' prefix
        title = re.sub(r'\s*[—–-]\s*Virtual Lab.*$', '', title)
        title = re.sub(r'^.*Virtual Lab:\s*', '', title)
        return title
    return fallback.title()


def main():
    if not os.path.isdir(SRC):
        print(f'Source not found: {SRC}')
        sys.exit(1)

    if os.path.isdir(DEST):
        shutil.rmtree(DEST)

    inventory = []
    for course_dir in sorted(os.listdir(SRC)):
        course_path = os.path.join(SRC, course_dir)
        if not os.path.isdir(course_path):
            continue
        slug = COURSE_SLUGS.get(course_dir.lower())
        if not slug:
            print(f'!! unmapped course folder skipped: {course_dir}')
            continue

        os.makedirs(os.path.join(DEST, slug), exist_ok=True)
        order = 0
        for exp_dir in sorted(os.listdir(course_path)):
            exp_path = os.path.join(course_path, exp_dir)
            html_file = os.path.join(exp_path, 'index.html')
            if not os.path.isfile(html_file):
                # one lab ships its page as final.html instead
                alt = os.path.join(exp_path, 'final.html')
                html_file = alt if os.path.isfile(alt) else html_file
            if not os.path.isfile(html_file):
                print(f'!! no index.html, skipped: {course_dir}/{exp_dir}')
                continue
            order += 1
            exp_slug = slugify(exp_dir)

            with open(html_file, encoding='utf-8', errors='replace') as f:
                html = f.read()
            title = extract_title(html, exp_dir)
            html = retheme(html)

            out_name = f'{exp_slug}.html'
            with open(os.path.join(DEST, slug, out_name), 'w',
                      encoding='utf-8', newline='\n') as f:
                f.write(html)

            inventory.append({
                'course_slug': slug,
                'course_folder': course_dir,
                'exp_slug': exp_slug,
                'title': title,
                'order_index': order,
                'path': f'/simulations/{slug}/{out_name}',
            })
            print(f'  ok  {slug}/{out_name}  <-  {title}')

    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(inventory, f, indent=2, ensure_ascii=False)
    print(f'\nImported {len(inventory)} experiments -> {DEST}')
    print(f'Inventory written to {OUT_JSON}')


if __name__ == '__main__':
    main()
