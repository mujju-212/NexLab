'use client';

import React, { useState, useMemo } from 'react';
import {
  Database,
  DollarSign,
  Zap,
  Users,
  Info,
  PieChart as PieIcon,
  BarChart2,
  Coins,
  BookOpen,
  Calendar,
  Search,
  Download,
  ArrowUpDown,
  TrendingUp,
  Sparkles,
} from 'lucide-react';
import styles from './ai-usage-tab.module.css';
import { AiUsageOverviewResponse, AiLedgerRow } from '@/services/analytics.service';
import { exportCSV } from '@/lib/analytics-utils';

interface AIUsageTabProps {
  data: AiUsageOverviewResponse;
  onSelectStudent?: (studentId: string) => void;
  onWiderDateRange?: () => void;
}

type SortField = 'student_name' | 'total_tokens' | 'tokens_per_experiment' | 'api_requests' | 'estimated_cost_usd';

export function AIUsageTab({ data, onSelectStudent, onWiderDateRange }: AIUsageTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('total_tokens');
  const [sortAsc, setSortAsc] = useState(false);

  const kpis = data?.kpis;
  const features = data?.feature_utilization;
  const reliance = data?.reliance_efficacy;
  const budget = data?.budget;
  const ledger = data?.students_ledger || [];

  // Filter & Sort Ledger
  const filteredLedger = useMemo(() => {
    let list = [...ledger];
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (s) =>
          s.student_name.toLowerCase().includes(q) ||
          (s.roll_number && s.roll_number.toLowerCase().includes(q))
      );
    }
    list.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];
      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [ledger, searchTerm, sortField, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleExportCSV = () => {
    if (ledger.length === 0) return;
    const exportRows = ledger.map((row) => ({
      Student: row.student_name,
      RollNumber: row.roll_number,
      TotalTokens: row.total_tokens,
      TokensPerExperiment: row.tokens_per_experiment,
      APIRequests: row.api_requests,
      EstimatedCostUSD: row.estimated_cost_usd,
      UsageTrend: row.usage_trend,
    }));
    exportCSV(exportRows, 'student_ai_consumption_ledger');
  };

  return (
    <div className={styles.container}>
      {/* ────────────────────────────────────────────────────────────────────────
          1. TOP 4 KPI CARDS
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        {/* KPI 1: Total Tokens Consumed */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={styles.kpiHeader}>
              <div className={`${styles.kpiIconWrapper} ${styles.kpiIconPurple}`}>
                <Database size={15} />
              </div>
              <span className={styles.kpiTitle}>
                {kpis?.total_tokens?.label || 'Total Tokens Consumed'}
              </span>
            </div>
            <div className={styles.kpiValue}>
              {kpis?.total_tokens?.value ?? '0'}
            </div>
            <div className={styles.kpiSubtext}>
              {kpis?.total_tokens?.subtext || 'No usage in selected period'}
            </div>
          </div>
          <div className={styles.kpiIllustration}>
            {/* Soft Token Cylinder Graphic matching reference */}
            <svg width="68" height="52" viewBox="0 0 68 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="18" y="4" width="32" height="12" rx="6" fill="#EDE9FE" />
              <path d="M18 10V22C18 25.3137 25.1634 28 34 28C42.8366 28 50 25.3137 50 22V10" fill="#E0E7FF" fillOpacity="0.7" />
              <path d="M18 20V32C18 35.3137 25.1634 38 34 38C42.8366 38 50 35.3137 50 32V20" fill="#C7D2FE" fillOpacity="0.6" />
              <path d="M18 30V42C18 45.3137 25.1634 48 34 48C42.8366 48 50 45.3137 50 42V30" fill="#DDD6FE" fillOpacity="0.8" />
              <ellipse cx="34" cy="10" rx="16" ry="6" fill="#C4B5FD" />
            </svg>
          </div>
        </div>

        {/* KPI 2: Estimated API Cost */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={styles.kpiHeader}>
              <div className={`${styles.kpiIconWrapper} ${styles.kpiIconGreen}`}>
                <DollarSign size={15} />
              </div>
              <span className={styles.kpiTitle}>
                {kpis?.estimated_cost?.label || 'Estimated API Cost'}
              </span>
            </div>
            <div className={styles.kpiValue}>
              {kpis?.estimated_cost?.value ?? '$0.00'}
            </div>
            <div className={styles.kpiSubtext}>
              {kpis?.estimated_cost?.subtext || 'No usage in selected period'}
            </div>
          </div>
          <div className={styles.kpiIllustration}>
            {/* Soft ascending bar chart silhouette matching reference */}
            <svg width="68" height="52" viewBox="0 0 68 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="16" y="32" width="8" height="16" rx="3" fill="#E2E8F0" />
              <rect x="28" y="24" width="8" height="24" rx="3" fill="#CBD5E1" />
              <rect x="40" y="14" width="8" height="34" rx="3" fill="#D1FAE5" />
              <rect x="52" y="8" width="8" height="40" rx="3" fill="#A7F3D0" />
            </svg>
          </div>
        </div>

        {/* KPI 3: Tokens per Grade Point */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={styles.kpiHeader}>
              <div className={`${styles.kpiIconWrapper} ${styles.kpiIconLightPurple}`}>
                <Zap size={15} />
              </div>
              <span className={styles.kpiTitle}>
                {kpis?.tokens_per_grade?.label || 'Tokens per Grade Point'}
              </span>
            </div>
            <div className={styles.kpiValue}>
              {kpis?.tokens_per_grade?.value ?? '—'}
            </div>
            <div className={styles.kpiSubtext}>
              {kpis?.tokens_per_grade?.subtext || 'Not enough usage data'}
            </div>
          </div>
          <div className={styles.kpiIllustration}>
            {/* Soft bar equalizer silhouette matching reference */}
            <svg width="68" height="52" viewBox="0 0 68 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="20" y="22" width="7" height="24" rx="3" fill="#EDE9FE" />
              <rect x="31" y="16" width="7" height="30" rx="3" fill="#DDD6FE" />
              <rect x="42" y="26" width="7" height="20" rx="3" fill="#E2E8F0" />
            </svg>
          </div>
        </div>

        {/* KPI 4: Heavy AI Users */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={styles.kpiHeader}>
              <div className={`${styles.kpiIconWrapper} ${styles.kpiIconBlue}`}>
                <Users size={15} />
              </div>
              <span className={styles.kpiTitle}>
                {kpis?.heavy_users?.label || 'Heavy AI Users'}
              </span>
            </div>
            <div className={styles.kpiValue}>
              {kpis?.heavy_users?.value ?? '0'}
            </div>
            <div className={styles.kpiSubtext}>
              {kpis?.heavy_users?.subtext || 'No students with high usage'}
            </div>
          </div>
          <div className={styles.kpiIllustration}>
            {/* Soft users silhouette matching reference */}
            <svg width="68" height="52" viewBox="0 0 68 52" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="28" cy="18" r="8" fill="#E2E8F0" />
              <path d="M14 38C14 31.3726 19.3726 26 26 26H30C36.6274 26 42 31.3726 42 38V40H14V38Z" fill="#E2E8F0" />
              <circle cx="44" cy="20" r="6" fill="#CBD5E1" />
              <path d="M38 38C38 33.5786 41.5786 30 46 30H48C52.4214 30 56 33.5786 56 38V40H38V38Z" fill="#CBD5E1" />
            </svg>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          2. INFORMATIONAL ALERT BANNER
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.alertBanner}>
        <Info size={18} className={styles.alertIcon} />
        <div className={styles.alertText}>
          <span className={styles.alertTitle}>
            AI usage metrics (tokens, cost, and feature breakdowns) are populated once students make AI requests in your experiments.
          </span>
          <span className={styles.alertSubtext}>
            For small sample sizes, some insights may be marked as &quot;insufficient data&quot; to avoid misleading interpretations.
          </span>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          3. MIDDLE 2-COLUMN SECTION
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.middleGrid}>
        {/* Left Column: AI Feature Utilization */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderLeft}>
              <div className={styles.cardHeaderTitles}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <PieIcon size={16} style={{ color: '#7c3aed' }} />
                  <span className={styles.cardTitle}>AI Feature Utilization</span>
                </div>
                <span className={styles.cardSubtitle}>
                  Distribution of AI feature usage across all student sessions
                </span>
              </div>
            </div>
          </div>

          {!features?.has_data || features?.features?.length === 0 ? (
            /* Empty State matching reference UI */
            <div className={styles.emptyStateCentered}>
              <div className={styles.emptyIllustrationContainer}>
                {/* Soft purple chart with sparkle icon badge */}
                <svg width="120" height="90" viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="25" y="15" width="70" height="60" rx="12" fill="#F5F3FF" />
                  <rect x="35" y="44" width="7" height="22" rx="3.5" fill="#DDD6FE" />
                  <rect x="46" y="32" width="7" height="34" rx="3.5" fill="#C4B5FD" />
                  <rect x="57" y="40" width="7" height="26" rx="3.5" fill="#DDD6FE" />
                  <rect x="68" y="24" width="7" height="42" rx="3.5" fill="#A78BFA" />
                  <circle cx="85" cy="22" r="14" fill="#8B5CF6" />
                  <path
                    d="M85 14L86.6 19.4L92 21L86.6 22.6L85 28L83.4 22.6L78 21L83.4 19.4L85 14Z"
                    fill="#FFFFFF"
                  />
                </svg>
              </div>

              <div className={styles.emptyHeadline}>
                {features?.empty_headline || 'No AI feature usage recorded in this period.'}
              </div>
              <div className={styles.emptySubtext}>
                {features?.empty_subtext ||
                  'Token usage by feature (e.g., code generation, debugging, explanation) will appear here once students use AI in your experiments.'}
              </div>

              <button
                type="button"
                className={styles.actionBtn}
                onClick={onWiderDateRange}
              >
                <Calendar size={14} style={{ color: '#7c3aed' }} />
                <span>Try a wider date range</span>
              </button>
            </div>
          ) : (
            /* Populated feature utilization breakdown */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
              {features.features.map((feat) => (
                <div key={feat.feature} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.775rem' }}>
                    <span style={{ fontWeight: 600, color: '#334155' }}>{feat.name}</span>
                    <span style={{ fontWeight: 700, color: feat.color }}>
                      {feat.percentage}% ({feat.tokens.toLocaleString()} tokens)
                    </span>
                  </div>
                  <div style={{ height: 8, background: '#f1f5f9', borderRadius: 9999, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${feat.percentage}%`,
                        height: '100%',
                        background: feat.color,
                        borderRadius: 9999,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Stacked Column (2 cards) */}
        <div className={styles.rightStack}>
          {/* Card 1: AI Reliance & Academic Efficacy */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.cardHeaderTitles}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BarChart2 size={16} style={{ color: '#8b5cf6' }} />
                    <span className={styles.cardTitle}>AI Reliance &amp; Academic Efficacy</span>
                  </div>
                  <span className={styles.cardSubtitle}>
                    Compare learning outcomes for students who use AI vs. those who don&apos;t.
                  </span>
                </div>
              </div>
            </div>

            {!reliance?.has_sufficient_data ? (
              /* Empty state matching reference */
              <div className={styles.emptyStateCentered} style={{ minHeight: 120 }}>
                <div className={styles.emptyIllustrationContainer} style={{ marginBottom: 10 }}>
                  <svg width="60" height="44" viewBox="0 0 60 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="8" y="20" width="7" height="18" rx="3.5" fill="#E2E8F0" />
                    <rect x="20" y="12" width="7" height="26" rx="3.5" fill="#CBD5E1" />
                    <rect x="32" y="16" width="7" height="22" rx="3.5" fill="#E2E8F0" />
                    <circle cx="44" cy="14" r="10" fill="#94A3B8" />
                    <text x="44" y="18" textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="700" fontFamily="sans-serif">
                      ?
                    </text>
                  </svg>
                </div>

                <div className={styles.emptyHeadline} style={{ fontSize: '0.825rem' }}>
                  {reliance?.empty_headline || 'Insufficient data to compare.'}
                </div>
                <div className={styles.emptySubtext} style={{ fontSize: '0.75rem', marginBottom: 0 }}>
                  {reliance?.empty_subtext ||
                    'AI usage and academic outcome data will appear here once there is enough student activity in the selected period.'}
                </div>
              </div>
            ) : (
              /* Populated reliance insights */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ flex: 1, padding: 12, background: '#f5f3ff', borderRadius: 8 }}>
                    <div style={{ fontSize: '0.725rem', color: '#6b7280' }}>AI Users Avg Grade</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#7c3aed' }}>
                      {reliance.avg_grade_ai}%
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
                    <div style={{ fontSize: '0.725rem', color: '#6b7280' }}>Non-AI Users Avg Grade</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#475569' }}>
                      {reliance.avg_grade_non_ai}%
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.775rem', color: '#334155', lineHeight: 1.45 }}>
                  {reliance.insight}
                </div>
              </div>
            )}
          </div>

          {/* Card 2: Institutional AI Budget */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardHeaderLeft}>
                <div className={styles.cardHeaderTitles}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Coins size={16} style={{ color: '#f59e0b' }} />
                    <span className={styles.cardTitle}>Institutional AI Budget</span>
                  </div>
                  <span className={styles.cardSubtitle}>
                    Track total token usage against your institutional quota.
                  </span>
                </div>
              </div>
              <div className={styles.badgePill}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8' }} />
                <span>{budget?.status || 'Not Configured'}</span>
              </div>
            </div>

            <div className={styles.emptyStateCentered} style={{ minHeight: 90 }}>
              <div className={styles.emptyHeadline} style={{ fontSize: '0.825rem' }}>
                {budget?.headline || 'Budget tracking unavailable.'}
              </div>
              <div className={styles.emptySubtext} style={{ fontSize: '0.75rem', marginBottom: 0 }}>
                {budget?.subtext ||
                  'Institutional AI budget and quota details are not configured for your account yet.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────
          4. STUDENT AI CONSUMPTION LEDGER
         ──────────────────────────────────────────────────────────────────────── */}
      <div className={styles.ledgerCard}>
        <div className={styles.ledgerHeader}>
          <div className={styles.ledgerHeaderLeft}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#faf5ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
              }}
            >
              <BookOpen size={16} />
            </div>
            <div>
              <div style={{ fontSize: '0.925rem', fontWeight: 700, color: '#111827' }}>
                Student AI Consumption Ledger
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Individual token consumption and API request frequency.
              </div>
            </div>
          </div>

          <div className={styles.ledgerHeaderControls}>
            <div className={styles.searchBox}>
              <Search size={14} className={styles.searchIcon} />
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search students..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={styles.exportBtn}
              onClick={handleExportCSV}
              title="Export ledger as CSV"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th} onClick={() => handleSort('student_name')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Student <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className={styles.th} onClick={() => handleSort('total_tokens')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Total Tokens <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className={styles.th} onClick={() => handleSort('tokens_per_experiment')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Tokens / Experiment <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className={styles.th} onClick={() => handleSort('api_requests')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    API Requests <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className={styles.th} onClick={() => handleSort('estimated_cost_usd')} style={{ cursor: 'pointer' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    Estimated Cost <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className={styles.th}>Usage Trend</th>
              </tr>
            </thead>
            <tbody>
              {filteredLedger.length === 0 ? (
                /* Empty table row matching reference UI */
                <tr>
                  <td colSpan={6} style={{ padding: 0 }}>
                    <div className={styles.tableEmptyRow}>
                      {/* Document icon with folded corner & magnifying glass */}
                      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 6C10 4.89543 10.8954 4 12 4H26L34 12V38C34 39.1046 33.1046 40 32 40H12C10.8954 40 10 39.1046 10 38V6Z" fill="#F1F5F9" />
                        <path d="M26 4V12H34" fill="#E2E8F0" />
                        <rect x="15" y="18" width="14" height="2" rx="1" fill="#CBD5E1" />
                        <rect x="15" y="24" width="10" height="2" rx="1" fill="#CBD5E1" />
                        <circle cx="28" cy="30" r="6" fill="#FFFFFF" stroke="#94A3B8" strokeWidth="2" />
                        <line x1="32.5" y1="34.5" x2="37" y2="39" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#111827' }}>
                          No student AI consumption in this period.
                        </span>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          Token usage, API requests, and estimated cost will appear here once students use AI in your experiments.
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                /* Populated rows when real student records exist */
                filteredLedger.map((row) => (
                  <tr
                    key={row.student_id}
                    className={styles.tr}
                    onClick={() => onSelectStudent && onSelectStudent(row.student_id)}
                    style={{ cursor: onSelectStudent ? 'pointer' : 'default' }}
                  >
                    <td className={styles.td}>
                      <div className={styles.studentCell}>
                        <div className={styles.avatar} style={{ background: row.avatar_color }}>
                          {row.avatar}
                        </div>
                        <div className={styles.studentMeta}>
                          <span className={styles.studentName}>{row.student_name}</span>
                          <span className={styles.studentRoll}>{row.roll_number}</span>
                        </div>
                      </div>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.tokenHighlight}>{row.total_tokens_formatted}</span>
                    </td>
                    <td className={styles.td}>{row.tokens_per_experiment_formatted}</td>
                    <td className={styles.td}>{row.api_requests}</td>
                    <td className={styles.td}>{row.estimated_cost_formatted}</td>
                    <td className={styles.td}>
                      {/* Mini SVG sparkline */}
                      <svg width="70" height="20" className={styles.trendSparkline} viewBox="0 0 70 20">
                        <polyline
                          fill="none"
                          stroke={row.usage_trend === 'improving' ? '#10b981' : '#8b5cf6'}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={row.trend_points.map((p, idx) => `${idx * 12 + 5},${18 - (p / (row.total_tokens || 1)) * 14}`).join(' ')}
                        />
                      </svg>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
