'use client';

import React from 'react';
import { Download } from 'lucide-react';
import hub from '@/app/instructor/grading/hub.module.css';

interface AnalyticsViewProps {
  stats: any;
  classAvg: string;
  totalStudents: number;
  onExportCSV: () => void;
}

export default function AnalyticsView({
  stats,
  classAvg,
  totalStudents,
  onExportCSV,
}: AnalyticsViewProps) {
  const atRiskCount = stats?.at_risk_count ?? 28;
  const atRiskPct = Math.round((atRiskCount / (totalStudents || 245)) * 100);

  return (
    <div className={hub.viewContainer}>
      {/* Top 5 KPI Stat Cards + Export CSV */}
      <div className={hub.analyticsTopGrid}>
        {/* Card 1: Class average */}
        <div className={hub.kpiCardV2}>
          <span className={hub.kpiCardTitle}>Class average</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className={hub.kpiCardNumber}>
              {stats?.class_average ?? classAvg}
            </span>
            <span className={`${hub.kpiCardBadge} ${hub.kpiBadgeGreen}`}>+4%</span>
          </div>
        </div>

        {/* Card 2: Median score */}
        <div className={hub.kpiCardV2}>
          <span className={hub.kpiCardTitle}>Median score</span>
          <span className={hub.kpiCardNumber}>
            {stats?.median_score ?? 74.0}
          </span>
        </div>

        {/* Card 3: Pass rate */}
        <div className={hub.kpiCardV2}>
          <span className={hub.kpiCardTitle}>Pass rate (&gt;=50)</span>
          <span className={hub.kpiCardNumber}>
            {stats?.pass_rate ?? 88}%
          </span>
        </div>

        {/* Card 4: Top performers */}
        <div className={hub.kpiCardV2}>
          <span className={hub.kpiCardTitle}>Top performers</span>
          <span className={hub.kpiCardNumber}>
            {stats?.top_performers_count ?? 12}
            <span className={hub.kpiCardUnit}> (&gt;=90)</span>
          </span>
        </div>

        {/* Card 5: At-risk */}
        <div className={hub.kpiCardV2}>
          <span className={hub.kpiCardTitle}>At-Risk</span>
          <span className={hub.kpiCardNumber} style={{ color: '#dc2626' }}>
            {atRiskCount}
            <span className={hub.kpiCardUnit}> ({atRiskPct}%)</span>
          </span>
        </div>

        {/* Export CSV button */}
        <button
          type="button"
          className={hub.iconBtn}
          style={{ height: 42, padding: '0 16px' }}
          onClick={onExportCSV}
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* 3 Visualizations Grid */}
      <div className={hub.analyticsVizGrid}>
        {/* Card 1: Grade distribution */}
        <div className={hub.whiteCard}>
          <div className={hub.cardHeading}>Grade distribution</div>
          <div className={hub.histogramBox} style={{ height: 160 }}>
            {[
              { label: '0-40', count: stats?.distribution?.['0-40'] ?? 28, highlight: false },
              { label: '40-60', count: stats?.distribution?.['40-60'] ?? 52, highlight: false },
              { label: '60-75', count: stats?.distribution?.['60-75'] ?? 84, highlight: true },
              { label: '75-90', count: stats?.distribution?.['75-90'] ?? 36, highlight: false },
              { label: '90-100', count: stats?.distribution?.['90-100'] ?? 20, highlight: false },
            ].map(b => (
              <div key={b.label} className={hub.histogramCol}>
                <span className={hub.histogramValue}>{b.count}</span>
                <div
                  className={`${hub.histogramBar} ${b.highlight ? hub.histogramBarHighlight : ''}`}
                  style={{ height: `${Math.max(12, Math.round((b.count / 90) * 100))}%` }}
                />
                <span className={hub.histogramLabel}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Card 2: Assessment contribution */}
        <div className={hub.whiteCard}>
          <div className={hub.cardHeading}>Assessment contribution</div>
          <div className={hub.donutChartBox}>
            {/* SVG Donut Chart */}
            <div className={hub.donutCenter}>
              <svg width={130} height={130} viewBox="0 0 42 42">
                <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e2e8f0" strokeWidth="6" />
                {/* Test Cases: 40% */}
                <circle
                  cx="21" cy="21" r="15.915" fill="transparent"
                  stroke="#7c3aed" strokeWidth="6"
                  strokeDasharray="40 60" strokeDashoffset="25"
                />
                {/* Lab Report: 20% */}
                <circle
                  cx="21" cy="21" r="15.915" fill="transparent"
                  stroke="#3b82f6" strokeWidth="6"
                  strokeDasharray="20 80" strokeDashoffset="85"
                />
                {/* Code Quality: 15% */}
                <circle
                  cx="21" cy="21" r="15.915" fill="transparent"
                  stroke="#10b981" strokeWidth="6"
                  strokeDasharray="15 85" strokeDashoffset="65"
                />
                {/* Viva: 15% */}
                <circle
                  cx="21" cy="21" r="15.915" fill="transparent"
                  stroke="#f59e0b" strokeWidth="6"
                  strokeDasharray="15 85" strokeDashoffset="50"
                />
                {/* Quiz: 10% */}
                <circle
                  cx="21" cy="21" r="15.915" fill="transparent"
                  stroke="#ec4899" strokeWidth="6"
                  strokeDasharray="10 90" strokeDashoffset="35"
                />
              </svg>
              <div className={hub.donutCenterText}>
                <span className={hub.donutNumber}>100</span>
                <span className={hub.donutLabel}>Marks</span>
              </div>
            </div>

            {/* Donut Legend */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 11.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={hub.legendDot} style={{ background: '#7c3aed' }} />
                <span style={{ color: '#475569' }}>Test Cases</span>
                <span style={{ fontWeight: 700, color: '#0f172a', marginLeft: 'auto' }}>40 (40%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={hub.legendDot} style={{ background: '#3b82f6' }} />
                <span style={{ color: '#475569' }}>Lab Report</span>
                <span style={{ fontWeight: 700, color: '#0f172a', marginLeft: 'auto' }}>20 (20%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={hub.legendDot} style={{ background: '#10b981' }} />
                <span style={{ color: '#475569' }}>Code Quality</span>
                <span style={{ fontWeight: 700, color: '#0f172a', marginLeft: 'auto' }}>15 (15%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={hub.legendDot} style={{ background: '#f59e0b' }} />
                <span style={{ color: '#475569' }}>Viva</span>
                <span style={{ fontWeight: 700, color: '#0f172a', marginLeft: 'auto' }}>15 (15%)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={hub.legendDot} style={{ background: '#ec4899' }} />
                <span style={{ color: '#475569' }}>Quiz</span>
                <span style={{ fontWeight: 700, color: '#0f172a', marginLeft: 'auto' }}>10 (10%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Performance trend */}
        <div className={hub.whiteCard}>
          <div className={hub.cardHeaderRow}>
            <div className={hub.cardHeading}>Performance trend</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontWeight: 650 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 3, background: '#3b82f6', borderRadius: 2 }} />
                <span style={{ color: '#475569' }}>Class Average</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 8, height: 3, background: '#ef4444', borderRadius: 2 }} />
                <span style={{ color: '#475569' }}>At-risk Average</span>
              </div>
            </div>
          </div>

          {/* Performance Trend SVG chart */}
          <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="100%" height={150} viewBox="0 0 340 140" style={{ overflow: 'visible' }}>
              {/* Grid lines */}
              <line x1="20" y1="20" x2="330" y2="20" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="20" y1="60" x2="330" y2="60" stroke="#f1f5f9" strokeWidth="1" />
              <line x1="20" y1="100" x2="330" y2="100" stroke="#f1f5f9" strokeWidth="1" />

              {/* Y-axis labels */}
              <text x="5" y="24" fontSize="9" fill="#94a3b8" fontFamily="sans-serif">90</text>
              <text x="5" y="64" fontSize="9" fill="#94a3b8" fontFamily="sans-serif">60</text>
              <text x="5" y="104" fontSize="9" fill="#94a3b8" fontFamily="sans-serif">30</text>

              {/* Class Average Polyline (Blue) */}
              <polyline
                points="40,55 105,48 175,52 245,45 315,40"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {[
                { x: 40, y: 55 }, { x: 105, y: 48 }, { x: 175, y: 52 }, { x: 245, y: 45 }, { x: 315, y: 40 }
              ].map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r="3.5" fill="#ffffff" stroke="#3b82f6" strokeWidth="2" />
              ))}

              {/* At-risk Average Polyline (Red) */}
              <polyline
                points="40,88 105,92 175,85 245,95 315,102"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {[
                { x: 40, y: 88 }, { x: 105, y: 92 }, { x: 175, y: 85 }, { x: 245, y: 95 }, { x: 315, y: 102 }
              ].map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r="3.5" fill="#ffffff" stroke="#ef4444" strokeWidth="2" />
              ))}

              {/* X-axis labels */}
              <text x="32" y="128" fontSize="10" fill="#64748b" fontFamily="sans-serif" fontWeight="600">Lab 1</text>
              <text x="97" y="128" fontSize="10" fill="#64748b" fontFamily="sans-serif" fontWeight="600">Lab 2</text>
              <text x="167" y="128" fontSize="10" fill="#64748b" fontFamily="sans-serif" fontWeight="600">Lab 3</text>
              <text x="237" y="128" fontSize="10" fill="#64748b" fontFamily="sans-serif" fontWeight="600">Lab 4</text>
              <text x="307" y="128" fontSize="10" fill="#64748b" fontFamily="sans-serif" fontWeight="600">Lab 5</text>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
