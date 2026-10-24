"""
Rich Feedback Seeder for NexLab Instructor Hub & Session Details.
Ensures real database records match the exact figures, topics, distributions,
and comment sentiment seen in the NexLab Instructor UI mockups.
"""
import sys
import os
import uuid
import random
from datetime import datetime, timedelta

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from app.extensions import db
from app.models import (
    User, Institution, Subject, Section, SectionSubject, SectionStudent,
    Experiment, LabSession, SessionFeedback, SessionFeedbackReceipt,
    AcademicYear, Batch, Department
)

# Canonical comments from mockup & authentic lab scenarios
COMMENTS_POSITIVE = [
    ("The lab was very well explained. The step-by-step guidance and hints were really helpful. Loved the interactive approach!", 5, 5, 5, 5, 7),
    ("Very good session. The explanation of Dijkstra's algorithm was clear and the visualization helped a lot.", 5, 5, 4, 5, 6),
    ("Great use of real-world examples. The live coding demo made it much easier to understand.", 5, 5, 5, 4, 4),
    ("Excellent explanation and good real-world examples. The live demo was very clear.", 5, 5, 4, 5, 9),
    ("Step-by-step hints saved me when debugging pointer manipulations. Truly fantastic!", 5, 5, 4, 5, 11),
    ("The interactive graph visualizer made shortest path intuition click immediately.", 5, 5, 5, 5, 5),
    ("Loved how the test cases gave immediate feedback without revealing the full answer.", 5, 4, 5, 4, 3),
    ("Well structured manual. Finished ahead of time thanks to clear diagrams.", 5, 5, 4, 4, 4),
    ("Best lab session this semester! Pacing was spot-on and AI hints were super smart.", 5, 5, 5, 5, 8),
]

COMMENTS_NEUTRAL = [
    ("Good content but the pace was a bit fast. More time for coding practice would be better.", 4, 4, 3, 4, 4),
    ("Good session overall. But the pace felt a bit fast for the last part. More time for implementation would be helpful.", 4, 4, 3, 4, 2),
    ("AI hints were helpful, but sometimes they revealed too much of the solution.", 4, 4, 4, 4, 5),
    ("Session was informative and code templates worked well. Minor network hiccups during test execution.", 4, 4, 4, 4, 3),
    ("Clear explanation of dynamic programming tables, though space optimization could be covered more.", 4, 4, 3, 4, 2),
    ("Fairly good pacing. Could have used 10 more minutes to test all edge cases.", 4, 4, 3, 4, 1),
    ("The BST traversal concept was clear, but iterative implementation needed a bit more time.", 3, 4, 3, 4, 3),
    ("Helpful AI hints when stuck on recursion base cases.", 4, 4, 4, 4, 2),
]

COMMENTS_CRITICAL = [
    ("I found the second part confusing. The instructions in the manual could be more detailed.", 2, 2, 3, 3, 8),
    ("The concept was a bit confusing. The instructions in the manual could be clearer. AI hints helped, but still struggled.", 2, 2, 2, 3, 4),
    ("Pacing was too fast for complex graph implementations. Ran out of time on the last problem.", 2, 3, 2, 3, 5),
    ("Setup took longer than expected due to IDE dependencies. Would appreciate pre-configured stubs.", 2, 2, 2, 2, 3),
    ("Manual had a typo in the sample input which caused 20 minutes of confusion.", 1, 1, 2, 2, 6),
]


def seed_rich_feedback():
    app = create_app()
    with app.app_context():
        iid = 'inst-test-001'
        inst = Institution.query.get(iid)
        if not inst:
            inst = Institution.query.first()
            if not inst:
                print('No institution found!')
                return
            iid = inst.id

        # Find or ensure Subject: Data Structures & Algorithms
        subj = Subject.query.filter(
            Subject.institution_id == iid,
            Subject.name.ilike('%Data Structures%')
        ).first()
        if not subj:
            subj = Subject(
                institution_id=iid,
                name="Data Structures & Algorithms",
                code="CS201",
                description="Core algorithms, graph theory, trees, dynamic programming"
            )
            db.session.add(subj)
            db.session.flush()

        # Find or ensure Section A
        sec = Section.query.filter_by(institution_id=iid, name='A').first()
        if not sec:
            sec = Section.query.filter_by(institution_id=iid).first()

        # Find or link SectionSubject
        ss = SectionSubject.query.filter_by(
            institution_id=iid,
            subject_id=subj.id
        ).first()
        if not ss and sec:
            ss = SectionSubject(
                institution_id=iid,
                section_id=sec.id,
                subject_id=subj.id
            )
            db.session.add(ss)
            db.session.flush()

        # Ensure Section has enrolled students
        enrolled_students = SectionStudent.query.filter_by(section_id=sec.id).all() if sec else []
        enrolled_user_ids = [es.student_id for es in enrolled_students]
        if len(enrolled_user_ids) < 46:
            # pool from users with role=student
            students = User.query.filter_by(institution_id=iid, role='student').limit(50).all()
            for st in students:
                if sec and not SectionStudent.query.filter_by(section_id=sec.id, student_id=st.id).first():
                    db.session.add(SectionStudent(section_id=sec.id, student_id=st.id))
            db.session.flush()
            enrolled_students = SectionStudent.query.filter_by(section_id=sec.id).all() if sec else []
            enrolled_user_ids = [es.student_id for es in enrolled_students]

        # The 5 canonical sessions seen in the mockup:
        # Lab 1: Introduction & Setup
        # Lab 2: Arrays & Searching
        # Lab 3: Trees and BST
        # Lab 4: Graphs & Shortest Path (The drill-down featured in mockup)
        # Lab 5: Dynamic Programming
        target_sessions = [
            {
                'lab_num': 1,
                'exp_title': 'Introduction & Setup',
                'topic': 'Introduction & Setup',
                'date_offset_days': 23,  # Oct 01, 2025
                'target_enrolled': 50,
                'target_feedbacks': 45,
                'overall': 4.6,
                'clarity': 4.5,
                'pacing': 4.3,
                'ai_help': 4.5,
            },
            {
                'lab_num': 2,
                'exp_title': 'Arrays & Searching',
                'topic': 'Arrays & Searching',
                'date_offset_days': 19,  # Oct 05, 2025
                'target_enrolled': 47,
                'target_feedbacks': 41,
                'overall': 4.3,
                'clarity': 4.4,
                'pacing': 4.0,
                'ai_help': 4.3,
            },
            {
                'lab_num': 3,
                'exp_title': 'Trees and BST',
                'topic': 'Trees and BST',
                'date_offset_days': 16,  # Oct 08, 2025
                'target_enrolled': 45,
                'target_feedbacks': 39,
                'overall': 4.1,
                'clarity': 4.0,
                'pacing': 3.6,
                'ai_help': 4.2,
            },
            {
                'lab_num': 4,
                'exp_title': 'Graphs & Shortest Path',
                'topic': 'Graphs & Shortest Path',
                'date_offset_days': 12,  # Oct 12, 2025
                'target_enrolled': 46,
                'target_feedbacks': 40,
                'overall': 4.2,
                'clarity': 4.1,
                'pacing': 3.8,
                'ai_help': 4.0,
            },
            {
                'lab_num': 5,
                'exp_title': 'Dynamic Programming',
                'topic': 'Dynamic Programming',
                'date_offset_days': 9,   # Oct 15, 2025
                'target_enrolled': 48,
                'target_feedbacks': 42,
                'overall': 4.5,
                'clarity': 4.6,
                'pacing': 4.1,
                'ai_help': 4.4,
            },
        ]

        now = datetime.utcnow()
        created_sessions = []

        for ts in target_sessions:
            # Check or create Experiment
            exp = Experiment.query.filter(
                Experiment.institution_id == iid,
                Experiment.title.ilike(f"%{ts['topic']}%")
            ).first()
            inst_user = User.query.filter_by(role='instructor').first()
            if not exp:
                exp = Experiment(
                    institution_id=iid,
                    subject_id=subj.id,
                    instructor_id=inst_user.id if inst_user else 'inst-test-001',
                    exp_number=ts['lab_num'],
                    title=f"Lab {ts['lab_num']} - {ts['topic']}",
                    aim=f"Comprehensive virtual laboratory module on {ts['topic']}.",
                    theory=f"Theoretical analysis and practical algorithmic implementation of {ts['topic']}.",
                    problem_statement=f"Implement and verify optimal algorithms for {ts['topic']} with automated test cases.",
                )
                db.session.add(exp)
                db.session.flush()
            else:
                exp.exp_number = ts['lab_num']

            sess_date = now - timedelta(days=ts['date_offset_days'], hours=4)
            # Find or create LabSession
            sess = LabSession.query.filter_by(
                institution_id=iid,
                experiment_id=exp.id
            ).first()

            if not sess:
                sess = LabSession(
                    institution_id=iid,
                    experiment_id=exp.id,
                    section_subject_id=ss.id if ss else None,
                    title=f"Lab {ts['lab_num']} - {ts['topic']}",
                    status='completed',
                    scheduled_at=sess_date,
                    duration_minutes=120,
                )
                db.session.add(sess)
                db.session.flush()
            else:
                sess.title = f"Lab {ts['lab_num']} - {ts['topic']}"
                sess.status = 'completed'
                sess.scheduled_at = sess_date
                sess.duration_minutes = 120
                if ss:
                    sess.section_subject_id = ss.id

            created_sessions.append((sess, exp, ts))

            # Delete old feedback for this session so we have pristine distribution
            SessionFeedback.query.filter_by(session_id=sess.id).delete(synchronize_session=False)
            SessionFeedbackReceipt.query.filter_by(session_id=sess.id).delete(synchronize_session=False)

            # Generate target_feedbacks responses
            target_count = ts['target_feedbacks']
            # Distribution proportions matching mockup: ~38% 5-star, ~32% 4-star, ~16% 3-star, ~8% 2-star, ~6% 1-star
            num_5 = int(target_count * 0.38)
            num_4 = int(target_count * 0.35)
            num_3 = int(target_count * 0.15)
            num_2 = int(target_count * 0.08)
            num_1 = max(1, target_count - (num_5 + num_4 + num_3 + num_2))

            buckets = [5] * num_5 + [4] * num_4 + [3] * num_3 + [2] * num_2 + [1] * num_1
            random.shuffle(buckets)

            for idx, rating in enumerate(buckets):
                if rating == 5:
                    c_text, ov, cl, pa, ai, up = random.choice(COMMENTS_POSITIVE)
                elif rating == 4:
                    c_text, ov, cl, pa, ai, up = random.choice(COMMENTS_NEUTRAL)
                elif rating == 3:
                    c_text, ov, cl, pa, ai, up = random.choice(COMMENTS_NEUTRAL)
                    ov = 3
                elif rating == 2:
                    c_text, ov, cl, pa, ai, up = random.choice(COMMENTS_CRITICAL)
                else:
                    c_text, ov, cl, pa, ai, up = COMMENTS_CRITICAL[-1]

                fb_time = sess_date + timedelta(hours=2, minutes=idx * 2 + random.randint(1, 15))
                fb = SessionFeedback(
                    session_id=sess.id,
                    institution_id=iid,
                    overall_rating=rating,
                    experiment_clarity=min(5, max(1, cl + random.choice([-1, 0, 1]) if rating < 5 else cl)),
                    session_pacing=min(5, max(1, pa + random.choice([-1, 0, 0]))),
                    ai_hint_helpfulness=min(5, max(1, ai + random.choice([-1, 0, 1]))),
                    comment=c_text if (idx < 15 or random.random() < 0.6) else None,
                    helpful_count=up if c_text else 0,
                    submitted_at=fb_time
                )
                db.session.add(fb)

                # Add receipt for enrolled student
                st_id = enrolled_user_ids[idx % len(enrolled_user_ids)] if enrolled_user_ids else None
                if st_id:
                    db.session.add(SessionFeedbackReceipt(
                        session_id=sess.id,
                        student_id=st_id,
                        submitted_at=fb_time
                    ))

        # Also link Prof. Rohan Mehta to these section subjects so he immediately has full visibility
        rohan = User.query.filter(User.email.ilike('%rohan%')).first()
        if rohan and ss:
            ss.instructor_id = rohan.id
            if ss.section_id:
                # also ensure section_subject has rohan
                SectionSubject.query.filter_by(id=ss.id).update({'instructor_id': rohan.id})

        # Also update demo instructor if present
        demo_inst = User.query.filter(User.email.ilike('%instructor%')).first()
        if demo_inst and demo_inst.id != rohan.id:
            # make demo_inst co-instructor
            if ss:
                ss.co_instructor_id = demo_inst.id

        db.session.commit()
        print(f"Successfully seeded rich feedback for {len(created_sessions)} canonical sessions!")
        for s, exp, ts in created_sessions:
            cnt = SessionFeedback.query.filter_by(session_id=s.id).count()
            print(f" -> Session '{s.title}' (ID: {s.id}): {cnt} feedback rows, exp_id={exp.id}")


if __name__ == '__main__':
    seed_rich_feedback()
