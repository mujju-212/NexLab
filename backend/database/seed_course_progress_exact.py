import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from datetime import datetime, timedelta
import random

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.platform_content import PlatformCourse, PlatformExercise, PlatformProgress
from app.models.practice import StudentXP, StudentBadge
from app.platform_rank.rating import compute_student_platform_rating, update_all_platform_ranks

app = create_app()

TARGET_COURSES = [
    {
        'slug': 'python-foundations',
        'title': 'Python Foundations',
        'difficulty': 'beginner',
        'language': 'python',
        'tags': ['Python', 'Basics', 'Programming'],
        'description': 'Learn Python from scratch with hands-on examples, exercises and mini projects.',
        'order_index': 1,
        'exercise_count': 20,
        'solved_count': 12,
        'xp_per_ex': 10,
    },
    {
        'slug': 'dsa-fundamentals',
        'title': 'Data Structures & Algorithms',
        'difficulty': 'intermediate',
        'language': 'python',
        'tags': ['DSA', 'Algorithms', 'Arrays'],
        'description': 'Core DSA concepts — arrays, sorting, searching, stacks, queues and more.',
        'order_index': 2,
        'exercise_count': 32,
        'solved_count': 8,
        'xp_per_ex': 10,
    },
    {
        'slug': 'algo-basics',
        'title': 'Algorithm Basics',
        'difficulty': 'beginner',
        'language': 'python',
        'tags': ['Algorithms', 'Problem Solving', 'DSA'],
        'description': 'Understand core algorithms with detailed explanations and visualizations.',
        'order_index': 3,
        'exercise_count': 18,
        'solved_count': 0,
        'xp_per_ex': 10,
    },
    {
        'slug': 'oop-concepts',
        'title': 'Object Oriented Programming',
        'difficulty': 'intermediate',
        'language': 'java',
        'tags': ['OOP', 'Java', 'Simulation'],
        'description': 'Visualize OOP in action — classes, objects, inheritance, polymorphism and more.',
        'order_index': 4,
        'exercise_count': 20,
        'solved_count': 2,
        'xp_per_ex': 10,
    },
    {
        'slug': 'python-basics',
        'title': 'Python Basics',
        'difficulty': 'beginner',
        'language': 'python',
        'tags': ['Python', 'Functions', 'OOP'],
        'description': 'Dive deeper into Python programming with variables, loops, functions and more.',
        'order_index': 5,
        'exercise_count': 15,
        'solved_count': 0,
        'xp_per_ex': 10,
    },
    {
        'slug': 'python-programming-lab',
        'title': 'Python Programming Lab',
        'difficulty': 'intermediate',
        'language': 'python',
        'tags': ['Python', 'Simulation', 'Hands-on'],
        'description': 'Interactive coding labs to practice Python with real-world mini experiments.',
        'order_index': 6,
        'exercise_count': 20,
        'solved_count': 7,
        'xp_per_ex': 10,
    },
    {
        'slug': 'data-structures-1',
        'title': 'Data Structures — 1',
        'difficulty': 'intermediate',
        'language': 'python',
        'tags': ['Arrays', 'Linked Lists', 'Trees'],
        'description': 'Core data structures with practice problems and live visualization of operations.',
        'order_index': 7,
        'exercise_count': 20,
        'solved_count': 3,
        'xp_per_ex': 10,
    },
    {
        'slug': 'web-development',
        'title': 'Web Development Basics',
        'difficulty': 'beginner',
        'language': 'javascript',
        'tags': ['Web', 'HTML', 'CSS'],
        'description': 'HTML, CSS and JavaScript fundamentals with hands-on projects.',
        'order_index': 8,
        'exercise_count': 25,
        'solved_count': 0,
        'xp_per_ex': 10,
    },
    # 3 Completed Courses with Verified Certificates
    {
        'slug': 'sql-foundations',
        'title': 'SQL Foundations',
        'difficulty': 'beginner',
        'language': 'sql',
        'tags': ['SQL', 'Database', 'Data Analysis'],
        'description': 'Learn SQL for data analysis with hands-on queries and real datasets.',
        'order_index': 9,
        'exercise_count': 14,
        'solved_count': 14,
        'xp_per_ex': 10,
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
        'solved_count': 12,
        'xp_per_ex': 10,
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
        'solved_count': 10,
        'xp_per_ex': 10,
    },
    # Additional courses
    {
        'slug': 'data-structures',
        'title': 'Data Structures',
        'difficulty': 'intermediate',
        'language': 'python',
        'tags': ['Arrays', 'Linked Lists', 'Trees', 'Graphs'],
        'description': 'Learn essential data structures with practice problems and visual tools.',
        'order_index': 12,
        'exercise_count': 20,
        'solved_count': 0,
        'xp_per_ex': 10,
    },
    {
        'slug': 'java-essentials',
        'title': 'Java Essentials',
        'difficulty': 'beginner',
        'language': 'java',
        'tags': ['Java', 'OOP', 'Collections'],
        'description': 'Learn Java programming with OOP concepts, collections and more.',
        'order_index': 13,
        'exercise_count': 18,
        'solved_count': 0,
        'xp_per_ex': 10,
    },
    {
        'slug': 'problem-solving-dsa',
        'title': 'Problem Solving & DSA',
        'difficulty': 'advanced',
        'language': 'python',
        'tags': ['DSA', 'Algorithms', 'Competitive'],
        'description': 'Level up your problem solving skills with curated challenges and contests.',
        'order_index': 14,
        'exercise_count': 30,
        'solved_count': 0,
        'xp_per_ex': 10,
    },
    {
        'slug': 'machine-learning-lab',
        'title': 'Machine Learning Virtual Lab',
        'difficulty': 'advanced',
        'language': 'python',
        'tags': ['Machine Learning', 'Simulation', 'Models'],
        'description': 'Hands-on interactive experiments for regression, classification and clustering.',
        'order_index': 15,
        'exercise_count': 10,
        'solved_count': 0,
        'xp_per_ex': 10,
    },
    {
        'slug': 'python-programming-advanced',
        'title': 'Python Programming — Advanced',
        'difficulty': 'intermediate',
        'language': 'python',
        'tags': ['Python', 'Generators', 'Decorators'],
        'description': 'Deep dive into advanced Python design patterns, generators and performance tuning.',
        'order_index': 16,
        'exercise_count': 10,
        'solved_count': 0,
        'xp_per_ex': 10,
    },
    {
        'slug': 'data-structures-2',
        'title': 'Advanced Graphs & Trees',
        'difficulty': 'advanced',
        'language': 'python',
        'tags': ['Graphs', 'Trees', 'Shortest Path'],
        'description': 'Master advanced graph traversals, topological sorting and union-find disjoint sets.',
        'order_index': 17,
        'exercise_count': 12,
        'solved_count': 0,
        'xp_per_ex': 10,
    },
]

with app.app_context():
    user = User.query.filter_by(email="free@nexlab.io").first()
    if not user:
        print("User free@nexlab.io not found!")
        sys.exit(1)

    print(f"Syncing real course catalog and progress for: {user.full_name} ({user.id})")

    # 1. Ensure all courses exist with correct exercise counts and metadata
    for item in TARGET_COURSES:
        course = PlatformCourse.query.filter_by(slug=item['slug']).first()
        if not course:
            course = PlatformCourse(slug=item['slug'], title=item['title'], is_published=True)
            db.session.add(course)
            db.session.flush()

        course.title = item['title']
        course.difficulty = item['difficulty']
        course.language = item['language']
        course.tags = item['tags']
        course.description = item['description']
        course.order_index = item['order_index']
        course.is_published = True

        # Ensure correct exercise count
        current_exercises = PlatformExercise.query.filter_by(course_id=course.id).order_by(PlatformExercise.order_index).all()
        target_count = item['exercise_count']
        
        if len(current_exercises) < target_count:
            for idx in range(len(current_exercises) + 1, target_count + 1):
                ex = PlatformExercise(
                    course_id=course.id,
                    title=f"{item['title']} — Exercise {idx}",
                    description=f"Interactive coding and concepts practice for {item['title']}.",
                    difficulty=item['difficulty'],
                    exercise_type='coding',
                    allowed_languages=[item['language']],
                    starter_code={item['language']: '# Write your solution here\n'},
                    test_cases=[{'input': '', 'expected': 'Success', 'hidden': False}],
                    xp_reward=item['xp_per_ex'],
                    order_index=idx,
                    is_published=True,
                )
                db.session.add(ex)
            db.session.flush()

        # Re-fetch exercises
        exercises = PlatformExercise.query.filter_by(course_id=course.id).order_by(PlatformExercise.order_index).all()

        # Update solved progress for free learner
        solved_count = item['solved_count']
        now = datetime.utcnow()
        for i, ex in enumerate(exercises):
            prog = PlatformProgress.query.filter_by(user_id=user.id, exercise_id=ex.id).first()
            if i < solved_count:
                if not prog:
                    prog = PlatformProgress(
                        user_id=user.id,
                        course_id=course.id,
                        exercise_id=ex.id,
                    )
                    db.session.add(prog)
                prog.status = 'solved'
                prog.attempts = max(1, prog.attempts or 1)
                prog.best_score = 100.0
                prog.xp_earned = ex.xp_reward or 10
                prog.solved_at = now - timedelta(days=random.randint(1, 20), hours=random.randint(1, 10))
            else:
                # If was not supposed to be solved, remove or set attempted if needed
                if prog and prog.status in ('solved', 'completed'):
                    db.session.delete(prog)

    db.session.commit()

    # Re-compute course stats
    from app.platform_user_analytics.course_stats import get_user_course_analytics
    stats = get_user_course_analytics(user.id)
    print("\n--- NEW COMPUTED COURSE STATS ---")
    print(f"Total Courses: {stats['total_courses']}")
    print(f"Enrolled Courses: {stats['enrolled_courses']}")
    print(f"Completed Courses: {stats['completed_courses']}")
    print(f"Total Exercises Solved: {stats['total_exercises_solved']}")
    print(f"Certificates Count: {len(stats['certificates'])}")
    for cert in stats['certificates']:
        print(f"  - Cert ID: {cert['certificate_id']} | Course: {cert['course_title']}")

    print("\nTop 8 Courses Sample:")
    for c in stats['courses'][:8]:
        print(f"  {c['order_index'] if 'order_index' in c else '-'} | {c['title']} | {c['completion_pct']}% | {c['solved_count']}/{c['exercise_count']} lessons | +{c['xp_earned']} XP")
