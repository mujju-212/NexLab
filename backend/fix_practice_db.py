import time
from app import create_app, db
from app.models.practice import Problem, StudyPlan
from sqlalchemy import text

app = create_app()

with app.app_context():
    print("Database URI:", app.config.get("SQLALCHEMY_DATABASE_URI", "")[:30])
    
    # 1. Inspect non-numeric lc_id rows
    rows = db.session.execute(text("""
        SELECT count(*) FROM practice_problems 
        WHERE lc_id IS NULL OR lc_id = 'None' OR lc_id !~ '^[0-9]+$'
    """)).scalar()
    print("Non-numeric or 'None' lc_id count:", rows)

    # 2. Assign valid sequential numeric lc_id to all problems where lc_id is None, 'None', or non-numeric
    # First, let's ensure the top 5 problems have their exact IDs matching Image 2
    curated = [
        ('two-sum', '1', 0.498, '["Array", "Hash Table"]'),
        ('valid-parentheses', '2', 0.421, '["Stack", "String"]'),
        ('merge-two-sorted-lists', '3', 0.563, '["Linked List", "Recursion"]'),
        ('binary-tree-inorder-traversal', '4', 0.625, '["Tree", "Stack"]'),
        ('maximum-subarray', '5', 0.467, '["Array", "Dynamic Programming"]'),
    ]

    for slug, lcid, acc, topics_json in curated:
        p = Problem.query.filter_by(slug=slug).first()
        if p:
            p.lc_id = lcid
            p.acceptance = acc
            p.topics = topics_json
            print(f"Updated curated problem: {p.title} -> lc_id={lcid}")

    db.session.commit()

    # Next, assign numeric integer strings to any remaining problems with invalid lc_id
    all_problems = Problem.query.order_by(Problem.created_at.asc()).all()
    next_id = 6
    updated = 0
    for p in all_problems:
        # Check if lc_id is valid digits
        val = str(p.lc_id or '').strip()
        if not val or val == 'None' or not val.isdigit():
            p.lc_id = str(next_id)
            updated += 1
            next_id += 1
        else:
            int_val = int(val)
            if int_val >= next_id:
                next_id = int_val + 1

    db.session.commit()
    print(f"Assigned valid numeric lc_id to {updated} problems. Highest lc_id: {next_id - 1}")

    # 3. Check Study Plans in this database!
    plans = StudyPlan.query.all()
    print("Total Study Plans in DB:", len(plans))
    for pl in plans:
        print(f"Plan: slug={pl.slug}, title={pl.title}, order_index={pl.order_index}")

    # If study plans need curation in Postgres (matching Image 2):
    plan_data = [
        {
            'slug': 'nexlab-75',
            'title': 'NexLab 75',
            'description': 'The 75 most essential problems every developer must know. Covers all major patterns.',
            'difficulty_mix': 'Easy–Hard',
            'order_index': 1,
            'total_problems': 66,
            'tag': 'Most Popular'
        },
        {
            'slug': 'beginner-path',
            'title': 'Beginner Path',
            'description': '30 beginner-friendly problems. Master the basics of arrays, strings, and math.',
            'difficulty_mix': 'Easy',
            'order_index': 2,
            'total_problems': 28,
            'tag': 'Beginner'
        },
        {
            'slug': 'dp-mastery',
            'title': 'DP Mastery',
            'description': '50 problems covering every Dynamic Programming pattern from basics to advanced.',
            'difficulty_mix': 'Medium–Hard',
            'order_index': 3,
            'total_problems': 41,
            'tag': 'Advanced'
        },
        {
            'slug': 'trees-and-graphs',
            'title': 'Trees & Graphs',
            'description': '40 problems covering tree traversals, graph algorithms, and network problems.',
            'difficulty_mix': 'Medium',
            'order_index': 4,
            'total_problems': 40,
            'tag': 'Intermediate'
        },
        {
            'slug': 'sql-50',
            'title': 'SQL 50',
            'description': 'Master SQL with 50 problems from basic queries to advanced window functions.',
            'difficulty_mix': 'Easy–Medium',
            'order_index': 5,
            'total_problems': 50,
            'tag': 'Beginner'
        },
    ]

    for pdef in plan_data:
        pl = StudyPlan.query.filter_by(slug=pdef['slug']).first()
        if pl:
            pl.title = pdef['title']
            pl.description = pdef['description']
            pl.difficulty_mix = pdef['difficulty_mix']
            pl.order_index = pdef['order_index']
            pl.total_problems = pdef['total_problems']
        else:
            pl = StudyPlan(
                slug=pdef['slug'],
                title=pdef['title'],
                description=pdef['description'],
                difficulty_mix=pdef['difficulty_mix'],
                order_index=pdef['order_index'],
                total_problems=pdef['total_problems'],
            )
            db.session.add(pl)
    db.session.commit()
    print("Study plans verified and saved.")
