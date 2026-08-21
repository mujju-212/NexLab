'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import IndividualShell from '@/components/layout/IndividualShell';
import { useAuthStore } from '@/store/auth-store';
import { authService } from '@/services/auth.service';
import { freeService } from '@/services/free.service';
import styles from './profile.module.css';
import {
  User, Mail, Phone, Lock, Save, LogOut,
  Zap, CheckCircle2, Eye, EyeOff,
  Target, TrendingUp, AlertCircle
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const { user, setUser, clearAuth, isAuthenticated } = useAuthStore();

  // Profile form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Stats
  const [stats, setStats] = useState<{ total_xp: number; total_solved: number; total_attempted: number } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) { router.replace('/login'); }
  }, [isAuthenticated, user, router]);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name ?? '');
      setEmail(user.email ?? '');
      setPhone('');
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      freeService.getProgress().then(p => {
        const attempted = p.records.filter(r => r.status === 'attempted').length;
        setStats({ total_xp: p.total_xp, total_solved: p.total_solved, total_attempted: attempted });
      }).catch(() => {});
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const { data } = await (await import('@/services/api-client')).apiClient.patch('/auth/profile', {
        full_name: fullName,
        email,
        phone: phone || undefined,
      });
      setUser(data.user);
      setSaveMsg({ type: 'success', text: 'Profile updated successfully!' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to update profile.';
      setSaveMsg({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw !== confirmPw) { setPwMsg({ type: 'error', text: 'New passwords do not match.' }); return; }
    if (newPw.length < 8) { setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return; }
    setPwSaving(true);
    setPwMsg(null);
    try {
      await authService.changePassword(currentPw, newPw);
      setPwMsg({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to change password.';
      setPwMsg({ type: 'error', text: msg });
    } finally {
      setPwSaving(false);
    }
  };

  const handleLogout = async () => {
    await authService.logout();
    clearAuth();
    router.push('/login');
  };

  if (!isAuthenticated || !user) return null;

  const initials = user.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <IndividualShell activePage="profile" title="Profile" subtitle="Manage your account details and view your stats.">
      {/* Hero */}
      <div className={styles.profileHero}>
        <div className={styles.heroAvatar}>{initials}</div>
        <div className={styles.heroInfo}>
          <h1 className={styles.heroName}>{user.full_name}</h1>
          <p className={styles.heroEmail}>{user.email}</p>
          <span className={styles.roleBadge}>
            {user.role === 'free_user' ? '🆓 Free User' : user.role}
          </span>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className={styles.statsRow}>
          {[
            { icon: <Zap size={15} />, val: stats.total_xp, label: 'Total XP', color: '#f59e0b' },
            { icon: <CheckCircle2 size={15} />, val: stats.total_solved, label: 'Solved', color: '#22c55e' },
            { icon: <Target size={15} />, val: stats.total_attempted, label: 'Attempted', color: '#7c3aed' },
            { icon: <TrendingUp size={15} />, val: stats.total_solved + stats.total_attempted, label: 'Total Submissions', color: '#3b82f6' },
          ].map(s => (
            <div key={s.label} className={styles.statCard}>
              <div className={styles.statIcon} style={{ color: s.color, background: s.color + '18' }}>{s.icon}</div>
              <div>
                <div className={styles.statVal}>{s.val}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.formsGrid}>
        {/* Profile Form */}
        <div className={styles.formCard}>
          <div className={styles.formCardHeader}>
            <User size={16} />
            <h2>Personal Information</h2>
          </div>
          <form onSubmit={handleSaveProfile} className={styles.form}>
            <div className={styles.field}>
              <label>Full Name</label>
              <div className={styles.inputWrap}>
                <User size={14} className={styles.inputIcon} />
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Your full name"
                  required
                />
              </div>
            </div>
            <div className={styles.field}>
              <label>Email Address</label>
              <div className={styles.inputWrap}>
                <Mail size={14} className={styles.inputIcon} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />
              </div>
            </div>
            <div className={styles.field}>
              <label>Phone <span className={styles.optional}>(optional)</span></label>
              <div className={styles.inputWrap}>
                <Phone size={14} className={styles.inputIcon} />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+91 9876543210"
                />
              </div>
            </div>
            {saveMsg && (
              <div className={`${styles.msg} ${saveMsg.type === 'success' ? styles.msgSuccess : styles.msgError}`}>
                {saveMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {saveMsg.text}
              </div>
            )}
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              <Save size={14} />
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>

        {/* Password Form */}
        <div className={styles.formCard}>
          <div className={styles.formCardHeader}>
            <Lock size={16} />
            <h2>Change Password</h2>
          </div>
          <form onSubmit={handleChangePassword} className={styles.form}>
            <div className={styles.field}>
              <label>Current Password</label>
              <div className={styles.inputWrap}>
                <Lock size={14} className={styles.inputIcon} />
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  placeholder="Enter current password"
                  required
                />
                <button type="button" className={styles.eyeBtn} onClick={() => setShowCurrent(v => !v)}>
                  {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className={styles.field}>
              <label>New Password</label>
              <div className={styles.inputWrap}>
                <Lock size={14} className={styles.inputIcon} />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPw}
                  onChange={e => setNewPw(e.target.value)}
                  placeholder="Min 8 chars, uppercase + number"
                  required
                />
                <button type="button" className={styles.eyeBtn} onClick={() => setShowNew(v => !v)}>
                  {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div className={styles.field}>
              <label>Confirm New Password</label>
              <div className={styles.inputWrap}>
                <Lock size={14} className={styles.inputIcon} />
                <input
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Repeat new password"
                  required
                />
              </div>
            </div>
            {pwMsg && (
              <div className={`${styles.msg} ${pwMsg.type === 'success' ? styles.msgSuccess : styles.msgError}`}>
                {pwMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                {pwMsg.text}
              </div>
            )}
            <button type="submit" className={styles.saveBtn} disabled={pwSaving}>
              <Lock size={14} />
              {pwSaving ? 'Updating…' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>

      {/* Danger Zone */}
      <div className={styles.dangerZone}>
        <div className={styles.dangerHeader}>
          <AlertCircle size={15} />
          <span>Account Actions</span>
        </div>
        <button className={styles.logoutFullBtn} onClick={handleLogout}>
          <LogOut size={14} /> Sign Out of NexLab
        </button>
      </div>
    </IndividualShell>
  );
}
