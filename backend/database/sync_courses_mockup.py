import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app import create_app
from app.extensions import db
from app.models.platform_content import PlatformCourse, PlatformExercise

app = create_app()

COURSES_DATA = [
    {
        'slug': 'python-foundations',
        'title': 'Python Foundations',
        'difficulty': 'beginner',
        'language': 'python',
        'tags': ['Python', 'Basics', 'Programming'],
        'description': 'Learn Python from scratch with hands-on examples, exercises and mini projects.',
        'order_index': 1,
        'exercise_count': 12,
        'xp': 200,
    },
    {
        'slug': 'algo-basics',
        'title': 'Algorithm Basics',
        'difficulty': 'beginner',
        'language': 'python',
        'tags': ['Algorithms', 'Problem Solving', 'DSA'],
        'description': 'Understand core algorithms with detailed explanations and visualizations.',
        'order_index': 2,
        'exercise_count': 18,
        'xp': 300,
    },
    {
        'slug': 'python-basics',
        'title': 'Python Basics',
        'difficulty': 'beginner',
        'language': 'python',
        'tags': ['Python', 'Functions', 'OOP'],
        'description': 'Dive deeper into Python programming with variables, loops, functions and more.',
        'order_index': 3,
        'exercise_count': 15,
        'xp': 250,
    },
    {
        'slug': 'python-programming-lab',
        'title': 'Python Programming Lab',
        'difficulty': 'beginner',
        'language': 'python',
        'tags': ['Python', 'Simulation', 'Hands-on'],
        'description': 'Interactive coding labs to practice Python with real-world mini experiments.',
        'order_index': 4,
        'exercise_count': 9,
        'xp': 180,
    },
    {
        'slug': 'data-structures',
        'title': 'Data Structures',
        'difficulty': 'intermediate',
        'language': 'python',
        'tags': ['Arrays', 'Linked Lists', 'Trees', 'Graphs'],
        'description': 'Learn essential data structures with practice problems and visual tools.',
        'order_index': 5,
        'exercise_count': 20,
        'xp': 400,
    },
    {
        'slug': 'sql-foundations',
        'title': 'SQL Foundations',
        'difficulty': 'beginner',
        'language': 'sql',
        'tags': ['SQL', 'Database', 'Data Analysis'],
        'description': 'Learn SQL for data analysis with hands-on queries and real datasets.',
        'order_index': 6,
        'exercise_count': 14,
        'xp': 250,
    },
    {
        'slug': 'java-essentials',
        'title': 'Java Essentials',
        'difficulty': 'beginner',
        'language': 'java',
        'tags': ['Java', 'OOP', 'Collections'],
        'description': 'Learn Java programming with OOP concepts, collections and more.',
        'order_index': 7,
        'exercise_count': 18,
        'xp': 350,
    },
    {
        'slug': 'web-development',
        'title': 'Web Development',
        'difficulty': 'beginner',
        'language': 'javascript',
        'tags': ['HTML', 'CSS', 'JavaScript', 'Web'],
        'description': 'Build modern web apps with HTML, CSS and JavaScript through practical projects.',
        'order_index': 8,
        'exercise_count': 22,
        'xp': 400,
    },
    {
        'slug': 'problem-solving-dsa',
        'title': 'Problem Solving & DSA',
        'difficulty': 'advanced',
        'language': 'python',
        'tags': ['DSA', 'Algorithms', 'Competitive'],
        'description': 'Level up your problem solving skills with curated challenges and contests.',
        'order_index': 9,
        'exercise_count': 30,
        'xp': 600,
    },
    {
        'slug': 'cpp-essentials',
        'title': 'C++ Essentials',
        'difficulty': 'intermediate',
        'language': 'cpp',
        'tags': ['C++', 'STL', 'Systems'],
        'description': 'Master C++ programming with memory management, templates and standard library.',
        'order_index': 10,
        'exercise_count': 12,
        'xp': 280,
    },
    {
        'slug': 'artificial-intelligence',
        'title': 'Artificial Intelligence',
        'difficulty': 'advanced',
        'language': 'python',
        'tags': ['AI', 'Heuristics', 'Search'],
        'description': 'Explore foundational AI algorithms, search trees, and decision-making logic.',
        'order_index': 11,
        'exercise_count': 10,
        'xp': 300,
    },
    {
        'slug': 'machine-learning-lab',
        'title': 'Machine Learning Virtual Lab',
        'difficulty': 'advanced',
        'language': 'python',
        'tags': ['Machine Learning', 'Simulation', 'Models'],
        'description': 'Hands-on interactive experiments for regression, classification and clustering.',
        'order_index': 12,
        'exercise_count': 10,
        'xp': 320,
    },
    {
        'slug': 'python-programming-advanced',
        'title': 'Python Programming — Advanced',
        'difficulty': 'intermediate',
        'language': 'python',
        'tags': ['Python', 'Generators', 'Decorators'],
        'description': 'Deep dive into advanced Python design patterns, generators and performance tuning.',
        'order_index': 13,
        'exercise_count': 10,
        'xp': 260,
    },
    {
        'slug': 'data-structures-2',
        'title': 'Advanced Graphs & Trees',
        'difficulty': 'advanced',
        'language': 'python',
        'tags': ['Graphs', 'Trees', 'Shortest Path'],
        'description': 'Master advanced graph traversals, topological sorting and union-find disjoint sets.',
        'order_index': 14,
        'exercise_count': 12,
        'xp': 350,
    },
]

with app.app_context():
    # Hide any duplicates
    for dup in ['algo-3feddd', 'py-found-84a27f']:
        c = PlatformCourse.query.filter_by(slug=dup).first()
        if c:
            c.is_published = False

    for item in COURSES_DATA:
        slug = item['slug']
        c = PlatformCourse.query.filter_by(slug=slug).first()
        if not c:
            c = PlatformCourse(slug=slug, title=item['title'], is_published=True)
            db.session.add(c)
            db.session.flush()

        c.title = item['title']
        c.difficulty = item['difficulty']
        c.language = item['language']
        c.tags = item['tags']
        c.description = item['description']
        c.order_index = item['order_index']
        c.is_published = True

        existing_count = c.exercises.count()
        needed = item['exercise_count'] - existing_count
        if needed > 0:
            for i in range(needed):
                ex = PlatformExercise(
                    course_id=c.id,
                    title=f"{item['title']} Lesson {existing_count + i + 1}",
                    description=f"Hands-on practice exercise for {item['title']}.",
                    difficulty=item['difficulty'],
                    exercise_type='coding',
                    allowed_languages=[item['language']],
                    starter_code={item['language']: '# Write your solution here\n'},
                    test_cases=[{'input': '', 'expected': 'Success', 'hidden': False}],
                    xp_reward=max(5, round(item['xp'] / item['exercise_count'])),
                    order_index=existing_count + i + 1,
                    is_published=True,
                )
                db.session.add(ex)

    db.session.commit()
    print('Courses database synced successfully!')
    for c in PlatformCourse.query.filter_by(is_published=True).order_by(PlatformCourse.order_index.asc()).all():
        print(c.order_index, c.slug, '|', c.title, '|', c.exercises.count(), 'exs |', c.difficulty)
