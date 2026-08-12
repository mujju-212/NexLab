"""
Seed Free Courses — run AFTER flask db upgrade
Seeds beginner-level Python and DSA courses with sample exercises.

Usage:
    cd backend
    flask db upgrade
    python database/seed_free_courses.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.extensions import db
from app.models.free import FreeCourse, FreeExercise

app = create_app()

COURSES = [
    {
        'slug': 'python-basics',
        'title': 'Python Basics',
        'description': 'Learn Python from scratch — variables, loops, functions, and more. Perfect for complete beginners.',
        'difficulty': 'beginner',
        'language': 'python',
        'tags': ['python', 'beginner', 'programming'],
        'order_index': 1,
        'exercises': [
            {
                'title': 'Hello, World!',
                'description': 'Write a Python program that prints `Hello, World!` to the console.\n\n**Example Output:**\n```\nHello, World!\n```',
                'difficulty': 'easy',
                'exercise_type': 'coding',
                'allowed_languages': ['python'],
                'starter_code': {'python': 'print()\n'},
                'test_cases': [{'input': '', 'expected': 'Hello, World!', 'hidden': False}],
                'xp_reward': 5,
            },
            {
                'title': 'Sum of Two Numbers',
                'description': 'Read two integers from input and print their sum.\n\n**Input:** Two integers on separate lines\n**Output:** Their sum',
                'difficulty': 'easy',
                'exercise_type': 'coding',
                'allowed_languages': ['python'],
                'starter_code': {'python': 'a = int(input())\nb = int(input())\n# print the sum\n'},
                'test_cases': [
                    {'input': '3\n5', 'expected': '8', 'hidden': False},
                    {'input': '10\n20', 'expected': '30', 'hidden': False},
                    {'input': '-5\n5', 'expected': '0', 'hidden': True},
                ],
                'xp_reward': 10,
            },
            {
                'title': 'FizzBuzz',
                'description': 'For numbers 1 to N, print:\n- `Fizz` if divisible by 3\n- `Buzz` if divisible by 5\n- `FizzBuzz` if divisible by both\n- The number otherwise\n\n**Input:** N',
                'difficulty': 'easy',
                'exercise_type': 'coding',
                'allowed_languages': ['python'],
                'starter_code': {'python': 'n = int(input())\nfor i in range(1, n+1):\n    pass  # your code here\n'},
                'test_cases': [
                    {'input': '5', 'expected': '1\n2\nFizz\n4\nBuzz', 'hidden': False},
                    {'input': '15', 'expected': '1\n2\nFizz\n4\nBuzz\nFizz\n7\n8\nFizz\nBuzz\n11\nFizz\n13\n14\nFizzBuzz', 'hidden': True},
                ],
                'xp_reward': 15,
            },
            {
                'title': 'Reverse a String',
                'description': 'Read a string and print it reversed.\n\n**Input:** A single line string\n**Output:** The string reversed',
                'difficulty': 'easy',
                'exercise_type': 'coding',
                'allowed_languages': ['python'],
                'starter_code': {'python': 's = input()\n# print reversed string\n'},
                'test_cases': [
                    {'input': 'hello', 'expected': 'olleh', 'hidden': False},
                    {'input': 'NexLab', 'expected': 'baLxeN', 'hidden': True},
                ],
                'xp_reward': 10,
            },
            {
                'title': 'Python Data Types — MCQ',
                'description': 'Which of the following is a mutable data type in Python?',
                'difficulty': 'easy',
                'exercise_type': 'mcq',
                'allowed_languages': [],
                'mcq_options': ['tuple', 'string', 'list', 'int'],
                'mcq_answer': 'C',
                'mcq_explanation': 'Lists are mutable — you can add, remove, or change elements. Tuples and strings are immutable.',
                'xp_reward': 5,
            },
        ],
    },
    {
        'slug': 'dsa-fundamentals',
        'title': 'Data Structures & Algorithms',
        'description': 'Core DSA concepts — arrays, sorting, searching, stacks, queues. Prepare for interviews.',
        'difficulty': 'intermediate',
        'language': 'python',
        'tags': ['dsa', 'algorithms', 'arrays', 'sorting'],
        'order_index': 2,
        'exercises': [
            {
                'title': 'Linear Search',
                'description': 'Given an array of N integers and a target, return the 0-based index of the target. Return -1 if not found.\n\n**Input line 1:** N\n**Input line 2:** N space-separated integers\n**Input line 3:** target',
                'difficulty': 'easy',
                'exercise_type': 'coding',
                'allowed_languages': ['python', 'cpp', 'java'],
                'starter_code': {
                    'python': 'n = int(input())\narr = list(map(int, input().split()))\ntarget = int(input())\n# find index\n',
                    'cpp': '#include<bits/stdc++.h>\nusing namespace std;\nint main(){\n    int n; cin>>n;\n    vector<int> a(n);\n    for(auto &x:a) cin>>x;\n    int t; cin>>t;\n    // find index\n    return 0;\n}',
                },
                'test_cases': [
                    {'input': '5\n1 3 5 7 9\n5', 'expected': '2', 'hidden': False},
                    {'input': '4\n10 20 30 40\n25', 'expected': '-1', 'hidden': False},
                    {'input': '3\n1 2 3\n1', 'expected': '0', 'hidden': True},
                ],
                'xp_reward': 15,
            },
            {
                'title': 'Bubble Sort',
                'description': 'Sort an array of N integers in ascending order using Bubble Sort.\n\n**Input line 1:** N\n**Input line 2:** N space-separated integers\n**Output:** Sorted array space-separated',
                'difficulty': 'medium',
                'exercise_type': 'coding',
                'allowed_languages': ['python', 'cpp', 'java'],
                'starter_code': {
                    'python': 'n = int(input())\narr = list(map(int, input().split()))\n# implement bubble sort\nprint(*arr)\n',
                },
                'test_cases': [
                    {'input': '5\n64 34 25 12 22', 'expected': '12 22 25 34 64', 'hidden': False},
                    {'input': '3\n3 1 2', 'expected': '1 2 3', 'hidden': True},
                ],
                'xp_reward': 20,
            },
            {
                'title': 'Binary Search',
                'description': 'Implement binary search on a SORTED array. Return the index or -1.\n\n**Input line 1:** N\n**Input line 2:** N sorted integers\n**Input line 3:** target',
                'difficulty': 'medium',
                'exercise_type': 'coding',
                'allowed_languages': ['python', 'cpp', 'java'],
                'starter_code': {
                    'python': 'n = int(input())\narr = list(map(int, input().split()))\ntarget = int(input())\nlo, hi = 0, n-1\n# binary search\n',
                },
                'test_cases': [
                    {'input': '6\n1 3 5 7 9 11\n7', 'expected': '3', 'hidden': False},
                    {'input': '4\n2 4 6 8\n5', 'expected': '-1', 'hidden': True},
                ],
                'xp_reward': 20,
            },
            {
                'title': 'Time Complexity — MCQ',
                'description': 'What is the average-case time complexity of QuickSort?',
                'difficulty': 'easy',
                'exercise_type': 'mcq',
                'allowed_languages': [],
                'mcq_options': ['O(n)', 'O(n log n)', 'O(n²)', 'O(log n)'],
                'mcq_answer': 'B',
                'mcq_explanation': 'QuickSort has O(n log n) average case. Worst case is O(n²) when the pivot is always the smallest/largest element.',
                'xp_reward': 5,
            },
        ],
    },
    {
        'slug': 'cpp-essentials',
        'title': 'C++ Essentials',
        'description': 'Learn C++ from the ground up — syntax, pointers, STL, and problem-solving patterns.',
        'difficulty': 'intermediate',
        'language': 'cpp',
        'tags': ['cpp', 'c++', 'programming', 'stl'],
        'order_index': 3,
        'exercises': [
            {
                'title': 'Hello World in C++',
                'description': 'Print `Hello, World!` using C++.',
                'difficulty': 'easy',
                'exercise_type': 'coding',
                'allowed_languages': ['cpp'],
                'starter_code': {'cpp': '#include<iostream>\nusing namespace std;\nint main(){\n    // your code\n    return 0;\n}'},
                'test_cases': [{'input': '', 'expected': 'Hello, World!', 'hidden': False}],
                'xp_reward': 5,
            },
            {
                'title': 'Factorial',
                'description': 'Compute N! (factorial) for a given N.\n\n**Input:** N (0 ≤ N ≤ 12)\n**Output:** N!',
                'difficulty': 'easy',
                'exercise_type': 'coding',
                'allowed_languages': ['cpp', 'python', 'java'],
                'starter_code': {
                    'cpp': '#include<iostream>\nusing namespace std;\nint main(){\n    int n; cin>>n;\n    // compute factorial\n    return 0;\n}',
                    'python': 'n = int(input())\n# compute factorial\n',
                },
                'test_cases': [
                    {'input': '5', 'expected': '120', 'hidden': False},
                    {'input': '0', 'expected': '1', 'hidden': False},
                    {'input': '10', 'expected': '3628800', 'hidden': True},
                ],
                'xp_reward': 10,
            },
        ],
    },
]


with app.app_context():
    seeded_courses = 0
    seeded_exercises = 0

    for cd in COURSES:
        existing = FreeCourse.query.filter_by(slug=cd['slug']).first()
        if existing:
            print(f"  [SKIP] Exists: {cd['slug']}")
            continue

        exercises_data = cd.pop('exercises', [])
        course = FreeCourse(**cd, is_published=True)
        db.session.add(course)
        db.session.flush()  # get id

        for i, ed in enumerate(exercises_data):
            ex = FreeExercise(
                course_id=course.id,
                order_index=i + 1,
                **ed,
            )
            db.session.add(ex)
            seeded_exercises += 1

        seeded_courses += 1
        print(f"  [OK] Seeded: {course.title} ({len(exercises_data)} exercises)")

    db.session.commit()
    print(f"\nDone. {seeded_courses} courses, {seeded_exercises} exercises seeded.")
