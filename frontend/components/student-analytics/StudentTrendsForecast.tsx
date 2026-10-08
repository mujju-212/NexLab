'use client';

import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { LineChart, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';
import type { TrendsResponse, ForecastResponse } from '@/services/student-analytics.service';
import styles from './student-analytics.module.css';

interface StudentTrendsForecastProps {
  trends: TrendsResponse | undefined;
  forecast: ForecastResponse | undefined;
}

export const StudentTrendsForecast: React.FC<StudentTrendsForecastProps> = ({
  trends,
  forecast,
}) => {
  // Combine historical and projected data points for a unified Recharts chart
  const historical = trends?.grades_trend || [];
  const projected = forecast?.projected_points || [];
  const projectedPoints = projected.length > 0
    ? projected.map((p, i) => ({
        name: `Proj +${i + 1}`,
        fullName: `Projected Lab +${i + 1}`,
        score: null,
        autoGrade: null,
        projected: Math.round(p.projected),
        lower95: Math.round(p.lower_95),
        upper95: Math.round(p.upper_95),
        isProjected: true,
      }))
    : (forecast as any)?.projected_final != null
    ? [
        {
          name: `Next Lab`,
          fullName: `Projected Next Lab`,
          score: null,
          autoGrade: null,
          projected: Math.round((forecast as any).projected_final),
          lower95: Math.round(Array.isArray((forecast as any)?.confidence_interval) ? (forecast as any).confidence_interval[0] : (forecast as any).projected_final - 10),
          upper95: Math.round(Array.isArray((forecast as any)?.confidence_interval) ? (forecast as any).confidence_interval[1] : (forecast as any).projected_final + 10),
          isProjected: true,
        },
      ]
    : [];

  const chartData = [
    ...historical.map((h, i) => ({
      name: h.experiment_title.length > 12 ? `${h.experiment_title.slice(0, 10)}…` : h.experiment_title,
      fullName: h.experiment_title,
      score: Math.round(h.final_grade),
      autoGrade: h.auto_grade != null ? Math.round(h.auto_grade) : null,
      projected: null,
      lower95: null,
      upper95: null,
      isProjected: false,
    })),
    ...projectedPoints,
  ];

  const slope = forecast?.trajectory_slope ?? (forecast as any)?.trend_slope_per_assignment ?? 0;
  const status = forecast?.trajectory_status || (forecast as any)?.trajectory || 'stable';

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIconBox} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <LineChart size={20} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Performance Trajectory & 95% Forecast</h2>
            <p className={styles.cardSubtitle}>
              Continuous grade progression with confidence intervals projected for upcoming lab sessions
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span
            className={styles.metaBadge}
            style={{
              background:
                status === 'improving' ? '#dcfce7' : status === 'declining' ? '#fee2e2' : '#f1f5f9',
              color:
                status === 'improving' ? '#15803d' : status === 'declining' ? '#b91c1c' : '#475569',
            }}
          >
            {status === 'improving' ? (
              <TrendingUp size={13} />
            ) : status === 'declining' ? (
              <TrendingDown size={13} />
            ) : (
              <Minus size={13} />
            )}
            <span>
              {slope > 0 ? `+${slope.toFixed(1)}` : slope.toFixed(1)} pts/lab ·{' '}
              {status.toUpperCase()}
            </span>
          </span>
        </div>
      </div>

      {chartData.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
          Insufficient experiment submissions to compute trajectory models.
        </p>
      ) : (
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div
                        style={{
                          background: '#ffffff',
                          padding: '0.65rem 0.85rem',
                          border: '1px solid #e2e8f0',
                          borderRadius: '0.5rem',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          fontSize: '0.8rem',
                        }}
                      >
                        <p style={{ fontWeight: 700, margin: '0 0 0.35rem', color: '#0f172a' }}>
                          {d.fullName}
                        </p>
                        {d.score != null && (
                          <p style={{ margin: '0 0 0.2rem', color: '#7c3aed' }}>
                            Final Grade: <strong>{d.score}%</strong>
                          </p>
                        )}
                        {d.autoGrade != null && (
                          <p style={{ margin: '0 0 0.2rem', color: '#3b82f6' }}>
                            Auto Grade: <strong>{d.autoGrade}%</strong>
                          </p>
                        )}
                        {d.projected != null && (
                          <div>
                            <p style={{ margin: '0 0 0.2rem', color: '#059669', fontWeight: 700 }}>
                              Projected Score: {d.projected}%
                            </p>
                            <p style={{ margin: '0', color: '#94a3b8', fontSize: '0.72rem' }}>
                              95% CI Range: [{d.lower95}% – {d.upper95}%]
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

              {/* Shaded Forecast Band */}
              <Area
                type="monotone"
                dataKey="upper95"
                stroke="none"
                fill="#ede9fe"
                fillOpacity={0.6}
                name="95% Confidence Band"
              />

              {/* Historical Grade Line */}
              <Line
                type="monotone"
                dataKey="score"
                stroke="#7c3aed"
                strokeWidth={3}
                dot={{ r: 4, fill: '#7c3aed' }}
                activeDot={{ r: 6 }}
                name="Actual Grade (%)"
              />

              {/* Auto Grade Line */}
              <Line
                type="monotone"
                dataKey="autoGrade"
                stroke="#93c5fd"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                name="Auto Grade"
              />

              {/* Projected Line */}
              <Line
                type="monotone"
                dataKey="projected"
                stroke="#059669"
                strokeWidth={2.5}
                strokeDasharray="5 5"
                dot={{ r: 4, fill: '#059669' }}
                name="Projected (%)"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
