"""
Comprehensive Test Suite for Instructor & Student Analytics Backend
Tests:
  1. Multi-Scope Ranking (7 scopes, dense ranks, percentile, cohort size)
  2. Scoped Mastery & Concept Prerequisite Graph (blocked concepts)
  3. Completion & Attendance Rollups
  4. Integrity Confidence Engine & Review Queue
  5. Struggle Quadrant (median splits, quadrant categorization)
  6. Error-Pattern Clustering & Code Replay Timeline
  7. Trajectory Forecasting
  8. Intervention Tracking (pre/post risk scores)
  9. Invariants & Consistency Checks
"""
import unittest
import uuid
from datetime import datetime, timedelta
from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.institution import Institution
from app.models.academic import Department, AcademicYear, Batch, Section, SectionStudent, SectionSubject
from app.models.subject import Subject
from app.models.experiment import Experiment
from app.models.session import LabSession, SessionAttendance
from app.models.submission import CodeAttempt, CodeVersion
from app.models.grading import Grade
from app.models.knowledge import ConceptMastery, ExperimentConcept, ConceptPrereq
from app.models.proctor_event import ProctorEvent
from app.models.intervention import Intervention
from app.analytics.scope import resolve_scope_entities
from app.analytics.ranking import compute_rank_for_scope, get_student_all_ranks
from app.analytics.mastery import compute_scoped_mastery, get_concept_prerequisite_graph
from app.analytics.completion import (
    compute_student_completion_rollup,
    compute_student_attendance_rollup,
    get_student_360_overview,
)
from app.analytics.integrity import compute_integrity_confidence, get_integrity_review_queue
from app.analytics.advanced import (
    compute_struggle_quadrant,
    cluster_error_patterns,
    get_attempt_replay,
    forecast_student_trajectory,
)
from app.analytics.interventions import (
    record_intervention,
    update_intervention_outcome,
    list_interventions,
)


class TestInstructorAnalytics(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.app.config['TESTING'] = True
        cls.ctx = cls.app.app_context()
        cls.ctx.push()

    @classmethod
    def tearDownClass(cls):
        cls.ctx.pop()

    def setUp(self):
        db.session.rollback()
        self.inst = Institution(
            id=str(uuid.uuid4()),
            name="Test University",
            code=f"TU_{uuid.uuid4().hex[:6]}"
        )
        db.session.add(self.inst)
        db.session.flush()
        self.inst_id = self.inst.id

        self.instructor = User(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            email=f"instructor_{uuid.uuid4().hex[:6]}@test.edu",
            full_name="Prof. Alan Turing",
            role="instructor",
            password_hash="mock_hash",
            is_active=True
        )
        db.session.add(self.instructor)
        db.session.flush()

        # Setup basic hierarchy
        self.year = AcademicYear(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            year_label="2025-2026",
            is_active=True
        )
        db.session.add(self.year)

        self.batch = Batch(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            year_id=self.year.id,
            name="CSE 2025-2029",
            program="B.Tech CSE"
        )
        db.session.add(self.batch)

        self.dept = Department(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            name="Computer Science",
            code="CSE"
        )
        db.session.add(self.dept)

        self.subject = Subject(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            department_id=self.dept.id,
            name="Data Structures",
            code="CS201"
        )
        db.session.add(self.subject)

        self.sec = Section(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            batch_id=self.batch.id,
            name="Section A"
        )
        db.session.add(self.sec)
        db.session.flush()

        self.ss = SectionSubject(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            section_id=self.sec.id,
            subject_id=self.subject.id,
            instructor_id=self.instructor.id
        )
        db.session.add(self.ss)
        db.session.flush()

        # Setup 3 students
        self.students = []
        for i in range(3):
            st = User(
                id=str(uuid.uuid4()),
                institution_id=self.inst_id,
                email=f"student_{i}_{uuid.uuid4().hex[:6]}@test.edu",
                full_name=f"Student {i}",
                roll_number=f"2026-CSE-00{i}",
                role="student",
                department_id=self.dept.id,
                password_hash="mock_hash",
                is_active=True
            )
            db.session.add(st)
            db.session.flush()
            self.students.append(st)

            # Enroll in section
            ss_link = SectionStudent(
                section_id=self.sec.id,
                student_id=st.id
            )
            db.session.add(ss_link)
        db.session.flush()

        # Setup 2 experiments
        self.exp1 = Experiment(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            subject_id=self.subject.id,
            title="Linked Lists",
            exp_number=1,
            difficulty_level=2,
            instructor_id=self.ss.instructor_id
        )
        self.exp2 = Experiment(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            subject_id=self.subject.id,
            title="Binary Search Trees",
            exp_number=2,
            difficulty_level=3,
            instructor_id=self.ss.instructor_id
        )
        db.session.add_all([self.exp1, self.exp2])
        db.session.flush()

        # Link experiments to concepts
        ec1 = ExperimentConcept(experiment_id=self.exp1.id, concept="pointers")
        ec2 = ExperimentConcept(experiment_id=self.exp1.id, concept="linked_lists")
        ec3 = ExperimentConcept(experiment_id=self.exp2.id, concept="trees")
        db.session.add_all([ec1, ec2, ec3])

        # Prerequisite: trees requires pointers
        prereq = ConceptPrereq(
            concept="trees",
            requires_concept="pointers",
            subject_id=self.subject.id
        )
        db.session.add(prereq)

        # Student 0: high mastery, high grades
        m0 = ConceptMastery(
            student_id=self.students[0].id,
            concept="pointers",
            mastery_score=90.0,
            institution_id=self.inst_id
        )
        g0 = Grade(
            student_id=self.students[0].id,
            experiment_id=self.exp1.id,
            final_grade=95.0
        )
        # Student 1: low mastery of pointers (deficient prerequisite)
        m1 = ConceptMastery(
            student_id=self.students[1].id,
            concept="pointers",
            mastery_score=35.0,
            institution_id=self.inst_id
        )
        g1 = Grade(
            student_id=self.students[1].id,
            experiment_id=self.exp1.id,
            final_grade=55.0
        )
        # Student 2: moderate
        m2 = ConceptMastery(
            student_id=self.students[2].id,
            concept="pointers",
            mastery_score=70.0,
            institution_id=self.inst_id
        )
        g2 = Grade(
            student_id=self.students[2].id,
            experiment_id=self.exp1.id,
            final_grade=75.0
        )
        db.session.add_all([m0, g0, m1, g1, m2, g2])

        # Submissions
        ca0 = CodeAttempt(
            student_id=self.students[0].id,
            experiment_id=self.exp1.id,
            attempt_number=1,
            language="python",
            files={"main.py": "print('ok')"},
            compile_status="success",
            test_cases_passed=5,
            test_cases_total=5,
            is_final_submission=True
        )
        ca1 = CodeAttempt(
            student_id=self.students[1].id,
            experiment_id=self.exp1.id,
            attempt_number=1,
            language="python",
            files={"main.py": "bad code"},
            compile_status="runtime_error",
            stderr="IndexError: list index out of range",
            test_cases_passed=1,
            test_cases_total=5,
            is_final_submission=False
        )
        db.session.add_all([ca0, ca1])
        db.session.flush()

        # LabSession for proctoring and attendance
        self.session = LabSession(
            id=str(uuid.uuid4()),
            institution_id=self.inst_id,
            section_subject_id=self.ss.id,
            experiment_id=self.exp1.id,
            title="Lab 1 Session",
            duration_minutes=60,
            scheduled_at=datetime.utcnow() - timedelta(days=2),
            status="ended"
        )
        db.session.add(self.session)
        db.session.flush()

        # Proctor event for student 1
        pe = ProctorEvent(
            institution_id=self.inst_id,
            session_id=self.session.id,
            student_id=self.students[1].id,
            event_type="tab_switch",
            severity="high",
            payload={"count": 3}
        )
        db.session.add(pe)

        db.session.commit()

    def tearDown(self):
        db.session.rollback()

    def test_multi_scope_ranking_and_invariants(self):
        """Test multi-scope ranking, dense ranks, and percentile bounds."""
        ranks = compute_rank_for_scope(
            scope_level='section',
            scope_id=self.sec.id,
            institution_id=self.inst_id
        )
        self.assertGreaterEqual(len(ranks), 3)

        # Invariant checks
        positions = [r['rank_position'] for r in ranks]
        self.assertEqual(positions[0], 1)
        for r in ranks:
            self.assertGreaterEqual(r['percentile'], 0.0)
            self.assertLessEqual(r['percentile'], 100.0)
            self.assertGreaterEqual(r['rank_score'], 0.0)
            self.assertLessEqual(r['rank_score'], 100.0)
            self.assertEqual(r['cohort_size'], len(ranks))

        # Test get_student_all_ranks
        st_ranks = get_student_all_ranks(self.students[0].id, self.inst_id)
        self.assertIn('section', st_ranks)
        self.assertIn('institution', st_ranks)
        self.assertIn('platform', st_ranks)

    def test_scoped_mastery_and_prerequisites(self):
        """Test scoped mastery and prerequisite dependency graph."""
        mastery = compute_scoped_mastery(
            student_id=self.students[1].id,
            scope_level='subject',
            scope_id=self.subject.id,
            institution_id=self.inst_id
        )
        self.assertEqual(mastery['scope']['id'], self.subject.id)
        self.assertIn('pointers', mastery['weak_concepts'])
        self.assertTrue(any(c['is_weak'] for c in mastery['concepts']))

        # Test prerequisite walk
        graph = get_concept_prerequisite_graph(
            student_id=self.students[1].id,
            subject_id=self.subject.id
        )
        # trees requires pointers. Student 1 has pointers mastery 35.0 < 50.0.
        self.assertIn('trees', graph['blocked_concepts'])

    def test_completion_and_student_360_overview(self):
        """Test completion rollup and unified Student 360 payload."""
        rollup = compute_student_completion_rollup(
            student_id=self.students[0].id,
            scope_level='subject',
            scope_id=self.subject.id,
            institution_id=self.inst_id
        )
        self.assertGreaterEqual(rollup['assigned'], 2)
        self.assertGreaterEqual(rollup['completed'], 1)
        self.assertGreater(rollup['completion_pct'], 0.0)

        overview = get_student_360_overview(
            student_id=self.students[0].id,
            scope_level='subject',
            scope_id=self.subject.id,
            institution_id=self.inst_id
        )
        self.assertIn('student', overview)
        self.assertIn('completion', overview)
        self.assertIn('attendance', overview)
        self.assertIn('grades', overview)
        self.assertIn('mastery', overview)
        self.assertIn('risk', overview)
        self.assertIn('ranks', overview)

    def test_integrity_engine_and_review_queue(self):
        """Test integrity confidence deductions and review queue."""
        clean_rep = compute_integrity_confidence(self.students[0].id, institution_id=self.inst_id)
        self.assertEqual(clean_rep['integrity_confidence'], 100.0)
        self.assertFalse(clean_rep['review_recommended'])

        flagged_rep = compute_integrity_confidence(self.students[1].id, institution_id=self.inst_id)
        # Student 1 has high severity tab_switch (-15)
        self.assertLess(flagged_rep['integrity_confidence'], 100.0)
        self.assertTrue(flagged_rep['review_recommended'])

        queue = get_integrity_review_queue(
            scope_level='institution',
            institution_id=self.inst_id
        )
        self.assertTrue(any(q['student_id'] == self.students[1].id for q in queue))

    def test_advanced_analytics_features(self):
        """Test struggle quadrant, error clustering, and trajectory forecast."""
        # Struggle quadrant
        quadrant = compute_struggle_quadrant(
            scope_level='section',
            scope_id=self.sec.id,
            institution_id=self.inst_id
        )
        self.assertIn('medians', quadrant)
        self.assertIn('quadrants', quadrant)
        self.assertEqual(len(quadrant['students']), 3)

        # Error clustering
        errors = cluster_error_patterns(self.exp1.id, institution_id=self.inst_id)
        self.assertGreaterEqual(errors['total_failed_attempts'], 1)
        self.assertTrue(any("IndexError" in c['signature'] for c in errors['clusters']))

        # Forecast
        forecast = forecast_student_trajectory(self.students[0].id, institution_id=self.inst_id)
        self.assertIn('projected_final', forecast)
        self.assertIn('confidence_interval', forecast)

    def test_intervention_tracking_lifecycle(self):
        """Test recording, listing, and outcome update for interventions."""
        created = record_intervention(
            student_id=self.students[1].id,
            instructor_id=self.ss.instructor_id,
            institution_id=self.inst_id,
            action_type="tutoring",
            note="Met to explain pointers and arrays"
        )
        self.assertIsNotNone(created['id'])
        self.assertEqual(created['outcome'], 'open')
        self.assertIsNotNone(created['risk_score_before'])

        # Update outcome
        updated = update_intervention_outcome(
            intervention_id=created['id'],
            outcome="improved",
            outcome_note="Student grasped pointer concepts and passed quiz",
            institution_id=self.inst_id
        )
        self.assertEqual(updated['outcome'], 'improved')
        self.assertIsNotNone(updated['risk_score_after'])
        self.assertIn('risk_delta', updated)

        # List interventions
        lst = list_interventions(institution_id=self.inst_id, student_id=self.students[1].id)
        self.assertEqual(lst['total'], 1)

    def test_http_api_endpoints_and_self_scope_guard(self):
        """Test Flask HTTP routes for student_analytics_bp with JWT authentication and self-scope security guard."""
        from flask_jwt_extended import create_access_token

        client = self.app.test_client()

        # 1. Instructor Token
        inst_token = create_access_token(
            identity=self.instructor.id,
            additional_claims={
                'role': 'instructor',
                'institution_id': self.inst_id,
                'email': self.instructor.email
            }
        )
        inst_headers = {'Authorization': f'Bearer {inst_token}'}

        # Student 0 Overview
        res = client.get(
            f'/api/analytics/student/{self.students[0].id}/overview?scope_level=subject&scope_id={self.subject.id}',
            headers=inst_headers
        )
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn('student', data)
        self.assertIn('completion', data)
        self.assertIn('mastery', data)
        self.assertIn('ranks', data)

        # Student Ranks
        res = client.get(
            f'/api/analytics/student/{self.students[0].id}/ranks',
            headers=inst_headers
        )
        self.assertEqual(res.status_code, 200)
        ranks_data = res.get_json()
        self.assertIn('ranks', ranks_data)

        # Student Mastery
        res = client.get(
            f'/api/analytics/student/{self.students[0].id}/mastery?scope_level=subject&scope_id={self.subject.id}',
            headers=inst_headers
        )
        self.assertEqual(res.status_code, 200)

        # Student Prerequisites
        res = client.get(
            f'/api/analytics/student/{self.students[1].id}/prerequisites?subject_id={self.subject.id}',
            headers=inst_headers
        )
        self.assertEqual(res.status_code, 200)
        prereq_data = res.get_json()
        self.assertIn('blocked_concepts', prereq_data)

        # Struggle Quadrant
        res = client.get(
            f'/api/analytics/struggle-quadrant?scope_level=section&scope_id={self.sec.id}',
            headers=inst_headers
        )
        self.assertEqual(res.status_code, 200)
        sq_data = res.get_json()
        self.assertIn('quadrants', sq_data)

        # Error Clusters
        res = client.get(
            f'/api/analytics/error-clusters/{self.exp1.id}',
            headers=inst_headers
        )
        self.assertEqual(res.status_code, 200)

        # Scoped Rankings
        res = client.get(
            f'/api/analytics/rankings/scope?scope_level=section&scope_id={self.sec.id}',
            headers=inst_headers
        )
        self.assertEqual(res.status_code, 200)

        # 2. Student Token & Self-Scope Guard Verification
        st0_token = create_access_token(
            identity=self.students[0].id,
            additional_claims={
                'role': 'student',
                'institution_id': self.inst_id,
                'email': self.students[0].email
            }
        )
        st0_headers = {'Authorization': f'Bearer {st0_token}'}

        # Student 0 requesting their OWN overview -> 200 OK
        res = client.get(
            f'/api/analytics/student/{self.students[0].id}/overview',
            headers=st0_headers
        )
        self.assertEqual(res.status_code, 200)

        # Student 0 requesting ANOTHER student's overview -> 403 Forbidden!
        res_forbidden = client.get(
            f'/api/analytics/student/{self.students[1].id}/overview',
            headers=st0_headers
        )
        self.assertEqual(res_forbidden.status_code, 403)
        self.assertIn('access denied', res_forbidden.get_json().get('error', '').lower())


if __name__ == '__main__':
    unittest.main()

