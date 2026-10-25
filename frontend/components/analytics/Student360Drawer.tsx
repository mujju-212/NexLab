'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  User,
  Award,
  BookOpen,
  Calendar,
  AlertTriangle,
  ShieldCheck,
  TrendingUp,
  Clock,
  Send,
  CheckCircle,
  FileText,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import styles from './analytics.module.css';
import { analyticsService, Student360Profile } from '@/services/analytics.service';
import { RiskGauge } from './RiskGauge';
import { RiskBreakdownBar } from './RiskBreakdownBar';
import { MasteryRadar } from './MasteryRadar';
import { ForecastBand } from './ForecastBand';
import { riskBandLabel, riskColor } from '@/lib/analytics-utils';

interface Student360DrawerProps {
  studentId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onLogIntervention?: (student: { id: string; name: string }) => void;
}

export function Student360Drawer({
  studentId,
  isOpen,
  onClose,
  onLogIntervention,
}: Student360DrawerProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'trajectory' | 'integrity' | 'interventions'>('overview');

  // Intervention form state
  const [actionType, setActionType] = useState('1_on_1_review');
  const [note, setNote] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [formSuccess, setFormSuccess] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Queries
  const { data: profile, isLoading: loadingProfile } = useQuery<Student360Profile>({
    queryKey: ['student360', studentId],
    queryFn: () => analyticsService.getStudent360(studentId!),
    enabled: Boolean(studentId && isOpen),
  });

  const { data: forecast, isLoading: loadingForecast } = useQuery({
    queryKey: ['studentForecast', studentId],
    queryFn: () => analyticsService.getStudentForecast(studentId!),
    enabled: Boolean(studentId && isOpen),
  });

  const { data: integrityData } = useQuery({
    queryKey: ['studentIntegrity', studentId],
    queryFn: () => analyticsService.getStudentIntegrity(studentId!),
    enabled: Boolean(studentId && isOpen),
  });

  const { data: interventions = [] } = useQuery({
    queryKey: ['studentInterventions', studentId],
    queryFn: () => analyticsService.listInterventions(studentId!),
    enabled: Boolean(studentId && isOpen),
  });

  // Intervention Mutation
  const interventionMutation = useMutation({
    mutationFn: (payload: { student_id: string; action_type: string; note: string; target_date?: string }) =>
      analyticsService.createIntervention(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studentInterventions', studentId] });
      queryClient.invalidateQueries({ queryKey: ['student360', studentId] });
      setNote('');
      setFormSuccess(true);
      setTimeout(() => setFormSuccess(false), 3000);
    },
  });

  const handleCreateIntervention = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !actionType) return;
    interventionMutation.mutate({
      student_id: studentId,
      action_type: actionType,
      note,
      target_date: targetDate || undefined,
    });
  };

  if (!isOpen) return null;

  const student = profile?.student;
  const risk = profile?.risk;
  const grades = profile?.grades;
  const mastery = profile?.mastery;
  const attendance = profile?.attendance;
  const completion = profile?.completion;
  const ranks = profile?.ranks || {};
  const integrityHasEvidence = Boolean(integrityData && integrityData.confidence_band !== 'no_data');
  const integrityEvents = integrityData?.timeline || [];
  const proctorFlagCount = integrityHasEvidence
    ? Object.values(integrityData?.violation_counts || {}).reduce((sum, count) => sum + count, 0)
    : null;
  const plagiarismFlagCount = integrityHasEvidence ? (integrityData?.plagiarism_flags?.length ?? 0) : null;

  const studentName = student?.full_name || (student as any)?.name || '';
  const initials = studentName
    ? studentName
        .split(' ')
        .map((p: string) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'ST';

  const riskBadge = riskBandLabel(risk?.risk_band);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(17, 24, 39, 0.45)',
          backdropFilter: 'blur(3px)',
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Drawer Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '680px',
          height: '100%',
          background: '#ffffff',
          boxShadow: '-8px 0 32px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10000,
          overflowY: 'auto',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Sticky Header */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            background: '#ffffff',
            borderBottom: '1px solid #ede9fe',
            padding: '18px 24px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '1.05rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
              }}
            >
              {initials}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>
                  {studentName || 'Loading Student...'}
                </h2>
                {risk && (
                  <span
                    style={{
                      background: riskBadge.bg,
                      color: riskBadge.color,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 9999,
                      border: `1px solid ${riskBadge.color}40`,
                    }}
                  >
                    {riskBadge.label}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.775rem', color: '#6b7280', marginTop: 2 }}>
                {student?.roll_number ? `${student.roll_number} · ` : ''}
                {student?.email || 'Student 360 Diagnostic Profile'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              title="Open full profile page"
              onClick={() => {
                onClose();
                router.push(`/institution/students/${studentId}`);
              }}
              style={{
                border: 'none',
                background: '#f3e8ff',
                color: '#7c3aed',
                width: 32,
                height: 32,
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ExternalLink size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
            style={{
              border: 'none',
              background: '#f3f4f6',
              color: '#4b5563',
              width: 32,
              height: 32,
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Drawer Sub-Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #f3f4f6',
            padding: '0 24px',
            background: '#faf9fe',
            gap: 16,
          }}
        >
          {[
            { key: 'overview', label: 'Overview & Risk' },
            { key: 'trajectory', label: 'Trajectory & Forecast' },
            { key: 'integrity', label: 'Integrity & Conduct' },
            { key: 'interventions', label: `Interventions (${interventions.length})` },
          ].map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key as any)}
                style={{
                  padding: '12px 4px',
                  background: 'none',
                  border: 'none',
                  borderBottom: active ? '2px solid #7c3aed' : '2px solid transparent',
                  color: active ? '#7c3aed' : '#6b7280',
                  fontWeight: active ? 700 : 500,
                  fontSize: '0.825rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Drawer Body */}
        <div style={{ padding: '24px', flex: 1 }}>
          {loadingProfile ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
              Loading comprehensive 360 profile...
            </div>
          ) : !profile ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#ef4444' }}>
              Unable to load student diagnostic profile.
            </div>
          ) : (
            <>
              {/* Quick Metrics Bar (Always visible) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 10,
                  marginBottom: 20,
                }}
              >
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Mastery
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed', marginTop: 2 }}>
                    {mastery?.scope_avg == null ? '—' : `${Math.round(mastery.scope_avg)}%`}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Final Submissions
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#06b6d4', marginTop: 2 }}>
                    {completion?.completed ?? 0}/{completion?.assigned ?? 0}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Attendance
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginTop: 2 }}>
                    {attendance?.attendance_rate == null ? '—' : `${Math.round(attendance.attendance_rate)}%`}
                  </div>
                </div>
                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Avg Grade
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b', marginTop: 2 }}>
                    {grades?.average == null ? '—' : `${Math.round(grades.average)}%`}
                  </div>
                </div>
              </div>

              {/* Multi-Scope Rank Pills */}
              {Object.keys(ranks).length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 24,
                    padding: '10px 14px',
                    background: '#faf5ff',
                    border: '1px solid #ede9fe',
                    borderRadius: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <Award size={16} style={{ color: '#7c3aed' }} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#5b21b6' }}>
                    Cohort Standings
                    <span style={{ fontWeight: 500, color: '#7c3aed' }}> (composite: mastery · engagement · effort · efficiency · consistency)</span>:
                  </span>
                  <span style={{ flexBasis: '100%', marginLeft: 24, fontSize: 11, color: '#64748b' }}>
                    Attendance is included only when every student in the cohort has at least 3 sessions. Missing signals are left out, not counted as zero.
                  </span>
                  {Object.entries(ranks).map(([scope, r]) => (
                    <span
                      key={scope}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #ddd6fe',
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontSize: '0.725rem',
                        color: '#4c1d95',
                        fontWeight: 600,
                      }}
                    >
                      <strong style={{ textTransform: 'capitalize' }}>{scope}:</strong> #{r.position} of {r.cohort_size}{' '}
                      {r.percentile == null ? '(n/a)' : `(${Math.round(r.percentile)}th %ile)`}
                    </span>
                  ))}
                </div>
              )}

              {/* ── TAB 1: OVERVIEW ── */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Unified Risk details */}
                  {risk && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <RiskGauge
                        score={risk.unified_risk_score}
                        band={risk.risk_band}
                        primaryReason={risk.primary_reason}
                        title="Unified Risk Index"
                        size={170}
                      />
                      <div
                        className={styles.card}
                        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
                      >
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                          Primary Risk Driver
                        </div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#111827', marginTop: 6 }}>
                          {risk.primary_reason || 'No acute failure risk detected'}
                        </div>
                        <p style={{ fontSize: '0.775rem', color: '#6b7280', marginTop: 8, lineHeight: 1.4 }}>
                          Unified risk is derived from real-time mastery deficits, recent grade downward slope,
                          missed lab attendance, and low active engagement signals.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Risk breakdown bar if components exist */}
                  {risk?.components && Object.keys(risk.components).length > 0 && (
                    <RiskBreakdownBar
                      title="Risk Penalty Attribution"
                      subtitle="Specific factor weights causing risk inflation"
                      components={Object.entries(risk.components)
                        // A factor with no sample is not "0 / healthy" — it was
                        // never measured, so it must not appear in the breakdown.
                        .filter(([k, v]: [string, any]) => {
                          if (['attendance_sample', 'attendance_thin'].includes(k)) return false;
                          if (v == null) return false;
                          if (typeof v === 'object' && (v.value ?? null) == null) return false;
                          return true;
                        })
                        .map(([k, v]: [string, any]) => {
                        const val = typeof v === 'number' ? v : (v?.value ?? 0);
                        const penalty = typeof v === 'object' && v?.penalty !== undefined 
                          ? v.penalty 
                          : ((risk as any).risk_contributions?.[k] ?? 0);
                        const weight = typeof v === 'object' && v?.contribution !== undefined
                          ? v.contribution
                          : ((risk as any).weights?.[k] ?? 0.2);
                        return {
                          name: k.replace(/_/g, ' '),
                          weight,
                          value: val,
                          penalty,
                          contribution_pct: Math.round(((penalty || 0) / Math.max(1, risk.unified_risk_score || (risk as any).risk_score || 100)) * 100),
                        };
                      })}
                    />
                  )}

                  {/* Concept Mastery Radar */}
                  {mastery?.concepts && mastery.concepts.length > 0 && (
                    <MasteryRadar
                      title="Concept Mastery Fingerprint"
                      subtitle="Evaluated across all attempted curriculum concepts"
                      data={mastery.concepts}
                      height={260}
                    />
                  )}

                  {/* Weak concepts callout */}
                  {mastery?.weak_concepts && mastery.weak_concepts.length > 0 && (
                    <div
                      style={{
                        padding: '12px 16px',
                        background: '#fef2f2',
                        border: '1px solid #fee2e2',
                        borderRadius: 10,
                      }}
                    >
                      <div style={{ fontSize: '0.775rem', fontWeight: 700, color: '#b91c1c', marginBottom: 6 }}>
                        Identified Concept Knowledge Gaps:
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {mastery.weak_concepts.map((wc) => (
                          <span
                            key={wc}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #fecaca',
                              color: '#b91c1c',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '2px 8px',
                              borderRadius: 4,
                            }}
                          >
                            {wc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── TAB 2: TRAJECTORY & FORECAST ── */}
              {activeTab === 'trajectory' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {forecast ? (
                    <ForecastBand data={forecast} height={260} />
                  ) : loadingForecast ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                      Computing predictive regression model...
                    </div>
                  ) : (
                    <div style={{ padding: 30, textAlign: 'center', color: '#6b7280' }}>
                      Insufficient submission history to construct 95% confidence interval forecast.
                    </div>
                  )}

                  {/* Recent experiment grades */}
                  <div className={styles.card}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                      Graded Submissions History
                    </h4>
                    {grades?.recent && grades.recent.length > 0 ? (
                      <table className={styles.dataTable}>
                        <thead>
                          <tr>
                            <th>Experiment</th>
                            <th style={{ textAlign: 'center' }}>Auto Grade</th>
                            <th style={{ textAlign: 'center' }}>Manual Grade</th>
                            <th style={{ textAlign: 'center' }}>Final Grade</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grades.recent.map((g, idx) => (
                            <tr key={idx}>
                              <td style={{ fontWeight: 600 }}>{g.experiment_title}</td>
                              <td style={{ textAlign: 'center', color: '#6b7280' }}>
                                {g.auto_grade != null ? `${g.auto_grade}%` : '—'}
                              </td>
                              <td style={{ textAlign: 'center', color: '#6b7280' }}>
                                {g.manual_grade != null ? `${g.manual_grade}%` : '—'}
                              </td>
                              <td
                                style={{
                                  textAlign: 'center',
                                  fontWeight: 800,
                                  color: g.final_grade >= 70 ? '#10b981' : g.final_grade >= 50 ? '#f59e0b' : '#ef4444',
                                }}
                              >
                                {g.final_grade}%
                              </td>
                              <td style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                {g.created_at ? new Date(g.created_at).toLocaleDateString() : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <div style={{ fontSize: '0.8125rem', color: '#9ca3af', padding: '16px 0' }}>
                        No submissions recorded for this student yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── TAB 3: INTEGRITY & CONDUCT ── */}
              {activeTab === 'integrity' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: 10,
                    }}
                  >
                    <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                        Integrity Score
                      </div>
                      <div
                        style={{
                          fontSize: '1.4rem',
                          fontWeight: 800,
                          color:
                            integrityData?.integrity_confidence == null
                              ? '#64748b'
                              : integrityData.integrity_confidence >= 80
                              ? '#10b981'
                              : '#ef4444',
                          marginTop: 4,
                        }}
                      >
                        {integrityData?.integrity_confidence == null
                          ? '—'
                          : `${Math.round(integrityData.integrity_confidence)}%`}
                      </div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                        Proctor Flags
                      </div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#374151', marginTop: 4 }}>
                        {proctorFlagCount ?? '—'}
                      </div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                        Plagiarism Flags
                      </div>
                      <div
                        style={{
                          fontSize: '1.4rem',
                          fontWeight: 800,
                          color: plagiarismFlagCount == null ? '#64748b' : plagiarismFlagCount > 0 ? '#ef4444' : '#10b981',
                          marginTop: 4,
                        }}
                      >
                        {plagiarismFlagCount ?? '—'}
                      </div>
                    </div>
                  </div>

                  {/* Proctor events list */}
                  <div className={styles.card}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                      Proctoring Violation Log
                    </h4>
                    {integrityEvents.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {integrityEvents.map((v, i) => (
                          <div
                            key={i}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              border: '1px solid #f3f4f6',
                              borderRadius: 8,
                              fontSize: '0.785rem',
                            }}
                          >
                            <span style={{ fontWeight: 600, color: '#1f2937' }}>{v.event_type}</span>
                            <span
                              style={{
                                background: v.severity === 'high' ? '#fee2e2' : '#fef3c7',
                                color: v.severity === 'high' ? '#b91c1c' : '#b45309',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                              }}
                            >
                              {v.severity.toUpperCase()}
                            </span>
                            <span style={{ color: '#9ca3af', fontSize: '0.72rem' }}>
                              {v.recorded_at ? new Date(v.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: '#10b981', fontSize: '0.8125rem' }}>
                        {!integrityData ? 'Loading integrity data…' : integrityData.confidence_band === 'no_data' ? 'No integrity evidence is available yet; this is not a clean-record result.' : 'No proctor flags recorded.'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── TAB 4: INTERVENTIONS ── */}
              {activeTab === 'interventions' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Log new intervention form */}
                  <div className={styles.card} style={{ background: '#fbfbfe' }}>
                    <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                      Record Targeted Intervention
                    </h4>
                    <form onSubmit={handleCreateIntervention} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>
                          Action Type
                        </label>
                        <select
                          value={actionType}
                          onChange={(e) => setActionType(e.target.value)}
                          className={styles.filterSelect}
                          style={{ width: '100%' }}
                        >
                          <option value="1_on_1_review">1:1 Diagnostic & Concept Review</option>
                          <option value="practice_assignment">Assign Remedial Code Practice</option>
                          <option value="peer_tutoring">Pair with Peer Tutor / Teaching Assistant</option>
                          <option value="counseling">Academic Counseling Referral</option>
                          <option value="deadline_extension">Targeted Deadline Extension</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>
                          Notes / Prescribed Guidance
                        </label>
                        <textarea
                          rows={3}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Document student struggle points, specific concepts discussed, or agreed milestones..."
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: 8,
                            border: '1px solid #d1d5db',
                            fontSize: '0.8125rem',
                            outline: 'none',
                            fontFamily: 'inherit',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>
                            Follow-Up Target Date (Optional)
                          </label>
                          <input
                            type="date"
                            value={targetDate}
                            onChange={(e) => setTargetDate(e.target.value)}
                            style={{
                              width: '100%',
                              height: 36,
                              padding: '0 10px',
                              borderRadius: 8,
                              border: '1px solid #d1d5db',
                              fontSize: '0.8125rem',
                            }}
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={interventionMutation.isPending}
                          className={`${styles.actionBtn} ${styles.primaryBtn}`}
                          style={{ marginTop: 20 }}
                        >
                          <Send size={14} /> Log Action
                        </button>
                      </div>

                      {formSuccess && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#10b981', fontSize: '0.785rem', fontWeight: 600 }}>
                          <CheckCircle size={15} /> Intervention successfully recorded with initial baseline risk score.
                        </div>
                      )}
                    </form>
                  </div>

                  {/* Past interventions list */}
                  <div className={styles.card}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                      Intervention History & Efficacy
                    </h4>
                    {interventions.length === 0 ? (
                      <div style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>
                        No prior interventions logged for this student.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {interventions.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              padding: '12px 14px',
                              border: '1px solid #ede9fe',
                              borderRadius: 10,
                              background: '#ffffff',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, fontSize: '0.825rem', color: '#7c3aed' }}>
                                {item.action_type.replace(/_/g, ' ').toUpperCase()}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                                {new Date(item.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            {item.note && (
                              <p style={{ margin: '4px 0 8px', fontSize: '0.8rem', color: '#374151', lineHeight: 1.4 }}>
                                {item.note}
                              </p>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.725rem' }}>
                              <span style={{ color: '#6b7280' }}>
                                Outcome: <strong style={{ color: item.outcome === 'improved' ? '#10b981' : '#374151' }}>{item.outcome}</strong>
                              </span>
                              {item.risk_delta != null && (
                                <span style={{ color: item.risk_delta < 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                                  Δ Risk: {item.risk_delta > 0 ? `+${item.risk_delta}` : item.risk_delta} pts
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
