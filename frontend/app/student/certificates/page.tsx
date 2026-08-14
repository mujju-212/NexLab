'use client';

import { useEffect, useState } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { Notification, SectionSubject } from '@/types';
import { Loader2 } from 'lucide-react';
import styles from './page.module.css';

interface HistoryRow {
  experiment_id: string;
  experiment_title: string;
  concept_tags: string[];
  last_attempt: string | null;
  total_attempts: number;
  best_tests_passed: number | null;
  tests_total: number | null;
  grade: number | null;
}

const NOTIF_ICONS: Record<string, string> = {
  session_reminder: '🗓',
  grade_published: '📊',
  alert: '⚠️',
  announcement: '📣',
  catchup_available: '⏰',
};

const gradeLetter = (pct: number) => (pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : 'C');

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

export default function CertificatesPage() {
  const [activeTab, setActiveTab] = useState<'certs' | 'notifs'>('certs');
  const [certs, setCerts] = useState<HistoryRow[]>([]);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Lab record download state
  const [recordSubject, setRecordSubject] = useState('');
  const [recordBusy, setRecordBusy] = useState(false);
  const [recordMsg, setRecordMsg] = useState('');

  useEffect(() => {
    Promise.all([
      studentService.getHistory(),
      studentService.getNotifications(),
      studentService.getSubjects(),
    ])
      .then(([h, n, s]) => {
        setCerts((h as HistoryRow[]).filter(r => r.grade != null));
        setNotifs(n);
        setSubjects(s);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  const downloadRecord = async () => {
    if (!recordSubject) return;
    setRecordBusy(true);
    setRecordMsg('');
    try {
      const url = await studentService.getLabRecordUrl(recordSubject);
      window.open(url, '_blank');
      setRecordMsg('✅ Lab record PDF generated — opened in a new tab.');
    } catch (e) {
      setRecordMsg(`⚠️ ${e instanceof Error ? e.message : 'Failed to generate lab record'}`);
    } finally {
      setRecordBusy(false);
    }
  };

  if (loading) {
    return (
      <StudentShell activePage="Certificates & Notifications" title="Certificates & Notifications" subtitle="Your achievements and lab session updates">
        <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading…</div>
      </StudentShell>
    );
  }

  return (
    <StudentShell activePage="Certificates & Notifications" title="Certificates & Notifications" subtitle="Your achievements and lab session updates">
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === 'certs' ? styles.tabActive : ''}`} onClick={() => setActiveTab('certs')}>
          🏆 Certificates ({certs.length})
        </button>
        <button className={`${styles.tab} ${activeTab === 'notifs' ? styles.tabActive : ''}`} onClick={() => setActiveTab('notifs')}>
          🔔 Notifications ({notifs.length})
        </button>
      </div>

      {activeTab === 'certs' && (
        <>
          <div className={styles.certGrid}>
            {certs.map(c => {
              const pct = Math.round(c.grade ?? 0);
              return (
                <div key={c.experiment_id} className={styles.certCard}>
                  <div className={styles.certBanner} style={{ background: pct >= 90 ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#9333ea,#7c3aed)' }}>
                    <div className={styles.certSeal}>🏅</div>
                    <p className={styles.certTitle}>Certificate of Completion</p>
                    <p className={styles.certSub}>AI Virtual Laboratory</p>
                  </div>
                  <div className={styles.certBody}>
                    <p className={styles.certExp}>{c.experiment_title}</p>
                    <div className={styles.certMeta}>
                      <span>🧪 {c.best_tests_passed != null && c.tests_total ? `${c.best_tests_passed}/${c.tests_total} tests passed` : 'Graded'}</span>
                      <span>📅 {fmtDate(c.last_attempt)}</span>
                    </div>
                    <div className={styles.certScore}>
                      <span className={styles.scoreVal}>{pct}/100</span>
                      <span className={styles.gradeBadge}>{gradeLetter(pct)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            {certs.length === 0 && (
              <div className={styles.emptyState}>
                <div style={{ fontSize: 48 }}>🏆</div>
                <h3>No certificates yet</h3>
                <p>Complete experiments and get graded to earn certificates</p>
              </div>
            )}
          </div>

          {/* Full lab record PDF */}
          <div className={styles.recordCard}>
            <h3 className={styles.recordTitle}>📕 Full Lab Record PDF</h3>
            <p className={styles.recordSub}>Download a consolidated PDF of all your completed lab work for a subject.</p>
            <div className={styles.recordRow}>
              <select
                className={styles.recordSelect}
                value={recordSubject}
                onChange={e => setRecordSubject(e.target.value)}
              >
                <option value="">Select a subject…</option>
                {subjects.map(s => (
                  <option key={s.section_subject_id} value={s.subject_id}>{s.subject_name} ({s.subject_code})</option>
                ))}
              </select>
              <button className={styles.downloadBtn} onClick={downloadRecord} disabled={!recordSubject || recordBusy}>
                {recordBusy ? <Loader2 size={14} className={styles.spinner} /> : '⬇'} Generate PDF
              </button>
            </div>
            {recordMsg && <p className={styles.recordMsg}>{recordMsg}</p>}
          </div>
        </>
      )}

      {activeTab === 'notifs' && (
        <div className={styles.notifList}>
          {notifs.length === 0 && (
            <div className={styles.emptyState}>
              <div style={{ fontSize: 48 }}>🔔</div>
              <h3>No notifications</h3>
              <p>Session reminders and grade updates will appear here</p>
            </div>
          )}
          {notifs.map(n => (
            <div key={n.id} className={`${styles.notifCard} ${!n.is_read ? styles.notifUnread : ''}`}>
              <div className={styles.notifIcon}>{NOTIF_ICONS[n.type] || '🔔'}</div>
              <div className={styles.notifContent}>
                <p className={styles.notifMsg}>{n.title}</p>
                {n.message && <p className={styles.notifTime}>{n.message}</p>}
                <p className={styles.notifTime}>{fmtDate(n.created_at)}</p>
              </div>
              {!n.is_read && <span className={styles.unreadDot} />}
            </div>
          ))}
        </div>
      )}
    </StudentShell>
  );
}
