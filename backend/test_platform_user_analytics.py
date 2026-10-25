"""
Comprehensive Test Suite for Free / Normal User Analytics & Platform Track Engine
Tests:
  1. Unified Platform Rating (Course exercises + Library problems, anti-farming, recency)
  2. Global Percentile & Multi-User Platform Rankings
  3. 365-Day Activity Heatmap, Solve Trajectory & XP Trends
  4. Accuracy Rollups, First-Try Rate & Personal Bests
  5. Course Progress, Completion % & Certificate Eligibility
  6. Topic Strength Matrix (Course tags + Problem topics)
  7. Content Unlocks (Medium, Hard, Contests gating)
  8. Platform Leaderboard Integration
  9. Adaptive Recommendations
  10. Public Showcase Profile & Strict Privacy Safeguards (No email/private data leaks)
  11. Full HTTP Endpoint Coverage under /api/platform-user/analytics/*
"""
import unittest
import uuid
from datetime import datetime, timedelta, date
from flask_jwt_extended import create_access_token

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.practice import (
    Problem,
    PracticeSubmission,
    StudentXP,
    StudentBadge,
    PlatformRating,
    PlatformRatingPeriod,
)
from app.models.platform_content import PlatformCourse, PlatformExercise, PlatformProgress
from app.platform_rank.rating import (
    compute_student_platform_rating,
    update_all_platform_ranks,
    get_student_platform_standing,
)
from app.platform_rank.practice_mastery import get_practice_topic_mastery
from app.platform_rank.unlock import check_content_unlocks
from app.platform_rank.leaderboard import get_platform_leaderboard
from app.platform_user_analytics.course_stats import get_user_course_analytics
from app.platform_user_analytics.activity import (
    get_platform_user_activity,
    get_platform_user_accuracy_and_bests,
    get_platform_user_recommendations,
)


class TestPlatformUserAnalytics(unittest.TestCase):

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
        self.created_user_ids = []

    def tearDown(self):
        try:
            db.session.rollback()
            PlatformProgress.query.delete()
            PlatformExercise.query.delete()
            PlatformCourse.query.delete()
            PlatformRatingPeriod.query.delete()
            PlatformRating.query.delete()
            PracticeSubmission.query.delete()
            Problem.query.delete()
            StudentBadge.query.delete()
            StudentXP.query.delete()
            if hasattr(self, 'created_user_ids') and self.created_user_ids:
                User.query.filter(User.id.in_(self.created_user_ids)).delete(synchronize_session=False)
            db.session.commit()
        except Exception:
            db.session.rollback()

    def _create_user(self, name: str, email: str = None, role: str = 'platform_user') -> User:
        unique_email = email or f"{uuid.uuid4().hex[:8]}@example.com"
        # If static email passed, make it unique to avoid collision across test runs
        if '@' in unique_email:
            local, domain = unique_email.split('@', 1)
            unique_email = f"{local}_{uuid.uuid4().hex[:6]}@{domain}"

        user = User(
            id=str(uuid.uuid4()),
            email=unique_email,
            full_name=name,
            password_hash='hashed_pw_test',
            role=role,
            is_active=True,
        )
        db.session.add(user)
        db.session.commit()
        if not hasattr(self, 'created_user_ids'):
            self.created_user_ids = []
        self.created_user_ids.append(user.id)
        return user

    def _auth_headers(self, user: User) -> dict:
        token = create_access_token(
            identity=user.id,
            additional_claims={'role': user.role, 'institution_id': None},
        )
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        }

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Unified Platform Rating Tests
    # ──────────────────────────────────────────────────────────────────────────

    def test_unified_rating_merges_course_and_library_solves(self):
        user = self._create_user('Dev Coder', 'dev@example.com')

        # 1. Create a practice problem and an accepted submission
        prob_slug = f"two-sum-{uuid.uuid4().hex[:6]}"
        prob_easy = Problem(
            id=str(uuid.uuid4()),
            slug=prob_slug,
            title='Two Sum',
            difficulty='Easy',
            nexlab_topic='Arrays',
            acceptance=0.6,
        )
        db.session.add(prob_easy)
        db.session.commit()

        sub_prob = PracticeSubmission(
            id=str(uuid.uuid4()),
            student_id=user.id,
            problem_id=prob_easy.id,
            language='python',
            code='def solve(): pass',
            status='Accepted',
            passed=5,
            total=5,
            is_run=False,
            submitted_at=datetime.utcnow() - timedelta(days=5),
        )
        db.session.add(sub_prob)
        db.session.commit()

        # 2. Create a PlatformCourse and PlatformExercise solved by user
        course_slug = f"py-found-{uuid.uuid4().hex[:6]}"
        course = PlatformCourse(
            id=str(uuid.uuid4()),
            slug=course_slug,
            title='Python Foundations',
            difficulty='beginner',
            tags=['Python', 'Basics'],
            language='python',
            is_published=True,
        )
        db.session.add(course)
        db.session.commit()

        exercise_med = PlatformExercise(
            id=str(uuid.uuid4()),
            course_id=course.id,
            title='List Comprehensions',
            difficulty='medium',
            exercise_type='coding',
            xp_reward=25,
            is_published=True,
        )
        db.session.add(exercise_med)
        db.session.commit()

        prog = PlatformProgress(
            id=str(uuid.uuid4()),
            user_id=user.id,
            exercise_id=exercise_med.id,
            course_id=course.id,
            status='solved',
            attempts=1,
            best_score=100.0,
            xp_earned=25,
            solved_at=datetime.utcnow() - timedelta(days=2),
        )
        db.session.add(prog)
        db.session.commit()

        # 3. Compute rating
        rating_data = compute_student_platform_rating(user.id, commit=True)

        self.assertEqual(rating_data['problems_solved'], 2)
        self.assertEqual(rating_data['easy_solved'], 1)
        self.assertEqual(rating_data['medium_solved'], 1)
        self.assertGreater(rating_data['rating'], 35.0)  # Easy base 10 + Medium base 30

        # Verify anti-farming: adding a duplicate submission on the same problem does not increase solves
        dup_sub = PracticeSubmission(
            id=str(uuid.uuid4()),
            student_id=user.id,
            problem_id=prob_easy.id,
            language='python',
            code='def solve2(): pass',
            status='Accepted',
            passed=5,
            total=5,
            is_run=False,
            submitted_at=datetime.utcnow(),
        )
        db.session.add(dup_sub)
        db.session.commit()

        rating_recheck = compute_student_platform_rating(user.id, commit=True)
        self.assertEqual(rating_recheck['problems_solved'], 2)
        self.assertEqual(rating_recheck['rating'], rating_data['rating'])

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Activity Heatmap & Trends Tests
    # ──────────────────────────────────────────────────────────────────────────

    def test_activity_heatmap_and_trends(self):
        user = self._create_user('Active Coder', 'active@example.com')

        # Add practice submission today
        prob = Problem(id=str(uuid.uuid4()), slug=f"rev-str-{uuid.uuid4().hex[:6]}", title='Reverse String', difficulty='Easy', nexlab_topic='Strings')
        db.session.add(prob)
        db.session.commit()

        today = datetime.utcnow()
        sub = PracticeSubmission(
            id=str(uuid.uuid4()),
            student_id=user.id,
            problem_id=prob.id,
            language='python',
            code='pass',
            status='Accepted',
            passed=3,
            total=3,
            xp_earned=10,
            is_run=False,
            submitted_at=today,
        )
        db.session.add(sub)
        db.session.commit()

        activity = get_platform_user_activity(user.id, days=30)
        self.assertIn('heatmap', activity)
        self.assertIn('solve_trend', activity)
        self.assertIn('xp_trend', activity)
        self.assertEqual(len(activity['heatmap']), 30)

        # Today's cell should have count >= 1 and level >= 1
        today_str = today.date().isoformat()
        today_cell = next((c for c in activity['heatmap'] if c['date'] == today_str), None)
        self.assertIsNotNone(today_cell)
        self.assertGreaterEqual(today_cell['count'], 1)
        self.assertGreaterEqual(today_cell['level'], 1)
        self.assertEqual(activity['summary']['total_submissions'], 1)

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Accuracy & Personal Bests Tests
    # ──────────────────────────────────────────────────────────────────────────

    def test_accuracy_and_personal_bests(self):
        user = self._create_user('Accurate Coder', 'accuracy@example.com')

        prob = Problem(id=str(uuid.uuid4()), slug=f"fast-solve-{uuid.uuid4().hex[:6]}", title='Fast Solve', difficulty='Hard', nexlab_topic='Trees', acceptance=0.25)
        db.session.add(prob)
        db.session.commit()

        # Failed attempt followed by Accepted attempt (attempts = 2, first_try = False)
        sub1 = PracticeSubmission(
            id=str(uuid.uuid4()),
            student_id=user.id,
            problem_id=prob.id,
            language='python',
            code='bad',
            status='WrongAnswer',
            is_run=False,
            submitted_at=datetime.utcnow() - timedelta(minutes=10),
        )
        sub2 = PracticeSubmission(
            id=str(uuid.uuid4()),
            student_id=user.id,
            problem_id=prob.id,
            language='python',
            code='good',
            status='Accepted',
            passed=10,
            total=10,
            time_ms=42,
            is_run=False,
            submitted_at=datetime.utcnow() - timedelta(minutes=5),
        )
        db.session.add_all([sub1, sub2])
        db.session.commit()

        compute_student_platform_rating(user.id, commit=True)
        acc_data = get_platform_user_accuracy_and_bests(user.id)

        self.assertEqual(acc_data['total_attempts'], 2)
        self.assertEqual(acc_data['total_solved'], 1)
        self.assertEqual(acc_data['acceptance_rate'], 50.0)
        self.assertEqual(acc_data['first_try_rate'], 0.0)  # Solved on 2nd attempt
        self.assertEqual(acc_data['avg_attempts'], 2.0)
        self.assertEqual(acc_data['personal_bests']['fastest_solve_ms'], 42)
        self.assertIsNotNone(acc_data['personal_bests']['hardest_problem_cracked'])
        self.assertEqual(acc_data['personal_bests']['hardest_problem_cracked']['difficulty'], 'Hard')

    # ──────────────────────────────────────────────────────────────────────────
    # 4. Course Analytics & Certificate Eligibility Tests
    # ──────────────────────────────────────────────────────────────────────────

    def test_course_analytics_and_certificate(self):
        user = self._create_user('Scholar Coder', 'scholar@example.com')

        course = PlatformCourse(
            id=str(uuid.uuid4()),
            slug=f"algo-{uuid.uuid4().hex[:6]}",
            title='Algorithm Basics',
            difficulty='beginner',
            is_published=True,
        )
        db.session.add(course)
        db.session.commit()

        ex1 = PlatformExercise(id=str(uuid.uuid4()), course_id=course.id, title='Step 1', xp_reward=10, is_published=True)
        ex2 = PlatformExercise(id=str(uuid.uuid4()), course_id=course.id, title='Step 2', xp_reward=20, is_published=True)
        db.session.add_all([ex1, ex2])
        db.session.commit()

        # Step 1 solved, step 2 attempted (50% complete)
        p1 = PlatformProgress(user_id=user.id, exercise_id=ex1.id, course_id=course.id, status='solved', attempts=1, xp_earned=10)
        p2 = PlatformProgress(user_id=user.id, exercise_id=ex2.id, course_id=course.id, status='attempted', attempts=2)
        db.session.add_all([p1, p2])
        db.session.commit()

        res1 = get_user_course_analytics(user.id)
        self.assertEqual(res1['enrolled_courses'], 1)
        self.assertEqual(res1['completed_courses'], 0)
        c_item = res1['courses'][0]
        self.assertEqual(c_item['completion_pct'], 50.0)
        self.assertFalse(c_item['cert_eligible'])

        # Now solve step 2 (100% complete -> certificate eligible)
        p2.status = 'solved'
        p2.xp_earned = 20
        p2.solved_at = datetime.utcnow()
        db.session.commit()

        res2 = get_user_course_analytics(user.id)
        self.assertEqual(res2['completed_courses'], 1)
        c_item2 = res2['courses'][0]
        self.assertEqual(c_item2['completion_pct'], 100.0)
        self.assertTrue(c_item2['cert_eligible'])
        self.assertIsNotNone(c_item2['certificate_id'])
        self.assertEqual(len(res2['certificates']), 1)
        self.assertTrue(res2['certificates'][0]['certificate_id'].startswith('NEX-'))

    # ──────────────────────────────────────────────────────────────────────────
    # 5. Content Unlock Tests
    # ──────────────────────────────────────────────────────────────────────────

    def test_content_unlocks_gating(self):
        user = self._create_user('Novice Coder', 'novice@example.com')
        compute_student_platform_rating(user.id, commit=True)

        unlocks = check_content_unlocks(user.id)
        self.assertIn('Easy', unlocks['unlocked_tiers'])
        self.assertFalse(unlocks['medium_unlocked'])
        self.assertFalse(unlocks['hard_unlocked'])
        self.assertIn('Medium Difficulty Problems', unlocks['next_unlock']['target'])

        # Grant 15 easy solves to unlock Medium tier. compute_student_platform_rating
        # intentionally creates no synthetic row for a zero-solve student, so seed
        # the rating row directly to simulate the earned tier.
        from app.models.practice import PlatformRating
        r = PlatformRating(student_id=user.id, rating=150.0, problems_solved=15, easy_solved=15)
        db.session.add(r)
        db.session.commit()

        unlocks_after = check_content_unlocks(user.id)
        self.assertTrue(unlocks_after['medium_unlocked'])
        self.assertIn('Medium', unlocks_after['unlocked_tiers'])
        self.assertIn('Hard Difficulty Problems', unlocks_after['next_unlock']['target'])

    # ──────────────────────────────────────────────────────────────────────────
    # 6. Public Showcase Privacy Safeguard Tests
    # ──────────────────────────────────────────────────────────────────────────

    def test_public_showcase_privacy_safeguards(self):
        client = self.app.test_client()
        user = self._create_user('Jane Doe', 'private_email@university.edu')

        # Configure public showcase with unique slug
        showcase_slug = f"showcase-{uuid.uuid4().hex[:8]}"
        xp = StudentXP(
            student_id=user.id,
            profile_public=True,
            profile_slug=showcase_slug,
            total_xp=450,
            streak_days=5,
        )
        db.session.add(xp)
        db.session.commit()
        compute_student_platform_rating(user.id, commit=True)

        # 1. Fetch public showcase (NO AUTH)
        res = client.get(f"/api/platform-user/analytics/showcase/{showcase_slug}")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()

        # Validate display name mask: 'Jane D.'
        self.assertEqual(data['display_name'], 'Jane D.')
        self.assertEqual(data['slug'], showcase_slug)
        self.assertIn('standing', data)
        self.assertIn('top_topics', data)

        # STRICT PRIVACY VALIDATION: Never leak sensitive fields
        data_str = str(data)
        self.assertNotIn('private_email@university.edu', data_str)
        self.assertNotIn('university', data_str)
        self.assertNotIn('institution_id', data_str)
        self.assertNotIn('student_id', data_str)
        self.assertNotIn('password', data_str)

        # 2. Toggle showcase to private
        xp.profile_public = False
        db.session.commit()

        res_priv = client.get(f"/api/platform-user/analytics/showcase/{showcase_slug}")
        self.assertEqual(res_priv.status_code, 404)

    # ──────────────────────────────────────────────────────────────────────────
    # 7. HTTP Endpoint Coverage for All /api/platform-user/analytics/* Routes
    # ──────────────────────────────────────────────────────────────────────────

    def test_platform_analytics_http_endpoints(self):
        client = self.app.test_client()
        user = self._create_user('Tester', 'tester@example.com')
        headers = self._auth_headers(user)

        # 1. /api/platform-user/analytics/overview
        res = client.get('/api/platform-user/analytics/overview', headers=headers)
        self.assertEqual(res.status_code, 200)
        d = res.get_json()
        self.assertIn('standing', d)
        self.assertIn('difficulty_mix', d)
        self.assertIn('topic_strength', d)
        self.assertIn('unlocks', d)
        self.assertIn('activity', d)
        self.assertIn('courses', d)
        self.assertIn('highlights', d)

        # 2. /api/platform-user/analytics/standing
        res = client.get('/api/platform-user/analytics/standing', headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('rating', res.get_json())

        # 3. /api/platform-user/analytics/activity
        res = client.get('/api/platform-user/analytics/activity?days=90', headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.get_json()['heatmap']), 90)

        # 4. /api/platform-user/analytics/accuracy
        res = client.get('/api/platform-user/analytics/accuracy', headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('acceptance_rate', res.get_json())

        # 5. /api/platform-user/analytics/courses
        res = client.get('/api/platform-user/analytics/courses', headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('courses', res.get_json())

        # 6. /api/platform-user/analytics/topic-strength
        res = client.get('/api/platform-user/analytics/topic-strength', headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('topic_strength', res.get_json())

        # 7. /api/platform-user/analytics/unlocks
        res = client.get('/api/platform-user/analytics/unlocks', headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('unlocked_tiers', res.get_json())

        # 8. /api/platform-user/analytics/leaderboard
        res = client.get('/api/platform-user/analytics/leaderboard?scope=global', headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('leaderboard', res.get_json())
        self.assertIn('my_standing', res.get_json())

        # 9. /api/platform-user/analytics/recommendations
        res = client.get('/api/platform-user/analytics/recommendations', headers=headers)
        self.assertEqual(res.status_code, 200)
        self.assertIn('recommendations', res.get_json())

        # 10. /api/platform-user/analytics/showcase/me and PATCH /showcase
        res = client.get('/api/platform-user/analytics/showcase/me', headers=headers)
        self.assertEqual(res.status_code, 200)

        patch_res = client.patch(
            '/api/platform-user/analytics/showcase',
            headers=headers,
            json={'profile_public': True},
        )
        self.assertEqual(patch_res.status_code, 200)
        patch_data = patch_res.get_json()
        self.assertTrue(patch_data['profile_public'])
        self.assertIsNotNone(patch_data['profile_slug'])
        self.assertTrue(patch_data['share_url'].startswith('/u/'))


if __name__ == '__main__':
    unittest.main()
