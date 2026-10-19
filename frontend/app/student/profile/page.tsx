'use client';

import { useEffect, useState } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import { useAuthStore } from '@/store/auth-store';
import { studentService } from '@/services/student.service';
import { authService } from '@/services/auth.service';
import { freeService, type FreeAnalyticsOverview } from '@/services/free.service';
import type { StudentDashboard, SectionSubject } from '@/types';
import {
  Loader2,
  Building2,
  GraduationCap,
  BookOpen,
  Trophy,
  Flame,
  CheckCircle2,
  Lock,
  User as UserIcon,
  Phone,
  MapPin,
  FileText,
  Save,
  Globe,
  Github,
  Linkedin
} from 'lucide-react';
import styles from './page.module.css';

const SUBJECT_COLORS = ['#9333ea', '#d946ef', '#f59e0b', '#ec4899', '#22c55e', '#06b6d4'];

export default function ProfilePage() {
  const storeUser = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);

  const [dash, setDash] = useState<StudentDashboard | null>(null);
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [freeOverview, setFreeOverview] = useState<FreeAnalyticsOverview | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile Edit State
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Password change form
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    // Load fresh user data from /auth/me to guarantee resolved institution & section names
    authService.getMe()
      .then(freshUser => {
        setUser(freshUser);
        setBio(freshUser.bio || '');
        setPhone(freshUser.phone || '');
        setLocation(freshUser.location || 'Bengaluru, Karnataka');
      })
      .catch(() => {
        if (storeUser) {
          setBio(storeUser.bio || '');
          setPhone(storeUser.phone || '');
          setLocation(storeUser.location || 'Bengaluru, Karnataka');
        }
      });

    // Load dev links from localStorage for personalized student presence
    if (typeof window !== 'undefined') {
      setGithubUrl(localStorage.getItem('student_github') || '');
      setLinkedinUrl(localStorage.getItem('student_linkedin') || '');
    }

    Promise.allSettled([
      studentService.getDashboard(),
      studentService.getSubjects(),
      freeService.getFreeOverview(),
    ])
      .then(([dRes, sRes, fRes]) => {
        if (dRes.status === 'fulfilled') setDash(dRes.value);
        if (sRes.status === 'fulfilled') setSubjects(sRes.value);
        if (fRes.status === 'fulfilled') setFreeOverview(fRes.value);
      })
      .finally(() => setLoading(false));
  }, [setUser]);

  const saveProfile = async () => {
    setProfileBusyState(true);
    setProfileMsg(null);
    try {
      const updated = await authService.updateProfile({
        bio,
        phone,
        location,
      });
      setUser(updated);
      if (typeof window !== 'undefined') {
        localStorage.setItem('student_github', githubUrl);
        localStorage.setItem('student_linkedin', linkedinUrl);
      }
      setProfileMsg({ ok: true, text: 'Profile preferences updated successfully.' });
    } catch (e) {
      setProfileMsg({ ok: false, text: e instanceof Error ? e.message : 'Failed to update profile.' });
    } finally {
      setProfileBusyState(false);
    }
  };

  const setProfileBusyState = (val: boolean) => setProfileSaving(val);

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

  const rawName = String(storeUser?.full_name || (storeUser as any)?.name || 'Student');
  const initials = rawName
    .split(' ')
    .filter(Boolean)
    .map((p: string) => p.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'ST';

  const institutionDisplay = storeUser?.institution_name || (storeUser?.institution_id ? 'Institution Affiliated' : 'Independent Scholar');
  const departmentDisplay = storeUser?.department_name || (storeUser?.department_code ? `Dept. of ${storeUser.department_code}` : 'Engineering & Technology');
  const sectionDisplay = storeUser?.section_name ? `Section ${storeUser.section_name}` : null;
  const programDisplay = storeUser?.program || storeUser?.batch_name;

  return (
    <StudentShell activePage="Profile" title="My Profile" subtitle="Academic credentials, dual-track mastery snapshot, and account settings">
      <div className={styles.layout}>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* LEFT COLUMN: Identity & Quick Snapshot                               */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <div className={styles.leftCol}>
          {/* Identity Card */}
          <div className={styles.avatarCard}>
            <div className={styles.avatarCircle} style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }}>
              {initials}
            </div>
            <h2 className={styles.userName}>{storeUser?.full_name || 'Student'}</h2>
            <p className={styles.userRole}>
              <GraduationCap size={14} style={{ display: 'inline', marginRight: 4 }} />
              Enrolled Student
            </p>

            <div className={styles.badgeRow}>
              {storeUser?.roll_number && (
                <span className={styles.rollTag} title="Roll Number / USN">
                  {storeUser.roll_number}
                </span>
              )}
              {sectionDisplay && (
                <span className={styles.instTag}>
                  {sectionDisplay}
                </span>
              )}
            </div>

            <div className={styles.infoPills} style={{ marginTop: 14 }}>
              <span className={styles.pill} title="Email Address">
                ✉️ {storeUser?.email || '—'}
              </span>
              <span className={styles.pill} title="Institution">
                🏫 {institutionDisplay}
              </span>
              <span className={styles.pill} title="Academic Department">
                🔬 {departmentDisplay}
              </span>
              {programDisplay && (
                <span className={styles.pill} title="Program / Batch">
                  🎓 {programDisplay}
                </span>
              )}
            </div>
          </div>

          {/* Quick Academic Attendance & Streak Card */}
          <div className={styles.statsCard}>
            <h3 className={styles.statsTitle}>
              <Flame size={16} style={{ display: 'inline', marginRight: 6, color: '#f59e0b' }} />
              Active Engagement
            </h3>
            {loading ? (
              <div className={styles.statRow}><Loader2 size={16} className={styles.spinner} /> Loading snapshot…</div>
            ) : (
              <>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Daily Activity Streak</span>
                  <span className={styles.statValue} style={{ color: '#f59e0b' }}>
                    🔥 {dash?.daily_streak ?? 1} Days
                  </span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Total Code Submissions</span>
                  <span className={styles.statValue}>{dash?.total_submissions ?? 0}</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Lab Completion Progress</span>
                  <span className={styles.statValue} style={{ color: '#7c3aed' }}>
                    {dash?.overall_progress ?? 0}%
                  </span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Assistance Hints Used</span>
                  <span className={styles.statValue}>{dash?.hints_used_today ?? 0} today</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* RIGHT COLUMN: Dual Track Metrics, Profile Customization & Security   */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        <div className={styles.rightCol}>

          {/* Dual-Track Snapshot Grid */}
          <div className={styles.dualMetricGrid}>
            {/* Academic Ladder Metric Box */}
            <div className={styles.metricBoxAcademic}>
              <div className={styles.metricHeader}>
                <h4 className={styles.metricTrackTitle}>📕 Academic Track</h4>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#fff', padding: '2px 8px', borderRadius: 999 }}>
                  Curricular
                </span>
              </div>
              <div className={styles.metricItems}>
                <div className={styles.metricItem}>
                  <p className={styles.metricVal}>
                    {dash?.avg_grade != null ? `${dash.avg_grade}%` : '—'}
                  </p>
                  <p className={styles.metricLbl}>Average Lab Grade</p>
                </div>
                <div className={styles.metricItem}>
                  <p className={styles.metricVal}>
                    {dash?.best_rank?.rank_position ? `#${dash.best_rank.rank_position}` : 'Top Tier'}
                  </p>
                  <p className={styles.metricLbl}>Cohort Rank</p>
                </div>
                <div className={styles.metricItem}>
                  <p className={styles.metricVal}>
                    {subjects.length}
                  </p>
                  <p className={styles.metricLbl}>Enrolled Subjects</p>
                </div>
                <div className={styles.metricItem}>
                  <p className={styles.metricVal}>
                    {dash?.top_concepts ? dash.top_concepts.length : 0}
                  </p>
                  <p className={styles.metricLbl}>Mastered Concepts</p>
                </div>
              </div>
            </div>

            {/* Competitive Platform Track Metric Box */}
            <div className={styles.metricBoxPlatform}>
              <div className={styles.metricHeader}>
                <h4 className={styles.metricTrackTitle} style={{ color: '#92400e' }}>🏆 Platform Track</h4>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', background: '#fff', padding: '2px 8px', borderRadius: 999 }}>
                  Global Ladder
                </span>
              </div>
              <div className={styles.metricItems}>
                <div className={styles.metricItem}>
                  <p className={styles.metricVal} style={{ color: '#b45309' }}>
                    {freeOverview?.standing?.rating ?? 1200}
                  </p>
                  <p className={styles.metricLbl}>Elo Rating</p>
                </div>
                <div className={styles.metricItem}>
                  <p className={styles.metricVal} style={{ color: '#b45309' }}>
                    {freeOverview?.standing?.problems_solved ?? (dash?.total_submissions ?? 0)}
                  </p>
                  <p className={styles.metricLbl}>Problems Solved</p>
                </div>
                <div className={styles.metricItem}>
                  <p className={styles.metricVal} style={{ color: '#b45309' }}>
                    Level {freeOverview?.standing?.level ?? 1}
                  </p>
                  <p className={styles.metricLbl}>Competency Rank</p>
                </div>
                <div className={styles.metricItem}>
                  <p className={styles.metricVal} style={{ color: '#b45309' }}>
                    {freeOverview?.course_summary?.completed_courses ?? 0}
                  </p>
                  <p className={styles.metricLbl}>Certificates Earned</p>
                </div>
              </div>
            </div>
          </div>

          {/* Profile Customization Form */}
          <div className={styles.formCard}>
            <div className={styles.formCardHeader}>
              <div>
                <h3 className={styles.formCardTitle}>Student Profile & Developer Presence</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Personalize your developer bio, contact details, and external portfolio links.
                </p>
              </div>
              <button
                className={styles.saveBtn}
                onClick={saveProfile}
                disabled={profileSaving}
              >
                {profileSaving ? <Loader2 size={15} className={styles.spinner} /> : <Save size={15} style={{ display: 'inline', marginRight: 6 }} />}
                Save Profile
              </button>
            </div>

            {profileMsg && (
              <div className={profileMsg.ok ? styles.successBanner : styles.errorBox}>
                {profileMsg.ok ? <CheckCircle2 size={16} /> : null}
                <span>{profileMsg.text}</span>
              </div>
            )}

            <div className={styles.formGrid}>
              <div className={`${styles.formField} ${styles.fieldFull}`}>
                <label className={styles.fieldLabel}>
                  <FileText size={13} style={{ display: 'inline', marginRight: 4 }} />
                  Bio & Research Interests
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  rows={3}
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                  placeholder="e.g. Computer Science student passionate about Operating Systems, Algorithm Design, and Distributed Cloud Computing..."
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>
                  <Phone size={13} style={{ display: 'inline', marginRight: 4 }} />
                  Contact Phone
                </label>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>
                  <MapPin size={13} style={{ display: 'inline', marginRight: 4 }} />
                  Location / Campus
                </label>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="Bengaluru, Karnataka"
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>
                  <Github size={13} style={{ display: 'inline', marginRight: 4 }} />
                  GitHub Username / Profile URL
                </label>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={githubUrl}
                  onChange={e => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/username"
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.fieldLabel}>
                  <Linkedin size={13} style={{ display: 'inline', marginRight: 4 }} />
                  LinkedIn Profile URL
                </label>
                <input
                  type="text"
                  className={styles.fieldInput}
                  value={linkedinUrl}
                  onChange={e => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                />
              </div>
            </div>
          </div>

          {/* Enrolled Laboratory Subjects */}
          <div className={styles.subjectsCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className={styles.formCardTitle}>Enrolled Laboratory Subjects ({subjects.length})</h3>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Curricular Roster</span>
            </div>
            <div className={styles.subGrid}>
              {subjects.length === 0 ? (
                <p className={styles.fieldValue}>Not enrolled in any subjects yet.</p>
              ) : subjects.map((s, i) => (
                <div key={s.section_subject_id} className={styles.subChip}>
                  <div className={styles.subChipDot} style={{ background: SUBJECT_COLORS[i % SUBJECT_COLORS.length] }} />
                  <div>
                    <p className={styles.subChipCode}>{s.subject_code || 'LAB'}</p>
                    <p className={styles.subChipName}>{s.subject_name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Account Security (Change Password) */}
          <div className={styles.formCard}>
            <div className={styles.formCardHeader}>
              <div>
                <h3 className={styles.formCardTitle}>Account Security</h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Keep your institutional account secure by choosing a strong password (minimum 8 characters).
                </p>
              </div>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>Current Password</label>
                <input
                  type="password"
                  className={styles.fieldInput}
                  value={pw.current}
                  onChange={e => setPw(p => ({ ...p, current: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>
              <div className={styles.formField}>
                <label className={styles.fieldLabel}>New Password</label>
                <input
                  type="password"
                  className={styles.fieldInput}
                  value={pw.next}
                  onChange={e => setPw(p => ({ ...p, next: e.target.value }))}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className={`${styles.formField} ${styles.fieldFull}`}>
                <label className={styles.fieldLabel}>Confirm New Password</label>
                <input
                  type="password"
                  className={styles.fieldInput}
                  value={pw.confirm}
                  onChange={e => setPw(p => ({ ...p, confirm: e.target.value }))}
                  placeholder="Repeat new password"
                />
              </div>
            </div>
            {pwMsg && (
              <p style={{ marginTop: 12, fontSize: 13, fontWeight: 600, color: pwMsg.ok ? '#16a34a' : '#dc2626' }}>
                {pwMsg.text}
              </p>
            )}
            <button
              className={styles.saveBtn}
              style={{ marginTop: 14 }}
              onClick={changePassword}
              disabled={pwBusy || !pw.current || !pw.next || !pw.confirm}
            >
              {pwBusy ? <Loader2 size={14} className={styles.spinner} /> : <Lock size={14} style={{ display: 'inline', marginRight: 6 }} />}
              Update Password
            </button>
          </div>

        </div>
      </div>
    </StudentShell>
  );
}
