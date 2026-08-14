'use client';

import { useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import {
  FileText, Download, Users, BarChart3, Sparkles, Shield, Clock, Loader2, Activity
} from 'lucide-react';
import { adminService } from '@/services/admin.service';
import styles from './page.module.css';

type ReportId =
  | 'cross-institution'
  | 'sessions-trend'
  | 'groq-trend'
  | 'groq-usage'
  | 'overview'
  | 'audit-logs';

const REPORT_TYPES: {
  id: ReportId;
  Icon: React.ElementType;
  title: string;
  desc: string;
  bg: string;
}[] = [
  {
    id: 'cross-institution',
    Icon: Users,
    title: 'Cross-Institution Analytics',
    desc: 'Per-institution users, session counts and sessions-per-user across the whole platform.',
    bg: 'linear-gradient(135deg,#7c3aed,#9333ea)',
  },
  {
    id: 'sessions-trend',
    Icon: Activity,
    title: 'Sessions Trend (14 days)',
    desc: 'Daily lab session counts platform-wide for the last two weeks.',
    bg: 'linear-gradient(135deg,#ec4899,#d6409f)',
  },
  {
    id: 'groq-trend',
    Icon: Sparkles,
    title: 'AI (Groq) Usage Trend (7 days)',
    desc: 'Daily AI hint/feedback call counts across all institutions.',
    bg: 'linear-gradient(135deg,#f59e0b,#f2994a)',
  },
  {
    id: 'groq-usage',
    Icon: BarChart3,
    title: 'AI Usage by Institution (today)',
    desc: "Today's per-institution Groq call counts against the daily quota.",
    bg: 'linear-gradient(135deg,#9333ea,#d946ef)',
  },
  {
    id: 'overview',
    Icon: FileText,
    title: 'Platform Overview Summary (30 days)',
    desc: 'Total users, new users, session totals and active institutions — key/value summary.',
    bg: 'linear-gradient(135deg,#22c55e,#16a34a)',
  },
  {
    id: 'audit-logs',
    Icon: Shield,
    title: 'Audit Logs (7 days)',
    desc: 'Platform admin and system actions with actor, target and detail columns.',
    bg: 'linear-gradient(135deg,#64748b,#463f57)',
  },
];

// ── CSV helper ─────────────────────────────────────────────────────────────────
const csvEscape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const csv = [header, ...rows]
    .map((r) => r.map(csvEscape).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export default function ReportsPage() {
  const [generating, setGenerating] = useState<ReportId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    setError(null);
    setTimeout(() => setNotice(null), 4000);
  };

  const handleGenerate = async (id: ReportId) => {
    setGenerating(id);
    setError(null);
    try {
      switch (id) {
        case 'cross-institution': {
          const rows = await adminService.getCrossInstitutionAnalytics();
          downloadCsv(
            `cross_institution_analytics_${stamp()}.csv`,
            ['Institution', 'Plan', 'Users', 'Sessions', 'Sessions Per User'],
            rows.map((r) => [r.name, r.plan, r.users, r.sessions, r.sessions_per_user])
          );
          flash(`Cross-institution analytics exported (${rows.length} institutions).`);
          break;
        }
        case 'sessions-trend': {
          const trend = await adminService.getSessionsTrend(14);
          downloadCsv(
            `sessions_trend_14d_${stamp()}.csv`,
            ['Date', 'Sessions'],
            trend.map((t) => [t.date, t.sessions])
          );
          flash(`Sessions trend exported (${trend.length} days).`);
          break;
        }
        case 'groq-trend': {
          const trend = await adminService.getGroqTrend(7);
          downloadCsv(
            `groq_usage_trend_7d_${stamp()}.csv`,
            ['Date', 'AI Calls'],
            trend.map((t) => [t.date, t.total])
          );
          flash(`Groq usage trend exported (${trend.length} days).`);
          break;
        }
        case 'groq-usage': {
          const { usage } = await adminService.getGroqUsage();
          downloadCsv(
            `groq_usage_by_institution_${stamp()}.csv`,
            ['Institution ID', 'AI Calls Today'],
            usage.map((u) => [u.institution_id, u.count])
          );
          flash(`Today's per-institution AI usage exported (${usage.length} rows).`);
          break;
        }
        case 'overview': {
          const ov = await adminService.getAnalyticsOverview(30);
          downloadCsv(
            `platform_overview_30d_${stamp()}.csv`,
            ['Metric', 'Value'],
            [
              ['Period (days)', ov.period_days],
              ['Total Users', ov.total_users],
              ['New Users (period)', ov.new_users],
              ['Total Sessions', ov.total_sessions],
              ['Sessions In Period', ov.sessions_in_period],
              ['Active Institutions', ov.active_institutions],
            ]
          );
          flash('Platform overview summary exported.');
          break;
        }
        case 'audit-logs': {
          const { logs } = await adminService.getAuditLogs({ days: 7, page: 1 });
          downloadCsv(
            `audit_logs_7d_${stamp()}.csv`,
            ['Timestamp', 'Actor', 'Action', 'Target Type', 'Target ID', 'Detail'],
            logs.map((l) => [l.created_at, l.actor_name, l.action, l.target_type, l.target_id, l.detail])
          );
          flash(`Audit logs exported (${logs.length} entries, page 1).`);
          break;
        }
      }
    } catch {
      setError('Report generation failed — check that the backend is running and you have platform admin access.');
    } finally {
      setGenerating(null);
    }
  };

  return (
    <AdminShell
      activePage="Reports & Exports"
      title="Reports & Exports"
      subtitle="Generate CSV exports from live platform analytics — data is fetched at export time"
    >
      {notice && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#166534', fontSize: '13.5px', fontWeight: 600 }}>
          📊 {notice}
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#b91c1c', fontSize: '13.5px', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {/* ── Report Cards ──────────────────────────────────────────────── */}
      <div className={styles.reportGrid}>
        {REPORT_TYPES.map((r) => {
          const busy = generating === r.id;
          return (
            <div key={r.id} className={styles.reportCard}>
              <div className={styles.reportHeader}>
                <div className={styles.reportIcon} style={{ background: r.bg }}>
                  <r.Icon size={20} strokeWidth={1.9} color="#fff" />
                </div>
                <div>
                  <p className={styles.reportTitle}>{r.title}</p>
                  <p className={styles.reportDesc}>{r.desc}</p>
                </div>
              </div>
              <div className={styles.reportMeta}>
                <span className={styles.lastGen}>
                  <Clock size={12} strokeWidth={2} /> Live data · CSV format
                </span>
                <div className={styles.formatBtns}>
                  <span className={styles.formatBtn} style={{ cursor: 'default' }}>
                    <Download size={11} strokeWidth={2} /> CSV
                  </span>
                </div>
              </div>
              <button
                className={`${styles.generateBtn} ${busy ? styles.generating : ''}`}
                onClick={() => handleGenerate(r.id)}
                disabled={busy || generating !== null}
              >
                {busy ? (
                  <><Loader2 size={14} strokeWidth={2} className="spin" /> Generating…</>
                ) : (
                  <><FileText size={14} strokeWidth={2} /> Generate CSV</>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
