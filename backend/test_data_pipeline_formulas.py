"""
Comprehensive Data Pipeline & Formula Verification Test Suite
Verifies:
1. Academic Completion: compute_student_completion_rollup (SectionStudent -> SectionSubject -> Experiment -> Grade)
2. Attendance Rate: compute_student_attendance_rollup (SessionAttendance where status in ('present', 'late'))
3. Platform Rating: compute_student_platform_rating (1000.0 base, Easy=10, Medium=30, Hard=70, recency, anti-farming)
4. Zero mock/fake overrides in Platform Dashboard: solves < 20 returns real count, NOT 142
5. Blended Competency: compute_blended_knowledge_map (0.60 * Academic + 0.40 * Practice)
6. All 4 Student Analytics dashboard endpoints return valid, real data pipelines.
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
from app.models.session import LabSession, SessionAttendance
from app.models.knowledge import ConceptMastery
from app.models.practice import Problem, PracticeSubmission, StudentXP, PlatformRating, PlatformRatingPeriod
from app.models.free import FreeProgress

from app.analytics.completion import compute_student_completion_rollup, compute_student_attendance_rollup
from app.platform_rank.rating import compute_student_platform_rating, get_student_platform_standing
from app.platform_rank.blended import compute_blended_knowledge_map
from app.student_analytics.overview_builder import (
    build_growth_student_profile,
    build_learning_trend_12_weeks,
    build_summary_kpis,
    build_concept_breakdowns,
)
from app.student_analytics.platform_dashboard_builder import build_platform_dashboard_payload
from app.student_analytics.academic_dashboard_builder import build_academic_dashboard_payload
from app.student_analytics.knowledge_map_builder import build_knowledge_map_dashboard_payload


class TestDataPipelineAndFormulas(unittest.TestCase):

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

    def setUp(self):
        db.session.rollback()

        # Create Institution
        self.inst = Institution(id=str(uuid.uuid4()), name="MIT", code=f"MIT_{uuid.uuid4().hex[:6]}")
        db.session.add(self.inst)
        db.session.flush()

        # Academic hierarchy
        self.year = AcademicYear(id=str(uuid.uuid4()), institution_id=self.inst.id, year_label="2026", is_active=True)
        self.dept = Department(id=str(uuid.uuid4()), institution_id=self.inst.id, name="Computer Science", code="CSE")
        self.batch = Batch(id=str(uuid.uuid4()), institution_id=self.inst.id, year_id=self.year.id, name="CSE-2026")
        self.sec = Section(id=str(uuid.uuid4()), institution_id=self.inst.id, batch_id=self.batch.id, name="A")
        self.subj = Subject(id=str(uuid.uuid4()), institution_id=self.inst.id, department_id=self.dept.id, name="Algorithms", code="CS202")
        db.session.add_all([self.year, self.dept, self.batch, self.sec, self.subj])
        db.session.flush()

        # Student & Instructor
        self.student = User(
            id=str(uuid.uuid4()),
            institution_id=self.inst.id,
            email=f"student_{uuid.uuid4().hex[:6]}@mit.edu",
            full_name="Priya Sharma",
            roll_number="CS-2026-088",
            role="student",
            department_id=self.dept.id,
            password_hash="mock",
            is_active=True,
        )
        self.instructor = User(
            id=str(uuid.uuid4()),
            institution_id=self.inst.id,
            email=f"inst_{uuid.uuid4().hex[:6]}@mit.edu",
            full_name="Prof. Cormen",
            role="instructor",
            password_hash="mock",
            is_active=True,
        )
        db.session.add_all([self.student, self.instructor])
        db.session.flush()

        # Enroll student in section & section subject
        db.session.add(SectionStudent(section_id=self.sec.id, student_id=self.student.id))
        self.ss = SectionSubject(
            id=str(uuid.uuid4()),
            institution_id=self.inst.id,
            section_id=self.sec.id,
            subject_id=self.subj.id,
            instructor_id=self.instructor.id,
        )
        db.session.add(self.ss)
        db.session.commit()

    def test_01_academic_completion_formula_no_fake_defaults(self):
        """Verify completion query SectionStudent -> SectionSubject -> Experiment -> Grade with NO 18/24 fake default."""
        # Baseline: 0 experiments created -> assigned=0, completed=0, completion_pct=0.0
        rollup = compute_student_completion_rollup(self.student.id, institution_id=self.inst.id)
        self.assertEqual(rollup['assigned'], 0)
        self.assertEqual(rollup['completed'], 0)
        self.assertEqual(rollup['completion_pct'], 0.0)

        # Create 4 real experiments
        e1 = Experiment(id=str(uuid.uuid4()), institution_id=self.inst.id, subject_id=self.subj.id, instructor_id=self.instructor.id, title="Exp 1", exp_number=1, is_published=True)
        e2 = Experiment(id=str(uuid.uuid4()), institution_id=self.inst.id, subject_id=self.subj.id, instructor_id=self.instructor.id, title="Exp 2", exp_number=2, is_published=True)
        e3 = Experiment(id=str(uuid.uuid4()), institution_id=self.inst.id, subject_id=self.subj.id, instructor_id=self.instructor.id, title="Exp 3", exp_number=3, is_published=True)
        e4 = Experiment(id=str(uuid.uuid4()), institution_id=self.inst.id, subject_id=self.subj.id, instructor_id=self.instructor.id, title="Exp 4", exp_number=4, is_published=True)
        db.session.add_all([e1, e2, e3, e4])
        db.session.commit()

        # Student completes only Exp 1 and Exp 2
        db.session.add(Grade(experiment_id=e1.id, student_id=self.student.id, final_grade=90.0))
        db.session.add(Grade(experiment_id=e2.id, student_id=self.student.id, final_grade=80.0))
        db.session.commit()

        rollup = compute_student_completion_rollup(self.student.id, institution_id=self.inst.id)
        self.assertEqual(rollup['assigned'], 4)
        self.assertEqual(rollup['completed'], 2)
        self.assertEqual(rollup['completion_pct'], 50.0)
        self.assertNotEqual(rollup['completed'], 18)  # Must NOT be hardcoded 18

    def test_02_attendance_rate_formula_no_fake_defaults(self):
        """Verify attendance rollup queries SessionAttendance where status in ('present', 'late'), no 22/24 fake default."""
        # Baseline: 0 sessions -> scheduled=0, present=0, attendance_rate=0.0
        att_rollup = compute_student_attendance_rollup(self.student.id, institution_id=self.inst.id)
        self.assertEqual(att_rollup['scheduled'], 0)
        self.assertEqual(att_rollup['present'], 0)
        self.assertEqual(att_rollup['attendance_rate'], 0.0)

        # Schedule 3 sessions
        now = datetime.utcnow()
        s1 = LabSession(id=str(uuid.uuid4()), section_subject_id=self.ss.id, institution_id=self.inst.id, title="Lab 1", scheduled_at=now, duration_minutes=60)
        s2 = LabSession(id=str(uuid.uuid4()), section_subject_id=self.ss.id, institution_id=self.inst.id, title="Lab 2", scheduled_at=now, duration_minutes=60)
        s3 = LabSession(id=str(uuid.uuid4()), section_subject_id=self.ss.id, institution_id=self.inst.id, title="Lab 3", scheduled_at=now, duration_minutes=60)
        db.session.add_all([s1, s2, s3])
        db.session.flush()

        # Session 1: present, Session 2: late (counts as attended), Session 3: absent
        db.session.add(SessionAttendance(session_id=s1.id, student_id=self.student.id, status='present'))
        db.session.add(SessionAttendance(session_id=s2.id, student_id=self.student.id, status='late'))
        db.session.add(SessionAttendance(session_id=s3.id, student_id=self.student.id, status='absent'))
        db.session.commit()

        att_rollup = compute_student_attendance_rollup(self.student.id, institution_id=self.inst.id)
        self.assertEqual(att_rollup['scheduled'], 3)
        self.assertEqual(att_rollup['present'], 2)  # 1 present + 1 late
        self.assertEqual(att_rollup['late'], 1)
        self.assertEqual(att_rollup['absent'], 1)
        # Rate: 2 / 3 * 100 = 66.7%
        self.assertAlmostEqual(att_rollup['attendance_rate'], 66.7, places=1)
        self.assertNotEqual(att_rollup['attendance_rate'], 92.0)  # Must NOT be fake 92%

    def test_03_platform_rating_formula(self):
        """
        Verify: Rating = 1000.0 + sum(BaseXP * RecencyWeight) - AntiFarmingPenalty
        Easy=10, Medium=30, Hard=70.
        """
        # 1. Novice student with 0 solves starts at 1000.0
        init_rating = compute_student_platform_rating(self.student.id)
        self.assertEqual(init_rating['rating'], 1000.0)
        self.assertEqual(init_rating['problems_solved'], 0)

        # 2. Add 1 Easy problem solve
        uid = uuid.uuid4().hex[:6]
        p_easy = Problem(id=str(uuid.uuid4()), slug=f"easy-{uid}", title="Easy P", difficulty="Easy", nexlab_topic="Arrays")
        p_med = Problem(id=str(uuid.uuid4()), slug=f"med-{uid}", title="Med P", difficulty="Medium", nexlab_topic="Arrays")
        p_hard = Problem(id=str(uuid.uuid4()), slug=f"hard-{uid}", title="Hard P", difficulty="Hard", nexlab_topic="Trees")
        db.session.add_all([p_easy, p_med, p_hard])
        db.session.commit()

        # Submit Easy problem (100% test cases passed, recent -> RecencyWeight=1.0)
        db.session.add(PracticeSubmission(
            student_id=self.student.id, problem_id=p_easy.id, status="Accepted",
            passed=5, total=5, is_run=False, language="python", code="pass", submitted_at=datetime.utcnow()
        ))
        db.session.commit()

        r1 = compute_student_platform_rating(self.student.id)
        self.assertEqual(r1['problems_solved'], 1)
        self.assertEqual(r1['easy_solved'], 1)
        # 1000.0 + 10.0 * 1.0 = 1010.0 (plus acceptance bonus)
        self.assertGreaterEqual(r1['rating'], 1010.0)

        # 3. Anti-farming guard: repeat solve of same easy problem does NOT increase problems_solved
        db.session.add(PracticeSubmission(
            student_id=self.student.id, problem_id=p_easy.id, status="Accepted",
            passed=5, total=5, is_run=False, language="python", code="pass", submitted_at=datetime.utcnow()
        ))
        db.session.commit()
        r1_repeat = compute_student_platform_rating(self.student.id)
        self.assertEqual(r1_repeat['problems_solved'], 1)  # Only 1 unique solve counted
        self.assertEqual(r1_repeat['rating'], r1['rating'])  # No score inflation

        # 4. Submit Medium and Hard problems
        db.session.add(PracticeSubmission(
            student_id=self.student.id, problem_id=p_med.id, status="Accepted",
            passed=10, total=10, is_run=False, language="python", code="pass", submitted_at=datetime.utcnow()
        ))
        db.session.add(PracticeSubmission(
            student_id=self.student.id, problem_id=p_hard.id, status="Accepted",
            passed=15, total=15, is_run=False, language="python", code="pass", submitted_at=datetime.utcnow()
        ))
        db.session.commit()

        r_all = compute_student_platform_rating(self.student.id)
        self.assertEqual(r_all['problems_solved'], 3)
        self.assertEqual(r_all['easy_solved'], 1)
        self.assertEqual(r_all['medium_solved'], 1)
        self.assertEqual(r_all['hard_solved'], 1)
        # Expected: 1000 + 10(Easy) + 30(Med) + 70(Hard) = 1110.0 (+ quality bonuses)
        self.assertGreaterEqual(r_all['rating'], 1110.0)

    def test_04_no_142_overwrite_in_platform_dashboard(self):
        """Verify that platform_dashboard_builder does NOT overwrite solved count with 142 when solves < 20."""
        # Student currently has 0 solves
        payload = build_platform_dashboard_payload(self.student.id, institution_id=self.inst.id)
        kpis = payload['kpi_metrics']
        solves_val = kpis['problems_solved']['value']
        self.assertEqual(solves_val, 0)
        self.assertNotEqual(solves_val, 142)  # CRITICAL: Must NOT overwrite with 142!

        # Add 3 solves (which is < 20)
        for i in range(3):
            prob = Problem(id=str(uuid.uuid4()), slug=f"prob-{uuid.uuid4().hex[:8]}", title=f"Prob {i}", difficulty="Easy", nexlab_topic="Arrays")
            db.session.add(prob)
            db.session.flush()
            db.session.add(PracticeSubmission(
                student_id=self.student.id, problem_id=prob.id, status="Accepted",
                passed=5, total=5, is_run=False, language="python", code="pass", submitted_at=datetime.utcnow()
            ))
        db.session.commit()
        compute_student_platform_rating(self.student.id)

        payload_3 = build_platform_dashboard_payload(self.student.id, institution_id=self.inst.id)
        solves_val_3 = payload_3['kpi_metrics']['problems_solved']['value']
        self.assertEqual(solves_val_3, 3)
        self.assertNotEqual(solves_val_3, 142)  # CRITICAL: 3 solves must remain 3, not 142!

    def test_05_blended_competency_formula(self):
        """
        Verify: Blended Score = 0.60 * Academic Mastery + 0.40 * Practice Strength
        Academic Mastery from ConceptMastery.mastery_score (or 70.0 base score).
        Practice Strength from PracticeSubmission.passed / total.
        """
        # ConceptMastery for "Arrays & Strings" = 80.0
        db.session.add(ConceptMastery(
            student_id=self.student.id, institution_id=self.inst.id,
            concept="Arrays & Strings", mastery_score=80.0
        ))
        # Practice problem in "Arrays & Strings" with passed=10, total=10 (100% pass ratio)
        prob = Problem(id=str(uuid.uuid4()), slug=f"arr-{uuid.uuid4().hex[:8]}", title="Array Problem", difficulty="Easy", nexlab_topic="Arrays & Strings")
        db.session.add(prob)
        db.session.flush()
        db.session.add(PracticeSubmission(
            student_id=self.student.id, problem_id=prob.id, status="Accepted",
            passed=10, total=10, is_run=False, language="python", code="pass", submitted_at=datetime.utcnow()
        ))
        db.session.commit()

        blended_map = compute_blended_knowledge_map(self.student.id, institution_id=self.inst.id)
        arrays_topic = next((k for k in blended_map['knowledge_map'] if k['topic'] == 'Arrays & Strings'), None)
        self.assertIsNotNone(arrays_topic)
        self.assertEqual(arrays_topic['academic_score'], 80.0)
        self.assertIsNotNone(arrays_topic['practice_strength'])
        # Blended = 0.60 * 80.0 + 0.40 * practice_strength
        expected_blended = round(0.60 * 80.0 + 0.40 * arrays_topic['practice_strength'], 1)
        self.assertEqual(arrays_topic['blended_score'], expected_blended)

    def test_06_all_four_analytics_dashboards_payloads(self):
        """Verify that all 4 dashboards generate valid, consistent payloads."""
        # 1. Overview Tab
        client = self.app.test_client()
        token = create_access_token(identity=self.student.id, additional_claims={'role': 'student', 'institution_id': self.inst.id})
        headers = {'Authorization': f'Bearer {token}'}

        res_overview = client.get(f'/api/student/analytics/overview?student_id={self.student.id}', headers=headers)
        self.assertEqual(res_overview.status_code, 200)
        d_overview = res_overview.get_json()
        self.assertIn('summary_kpis', d_overview)
        self.assertIn('learning_trend', d_overview)
        self.assertIn('academic', d_overview)
        self.assertIn('platform', d_overview)

        # 2. Academic Dashboard
        res_acad = client.get(f'/api/student/analytics/academic-dashboard?student_id={self.student.id}', headers=headers)
        self.assertEqual(res_acad.status_code, 200)
        d_acad = res_acad.get_json()
        self.assertIn('kpi_metrics', d_acad)
        self.assertIn('subject_performance', d_acad)

        # 3. Platform Dashboard
        res_plat = client.get(f'/api/student/analytics/platform-dashboard?student_id={self.student.id}', headers=headers)
        self.assertEqual(res_plat.status_code, 200)
        d_plat = res_plat.get_json()
        self.assertIn('standing', d_plat)
        self.assertIn('kpi_metrics', d_plat)

        # 4. Knowledge Map Dashboard
        res_km = client.get(f'/api/student/analytics/knowledge-map-dashboard?student_id={self.student.id}', headers=headers)
        self.assertEqual(res_km.status_code, 200)
        d_km = res_km.get_json()
        self.assertIn('mindmap', d_km)
        self.assertIn('concept_details', d_km)


if __name__ == '__main__':
    unittest.main()
