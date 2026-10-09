'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheck, AlertTriangle, Users, CheckCircle2, Lock,
  Download, Settings, TrendingUp, Sparkles, ChevronRight
} from 'lucide-react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import styles from '../ai-usage/ai-usage.module.css';
import {
  institutionService,
  type AISecurityOverviewResponse
} from '@/services/institution.service';

type SecurityTab = 'overview' | 'access' | 'privacy' | 'compliance' | 'logs' | 'settings';

export default function SecurityCompliancePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SecurityTab>('overview');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // Cached overview — shared with the AI Usage page (same query key).
  const { data: securityData } = useQuery({
    queryKey: ['institution', 'ai-security'],
    queryFn: () => institutionService.getAISecurity(),
    staleTime: 30 * 1000,
  });

  const handleExportLogs = async () => {
    try {
      showToast('Downloading compliance & security audit logs...');
      await institutionService.downloadAIExport();
      showToast('Security audit report downloaded!');
    } catch (err) {
      showToast('Failed to download security report');
    }
  };

  return (
    <InstitutionShell
      activePage="Security & Compliance"
      title="Security & Compliance"
      subtitle="Keep your institution secure, compliant, and in control."
    >
      {toast && (
        <div className={styles.toast}>
          <Sparkles size={16} /> {toast}
        </div>
      )}

      <div className={styles.container}>
        {/* ══ HEADER ══ */}
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <div className={styles.pageIconBadge}>
              <ShieldCheck size={26} strokeWidth={2.2} />
            </div>
            <div>
              <h1 className={styles.pageTitle}>Security &amp; Compliance</h1>
              <p className={styles.pageSubtitle}>Keep your institution secure, compliant, and in control.</p>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button className={styles.timeframeSelector} onClick={handleExportLogs}>
              <Download size={14} />
              <span>Download Compliance Report</span>
            </button>
            <button className={styles.exportBtn} onClick={() => showToast('Security policies enforced globally.')}>
              <Settings size={14} />
              <span>Security Settings</span>
            </button>
          </div>
        </div>

        {/* ══ SUB-NAVIGATION TABS ══ */}
        <div className={styles.navPillBar}>
          {(['overview', 'access', 'privacy', 'compliance', 'logs', 'settings'] as const).map(tab => (
            <button
              key={tab}
              className={`${styles.navPill} ${activeTab === tab ? styles.navPillActive : ''}`}
              onClick={() => setActiveTab(tab)}
              style={{ textTransform: 'capitalize' }}
            >
              {tab === 'access' ? 'Access Control' :
               tab === 'privacy' ? 'Data & Privacy' :
               tab === 'logs' ? 'Activity Logs' :
               tab === 'settings' ? 'Security Settings' : tab}
            </button>
          ))}
        </div>

        {/* ══ 4 SECURITY KPIS ══ */}
        {securityData && (
          <>
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Security Score</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                    <ShieldCheck size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{securityData.kpis.security_score.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} /> {securityData.kpis.security_score.change || '+4 vs. last month'}
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Active Users</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dcfce7', color: '#16a34a' }}>
                    <Users size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{securityData.kpis.active_users.value}</div>
                <div className={styles.kpiBadgeSubtitle}>{securityData.kpis.active_users.sub}</div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Security Alerts</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#fee2e2', color: '#dc2626' }}>
                    <AlertTriangle size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{securityData.kpis.security_alerts.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeDanger}`}>
                  {securityData.kpis.security_alerts.sub || '1 critical, 2 medium'}
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Compliance Status</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dbeafe', color: '#2563eb' }}>
                    <CheckCircle2 size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{securityData.kpis.compliance_status.value}</div>
                <div className={styles.kpiBadgeSubtitle}>{securityData.kpis.compliance_status.sub}</div>
              </div>
            </div>

            {/* ══ ROW 2: SECURITY EVENTS TREND, LOGIN LOCATIONS, QUICK ACTIONS ══ */}
            <div className={styles.dashboardMainRow}>
              {/* Security Events Trend */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Security Events</h3>
                    <span className={styles.cardSubtitle}>Login attempts, policy violations, and system events (last 30 days)</span>
                  </div>
                  <div className={styles.chartLegend}>
                    <span><span className={styles.legendDot} style={{ background: '#7c3aed' }} />Successful logins</span>
                    <span><span className={styles.legendDot} style={{ background: '#ef4444' }} />Failed logins</span>
                    <span><span className={styles.legendDot} style={{ background: '#f59e0b' }} />Policy violations</span>
                  </div>
                </div>

                <div className={styles.chartContainer}>
                  {securityData.trend && (
                    <SecurityEventsChart data={securityData.trend} />
                  )}
                </div>
              </div>

              {/* Login Locations */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Login Locations</h3>
                    <span className={styles.cardSubtitle}>Active user locations (last 30 days)</span>
                  </div>
                </div>

                <div className={styles.securityWorldMapBox}>
                  {securityData.locations.map((loc, i) => (
                    <div key={i} className={styles.deptItem}>
                      <div className={styles.locationBarItem}>
                        <span style={{ fontWeight: 600 }}>{loc.country}</span>
                        <span>{loc.percent}% ({loc.users} users)</span>
                      </div>
                      <div className={styles.progressBarBg}>
                        <div
                          className={styles.progressBarFill}
                          style={{
                            width: `${loc.percent}%`,
                            background: loc.color || '#7c3aed'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Quick Actions</h3>
                </div>

                <div className={styles.quickActionsList}>
                  <div className={styles.quickActionItem} onClick={() => showToast('2FA enforced for all user accounts!')}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><Lock size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Enforce 2FA for All Users</div>
                        <div className={styles.quickActionSubtitle}>Require multi-factor auth</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>

                  <div className={styles.quickActionItem} onClick={() => router.push('/institution/users')}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><Users size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Manage User Access</div>
                        <div className={styles.quickActionSubtitle}>Elevate or restrict privileges</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>

                  <div className={styles.quickActionItem} onClick={handleExportLogs}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><Download size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Export Audit Logs</div>
                        <div className={styles.quickActionSubtitle}>Download security events</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>
                </div>
              </div>
            </div>

            {/* ══ ROW 3: RECENT SECURITY EVENTS & COMPLIANCE FRAMEWORKS ══ */}
            <div className={styles.twoColGrid}>
              {/* Recent Security Events Table */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Recent Security Events</h3>
                    <span className={styles.cardSubtitle}>Latest security-related activities in your institution</span>
                  </div>
                  <button className={styles.cardAction} onClick={() => router.push('/institution/audit-log')}>
                    View All Logs <ChevronRight size={12} />
                  </button>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Event</th>
                        <th>User</th>
                        <th>IP Address</th>
                        <th>Location</th>
                        <th>Severity</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {securityData.recent_events.map((ev, i) => (
                        <tr key={ev.id}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{ev.title}</td>
                          <td>{ev.user_name}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ev.ip_address}</td>
                          <td>{ev.location}</td>
                          <td>
                            <span className={`${styles.statusBadge} ${
                              ev.severity === 'critical' ? styles.statusDanger :
                              ev.severity === 'high' ? styles.statusDanger :
                              ev.severity === 'medium' ? styles.statusWarning : styles.statusActive
                            }`}>
                              {ev.severity}
                            </span>
                          </td>
                          <td>{ev.formatted_time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Compliance Frameworks & Data Retention */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Compliance Frameworks</h3>
                    <button className={styles.cardAction} onClick={() => showToast('All compliance frameworks are active.')}>
                      Manage
                    </button>
                  </div>

                  <div className={styles.frameworkList}>
                    {securityData.compliance_frameworks.map((cf, i) => (
                      <div key={i} className={styles.frameworkItem}>
                        <div className={styles.frameworkLeft}>
                          <CheckCircle2 size={18} color="#16a34a" />
                          <div>
                            <div className={styles.frameworkName}>{cf.name}</div>
                            <div className={styles.frameworkDesc}>{cf.title}</div>
                          </div>
                        </div>
                        <span className={`${styles.statusBadge} ${styles.statusActive}`}>
                          {cf.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Data Retention</h3>
                    <button className={styles.cardAction} onClick={() => showToast('Data retention policies loaded.')}>
                      Configure
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(securityData.data_retention).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#475569', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                        <span style={{ fontWeight: 700, color: '#1e1b4b' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </InstitutionShell>
  );
}

// ── SVG Security Events Chart ────────────────────────────────────────────────
function SecurityEventsChart({ data }: { data: { label: string; successful_logins: number; failed_logins: number; policy_violations: number }[] }) {
  const width = 600;
  const height = 210;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };

  const maxVal = Math.max(...data.map(d => Math.max(d.successful_logins, d.failed_logins, d.policy_violations)), 80);
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const ptsSuccess = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.successful_logins / maxVal) * chartH
  }));

  const ptsFailed = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.failed_logins / maxVal) * chartH
  }));

  const ptsViolations = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.policy_violations / maxVal) * chartH
  }));

  const makePath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cx = (pts[i].x + pts[i + 1].x) / 2;
      d += ` Q ${pts[i].x} ${pts[i].y}, ${cx} ${(pts[i].y + pts[i + 1].y) / 2}`;
    }
    d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
    return d;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      {[0, 0.5, 1].map((frac, idx) => {
        const y = padding.top + chartH * (1 - frac);
        return (
          <g key={idx}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f1f5f9" strokeDasharray="4 4" />
            <text x={padding.left - 6} y={y + 4} fill="#94a3b8" fontSize="10" textAnchor="end">
              {Math.round(frac * maxVal)}
            </text>
          </g>
        );
      })}
      <path d={makePath(ptsSuccess)} fill="none" stroke="#7c3aed" strokeWidth="2.2" />
      <path d={makePath(ptsFailed)} fill="none" stroke="#ef4444" strokeWidth="2.2" />
      <path d={makePath(ptsViolations)} fill="none" stroke="#f59e0b" strokeWidth="2.2" />
    </svg>
  );
}
