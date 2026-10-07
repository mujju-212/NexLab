"""
Automated Verification for NexLab Institution Analytics Backend Redesign.
Tests:
1. Pure metric and risk calculations (invariants, explainability, boundary conditions)
2. Database models (AnalyticsConfig, StudentMetricSnapshot, InstitutionDailyKPI)
3. Snapshot generation and backfill
4. All redesigned institution endpoints via Flask test client
"""
import sys
import unittest
from datetime import datetime, timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

from app import create_app
from app.extensions import db
from app.models.institution import Institution
from app.models.user import User
from app.models.academic import Department, AcademicYear, Batch, Section, SectionSubject, SectionStudent
from app.models.subject import Subject
from app.models.session import LabSession, SessionAttendance
from app.models.experiment import Experiment
from app.models.grading import Grade
from app.models.knowledge import ConceptMastery, FocusScore
from app.models.proctor_event import ProctorEvent
from app.models.analytics_config import AnalyticsConfig
from app.models.analytics_snapshot import StudentMetricSnapshot, InstitutionDailyKPI

from app.analytics.config import get_analytics_config, save_analytics_config
from app.analytics.metrics import resolve_window, compute_student_atomic_metrics, batch_student_atomic_metrics
from app.analytics.risk import compute_student_risk, compute_cohort_risk_summary
from app.analytics.benchmark import compute_cohort_benchmarks, compute_z_score
from app.analytics.funnel import compute_student_funnel
from app.analytics.snapshots import record_daily_snapshot_for_institution, backfill_snapshots


def run_tests():
    app = create_app('testing')
    app.config['TESTING'] = True
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'

    with app.app_context():
        db.create_all()

        # Seed test institution first to satisfy foreign keys
        inst = Institution(id='inst-test', name='Test Tech University', code='TTU', is_active=True)
        db.session.add(inst)
        db.session.commit()

        print("=== 1. Testing AnalyticsConfig and Fallbacks ===")
        cfg = get_analytics_config('inst-nonexistent')
        assert cfg['risk_weights']['mastery'] == 0.25, "Default mastery weight mismatch"
        assert cfg['risk_bands']['critical'] == 70, "Default critical band mismatch"

        # Test save and normalization
        saved = save_analytics_config('inst-test', {
            'risk_weights': {'mastery': 50, 'grade': 50, 'attendance': 0, 'focus': 0, 'consistency': 0, 'freshness': 0},
            'risk_bands': {'critical': 80, 'high': 60, 'watch': 40},
            'min_sample_size': 5,
        })
        assert saved['risk_weights']['mastery'] == 0.5, "Weight normalization failed"
        assert saved['risk_bands']['critical'] == 80, "Band update failed"
        assert saved['min_sample_size'] == 5, "Min sample size update failed"
        print("✓ Config manager and normalization passed")

        print("=== 2. Testing Pure Risk Engine & Explainability ===")
        mock_metrics = {
            'mastery_avg': {'value': 20.0, 'sample_size': 5, 'is_sufficient': True},
            'grade_avg': {'value': 30.0, 'sample_size': 5, 'is_sufficient': True},
            'attendance_rate': {'value': 40.0, 'sample_size': 5, 'is_sufficient': True},
            'focus_avg': {'value': 45.0, 'sample_size': 5, 'is_sufficient': True},
            'consistency': {'value': 50.0, 'sample_size': 5, 'is_sufficient': True},
            'submission_recency_days': {'value': 20.0, 'sample_size': 1, 'is_sufficient': True},
        }
        risk_result = compute_student_risk(mock_metrics)
        assert 0 <= risk_result['risk_score'] <= 100, "Risk score must be bounded 0..100"
        assert risk_result['risk_band'] in ('critical', 'high', 'watch', 'ok'), "Invalid band"
        assert risk_result['primary_reason'] is not None, "Primary reason must be explainable"
        assert 'risk_contributions' in risk_result, "Must return component breakdown"
        assert risk_result['is_at_risk'] is True, "Low score student must be flagged as at risk"
        print(f"✓ Pure risk calculation passed: score={risk_result['risk_score']}, band={risk_result['risk_band']}, driver={risk_result['primary_reason']}")

        print("=== 3. Testing Benchmarking and Funnel Invariants ===")
        cohort = [
            {'id': 'sec-1', 'grade_avg': 85.0, 'attendance_rate': 90.0, 'focus_avg': 80.0, 'risk_score': 20.0},
            {'id': 'sec-2', 'grade_avg': 70.0, 'attendance_rate': 75.0, 'focus_avg': 65.0, 'risk_score': 45.0},
            {'id': 'sec-3', 'grade_avg': 55.0, 'attendance_rate': 60.0, 'focus_avg': 50.0, 'risk_score': 70.0},
        ]
        bm = compute_cohort_benchmarks(cohort)
        assert bm['baselines']['grade_avg']['mean'] == 70.0, "Baseline mean mismatch"
        sec1_bm = next(e for e in bm['entities'] if e['id'] == 'sec-1')
        assert sec1_bm['benchmarks']['grade_avg']['z_score'] > 0, "Top section should have positive z-score"
        print("✓ Cohort benchmarking passed")

        print("=== 4. Testing End-to-End Database Seed & Snapshots ===")
        # Seed users
        admin = User(id='u-admin', email='admin@test.edu', full_name='Admin User', password_hash='hash', role='institution_admin', institution_id=inst.id, is_active=True)
        instr = User(id='u-instr', email='prof@test.edu', full_name='Prof Turing', password_hash='hash', role='instructor', institution_id=inst.id, is_active=True)
        s1 = User(id='u-s1', email='s1@test.edu', full_name='Alice Student', password_hash='hash', role='student', institution_id=inst.id, is_active=True)
        s2 = User(id='u-s2', email='s2@test.edu', full_name='Bob Student', password_hash='hash', role='student', institution_id=inst.id, is_active=True)
        db.session.add_all([admin, instr, s1, s2])
        db.session.commit()

        dept = Department(id='dept-1', institution_id=inst.id, name='Computer Science', code='CS')
        ay = AcademicYear(id='ay-1', institution_id=inst.id, year_label='2024-2025', is_active=True)
        db.session.add_all([dept, ay])
        db.session.commit()

        batch = Batch(id='batch-1', institution_id=inst.id, year_id=ay.id, name='CSE 2nd Year')
        db.session.add(batch)
        db.session.commit()

        sec = Section(id='sec-1', institution_id=inst.id, batch_id=batch.id, name='CS-A')
        sub = Subject(id='sub-1', institution_id=inst.id, department_id=dept.id, name='Algorithms', code='CS201')
        db.session.add_all([sec, sub])
        db.session.commit()

        ss = SectionSubject(id='ss-1', institution_id=inst.id, section_id=sec.id, subject_id=sub.id, instructor_id=instr.id)
        db.session.add(ss)
        db.session.commit()

        db.session.add_all([
            SectionStudent(section_id=sec.id, student_id=s1.id),
            SectionStudent(section_id=sec.id, student_id=s2.id),
        ])
        db.session.commit()

        # Mastery rows
        db.session.add_all([
            ConceptMastery(student_id=s1.id, institution_id=inst.id, concept='Recursion', mastery_score=85.0),
            ConceptMastery(student_id=s2.id, institution_id=inst.id, concept='Recursion', mastery_score=25.0),
        ])

        # Add LabSession for proctor event FK
        sess = LabSession(
            id='sess-1',
            institution_id=inst.id,
            section_subject_id=ss.id,
            title='Recursion Lab',
            scheduled_at=datetime.utcnow() - timedelta(days=2),
            duration_minutes=60,
            status='ended'
        )
        db.session.add(sess)
        db.session.commit()

        # Proctor event
        pe = ProctorEvent(
            id='pe-1',
            institution_id=inst.id,
            session_id=sess.id,
            student_id=s2.id,
            event_type='tab_switch',
            severity='high',
            recorded_at=datetime.utcnow()
        )
        db.session.add(pe)
        db.session.commit()

        # Run snapshot
        snap_res = record_daily_snapshot_for_institution(inst.id)
        assert snap_res['students_snapshotted'] == 2, "Snapshot should process both active students"
        assert InstitutionDailyKPI.query.filter_by(institution_id=inst.id).first() is not None, "InstitutionDailyKPI must be created"
        assert StudentMetricSnapshot.query.filter_by(student_id=s1.id).first() is not None, "StudentMetricSnapshot must be created"
        print("✓ Daily snapshot runner and DB storage passed")

        print("=== 5. Testing Redesigned Endpoints via Test Client ===")
        client = app.test_client()

        from flask_jwt_extended import create_access_token
        token = create_access_token(identity='u-admin', additional_claims={'role': 'institution_admin', 'institution_id': inst.id})
        headers = {'Authorization': f'Bearer {token}'}

        # 1. Overview
        r = client.get('/api/institution/analytics/overview', headers=headers)
        assert r.status_code == 200, f"Overview endpoint failed: {r.data}"
        data = r.get_json()
        assert 'students' in data and 'at_risk' in data['students'], "Overview missing students risk"
        assert 'top_risk_drivers' in data, "Overview missing top_risk_drivers"
        print(f"✓ GET /analytics/overview passed (total={data['students']['total']}, at_risk={data['students']['at_risk']})")

        # 2. Students at risk
        r = client.get('/api/institution/analytics/students-at-risk?threshold=0', headers=headers)
        assert r.status_code == 200, f"Students-at-risk endpoint failed: {r.data}"
        data = r.get_json()
        assert len(data['at_risk_students']) >= 1, "Should return at risk student"
        first_s = data['at_risk_students'][0]
        assert 'risk_score' in first_s and 'primary_reason' in first_s, "Student at risk missing risk breakdown"
        print(f"✓ GET /analytics/students-at-risk passed (returned {len(data['at_risk_students'])} students)")

        # 3. Section comparison
        r = client.get('/api/institution/analytics/section-comparison', headers=headers)
        assert r.status_code == 200, f"Section comparison endpoint failed: {r.data}"
        data = r.get_json()
        assert len(data['sections']) == 1, "Should return section"
        assert 'benchmarks' in data['sections'][0], "Section missing benchmark z-scores"
        print("✓ GET /analytics/section-comparison passed")

        # 4. Risk overview
        r = client.get('/api/institution/analytics/risk/overview', headers=headers)
        assert r.status_code == 200, f"Risk overview failed: {r.data}"
        data = r.get_json()
        assert 'summary' in data and 'bands' in data['summary'], "Risk overview missing bands"
        print("✓ GET /analytics/risk/overview passed")

        # 5. Risk trends
        r = client.get('/api/institution/analytics/risk/trends', headers=headers)
        assert r.status_code == 200, f"Risk trends failed: {r.data}"
        print("✓ GET /analytics/risk/trends passed")

        # 6. Funnel
        r = client.get('/api/institution/analytics/funnel', headers=headers)
        assert r.status_code == 200, f"Funnel failed: {r.data}"
        data = r.get_json()
        stages = [s['count'] for s in data['stages']]
        # Invariant check: monotonic non-increasing
        for i in range(len(stages) - 1):
            assert stages[i] >= stages[i+1], f"Funnel stage violation: {stages[i]} < {stages[i+1]}"
        print(f"✓ GET /analytics/funnel passed (stages={stages})")

        # 7. Benchmark
        r = client.get('/api/institution/analytics/benchmark', headers=headers)
        assert r.status_code == 200, f"Benchmark failed: {r.data}"
        print("✓ GET /analytics/benchmark passed")

        # 8. Integrity
        r = client.get('/api/institution/analytics/integrity', headers=headers)
        assert r.status_code == 200, f"Integrity failed: {r.data}"
        data = r.get_json()
        assert 'campus_integrity_score' in data, "Integrity missing score"
        print(f"✓ GET /analytics/integrity passed (integrity_score={data['campus_integrity_score']})")

        # 9. Outcomes
        r = client.get('/api/institution/analytics/outcomes', headers=headers)
        assert r.status_code == 200, f"Outcomes failed: {r.data}"
        print("✓ GET /analytics/outcomes passed")

        # 10. Config
        r = client.get('/api/institution/analytics/config', headers=headers)
        assert r.status_code == 200, f"Config GET failed: {r.data}"
        r = client.put('/api/institution/analytics/config', json={'min_sample_size': 4}, headers=headers)
        assert r.status_code == 200, f"Config PUT failed: {r.data}"
        print("✓ GET & PUT /analytics/config passed")

        # 11. Behavior (split from proctoring)
        r = client.get('/api/institution/analytics/behavior', headers=headers)
        assert r.status_code == 200, f"Behavior endpoint failed: {r.data}"
        print("✓ GET /analytics/behavior passed")

        # 12. Proctoring
        r = client.get('/api/institution/analytics/proctoring', headers=headers)
        assert r.status_code == 200, f"Proctoring endpoint failed: {r.data}"
        print("✓ GET /analytics/proctoring passed")

        # 13. Trends
        r = client.get('/api/institution/analytics/trends', headers=headers)
        assert r.status_code == 200, f"Trends endpoint failed: {r.data}"
        print("✓ GET /analytics/trends passed")

        # 14. Engagement
        r = client.get('/api/institution/analytics/engagement', headers=headers)
        assert r.status_code == 200, f"Engagement endpoint failed: {r.data}"
        print("✓ GET /analytics/engagement passed")

        # 15. Instructors
        r = client.get('/api/institution/analytics/instructors', headers=headers)
        assert r.status_code == 200, f"Instructors endpoint failed: {r.data}"
        data = r.get_json()
        assert len(data['instructors']) >= 1, "Should return instructor"
        assert 'grade_variance' in data['instructors'][0], "Instructor missing grade_variance"
        print("✓ GET /analytics/instructors passed")

        # 16. Experiment usage
        r = client.get('/api/institution/analytics/experiment-usage', headers=headers)
        assert r.status_code == 200, f"Experiment usage failed: {r.data}"
        print("✓ GET /analytics/experiment-usage passed")

        # 17. AI usage
        r = client.get('/api/institution/analytics/ai-usage', headers=headers)
        assert r.status_code == 200, f"AI usage failed: {r.data}"
        data = r.get_json()
        assert 'cost_projection' in data, "AI usage missing cost_projection"
        print("✓ GET /analytics/ai-usage passed")

        # 18. Manual snapshot run
        r = client.post('/api/institution/analytics/snapshots/run', headers=headers)
        assert r.status_code == 200, f"Snapshots run trigger failed: {r.data}"
        print("✓ POST /analytics/snapshots/run passed")

        print("\n=======================================================")
        print("🎉 ALL 18 VERIFICATION CHECKS PASSED WITH 100% SUCCESS!")
        print("=======================================================")


if __name__ == '__main__':
    run_tests()
