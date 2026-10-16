from app import create_app
from app.extensions import db
from app.models.academic import Department, Section, SectionStudent, Batch
from app.models.user import User

app = create_app('development')
with app.app_context():
    iid = 'inst-test-001'
    depts = Department.query.filter_by(institution_id=iid).all()
    print('Depts:', [(d.id, d.name, d.code) for d in depts])
    students = User.query.filter_by(institution_id=iid, role='student').all()
    print('Students without department:', sum(1 for s in students if not s.department_id))
    # If students don't have department_id, assign them based on batch or round-robin to depts
    if depts and any(not s.department_id for s in students):
        for idx, s in enumerate(students):
            if not s.department_id:
                s.department_id = depts[idx % len(depts)].id
        db.session.commit()
        print('Assigned departments to students successfully!')
