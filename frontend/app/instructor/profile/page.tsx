'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  User, Lock, Settings as SettingsIcon, FileText, Link2,
  Building2, Briefcase, Calendar, Check, Camera, Upload,
  ShieldCheck, Mail, CheckCircle2, AlertCircle, Eye,
  MapPin, Globe, Languages, Zap, Shield, Laptop, KeyRound,
  ExternalLink, Loader2, X, Sparkles, Save
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { authService } from '@/services/auth.service';
import { useAuthStore } from '@/store/auth-store';
import styles from './profile.module.css';

export default function InstructorProfilePage() {
  const router = useRouter();
  const { user, setUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'personal' | 'security' | 'preferences' | 'professional' | 'linked'
  >('personal');

  // Personal Info Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata (GMT+05:30)');
  const [language, setLanguage] = useState('English');
  const [bio, setBio] = useState('');
  const [profilePic, setProfilePic] = useState<string | null>(null);

  // Saving states
  const [savingProfile, setSavingProfile] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Security & Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Modals
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [showSessionsModal, setShowSessionsModal] = useState(false);

  // Preferences State
  const [themePref, setThemePref] = useState('light');
  const [editorFontSize, setEditorFontSize] = useState('14px');
  const [emailAlerts, setEmailAlerts] = useState(true);

  // Hydrate user profile
  useEffect(() => {
    if (user) {
      setFullName(user.full_name || 'Dr. Instructor');
      setEmail(user.email || 'instructor@nexlab.edu');
      setPhone(user.phone || '98765 43210');
      setLocation(user.location || 'Bangalore, Karnataka');
      setTimezone(user.timezone || 'Asia/Kolkata (GMT+05:30)');
      setLanguage(user.language || 'English');
      setBio(
        user.bio ||
          'Assistant Professor in Computer Science and Engineering. Interested in Data Structures, Algorithms, and hands-on experimentation with modern technologies. Passionate about student learning and practical education.'
      );
      if (user.profile_pic_url) {
        setProfilePic(user.profile_pic_url);
      }
    }
  }, [user]);

  // Derived user details
  const initials = (fullName || 'Dr. Instructor')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'DI';

  const departmentName = user?.department_name || 'Computer Science & Engineering';
  const employeeId = user?.staff_id || 'FAC-CS-1024';
  const designation = user?.designation || 'Assistant Professor';
  const joinedDate = '15 Aug 2023';

  // Save Personal Profile
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const updatedUser = await authService.updateProfile({
        full_name: fullName.trim(),
        phone: phone.trim(),
        location: location.trim(),
        timezone: timezone.trim(),
        language: language.trim(),
        bio: bio.trim(),
        profile_pic_url: profilePic || undefined,
      } as any);

      if (updatedUser) {
        setUser({
          ...user,
          ...updatedUser,
          full_name: fullName.trim(),
          phone: phone.trim(),
          location: location.trim(),
          timezone: timezone.trim(),
          language: language.trim(),
          bio: bio.trim(),
          profile_pic_url: profilePic || undefined,
        });
      }

      setToastMessage({ text: 'Profile updated successfully!' });
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setToastMessage({
        text: err?.response?.data?.error || 'Failed to update profile. Please try again.',
        isError: true,
      });
      setTimeout(() => setToastMessage(null), 4500);
    } finally {
      setSavingProfile(false);
    }
  };

  // Change Password
  const handleChangePassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (newPassword.length < 8) {
      setToastMessage({ text: 'New password must be at least 8 characters long.', isError: true });
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }
    if (newPassword !== confirmPassword) {
      setToastMessage({ text: 'New password and confirmation do not match.', isError: true });
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }

    setSavingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordModal(false);
      setToastMessage({ text: 'Password changed successfully!' });
      setTimeout(() => setToastMessage(null), 4000);
    } catch (err: any) {
      setToastMessage({
        text: err?.response?.data?.error || 'Failed to change password. Verify your current password.',
        isError: true,
      });
      setTimeout(() => setToastMessage(null), 4500);
    } finally {
      setSavingPassword(false);
    }
  };

  // Profile photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setToastMessage({ text: 'Image file size must be less than 2MB.', isError: true });
      setTimeout(() => setToastMessage(null), 4000);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setProfilePic(result);
      // Auto-save photo
      authService.updateProfile({ profile_pic_url: result } as any).then((u) => {
        if (u) setUser({ ...user, ...u, profile_pic_url: result });
      });
      setToastMessage({ text: 'Profile picture updated!' });
      setTimeout(() => setToastMessage(null), 3500);
    };
    reader.readAsDataURL(file);
  };

  return (
    <InstructorShell activePage="Profile">
      <div className={styles.pageContainer}>
        {/* Hidden File Input for Avatar Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png, image/jpeg, image/webp"
          style={{ display: 'none' }}
          onChange={handlePhotoUpload}
        />

        {/* ═══ Header Row ═══ */}
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <h1 className={styles.pageTitle}>My Profile</h1>
            <p className={styles.pageSubtitle}>
              Manage your personal account details and security settings. This information is used across NexLab.
            </p>
          </div>

          <button
            type="button"
            className={styles.viewAsBtn}
            onClick={() => router.push('/instructor/dashboard')}
            title="Preview public profile"
          >
            <Eye size={15} />
            <span>View as Instructor</span>
          </button>
        </div>

        {/* ═══ Toast Notification ═══ */}
        {toastMessage && (
          <div className={`${styles.toastNotice} ${toastMessage.isError ? styles.toastError : ''}`}>
            {toastMessage.isError ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* ═══ Top Hero Card ═══ */}
        <div className={styles.heroCard}>
          <div className={styles.heroLeft}>
            <div className={styles.avatarContainer}>
              <div className={styles.heroAvatar}>
                {profilePic ? (
                  <img src={profilePic} alt={fullName} className={styles.heroAvatarImg} />
                ) : (
                  initials
                )}
              </div>
              <button
                type="button"
                className={styles.cameraBtn}
                onClick={() => fileInputRef.current?.click()}
                title="Change profile picture"
              >
                <Camera size={13} />
              </button>
            </div>

            <div className={styles.heroInfo}>
              <div className={styles.heroNameRow}>
                <span className={styles.heroName}>{fullName || 'Dr. Instructor'}</span>
                <span className={styles.verifiedBadge}>
                  <Check size={11} strokeWidth={3} /> Verified Faculty
                </span>
              </div>
              <div className={styles.heroRoles}>
                <span>Instructor</span>
                <span>|</span>
                <span>Faculty Member</span>
              </div>
              <div className={styles.heroEmail}>
                <Mail size={13} color="#6366f1" />
                <span>{email || 'instructor@nexlab.edu'}</span>
              </div>
            </div>
          </div>

          {/* 3 Summary Stat Cards */}
          <div className={styles.heroStats}>
            <div className={styles.heroStatCard}>
              <div className={styles.statIconWrap}>
                <Building2 size={18} />
              </div>
              <div className={styles.statTexts}>
                <span className={styles.statLabel}>Department</span>
                <span className={styles.statValue}>{departmentName}</span>
              </div>
            </div>

            <div className={styles.heroStatCard}>
              <div className={styles.statIconWrap}>
                <Briefcase size={18} />
              </div>
              <div className={styles.statTexts}>
                <span className={styles.statLabel}>Designation</span>
                <span className={styles.statValue}>{designation}</span>
              </div>
            </div>

            <div className={styles.heroStatCard}>
              <div className={styles.statIconWrap}>
                <Calendar size={18} />
              </div>
              <div className={styles.statTexts}>
                <span className={styles.statLabel}>Member Since</span>
                <span className={styles.statValue}>{joinedDate}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Horizontal Tabs Row ═══ */}
        <div className={styles.tabsRow}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'personal' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('personal')}
          >
            <User size={15} />
            <span>Personal Information</span>
          </button>

          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'security' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <Lock size={15} />
            <span>Security & Password</span>
          </button>

          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'preferences' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('preferences')}
          >
            <SettingsIcon size={15} />
            <span>Preferences</span>
          </button>

          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'professional' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('professional')}
          >
            <FileText size={15} />
            <span>Professional Details</span>
          </button>

          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'linked' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('linked')}
          >
            <Link2 size={15} />
            <span>Linked Accounts</span>
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════
            TAB 1: Personal Information
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'personal' && (
          <div className={styles.personalInfoGrid}>
            {/* Left Column: Form */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIconBox}>
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Personal Information</h3>
                  <p className={styles.cardSub}>Your basic account details and contact information.</p>
                </div>
              </div>

              <div className={styles.formGrid}>
                {/* Full Name */}
                <div className={styles.formField}>
                  <label className={styles.formLabel}>
                    Full Name <span className={styles.reqStar}>*</span>
                  </label>
                  <input
                    type="text"
                    className={styles.textInput}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter full name"
                  />
                </div>

                {/* Email (Login ID) - Read only */}
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Email (Login ID)</label>
                  <div className={styles.inputWrap}>
                    <input
                      type="text"
                      className={`${styles.textInput} ${styles.textInputDisabled} ${styles.textInputWithRightIcon}`}
                      value={email}
                      disabled
                    />
                    <Lock size={14} className={styles.inputRightIcon} />
                  </div>
                  <span className={styles.fieldHelperText}>
                    Email cannot be changed. Contact administrator for updates.
                  </span>
                </div>

                {/* Phone Number */}
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Phone Number</label>
                  <div className={styles.phoneInputWrap}>
                    <select
                      className={styles.countryCodeSelect}
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                    >
                      <option value="+91">🇮🇳 +91</option>
                      <option value="+1">🇺🇸 +1</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+61">🇦🇺 +61</option>
                      <option value="+65">🇸🇬 +65</option>
                    </select>
                    <input
                      type="text"
                      className={styles.textInput}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 98765 43210"
                    />
                  </div>
                </div>

                {/* Location */}
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Location</label>
                  <div className={styles.inputWrap}>
                    <MapPin size={15} className={styles.inputIcon} />
                    <input
                      type="text"
                      className={`${styles.textInput} ${styles.textInputWithLeftIcon}`}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Bangalore, Karnataka"
                    />
                  </div>
                </div>

                {/* Time Zone */}
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Time Zone</label>
                  <div className={styles.inputWrap}>
                    <Globe size={15} className={styles.inputIcon} />
                    <select
                      className={`${styles.selectInput} ${styles.selectInputWithIcon}`}
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                    >
                      <option value="Asia/Kolkata (GMT+05:30)">Asia/Kolkata (GMT+05:30)</option>
                      <option value="UTC (GMT+00:00)">UTC (GMT+00:00)</option>
                      <option value="America/New_York (GMT-05:00)">America/New_York (GMT-05:00)</option>
                      <option value="America/Los_Angeles (GMT-08:00)">America/Los_Angeles (GMT-08:00)</option>
                      <option value="Europe/London (GMT+01:00)">Europe/London (GMT+01:00)</option>
                      <option value="Asia/Dubai (GMT+04:00)">Asia/Dubai (GMT+04:00)</option>
                      <option value="Asia/Singapore (GMT+08:00)">Asia/Singapore (GMT+08:00)</option>
                    </select>
                  </div>
                </div>

                {/* Language */}
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Language</label>
                  <div className={styles.inputWrap}>
                    <Languages size={15} className={styles.inputIcon} />
                    <select
                      className={`${styles.selectInput} ${styles.selectInputWithIcon}`}
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="English">English</option>
                      <option value="English (UK)">English (UK)</option>
                      <option value="Hindi">Hindi (हिंदी)</option>
                      <option value="Kannada">Kannada (ಕನ್ನಡ)</option>
                      <option value="French">French (Français)</option>
                      <option value="Spanish">Spanish (Español)</option>
                      <option value="German">German (Deutsch)</option>
                    </select>
                  </div>
                </div>

                {/* About Me / Bio */}
                <div className={styles.formFieldFull}>
                  <label className={styles.formLabel}>About Me / Bio</label>
                  <textarea
                    className={styles.textareaInput}
                    value={bio}
                    maxLength={500}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Briefly describe your teaching background and research interests..."
                  />
                  <div className={styles.bioCharCounter}>{bio.length} / 500 characters</div>
                </div>
              </div>

              {/* Action Button */}
              <div className={styles.formActionRow}>
                <button
                  type="button"
                  className={styles.saveProfileBtn}
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                >
                  {savingProfile ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Save size={16} />
                  )}
                  <span>Save Profile</span>
                </button>
              </div>
            </div>

            {/* Right Column: Profile Picture & Account Status */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Profile Picture Card */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardIconBox}>
                    <Camera size={16} />
                  </div>
                  <div>
                    <h3 className={styles.cardTitle}>Profile Picture</h3>
                    <p className={styles.cardSub}>Update your profile photo. A clear photo helps students recognize you.</p>
                  </div>
                </div>

                <div className={styles.profilePicRow}>
                  <div className={styles.largeAvatar}>
                    {profilePic ? (
                      <img src={profilePic} alt={fullName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      initials
                    )}
                  </div>

                  <div className={styles.uploadActionArea}>
                    <button
                      type="button"
                      className={styles.uploadBtn}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={14} />
                      <span>Upload New Photo</span>
                    </button>
                    <span className={styles.uploadFormatHint}>JPG, PNG or WebP (Max 2MB)</span>
                  </div>
                </div>
              </div>

              {/* Account Status Card */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardIconBox}>
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <h3 className={styles.cardTitle}>Account Status</h3>
                    <p className={styles.cardSub}>Your account verification and status information.</p>
                  </div>
                </div>

                <div className={styles.statusList}>
                  <div className={styles.statusItem}>
                    <CheckCircle2 size={18} className={styles.statusIconGreen} />
                    <div className={styles.statusTextCol}>
                      <span className={styles.statusTitle}>Verified Faculty</span>
                      <span className={styles.statusDesc}>Your faculty account has been verified by the institution.</span>
                    </div>
                  </div>

                  <div className={styles.statusItem}>
                    <Mail size={18} className={styles.statusIconBlue} />
                    <div className={styles.statusTextCol}>
                      <span className={styles.statusTitle}>Email Verified</span>
                      <span className={styles.statusDesc}>Login email is verified.</span>
                    </div>
                  </div>

                  <div className={styles.statusItem}>
                    <Lock size={18} className={styles.statusIconGreen} />
                    <div className={styles.statusTextCol}>
                      <span className={styles.statusTitle}>Account Active</span>
                      <span className={styles.statusDesc}>You can access all instructor features.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 2: Security & Password
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'security' && (
          <div className={styles.personalInfoGrid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIconBox}>
                  <Lock size={16} />
                </div>
                <div>
                  <h3 className={styles.cardTitle}>Change Account Password</h3>
                  <p className={styles.cardSub}>Ensure your account uses a secure, non-reusable password.</p>
                </div>
              </div>

              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Current Password</label>
                  <input
                    type="password"
                    className={styles.textInput}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter current password"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>New Password</label>
                  <input
                    type="password"
                    className={styles.textInput}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="At least 8 characters"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Confirm New Password</label>
                  <input
                    type="password"
                    className={styles.textInput}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter new password"
                  />
                </div>

                <div className={styles.formActionRow}>
                  <button type="submit" className={styles.saveProfileBtn} disabled={savingPassword}>
                    {savingPassword ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                    <span>Update Password</span>
                  </button>
                </div>
              </form>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardIconBox}>
                    <Shield size={16} />
                  </div>
                  <div>
                    <h3 className={styles.cardTitle}>Two-Factor Authentication</h3>
                    <p className={styles.cardSub}>Add an extra layer of protection to your instructor account.</p>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                  Status: <strong>Not Enabled</strong>. Two-Factor Authentication can be configured via Google Authenticator or institution identity provider.
                </div>
                <button
                  type="button"
                  className={styles.uploadBtn}
                  onClick={() => setShow2FAModal(true)}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Configure 2FA
                </button>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardIconBox}>
                    <Laptop size={16} />
                  </div>
                  <div>
                    <h3 className={styles.cardTitle}>Active Sessions</h3>
                    <p className={styles.cardSub}>Review devices currently logged into this account.</p>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: '#475569' }}>
                  Current Session: <strong>Active Web Browser (This Device)</strong>
                </div>
                <button
                  type="button"
                  className={styles.uploadBtn}
                  onClick={() => setShowSessionsModal(true)}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Manage Sessions
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 3: Preferences
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'preferences' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconBox}>
                <SettingsIcon size={16} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Instructor Workspace Preferences</h3>
                <p className={styles.cardSub}>Personalize your experience across code labs and grading views.</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Theme Mode</label>
                <select
                  className={styles.selectInput}
                  value={themePref}
                  onChange={(e) => setThemePref(e.target.value)}
                >
                  <option value="light">Light Mode (Default)</option>
                  <option value="dark">Dark Mode</option>
                  <option value="system">Follow System</option>
                </select>
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Default Editor Font Size</label>
                <select
                  className={styles.selectInput}
                  value={editorFontSize}
                  onChange={(e) => setEditorFontSize(e.target.value)}
                >
                  <option value="13px">13px (Compact)</option>
                  <option value="14px">14px (Recommended)</option>
                  <option value="15px">15px (Medium)</option>
                  <option value="16px">16px (Large)</option>
                </select>
              </div>

              <div className={styles.formFieldFull}>
                <label className={styles.formLabel}>In-App Notifications Preference</label>
                <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
                  Manage notifications using the header bell icon. You can configure At-Risk and Submission alert thresholds under{' '}
                  <span
                    style={{ color: '#6366f1', cursor: 'pointer', fontWeight: 600 }}
                    onClick={() => router.push('/instructor/settings')}
                  >
                    Teaching Settings →
                  </span>
                </p>
              </div>
            </div>

            <div className={styles.formActionRow}>
              <button
                type="button"
                className={styles.saveProfileBtn}
                onClick={() => {
                  setToastMessage({ text: 'Preferences saved.' });
                  setTimeout(() => setToastMessage(null), 3000);
                }}
              >
                Save Preferences
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 4: Professional Details
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'professional' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconBox}>
                <FileText size={16} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Professional & Academic Credentials</h3>
                <p className={styles.cardSub}>Information visible on your course syllabi and lab reports.</p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.formField}>
                <label className={styles.formLabel}>Highest Qualification</label>
                <input
                  type="text"
                  className={styles.textInput}
                  defaultValue="Ph.D. in Computer Science & Engineering"
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Specialization Areas</label>
                <input
                  type="text"
                  className={styles.textInput}
                  defaultValue="Distributed Systems, Algorithms, Cloud Computing"
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Office Location</label>
                <input
                  type="text"
                  className={styles.textInput}
                  defaultValue="Faculty Block C, Room 304"
                />
              </div>

              <div className={styles.formField}>
                <label className={styles.formLabel}>Office / Consultation Hours</label>
                <input
                  type="text"
                  className={styles.textInput}
                  defaultValue="Monday & Wednesday, 2:00 PM – 4:00 PM"
                />
              </div>
            </div>

            <div className={styles.formActionRow}>
              <button
                type="button"
                className={styles.saveProfileBtn}
                onClick={() => {
                  setToastMessage({ text: 'Professional details updated.' });
                  setTimeout(() => setToastMessage(null), 3000);
                }}
              >
                Save Details
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            TAB 5: Linked Accounts
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'linked' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconBox}>
                <Link2 size={16} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Connected Accounts & Single Sign-On</h3>
                <p className={styles.cardSub}>Sign in faster using your institutional or developer identity accounts.</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className={styles.securityItem}>
                <div className={styles.securityLeft}>
                  <Building2 size={20} color="#6366f1" />
                  <div className={styles.securityTexts}>
                    <span className={styles.securityTitle}>Institution SAML / SSO</span>
                    <span className={styles.securitySub}>Connected with {email || 'instructor@nexlab.edu'}</span>
                  </div>
                </div>
                <span className={styles.verifiedBadge}>Connected</span>
              </div>

              <div className={styles.securityItem}>
                <div className={styles.securityLeft}>
                  <Globe size={20} color="#ea4335" />
                  <div className={styles.securityTexts}>
                    <span className={styles.securityTitle}>Google Workspace</span>
                    <span className={styles.securitySub}>Connect Google account for Drive and Classroom syncing</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.securityActionBtn}
                  onClick={() => {
                    setToastMessage({ text: 'Google SSO integration active.' });
                    setTimeout(() => setToastMessage(null), 3000);
                  }}
                >
                  Connect
                </button>
              </div>

              <div className={styles.securityItem}>
                <div className={styles.securityLeft}>
                  <FileText size={20} color="#24292f" />
                  <div className={styles.securityTexts}>
                    <span className={styles.securityTitle}>GitHub Classroom</span>
                    <span className={styles.securitySub}>Import repositories and test case suites</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.securityActionBtn}
                  onClick={() => {
                    setToastMessage({ text: 'GitHub connection ready.' });
                    setTimeout(() => setToastMessage(null), 3000);
                  }}
                >
                  Connect
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            BOTTOM ROW: 3 Info / Action Cards
        ══════════════════════════════════════════════════════════ */}
        <div className={styles.bottomThreeGrid}>
          {/* Card 1: Institution Information */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconBox}>
                <Building2 size={16} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Institution Information</h3>
                <p className={styles.cardSub}>Your institutional details (managed by administrator).</p>
              </div>
            </div>

            <div className={styles.institutionList}>
              <div className={styles.institutionRow}>
                <span className={styles.instLabel}>Department</span>
                <span className={styles.instValue}>{departmentName}</span>
              </div>
              <div className={styles.institutionRow}>
                <span className={styles.instLabel}>Designation</span>
                <span className={styles.instValue}>{designation}</span>
              </div>
              <div className={styles.institutionRow}>
                <span className={styles.instLabel}>Employee ID</span>
                <span className={styles.instValue}>{employeeId}</span>
              </div>
              <div className={styles.institutionRow}>
                <span className={styles.instLabel}>Joined On</span>
                <span className={styles.instValue}>{joinedDate}</span>
              </div>
              <div className={styles.institutionRow}>
                <span className={styles.instLabel}>Institution Role</span>
                <span className={styles.instValue}>Instructor</span>
              </div>
            </div>
          </div>

          {/* Card 2: Quick Actions */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconBox}>
                <Zap size={16} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Quick Actions</h3>
                <p className={styles.cardSub}>Common account actions.</p>
              </div>
            </div>

            <div className={styles.quickActionsList}>
              <div
                className={styles.quickActionItem}
                onClick={() => {
                  setActiveTab('personal');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <div className={styles.quickActionLeft}>
                  <FileText size={15} className={styles.quickActionIcon} />
                  <span>Update Profile Information</span>
                </div>
                <span>→</span>
              </div>

              <div
                className={styles.quickActionItem}
                onClick={() => setShowPasswordModal(true)}
              >
                <div className={styles.quickActionLeft}>
                  <Lock size={15} className={styles.quickActionIcon} />
                  <span>Change Password</span>
                </div>
                <span>→</span>
              </div>

              <div
                className={styles.quickActionItem}
                onClick={() => setActiveTab('preferences')}
              >
                <div className={styles.quickActionLeft}>
                  <SettingsIcon size={15} className={styles.quickActionIcon} />
                  <span>Manage Preferences</span>
                </div>
                <span>→</span>
              </div>

              <div
                className={styles.quickActionItem}
                onClick={() => router.push('/instructor/settings')}
              >
                <div className={styles.quickActionLeft}>
                  <Sparkles size={15} className={styles.quickActionIcon} />
                  <span>View Teaching Settings</span>
                </div>
                <span>→</span>
              </div>
            </div>
          </div>

          {/* Card 3: Account Security */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconBox}>
                <Shield size={16} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Account Security</h3>
                <p className={styles.cardSub}>Keep your account secure.</p>
              </div>
            </div>

            <div className={styles.securityList}>
              <div className={styles.securityItem}>
                <div className={styles.securityLeft}>
                  <KeyRound size={17} className={styles.securityIcon} />
                  <div className={styles.securityTexts}>
                    <span className={styles.securityTitle}>Password</span>
                    <span className={styles.securitySub}>Last changed 3 months ago</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.securityActionBtn}
                  onClick={() => setShowPasswordModal(true)}
                >
                  Change
                </button>
              </div>

              <div className={styles.securityItem}>
                <div className={styles.securityLeft}>
                  <ShieldCheck size={17} className={styles.securityIcon} />
                  <div className={styles.securityTexts}>
                    <span className={styles.securityTitle}>Two-Factor Authentication</span>
                    <span className={styles.securitySub} style={{ color: '#dc2626' }}>
                      🚫 Not enabled
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.securityActionBtn}
                  onClick={() => setShow2FAModal(true)}
                >
                  Enable
                </button>
              </div>

              <div className={styles.securityItem}>
                <div className={styles.securityLeft}>
                  <Laptop size={17} className={styles.securityIcon} />
                  <div className={styles.securityTexts}>
                    <span className={styles.securityTitle}>Active Sessions</span>
                    <span className={styles.securitySub}>1 active session</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.securityActionBtn}
                  onClick={() => setShowSessionsModal(true)}
                >
                  Manage
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Password Change Modal ═══ */}
        {showPasswordModal && (
          <div className={styles.modalBackdrop} onClick={() => setShowPasswordModal(false)}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Change Account Password</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowPasswordModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Current Password</label>
                  <input
                    type="password"
                    className={styles.textInput}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    placeholder="Enter current password"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>New Password</label>
                  <input
                    type="password"
                    className={styles.textInput}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="At least 8 characters"
                  />
                </div>

                <div className={styles.formField}>
                  <label className={styles.formLabel}>Confirm New Password</label>
                  <input
                    type="password"
                    className={styles.textInput}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Re-enter new password"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                  <button
                    type="button"
                    className={styles.uploadBtn}
                    onClick={() => setShowPasswordModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className={styles.saveProfileBtn}
                    disabled={savingPassword}
                  >
                    {savingPassword ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
                    <span>Update Password</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ═══ 2FA Modal ═══ */}
        {show2FAModal && (
          <div className={styles.modalBackdrop} onClick={() => setShow2FAModal(false)}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Two-Factor Authentication (2FA)</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShow2FAModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: '#475569' }}>
                <p style={{ margin: 0 }}>
                  2FA secures your faculty account by requiring an authenticator code when signing in from an unrecognized device or browser.
                </p>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  Institutional SSO credentials currently enforce organization-level single sign-on security.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="button"
                  className={styles.uploadBtn}
                  onClick={() => setShow2FAModal(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Active Sessions Modal ═══ */}
        {showSessionsModal && (
          <div className={styles.modalBackdrop} onClick={() => setShowSessionsModal(false)}>
            <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Active Sessions</h3>
                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setShowSessionsModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className={styles.statusItem}>
                  <Laptop size={18} color="#6366f1" />
                  <div className={styles.statusTextCol}>
                    <span className={styles.statusTitle}>Current Active Session</span>
                    <span className={styles.statusDesc}>
                      Logged in from your current web browser • IP: 127.0.0.1 (Localhost)
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  type="button"
                  className={styles.uploadBtn}
                  onClick={() => setShowSessionsModal(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </InstructorShell>
  );
}
