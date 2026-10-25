'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService } from '@/services/institution.service';
import {
  KpiCard,
  KpiCardGrid,
  TrendChart,
  MasteryRadar,
  RiskGauge,
  RiskBreakdownBar,
  DataTable,
  LoadingSkeleton,
  ErrorState,
} from '@/components/analytics';
import {
  ArrowLeft,
  GraduationCap,
  Award,
  Globe,
  CheckCircle2,
  ShieldAlert,
  Calendar,
  Layers,
  Clock,
  Sparkles,
} from 'lucide-react';
import { scoreColor, riskColor, riskBandLabel, fmt, pct } from '@/lib/analytics-utils';
import styles from '@/components/analytics/analytics.module.css';

export default function Student360Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['institution', 'analytics', 'student-360', id],
    queryFn: () => institutionService.getStudent360(id),
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <InstitutionShell activePage="Analytics" title="Student 360" subtitle="Loading student dossier...">
        <div style={{ padding: '24px 0' }}>
          <LoadingSkeleton cards={4} height={400} />
        </div>
      </InstitutionShell>
    );
  }

  if (isError || !data) {
    return (
      <InstitutionShell activePage="Analytics" title="Student 360" subtitle="Student profile error">
        <div style={{ padding: '24px 0' }}>
          <ErrorState
            title="Could not load student 360 profile"
            message="The requested student profile could not be retrieved from the institution analytics engine."
            onRetry={() => refetch()}
          />
        </div>
      </InstitutionShell>
    );
  }

  const { student, kpis, risk, radar, grades, attendance, integrity, trends } = data;
  const band = riskBandLabel(risk.risk_band);

  return (
    <InstitutionShell
      activePage="Analytics"
      title={`Student 360 · ${student.full_name}`}
      subtitle={`${student.roll_number || 'USN'} · ${student.department_name} · Section ${student.section_name}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
        {/* Back navigation */}
        <div>
          <button
            type="button"
            onClick={() => router.back()}
            className={`${styles.actionBtn} ${styles.outlineBtn}`}
            style={{ marginBottom: 4 }}
          >
            <ArrowLeft size={14} />
            <span>Go back</span>
          </button>
        </div>

        {/* Sticky Profile Header Banner */}
        <div className={styles.card} style={{ background: 'linear-gradient(135deg, #ffffff 0%, #faf5ff 100%)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '1.4rem',
                  boxShadow: '0 4px 14px rgba(124,58,237,0.25)',
                }}
              >
                {student.full_name.charAt(0)}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                    {student.full_name}
                  </h2>
                  <span
                    style={{
                      background: band.bg,
                      color: band.color,
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 9999,
                    }}
                  >
                    {band.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: 4 }}>
                  {student.email} · Roll: <strong>{student.roll_number}</strong> · Dept: <strong>{student.department_name}</strong> · Section: <strong>{student.section_name}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.725rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                  Primary Risk Factor
                </div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: band.color }}>
                  {risk.primary_reason}
                </div>
              </div>
              <div
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: '50%',
                  background: band.bg,
                  border: `2px solid ${band.color}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                <span style={{ fontSize: '1.05rem', fontWeight: 800, color: band.color }}>
                  {Math.round(risk.risk_score)}
                </span>
                <span style={{ fontSize: '0.6rem', color: '#6b7280', fontWeight: 600 }}>RISK</span>
              </div>
            </div>
          </div>
        </div>

        {/* Key Performance Indicators Grid */}
        <KpiCardGrid>
          <KpiCard
            label="Current Mastery"
            value={`${fmt(kpis.current_mastery)}%`}
            note="Weighted concept decay score"
            icon={<GraduationCap size={18} />}
            accentColor="#7c3aed"
          />
          <KpiCard
            label="Campus Rank"
            value={`#${kpis.institution_rank}`}
            note={`Out of ${kpis.total_institution_students} students`}
            icon={<Award size={18} />}
            accentColor="#06b6d4"
          />
          <KpiCard
            label="Platform Rank"
            value={`#${kpis.platform_rank}`}
            note={`Across ${kpis.total_platform_students} peer learners`}
            icon={<Globe size={18} />}
            accentColor="#3b82f6"
          />
          <KpiCard
            label="Lab Completion"
            value={`${fmt(kpis.completion_pct)}%`}
            note={`${kpis.completed_count} of ${kpis.total_assigned} labs passed`}
            icon={<CheckCircle2 size={18} />}
            accentColor="#10b981"
          />
        </KpiCardGrid>

        {/* Mastery Radar & Risk Driver Breakdown */}
        <div className={styles.twoColGrid}>
          <MasteryRadar
            title="Concept Mastery Map"
            subtitle="Real-time knowledge proficiencies tracked across curriculum concepts"
            data={radar}
          />
          <RiskBreakdownBar
            title="Composite Risk Breakdown"
            subtitle="Weighted component penalties driving the student's risk profile"
            components={risk.risk_contributions}
          />
        </div>

        {/* Historical Trends: Grade + Mastery + Focus over time */}
        {trends && trends.length > 0 && (
          <TrendChart
            title="Performance Trajectory"
            subtitle="Weekly evolution of grade average, concept mastery, and focus telemetry"
            data={trends}
            xKey="date"
            series={[
              { key: 'grade_avg', name: 'Grade Avg', color: '#7c3aed' },
              { key: 'mastery_avg', name: 'Mastery Avg', color: '#10b981' },
              { key: 'focus_avg', name: 'Focus ML Avg', color: '#06b6d4' },
              { key: 'risk_score', name: 'Risk Score', color: '#ef4444' },
            ]}
          />
        )}

        {/* Per-Experiment and Exam Grades Table */}
        <DataTable
          title="Curriculum Assessments & Exam Performance"
          subtitle="All graded experiments, assignments, and exams with component breakdowns"
          data={grades}
          exportFilename={`student-${student.roll_number || student.id}-grades`}
          columns={[
            {
              key: 'title',
              header: 'Assessment Title',
              render: r => (
                <div>
                  <div style={{ fontWeight: 700, color: '#111827' }}>{r.title}</div>
                  <div style={{ fontSize: '0.725rem', color: '#6b7280', textTransform: 'capitalize' }}>{r.type}</div>
                </div>
              ),
            },
            {
              key: 'final_grade',
              header: 'Score',
              render: r => (
                <span style={{ fontWeight: 700, color: scoreColor(r.final_grade) }}>
                  {r.final_grade} / {r.max_marks}
                </span>
              ),
            },
            {
              key: 'auto_grade',
              header: 'Auto Test',
              render: r => r.auto_grade != null ? `${r.auto_grade} pts` : '—',
            },
            {
              key: 'manual_grade',
              header: 'Manual',
              render: r => r.manual_grade != null ? `${r.manual_grade} pts` : '—',
            },
            {
              key: 'viva_score',
              header: 'AI Viva',
              render: r => r.viva_score != null ? `${r.viva_score} pts` : '—',
            },
            {
              key: 'hint_penalty',
              header: 'Hint Penalty',
              render: r => r.hint_penalty ? <span style={{ color: '#ef4444' }}>-{r.hint_penalty}</span> : '0',
            },
            {
              key: 'is_passing',
              header: 'Status',
              render: r => (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: 9999,
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    background: r.is_passing ? '#ecfdf5' : '#fef2f2',
                    color: r.is_passing ? '#10b981' : '#ef4444',
                  }}
                >
                  {r.is_passing ? 'PASSED' : 'NEEDS RETAKE'}
                </span>
              ),
            },
          ]}
        />

        {/* Bottom Split: Integrity Timeline & Attendance Strip */}
        <div className={styles.twoColGrid}>
          {/* Integrity Timeline */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <ShieldAlert size={18} className={styles.cardTitleIcon} />
                <div>
                  <h3 className={styles.cardTitle}>Proctoring &amp; Integrity Timeline</h3>
                  <p className={styles.cardSubtitle}>
                    {integrity.total_violations} recorded event violation(s)
                  </p>
                </div>
              </div>
            </div>

            {integrity.events.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#10b981', fontSize: '0.85rem', fontWeight: 600 }}>
                Clean record — no proctoring violations observed.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto' }}>
                {integrity.events.map(ev => {
                  const isHigh = ev.severity === 'high';
                  return (
                    <div
                      key={ev.id}
                      style={{
                        padding: '10px 14px',
                        background: isHigh ? '#fef2f2' : '#f9fafb',
                        border: `1px solid ${isHigh ? '#fecaca' : '#e5e7eb'}`,
                        borderRadius: 8,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827' }}>
                          {ev.event_type.replace(/_/g, ' ').toUpperCase()}
                        </div>
                        <div style={{ fontSize: '0.725rem', color: '#6b7280' }}>
                          {ev.recorded_at ? new Date(ev.recorded_at).toLocaleString() : '—'}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          color: isHigh ? '#ef4444' : '#f59e0b',
                          background: '#ffffff',
                          padding: '2px 8px',
                          borderRadius: 6,
                          border: `1px solid ${isHigh ? '#fecaca' : '#fde68a'}`,
                        }}
                      >
                        {ev.severity}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Attendance History */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <Calendar size={18} className={styles.cardTitleIcon} />
                <div>
                  <h3 className={styles.cardTitle}>Lab Attendance Activity</h3>
                  <p className={styles.cardSubtitle}>
                    {attendance.rate}% present ({attendance.present_count} of {attendance.total_count} sessions)
                  </p>
                </div>
              </div>
            </div>

            {attendance.records.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: '0.85rem' }}>
                No lab sessions scheduled or attended yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
                {attendance.records.map((rec, i) => {
                  const isPresent = rec.status === 'present';
                  return (
                    <div
                      key={`att-${i}`}
                      style={{
                        padding: '8px 12px',
                        background: '#fafafa',
                        border: '1px solid #f3f4f6',
                        borderRadius: 6,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8125rem',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, color: '#1f2937' }}>{rec.session_title}</span>
                        <span style={{ color: '#9ca3af', marginLeft: 8, fontSize: '0.725rem' }}>
                          {rec.scheduled_at ? new Date(rec.scheduled_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.725rem',
                          color: isPresent ? '#10b981' : '#ef4444',
                        }}
                      >
                        {isPresent ? 'PRESENT' : 'ABSENT'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </InstitutionShell>
  );
}
