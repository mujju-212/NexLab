'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, Award, Download, X, Pencil, CheckCircle2,
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { sessionService } from '@/services/session.service';
import styles from '../shared.module.css';

interface SessionItem {
  id: string;
  status: 'scheduled' | 'active' | 'ended';
  experiment_title: string;
  section_name: string | null;
  subject_name: string | null;
  scheduled_at: string;
}

interface AttendanceRow {
  student_id: string;
  status: string;          // present | absent | late | partial | inactive_present
  joined_at: string | null;
  total_time_seconds: number;
  is_active_participant: boolean;
  override_reason: string | null;
  full_name: string;
  roll_number: string;
  email: string;
}

const STATUS_OPTIONS = ['present', 'absent', 'late', 'partial', 'inactive_present'];

const statusPill = (status: string) => {
  switch (status) {
    case 'present': return styles.pillGreen;
    case 'late': return styles.pillAmber;
    case 'partial': return styles.pillBlue;
    case 'inactive_present': return styles.pillBlue;
    default: return styles.pillSlate; // absent
  }
};

const errText = (err: unknown) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error
  || 'Something went wrong';

export default function StudentsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionId, setSessionId] = useState<string>('');
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<AttendanceRow | null>(null);
  const [overrideStatus, setOverrideStatus] = useState('present');
  const [overrideReason, setOverrideReason] = useState('');
  const [busy, setBusy] = useState(false);

  const toast3 = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  // ── Load sessions once ───────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await sessionService.list();
        const list = res.sessions ?? [];
        setSessions(list);
        if (list.length > 0 && !sessionId) {
          setSessionId(list[0].id);
        }
      } catch (err) {
        toast3(errText(err));
      }
    })();
  }, []);

  // ── Load attendance whenever a session is selected ───────────────────────────
  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;
    setLoading(true);
    (async () => {
      try {
        const [att, sum] = await Promise.all([
          sessionService.getAttendance(sessionId),
          sessionService.getAttendanceSummary(sessionId),
        ]);
        if (!mounted) return;
        setRows(att.attendance ?? []);
        setSummary(sum.breakdown ?? {});
      } catch (err) {
        if (mounted) toast3(errText(err));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [sessionId]);

  const filtered = rows.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchSearch = r.full_name.toLowerCase().includes(q) || r.roll_number.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleOverride = async () => {
    if (!overrideTarget || !sessionId) return;
    setBusy(true);
    try {
      await sessionService.overrideAttendance(
        sessionId, overrideTarget.student_id, overrideStatus,
        overrideReason || 'Manual override by instructor'
      );
      toast3('Attendance updated');
      setRows((prev) => prev.map((r) =>
        r.student_id === overrideTarget.student_id
          ? { ...r, status: overrideStatus, override_reason: overrideReason || 'Manual override by instructor' }
          : r
      ));
      setOverrideTarget(null);
      setOverrideReason('');
      // refresh summary
      const sum = await sessionService.getAttendanceSummary(sessionId);
      setSummary(sum.breakdown ?? {});
    } catch (err) {
      toast3(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (!sessionId) return;
    try {
      await sessionService.exportAttendanceCsv(sessionId);
    } catch {
      toast3('CSV export failed');
    }
  };

  return (
    <InstructorShell
      activePage="Student Management"
      title="Student Attendance Management"
      subtitle="Review per-session attendance, override statuses manually, and export records"
    >
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1000, background: '#201b2e',
          color: '#fff', padding: '12px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
        }}>
          {toast}
        </div>
      )}

      {/* Top Action Bar */}
      <div className={styles.actionRow}>
        <select
          className={styles.select}
          style={{ maxWidth: 380 }}
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
        >
          <option value="">Select a session to view attendance…</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.experiment_title} — {s.section_name ?? '—'} ({s.status})
            </option>
          ))}
        </select>
        <button type="button" className={styles.secondaryBtn} onClick={handleExport} disabled={!sessionId}>
          <Download size={16} /> Export CSV
        </button>
        <button type="button" className={styles.primaryBtn} onClick={() => router.push('/instructor/analytics')}>
          <Award size={16} strokeWidth={2} /> Class Analytics
        </button>
      </div>

      {!sessionId && (
        <section className={styles.sectionCard}>
          <p className={styles.sectionSub} style={{ padding: 8 }}>
            Pick a session above to see its attendance sheet. Sessions get attendance records when they start.
          </p>
        </section>
      )}

      {sessionId && (
        <>
          {/* Summary Chips */}
          <div className={styles.tabRow}>
            <button type="button"
              className={`${styles.tabChip} ${statusFilter === 'All' ? styles.tabChipActive : ''}`}
              onClick={() => setStatusFilter('All')}>
              All ({rows.length})
            </button>
            {STATUS_OPTIONS.map((st) => (
              <button key={st} type="button"
                className={`${styles.tabChip} ${statusFilter === st ? styles.tabChipActive : ''}`}
                onClick={() => setStatusFilter(st)}>
                {st.replace('_', ' ')} ({summary[st] ?? 0})
              </button>
            ))}
          </div>

          {/* Search */}
          <div style={{ position: 'relative', maxWidth: 320, margin: '0 0 16px' }}>
            <input
              type="text"
              className={styles.input}
              style={{ width: '100%', paddingLeft: 34 }}
              placeholder="Search name or roll number…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Search size={15} style={{ position: 'absolute', left: 12, top: 13, color: '#9891a6' }} />
          </div>

          {/* Attendance Table */}
          <section className={styles.tableCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Attendance Sheet</h2>
                <p className={styles.sectionSub}>
                  {loading ? 'Loading…' : `${rows.length} students · auto-finalized at session end, overridable anytime`}
                </p>
              </div>
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Roll Number</th>
                  <th>Status</th>
                  <th>Joined At</th>
                  <th>Time in Lab</th>
                  <th>Override</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.student_id}>
                    <td className={styles.tdStrong}>{r.full_name}</td>
                    <td>{r.roll_number || '—'}</td>
                    <td>
                      <span className={`${styles.pill} ${statusPill(r.status)}`}>
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {r.joined_at
                        ? new Date(r.joined_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td>{Math.round((r.total_time_seconds || 0) / 60)} min</td>
                    <td style={{ fontSize: 12, color: '#64748b', maxWidth: 180 }}>
                      {r.override_reason || '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        style={{ minHeight: 30, padding: '0 10px', fontSize: 11.5 }}
                        onClick={() => {
                          setOverrideTarget(r);
                          setOverrideStatus(r.status);
                          setOverrideReason('');
                        }}
                      >
                        <Pencil size={12} /> Override
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: '#9891a6', padding: 20 }}>
                      No attendance records match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}

      {/* OVERRIDE MODAL */}
      {overrideTarget && (
        <div className={styles.modalOverlay} onClick={() => setOverrideTarget(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Override Attendance</h3>
                <p className={styles.sectionSub}>
                  {overrideTarget.full_name} · {overrideTarget.roll_number}
                </p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setOverrideTarget(null)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>New Status</label>
              <select className={styles.select} value={overrideStatus}
                onChange={(e) => setOverrideStatus(e.target.value)}>
                {STATUS_OPTIONS.map((st) => (
                  <option key={st} value={st}>{st.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Reason</label>
              <textarea
                className={styles.textarea}
                rows={3}
                placeholder="e.g. Internet disconnected mid-session"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setOverrideTarget(null)}>
                Cancel
              </button>
              <button type="button" className={styles.primaryBtn} disabled={busy} onClick={handleOverride}>
                <CheckCircle2 size={15} /> {busy ? 'Saving…' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
