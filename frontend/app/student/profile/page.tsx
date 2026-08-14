'use client';

import { useEffect, useState } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import { useAuthStore } from '@/store/auth-store';
import { studentService } from '@/services/student.service';
import { authService } from '@/services/auth.service';
import type { StudentDashboard, SectionSubject } from '@/types';
import { Loader2 } from 'lucide-react';
import styles from './page.module.css';

const SUBJECT_COLORS = ['#9333ea', '#d946ef', '#f59e0b', '#ec4899', '#22c55e', '#c084fc'];

export default function ProfilePage() {
  const user = useAuthStore(s => s.user);

  const [dash, setDash] = useState<StudentDashboard | null>(null);
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [loading, setLoading] = useState(true);

  // Password change form
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    Promise.all([
      studentService.getDashboard(),
      studentService.getSubjects(),
    ])
      .then(([d, s]) => { setDash(d); setSubjects(s); })
      .catch(() => { /* stats are non-critical */ })
      .finally(() => setLoading(false));
  }, []);

  const changePassword = async () => {
    setPwMsg(null);
    if (pw.next.length < 8) {
      setPwMsg({ ok: false, text: 'New password must be at least 8 characters.' });
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwMsg({ ok: false, text: 'New password and confirmation do not match.' });
      return;
    }
    setPwBusy(true);
    try {
      await authService.changePassword(pw.current, pw.next);
      setPwMsg({ ok: true, text: 'Password updated successfully.' });
      setPw({ current: '', next: '', confirm: '' });
    } catch (e) {
      setPwMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed to change password' });
    } finally {
      setPwBusy(false);
    }
  };

  const initials = (user?.full_name || 'Student')
    .split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <StudentShell activePage="Profile" title="My Profile" subtitle="Manage your personal information and settings">
      <div className={styles.layout}>

        {/* Left: Avatar + Stats */}
        <div className={styles.leftCol}>
          <div className={styles.avatarCard}>
            <div className={styles.avatarCircle} style={{ background: 'linear-gradient(135deg,#9333ea,#d6409f)' }}>{initials}</div>
            <h2 className={styles.userName}>{user?.full_name || 'Student'}</h2>
            <p className={styles.userRole}>🎓 Student</p>
            <div className={styles.infoPills}>
              <span className={styles.pill}>{user?.email || '—'}</span>
            </div>
          </div>

          {/* Stats */}
          <div className={styles.statsCard}>
            <h3 className={styles.statsTitle}>My Stats</h3>
            {loading ? (
              <div className={styles.statRow}><Loader2 size={16} className={styles.spinner} /> Loading stats…</div>
            ) : (
              [
                { label: 'Subjects Enrolled', value: `${dash?.subjects_enrolled ?? 0}` },
                { label: 'Avg Grade',          value: dash?.avg_grade != null ? `${dash.avg_grade}%` : '—' },
                { label: 'Best Rank Score',    value: dash?.best_rank ? dash.best_rank.rank_score.toFixed(1) : '—' },
                { label: 'Total Submissions',  value: `${dash?.total_submissions ?? 0}` },
                { label: 'Hints Used Today',   value: `${dash?.hints_used_today ?? 0}` },
              ].map(s => (
                <div key={s.label} className={styles.statRow}>
                  <span className={styles.statLabel}>{s.label}</span>
                  <span className={styles.statValue}>{s.value}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Account info + Password */}
        <div className={styles.rightCol}>
          <div className={styles.formCard}>
            <div className={styles.formCardHeader}>
              <h3 className={styles.formCardTitle}>Account Information</h3>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Full Name</label>
                <p className={styles.fieldValue}>{user?.full_name || '—'}</p>
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Email</label>
                <p className={styles.fieldValue}>{user?.email || '—'}</p>
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Role</label>
                <p className={styles.fieldValue}>Student</p>
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Institution ID</label>
                <p className={styles.fieldValue}>{user?.institution_id || '—'}</p>
              </div>
            </div>
            <p className={styles.readOnlyNote}>Profile details are managed by your institution admin.</p>
          </div>

          {/* Change Password */}
          <div className={styles.formCard}>
            <div className={styles.formCardHeader}>
              <h3 className={styles.formCardTitle}>Change Password</h3>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Current Password</label>
                <input
                  type="password" className={styles.fieldInput} value={pw.current}
                  onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>New Password</label>
                <input
                  type="password" className={styles.fieldInput} value={pw.next}
                  onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
                />
              </div>
              <div className={`${styles.formField} ${styles.fieldFull}`}>
                <label className={styles.fieldLabel}>Confirm New Password</label>
                <input
                  type="password" className={styles.fieldInput} value={pw.confirm}
                  onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                />
              </div>
            </div>
            {pwMsg && (
              <p style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: pwMsg.ok ? '#16a34a' : '#dc2626' }}>
                {pwMsg.text}
              </p>
            )}
            <button
              className={styles.saveBtn}
              style={{ marginTop: 14 }}
              onClick={changePassword}
              disabled={pwBusy || !pw.current || !pw.next || !pw.confirm}
            >
              {pwBusy ? 'Updating…' : '🔑 Update Password'}
            </button>
          </div>

          {/* Enrolled Subjects */}
          <div className={styles.subjectsCard}>
            <h3 className={styles.formCardTitle}>Enrolled Subjects</h3>
            <div className={styles.subGrid}>
              {subjects.length === 0 ? (
                <p className={styles.fieldValue}>Not enrolled in any subjects yet.</p>
              ) : subjects.map((s, i) => (
                <div key={s.section_subject_id} className={styles.subChip}>
                  <div className={styles.subChipDot} style={{ background: SUBJECT_COLORS[i % SUBJECT_COLORS.length] }} />
                  <div>
                    <p className={styles.subChipCode}>{s.subject_code || '—'}</p>
                    <p className={styles.subChipName}>{s.subject_name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
