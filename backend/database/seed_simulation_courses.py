"""
Seed Simulation Courses — run AFTER flask db upgrade
Seeds the 7 interactive virtual-lab courses (48 simulation experiments)
from database/simulations_inventory.json. Idempotent: re-running skips
courses/exercises that already exist (matched by slug / simulation_path).

Usage:
    cd backend
    flask db upgrade
    python database/seed_simulation_courses.py
"""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.extensions import db
from app.models.free import FreeCourse, FreeExercise

app = create_app()

INVENTORY = os.path.join(os.path.dirname(__file__), 'simulations_inventory.json')

# ── Course metadata (order = catalog display order) ─────────────────────────
COURSE_META = {
    'python-programming-lab': {
        'title': 'Python Programming Lab',
        'description': 'Interactive virtual lab for Python fundamentals — variables, control flow, functions, strings, lists, and file handling. Each experiment is a hands-on visual simulator you can tweak live.',
        'difficulty': 'beginner',
        'language': 'python',
        'tags': ['python', 'simulation', 'beginner', 'programming'],
        'order_index': 1,
    },
    'python-programming-advanced': {
        'title': 'Python Programming — Advanced',
        'description': 'Advanced Python virtual lab — comprehensions, generators, decorators, error handling, OOP practice, and standard-library deep dives through interactive experiments.',
        'difficulty': 'intermediate',
        'language': 'python',
        'tags': ['python', 'simulation', 'advanced'],
        'order_index': 2,
    },
    'oop-concepts': {
        'title': 'Object Oriented Programming (OOP)',
        'description': 'Visualize OOP in action — classes & objects, constructors, inheritance, polymorphism, abstraction, and static members via step-through simulators.',
        'difficulty': 'intermediate',
        'language': 'java',
        'tags': ['oop', 'simulation', 'java', 'classes'],
        'order_index': 3,
    },
    'data-structures-1': {
        'title': 'Data Structures — 1',
        'description': 'Core data structures as interactive labs — arrays, stacks, queues, linked lists, and recursion with live visualization of every operation.',
        'difficulty': 'intermediate',
        'language': 'python',
        'tags': ['data-structures', 'simulation', 'algorithms'],
        'order_index': 4,
    },
    'data-structures-2': {
        'title': 'Data Structures — 2',
        'description': 'Advanced data structures as interactive labs — trees, binary search trees, heaps, hashing, and graphs with step-by-step visual execution.',
        'difficulty': 'advanced',
        'language': 'python',
        'tags': ['data-structures', 'simulation', 'trees', 'graphs'],
        'order_index': 5,
    },
    'artificial-intelligence': {
        'title': 'Artificial Intelligence',
        'description': 'AI search and reasoning labs — DFS, BFS, greedy best-first search, A*, minimax with alpha-beta pruning, and more, animated step by step.',
        'difficulty': 'advanced',
        'language': 'python',
        'tags': ['ai', 'simulation', 'search', 'algorithms'],
        'order_index': 6,
    },
    'machine-learning-lab': {
        'title': 'Machine Learning Virtual Lab',
        'description': 'Machine learning fundamentals as interactive experiments — regression, classification, clustering, and model evaluation you can run in the browser.',
        'difficulty': 'advanced',
        'language': 'python',
        'tags': ['machine-learning', 'simulation', 'ai'],
        'order_index': 7,
    },
}

XP_REWARD = 20  # XP per completed simulation experiment


def clean_title(raw):
    """Strip '— <X> Virtual Lab' suffixes left over from page titles."""
    return raw.split(' \u2014 ')[0].split(' - Virtual Lab')[0].strip()


def main():
    with open(INVENTORY, encoding='utf-8') as f:
        inventory = json.load(f)

    # Group experiments by course slug, preserving order_index
    by_course = {}
    for entry in inventory:
        by_course.setdefault(entry['course_slug'], []).append(entry)

    created_courses = created_exercises = 0
    for slug, meta in COURSE_META.items():
        entries = sorted(by_course.get(slug, []), key=lambda e: e['order_index'])
        if not entries:
            print(f'[skip] {slug}: no experiments in inventory')
            continue

        course = FreeCourse.query.filter_by(slug=slug).first()
        if not course:
            course = FreeCourse(
                slug=slug,
                title=meta['title'],
                description=meta['description'],
                difficulty=meta['difficulty'],
                language=meta['language'],
                tags=meta['tags'],
                order_index=meta['order_index'],
                is_published=True,
            )
            db.session.add(course)
            db.session.flush()
            created_courses += 1
            print(f'[course] created: {meta["title"]} ({slug})')
        else:
            print(f'[course] exists:    {meta["title"]} ({slug})')

        existing_paths = {
            ex.simulation_path for ex in
            FreeExercise.query.filter_by(course_id=course.id).all()
        }

        for i, entry in enumerate(entries, start=1):
            if entry['path'] in existing_paths:
                continue
            ex = FreeExercise(
                course_id=course.id,
                order_index=entry['order_index'],
                title=clean_title(entry['title']),
                description=(
                    f"Interactive virtual-lab experiment **{i} of {len(entries)}** "
                    f"in {meta['title']}. Run the simulation, tweak the inputs, "
                    f"and observe each step. Mark it complete when you understand "
                    f"the concept."
                ),
                difficulty='medium',
                exercise_type='simulation',
                simulation_path=entry['path'],
                allowed_languages=[],
                test_cases=[],
                xp_reward=XP_REWARD,
                is_published=True,
            )
            db.session.add(ex)
            created_exercises += 1

        print(f'         {len(entries)} experiments total, '
              f'{created_exercises} new so far')

    db.session.commit()

    total = FreeExercise.query.filter_by(exercise_type='simulation').count()
    print(f'\nDone. New courses: {created_courses}, '
          f'new experiments: {created_exercises}, '
          f'total simulation exercises in DB: {total}')


if __name__ == '__main__':
    with app.app_context():
        main()
