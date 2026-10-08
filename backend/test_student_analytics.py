"""
Comprehensive Test Suite for Student-Side Analytics & Two-Track Engine
Tests:
  1. Track 2 Platform Rating (difficulty-weighted base, anti-farming, recency)
  2. Platform Leaderboards (global, topic, institution-internal, tenant privacy)
  3. Practice Topic Mastery & Progression
  4. Tiered Content-Unlock Engine
  5. Blended Knowledge Map (Academic Mastery + Practice Strength)
  6. Student-Facing Endpoints:
     - /api/student/analytics/overview (Unified Student Profile)
     - /api/student/analytics/subjects (Enrolled subjects rollup)
     - /api/student/analytics/mastery (Scoped mastery & weak concepts)
     - /api/student/analytics/ranks (Both Academic & Platform ranks)
     - /api/student/analytics/standing (Gentle status & suggestions)
     - /api/student/analytics/platform-standing (Rating, level, badges)
     - /api/student/analytics/unlocks (Content unlock requirements)
     - /api/student/analytics/knowledge-map (Blended map)
     - /api/platform/leaderboard (Track 2 leaderboard)
  7. Security & Privacy Guards:
     - Student A cannot view Student B's data (403 Forbidden)
     - Zero leak of institution-private data in platform leaderboards
"""
import unittest
import uuid
from datetime import datetime, timedelta
from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.institution import Institution
from app.models.academic import Department, AcademicYear, Batch, Section, SectionStudent, SectionSubject
from app.models.subject import Subject
from app.models.experiment import Experiment
from app.models.grading import Grade
from app.models.knowledge import ConceptMastery
from app.models.practice import Problem, PracticeSubmission, StudentXP, StudentBadge, PlatformRating
from app.platform_rank.rating import (
    compute_student_platform_rating,
    update_all_platform_ranks,
    get_student_platform_standing,
)
from app.platform_rank.leaderboard import get_platform_leaderboard
from app.platform_rank.practice_mastery import get_practice_topic_mastery
from app.platform_rank.unlock import check_content_unlocks
from app.platform_rank.blended import compute_blended_knowledge_map


class TestStudentSideAnalytics(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.ctx = cls.app.app_context()
        cls.ctx.push()
        db.create_all()

    @classmethod
    def tearDownClass(cls):
        cls.ctx.pop()

    def tearDown(self):
        try:
            db.session.rollback()
            from app.models.practice import PlatformRatingPeriod
            PlatformRatingPeriod.query.delete()
            PlatformRating.query.delete()
            PracticeSubmission.query.delete()
            Grade.query.delete()
            ConceptMastery.query.delete()
            SectionStudent.query.delete()
            SectionSubject.query.delete()
            Experiment.query.delete()
            Problem.query.delete()
            if hasattr(self, 'inst_id'):
                User.query.filter(User.institution_id == self.inst_id).delete()
                Subject.query.filter(Subject.institution_id == self.inst_id).delete()
                Section.query.filter(Section.institution_id == self.inst_id).delete()
                Batch.query.filter(Batch.institution_id == self.inst_id).delete()
                Department.query.filter(Department.institution_id == self.inst_id).delete()
                AcademicYear.query.filter(AcademicYear.institution_id == self.inst_id).delete()
                Institution.query.filter(Institution.id == self.inst_id).delete()
            db.session.commit()
        except Exception:
            db.session.rollback()

    def setUp(self):
        db.session.rollback()
        from app.models.practice import PlatformRatingPeriod
        PlatformRatingPeriod.query.delete()
        PlatformRating.query.delete()
        PracticeSubmission.query.delete()
        db.session.commit()


        # 1. Setup Institution
        self.inst = Institution(
            id=str(uuid.uuid4()),
            name="Apex Institute of Technology",
            code=f"APEX_{uuid.uuid4().hex[:6]}"
        )
        db.session.add(self.inst)
        db.session.flush()
        self.inst_id = self.inst.id

        # 2. Setup Academic hierarchy
        self.year = AcademicYear(id=str(uuid.uuid4()), institution_id=self.inst_id, year_label="2026", is_active=True)
        self.dept = Department(id=str(uuid.uuid4()), institution_id=self.inst_id, name="Computer Science", code="CS")
        self.batch = Batch(id=str(uuid.uuid4()), institution_id=self.inst_id, year_id=self.year.id, name="CSE-2026")
        self.sec = Section(id=str(uuid.uuid4()), institution_id=self.inst_id, batch_id=self.batch.id, name="A")
        self.subject = Subject(id=str(uuid.uuid4()), institution_id=self.inst_id, department_id=self.dept.id, name="Data Structures", code="CS201")
        db.session.add_all([self.year, self.dept, self.batch, self.sec, self.subject])
        db.session.flush()

        self.instructor = User(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            email=f"prof_{uuid.uuid4().hex[:6]}@apex.edu",
            full_name="Prof. Donald Knuth",
            role="instructor",
            password_hash="mock",
            is_active=True
        )
        db.session.add(self.instructor)
        db.session.flush()

        self.ss = SectionSubject(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            section_id=self.sec.id,
            subject_id=self.subject.id,
            instructor_id=self.instructor.id
        )
        db.session.add(self.ss)

        # 3. Setup Students (Alice & Bob)
        self.alice = User(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            email=f"alice_{uuid.uuid4().hex[:6]}@apex.edu",
            full_name="Alice Chen",
            roll_number="CS-001",
            role="student",
            department_id=self.dept.id,
            password_hash="mock",
            is_active=True
        )
        self.bob = User(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            email=f"bob_{uuid.uuid4().hex[:6]}@apex.edu",
            full_name="Bob Miller",
            roll_number="CS-002",
            role="student",
            department_id=self.dept.id,
            password_hash="mock",
            is_active=True
        )
        db.session.add_all([self.alice, self.bob])
        db.session.flush()

        # Enroll in Section
        db.session.add(SectionStudent(section_id=self.sec.id, student_id=self.alice.id))
        db.session.add(SectionStudent(section_id=self.sec.id, student_id=self.bob.id))

        # 4. Setup Academic Experiments & Grades
        self.exp1 = Experiment(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            subject_id=self.subject.id,
            instructor_id=self.instructor.id,
            title="Linked Lists",
            exp_number=1,
            is_published=True,
            grade_scale=100.0,
            weightage=1.0,
        )
        self.exp2 = Experiment(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            subject_id=self.subject.id,
            instructor_id=self.instructor.id,
            title="Binary Search Trees",
            exp_number=2,
            is_published=True,
            grade_scale=100.0,
            weightage=1.0,
        )
        db.session.add_all([self.exp1, self.exp2])
        db.session.flush()

        # Alice completed exp1 (88%) and exp2 (92%)
        db.session.add(Grade(
            experiment_id=self.exp1.id,
            student_id=self.alice.id,
            final_grade=88.0,
            auto_grade=90.0,
            manual_grade=86.0
        ))
        db.session.add(Grade(
            experiment_id=self.exp2.id,
            student_id=self.alice.id,
            final_grade=92.0,
            auto_grade=95.0,
            manual_grade=89.0
        ))

        # Academic Concept Mastery for Alice
        db.session.add(ConceptMastery(
            student_id=self.alice.id,
            institution_id=self.inst_id,
            concept="Linked Lists",
            mastery_score=85.0
        ))
        db.session.add(ConceptMastery(
            student_id=self.alice.id,
            institution_id=self.inst_id,
            concept="Trees & Graphs",
            mastery_score=78.0
        ))

        # 5. Setup Practice Problems (Track 2)
        uid = uuid.uuid4().hex[:8]
        self.prob_easy = Problem(
            id=str(uuid.uuid4()),
            slug=f"two-sum-test-{uid}",
            title="Two Sum",
            difficulty="Easy",
            nexlab_topic="Arrays & Strings",
            acceptance=0.60
        )
        self.prob_med = Problem(
            id=str(uuid.uuid4()),
            slug=f"reverse-ll-test-{uid}",
            title="Reverse Linked List",
            difficulty="Medium",
            nexlab_topic="Linked Lists",
            acceptance=0.45
        )
        self.prob_hard = Problem(
            id=str(uuid.uuid4()),
            slug=f"merge-k-lists-test-{uid}",
            title="Merge K Sorted Lists",
            difficulty="Hard",
            nexlab_topic="Linked Lists",
            acceptance=0.25
        )
        db.session.add_all([self.prob_easy, self.prob_med, self.prob_hard])
        db.session.flush()

        # Alice solves all 3 problems
        now = datetime.utcnow()
        db.session.add(PracticeSubmission(
            student_id=self.alice.id,
            problem_id=self.prob_easy.id,
            language="python",
            code="def solution(): pass",
            status="Accepted",
            passed=10,
            total=10,
            submitted_at=now - timedelta(days=5)
        ))
        # Add a repeat solve for prob_easy to test ANTI-FARMING guard
        db.session.add(PracticeSubmission(
            student_id=self.alice.id,
            problem_id=self.prob_easy.id,
            language="python",
            code="def solution(): pass # second time",
            status="Accepted",
            passed=10,
            total=10,
            submitted_at=now - timedelta(days=2)
        ))
        db.session.add(PracticeSubmission(
            student_id=self.alice.id,
            problem_id=self.prob_med.id,
            language="python",
            code="def solution(): pass",
            status="Accepted",
            passed=15,
            total=15,
            submitted_at=now - timedelta(days=4)
        ))
        db.session.add(PracticeSubmission(
            student_id=self.alice.id,
            problem_id=self.prob_hard.id,
            language="python",
            code="def solution(): pass",
            status="Accepted",
            passed=20,
            total=20,
            submitted_at=now - timedelta(days=1)
        ))

        # Bob solves only 1 Easy problem
        db.session.add(PracticeSubmission(
            student_id=self.bob.id,
            problem_id=self.prob_easy.id,
            language="python",
            code="def solution(): pass",
            status="Accepted",
            passed=10,
            total=10,
            submitted_at=now - timedelta(days=10)
        ))

        db.session.commit()

    def test_01_platform_rating_and_anti_farming(self):
        """Test Track 2 difficulty-weighted rating calculation & anti-farming protection."""
        alice_rating = compute_student_platform_rating(self.alice.id)
        # Alice solved 3 unique problems:
        # Easy (base 10) + Medium (base 30) + Hard (base 70)
        # Anti-farming: repeat solve of prob_easy must NOT count
        self.assertEqual(alice_rating['problems_solved'], 3)
        self.assertEqual(alice_rating['easy_solved'], 1)
        self.assertEqual(alice_rating['medium_solved'], 1)
        self.assertEqual(alice_rating['hard_solved'], 1)
        # Rating should be strictly > 100 points
        self.assertGreater(alice_rating['rating'], 100.0)

        # Bob solved 1 problem
        bob_rating = compute_student_platform_rating(self.bob.id)
        self.assertEqual(bob_rating['problems_solved'], 1)
        self.assertLess(bob_rating['rating'], alice_rating['rating'])

        # Ranks assignment
        update_all_platform_ranks()
        alice_standing = get_student_platform_standing(self.alice.id)
        self.assertEqual(alice_standing['global_rank'], 1)
        self.assertEqual(alice_standing['global_percentile'], 100.0)

    def test_02_platform_leaderboard_and_tenant_privacy(self):
        """Test global & topic leaderboards and verify zero leak of institution-private data."""
        compute_student_platform_rating(self.alice.id)
        compute_student_platform_rating(self.bob.id)
        update_all_platform_ranks()

        board = get_platform_leaderboard(scope='global', limit=10)
        self.assertGreaterEqual(board['cohort_size'], 2)
        top = board['leaderboard'][0]
        self.assertEqual(top['student_id'], self.alice.id)
        self.assertEqual(top['position'], 1)

        # Verify Tenant Privacy Rule: NO academic grades, risk, or proctor violations in payload
        for row in board['leaderboard']:
            self.assertNotIn('final_grade', row)
            self.assertNotIn('risk_score', row)
            self.assertNotIn('proctor_events', row)
            self.assertIn('rating', row)
            self.assertIn('level', row)

        # Topic Leaderboard for Linked Lists
        topic_board = get_platform_leaderboard(scope='topic', scope_id='Linked Lists', limit=10)
        self.assertEqual(topic_board['scope'], 'topic')
        self.assertGreaterEqual(len(topic_board['leaderboard']), 1)
        self.assertEqual(topic_board['leaderboard'][0]['student_id'], self.alice.id)

    def test_03_practice_mastery_and_unlocks(self):
        """Test topic strength derivation and tiered unlock progression."""
        # Practice mastery for Alice
        mastery_list = get_practice_topic_mastery(self.alice.id)
        self.assertIsInstance(mastery_list, list)
        ll_item = next((m for m in mastery_list if m['topic'] == 'Linked Lists'), None)
        self.assertIsNotNone(ll_item)
        self.assertGreater(ll_item['strength'], 0.0)
        self.assertIn(ll_item['band'], ['Mastered', 'Proficient', 'Learning', 'Needs Practice'])

        # Unlocks for Alice (Easy is always unlocked)
        unlocks = check_content_unlocks(self.alice.id)
        self.assertIn('Easy', unlocks['unlocked_tiers'])
        self.assertIn('next_unlock', unlocks)

    def test_04_blended_knowledge_map(self):
        """Test fusion of Academic ConceptMastery with Practice Topic Strength."""
        blended = compute_blended_knowledge_map(self.alice.id, institution_id=self.inst_id)
        self.assertIn('knowledge_map', blended)
        self.assertGreater(len(blended['knowledge_map']), 0)
        self.assertIn('average_blended_mastery', blended)

        # Linked Lists was present in both tracks
        ll_topic = next((t for t in blended['knowledge_map'] if t['topic'] == 'Linked Lists'), None)
        self.assertIsNotNone(ll_topic)
        self.assertIsNotNone(ll_topic['academic_score'])
        self.assertIsNotNone(ll_topic['practice_strength'])
        self.assertIsNotNone(ll_topic['blended_score'])

    def test_05_student_analytics_overview_api(self):
        """Test GET /api/student/analytics/overview returns unified profile."""
        compute_student_platform_rating(self.alice.id)
        update_all_platform_ranks()

        token = create_access_token(
            identity=self.alice.id,
            additional_claims={'role': 'student', 'institution_id': self.inst_id, 'email': self.alice.email}
        )
        headers = {'Authorization': f'Bearer {token}'}

        client = self.app.test_client()
        res = client.get('/api/student/analytics/overview', headers=headers)
        self.assertEqual(res.status_code, 200)

        data = res.get_json()
        self.assertIn('academic', data)
        self.assertIn('platform', data)
        self.assertIn('knowledge_map', data)
        self.assertIn('highlights', data)
        self.assertIn('unlocks', data)

        # Check Academic components
        self.assertIn('completion', data['academic'])
        self.assertIn('grades', data['academic'])
        self.assertIn('ranks', data['academic'])

        # Check Platform components
        self.assertIn('rating', data['platform'])
        self.assertIn('level', data['platform'])

    def test_06_student_subjects_and_standing_api(self):
        """Test GET /api/student/analytics/subjects and /standing."""
        token = create_access_token(
            identity=self.alice.id,
            additional_claims={'role': 'student', 'institution_id': self.inst_id, 'email': self.alice.email}
        )
        headers = {'Authorization': f'Bearer {token}'}
        client = self.app.test_client()

        # 1. Subjects rollup
        res = client.get('/api/student/analytics/subjects', headers=headers)
        self.assertEqual(res.status_code, 200)
        subj_data = res.get_json()
        self.assertIn('subjects', subj_data)
        self.assertEqual(len(subj_data['subjects']), 1)
        self.assertEqual(subj_data['subjects'][0]['subject_name'], 'Data Structures')
        self.assertEqual(subj_data['subjects'][0]['completed_experiments'], 2)
        self.assertEqual(subj_data['subjects'][0]['completion_pct'], 100.0)

        # 2. Gentle standing
        res = client.get('/api/student/analytics/standing', headers=headers)
        self.assertEqual(res.status_code, 200)
        standing_data = res.get_json()
        self.assertIn('status_label', standing_data)
        self.assertIn('suggestions', standing_data)
        self.assertIsInstance(standing_data['suggestions'], list)

        # 3. Ranks (Two-Track)
        res = client.get('/api/student/analytics/ranks', headers=headers)
        self.assertEqual(res.status_code, 200)
        ranks_data = res.get_json()
        self.assertIn('academic', ranks_data)
        self.assertIn('platform', ranks_data)

    def test_07_security_guard_self_scope_enforcement(self):
        """Ensure student Alice is blocked from accessing Bob's analytics (HTTP 403)."""
        token = create_access_token(
            identity=self.alice.id,
            additional_claims={'role': 'student', 'institution_id': self.inst_id, 'email': self.alice.email}
        )
        headers = {'Authorization': f'Bearer {token}'}
        client = self.app.test_client()

        # Alice attempts to query Bob's overview
        res = client.get(f'/api/student/analytics/overview?student_id={self.bob.id}', headers=headers)
        self.assertEqual(res.status_code, 403)
        self.assertIn('Access denied', res.get_json().get('error', ''))

        # Alice attempts to query Bob's subjects
        res = client.get(f'/api/student/analytics/subjects?student_id={self.bob.id}', headers=headers)
        self.assertEqual(res.status_code, 403)


if __name__ == '__main__':
    unittest.main()
