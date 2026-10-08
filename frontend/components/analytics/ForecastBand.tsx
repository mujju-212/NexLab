'use client';

import React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, HelpCircle } from 'lucide-react';
import styles from './analytics.module.css';
import { ForecastData } from '@/services/analytics.service';

interface ForecastBandProps {
  data: ForecastData;
  height?: number;
  benchmarkScore?: number;
  title?: string;
}

export function ForecastBand({
  data,
  height = 300,
  benchmarkScore = 50,
  title = 'Performance Trajectory & End-of-Term Forecast',
}: ForecastBandProps) {
  if (!data) return null;

  // Combine historical and projection points into unified chart data points
  const historical = (data.historical_points || []).map((p) => ({
    name: p.label || `Wk ${p.week}`,
    actual: p.grade,
    projected: null as number | null,
    lower: null as number | null,
    upper: null as number | null,
    bandRange: null as [number, number] | null,
  }));

  const projections = (data.projection_points || []).map((p) => ({
    name: p.label || `Wk ${p.week}`,
    actual: null as number | null,
    projected: p.projected,
    lower: p.lower,
    upper: p.upper,
    // [lower, upper] range for the Area envelope
    bandRange: [p.lower, p.upper] as [number, number],
  }));

  // Bridge the last historical point with the start of projection so lines connect smoothly
  if (historical.length > 0 && projections.length > 0) {
    const lastHist = historical[historical.length - 1];
    projections[0].projected = lastHist.actual;
    projections[0].bandRange = [lastHist.actual || 0, lastHist.actual || 0];
  }

  const chartPoints = [...historical, ...projections];

  const slope = data.trajectory_slope ?? 0;
  const isPositiveSlope = slope >= 0;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.cardTitleGroup}>
            {isPositiveSlope ? (
              <TrendingUp size={18} className={styles.cardTitleIcon} style={{ color: '#10b981' }} />
            ) : (
              <TrendingDown size={18} className={styles.cardTitleIcon} style={{ color: '#ef4444' }} />
            )}
            <h3 className={styles.cardTitle}>{title}</h3>
          </div>
          <div className={styles.cardSubtitle}>
            95% empirical confidence interval projection based on sequential submission velocity
          </div>
        </div>

        {/* Prediction summary pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: isPositiveSlope ? '#ecfdf5' : '#fef2f2',
              color: isPositiveSlope ? '#059669' : '#b91c1c',
              fontSize: '0.785rem',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 8,
              border: `1px solid ${isPositiveSlope ? '#a7f3d0' : '#fecaca'}`,
            }}
          >
            <span>Projected Final: {Math.round(data.projected_final || 0)}%</span>
            <span style={{ fontSize: '0.72rem', opacity: 0.8 }}>
              ({data.confidence_interval?.lower_95 ?? 0}–{data.confidence_interval?.upper_95 ?? 100}%)
            </span>
          </div>

          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: isPositiveSlope ? '#10b981' : '#ef4444',
            }}
          >
            {(slope ?? 0) > 0 ? `+${(slope ?? 0).toFixed(1)} pts/wk` : `${(slope ?? 0).toFixed(1)} pts/wk`}
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartPoints} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="forecastBandGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: '#6b7280' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickFormatter={(v) => `${v}%`}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length || !payload[0]?.payload) return null;
                const p = payload[0].payload;
                return (
                  <div
                    style={{
                      background: 'rgba(17, 24, 39, 0.95)',
                      color: '#ffffff',
                      padding: '8px 12px',
                      borderRadius: 8,
                      fontSize: '0.785rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
                    {p.actual != null && (
                      <div style={{ color: '#a78bfa' }}>
                        Actual Grade: <strong>{p.actual}%</strong>
                      </div>
                    )}
                    {p.projected != null && (
                      <div style={{ color: '#38bdf8' }}>
                        Projected Grade: <strong>{Math.round(p.projected)}%</strong>
                      </div>
                    )}
                    {p.lower != null && p.upper != null && (
                      <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: 2 }}>
                        95% CI: [{Math.round(p.lower)}% – {Math.round(p.upper)}%]
                      </div>
                    )}
                  </div>
                );
              }}
            />
            {/* Benchmark threshold reference line */}
            <ReferenceLine
              y={benchmarkScore}
              stroke="#ef4444"
              strokeDasharray="4 4"
              label={{
                value: `Passing Benchmark (${benchmarkScore}%)`,
                fill: '#ef4444',
                fontSize: 10,
                position: 'insideBottomRight',
              }}
            />

            {/* Shaded 95% Confidence Interval band */}
            <Area
              type="monotone"
              dataKey="bandRange"
              stroke="transparent"
              fill="url(#forecastBandGrad)"
              isAnimationActive={false}
            />

            {/* Historical trajectory line (solid purple) */}
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#7c3aed"
              strokeWidth={3}
              dot={{ r: 4, fill: '#7c3aed', strokeWidth: 1 }}
              activeDot={{ r: 6 }}
              connectNulls={false}
            />

            {/* Projected trajectory line (dashed cyan) */}
            <Line
              type="monotone"
              dataKey="projected"
              stroke="#06b6d4"
              strokeWidth={2.5}
              strokeDasharray="5 5"
              dot={{ r: 4, fill: '#06b6d4', strokeWidth: 1 }}
              connectNulls={true}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend footnote */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid #f3f4f6',
          fontSize: '0.75rem',
          color: '#6b7280',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 3, background: '#7c3aed', borderRadius: 2 }} /> Historical Submissions
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 2, borderBottom: '2px dashed #06b6d4' }} /> Forecasted Path
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 10, background: 'rgba(124, 58, 237, 0.2)', borderRadius: 2 }} /> 95% Confidence Interval
        </span>
      </div>
    </div>
  );
}
