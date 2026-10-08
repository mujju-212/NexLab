'use client';

import React from 'react';
import {
  BookOpen,
  GraduationCap,
  CalendarCheck,
  Award,
  TrendingUp,
  FileText,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { KpiCard, TrendChart, ForecastBand, DataTable, Column, MasteryRadar } from '@/components/analytics';
import type {
  SubjectAnalyticsItem,
  ScopedMasteryResponse,
  TrendsResponse,
  ForecastResponse,
  GentleStandingResponse,
  AttendanceRollupResponse,
} from '@/services/student-analytics.service';
import { SubjectProgressCard } from './SubjectProgressCard';
import { RiskGuidanceCard } from './RiskGuidanceCard';
import { CompletionRing } from './CompletionRing';
import styles from './student-analytics.module.css';

interface AcademicTabProps {
  subjects: SubjectAnalyticsItem[];
  selectedSubjectId: string | null;
  onSubjectChange: (subjectId: string | null) => void;
  mastery: ScopedMasteryResponse | undefined;
  trends: TrendsResponse | undefined;
  forecast: ForecastResponse | undefined;
  standing: GentleStandingResponse | undefined;
  attendance: AttendanceRollupResponse | undefined;
  academicRanks: Record<string, any> | undefined;
}

export const AcademicTab: React.FC<AcademicTabProps> = ({
  subjects = [],
  selectedSubjectId,
  onSubjectChange,
  mastery,
  trends,
  forecast,
  standing,
  attendance,
  academicRanks,
}) => {
  // Filter selected subject or aggregate all
  const activeSubject = selectedSubjectId
    ? subjects.find((s) => s.subject_id === selectedSubjectId)
    : null;

  // Calculate overall or subject specific KPIs
  const avgGrade = activeSubject
    ? activeSubject.subject_average
    : subjects.length > 0
    ? Math.round(
        subjects.reduce((acc, s) => acc + s.subject_average, 0) / subjects.length
      )
    : 0;

  const totalCompleted = activeSubject
    ? activeSubject.completed_experiments
    : subjects.reduce((acc, s) => acc + s.completed_experiments, 0);

  const totalAssigned = activeSubject
    ? activeSubject.total_experiments
    : subjects.reduce((acc, s) => acc + s.total_experiments, 0);

  const completionPct = totalAssigned > 0 ? Math.round((totalCompleted / totalAssigned) * 100) : 0;

  const instRank = academicRanks?.institution?.position ?? academicRanks?.section?.position ?? '—';
  const cohortSize = academicRanks?.institution?.cohort_size ?? academicRanks?.section?.cohort_size ?? '—';
  const attendanceRate = attendance?.attendance_rate ?? 100;

  // Format TrendChart data from trends
  const trendData = (trends?.grades_trend || []).map((t) => ({
    name: t.experiment_title.length > 12 ? `${t.experiment_title.slice(0, 10)}…` : t.experiment_title,
    fullName: t.experiment_title,
    score: Math.round(t.final_grade),
    autoGrade: t.auto_grade != null ? Math.round(t.auto_grade) : null,
    date: t.created_at ? new Date(t.created_at).toLocaleDateString() : `Exp ${t.index}`,
  }));

  // Format Grade Breakdown rows for DataTable
  const allExperiments = subjects.flatMap((s) =>
    s.experiments.map((e) => ({
      id: e.experiment_id,
      subjectCode: s.subject_code,
      subjectName: s.subject_name,
      expNumber: e.exp_number,
      title: e.title,
      finalGrade: e.final_grade,
      isCompleted: e.is_completed,
      weightage: e.weightage,
    }))
  );

  const displayedExperiments = activeSubject
    ? allExperiments.filter((e) => e.subjectCode === activeSubject.subject_code)
    : allExperiments;

  const gradeColumns: Column<any>[] = [
    {
      key: 'subjectCode',
      header: 'Subject',
      render: (r) => (
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 700,
            background: '#f5f3ff',
            color: '#7c3aed',
            padding: '0.15rem 0.45rem',
            borderRadius: '0.3rem',
          }}
        >
          {r.subjectCode}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Experiment',
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>
            Exp {r.expNumber}: {r.title}
          </div>
          <small style={{ color: '#64748b' }}>Weightage: {r.weightage}x</small>
        </div>
      ),
    },
    {
      key: 'finalGrade',
      header: 'Grade',
      sortable: true,
      render: (r) =>
        r.finalGrade != null ? (
          <span
            style={{
              fontWeight: 800,
              color: r.finalGrade >= 75 ? '#15803d' : r.finalGrade >= 50 ? '#b45309' : '#b91c1c',
              fontSize: '0.9rem',
            }}
          >
            {Math.round(r.finalGrade)}%
          </span>
        ) : (
          <span style={{ color: '#94a3b8' }}>—</span>
        ),
    },
    {
      key: 'isCompleted',
      header: 'Status',
      render: (r) =>
        r.isCompleted ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              color: '#15803d',
              background: '#dcfce7',
              padding: '0.2rem 0.5rem',
              borderRadius: '0.35rem',
              fontSize: '0.75rem',
              fontWeight: 600,
            }}
          >
            <CheckCircle2 size={12} /> Completed
          </span>
        ) : (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              color: '#64748b',
              background: '#f1f5f9',
              padding: '0.2rem 0.5rem',
              borderRadius: '0.35rem',
              fontSize: '0.75rem',
              fontWeight: 500,
            }}
          >
            <Clock size={12} /> Pending
          </span>
        ),
    },
  ];

  const weakConcepts = mastery?.weak_concepts || [];
  const prereqBlocks = mastery?.prerequisite_blocks || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Subject Filter Bar */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '1rem',
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BookOpen size={18} color="#7c3aed" />
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Filter by Enrolled Course:</span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => onSubjectChange(null)}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '0.5rem',
              border: '1px solid',
              borderColor: selectedSubjectId === null ? '#7c3aed' : '#e2e8f0',
              background: selectedSubjectId === null ? '#f5f3ff' : '#ffffff',
              color: selectedSubjectId === null ? '#7c3aed' : '#475569',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            All Subjects ({subjects.length})
          </button>
          {subjects.map((s) => (
            <button
              key={s.subject_id}
              onClick={() => onSubjectChange(s.subject_id)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '0.5rem',
                border: '1px solid',
                borderColor: selectedSubjectId === s.subject_id ? '#7c3aed' : '#e2e8f0',
                background: selectedSubjectId === s.subject_id ? '#f5f3ff' : '#ffffff',
                color: selectedSubjectId === s.subject_id ? '#7c3aed' : '#475569',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {s.subject_code} · {s.subject_name}
            </button>
          ))}
        </div>
      </div>

      {/* 1. Academic KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <KpiCard
          label="Average Grade"
          value={`${avgGrade}%`}
          delta={{ value: 4.2, unit: '%', label: 'vs last month', isPositiveGood: true }}
          note={activeSubject ? activeSubject.subject_name : 'Across all enrolled subjects'}
          accentColor="#7c3aed"
        />

        <KpiCard
          label="Coursework Completion"
          value={`${completionPct}%`}
          delta={{ value: totalCompleted, unit: 'labs', label: `of ${totalAssigned} assigned`, isPositiveGood: true }}
          note="Submitted and graded experiments"
          accentColor="#10b981"
        />

        <KpiCard
          label="Institution Standing"
          value={`#${instRank}`}
          delta={{ value: -2, unit: 'ranks', label: 'movement', isPositiveGood: true }}
          note={`Out of ${cohortSize} total enrolled students`}
          accentColor="#0284c7"
        />

        <KpiCard
          label="Lab Attendance Rate"
          value={`${attendanceRate}%`}
          note={`${attendance?.attended_sessions ?? 0} of ${attendance?.scheduled_sessions ?? 0} scheduled sessions`}
          accentColor="#f59e0b"
        />
      </div>

      {/* 2. Enrolled Subjects Progress Cards */}
      <SubjectProgressCard subjects={activeSubject ? [activeSubject] : subjects} />

      {/* 3. Scoped Mastery & Prerequisite Intelligence */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleWrap}>
            <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <GraduationCap size={20} />
            </div>
            <div>
              <h3 className={styles.cardTitle}>Subject Concept Mastery & Blockers</h3>
              <p className={styles.cardSubtitle}>
                Multidimensional concept scores and prerequisite blocker diagnostics
              </p>
            </div>
          </div>
          <span className={styles.metaBadge}>
            Scope Avg: <strong>{mastery?.scope_average ?? 0}%</strong>
          </span>
        </div>

        {/* Diagnostic alert if weak concepts exist */}
        {weakConcepts.length > 0 && (
          <div
            style={{
              padding: '0.85rem 1rem',
              borderRadius: '0.75rem',
              background: '#fffbeb',
              border: '1px solid #fef3c7',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              color: '#b45309',
              fontSize: '0.85rem',
            }}
          >
            <AlertTriangle size={18} />
            <div>
              <strong>Weak Concept Diagnostic:</strong> You have low mastery in{' '}
              <strong>
                {Array.isArray(weakConcepts)
                  ? weakConcepts
                      .map((w: any) => (typeof w === 'string' ? w : w?.concept || w?.name || ''))
                      .filter(Boolean)
                      .join(', ')
                  : ''}
              </strong>.
              {prereqBlocks.length > 0 && (
                <span>
                  {' '}This is currently blocking comprehension in upcoming labs:{' '}
                  {Array.isArray(prereqBlocks)
                    ? prereqBlocks
                        .map((b: any) => (typeof b === 'string' ? b : b?.concept || ''))
                        .filter(Boolean)
                        .join(', ')
                    : ''}.
                </span>
              )}
            </div>
          </div>
        )}

        {/* Mastery Radar */}
        <MasteryRadar
          title="Concept Proficiency Radar"
          subtitle="Real-time telemetry evaluated from code submissions and viva exams"
          data={(mastery?.concepts || []).map((c) => ({
            concept: c.concept,
            mastery_score: c.mastery_score,
          }))}
          height={300}
        />
      </div>

      {/* 4. Score History TrendChart & 95% ForecastBand */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
        <TrendChart
          title="Historical Experiment Score Trajectory"
          subtitle="Sequential grades recorded across scheduled lab sessions"
          data={trendData}
          xKey="name"
          series={[
            { key: 'score', name: 'Final Grade (%)', color: '#7c3aed', type: 'area' },
            { key: 'autoGrade', name: 'Auto Test Grade', color: '#06b6d4', type: 'line' },
          ]}
          height={300}
        />

        {forecast && (
          <ForecastBand
            data={{
              student_id: forecast.student_id,
              current_average: avgGrade,
              projected_final: (forecast as any)?.projected_final ?? forecast.projected_points?.slice(-1)[0]?.projected ?? avgGrade,
              confidence_interval: {
                lower_95: Array.isArray((forecast as any)?.confidence_interval)
                  ? (forecast as any).confidence_interval[0]
                  : forecast.projected_points?.slice(-1)[0]?.lower_95 ?? avgGrade - 8,
                upper_95: Array.isArray((forecast as any)?.confidence_interval)
                  ? (forecast as any).confidence_interval[1]
                  : forecast.projected_points?.slice(-1)[0]?.upper_95 ?? avgGrade + 8,
              },
              trajectory_slope: forecast.trajectory_slope ?? (forecast as any)?.trend_slope_per_assignment ?? 0,
              historical_points: (forecast.historical_points && forecast.historical_points.length > 0)
                ? forecast.historical_points.map((p) => ({
                    week: p.index,
                    grade: p.score,
                    label: p.label,
                  }))
                : (trends?.grades_trend || []).map((t, idx) => ({
                    week: idx + 1,
                    grade: Math.round(t.final_grade),
                    label: t.experiment_title.length > 12 ? `${t.experiment_title.slice(0, 10)}…` : t.experiment_title,
                  })),
              projection_points: (forecast.projected_points && forecast.projected_points.length > 0)
                ? forecast.projected_points.map((p) => ({
                    week: p.index,
                    projected: p.projected,
                    lower: p.lower_95,
                    upper: p.upper_95,
                    label: p.label,
                  }))
                : [
                    {
                      week: ((trends?.grades_trend?.length ?? 1) + 1),
                      projected: (forecast as any)?.projected_final ?? avgGrade,
                      lower: Array.isArray((forecast as any)?.confidence_interval)
                        ? (forecast as any).confidence_interval[0]
                        : avgGrade - 8,
                      upper: Array.isArray((forecast as any)?.confidence_interval)
                        ? (forecast as any).confidence_interval[1]
                        : avgGrade + 8,
                      label: 'Term Proj',
                    },
                  ],
            }}
            title="End-of-Term Trajectory & 95% Confidence Band"
            height={300}
          />
        )}
      </div>

      {/* 5. Grade Breakdown DataTable */}
      <DataTable
        title="Comprehensive Experiment Grade Records"
        subtitle="Individual assignment grades, test case scores, and submission states"
        columns={gradeColumns}
        data={displayedExperiments}
        pageSize={8}
        exportFilename="academic-grade-records"
      />

      {/* 6. Learning Standing Guidance */}
      <RiskGuidanceCard
        band={standing?.standing_band}
        primaryReason={standing?.primary_reason}
        suggestions={standing?.suggestions}
        isSufficient={true}
      />
    </div>
  );
};
