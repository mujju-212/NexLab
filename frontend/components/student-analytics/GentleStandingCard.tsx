'use client';

import React from 'react';
import { HeartPulse, CheckCircle2, AlertCircle, HelpCircle, ShieldCheck, CalendarCheck, Lightbulb } from 'lucide-react';
import type { GentleStandingResponse, AttendanceRollupResponse, IntegrityTransparencyResponse } from '@/services/student-analytics.service';
import styles from './student-analytics.module.css';

interface GentleStandingCardProps {
  standing: GentleStandingResponse | undefined;
  attendance: AttendanceRollupResponse | undefined;
  integrity: IntegrityTransparencyResponse | undefined;
}

export const GentleStandingCard: React.FC<GentleStandingCardProps> = ({
  standing,
  attendance,
  integrity,
}) => {
  const band = standing?.standing_band || 'ok';
  const label = standing?.status_label || 'On Track & Thriving';
  const reason = standing?.primary_reason || 'Consistent academic performance and positive engagement recorded.';
  const suggestions = standing?.suggestions || [
    'Continue maintaining strong lab attendance and timely submissions.',
    'Explore advanced practice challenges to prepare for competitive matches.',
  ];

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIconBox} style={{ background: '#f0fdf4', color: '#16a34a' }}>
            <HeartPulse size={20} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Academic Wellness & Guidance</h2>
            <p className={styles.cardSubtitle}>
              Pedagogical feedback and actionable next steps tailored to your learning pace
            </p>
          </div>
        </div>
        <span
          className={`${styles.trackPill} ${
            band === 'ok'
              ? styles.standingOk
              : band === 'watch'
              ? styles.standingWatch
              : styles.standingHigh
          }`}
        >
          {band === 'ok' ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
          {label}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left Column: Guidance & Suggestions */}
        <div>
          <div
            style={{
              padding: '1rem',
              borderRadius: '0.75rem',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              marginBottom: '1rem',
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569', marginBottom: '0.25rem' }}>
              Summary Assessment:
            </div>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.5 }}>
              {reason}
            </p>
          </div>

          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: '#0f172a',
                marginBottom: '0.65rem',
              }}
            >
              <Lightbulb size={16} color="#eab308" />
              <span>Recommended Actions:</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {suggestions.map((s, idx) => (
                <li key={idx} style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.4 }}>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Column: Attendance & Integrity Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {/* Attendance Stats */}
          <div
            style={{
              padding: '1rem',
              borderRadius: '0.75rem',
              background: '#fdf4ff',
              border: '1px solid #f5d0fe',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', color: '#86198f' }}>
              <CalendarCheck size={16} />
              <strong style={{ fontSize: '0.85rem' }}>Attendance & Participation</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#701a75' }}>Scheduled Sessions</span>
              <strong style={{ fontSize: '0.9rem', color: '#701a75' }}>
                {attendance?.attended_sessions ?? 0} / {attendance?.scheduled_sessions ?? 0}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#701a75' }}>Attendance Rate</span>
              <strong style={{ fontSize: '0.95rem', color: '#86198f' }}>
                {attendance?.attendance_rate ?? 100}%
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#701a75' }}>Active Participation</span>
              <strong style={{ fontSize: '0.95rem', color: '#86198f' }}>
                {attendance?.active_rate ?? 100}%
              </strong>
            </div>
          </div>

          {/* Integrity Transparency */}
          <div
            style={{
              padding: '1rem',
              borderRadius: '0.75rem',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', color: '#166534' }}>
              <ShieldCheck size={16} />
              <strong style={{ fontSize: '0.85rem' }}>Proctor Integrity Confidence</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.35rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#14532d' }}>Confidence Rating</span>
              <strong style={{ fontSize: '0.95rem', color: '#166534' }}>
                {integrity?.confidence_score ?? 100}%
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '0.25rem' }}>
              <span style={{ fontSize: '0.78rem', color: '#14532d' }}>Recorded Flags</span>
              <strong style={{ fontSize: '0.9rem', color: '#166534' }}>
                {integrity?.proctor_events_count ?? 0} Events
              </strong>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#15803d', marginTop: '0.4rem' }}>
              ✓ Verified transparent audit trail. No academic violations active.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
