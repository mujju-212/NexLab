'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { useAuthStore } from '@/store/auth-store';
import {
  institutionService,
  type NotificationChannelConfig,
  type NotificationCategoryConfig,
  type RecentNotificationItem,
  type NotificationSettingsResponse,
} from '@/services/institution.service';
import {
  Bell,
  Mail,
  Smartphone,
  Send,
  RotateCcw,
  Save,
  Check,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  Megaphone,
  Users,
  Shield,
  Clock,
  Calendar,
  AlertCircle,
  XCircle,
  FileEdit,
  UserCheck,
  Sparkles,
  HelpCircle,
  CreditCard,
  User,
  Loader2,
  RefreshCw,
  KeyRound,
  CheckCircle2,
} from 'lucide-react';
import styles from './notifications.module.css';

export default function NotificationsPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Loading & Action states
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Channels state
  const [channels, setChannels] = useState<NotificationChannelConfig>({
    email: true,
    in_app: true,
    sms: false,
    push: false,
  });

  // Category matrix state
  const [categories, setCategories] = useState<Record<string, NotificationCategoryConfig>>({});

  // Expanded accordion sections (by category id)
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({
    academic: true,
    announcements: false,
    user_management: false,
    system_security: false,
  });

  // Recent notifications list
  const [recentNotifs, setRecentNotifs] = useState<RecentNotificationItem[]>([]);
  const [showAllRecent, setShowAllRecent] = useState(false);

  // Test Notification state
  const [testChannel, setTestChannel] = useState<'email' | 'sms' | 'push' | 'in_app'>('email');
  const [testRecipient, setTestRecipient] = useState('inst.admin@nexlab.demo');

  // Trigger toast
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Sync recipient when user logs in
  useEffect(() => {
    if (user?.email && testRecipient === 'inst.admin@nexlab.demo') {
      setTestRecipient(user.email);
    }
  }, [user]);

  // Load notification settings from backend
  const loadSettings = async () => {
    try {
      setLoading(true);
      const data: NotificationSettingsResponse = await institutionService.getNotificationSettings();
      if (data.channels) {
        setChannels(data.channels);
      }
      if (data.categories) {
        setCategories(data.categories);
      }
      if (data.recent_notifications) {
        setRecentNotifs(data.recent_notifications);
      }
    } catch (err: any) {
      console.error('Failed to load notification settings:', err);
      showToast('Could not load notification preferences. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Toggle category accordion
  const toggleAccordion = (catId: string) => {
    setExpandedCats((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  // Toggle global channel card
  const toggleChannel = (channelKey: keyof NotificationChannelConfig) => {
    setChannels((prev) => ({
      ...prev,
      [channelKey]: !prev[channelKey],
    }));
  };

  // Toggle an event's master enabled toggle
  const toggleEventMaster = (catKey: string, eventId: string) => {
    setCategories((prev) => {
      const cat = prev[catKey];
      if (!cat) return prev;
      const updatedEvents = cat.events.map((evt) => {
        if (evt.id === eventId) {
          return { ...evt, enabled: !evt.enabled };
        }
        return evt;
      });
      return {
        ...prev,
        [catKey]: { ...cat, events: updatedEvents },
      };
    });
  };

  // Toggle an event's specific channel checkbox
  const toggleEventChannel = (
    catKey: string,
    eventId: string,
    channelKey: 'email' | 'in_app' | 'sms' | 'push'
  ) => {
    setCategories((prev) => {
      const cat = prev[catKey];
      if (!cat) return prev;
      const updatedEvents = cat.events.map((evt) => {
        if (evt.id === eventId) {
          return { ...evt, [channelKey]: !evt[channelKey] };
        }
        return evt;
      });
      return {
        ...prev,
        [catKey]: { ...cat, events: updatedEvents },
      };
    });
  };

  // Save Preferences to backend
  const handleSavePreferences = async () => {
    try {
      setSaving(true);
      const res = await institutionService.updateNotificationSettings({
        channels,
        categories,
      });
      if (res.channels) setChannels(res.channels);
      if (res.categories) setCategories(res.categories);
      showToast('Notification preferences saved successfully!');
    } catch (err: any) {
      console.error('Save failed:', err);
      showToast(err?.response?.data?.error || 'Failed to save preferences.');
    } finally {
      setSaving(false);
    }
  };

  // Reset to default
  const handleReset = async () => {
    if (!window.confirm('Reset all notification preferences to standard institution defaults?')) {
      return;
    }
    try {
      setResetting(true);
      const res = await institutionService.resetNotificationSettings();
      if (res.channels) setChannels(res.channels);
      if (res.categories) setCategories(res.categories);
      showToast('Notification preferences reset to default!');
    } catch (err: any) {
      console.error('Reset failed:', err);
      showToast(err?.response?.data?.error || 'Failed to reset preferences.');
    } finally {
      setResetting(false);
    }
  };

  // Send Test Notification
  const handleSendTest = async () => {
    if (!testRecipient.trim()) {
      showToast('Please enter a recipient address or number.');
      return;
    }
    try {
      setSendingTest(true);
      const res = await institutionService.sendTestNotification(testChannel, testRecipient.trim());
      showToast(res.message || `Test notification sent via ${testChannel.toUpperCase()}!`);
      // Refresh recent notifications if In-App test was triggered
      if (testChannel === 'in_app') {
        const fresh = await institutionService.getNotificationSettings();
        if (fresh.recent_notifications) {
          setRecentNotifs(fresh.recent_notifications);
        }
      }
    } catch (err: any) {
      console.error('Send test failed:', err);
      showToast(err?.response?.data?.error || 'Failed to send test notification.');
    } finally {
      setSendingTest(false);
    }
  };

  // Compute category enabled counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, { enabled: number; total: number }> = {};
    Object.entries(categories).forEach(([key, cat]) => {
      const total = cat.events?.length || 0;
      const enabled = cat.events?.filter((e) => e.enabled).length || 0;
      counts[key] = { enabled, total };
    });
    return counts;
  }, [categories]);

  // Category Icon helper
  const renderCategoryIcon = (catKey: string) => {
    switch (catKey) {
      case 'academic':
        return <GraduationCap size={18} />;
      case 'announcements':
        return <Megaphone size={18} />;
      case 'user_management':
        return <Users size={18} />;
      case 'system_security':
        return <Shield size={18} />;
      default:
        return <Bell size={18} />;
    }
  };

  // Event Icon helper
  const renderEventIcon = (eventId: string) => {
    switch (eventId) {
      case 'session_scheduled':
        return <Calendar size={15} className={styles.eventIcon} />;
      case 'session_started':
        return <Clock size={15} className={styles.eventIcon} />;
      case 'session_ended':
        return <CheckCircle2 size={15} className={styles.eventIcon} />;
      case 'session_rescheduled':
        return <RefreshCw size={15} className={styles.eventIcon} />;
      case 'session_cancelled':
        return <XCircle size={15} className={styles.eventIcon} />;
      case 'announcement_created':
        return <Megaphone size={15} className={styles.eventIcon} />;
      case 'announcement_urgent':
        return <AlertCircle size={15} className={styles.eventIcon} />;
      case 'announcement_reminder':
        return <Bell size={15} className={styles.eventIcon} />;
      case 'user_registered':
        return <UserCheck size={15} className={styles.eventIcon} />;
      case 'user_role_changed':
        return <Shield size={15} className={styles.eventIcon} />;
      case 'user_profile_updated':
        return <FileEdit size={15} className={styles.eventIcon} />;
      case 'user_password_reset':
        return <KeyRound size={15} className={styles.eventIcon} />;
      case 'security_login_alert':
        return <AlertCircle size={15} className={styles.eventIcon} />;
      case 'security_2fa_changed':
        return <Shield size={15} className={styles.eventIcon} />;
      case 'system_maintenance':
        return <Sparkles size={15} className={styles.eventIcon} />;
      default:
        return <Bell size={15} className={styles.eventIcon} />;
    }
  };

  // Recent Notification item icon & color badge
  const renderRecentBadge = (type: string, title: string) => {
    const t = (type || title || '').toLowerCase();
    if (t.includes('session') && !t.includes('cancel')) {
      return (
        <div className={`${styles.recentNotifIconBox} ${styles.recentNotifIconPurple}`}>
          <Calendar size={15} />
        </div>
      );
    }
    if (t.includes('announcement')) {
      return (
        <div className={`${styles.recentNotifIconBox} ${styles.recentNotifIconGreen}`}>
          <Megaphone size={15} />
        </div>
      );
    }
    if (t.includes('user') || t.includes('registered')) {
      return (
        <div className={`${styles.recentNotifIconBox} ${styles.recentNotifIconBlue}`}>
          <UserCheck size={15} />
        </div>
      );
    }
    if (t.includes('cancel') || t.includes('alert') || t.includes('error')) {
      return (
        <div className={`${styles.recentNotifIconBox} ${styles.recentNotifIconRed}`}>
          <XCircle size={15} />
        </div>
      );
    }
    if (t.includes('profile') || t.includes('update') || t.includes('edit')) {
      return (
        <div className={`${styles.recentNotifIconBox} ${styles.recentNotifIconOrange}`}>
          <FileEdit size={15} />
        </div>
      );
    }
    return (
      <div className={`${styles.recentNotifIconBox} ${styles.recentNotifIconPurple}`}>
        <Bell size={15} />
      </div>
    );
  };

  const displayedRecent = showAllRecent ? recentNotifs : recentNotifs.slice(0, 5);

  return (
    <InstitutionShell activePage="Institution Settings">
      <div className={styles.pageContainer}>
        {/* ── Breadcrumb ───────────────────────────────────────────────────────── */}
        <div className={styles.breadcrumbRow}>
          <span
            className={styles.breadcrumbLink}
            onClick={() => router.push('/institution/dashboard')}
          >
            Institution
          </span>
          <span className={styles.breadcrumbSeparator}>&gt;</span>
          <span
            className={styles.breadcrumbLink}
            onClick={() => router.push('/institution/settings')}
          >
            Settings
          </span>
          <span className={styles.breadcrumbSeparator}>&gt;</span>
          <span className={styles.breadcrumbCurrent}>Notifications</span>
        </div>

        {/* ── Header Row with Banner Card ─────────────────────────────────────── */}
        <div className={styles.headerRow}>
          <div className={styles.titleGroup}>
            <h1 className={styles.pageTitle}>Notifications</h1>
            <p className={styles.pageSubtitle}>
              Manage how and when you receive notifications. Stay updated with important activities in your institution.
            </p>
          </div>

          {/* Stay Informed Lavender Banner Card */}
          <div className={styles.stayInformedCard}>
            <div className={styles.stayInformedIconBox}>
              <Bell size={18} />
            </div>
            <div className={styles.stayInformedText}>
              <div className={styles.stayInformedTitle}>Stay Informed, Always</div>
              <div className={styles.stayInformedDesc}>
                Get notified about sessions, announcements, user activity and more — so you never miss what matters.
              </div>
            </div>
            <Bell size={68} className={styles.bannerBellIllustration} />
          </div>
        </div>

        {/* ── Tab Navigation ─────────────────────────────────────────────────── */}
        <div className={styles.tabsRow}>
          <button
            type="button"
            className={styles.tabItem}
            onClick={() => router.push('/institution/profile')}
          >
            <User size={15} />
            <span>Profile & Security</span>
          </button>

          <button
            type="button"
            className={`${styles.tabItem} ${styles.tabItemActive}`}
          >
            <Bell size={15} />
            <span>Notifications</span>
          </button>

          <button
            type="button"
            className={styles.tabItem}
            onClick={() => router.push('/institution/billing')}
          >
            <CreditCard size={15} />
            <span>Plan & Billing</span>
          </button>

          <button
            type="button"
            className={styles.tabItem}
            onClick={() => router.push('/institution/ai-usage')}
          >
            <Sparkles size={15} />
            <span>AI & Usage</span>
          </button>

          <button
            type="button"
            className={styles.tabItem}
            onClick={() => router.push('/institution/help')}
          >
            <HelpCircle size={15} />
            <span>Help & FAQ</span>
          </button>
        </div>

        {/* ── Main Content Grid ──────────────────────────────────────────────── */}
        <div className={styles.contentGrid}>
          {/* ════ LEFT COLUMN ════ */}
          <div className={styles.leftColumn}>
            {/* Card 1: Notification Channels */}
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderTitleGroup}>
                  <h2 className={styles.cardTitle}>Notification Channels</h2>
                  <p className={styles.cardSubtitle}>
                    Choose how you want to receive notifications.
                  </p>
                </div>
              </div>

              <div className={styles.channelsGrid}>
                {/* Email Channel */}
                <div
                  className={`${styles.channelCard} ${channels.email ? styles.channelCardActive : ''}`}
                  onClick={() => toggleChannel('email')}
                >
                  <div className={styles.channelTopRow}>
                    <div className={`${styles.channelIconBox} ${styles.channelIconPurple}`}>
                      <Mail size={18} />
                    </div>
                    {channels.email ? (
                      <div className={styles.channelCheckBadge}>
                        <Check size={12} strokeWidth={3} />
                      </div>
                    ) : (
                      <div className={styles.channelEmptyCircle} />
                    )}
                  </div>
                  <div className={styles.channelTitle}>Email</div>
                  <div className={styles.channelDesc}>
                    Receive notifications in your email inbox
                  </div>
                </div>

                {/* In-App Channel */}
                <div
                  className={`${styles.channelCard} ${channels.in_app ? styles.channelCardActive : ''}`}
                  onClick={() => toggleChannel('in_app')}
                >
                  <div className={styles.channelTopRow}>
                    <div className={`${styles.channelIconBox} ${styles.channelIconBlue}`}>
                      <Bell size={18} />
                    </div>
                    {channels.in_app ? (
                      <div className={styles.channelCheckBadge}>
                        <Check size={12} strokeWidth={3} />
                      </div>
                    ) : (
                      <div className={styles.channelEmptyCircle} />
                    )}
                  </div>
                  <div className={styles.channelTitle}>In-App</div>
                  <div className={styles.channelDesc}>
                    Get notified inside the NexLab platform
                  </div>
                </div>

                {/* SMS Channel */}
                <div
                  className={`${styles.channelCard} ${channels.sms ? styles.channelCardActive : ''}`}
                  onClick={() => toggleChannel('sms')}
                >
                  <div className={styles.channelTopRow}>
                    <div className={`${styles.channelIconBox} ${styles.channelIconGray}`}>
                      <Smartphone size={18} />
                    </div>
                    {channels.sms ? (
                      <div className={styles.channelCheckBadge}>
                        <Check size={12} strokeWidth={3} />
                      </div>
                    ) : (
                      <div className={styles.channelEmptyCircle} />
                    )}
                  </div>
                  <div className={styles.channelTitle}>SMS</div>
                  <div className={styles.channelDesc}>
                    Receive important alerts via SMS
                  </div>
                </div>

                {/* Push Channel */}
                <div
                  className={`${styles.channelCard} ${channels.push ? styles.channelCardActive : ''}`}
                  onClick={() => toggleChannel('push')}
                >
                  <div className={styles.channelTopRow}>
                    <div className={`${styles.channelIconBox} ${styles.channelIconGray}`}>
                      <Smartphone size={18} />
                    </div>
                    {channels.push ? (
                      <div className={styles.channelCheckBadge}>
                        <Check size={12} strokeWidth={3} />
                      </div>
                    ) : (
                      <div className={styles.channelEmptyCircle} />
                    )}
                  </div>
                  <div className={styles.channelTitle}>Push</div>
                  <div className={styles.channelDesc}>
                    Browser & mobile push notifications
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Notification Preferences (Accordions) */}
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderTitleGroup}>
                  <h2 className={styles.cardTitle}>Notification Preferences</h2>
                  <p className={styles.cardSubtitle}>
                    Select the events you want to be notified about.
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.resetBtn}
                  onClick={handleReset}
                  disabled={resetting}
                >
                  <RotateCcw size={13} className={resetting ? styles.spin : ''} />
                  <span>{resetting ? 'Resetting…' : 'Reset to Default'}</span>
                </button>
              </div>

              {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: 10, color: '#7c3aed' }}>
                  <Loader2 size={22} className={styles.spin} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Loading notification preferences…</span>
                </div>
              ) : (
                <div className={styles.categoriesContainer}>
                  {Object.entries(categories).map(([catKey, cat]) => {
                    const isExpanded = !!expandedCats[catKey];
                    const counts = categoryCounts[catKey] || { enabled: 0, total: 0 };

                    return (
                      <div key={catKey} className={styles.categoryCard}>
                        {/* Category Header */}
                        <div
                          className={styles.categoryHeader}
                          onClick={() => toggleAccordion(catKey)}
                        >
                          <div className={styles.categoryHeaderLeft}>
                            <div className={styles.categoryIconBox}>
                              {renderCategoryIcon(catKey)}
                            </div>
                            <div className={styles.categoryTitleGroup}>
                              <div className={styles.categoryTitle}>{cat.title}</div>
                              <div className={styles.categorySubtitle}>{cat.subtitle}</div>
                            </div>
                          </div>

                          <div className={styles.categoryHeaderRight}>
                            <span className={styles.categoryCountBadge}>
                              {counts.enabled} of {counts.total} enabled
                            </span>
                            <div className={styles.categoryChevron}>
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </div>
                          </div>
                        </div>

                        {/* Category Body / Event list */}
                        {isExpanded && (
                          <div className={styles.categoryBody}>
                            {cat.events?.map((evt) => (
                              <div key={evt.id} className={styles.eventRow}>
                                <div className={styles.eventLeft}>
                                  {renderEventIcon(evt.id)}
                                  <div className={styles.eventInfo}>
                                    <div className={styles.eventTitle}>{evt.title}</div>
                                    <div className={styles.eventDesc}>{evt.description}</div>
                                  </div>
                                </div>

                                <div className={styles.eventRight}>
                                  {/* Channel Checkboxes */}
                                  <div className={styles.channelCheckboxes}>
                                    <label className={styles.checkboxLabel}>
                                      <input
                                        type="checkbox"
                                        className={styles.checkboxInput}
                                        checked={evt.email}
                                        disabled={!evt.enabled}
                                        onChange={() => toggleEventChannel(catKey, evt.id, 'email')}
                                      />
                                      <span>Email</span>
                                    </label>

                                    <label className={styles.checkboxLabel}>
                                      <input
                                        type="checkbox"
                                        className={styles.checkboxInput}
                                        checked={evt.in_app}
                                        disabled={!evt.enabled}
                                        onChange={() => toggleEventChannel(catKey, evt.id, 'in_app')}
                                      />
                                      <span>In-App</span>
                                    </label>

                                    <label className={styles.checkboxLabel}>
                                      <input
                                        type="checkbox"
                                        className={styles.checkboxInput}
                                        checked={evt.sms}
                                        disabled={!evt.enabled}
                                        onChange={() => toggleEventChannel(catKey, evt.id, 'sms')}
                                      />
                                      <span>SMS</span>
                                    </label>

                                    <label className={styles.checkboxLabel}>
                                      <input
                                        type="checkbox"
                                        className={styles.checkboxInput}
                                        checked={evt.push}
                                        disabled={!evt.enabled}
                                        onChange={() => toggleEventChannel(catKey, evt.id, 'push')}
                                      />
                                      <span>Push</span>
                                    </label>
                                  </div>

                                  {/* Master Pill Toggle */}
                                  <button
                                    type="button"
                                    className={`${styles.toggleSwitch} ${
                                      evt.enabled ? styles.toggleSwitchOn : styles.toggleSwitchOff
                                    }`}
                                    onClick={() => toggleEventMaster(catKey, evt.id)}
                                  >
                                    <span
                                      className={`${styles.toggleSlider} ${
                                        evt.enabled ? styles.toggleSliderOn : styles.toggleSliderOff
                                      }`}
                                    />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Save Preferences Button */}
              <div className={styles.savePreferencesRow}>
                <button
                  type="button"
                  className={styles.savePreferencesBtn}
                  onClick={handleSavePreferences}
                  disabled={saving || loading}
                >
                  {saving ? (
                    <Loader2 size={15} className={styles.spin} />
                  ) : (
                    <Save size={15} />
                  )}
                  <span>{saving ? 'Saving…' : 'Save Preferences'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* ════ RIGHT COLUMN ════ */}
          <div className={styles.rightColumn}>
            {/* Card 1: Test Notifications */}
            <div className={styles.sectionCard}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: '#f3e8ff',
                    color: '#7c3aed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Send size={17} />
                </div>
                <div>
                  <h3 style={{ margin: '0 0 3px 0', fontSize: 14.5, fontWeight: 700, color: '#1e1b4b', fontFamily: "'Space Grotesk', sans-serif" }}>
                    Test Notifications
                  </h3>
                  <p style={{ margin: 0, fontSize: 11.5, color: '#64748b', lineHeight: 1.35 }}>
                    Send a test notification to make sure everything is working correctly.
                  </p>
                </div>
              </div>

              {/* Channel Tabs */}
              <div className={styles.testChannelTabs}>
                {(['email', 'sms', 'push', 'in_app'] as const).map((ch) => {
                  const label = ch === 'in_app' ? 'In-App' : ch.toUpperCase();
                  const isActive = testChannel === ch;
                  return (
                    <button
                      key={ch}
                      type="button"
                      className={`${styles.testChannelTab} ${isActive ? styles.testChannelTabActive : ''}`}
                      onClick={() => setTestChannel(ch)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Input Group */}
              <div className={styles.testInputGroup}>
                <label className={styles.testInputLabel}>
                  Send test {testChannel === 'in_app' ? 'in-app' : testChannel} to
                </label>
                <div className={styles.testInputWrapper}>
                  {testChannel === 'email' && <Mail size={15} color="#94a3b8" />}
                  {testChannel === 'sms' && <Smartphone size={15} color="#94a3b8" />}
                  {testChannel === 'push' && <Bell size={15} color="#94a3b8" />}
                  {testChannel === 'in_app' && <Bell size={15} color="#94a3b8" />}
                  <input
                    type="text"
                    className={styles.testInput}
                    value={testRecipient}
                    onChange={(e) => setTestRecipient(e.target.value)}
                    placeholder={
                      testChannel === 'email'
                        ? 'name@domain.com'
                        : testChannel === 'sms'
                        ? '+91 9876543210'
                        : 'Recipient Identifier'
                    }
                  />
                </div>
              </div>

              {/* Send Button */}
              <button
                type="button"
                className={styles.sendTestBtn}
                onClick={handleSendTest}
                disabled={sendingTest}
              >
                {sendingTest ? (
                  <Loader2 size={14} className={styles.spin} />
                ) : (
                  <Send size={14} />
                )}
                <span>
                  {sendingTest
                    ? 'Sending…'
                    : `Send Test ${testChannel === 'in_app' ? 'In-App' : testChannel.toUpperCase()}`}
                </span>
              </button>
            </div>

            {/* Card 2: Recent Notifications */}
            <div className={styles.sectionCard}>
              <div className={styles.cardHeader} style={{ marginBottom: 14 }}>
                <h3 className={styles.cardTitle} style={{ fontSize: 14.5 }}>
                  Recent Notifications
                </h3>
                {recentNotifs.length > 5 && (
                  <button
                    type="button"
                    className={styles.viewAllLink}
                    onClick={() => setShowAllRecent((p) => !p)}
                  >
                    {showAllRecent ? 'Show Less' : 'View All'}
                  </button>
                )}
              </div>

              <div className={styles.recentNotifList}>
                {displayedRecent.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#94a3b8', padding: '12px 0', textAlign: 'center' }}>
                    No recent notifications.
                  </div>
                ) : (
                  displayedRecent.map((item) => (
                    <div key={item.id} className={styles.recentNotifItem}>
                      {renderRecentBadge(item.type, item.title)}
                      <div className={styles.recentNotifContent}>
                        <div className={styles.recentNotifTitle}>{item.title}</div>
                        <div className={styles.recentNotifMsg}>{item.message}</div>
                      </div>
                      <div className={styles.recentNotifTime}>{item.relative_time}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Card 3: You're all set! */}
            <div className={styles.successCard}>
              <div className={styles.successIconCircle}>
                <Check size={18} strokeWidth={2.8} />
              </div>
              <div>
                <div className={styles.successTitle}>You&apos;re all set!</div>
                <div className={styles.successDesc}>
                  Your notification preferences are saved and active.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Toast Alert ───────────────────────────────────────────────────── */}
        {toastMessage && (
          <div className={styles.toastNotice}>
            <Check size={16} color="#34d399" />
            <span>{toastMessage}</span>
          </div>
        )}
      </div>
    </InstitutionShell>
  );
}
