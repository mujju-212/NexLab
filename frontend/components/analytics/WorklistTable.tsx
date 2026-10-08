'use client';

import React, { useState } from 'react';
import {
  AlertCircle,
  Search,
  Download,
  ArrowUpRight,
  UserCheck,
  TrendingDown,
  TrendingUp,
  Minus,
  MessageSquarePlus,
  Filter,
} from 'lucide-react';
import styles from './analytics.module.css';
import { exportCSV, riskBandLabel, riskColor } from '@/lib/analytics-utils';

export interface WorklistItem {
  student_id: string;
  student_name: string;
  roll_number?: string | null;
  section_name?: string;
  subject_name?: string;
  risk_score: number;
  risk_band: 'critical' | 'high' | 'watch' | 'ok';
  primary_reason: string;
  trend?: 'deteriorating' | 'improving' | 'stable';
  suggested_action?: string;
  attendance_rate?: number;
  average_grade?: number;
  last_activity?: string;
}

interface WorklistTableProps {
  items: WorklistItem[];
  onSelectStudent?: (studentId: string) => void;
  onLogIntervention?: (student: { id: string; name: string }) => void;
  title?: string;
  subtitle?: string;
  loading?: boolean;
}

export function WorklistTable({
  items,
  onSelectStudent,
  onLogIntervention,
  title = 'Needs-Attention Worklist',
  subtitle = 'Prioritized by composite failure risk, early warning signals, and velocity decline',
  loading = false,
}: WorklistTableProps) {
  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState<'all' | 'critical' | 'high' | 'watch' | 'ok'>('all');

  const filteredItems = (items || []).filter((item) => {
    if (bandFilter !== 'all' && item.risk_band?.toLowerCase() !== bandFilter) {
      return false;
    }
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.student_name?.toLowerCase().includes(q) ||
      item.roll_number?.toLowerCase().includes(q) ||
      item.primary_reason?.toLowerCase().includes(q) ||
      item.section_name?.toLowerCase().includes(q)
    );
  });

  const handleExport = () => {
    const rows = filteredItems.map((item) => ({
      Student: item.student_name,
      Roll: item.roll_number || '',
      Section: item.section_name || '',
      Subject: item.subject_name || '',
      'Risk Band': item.risk_band,
      'Risk Score': item.risk_score,
      'Primary Driver': item.primary_reason,
      Trend: item.trend || '',
      'Suggested Action': item.suggested_action || '',
      'Avg Grade': item.average_grade != null ? `${item.average_grade}%` : '',
      Attendance: item.attendance_rate != null ? `${item.attendance_rate}%` : '',
    }));
    exportCSV(rows, `needs_attention_${new Date().toISOString().split('T')[0]}`);
  };

  const criticalCount = items.filter((i) => i.risk_band === 'critical').length;
  const highCount = items.filter((i) => i.risk_band === 'high').length;
  const watchCount = items.filter((i) => i.risk_band === 'watch').length;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.cardTitleGroup}>
            <AlertCircle size={18} className={styles.cardTitleIcon} style={{ color: '#ef4444' }} />
            <h3 className={styles.cardTitle}>{title}</h3>
          </div>
          <div className={styles.cardSubtitle}>{subtitle}</div>
        </div>

        {/* Filter chips by risk level */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setBandFilter('all')}
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              background: bandFilter === 'all' ? '#111827' : '#f3f4f6',
              color: bandFilter === 'all' ? '#ffffff' : '#4b5563',
            }}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setBandFilter('critical')}
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: bandFilter === 'critical' ? '#ef4444' : '#fee2e2',
              color: bandFilter === 'critical' ? '#ffffff' : '#b91c1c',
            }}
          >
            Critical ({criticalCount})
          </button>
          <button
            type="button"
            onClick={() => setBandFilter('high')}
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: bandFilter === 'high' ? '#f97316' : '#ffedd5',
              color: bandFilter === 'high' ? '#ffffff' : '#c2410c',
            }}
          >
            High ({highCount})
          </button>
          <button
            type="button"
            onClick={() => setBandFilter('watch')}
            style={{
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: '0.75rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              background: bandFilter === 'watch' ? '#f59e0b' : '#fef3c7',
              color: bandFilter === 'watch' ? '#ffffff' : '#b45309',
            }}
          >
            Watch ({watchCount})
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className={styles.tableToolbar} style={{ borderRadius: '8px 8px 0 0' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, color: '#9ca3af' }} />
          <input
            type="text"
            placeholder="Search student, roll, or reason..."
            className={styles.tableSearch}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button
          type="button"
          onClick={handleExport}
          className={`${styles.actionBtn} ${styles.outlineBtn}`}
          style={{ height: 32, fontSize: '0.775rem' }}
        >
          <Download size={13} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className={styles.tableWrapper} style={{ borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Student</th>
              <th>Cohort</th>
              <th style={{ textAlign: 'center' }}>Risk Band</th>
              <th style={{ textAlign: 'center' }}>Score</th>
              <th>Primary Warning Driver</th>
              <th style={{ textAlign: 'center' }}>Velocity</th>
              <th>Suggested Intervention</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#9ca3af' }}>
                  Analyzing cohort risks...
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: '#9ca3af' }}>
                  <UserCheck size={28} style={{ margin: '0 auto 8px', color: '#10b981' }} />
                  <div>No students currently matching this risk criteria.</div>
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                const badge = riskBandLabel(item.risk_band);
                const scoreClr = riskColor(item.risk_score);

                return (
                  <tr
                    key={item.student_id}
                    className={styles.tableRowInteractive}
                    onClick={() => onSelectStudent && onSelectStudent(item.student_id)}
                  >
                    <td>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{item.student_name}</div>
                      {item.roll_number && (
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{item.roll_number}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.785rem', color: '#374151' }}>
                        {item.section_name || 'Enrolled'}
                      </div>
                      {item.subject_name && (
                        <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{item.subject_name}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span
                        style={{
                          background: badge.bg,
                          color: badge.color,
                          fontSize: '0.725rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 9999,
                          border: `1px solid ${badge.color}30`,
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.95rem', color: scoreClr }}>
                          {Math.round(item.risk_score)}
                        </span>
                        <div
                          style={{
                            width: 38,
                            height: 4,
                            background: '#f3f4f6',
                            borderRadius: 2,
                            overflow: 'hidden',
                            marginTop: 2,
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, item.risk_score)}%`,
                              height: '100%',
                              background: scoreClr,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          color: '#4b5563',
                          lineHeight: 1.35,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                        title={item.primary_reason}
                      >
                        {item.primary_reason || 'Consecutive low scores or missed deadlines'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {item.trend === 'deteriorating' ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            color: '#ef4444',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                          title="Deteriorating trajectory"
                        >
                          <TrendingDown size={14} /> Declining
                        </span>
                      ) : item.trend === 'improving' ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            color: '#10b981',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                          title="Improving trajectory"
                        >
                          <TrendingUp size={14} /> Recovering
                        </span>
                      ) : (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            color: '#6b7280',
                            fontSize: '0.75rem',
                          }}
                        >
                          <Minus size={14} /> Stagnant
                        </span>
                      )}
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      <span
                        style={{
                          fontSize: '0.785rem',
                          color: '#1e40af',
                          background: '#eff6ff',
                          padding: '3px 8px',
                          borderRadius: 6,
                          display: 'inline-block',
                        }}
                      >
                        {item.suggested_action || 'Review test failure patterns'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {onLogIntervention && (
                          <button
                            type="button"
                            onClick={() =>
                              onLogIntervention({ id: item.student_id, name: item.student_name })
                            }
                            style={{
                              border: '1px solid #ede9fe',
                              background: '#ffffff',
                              color: '#7c3aed',
                              padding: '4px 8px',
                              borderRadius: 6,
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            title="Log targeted intervention"
                          >
                            <MessageSquarePlus size={13} /> Intervene
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectStudent && onSelectStudent(item.student_id)}
                          style={{
                            border: 'none',
                            background: '#f3f4f6',
                            color: '#374151',
                            padding: '4px 6px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                          }}
                          title="Open Student 360"
                        >
                          <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
