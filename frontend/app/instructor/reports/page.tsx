'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Table, Loader2, FileText, RefreshCw } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';
import { sessionService } from '@/services/session.service';
import { experienceService, type ReportRow } from '@/services/experience.service';

const REPORT_KINDS = [
  { value: 'gradebook',              label: 'Gradebook',              desc: 'All students × experiments, weighted finals + letter grade' },
  { value: 'session_summary',        label: 'Session Summary',        desc: 'Attendance, performance, focus & integrity per session' },
  { value: 'student_progress',       label: 'Student Progress',       desc: 'Per-student completion, grades & mastery' },
  { value: 'experiment_performance', label: 'Experiment Performance', desc: 'Avg final, attempts, completion per experiment' },
  { value: 'at_risk',                label: 'At-Risk',                desc: 'Students projected below the pass threshold' },
  { value: 'cross_section',          label: 'Cross-Section',          desc: 'Same experiment compared across your sections' },
  { value: 'viva_consolidated',      label: 'Viva Consolidated',      desc: 'Per-student viva grades + AI feedback' },
  { value: 'catch_up',               label: 'Catch-Up',               desc: 'Who used catch-up and their grade delta' },
];

interface SessionOption {
  id: string;
  experiment_title: string;
  section_name?: string | null;
  subject_name?: string | null;
  scheduled_at?: string | null;
  status?: string;
}

interface AttendanceRow {
  student_id: string;
  full_name: string;
  roll_number: string;
  email: string;
  status: string;
  joined_at?: string | null;
  is_catchup?: boolean;
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusBadge = (status: string) => {
  switch (status) {
    case 'present': return styles.greenBadge;
    case 'late': return styles.amberBadge;
    case 'absent': return styles.redBadge;
    default: return styles.slateBadge;
  }
};

export default function ReportsPage() {
  const [sessions, setSessions] = useState<SessionOption[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Async report generation (R2)
  const [reportKind, setReportKind] = useState('gradebook');
  // R5: student_progress has two audiences — internal (instructor, with
  // integrity columns) vs student (motivational, integrity excluded).
  const [audience, setAudience] = useState<'internal' | 'student'>('internal');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(true);

  const loadReports = useCallback(async () => {
    try { setReports(await experienceService.listReports()); }
    catch { /* ignore */ }
    finally { setReportsLoading(false); }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  const generateReport = async () => {
    setGenerating(true);
    try {
      const params: Record<string, string | undefined> = { session_id: sessionId || undefined };
      if (reportKind === 'student_progress') params.audience = audience;
      await experienceService.requestReport(reportKind, params);
      flash('Report generation started — it will appear below when ready.');
      await loadReports();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Report generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const downloadReport = async (id: string, fmt: 'csv' | 'xlsx' = 'csv') => {
    try { await experienceService.downloadReport(id, fmt); }
    catch (e: any) { setError(e?.response?.data?.error || 'Download failed.'); }
  };

  const reportStatusBadge = (status: string) => {
    if (status === 'ready') return styles.greenBadge;
    if (status === 'failed') return styles.redBadge;
    return styles.amberBadge;
  };

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const loadAttendance = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await sessionService.getAttendance(id);
      setAttendance(res.attendance || []);
    } catch {
      setError('Could not load attendance for this session.');
      setAttendance([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await sessionService.list();
        const list: SessionOption[] = res.sessions || [];
        setSessions(list);
        if (list.length > 0) {
          setSessionId(list[0].id);
          await loadAttendance(list[0].id);
        }
      } catch {
        setError('Could not load sessions.');
      } finally {
        setLoadingSessions(false);
      }
    })();
  }, [loadAttendance]);

  const selectedSession = useMemo(() => sessions.find((s) => s.id === sessionId), [sessions, sessionId]);

  const { present, late, absent, catchups } = useMemo(() => {
    let present = 0, late = 0, absent = 0, catchups = 0;
    for (const a of attendance) {
      if (a.status === 'present') present++;
      else if (a.status === 'late') late++;
      else if (a.status === 'absent') absent++;
      if (a.is_catchup) catchups++;
    }
    return { present, late, absent, catchups };
  }, [attendance]);

  const handleExportServerCsv = async () => {
    if (!sessionId) return;
    setExporting(true);
    try {
      await sessionService.exportAttendanceCsv(sessionId);
      flash('Attendance CSV downloaded from server.');
    } catch {
      setError('CSV export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportSummaryCsv = () => {
    if (attendance.length === 0) return;
    const header = ['Full Name', 'Roll Number', 'Email', 'Status', 'Catch-Up', 'Joined At'];
    const rows = attendance.map((a) => [
      a.full_name, a.roll_number, a.email, a.status,
      a.is_catchup ? 'yes' : 'no', a.joined_at ?? '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_report_${sessionId.slice(0, 8)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    flash('Session report CSV generated locally.');
  };

  return (
    <InstructorShell
      activePage="Reports"
      title="Class Reports & Gradebook Export"
      subtitle="Session attendance reports with server-side CSV export for department audits"
    >
      {/* ══ Analytics Reports (R1-R6) ════════════════════════════════════════ */}
      <div className={styles.sectionCard} style={{ marginBottom: 20 }}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Generate Analytics Reports</h2>
            <p className={styles.sectionSub}>Async CSV generation — status updates in the list below</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className={styles.select} value={reportKind} onChange={e => setReportKind(e.target.value)}
              style={{ width: 'auto', minWidth: 200 }}>
              {REPORT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            {reportKind === 'student_progress' && (
              <select className={styles.select} value={audience} onChange={e => setAudience(e.target.value as 'internal' | 'student')}
                style={{ width: 'auto' }}>
                <option value="internal">Internal (full detail)</option>
                <option value="student">Student (motivational)</option>
              </select>
            )}
            <button className={styles.primaryBtn} onClick={generateReport} disabled={generating}>
              {generating ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
              Generate
            </button>
          </div>
        </div>
        <p style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 14 }}>
          {REPORT_KINDS.find(k => k.value === reportKind)?.desc}
        </p>

        {/* Recent reports */}
        {reportsLoading ? (
          <div style={{ textAlign: 'center', color: '#9891a6', padding: 16 }}>
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : reports.length > 0 ? (
          <div className={styles.list}>
            {reports.slice(0, 10).map(r => (
              <div key={r.id} className={styles.listRow}>
                <div className={styles.rowBody}>
                  <div className={styles.rowTitle}>{r.kind}</div>
                  <div className={styles.rowMeta}>{r.created_at ?? '—'} · {r.status}</div>
                </div>
                <div className={styles.rowSide}>
                  <span className={`${styles.badge} ${reportStatusBadge(r.status)}`}>{r.status}</span>
                  {r.status === 'ready' && r.id && (
                    <>
                      <button className={styles.secondaryBtn} onClick={() => downloadReport(r.id)}
                        style={{ padding: '6px 12px', minHeight: 0, fontSize: 12 }}>
                        <Download size={12} /> CSV
                      </button>
                      <button className={styles.ghostBtn}
                        onClick={() => downloadReport(r.id, 'xlsx')}
                        style={{ padding: '6px 12px', minHeight: 0, fontSize: 12 }}
                        title="Excel export (requires openpyxl on the server)">
                        <Download size={12} /> XLSX
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: '#9891a6', fontSize: 13, padding: 8 }}>
            No reports yet. Pick a kind and click Generate.
          </div>
        )}
      </div>

      {/* Session Picker + Export */}
      <div className={styles.actionRow}>
        <div className={styles.formGroup} style={{ marginBottom: 0, minWidth: 'min(380px, 100%)', flex: 1 }}>
          <label className={styles.formLabel}>Session</label>
          <select
            className={styles.select}
            value={sessionId}
            onChange={(e) => {
              setSessionId(e.target.value);
              loadAttendance(e.target.value);
            }}
            disabled={loadingSessions}
          >
            {loadingSessions && <option>Loading sessions…</option>}
            {!loadingSessions && sessions.length === 0 && <option>No sessions yet</option>}
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.experiment_title}
                {s.section_name ? ` · ${s.section_name}` : ''} · {fmtDate(s.scheduled_at)}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignSelf: 'flex-end' }}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={handleExportServerCsv}
            disabled={!sessionId || exporting}
          >
            {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} strokeWidth={2} />} Export Attendance CSV
          </button>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={handleExportSummaryCsv}
            disabled={attendance.length === 0}
          >
            <Table size={16} strokeWidth={1.9} /> Session Report CSV
          </button>
        </div>
      </div>

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

      {/* KPI Cards */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Attendance Records</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>{attendance.length}</p>
          <p className={styles.kpiSub}>{selectedSession?.experiment_title ?? 'Select a session'}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Present</p>
          <p className={styles.kpiValue} style={{ color: '#16a34a' }}>{present}</p>
          <p className={styles.kpiSub}>{late} joined late</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Absent</p>
          <p className={styles.kpiValue} style={{ color: '#b91c1c' }}>{absent}</p>
          <p className={styles.kpiSub}>{catchups} catch-up attempt{catchups === 1 ? '' : 's'}</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Attendance Rate</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>
            {attendance.length === 0 ? '—' : `${Math.round(((present + late) / attendance.length) * 100)}%`}
          </p>
          <p className={styles.kpiSub}>Present + late / total</p>
        </div>
      </div>

      {/* Attendance Table */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Session Attendance Register</h2>
            <p className={styles.sectionSub}>Live data from the attendance ledger</p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#6b7280', fontSize: '13.5px', padding: '12px 4px' }}>
            <Loader2 size={18} className="spin" /> Loading attendance…
          </div>
        ) : attendance.length === 0 ? (
          <p style={{ color: '#9ca3af', fontSize: '13.5px', margin: 0 }}>
            No attendance records for this session yet — records appear once students join.
          </p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Student</th>
                <th>Roll No.</th>
                <th>Email</th>
                <th>Status</th>
                <th>Catch-Up</th>
                <th>Joined At</th>
              </tr>
            </thead>
            <tbody>
              {attendance.map((a) => (
                <tr key={a.student_id}>
                  <td><span className={styles.tdStrong}>{a.full_name}</span></td>
                  <td>{a.roll_number || '—'}</td>
                  <td>{a.email || '—'}</td>
                  <td><span className={`${styles.badge} ${statusBadge(a.status)}`}>{a.status}</span></td>
                  <td>{a.is_catchup ? 'Yes' : 'No'}</td>
                  <td>{fmtDateTime(a.joined_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </InstructorShell>
  );
}
