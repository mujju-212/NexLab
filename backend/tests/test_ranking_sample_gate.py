import unittest

from app.analytics.ranking import gate_cohort_rank_samples


class CohortRankAttendanceGateTests(unittest.TestCase):
    def test_thin_member_excludes_attendance_for_entire_cohort(self):
        metrics = {
            "student_a": {"attendance_rate": {"value": 100, "sample_size": 3}},
            "student_b": {"attendance_rate": {"value": 0, "sample_size": 1}},
        }

        retained = gate_cohort_rank_samples(metrics, ["student_a", "student_b"])

        self.assertFalse(retained)
        for row in metrics.values():
            self.assertIsNone(row["attendance_rate"]["value"])
            self.assertEqual(row["attendance_rate"]["rank_excluded"], "cohort_sample_too_thin")

    def test_attendance_retained_when_every_member_has_three_sessions(self):
        metrics = {
            "student_a": {"attendance_rate": {"value": 100, "sample_size": 3}},
            "student_b": {"attendance_rate": {"value": 80, "sample_size": 4}},
        }

        retained = gate_cohort_rank_samples(metrics, ["student_a", "student_b"])

        self.assertTrue(retained)
        self.assertEqual(metrics["student_a"]["attendance_rate"]["value"], 100)
        self.assertEqual(metrics["student_b"]["attendance_rate"]["value"], 80)

    def test_missing_member_metric_is_treated_as_thin_sample(self):
        metrics = {"student_a": {"attendance_rate": {"value": 90, "sample_size": 3}}}

        retained = gate_cohort_rank_samples(metrics, ["student_a", "student_b"])

        self.assertFalse(retained)
        self.assertIsNone(metrics["student_a"]["attendance_rate"]["value"])


if __name__ == "__main__":
    unittest.main()
