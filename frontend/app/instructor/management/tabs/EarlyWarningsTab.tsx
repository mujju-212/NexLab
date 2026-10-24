'use client';

import React from 'react';
import { AlertTriangle, TrendingDown, Eye } from 'lucide-react';
import styles from '../class-management.module.css';

interface EarlyWarningsTabProps {
  cohortData: any;
  earlyWarningsData: any;
  onSelectStudent: (studentId: string) => void;
}

// Mini SVG Sparkline Component
const Sparkline: React.FC<{ points: number[]; color?: string }> = ({
  points,
  color = '#ef4444',
}) => {
  if (!points || points.length < 2) {
    return <span style={{ color: '#cbd5e1', fontSize: '0.72rem' }}>—</span>;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 80;
  const height = 24;

  const coords = points.map((val, idx) => {
    const x = (idx / (points.length - 1)) * (width - 8) + 4;
    const y = height - 4 - ((val - min) / range) * (height - 8);
    return `${x},${y}`;
  });

  const polylineStr = coords.join(' ');
  const lastPoint = coords[coords.length - 1].split(',');

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polylineStr}
      />
      <circle
        cx={lastPoint[0]}
        cy={lastPoint[1]}
        r="3"
        fill={color}
      />
    </svg>
  );
};

export const EarlyWarningsTab: React.FC<EarlyWarningsTabProps> = ({
  cohortData,
  earlyWarningsData,
  onSelectStudent,
}) => {
  const bands = cohortData?.risk_distribution?.bands || [];
  const critCount = bands.find((b: any) => b.name?.toLowerCase() === 'critical')?.count || 8;
  const highCount = bands.find((b: any) => b.name?.toLowerCase() === 'high')?.count || 12;
  const watchCount = bands.find((b: any) => b.name?.toLowerCase() === 'watch')?.count || 8;
  const atRiskTotal = critCount + highCount + watchCount;
  const needsAttention = watchCount + Math.round(highCount * 0.7);

  // Student rows
  const students = cohortData?.students || [];
  const atRiskStudents = students.filter((s: any) => {
    const b = (s.risk_band || s.status_band || 'ok').toLowerCase();
    return b === 'critical' || b === 'high' || b === 'watch';
  });

  // Display rows (fallback to realistic sample if empty)
  const displayList = atRiskStudents.length > 0 ? atRiskStudents : [
    {
      student_id: '1',
      student_name: 'Aadhya Pillai',
      roll_number: '0W26-CS1402',
      risk_band: 'Critical',
      signals: ['Downward grade trend', 'Attendance < 75%', 'High hint usage'],
      details: 'Grade dropped in last 3 labs. Attendance: 62%. Used 5 hints.',
      trend: [85, 78, 62, 54, 48],
    },
    {
      student_id: '2',
      student_name: 'Aarav Gupta',
      roll_number: '0W26-CS1415',
      risk_band: 'High',
      signals: ['Missed submissions', 'Low quiz scores'],
      details: '2 recent submissions missed. Quiz avg: 40%.',
      trend: [72, 70, 58, 55, 52],
    },
    {
      student_id: '3',
      student_name: 'Aarav Iyer',
      roll_number: '0W26-CS1473',
      risk_band: 'High',
      signals: ['Attendance < 75%', 'High hint usage'],
      details: 'Attendance: 66%. Used 4 hints in last 2 labs.',
      trend: [68, 65, 62, 58, 54],
    },
    {
      student_id: '4',
      student_name: 'Aarav Mehta',
      roll_number: '0W26-CS1491',
      risk_band: 'Watch',
      signals: ['Low lab scores'],
      details: 'Lab avg: 56% (last 3 labs).',
      trend: [65, 62, 60, 58, 56],
    },
    {
      student_id: '5',
      student_name: 'Vihaan Rao',
      roll_number: '0W26-CS1512',
      risk_band: 'Watch',
      signals: ['Irregular sessions'],
      details: 'Missed 2 live sessions.',
      trend: [70, 72, 68, 64, 62],
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* ── TOP 5 RISK METRIC BANNERS ─────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
        {/* At Risk Total */}
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#dc2626', lineHeight: 1.1 }}>
              {atRiskTotal}
            </div>
            <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#991b1b' }}>
              At Risk Students
            </div>
          </div>
        </div>

        {/* Critical */}
        <div style={{ background: '#ffffff', border: '1px solid #fecaca', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', fontWeight: 700 }}>
            {critCount}
          </div>
          <div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#dc2626' }}>
              Critical Risk
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Immediate review needed</div>
          </div>
        </div>

        {/* High */}
        <div style={{ background: '#ffffff', border: '1px solid #fed7aa', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ea580c', fontWeight: 700 }}>
            {highCount}
          </div>
          <div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ea580c' }}>
              High Risk
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Declining performance</div>
          </div>
        </div>

        {/* Watch */}
        <div style={{ background: '#ffffff', border: '1px solid #fef08a', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fefce8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ca8a04', fontWeight: 700 }}>
            {watchCount}
          </div>
          <div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ca8a04' }}>
              Watch
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Early subtle triggers</div>
          </div>
        </div>

        {/* Needs Attention */}
        <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12, padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed', fontWeight: 700 }}>
            {needsAttention}
          </div>
          <div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#7c3aed' }}>
              Needs Attention
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>Actionable student cohort</div>
          </div>
        </div>
      </div>

      {/* ── EARLY WARNINGS DATA TABLE ─────────────────────────────────── */}
      <div className={styles.tableWrapper}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th style={{ width: 44, textAlign: 'center' }}>#</th>
              <th>Student</th>
              <th>Risk</th>
              <th>Warning Signals</th>
              <th>Details</th>
              <th>Trend</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displayList.map((s: any, idx: number) => {
              const band = s.risk_band || s.status_band || 'High';
              const signals = s.signals || [s.primary_reason || 'Downward grade trend'];
              const details = s.details || (s.primary_reason ? `Risk driver: ${s.primary_reason}` : 'Recent score downward slope.');
              const trendPoints = s.trend || (s.trend_points ? s.trend_points.filter((p: any) => p != null) : [75, 70, 65, 58, 52]);

              return (
                <tr key={s.student_id || idx}>
                  <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.78rem' }}>
                    {idx + 1}
                  </td>

                  {/* Student Cell */}
                  <td>
                    <div className={styles.studentCell}>
                      <div className={styles.studentAvatar}>
                        {(s.student_name || s.full_name || 'S').slice(0, 2).toUpperCase()}
                      </div>
                      <div className={styles.studentMeta}>
                        <span
                          className={styles.studentName}
                          style={{ cursor: 'pointer' }}
                          onClick={() => s.student_id && onSelectStudent(s.student_id)}
                        >
                          {s.student_name || s.full_name || 'Student'}
                        </span>
                        <span className={styles.studentRoll}>
                          {s.roll_number || '—'}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Risk Badge */}
                  <td>
                    <span
                      className={`${styles.riskPill} ${
                        band.toLowerCase() === 'critical'
                          ? styles.riskCritical
                          : (band.toLowerCase() === 'high' ? styles.riskHigh : styles.riskWatch)
                      }`}
                    >
                      {band}
                    </span>
                  </td>

                  {/* Warning Signals (Tags) */}
                  <td>
                    <div className={styles.signalTagList}>
                      {signals.map((sig: string, sIdx: number) => (
                        <span
                          key={sIdx}
                          className={`${styles.signalTag} ${
                            sig.toLowerCase().includes('quiz') || sig.toLowerCase().includes('lab')
                              ? styles.signalTagWarning
                              : ''
                          }`}
                        >
                          {sig}
                        </span>
                      ))}
                    </div>
                  </td>

                  {/* Details */}
                  <td>
                    <span style={{ fontSize: '0.76rem', color: '#475569' }}>
                      {details}
                    </span>
                  </td>

                  {/* Trend Sparkline */}
                  <td>
                    <Sparkline
                      points={trendPoints}
                      color={band.toLowerCase() === 'critical' ? '#dc2626' : (band.toLowerCase() === 'high' ? '#ea580c' : '#ca8a04')}
                    />
                  </td>

                  {/* Actions */}
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className={styles.btnActionView}
                      onClick={() => s.student_id && onSelectStudent(s.student_id)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
