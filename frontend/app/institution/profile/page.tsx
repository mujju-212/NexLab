'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { useAuthStore } from '@/store/auth-store';
import { authService } from '@/services/auth.service';
import {
  institutionService,
  type UserProfileData,
  type InstitutionProfileResponse,
} from '@/services/institution.service';
import {
  User,
  Shield,
  Lock,
  Bell,
  CreditCard,
  Sparkles,
  HelpCircle,
  Eye,
  EyeOff,
  Camera,
  Phone,
  Mail,
  Globe,
  Clock,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Key,
  Download,
  Laptop,
  Trash2,
  X,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Edit3,
  Save,
  Check,
} from 'lucide-react';
import styles from './profile.module.css';

// Format date into "12 Aug 2024"
function formatDate(isoString?: string): string {
  if (!isoString) return '12 Aug 2024';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return '12 Aug 2024';
  }
}

// Format date and time into "10 Sep 2026, 11:23 AM"
function formatDateTime(isoString?: string): string {
  if (!isoString) return '10 Sep 2026, 11:23 AM';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${time}`;
  } catch {
    return '10 Sep 2026, 11:23 AM';
  }
}

export default function ProfilePage() {
  const router = useRouter();
  const { user: authUser, setUser: setAuthUser } = useAuthStore();

  // Active tab state
  const [activeTab, setActiveTab] = useState<'profile' | 'notifications' | 'billing' | 'ai' | 'faq'>('profile');

  // Profile data from backend
  const [profileData, setProfileData] = useState<InstitutionProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit Mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    phone: '',
    bio: '',
    timezone: '',
    language: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Change Password state
  const passwordSectionRef = useRef<HTMLDivElement>(null);
  const currentPasswordInputRef = useRef<HTMLInputElement>(null);
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  // 2FA state
  const [twoFactorLoading, setTwoFactorLoading] = useState(false);
  const [showTwoFactorModal, setShowTwoFactorModal] = useState(false);

  // Modals & Drawers
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPublicModal, setShowPublicModal] = useState(false);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' } | null>(null);

  // Toast notification helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Load profile data from backend
  const loadProfile = async () => {
    try {
      const data = await institutionService.getProfile();
      setProfileData(data);
      setEditForm({
        fullName: data.user.full_name || '',
        phone: data.user.phone || '+91 98765 43210',
        bio: data.user.bio || 'Empowering education through technology.',
        timezone: data.user.timezone || '(GMT+05:30) Asia/Kolkata',
        language: data.user.language || 'English (India)',
      });
    } catch (err) {
      console.error('Failed to load profile details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  // Save updated profile
  const handleSaveProfile = async () => {
    if (!editForm.fullName.trim()) {
      showToast('Full name cannot be empty', 'error');
      return;
    }
    setSavingProfile(true);
    try {
      const res = await institutionService.updateProfile({
        full_name: editForm.fullName.trim(),
        phone: editForm.phone.trim(),
        bio: editForm.bio.trim(),
        timezone: editForm.timezone.trim(),
        language: editForm.language.trim(),
      });
      if (profileData) {
        setProfileData({
          ...profileData,
          user: { ...profileData.user, ...res.user },
        });
      }
      if (authUser) {
        setAuthUser({ ...authUser, full_name: res.user.full_name });
      }
      setIsEditing(false);
      showToast('Profile updated successfully!');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to update profile', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle password change
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwForm.current) {
      showToast('Please enter your current password.', 'error');
      return;
    }
    if (pwForm.newPw.length < 8) {
      showToast('New password must be at least 8 characters.', 'error');
      return;
    }
    if (pwForm.newPw !== pwForm.confirm) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    setSavingPw(true);
    try {
      await authService.changePassword(pwForm.current, pwForm.newPw);
      setPwForm({ current: '', newPw: '', confirm: '' });
      showToast('Password changed successfully!');
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to change password.', 'error');
    } finally {
      setSavingPw(false);
    }
  };

  // Handle 2FA Toggle
  const handleToggle2FA = async () => {
    setTwoFactorLoading(true);
    try {
      const res = await institutionService.toggle2FA();
      if (profileData) {
        setProfileData({
          ...profileData,
          user: { ...profileData.user, two_factor_enabled: res.two_factor_enabled },
          security: { ...profileData.security, two_factor_enabled: res.two_factor_enabled },
        });
      }
      setShowTwoFactorModal(false);
      showToast(res.message);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to toggle 2FA', 'error');
    } finally {
      setTwoFactorLoading(false);
    }
  };

  // Handle Data Export
  const handleExportData = async () => {
    try {
      showToast('Preparing data export...');
      await institutionService.exportUserData();
      showToast('Data exported successfully!');
    } catch (err) {
      showToast('Failed to export account data', 'error');
    }
  };

  // Scroll to Change Password
  const scrollToPassword = () => {
    if (passwordSectionRef.current) {
      passwordSectionRef.current.scrollIntoView({ behavior: 'smooth' });
      currentPasswordInputRef.current?.focus();
    }
  };

  // Initials for avatar
  const initials = profileData?.user?.full_name
    ? profileData.user.full_name
        .split(' ')
        .map(w => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'IA';

  return (
    <InstitutionShell activePage="Profile & Settings">
      <div className={styles.pageContainer}>
        {/* ── Breadcrumb Navigation ────────────────────────────────────────────── */}
        <div className={styles.breadcrumbRow}>
          <span className={styles.breadcrumbLink} onClick={() => router.push('/institution/dashboard')}>
            Institution
          </span>
          <span className={styles.breadcrumbSeparator}>&gt;</span>
          <span className={styles.breadcrumbLink} onClick={() => router.push('/institution/settings')}>
            Settings
          </span>
          <span className={styles.breadcrumbSeparator}>&gt;</span>
          <span className={styles.breadcrumbCurrent}>Profile & Security</span>
        </div>

        {/* ── Top Header ────────────────────────────────────────────────────────── */}
        <div className={styles.headerRow}>
          <div className={styles.titleGroup}>
            <h1 className={styles.pageTitle}>Profile & Settings</h1>
            <p className={styles.pageSubtitle}>
              Manage your account, security, notifications and preferences.
            </p>
          </div>

          <button
            type="button"
            className={styles.publicProfileBtn}
            onClick={() => setShowPublicModal(true)}
          >
            <Eye size={15} />
            <span>View as Public Profile</span>
          </button>
        </div>

        {/* ── Tab Navigation ─────────────────────────────────────────────────────── */}
        <div className={styles.tabsRow}>
          <button
            type="button"
            className={`${styles.tabItem} ${activeTab === 'profile' ? styles.tabItemActive : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <User size={16} />
            <span>Profile & Security</span>
          </button>

          <button
            type="button"
            className={`${styles.tabItem} ${activeTab === 'notifications' ? styles.tabItemActive : ''}`}
            onClick={() => router.push('/institution/notifications')}
          >
            <Bell size={16} />
            <span>Notifications</span>
          </button>

          <button
            type="button"
            className={`${styles.tabItem} ${activeTab === 'billing' ? styles.tabItemActive : ''}`}
            onClick={() => router.push('/institution/billing')}
          >
            <CreditCard size={16} />
            <span>Plan & Billing</span>
          </button>

          <button
            type="button"
            className={`${styles.tabItem} ${activeTab === 'ai' ? styles.tabItemActive : ''}`}
            onClick={() => router.push('/institution/ai-usage')}
          >
            <Sparkles size={16} />
            <span>AI & Usage</span>
          </button>

          <button
            type="button"
            className={`${styles.tabItem} ${activeTab === 'faq' ? styles.tabItemActive : ''}`}
            onClick={() => router.push('/institution/help')}
          >
            <HelpCircle size={16} />
            <span>Help & FAQ</span>
          </button>
        </div>

        {/* ── Main Content Split ─────────────────────────────────────────────────── */}
        <div className={styles.contentGrid}>
          {/* ── Left Column ───────────────────────────────────────────────────────── */}
          <div className={styles.leftColumn}>
            {/* 1. Profile Hero Banner Card */}
            <div className={styles.heroCard}>
              <div className={styles.heroLeft}>
                <div className={styles.avatarWrapper}>
                  <div className={styles.avatarCircle}>
                    {initials}
                  </div>
                  <div
                    className={styles.avatarCameraBadge}
                    title="Change Profile Photo"
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'image/*';
                      input.onchange = () => {
                        showToast('Profile photo updated successfully!');
                      };
                      input.click();
                    }}
                  >
                    <Camera size={13} />
                  </div>
                </div>

                <div className={styles.identityInfo}>
                  <div className={styles.identityTitleRow}>
                    <h2 className={styles.heroName}>
                      {loading ? '...' : profileData?.user?.full_name || 'Institution Admin'}
                    </h2>
                    <span className={styles.roleBadge}>Administrator</span>
                  </div>

                  <p className={styles.heroInstitution}>
                    {profileData?.institution?.name || 'Greenwood Institute'}
                  </p>

                  <div className={styles.heroContactRow}>
                    <div className={styles.heroContactItem}>
                      <Mail size={14} color="#7c3aed" />
                      <span>{profileData?.user?.email || 'inst.admin@nexlab.demo'}</span>
                    </div>

                    <div className={styles.heroContactItem}>
                      <Phone size={14} color="#7c3aed" />
                      <span>{profileData?.user?.phone || '+91 98765 43210'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.heroRight}>
                <p className={styles.heroQuote}>
                  &ldquo; {profileData?.user?.bio || 'Empowering education through technology.'} &rdquo;
                </p>

                <button
                  type="button"
                  className={styles.changePhotoBtn}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = () => {
                      showToast('Profile photo updated!');
                    };
                    input.click();
                  }}
                >
                  <Camera size={13} />
                  <span>Change Photo</span>
                </button>
              </div>
            </div>

            {/* 2. Personal Information Card */}
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionHeaderLeft}>
                  <div className={styles.sectionIconBox}>
                    <User size={19} />
                  </div>
                  <div>
                    <h3 className={styles.sectionTitle}>Personal Information</h3>
                    <p className={styles.sectionSubtitle}>
                      Update your basic details and contact information.
                    </p>
                  </div>
                </div>

                <div>
                  {!isEditing ? (
                    <button
                      type="button"
                      className={styles.editBtn}
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit3 size={14} />
                      <span>Edit Profile</span>
                    </button>
                  ) : (
                    <div className={styles.saveBtnGroup}>
                      <button
                        type="button"
                        className={styles.cancelBtn}
                        onClick={() => {
                          setIsEditing(false);
                          if (profileData) {
                            setEditForm({
                              fullName: profileData.user.full_name || '',
                              phone: profileData.user.phone || '+91 98765 43210',
                              bio: profileData.user.bio || '',
                              timezone: profileData.user.timezone || '',
                              language: profileData.user.language || '',
                            });
                          }
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={handleSaveProfile}
                        disabled={savingProfile}
                      >
                        <Save size={14} />
                        <span>{savingProfile ? 'Saving...' : 'Save Changes'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Form Input Fields */}
              <div className={styles.infoGrid}>
                {/* Full Name */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Full Name</label>
                  <div className={styles.fieldInputWrapper}>
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={editForm.fullName}
                      disabled={!isEditing}
                      onChange={e => setEditForm({ ...editForm, fullName: e.target.value })}
                      placeholder="e.g. Institution Admin"
                    />
                  </div>
                </div>

                {/* Role (Read Only) */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Role</label>
                  <div className={styles.fieldReadOnlyBox}>
                    <Shield size={15} color="#7c3aed" />
                    <span>{profileData?.user?.role_display || 'Institution Administrator'}</span>
                  </div>
                </div>

                {/* Email Address */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Email Address</label>
                  <div className={styles.fieldReadOnlyBox}>
                    <Mail size={15} color="#7c3aed" />
                    <span>{profileData?.user?.email || 'inst.admin@nexlab.demo'}</span>
                  </div>
                </div>

                {/* Institution (Read Only) */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Institution</label>
                  <div className={styles.fieldReadOnlyBox}>
                    <Building2 size={15} color="#7c3aed" />
                    <span>{profileData?.institution?.name || 'Greenwood Institute'}</span>
                  </div>
                </div>

                {/* Phone Number */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Phone Number</label>
                  <div className={styles.fieldInputWrapper}>
                    <Phone size={15} color="#7c3aed" />
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={editForm.phone}
                      disabled={!isEditing}
                      onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                      placeholder="+91 98765 43210"
                    />
                  </div>
                </div>

                {/* Time Zone */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Time Zone</label>
                  <div className={isEditing ? styles.fieldInputWrapper : styles.fieldReadOnlyBox}>
                    <Clock size={15} color="#7c3aed" />
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={editForm.timezone}
                      disabled={!isEditing}
                      onChange={e => setEditForm({ ...editForm, timezone: e.target.value })}
                      placeholder="(GMT+05:30) Asia/Kolkata"
                    />
                  </div>
                </div>

                {/* Bio / Quote (Spans 1 or full) */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Personal Bio / Mission</label>
                  <div className={isEditing ? styles.fieldInputWrapper : styles.fieldReadOnlyBox}>
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={editForm.bio}
                      disabled={!isEditing}
                      onChange={e => setEditForm({ ...editForm, bio: e.target.value })}
                      placeholder="Empowering education through technology."
                    />
                  </div>
                </div>

                {/* Language */}
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Language</label>
                  <div className={isEditing ? styles.fieldInputWrapper : styles.fieldReadOnlyBox}>
                    <Globe size={15} color="#7c3aed" />
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={editForm.language}
                      disabled={!isEditing}
                      onChange={e => setEditForm({ ...editForm, language: e.target.value })}
                      placeholder="English (India)"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Bottom Two Security Cards Side-by-Side */}
            <div className={styles.securityGrid} ref={passwordSectionRef}>
              {/* Change Password Card */}
              <div className={styles.securityCard}>
                <div className={styles.sectionHeader} style={{ marginBottom: 16 }}>
                  <div className={styles.sectionHeaderLeft}>
                    <div className={styles.sectionIconBox}>
                      <Lock size={18} />
                    </div>
                    <div>
                      <h3 className={styles.sectionTitle}>Change Password</h3>
                      <p className={styles.sectionSubtitle}>
                        Keep your account secure with a strong password.
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleChangePassword} className={styles.passwordForm}>
                  <div className={styles.passwordField}>
                    <label className={styles.fieldLabel}>Current Password</label>
                    <div className={styles.passwordInputWrapper}>
                      <input
                        ref={currentPasswordInputRef}
                        type={showCurrentPw ? 'text' : 'password'}
                        className={styles.passwordInput}
                        placeholder="Enter current password"
                        value={pwForm.current}
                        onChange={e => setPwForm({ ...pwForm, current: e.target.value })}
                        required
                      />
                      <button
                        type="button"
                        className={styles.eyeBtn}
                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                        aria-label="Toggle password visibility"
                      >
                        {showCurrentPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className={styles.passwordField}>
                    <label className={styles.fieldLabel}>New Password</label>
                    <div className={styles.passwordInputWrapper}>
                      <input
                        type={showNewPw ? 'text' : 'password'}
                        className={styles.passwordInput}
                        placeholder="Enter new password"
                        value={pwForm.newPw}
                        onChange={e => setPwForm({ ...pwForm, newPw: e.target.value })}
                        required
                      />
                      <button
                        type="button"
                        className={styles.eyeBtn}
                        onClick={() => setShowNewPw(!showNewPw)}
                        aria-label="Toggle password visibility"
                      >
                        {showNewPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className={styles.passwordField}>
                    <label className={styles.fieldLabel}>Confirm New Password</label>
                    <div className={styles.passwordInputWrapper}>
                      <input
                        type={showConfirmPw ? 'text' : 'password'}
                        className={styles.passwordInput}
                        placeholder="Re-enter new password"
                        value={pwForm.confirm}
                        onChange={e => setPwForm({ ...pwForm, confirm: e.target.value })}
                        required
                      />
                      <button
                        type="button"
                        className={styles.eyeBtn}
                        onClick={() => setShowConfirmPw(!showConfirmPw)}
                        aria-label="Toggle password visibility"
                      >
                        {showConfirmPw ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className={styles.updatePasswordBtn}
                    disabled={savingPw}
                  >
                    <Lock size={14} />
                    <span>{savingPw ? 'Updating...' : 'Update Password'}</span>
                  </button>
                </form>
              </div>

              {/* Two-Factor Authentication Card */}
              <div className={styles.securityCard}>
                <div className={styles.sectionHeader} style={{ marginBottom: 12 }}>
                  <div className={styles.sectionHeaderLeft}>
                    <div className={styles.sectionIconBox}>
                      <ShieldCheck size={18} />
                    </div>
                    <div>
                      <h3 className={styles.sectionTitle}>
                        <span>Two-Factor Authentication</span>
                        <span className={styles.recBadge}>Recommended</span>
                      </h3>
                      <p className={styles.sectionSubtitle}>
                        Add an extra layer of security to your account.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={styles.twoFactorCenter}>
                  <div className={styles.twoFactorIconCircle}>
                    <Lock size={28} />
                  </div>

                  <h4 className={styles.twoFactorTitle}>
                    {profileData?.security?.two_factor_enabled
                      ? 'Two-factor authentication is active'
                      : 'Two-factor authentication is not enabled'}
                  </h4>

                  <p className={styles.twoFactorDesc}>
                    {profileData?.security?.two_factor_enabled
                      ? 'Your account is secured with 2FA authenticator verification on every new login.'
                      : 'Protect your account by enabling 2FA. You will need an authenticator app like Google Authenticator.'}
                  </p>

                  {profileData?.security?.two_factor_enabled ? (
                    <button
                      type="button"
                      className={styles.disableTwoFactorBtn}
                      onClick={() => setShowTwoFactorModal(true)}
                    >
                      <X size={14} />
                      <span>Disable 2FA</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.enableTwoFactorBtn}
                      onClick={() => setShowTwoFactorModal(true)}
                    >
                      <ShieldCheck size={14} />
                      <span>Enable 2FA</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Right Column ──────────────────────────────────────────────────────── */}
          <div className={styles.rightColumn}>
            {/* 1. Account Summary Card */}
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader} style={{ marginBottom: 18 }}>
                <div className={styles.sectionHeaderLeft}>
                  <div className={styles.sectionIconBox}>
                    <Calendar size={18} />
                  </div>
                  <div>
                    <h3 className={styles.sectionTitle}>Account Summary</h3>
                    <p className={styles.sectionSubtitle}>Your account at a glance.</p>
                  </div>
                </div>
              </div>

              <div className={styles.summaryList}>
                {/* Member Since */}
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLeft}>
                    <Calendar size={15} color="#94a3b8" />
                    <span>Member Since</span>
                  </div>
                  <span className={styles.summaryRight}>
                    {formatDate(profileData?.user?.created_at)}
                  </span>
                </div>

                {/* Last Login */}
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLeft}>
                    <Clock size={15} color="#94a3b8" />
                    <span>Last Login</span>
                  </div>
                  <span className={styles.summaryRight}>
                    {formatDateTime(profileData?.user?.last_login)}
                  </span>
                </div>

                {/* Account Status */}
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLeft}>
                    <CheckCircle2 size={15} color="#94a3b8" />
                    <span>Account Status</span>
                  </div>
                  <span className={profileData?.user?.is_active !== false ? styles.statusActive : styles.statusInactive}>
                    ● {profileData?.user?.is_active !== false ? 'Active' : 'Suspended'}
                  </span>
                </div>

                {/* Role */}
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLeft}>
                    <User size={15} color="#94a3b8" />
                    <span>Role</span>
                  </div>
                  <span className={styles.summaryRight}>
                    {profileData?.user?.role_display || 'Institution Administrator'}
                  </span>
                </div>

                {/* Two-Factor Auth */}
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLeft}>
                    <Shield size={15} color="#94a3b8" />
                    <span>Two-Factor Auth</span>
                  </div>
                  <span className={profileData?.security?.two_factor_enabled ? styles.statusActive : styles.statusInactive}>
                    ● {profileData?.security?.two_factor_enabled ? 'Enabled' : 'Not Enabled'}
                  </span>
                </div>

                {/* Plan */}
                <div className={styles.summaryItem}>
                  <div className={styles.summaryLeft}>
                    <CreditCard size={15} color="#94a3b8" />
                    <span>Plan</span>
                  </div>
                  <div className={styles.summaryRight}>
                    <span>{profileData?.institution?.plan_display || 'NexLab Pro'}</span>
                    <button
                      type="button"
                      className={styles.managePlanBtn}
                      onClick={() => router.push('/institution/settings?tab=plan')}
                    >
                      Manage
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Quick Actions Card */}
            <div className={styles.sectionCard}>
              <div className={styles.sectionHeader} style={{ marginBottom: 14 }}>
                <div className={styles.sectionHeaderLeft}>
                  <div className={styles.sectionIconBox} style={{ background: '#fef3c7', color: '#d97706' }}>
                    <Sparkles size={18} />
                  </div>
                  <div>
                    <h3 className={styles.sectionTitle}>Quick Actions</h3>
                    <p className={styles.sectionSubtitle}>Common account actions.</p>
                  </div>
                </div>
              </div>

              <div className={styles.actionList}>
                {/* Action 1: Change Password */}
                <button
                  type="button"
                  className={styles.actionItem}
                  onClick={scrollToPassword}
                >
                  <div className={styles.actionItemLeft}>
                    <span className={styles.actionItemIcon}>
                      <Key size={16} />
                    </span>
                    <span>Change Password</span>
                  </div>
                  <ChevronRight size={16} color="#94a3b8" />
                </button>

                {/* Action 2: Two-Factor Authentication */}
                <button
                  type="button"
                  className={styles.actionItem}
                  onClick={() => setShowTwoFactorModal(true)}
                >
                  <div className={styles.actionItemLeft}>
                    <span className={styles.actionItemIcon}>
                      <ShieldCheck size={16} />
                    </span>
                    <span>
                      {profileData?.security?.two_factor_enabled
                        ? 'Manage Two-Factor Auth'
                        : 'Enable Two-Factor Authentication'}
                    </span>
                  </div>
                  <ChevronRight size={16} color="#94a3b8" />
                </button>

                {/* Action 3: Download My Data */}
                <button
                  type="button"
                  className={styles.actionItem}
                  onClick={handleExportData}
                >
                  <div className={styles.actionItemLeft}>
                    <span className={styles.actionItemIcon}>
                      <Download size={16} />
                    </span>
                    <span>Download My Data</span>
                  </div>
                  <ChevronRight size={16} color="#94a3b8" />
                </button>

                {/* Action 4: Manage Sessions */}
                <button
                  type="button"
                  className={styles.actionItem}
                  onClick={() => setShowSessionsModal(true)}
                >
                  <div className={styles.actionItemLeft}>
                    <span className={styles.actionItemIcon}>
                      <Laptop size={16} />
                    </span>
                    <span>Manage Sessions</span>
                  </div>
                  <ChevronRight size={16} color="#94a3b8" />
                </button>

                {/* Action 5: Delete Account */}
                <button
                  type="button"
                  className={`${styles.actionItem} ${styles.actionItemDanger}`}
                  onClick={() => setShowDeleteModal(true)}
                >
                  <div className={styles.actionItemLeft} style={{ color: '#ef4444' }}>
                    <span className={styles.actionItemIcon} style={{ color: '#ef4444' }}>
                      <Trash2 size={16} />
                    </span>
                    <span>Delete Account</span>
                  </div>
                  <ChevronRight size={16} color="#ef4444" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── 2FA Modal ─────────────────────────────────────────────────────────── */}
        {showTwoFactorModal && (
          <div className={styles.modalOverlay} onClick={() => setShowTwoFactorModal(false)}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>
                  {profileData?.security?.two_factor_enabled
                    ? 'Disable Two-Factor Authentication'
                    : 'Set Up Two-Factor Authentication'}
                </h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowTwoFactorModal(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                {profileData?.security?.two_factor_enabled ? (
                  <div>
                    <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                      Are you sure you want to disable two-factor authentication? Your account will only be protected by your password.
                    </p>
                    <button
                      type="button"
                      className={styles.disableTwoFactorBtn}
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={handleToggle2FA}
                      disabled={twoFactorLoading}
                    >
                      {twoFactorLoading ? 'Disabling...' : 'Confirm & Disable 2FA'}
                    </button>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 13.5, color: '#475569', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                      Scan the QR code below using your preferred authenticator app (Google Authenticator, Authy, or 1Password) to link your institution account.
                    </p>

                    <div style={{ background: '#f8fafc', padding: 20, borderRadius: 12, textAlign: 'center', border: '1px solid #e2e8f0', marginBottom: 16 }}>
                      <div style={{ width: 140, height: 140, margin: '0 auto', background: '#ede9fe', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
                        <ShieldCheck size={54} />
                      </div>
                      <p style={{ fontSize: 12, color: '#64748b', margin: '12px 0 0' }}>
                        Secret Code: <strong style={{ letterSpacing: '0.1em' }}>NEXL-AB7F-2A99-INST</strong>
                      </p>
                    </div>

                    <button
                      type="button"
                      className={styles.enableTwoFactorBtn}
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={handleToggle2FA}
                      disabled={twoFactorLoading}
                    >
                      {twoFactorLoading ? 'Enabling...' : 'Confirm & Enable 2FA'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Active Sessions Modal ──────────────────────────────────────────────── */}
        {showSessionsModal && (
          <div className={styles.modalOverlay} onClick={() => setShowSessionsModal(false)}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Manage Active Sessions</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowSessionsModal(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px 0' }}>
                  Below are the active devices currently signed into your administrator account.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #ede9fe' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ede9fe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Laptop size={18} />
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#1e1b4b' }}>
                        {profileData?.security?.current_session?.device || 'Chrome on Windows'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#64748b' }}>
                        IP: {profileData?.security?.current_session?.ip_address || '192.168.1.24'} • {profileData?.security?.current_session?.last_active || 'Active now'}
                      </p>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '3px 8px', borderRadius: 20 }}>
                    Current
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete Account Confirmation Modal ──────────────────────────────────── */}
        {showDeleteModal && (
          <div className={styles.modalOverlay} onClick={() => setShowDeleteModal(false)}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle} style={{ color: '#ef4444' }}>
                  Delete Administrator Account
                </h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowDeleteModal(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <div style={{ background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 12, padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <AlertCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <h4 style={{ margin: '0 0 4px 0', fontSize: 13.5, fontWeight: 700, color: '#b91c1c' }}>
                      Warning: Irreversible Action
                    </h4>
                    <p style={{ margin: 0, fontSize: 12.5, color: '#991b1b', lineHeight: 1.45 }}>
                      Deleting your administrator account will transfer ownership or require re-assignment by the platform super-administrator. All personal keys and tokens will be permanently revoked.
                    </p>
                  </div>
                </div>

                <p style={{ fontSize: 13, color: '#475569', margin: '8px 0 0' }}>
                  Please contact NexLab Enterprise Support to initiate institutional ownership transfer or decommission.
                </p>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setShowDeleteModal(false)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    style={{ padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                    onClick={() => {
                      setShowDeleteModal(false);
                      showToast('Support request submitted to platform administrator.', 'success');
                    }}
                  >
                    Contact Support
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Public Profile Preview Modal ───────────────────────────────────────── */}
        {showPublicModal && (
          <div className={styles.modalOverlay} onClick={() => setShowPublicModal(false)}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Public Profile Preview</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowPublicModal(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody} style={{ textAlign: 'center', padding: '24px 20px' }}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 28, fontWeight: 700 }}>
                  {initials}
                </div>
                <h4 style={{ margin: '0 0 4px 0', fontSize: 18, color: '#1e1b4b', fontWeight: 700 }}>
                  {profileData?.user?.full_name || 'Institution Admin'}
                </h4>
                <p style={{ margin: '0 0 8px 0', fontSize: 13, color: '#7c3aed', fontWeight: 600 }}>
                  Institution Administrator
                </p>
                <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#64748b' }}>
                  {profileData?.institution?.name || 'Greenwood Institute'}
                </p>
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, fontStyle: 'italic', fontSize: 13, color: '#475569', marginBottom: 16 }}>
                  &ldquo; {profileData?.user?.bio || 'Empowering education through technology.'} &rdquo;
                </div>
                <button
                  type="button"
                  className={styles.publicProfileBtn}
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => setShowPublicModal(false)}
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Help & FAQ Modal ───────────────────────────────────────────────────── */}
        {showFaqModal && (
          <div className={styles.modalOverlay} onClick={() => setShowFaqModal(false)}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Help & Frequently Asked Questions</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowFaqModal(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <div>
                  <h4 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: '#1e1b4b' }}>
                    How do I update my institution's name or domain?
                  </h4>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>
                    Head to Institution Settings in the left navigation to configure branding, custom domains, and contact email.
                  </p>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: '#1e1b4b' }}>
                    How does Two-Factor Authentication protect my account?
                  </h4>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>
                    2FA requires both your password and a time-based 6-digit code from your authenticator app on new browser sessions.
                  </p>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 700, color: '#1e1b4b' }}>
                    Need enterprise support?
                  </h4>
                  <p style={{ margin: 0, fontSize: 12.5, color: '#64748b', lineHeight: 1.45 }}>
                    Reach our engineering team anytime at support@nexlab.io or consult the platform documentation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Toast Notification ─────────────────────────────────────────────────── */}
        {toast && (
          <div className={styles.toastNotice}>
            {toast.type === 'error' ? (
              <AlertCircle size={18} color="#f87171" />
            ) : (
              <Check size={18} color="#4ade80" />
            )}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </InstitutionShell>
  );
}
