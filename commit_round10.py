#!/usr/bin/env python3
"""commit_round10.py — stage the round-10 work as 10 logical commits."""
import subprocess
import sys

def run(args, check=True):
    r = subprocess.run(args, cwd="/home/user", capture_output=True, text=True)
    if check and r.returncode != 0:
        print("FAILED:", " ".join(args))
        print(r.stdout[-2000:], r.stderr[-2000:])
        sys.exit(1)
    return r

def exists(path):
    import os
    return os.path.exists("/home/user/" + path)

COMMITS = [
    (
        "fix(analytics): null-safe metric layer with a single attendance credit model",
        """An unmeasured metric is now reported as "unknown" instead of being
back-filled with 0.0 / 50.0 / 70.0, and every surface renormalises over the
factors that actually have data.

- add app/analytics/composite.py: metric_value() / weighted_composite()
- add ATT_CREDIT_MAP in completion.py and use it everywhere attendance is
  scored (present 1.0, late 0.8, partial 0.6, inactive 0.5, absent 0.0)
- risk.py: weights renormalise over measured factors, unmeasured students are
  counted separately and never banded
- benchmark.py: compute_percentile needs a cohort of 5, compute_z_score returns
  None when the cohort has no dispersion (a lone section is not 0.00 sigma)
- ranking.py: rank_positions() helper, 90-day window, percentile nullable
- snapshots.py: persist NULL for unmeasured averages so later trend reads do
  not mistake a stored prior for real history
- add freshness.py (response cache + write hooks) and integrity_score.py
- ml/ranking.py becomes a thin shim over the analytics ranking engine""",
        [
            "backend/app/analytics/advanced.py",
            "backend/app/analytics/benchmark.py",
            "backend/app/analytics/completion.py",
            "backend/app/analytics/composite.py",
            "backend/app/analytics/freshness.py",
            "backend/app/analytics/funnel.py",
            "backend/app/analytics/integrity.py",
            "backend/app/analytics/integrity_score.py",
            "backend/app/analytics/metrics.py",
            "backend/app/analytics/ranking.py",
            "backend/app/analytics/risk.py",
            "backend/app/analytics/scope.py",
            "backend/app/analytics/snapshots.py",
            "backend/app/ml/ranking.py",
        ],
    ),
    (
        "fix(student-analytics): derive the academic dashboard from the database only",
        """- academic rank starts unranked instead of a hardcoded #1 / "Top 100%"
- 12-week trend leaves ungraded weeks empty instead of repeating the current
  average, subject sparklines stop padding themselves with the first grade
- subject "trend" is the latest grade against earlier ones, not a copy of the
  subject average
- overall score / delta are None when nothing has been graded yet
- student dashboard uses the same grade scope rule as analytics
  (Grade.experiment_id IS NOT NULL) so both views agree
- StudentRanking.to_dict() tolerates nullable component scores""",
        [
            "backend/app/student_analytics/academic_dashboard_builder.py",
            "backend/app/student_analytics/overview_builder.py",
            "backend/app/student_analytics/routes.py",
            "backend/app/student/routes.py",
            "backend/app/models/knowledge.py",
        ],
    ),
    (
        "fix(instructor-analytics): real risk bands and credit-weighted attendance",
        """- the risk band for a student with no grade no longer counts as 0%
  (which banded healthy students as high risk); the on-track band matched the
  literal "low" while every counter looked for "ok", so On-Track was always 0
- "needs attention" no longer falls back to the top-N students by score, which
  was listing the healthiest students as needing attention
- attendance uses the shared credit map instead of counting a late arrival as
  fully present
- mastery / grade / attendance KPI boxes return null + is_available instead of
  a 0 floor, and the static "0%" deltas are gone
- risk breakdown components are nullable (an unmeasured factor had been drawn
  as a full-width bar)
- per-student trend points are real grades, empty when there is no history""",
        ["backend/app/instructor/analytics.py"],
    ),
    (
        "fix(institution-analytics): remove fabricated deltas and fix grade attribution",
        """- week-over-week deltas were forced to 0% by defaulting the previous period
  to the current one; they are null unless a real previous window exists
- zero-student sections no longer report avg_grade 0.0 / focus 50.0
- benchmark z-scores, percentiles and the distribution donut report
  "not benchmarkable" for a cohort too small to standardise, instead of 0.00
  sigma / a hardcoded 27-section split
- instructor performance is attributed through experiment -> subject ->
  instructor, so grades without a session_id finally count (0.0 -> 82.1)
- instructor engagement is FocusScore telemetry only (it had been invented as
  attendance x 0.9 when the ML was off)
- 7-point KPI sparklines are real time buckets, not the current value repeated
- platform analytics counts sessions by COALESCE(started_at, scheduled_at) so
  scheduled-but-unlaunched labs are visible, and peak-usage no longer 500s on a
  NULL started_at
- bootstrap_superadmin.py: idempotent platform-admin bootstrap""",
        [
            "backend/app/institution/routes.py",
            "backend/app/institution/extended.py",
            "backend/app/admin/platform.py",
            "backend/app/bootstrap_superadmin.py",
        ],
    ),
    (
        "feat(exams): rubric grading with explicit assessed ticks and grade scoping",
        """- grading accepts a per-component rubric plus an "assessed" map so an
  unticked component is excluded from the mark instead of counting as zero
- grade writes record experiment_id, which is what makes every downstream
  average attributable
- exam authoring, publishing and submission flows updated to match the new
  grading contract
- model changes for exams, experiments, free-practice and grades""",
        [
            "backend/app/instructor/exams.py",
            "backend/app/instructor/routes.py",
            "backend/app/instructor/content.py",
            "backend/app/student/exams.py",
            "backend/app/services/grading_service.py",
            "backend/app/models/exam.py",
            "backend/app/models/experiment.py",
            "backend/app/models/free.py",
            "backend/app/models/grading.py",
            "backend/app/models/__init__.py",
        ],
    ),
    (
        "feat(live-session): proctoring pipeline, screen share consent and AI harness",
        """- live conductor: 30-second screenshot frames keep flowing alongside the
  selected-student screen view, no mid-session permission prompt
- socket events for join/leave, focus telemetry and proctor events
- AI harness and role tools updated for scoped retrieval
- app factory wires the analytics freshness hooks""",
        [
            "backend/app/instructor/conductor.py",
            "backend/app/sockets/events.py",
            "backend/app/ai/agent.py",
            "backend/app/ai/harness.py",
            "backend/app/ai/role_tools.py",
            "backend/app/ai/routes.py",
            "backend/app/models/proctor_event.py",
            "backend/app/__init__.py",
        ],
    ),
    (
        "feat(analytics-ui): shared Sparkline, DeltaPill and MetricValue primitives",
        """Three small components so that "no data" looks the same everywhere:

- Sparkline needs at least two finite points, otherwise it renders its
  emptyLabel; a single null used to produce an invalid SVG path
  ("M 0,null C ...") and crash the renderer
- DeltaPill renders nothing unless it has a numeric delta
- MetricValue prints an em dash for null and keeps its unit/suffix

All analytics charts were moved onto them: KpiCard lost its hardcoded
10-point fallback wave, the benchmark donut lost its fabricated 27-section
split, and every custom path builder now filters nulls before joining.""",
        [
            "frontend/components/analytics/Sparkline.tsx",
            "frontend/components/analytics/DeltaPill.tsx",
            "frontend/components/analytics/MetricValue.tsx",
            "frontend/components/analytics/KpiCard.tsx",
            "frontend/components/analytics/AIUsageTelemetryTab.tsx",
            "frontend/components/analytics/AcademicPerformanceChart.tsx",
            "frontend/components/analytics/AttendanceMatrixTab.tsx",
            "frontend/components/analytics/BenchmarkComparisonCards.tsx",
            "frontend/components/analytics/CurriculumRollupTable.tsx",
            "frontend/components/analytics/EngagementSignalsTab.tsx",
            "frontend/components/analytics/GradesMarksTab.tsx",
            "frontend/components/analytics/InstructorsTab.tsx",
            "frontend/components/analytics/IntegrityViolationsTab.tsx",
            "frontend/components/analytics/SectionDistributionDonut.tsx",
            "frontend/components/analytics/StudentFunnelTab.tsx",
        ],
    ),
    (
        "fix(instructor-ui): show em dashes instead of invented values",
        """- KPI cards, risk breakdown and roster columns render "-" for unmeasured
  metrics rather than 0 / 0% / a full-width bar
- delta badges only appear when a real comparison exists (the "+ 2%" fallback
  and the static "0%" pills are gone)
- analytics tabs tolerate null sparkline series and single-point trends
- instructor pages (experiments, grading, sessions, content, exams, settings)
  and the shell updated alongside the API changes
- StudentScreenViewer: clicking a student shows that student's live screen""",
        [
            "frontend/app/instructor/analytics/page.tsx",
            "frontend/app/instructor/analytics/OverviewTab.tsx",
            "frontend/app/instructor/analytics/StudentsTab.tsx",
            "frontend/app/instructor/analytics/ExperimentsTab.tsx",
            "frontend/app/instructor/analytics/TrendsTab.tsx",
            "frontend/app/instructor/analytics/MasteryTab.tsx",
            "frontend/app/instructor/analytics/EngagementTab.tsx",
            "frontend/app/instructor/analytics/IntegrityTab.tsx",
            "frontend/app/instructor/analytics/RankingsTab.tsx",
            "frontend/app/instructor/analytics/instructor-analytics.module.css",
            "frontend/app/instructor/experiments/page.tsx",
            "frontend/app/instructor/grading/page.tsx",
            "frontend/app/instructor/grading/[submissionId]/page.tsx",
            "frontend/app/instructor/sessions/page.tsx",
            "frontend/app/instructor/sessions/[sessionId]/live/page.tsx",
            "frontend/app/instructor/settings/page.tsx",
            "frontend/app/instructor/exams/[examId]/page.tsx",
            "frontend/app/instructor/exams/[examId]/edit/page.tsx",
            "frontend/app/instructor/content/datasets/page.tsx",
            "frontend/app/instructor/content/pdfs/page.tsx",
            "frontend/app/instructor/content/quizzes/page.tsx",
            "frontend/app/instructor/content/videos/page.tsx",
            "frontend/components/instructor/StudentScreenViewer.tsx",
            "frontend/components/layout/InstructorShell.tsx",
        ],
    ),
    (
        "fix(student-ui): real standings, rankings and institution/admin pages",
        """- student analytics + rankings: percentile only with a cohort of 5, "-"
  for missing factors, no invented Top-N% or "Top 100%"
- two-track hero stops defaulting rank to #1 and percentile to 95
- knowledge map and platform tab render empty states instead of preset bars
- institution analytics pages consume the nullable KPI payloads (z-score,
  instructors, benchmark) without crashing on null.toFixed()
- admin analytics: single-day session charts no longer print two identical
  date labels
- services / hooks / lib updated for the new API contracts""",
        [
            "frontend/app/student/rankings/page.tsx",
            "frontend/app/student/live-lab/[sessionId]/page.tsx",
            "frontend/app/student/subjects/page.tsx",
            "frontend/app/student/subjects/[subjectId]/page.tsx",
            "frontend/app/student/exams/[examId]/take/page.tsx",
            "frontend/app/institution/analytics/page.tsx",
            "frontend/app/institution/academic/page.tsx",
            "frontend/app/institution/dashboard/page.tsx",
            "frontend/app/institution/dashboard/DashboardCharts.tsx",
            "frontend/app/institution/sessions/page.tsx",
            "frontend/app/institution/users/page.tsx",
            "frontend/app/admin/analytics/page.tsx",
            "frontend/app/admin/academic/academic-years/page.tsx",
            "frontend/app/admin/academic/batches/page.tsx",
            "frontend/app/admin/academic/departments/page.tsx",
            "frontend/app/admin/academic/sections/page.tsx",
            "frontend/app/admin/academic/subjects/page.tsx",
            "frontend/app/admin/monitoring/server-health/page.tsx",
            "frontend/app/admin/users/admins/page.tsx",
            "frontend/app/admin/users/instructors/page.tsx",
            "frontend/app/admin/users/students/page.tsx",
            "frontend/app/(auth)/login/page.tsx",
            "frontend/app/(auth)/register/page.tsx",
            "frontend/app/practice/profile/page.tsx",
            "frontend/components/student-analytics/AcademicTab.tsx",
            "frontend/components/student-analytics/PlatformTab.tsx",
            "frontend/components/student-analytics/TwoTrackHero.tsx",
            "frontend/components/student-analytics/MetricSummaryCards.tsx",
            "frontend/components/student-analytics/KnowledgeMapTab.tsx",
            "frontend/components/student-analytics/GentleStandingCard.tsx",
            "frontend/components/courses/CourseDetailPage.tsx",
            "frontend/services/analytics.service.ts",
            "frontend/services/student.service.ts",
            "frontend/services/institution.service.ts",
            "frontend/services/exam.service.ts",
            "frontend/services/submission.service.ts",
            "frontend/services/experience.service.ts",
            "frontend/hooks/use-socket.ts",
            "frontend/lib/socket.ts",
            "frontend/lib/countdown.ts",
            "frontend/next.config.ts",
        ],
    ),
    (
        "chore: ignore local artefacts and add setup / activity tooling",
        """- gitignore ui-checks/, uploads/, .config/ and scratch files so audit
  screenshots and runtime uploads never reach the repo
- setup.sh: native local bootstrap (postgres, python deps, schema, node deps)
- up.sh / start-all.sh: bring up postgres -> flask -> next in one process tree
- walkthrough.py: create an institution end-to-end through the real HTTP API
- make_activity.py: generate genuine sessions, attendance and rubric grades via
  the API so analytics can be verified against data that actually exists
- sweep_endpoints.py: 4-role analytics endpoint sweep
- requirements.txt: pin psycopg2 >= 2.9.10 for cp313""",
        [
            "setup.sh",
            "up.sh",
            "start-all.sh",
            "walkthrough.py",
            "make_activity.py",
            "sweep_endpoints.py",
            "backend/requirements.txt",
            ".gitignore",
        ],
    ),
]


def main():
    for i, (subject, body, paths) in enumerate(COMMITS, 1):
        present = [p for p in paths if exists(p)]
        missing = [p for p in paths if not exists(p)]
        if missing:
            print(f"  [warn] commit {i}: missing paths {missing}")
        r = run(["git", "add", "--"] + present)
        staged = run(["git", "diff", "--cached", "--name-only"]).stdout.strip().splitlines()
        if not staged:
            print(f"[{i}/10] nothing staged, skipping: {subject}")
            continue
        run(["git", "commit", "-q", "-m", subject, "-m", body])
        out = run(["git", "log", "-1", "--pretty=%h %s"]).stdout.strip()
        print(f"[{i}/10] {len(staged):3d} files  {out}")


if __name__ == "__main__":
    main()
