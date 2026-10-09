'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  Cpu, Users, Box, SlidersHorizontal, ShieldCheck, FileText,
  Calendar, Download, TrendingUp, AlertTriangle,
  Search, CheckCircle2, XCircle, ChevronRight,
  Sparkles, DollarSign, Database, Shield, Zap, Lock,
  ChevronDown, HelpCircle, RefreshCw, Layers, Edit3, Settings,
  Eye, Copy, Check
} from 'lucide-react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import styles from './ai-usage.module.css';
import {
  institutionService,
  type AIOverviewResponse,
  type AIUserUsageResponse,
  type AIQuotasResponse,
  type AIFeaturesResponse,
  type AISecurityOverviewResponse,
  type AILogsResponse,
  type AIGovernanceConfig,
  type AIFeatureItem,
  type AIUserUsageItem,
  type AIQuotaItem,
  type AILogItem
} from '@/services/institution.service';

type TabKey = 'overview' | 'users' | 'quotas' | 'features' | 'safety' | 'logs';

export default function AIUsagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialTab = (searchParams.get('tab') as TabKey) || 'overview';

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [days, setDays] = useState<number>(30);
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Data states
  const [overview, setOverview] = useState<AIOverviewResponse | null>(null);
  const [usersData, setUsersData] = useState<AIUserUsageResponse | null>(null);
  const [quotasData, setQuotasData] = useState<AIQuotasResponse | null>(null);
  const [featuresData, setFeaturesData] = useState<AIFeaturesResponse | null>(null);
  const [securityData, setSecurityData] = useState<AISecurityOverviewResponse | null>(null);
  const [logsData, setLogsData] = useState<AILogsResponse | null>(null);

  // Filters & Sub-states
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [userPage, setUserPage] = useState<number>(1);
  const [userRowsPerPage, setUserRowsPerPage] = useState<number>(8);

  const [quotaRoleFilter, setQuotaRoleFilter] = useState<string>('all');
  const [quotaSearchQuery, setQuotaSearchQuery] = useState<string>('');
  const [quotaPage, setQuotaPage] = useState<number>(1);

  const [featureSearch, setFeatureSearch] = useState<string>('');
  const [featureCategoryFilter, setFeatureCategoryFilter] = useState<string>('all');
  const [featureRoleFilter, setFeatureRoleFilter] = useState<string>('all');
  const [featureStatusFilter, setFeatureStatusFilter] = useState<string>('all');
  const [selectedFeature, setSelectedFeature] = useState<AIFeatureItem | null>(null);
  const [featureTab, setFeatureTab] = useState<'overview' | 'roles' | 'settings' | 'stats'>('overview');

  // Logs filters & states
  const [logSearch, setLogSearch] = useState<string>('');
  const [logFeatureFilter, setLogFeatureFilter] = useState<string>('all');
  const [logStatusFilter, setLogStatusFilter] = useState<string>('all');
  const [logEventTypeFilter, setLogEventTypeFilter] = useState<string>('all');
  const [logUserFilter, setLogUserFilter] = useState<string>('all');
  const [logPage, setLogPage] = useState<number>(1);
  const [logRowsPerPage, setLogRowsPerPage] = useState<number>(10);
  const [selectedLog, setSelectedLog] = useState<AILogItem | null>(null);
  const [hoveredLogTrendIdx, setHoveredLogTrendIdx] = useState<number | null>(null);
  const [logModalOpen, setLogModalOpen] = useState<boolean>(false);

  // Modals
  const [quotaModalUser, setQuotaModalUser] = useState<{ id: string; name: string; current_quota: number } | null>(null);
  const [editQuotaVal, setEditQuotaVal] = useState<number>(50000);
  const [showBulkQuotaModal, setShowBulkQuotaModal] = useState<boolean>(false);
  const [bulkRole, setBulkRole] = useState<string>('student');
  const [bulkQuotaVal, setBulkQuotaVal] = useState<number>(100000);
  const [editFeatureModal, setEditFeatureModal] = useState<AIFeatureItem | null>(null);
  const [featureRateLimit, setFeatureRateLimit] = useState<number>(100);
  const [featureModel, setFeatureModel] = useState<string>('GPT-4o (Institution)');

  // Hover state for Trend Chart
  const [hoveredTrendIdx, setHoveredTrendIdx] = useState<number | null>(null);

  // Safe default fallback logs
  const getLogDateStr = (minutesAgo: number) => {
    const d = new Date(Date.now() - minutesAgo * 60000);
    const day = d.getDate();
    const mo = d.toLocaleDateString('en-US', { month: 'short' });
    const yr = d.getFullYear();
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${day} ${mo} ${yr}, ${time}`;
  };

  const DEFAULT_LOGS: AILogItem[] = [
    {
      id: '1',
      request_id: 'req_8f3a2d9e5c1b4f23',
      timestamp: getLogDateStr(5),
      user_name: 'Aryan Mehta',
      user_email: 'aryan.mehta@greenwood.edu',
      role: 'Student',
      event_type: 'AI Request',
      feature: 'Chat Assistant',
      model: 'GPT-4o',
      tokens: 1250,
      input_tokens: 1000,
      output_tokens: 250,
      status: 'Success',
      response_time: '2.3s',
      ip_address: '203.122.67.91',
      location: 'Bengaluru, India',
      prompt: 'Explain the concept of normal distribution with an example.',
      response: 'The normal distribution, also known as the Gaussian distribution, is a probability distribution that is symmetric about the mean, showing that data near the mean are more frequent in occurrence than data far from the mean.'
    },
    {
      id: '2',
      request_id: 'req_91b7e40a1d8c23e4',
      timestamp: getLogDateStr(12),
      user_name: 'Sneha Patil',
      user_email: 'sneha.p@greenwood.edu',
      role: 'TA',
      event_type: 'Quota Limit',
      feature: 'Answer Evaluation',
      model: '-',
      tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      status: 'Blocked',
      response_time: '0.5s',
      ip_address: '117.203.45.23',
      location: 'Pune, India',
      prompt: 'Batch evaluation of 45 lab submissions.',
      response: 'Request blocked: Monthly quota limit reached for current billing window.'
    },
    {
      id: '3',
      request_id: 'req_3a8c1f90e52b71d9',
      timestamp: getLogDateStr(18),
      user_name: 'Rohan Kulkarni',
      user_email: 'rohan.k@greenwood.edu',
      role: 'Student',
      event_type: 'Feature Access',
      feature: 'Code Help',
      model: 'Claude 3.5',
      tokens: 982,
      input_tokens: 780,
      output_tokens: 202,
      status: 'Success',
      response_time: '3.1s',
      ip_address: '103.21.54.88',
      location: 'Mumbai, India',
      prompt: 'How do I implement binary search in Python with edge case handling?',
      response: 'Here is an efficient O(log n) implementation of binary search in Python: def binary_search(arr, target): left, right = 0, len(arr) - 1...'
    },
    {
      id: '4',
      request_id: 'req_4d2e71c9a08f53b1',
      timestamp: getLogDateStr(26),
      user_name: 'Dr. Neha Iyer',
      user_email: 'neha.iyer@greenwood.edu',
      role: 'Instructor',
      event_type: 'AI Request',
      feature: 'Content Generation',
      model: 'GPT-4o',
      tokens: 2430,
      input_tokens: 1800,
      output_tokens: 630,
      status: 'Success',
      response_time: '4.2s',
      ip_address: '49.205.11.76',
      location: 'Chennai, India',
      prompt: 'Generate a 5-question quiz for Organic Chemistry lab on esterification.',
      response: 'Quiz: 1. Which catalyst is primarily used in Fischer esterification? 2. What is the role of anhydrous sodium sulfate?...'
    },
    {
      id: '5',
      request_id: 'req_5e1f82b0c97a44d2',
      timestamp: getLogDateStr(35),
      user_name: 'Pooja Krishna',
      user_email: 'pooja.k@greenwood.edu',
      role: 'Student',
      event_type: 'Auth Event',
      feature: 'Login',
      model: '-',
      tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      status: 'Success',
      response_time: '0.8s',
      ip_address: '157.48.19.102',
      location: 'Hyderabad, India',
      prompt: 'User authentication session token refreshed.',
      response: 'JWT token validated and extended for active session.'
    },
    {
      id: '6',
      request_id: 'req_6f0a93c1d86b55e3',
      timestamp: getLogDateStr(45),
      user_name: 'Amit Sharma',
      user_email: 'amit.s@greenwood.edu',
      role: 'Instructor',
      event_type: 'AI Request',
      feature: 'Data Analysis',
      model: 'GPT-4o',
      tokens: 3120,
      input_tokens: 2500,
      output_tokens: 620,
      status: 'Success',
      response_time: '5.8s',
      ip_address: '115.99.142.18',
      location: 'New Delhi, India',
      prompt: 'Compute regression line and correlation coefficient for titration data.',
      response: 'Regression Analysis: R² = 0.9942, Slope = 0.0482, Intercept = 0.12. Strong positive linear correlation confirmed.'
    },
    {
      id: '7',
      request_id: 'req_7a1b04d2e95c66f4',
      timestamp: getLogDateStr(60),
      user_name: 'Vikram Rao',
      user_email: 'vikram.r@greenwood.edu',
      role: 'Instructor',
      event_type: 'Error',
      feature: 'Image Analysis',
      model: 'DALL-E 3',
      tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      status: 'Failed',
      response_time: '1.2s',
      ip_address: '185.220.101.5',
      location: 'Frankfurt, DE',
      prompt: 'Verify logic gate diagram in submitted laboratory experiment.',
      response: 'Error 503: Upstream model service timeout. Retry initiated.'
    },
    {
      id: '8',
      request_id: 'req_8b2c15e3f04d77a5',
      timestamp: getLogDateStr(75),
      user_name: 'Nidhi Desai',
      user_email: 'nidhi.d@greenwood.edu',
      role: 'Student',
      event_type: 'AI Request',
      feature: 'Hint System',
      model: 'GPT-4o',
      tokens: 410,
      input_tokens: 320,
      output_tokens: 90,
      status: 'Success',
      response_time: '1.9s',
      ip_address: '223.176.12.34',
      location: 'Bengaluru, India',
      prompt: 'Student is stuck on step 4 of the RC circuit oscilloscope setup.',
      response: 'Hint: Make sure the probe ground clip is connected to circuit common ground, and set the timebase to 1ms/div.'
    },
    {
      id: '9',
      request_id: 'req_9c3d26f4a13e88b6',
      timestamp: getLogDateStr(90),
      user_name: 'TAs Group',
      user_email: 'tas@greenwood.edu',
      role: 'TA',
      event_type: 'System Event',
      feature: 'Model Updated',
      model: '-',
      tokens: 0,
      input_tokens: 0,
      output_tokens: 0,
      status: 'Success',
      response_time: '0.3s',
      ip_address: '127.0.0.1',
      location: 'Internal System',
      prompt: 'Feature configuration: Default model updated to GPT-4o.',
      response: 'Model configuration propagated across 12 AI services.'
    },
    {
      id: '10',
      request_id: 'req_0d4e37a5b24f99c7',
      timestamp: getLogDateStr(110),
      user_name: 'Aryan Mehta',
      user_email: 'aryan.mehta@greenwood.edu',
      role: 'Student',
      event_type: 'AI Request',
      feature: 'Viva Question',
      model: 'GPT-4o',
      tokens: 1875,
      input_tokens: 1400,
      output_tokens: 475,
      status: 'Success',
      response_time: '3.8s',
      ip_address: '203.122.67.91',
      location: 'Bengaluru, India',
      prompt: 'Generate viva questions for digital signal processing Butterworth filter.',
      response: '1. Why is the Butterworth filter known as a maximally flat filter? 2. How does the order of the filter affect the roll-off rate?'
    }
  ];

  const logKpis = {
    total_logs: logsData?.kpis?.total_logs || { value: '124,832', change: '+18% vs. last 30 days' },
    unique_users: logsData?.kpis?.unique_users || { value: '428', change: '+12%' },
    total_tokens: logsData?.kpis?.total_tokens || { value: '5.4M', change: '+25%' },
    failed_requests: logsData?.kpis?.failed_requests || { value: '342', change: '+6%' },
  };

  const logActivityTrend = logsData?.activity_trend && logsData.activity_trend.length > 0 ? logsData.activity_trend : [
    ...[6, 5, 4, 3, 2, 1, 0].map(daysAgo => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      const iso = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      return {
        date: iso,
        label,
        total_requests: 4000 + (6 - daysAgo) * 750,
        successful: 3800 + (6 - daysAgo) * 710,
        failed: 200 + (6 - daysAgo) * 40,
        avg_response_time: 2.2
      };
    })
  ];

  const logEventBreakdown = logsData?.event_type_breakdown && logsData.event_type_breakdown.length > 0 ? logsData.event_type_breakdown : [
    { name: 'AI Request', percent: 68, color: '#7c3aed' },
    { name: 'Quota Limit', percent: 12, color: '#3b82f6' },
    { name: 'Feature Access', percent: 8, color: '#10b981' },
    { name: 'Auth Events', percent: 6, color: '#f59e0b' },
    { name: 'Errors', percent: 4, color: '#ef4444' },
    { name: 'System Events', percent: 2, color: '#64748b' }
  ];

  const logList = logsData?.logs && logsData.logs.length > 0 ? logsData.logs : DEFAULT_LOGS;
  const currentActiveLog = selectedLog || logList[0];
  const totalLogsCount = logsData?.total || 124832;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard!`);
  };

  // Sync tab with URL
  const switchTab = (tab: TabKey) => {
    setActiveTab(tab);
    router.replace(`/institution/ai-usage?tab=${tab}`, { scroll: false });
  };

  // ── 1. Fetch Data on Tab Switch — through the react-query cache ──────────
  // Each fetcher keys its payload by the filters actually used, so revisiting
  // a tab (or a previously-typed search) renders instantly from cache and the
  // tab-effect + debounce-effect double-fetch collapses into one deduped call.
  const cachedFetch = useCallback(<T,>(key: unknown[], fn: () => Promise<T>, staleMs = 30 * 1000) =>
    queryClient.fetchQuery<T>({
      queryKey: ['institution', 'ai-usage', ...key],
      queryFn: fn,
      staleTime: staleMs,
    }), [queryClient]);

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cachedFetch(['overview', days], () => institutionService.getAIOverview(days));
      setOverview(res);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to load AI overview');
    } finally {
      setLoading(false);
    }
  }, [days, cachedFetch]);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cachedFetch(
        ['users', userRoleFilter, userSearchQuery, userPage, userRowsPerPage],
        () => institutionService.getAIUsers({
          role: userRoleFilter,
          q: userSearchQuery,
          page: userPage,
          per_page: userRowsPerPage
        }));
      setUsersData(res);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to load user usage');
    } finally {
      setLoading(false);
    }
  }, [userRoleFilter, userSearchQuery, userPage, userRowsPerPage, cachedFetch]);

  const fetchQuotas = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cachedFetch(['quotas'], () => institutionService.getAIQuotas());
      setQuotasData(res);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to load quota data');
    } finally {
      setLoading(false);
    }
  }, [cachedFetch]);

  const fetchFeatures = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cachedFetch(['features'], () => institutionService.getAIFeatures(), 5 * 60 * 1000);
      setFeaturesData(res);
      if (!selectedFeature && res.features.length > 0) {
        setSelectedFeature(res.features[0]);
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to load AI features');
    } finally {
      setLoading(false);
    }
  }, [selectedFeature, cachedFetch]);

  const fetchSecurity = useCallback(async () => {
    try {
      setLoading(true);
      // Same key the Security & Compliance page uses — the two pages share one
      // cached copy instead of each fetching their own.
      const res = await queryClient.fetchQuery({
        queryKey: ['institution', 'ai-security'],
        queryFn: () => institutionService.getAISecurity(),
        staleTime: 30 * 1000,
      });
      setSecurityData(res);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to load security overview');
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await cachedFetch(
        ['logs', logFeatureFilter, logStatusFilter, logSearch, logPage, logRowsPerPage],
        () => institutionService.getAILogs({
          feature: logFeatureFilter,
          status: logStatusFilter,
          q: logSearch,
          page: logPage,
          per_page: logRowsPerPage
        }));
      setLogsData(res);
      if (res.logs && res.logs.length > 0) {
        setSelectedLog(prev => prev ? (res.logs.find(l => l.id === prev.id) || res.logs[0]) : res.logs[0]);
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [logFeatureFilter, logStatusFilter, logSearch, logPage, logRowsPerPage, cachedFetch]);

  // Mutation helpers: drop this page's cached entries so the next fetcher call
  // sees fresh server state (fetchQuery refetches when there's no cache).
  const invalidateAI = () =>
    queryClient.invalidateQueries({ queryKey: ['institution', 'ai-usage'] });

  // Trigger appropriate fetch
  useEffect(() => {
    if (activeTab === 'overview') fetchOverview();
    else if (activeTab === 'users') fetchUsers();
    else if (activeTab === 'quotas') fetchQuotas();
    else if (activeTab === 'features') fetchFeatures();
    else if (activeTab === 'safety') fetchSecurity();
    else if (activeTab === 'logs') fetchLogs();
  }, [activeTab, days, fetchOverview, fetchUsers, fetchQuotas, fetchFeatures, fetchSecurity, fetchLogs]);

  // Debounced search trigger for Users
  useEffect(() => {
    if (activeTab === 'users') {
      const timer = setTimeout(() => {
        fetchUsers();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [userSearchQuery, userRoleFilter, userPage, userRowsPerPage, fetchUsers]);

  // Debounced search trigger for Logs
  useEffect(() => {
    if (activeTab === 'logs') {
      const timer = setTimeout(() => {
        fetchLogs();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [logSearch, logFeatureFilter, logStatusFilter, logEventTypeFilter, logUserFilter, logPage, logRowsPerPage, fetchLogs]);

  // ── 2. Governance Live Toggle Handler ──────────────────────────────────────
  const handleGovernanceToggle = async (key: keyof AIGovernanceConfig) => {
    if (!overview) return;
    const currentVal = overview.governance[key];
    const updated = !currentVal;

    // Optimistic UI update
    setOverview({
      ...overview,
      governance: {
        ...overview.governance,
        [key]: updated
      }
    });

    try {
      await institutionService.updateAIGovernance({ [key]: updated });
      invalidateAI();
      showToast(`Governance setting "${key}" updated!`);
    } catch (err: any) {
      // Revert on error
      setOverview({
        ...overview,
        governance: {
          ...overview.governance,
          [key]: currentVal
        }
      });
      showToast(err?.response?.data?.error || 'Failed to update governance');
    }
  };

  // ── 3. Feature Enable/Disable Toggle Handler ───────────────────────────────
  const handleFeatureToggle = async (feature: AIFeatureItem) => {
    const updatedStatus = !feature.enabled;
    if (featuresData) {
      setFeaturesData({
        ...featuresData,
        features: featuresData.features.map(f => f.id === feature.id ? { ...f, enabled: updatedStatus } : f)
      });
    }
    if (selectedFeature && selectedFeature.id === feature.id) {
      setSelectedFeature({ ...selectedFeature, enabled: updatedStatus });
    }

    try {
      await institutionService.updateAIFeature(feature.feature_id, { enabled: updatedStatus });
      invalidateAI();
      showToast(`Feature "${feature.name}" ${updatedStatus ? 'enabled' : 'disabled'}`);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to update feature');
      fetchFeatures();
    }
  };

  // ── 4. Quota Actions ──────────────────────────────────────────────────────
  const handleSaveIndividualQuota = async () => {
    if (!quotaModalUser) return;
    try {
      await institutionService.updateUserQuota(quotaModalUser.id, editQuotaVal);
      showToast(`Quota updated for ${quotaModalUser.name}`);
      setQuotaModalUser(null);
      invalidateAI();
      if (activeTab === 'users') fetchUsers();
      if (activeTab === 'quotas') fetchQuotas();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to update quota');
    }
  };

  const handleResetUserQuota = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to reset current usage for ${userName}?`)) return;
    try {
      await institutionService.resetUserQuota(userId);
      showToast(`Usage reset for ${userName}`);
      invalidateAI();
      if (activeTab === 'users') fetchUsers();
      if (activeTab === 'quotas') fetchQuotas();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to reset quota');
    }
  };

  const handleBulkUpdateQuotas = async () => {
    try {
      await institutionService.bulkUpdateQuotas({
        role: bulkRole,
        monthly_token_quota: bulkQuotaVal
      });
      showToast(`Bulk updated quotas for all ${bulkRole}s!`);
      setShowBulkQuotaModal(false);
      invalidateAI();
      if (activeTab === 'quotas') fetchQuotas();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to bulk update quotas');
    }
  };

  // ── 5. Feature Configuration Save ──────────────────────────────────────────
  const handleSaveFeatureConfig = async () => {
    if (!editFeatureModal) return;
    try {
      await institutionService.updateAIFeature(editFeatureModal.feature_id, {
        rate_limit_per_hour: featureRateLimit,
        default_model: featureModel
      });
      showToast(`Updated configuration for ${editFeatureModal.name}`);
      setEditFeatureModal(null);
      invalidateAI();
      fetchFeatures();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to update feature configuration');
    }
  };

  // ── 6. Export CSV ──────────────────────────────────────────────────────────
  const handleExportCSV = async () => {
    try {
      showToast('Preparing AI usage export report...');
      await institutionService.downloadAIExport();
      showToast('Export downloaded successfully!');
    } catch (err: any) {
      showToast('Failed to export AI usage report');
    }
  };

  // Helper formatting
  const formatNum = (n: number) => n?.toLocaleString() ?? '0';

  return (
    <InstitutionShell activePage="AI & Usage" title="AI & Usage" subtitle="Control, monitor, and optimize AI features across your institution.">
      {/* Floating Toast Notification */}
      {toast && (
        <div className={styles.toast}>
          <Sparkles size={16} /> {toast}
        </div>
      )}

      <div className={styles.container}>
        {/* ══ TOP HEADER ══ */}
        <div className={styles.headerRow}>
          <div className={styles.titleArea}>
            <div className={styles.pageIconBadge}>
              <Cpu size={26} strokeWidth={2.2} />
            </div>
            <div>
              <h1 className={styles.pageTitle}>AI &amp; Usage</h1>
              <p className={styles.pageSubtitle}>Control, monitor, and optimize AI features across your institution.</p>
            </div>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.timeframeSelector} onClick={() => setDays(d => d === 30 ? 7 : d === 7 ? 90 : 30)}>
              <Calendar size={14} />
              <span>Last {days} days</span>
              <ChevronDown size={13} />
            </div>

            <button className={styles.exportBtn} onClick={handleExportCSV}>
              <Download size={14} />
              <span>Export Report</span>
            </button>
          </div>
        </div>

        {/* ══ SUB-NAVIGATION PILL BAR ══ */}
        <div className={styles.navPillBar}>
          <button
            className={`${styles.navPill} ${activeTab === 'overview' ? styles.navPillActive : ''}`}
            onClick={() => switchTab('overview')}
          >
            <Sparkles size={15} />
            <span>Overview</span>
          </button>
          <button
            className={`${styles.navPill} ${activeTab === 'users' ? styles.navPillActive : ''}`}
            onClick={() => switchTab('users')}
          >
            <Users size={15} />
            <span>User Usage</span>
          </button>
          <button
            className={`${styles.navPill} ${activeTab === 'quotas' ? styles.navPillActive : ''}`}
            onClick={() => switchTab('quotas')}
          >
            <Box size={15} />
            <span>Quota Management</span>
          </button>
          <button
            className={`${styles.navPill} ${activeTab === 'features' ? styles.navPillActive : ''}`}
            onClick={() => switchTab('features')}
          >
            <SlidersHorizontal size={15} />
            <span>Feature Controls</span>
          </button>
          <button
            className={`${styles.navPill} ${activeTab === 'safety' ? styles.navPillActive : ''}`}
            onClick={() => switchTab('safety')}
          >
            <ShieldCheck size={15} />
            <span>Safety &amp; Compliance</span>
          </button>
          <button
            className={`${styles.navPill} ${activeTab === 'logs' ? styles.navPillActive : ''}`}
            onClick={() => switchTab('logs')}
          >
            <FileText size={15} />
            <span>Logs</span>
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 1: OVERVIEW (Matching Image 1)
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && overview && (
          <>
            {/* Top 5 KPI Cards */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Total AI Calls</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                    <Zap size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{overview.kpis.total_calls.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} />
                  <span>{overview.kpis.total_calls.change}</span>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Active Users</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dcfce7', color: '#16a34a' }}>
                    <Users size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{overview.kpis.active_users.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} />
                  <span>{overview.kpis.active_users.change}</span>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Total Tokens</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dbeafe', color: '#2563eb' }}>
                    <Database size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{overview.kpis.total_tokens.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} />
                  <span>{overview.kpis.total_tokens.change}</span>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Estimated Cost</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#fef3c7', color: '#d97706' }}>
                    <DollarSign size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{overview.kpis.estimated_cost.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeWarn}`}>
                  <TrendingUp size={12} />
                  <span>{overview.kpis.estimated_cost.change}</span>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Blocked Requests</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#fee2e2', color: '#dc2626' }}>
                    <Shield size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{overview.kpis.blocked_requests.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeDanger}`}>
                  <AlertTriangle size={12} />
                  <span>{overview.kpis.blocked_requests.change}</span>
                </div>
              </div>
            </div>

            {/* Row 2: Trend Chart, Donut Breakdown, Governance Live Toggles */}
            <div className={styles.dashboardMainRow}>
              {/* AI Usage Trend Chart */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>AI Usage Trend</h3>
                    <span className={styles.cardSubtitle}>Daily calls and active user trajectory</span>
                  </div>
                  <div className={styles.chartControls}>
                    <div className={styles.chartLegend}>
                      <span><span className={styles.legendDot} style={{ background: '#7c3aed' }} />Total Calls</span>
                      <span><span className={styles.legendDot} style={{ background: '#06b6d4' }} />Unique Users</span>
                    </div>
                  </div>
                </div>

                {/* SVG Trend Line Chart */}
                <div className={styles.chartContainer}>
                  {overview.trend && overview.trend.length > 0 && (
                    <TrendLineChart
                      data={overview.trend}
                      hoveredIdx={hoveredTrendIdx}
                      onHover={setHoveredTrendIdx}
                    />
                  )}
                </div>
              </div>

              {/* Usage by Feature (Donut Chart) */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Usage by Feature</h3>
                    <span className={styles.cardSubtitle}>Breakdown across LLM services</span>
                  </div>
                </div>

                <div className={styles.donutWrapper}>
                  <div className={styles.donutSvgBox}>
                    <DonutChart data={overview.feature_breakdown} />
                    <div className={styles.donutCenterText}>
                      <div className={styles.donutCenterValue}>{overview.kpis.total_calls.value}</div>
                      <div className={styles.donutCenterLabel}>Total Calls</div>
                    </div>
                  </div>

                  <div className={styles.donutLegend}>
                    {overview.feature_breakdown.map((item, idx) => (
                      <div key={idx} className={styles.donutLegendItem}>
                        <div className={styles.donutLegendLeft}>
                          <span className={styles.legendDot} style={{ background: item.color }} />
                          <span>{item.feature}</span>
                        </div>
                        <span className={styles.donutLegendPct}>{item.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Governance Live Controls */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>AI Governance</h3>
                    <span className={styles.cardSubtitle}>Global institutional policies</span>
                  </div>
                  <button className={styles.cardAction} onClick={() => switchTab('features')}>
                    <Edit3 size={12} /> Edit
                  </button>
                </div>

                <div className={styles.governanceList}>
                  <div className={styles.governanceItem}>
                    <div className={styles.govInfo}>
                      <span className={styles.govTitle}>AI Master Switch</span>
                      <span className={styles.govDesc}>Enable or disable all AI features globally</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={overview.governance.ai_master_switch}
                        onChange={() => handleGovernanceToggle('ai_master_switch')}
                      />
                      <span className={styles.slider} />
                    </label>
                  </div>

                  <div className={styles.governanceItem}>
                    <div className={styles.govInfo}>
                      <span className={styles.govTitle}>Allow for Students</span>
                      <span className={styles.govDesc}>Let students use AI features</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={overview.governance.allow_students}
                        onChange={() => handleGovernanceToggle('allow_students')}
                      />
                      <span className={styles.slider} />
                    </label>
                  </div>

                  <div className={styles.governanceItem}>
                    <div className={styles.govInfo}>
                      <span className={styles.govTitle}>Allow for Instructors</span>
                      <span className={styles.govDesc}>Let Instructors use AI features</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={overview.governance.allow_instructors}
                        onChange={() => handleGovernanceToggle('allow_instructors')}
                      />
                      <span className={styles.slider} />
                    </label>
                  </div>

                  <div className={styles.governanceItem}>
                    <div className={styles.govInfo}>
                      <span className={styles.govTitle}>Content Safety Filter</span>
                      <span className={styles.govDesc}>Block harmful or inappropriate content</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={overview.governance.content_safety_filter}
                        onChange={() => handleGovernanceToggle('content_safety_filter')}
                      />
                      <span className={styles.slider} />
                    </label>
                  </div>

                  <div className={styles.governanceItem}>
                    <div className={styles.govInfo}>
                      <span className={styles.govTitle}>Data Retention</span>
                      <span className={styles.govDesc}>Store conversation data for improvement</span>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={overview.governance.data_retention}
                        onChange={() => handleGovernanceToggle('data_retention')}
                      />
                      <span className={styles.slider} />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Top Users Table & Quick Actions */}
            <div className={styles.twoColGrid}>
              {/* Top Users Table */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <h3 className={styles.cardTitle}>Top Users by AI Usage</h3>
                    <div className={styles.filterPills}>
                      <button
                        className={`${styles.filterPill} ${userRoleFilter === 'all' ? styles.filterPillActive : ''}`}
                        onClick={() => setUserRoleFilter('all')}
                      >
                        All Users
                      </button>
                      <button
                        className={`${styles.filterPill} ${userRoleFilter === 'student' ? styles.filterPillActive : ''}`}
                        onClick={() => setUserRoleFilter('student')}
                      >
                        Students
                      </button>
                      <button
                        className={`${styles.filterPill} ${userRoleFilter === 'instructor' ? styles.filterPillActive : ''}`}
                        onClick={() => setUserRoleFilter('instructor')}
                      >
                        Instructors
                      </button>
                    </div>
                  </div>

                  <button className={styles.cardAction} onClick={() => switchTab('users')}>
                    View All <ChevronRight size={13} />
                  </button>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>User</th>
                        <th>Role</th>
                        <th>Calls</th>
                        <th>Tokens</th>
                        <th>Est. Cost</th>
                        <th>Last Used</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overview.top_users
                        .filter(u => userRoleFilter === 'all' || u.role?.toLowerCase() === userRoleFilter)
                        .slice(0, 5)
                        .map((u, i) => (
                          <tr key={i}>
                            <td>{u.rank || i + 1}</td>
                            <td>
                              <div className={styles.userCell}>
                                <div className={styles.avatar}>
                                  {u.name?.slice(0, 2).toUpperCase() || 'US'}
                                </div>
                                <div>
                                  <div className={styles.userName}>{u.name}</div>
                                  <div className={styles.userEmail}>{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`${styles.roleBadge} ${u.role?.toLowerCase() === 'instructor' ? styles.roleInstructor : styles.roleStudent}`}>
                                {u.role}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600 }}>{formatNum(u.calls)}</td>
                            <td>{u.tokens}</td>
                            <td>{u.est_cost}</td>
                            <td>{u.last_used}</td>
                            <td>
                              <button
                                className={styles.actionBtn}
                                onClick={() => switchTab('users')}
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Quick Actions Sidebar Card */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Quick Actions</h3>
                </div>

                <div className={styles.quickActionsList}>
                  <div className={styles.quickActionItem} onClick={() => switchTab('quotas')}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><Users size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Set User Quota</div>
                        <div className={styles.quickActionSubtitle}>Define monthly limits for users</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>

                  <div className={styles.quickActionItem} onClick={() => switchTab('features')}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><SlidersHorizontal size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Manage Feature Access</div>
                        <div className={styles.quickActionSubtitle}>Enable/disable specific AI features</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>

                  <div className={styles.quickActionItem} onClick={() => switchTab('logs')}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><FileText size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>View Detailed Logs</div>
                        <div className={styles.quickActionSubtitle}>See all AI requests and responses</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>

                  <div className={styles.quickActionItem} onClick={handleExportCSV}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><Download size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Export Usage Report</div>
                        <div className={styles.quickActionSubtitle}>Download usage data (CSV)</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>
                </div>
              </div>
            </div>

            {/* Row 4: Quota Usage, Department Breakdown, Recent Activity */}
            <div className={styles.threeColGrid}>
              {/* Quota Usage */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Quota Usage</h3>
                  <button className={styles.cardAction} onClick={() => switchTab('quotas')}>
                    Manage <ChevronRight size={12} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: '#1e1b4b' }}>Institution Quota</span>
                      <span style={{ color: '#64748b' }}>
                        {overview.quota_usage.institution.used_formatted} / {overview.quota_usage.institution.limit_formatted}
                      </span>
                    </div>
                    <div className={styles.quotaBarWrapper}>
                      <div className={styles.progressBarBg}>
                        <div
                          className={`${styles.progressBarFill} ${styles.progressFillPurple}`}
                          style={{ width: `${overview.quota_usage.institution.percent}%` }}
                        />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>
                        {overview.quota_usage.institution.percent}%
                      </span>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: '#1e1b4b' }}>Student Quota (per user)</span>
                      <span style={{ color: '#64748b' }}>
                        {overview.quota_usage.student_avg.used_formatted} / {overview.quota_usage.student_avg.limit_formatted}
                      </span>
                    </div>
                    <div className={styles.quotaBarWrapper}>
                      <div className={styles.progressBarBg}>
                        <div
                          className={`${styles.progressBarFill} ${styles.progressFillBlue}`}
                          style={{ width: `${overview.quota_usage.student_avg.percent}%` }}
                        />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>
                        {overview.quota_usage.student_avg.percent}%
                      </span>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ fontWeight: 600, color: '#1e1b4b' }}>Instructor Quota (per user)</span>
                      <span style={{ color: '#64748b' }}>
                        {overview.quota_usage.instructor_avg.used_formatted} / {overview.quota_usage.instructor_avg.limit_formatted}
                      </span>
                    </div>
                    <div className={styles.quotaBarWrapper}>
                      <div className={styles.progressBarBg}>
                        <div
                          className={`${styles.progressBarFill} ${styles.progressFillGreen}`}
                          style={{ width: `${overview.quota_usage.instructor_avg.percent}%` }}
                        />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>
                        {overview.quota_usage.instructor_avg.percent}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Usage by Department */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Usage by Department</h3>
                  <button className={styles.cardAction} onClick={() => switchTab('users')}>
                    View All <ChevronRight size={12} />
                  </button>
                </div>

                <div className={styles.deptList}>
                  {overview.department_usage.map((d, i) => (
                    <div key={i} className={styles.deptItem}>
                      <div className={styles.deptHeader}>
                        <span>{d.name}</span>
                        <span className={styles.deptPct}>{d.percent}%</span>
                      </div>
                      <div className={styles.progressBarBg}>
                        <div
                          className={`${styles.progressBarFill}`}
                          style={{ width: `${d.percent}%`, background: d.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent AI Activity */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Recent AI Activity</h3>
                  <button className={styles.cardAction} onClick={() => switchTab('logs')}>
                    View All <ChevronRight size={12} />
                  </button>
                </div>

                <div className={styles.activityList}>
                  {overview.recent_activity.map((act, i) => (
                    <div key={i} className={styles.activityItem}>
                      <div
                        className={styles.activityIcon}
                        style={{
                          background: act.color ? `${act.color}15` : '#ede9fe',
                          color: act.color || '#7c3aed'
                        }}
                      >
                        {act.type === 'flagged' ? <AlertTriangle size={15} /> : <Sparkles size={15} />}
                      </div>
                      <div className={styles.activityBody}>
                        <div className={styles.activityAction}>{act.title}</div>
                        <div className={styles.activityMeta}>{act.user} · {act.time}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 2: USER USAGE (Matching Image 2)
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'users' && usersData && (
          <>
            {/* 5 User KPIs */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Total Users</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                    <Users size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{usersData.kpis.total_users}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} /> +12% <span className={styles.kpiBadgeSubtitle}>vs. last 30 days</span>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Active Users</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dcfce7', color: '#16a34a' }}>
                    <Zap size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{usersData.kpis.active_users}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} /> +18% <span className={styles.kpiBadgeSubtitle}>active this month</span>
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Total API Calls</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dbeafe', color: '#2563eb' }}>
                    <Database size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{usersData.kpis.total_api_calls}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} /> +25%
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Total Tokens Used</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                    <Database size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{usersData.kpis.total_tokens_used}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} /> +28%
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Estimated Cost</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#fef3c7', color: '#d97706' }}>
                    <DollarSign size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{usersData.kpis.estimated_cost}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeWarn}`}>
                  <TrendingUp size={12} /> +12%
                </div>
              </div>
            </div>

            {/* Row 2: Trend Chart, Usage by Role donut, Top Features */}
            <div className={styles.dashboardMainRow}>
              {/* Trend Chart */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Usage Trend</h3>
                    <span className={styles.cardSubtitle}>User calls &amp; unique activity</span>
                  </div>
                  <div className={styles.chartLegend}>
                    <span><span className={styles.legendDot} style={{ background: '#7c3aed' }} />Total Calls</span>
                    <span><span className={styles.legendDot} style={{ background: '#06b6d4' }} />Unique Users</span>
                  </div>
                </div>

                <div className={styles.chartContainer}>
                  {overview?.trend && (
                    <TrendLineChart
                      data={overview.trend}
                      hoveredIdx={hoveredTrendIdx}
                      onHover={setHoveredTrendIdx}
                    />
                  )}
                </div>
              </div>

              {/* Usage by Role Donut */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Usage by Role</h3>
                    <span className={styles.cardSubtitle}>Distribution across user types</span>
                  </div>
                </div>

                <div className={styles.donutWrapper}>
                  <div className={styles.donutSvgBox}>
                    <DonutChart
                      data={[
                        { feature: 'Students', count: 64, percent: 64, color: '#7c3aed' },
                        { feature: 'Instructors', count: 24, percent: 24, color: '#3b82f6' },
                        { feature: 'TAs', count: 8, percent: 8, color: '#10b981' },
                        { feature: 'Admins', count: 4, percent: 4, color: '#f59e0b' }
                      ]}
                    />
                    <div className={styles.donutCenterText}>
                      <div className={styles.donutCenterValue}>{usersData.kpis.total_api_calls}</div>
                      <div className={styles.donutCenterLabel}>Total Calls</div>
                    </div>
                  </div>

                  <div className={styles.donutLegend}>
                    <div className={styles.donutLegendItem}>
                      <div className={styles.donutLegendLeft}>
                        <span className={styles.legendDot} style={{ background: '#7c3aed' }} />
                        <span>Students</span>
                      </div>
                      <span className={styles.donutLegendPct}>64%</span>
                    </div>
                    <div className={styles.donutLegendItem}>
                      <div className={styles.donutLegendLeft}>
                        <span className={styles.legendDot} style={{ background: '#3b82f6' }} />
                        <span>Instructors</span>
                      </div>
                      <span className={styles.donutLegendPct}>24%</span>
                    </div>
                    <div className={styles.donutLegendItem}>
                      <div className={styles.donutLegendLeft}>
                        <span className={styles.legendDot} style={{ background: '#10b981' }} />
                        <span>TAs</span>
                      </div>
                      <span className={styles.donutLegendPct}>8%</span>
                    </div>
                    <div className={styles.donutLegendItem}>
                      <div className={styles.donutLegendLeft}>
                        <span className={styles.legendDot} style={{ background: '#f59e0b' }} />
                        <span>Admins</span>
                      </div>
                      <span className={styles.donutLegendPct}>4%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Top Features */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Top Features</h3>
                </div>

                <div className={styles.deptList}>
                  {overview?.feature_breakdown.slice(0, 6).map((f, i) => (
                    <div key={i} className={styles.deptItem}>
                      <div className={styles.deptHeader}>
                        <span>{f.feature}</span>
                        <span className={styles.deptPct}>{f.percent}%</span>
                      </div>
                      <div className={styles.progressBarBg}>
                        <div
                          className={`${styles.progressBarFill}`}
                          style={{ width: `${f.percent}%`, background: f.color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 3: Users Table & Quota Sidebar */}
            <div className={styles.twoColGrid}>
              {/* Users Table */}
              <div className={styles.card}>
                <div className={styles.tableFilterRow}>
                  <div className={styles.filterPills}>
                    {['all', 'students', 'instructors', 'tas', 'admins'].map(r => (
                      <button
                        key={r}
                        className={`${styles.filterPill} ${userRoleFilter === r ? styles.filterPillActive : ''}`}
                        onClick={() => {
                          setUserRoleFilter(r);
                          setUserPage(1);
                        }}
                      >
                        {r === 'all' ? 'All Users' : r.charAt(0).toUpperCase() + r.slice(1)}
                      </button>
                    ))}
                  </div>

                  <div className={styles.searchBox}>
                    <Search size={14} color="#94a3b8" />
                    <input
                      type="text"
                      placeholder="Search users by name or email..."
                      value={userSearchQuery}
                      onChange={e => setUserSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>User</th>
                        <th>Role</th>
                        <th>Department</th>
                        <th>Total Calls</th>
                        <th>Tokens Used</th>
                        <th>Est. Cost</th>
                        <th>Last Active</th>
                        <th>Quota Usage</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersData.users.map((u, i) => {
                        const usagePct = u.quota_percent || 0;
                        const isWarning = usagePct >= 90;
                        return (
                          <tr key={u.id}>
                            <td>{(userPage - 1) * userRowsPerPage + i + 1}</td>
                            <td>
                              <div className={styles.userCell}>
                                <div className={styles.avatar}>
                                  {u.name?.slice(0, 2).toUpperCase() || 'US'}
                                </div>
                                <div>
                                  <div className={styles.userName}>{u.name}</div>
                                  <div className={styles.userEmail}>{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`${styles.roleBadge} ${
                                u.role.toLowerCase() === 'instructor' ? styles.roleInstructor :
                                u.role.toLowerCase() === 'ta' ? styles.roleTA :
                                u.role.toLowerCase().includes('admin') ? styles.roleAdmin : styles.roleStudent
                              }`}>
                                {u.role}
                              </span>
                            </td>
                            <td>{u.department}</td>
                            <td style={{ fontWeight: 600 }}>{formatNum(u.total_calls)}</td>
                            <td>{u.tokens_used}</td>
                            <td>{u.est_cost}</td>
                            <td>{u.last_active}</td>
                            <td>
                              <div className={styles.quotaBarWrapper}>
                                <div className={styles.progressBarBg}>
                                  <div
                                    className={`${styles.progressBarFill} ${
                                      isWarning ? styles.progressFillRed :
                                      usagePct >= 70 ? styles.progressFillOrange : styles.progressFillPurple
                                    }`}
                                    style={{ width: `${Math.min(usagePct, 100)}%` }}
                                  />
                                </div>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: isWarning ? '#ef4444' : '#1e1b4b' }}>
                                  {usagePct}%
                                </span>
                              </div>
                            </td>
                            <td>
                              <span className={`${styles.statusBadge} ${isWarning ? styles.statusWarning : styles.statusActive}`}>
                                <span className={styles.statusDot} />
                                {u.status}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button
                                  className={styles.actionBtn}
                                  onClick={() => {
                                    setQuotaModalUser({ id: u.id, name: u.name, current_quota: u.tokens_used_raw });
                                    setEditQuotaVal(50000);
                                  }}
                                >
                                  Quota
                                </button>
                                <button
                                  className={styles.iconBtn}
                                  title="Reset Quota"
                                  onClick={() => handleResetUserQuota(u.id, u.name)}
                                >
                                  <RefreshCw size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className={styles.paginationRow}>
                  <span>Showing {(userPage - 1) * userRowsPerPage + 1}-{Math.min(userPage * userRowsPerPage, usersData.total)} of {usersData.total} users</span>
                  <div className={styles.paginationControls}>
                    <button
                      className={`${styles.pageBtn} ${userPage === 1 ? styles.pageBtnDisabled : ''}`}
                      disabled={userPage === 1}
                      onClick={() => setUserPage(p => p - 1)}
                    >
                      &lt;
                    </button>
                    {Array.from({ length: Math.min(Math.ceil(usersData.total / userRowsPerPage), 5) }).map((_, idx) => (
                      <button
                        key={idx}
                        className={`${styles.pageBtn} ${userPage === idx + 1 ? styles.pageBtnActive : ''}`}
                        onClick={() => setUserPage(idx + 1)}
                      >
                        {idx + 1}
                      </button>
                    ))}
                    <button
                      className={`${styles.pageBtn} ${userPage >= Math.ceil(usersData.total / userRowsPerPage) ? styles.pageBtnDisabled : ''}`}
                      disabled={userPage >= Math.ceil(usersData.total / userRowsPerPage)}
                      onClick={() => setUserPage(p => p + 1)}
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              </div>

              {/* Sidebar: Quota Management & Quick Actions */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Quota Management</h3>
                  </div>
                  <div className={styles.quickActionsList}>
                    <div className={styles.quickActionItem} onClick={() => switchTab('quotas')}>
                      <div className={styles.quickActionLeft}>
                        <div className={styles.quickActionIcon}><Box size={16} /></div>
                        <div>
                          <div className={styles.quickActionTitle}>Set Individual Quota</div>
                          <div className={styles.quickActionSubtitle}>Custom limit per user</div>
                        </div>
                      </div>
                      <ChevronRight size={14} color="#94a3b8" />
                    </div>

                    <div className={styles.quickActionItem} onClick={() => setShowBulkQuotaModal(true)}>
                      <div className={styles.quickActionLeft}>
                        <div className={styles.quickActionIcon}><Layers size={16} /></div>
                        <div>
                          <div className={styles.quickActionTitle}>Bulk Update Quotas</div>
                          <div className={styles.quickActionSubtitle}>Update by role or department</div>
                        </div>
                      </div>
                      <ChevronRight size={14} color="#94a3b8" />
                    </div>

                    <div className={styles.quickActionItem} onClick={() => switchTab('quotas')}>
                      <div className={styles.quickActionLeft}>
                        <div className={styles.quickActionIcon}><Settings size={16} /></div>
                        <div>
                          <div className={styles.quickActionTitle}>Quota Templates</div>
                          <div className={styles.quickActionSubtitle}>Standard role allocations</div>
                        </div>
                      </div>
                      <ChevronRight size={14} color="#94a3b8" />
                    </div>
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Quick Actions</h3>
                  </div>
                  <div className={styles.quickActionsList}>
                    <div className={styles.quickActionItem} onClick={handleExportCSV}>
                      <div className={styles.quickActionLeft}>
                        <div className={styles.quickActionIcon}><Download size={16} /></div>
                        <div>
                          <div className={styles.quickActionTitle}>Export User Usage (CSV)</div>
                          <div className={styles.quickActionSubtitle}>Download detailed user rows</div>
                        </div>
                      </div>
                      <ChevronRight size={14} color="#94a3b8" />
                    </div>

                    <div className={styles.quickActionItem} onClick={() => switchTab('logs')}>
                      <div className={styles.quickActionLeft}>
                        <div className={styles.quickActionIcon}><FileText size={16} /></div>
                        <div>
                          <div className={styles.quickActionTitle}>View Detailed Logs</div>
                          <div className={styles.quickActionSubtitle}>Trace live AI prompts</div>
                        </div>
                      </div>
                      <ChevronRight size={14} color="#94a3b8" />
                    </div>

                    <div className={styles.quickActionItem} onClick={() => setShowBulkQuotaModal(true)}>
                      <div className={styles.quickActionLeft}>
                        <div className={styles.quickActionIcon}><RefreshCw size={16} /></div>
                        <div>
                          <div className={styles.quickActionTitle}>Reset User Quota</div>
                          <div className={styles.quickActionSubtitle}>Zero out monthly token counters</div>
                        </div>
                      </div>
                      <ChevronRight size={14} color="#94a3b8" />
                    </div>
                  </div>
                </div>

                <div className={styles.card} style={{ background: '#faf5ff', borderColor: '#e9d5ff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <HelpCircle size={20} color="#7c3aed" />
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1e1b4b' }}>Need Help?</h4>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748b', marginBottom: 12 }}>
                    Contact our support team for quota increases or platform assistance.
                  </p>
                  <button
                    className={styles.cardAction}
                    style={{ background: '#ede9fe', padding: '6px 12px', width: 'fit-content' }}
                    onClick={() => router.push('/institution/help')}
                  >
                    Go to Help &amp; FAQ <ChevronRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 3: QUOTA MANAGEMENT (Matching Image 3)
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'quotas' && quotasData && (
          <>
            {/* Top 4 Quota KPIs */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Institution Quota</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                    <Database size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{quotasData.kpis.institution_quota.value}</div>
                <div className={styles.kpiBadgeSubtitle}>{quotasData.kpis.institution_quota.sub}</div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Total Allocated</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dcfce7', color: '#16a34a' }}>
                    <CheckCircle2 size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{quotasData.kpis.total_allocated.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  {quotasData.kpis.total_allocated.sub}
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Remaining Quota</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dbeafe', color: '#2563eb' }}>
                    <Box size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{quotasData.kpis.remaining_quota.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  {quotasData.kpis.remaining_quota.sub}
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Active Users</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                    <Users size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{quotasData.kpis.active_users.value}</div>
                <div className={styles.kpiBadgeSubtitle}>{quotasData.kpis.active_users.sub}</div>
              </div>
            </div>

            {/* Row 2: Quota Overview Chart, Quota Distribution Donut, Quick Actions */}
            <div className={styles.dashboardMainRow}>
              {/* Quota Usage Overview Chart */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Quota Usage Overview</h3>
                    <span className={styles.cardSubtitle}>Total token usage vs allocated quota (last 30 days)</span>
                  </div>
                  <div className={styles.chartLegend}>
                    <span><span className={styles.legendDot} style={{ background: '#7c3aed' }} />Tokens Used</span>
                    <span><span className={styles.legendDot} style={{ background: '#3b82f6' }} />Allocated Quota</span>
                  </div>
                </div>

                <div className={styles.chartContainer}>
                  {quotasData.trend && (
                    <QuotaTimelineChart data={quotasData.trend} />
                  )}
                </div>
              </div>

              {/* Quota Distribution Donut */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Quota Distribution</h3>
                    <span className={styles.cardSubtitle}>Allocation by user role</span>
                  </div>
                </div>

                <div className={styles.donutWrapper}>
                  <div className={styles.donutSvgBox}>
                    <DonutChart
                      data={quotasData.distribution.map(d => ({
                        feature: d.role,
                        count: d.tokens,
                        percent: d.percent,
                        color: d.color
                      }))}
                    />
                    <div className={styles.donutCenterText}>
                      <div className={styles.donutCenterValue}>{quotasData.kpis.total_allocated.value}</div>
                      <div className={styles.donutCenterLabel}>Allocated</div>
                    </div>
                  </div>

                  <div className={styles.donutLegend}>
                    {quotasData.distribution.map((d, i) => (
                      <div key={i} className={styles.donutLegendItem}>
                        <div className={styles.donutLegendLeft}>
                          <span className={styles.legendDot} style={{ background: d.color }} />
                          <span style={{ textTransform: 'capitalize' }}>{d.role}s</span>
                        </div>
                        <span className={styles.donutLegendPct}>{d.percent}% ({d.amount})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Quick Actions Card */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Quick Actions</h3>
                </div>

                <div className={styles.quickActionsList}>
                  <div className={styles.quickActionItem} onClick={() => setShowBulkQuotaModal(true)}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><SlidersHorizontal size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Bulk Update User Quotas</div>
                        <div className={styles.quickActionSubtitle}>Set limits across an entire role</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>

                  <div className={styles.quickActionItem} onClick={handleExportCSV}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><Download size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Download Quota Report</div>
                        <div className={styles.quickActionSubtitle}>CSV overview of all allocations</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>

                  <div className={styles.quickActionItem} onClick={() => setShowBulkQuotaModal(true)}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><RefreshCw size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Reset User Quotas</div>
                        <div className={styles.quickActionSubtitle}>Clear current month usage</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Quota Allocation Table */}
            <div className={styles.card}>
              <div className={styles.tableFilterRow}>
                <div className={styles.filterPills}>
                  {['all', 'student', 'instructor', 'ta', 'admin'].map(r => (
                    <button
                      key={r}
                      className={`${styles.filterPill} ${quotaRoleFilter === r ? styles.filterPillActive : ''}`}
                      onClick={() => setQuotaRoleFilter(r)}
                    >
                      {r === 'all' ? 'All Users' : r.charAt(0).toUpperCase() + r.slice(1) + 's'}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className={styles.searchBox}>
                    <Search size={14} color="#94a3b8" />
                    <input
                      type="text"
                      placeholder="Search users by name or email..."
                      value={quotaSearchQuery}
                      onChange={e => setQuotaSearchQuery(e.target.value)}
                    />
                  </div>
                  <button className={styles.exportBtn} onClick={() => setShowBulkQuotaModal(true)}>
                    + Bulk Update
                  </button>
                </div>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>User</th>
                      <th>Role</th>
                      <th>Department</th>
                      <th>Current Usage</th>
                      <th>Allocated Quota</th>
                      <th>Remaining</th>
                      <th>Usage %</th>
                      <th>Reset Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotasData.user_quotas
                      .filter(q => quotaRoleFilter === 'all' || q.role?.toLowerCase() === quotaRoleFilter)
                      .filter(q => !quotaSearchQuery || q.name.toLowerCase().includes(quotaSearchQuery.toLowerCase()) || q.email.toLowerCase().includes(quotaSearchQuery.toLowerCase()))
                      .slice((quotaPage - 1) * 8, quotaPage * 8)
                      .map((q, i) => {
                        const usagePct = q.usage_percent || 0;
                        const isWarning = usagePct >= 90;
                        return (
                          <tr key={q.id}>
                            <td>{(quotaPage - 1) * 8 + i + 1}</td>
                            <td>
                              <div className={styles.userCell}>
                                <div className={styles.avatar}>
                                  {q.name?.slice(0, 2).toUpperCase() || 'US'}
                                </div>
                                <div>
                                  <div className={styles.userName}>{q.name}</div>
                                  <div className={styles.userEmail}>{q.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`${styles.roleBadge} ${
                                q.role.toLowerCase() === 'instructor' ? styles.roleInstructor :
                                q.role.toLowerCase() === 'ta' ? styles.roleTA :
                                q.role.toLowerCase().includes('admin') ? styles.roleAdmin : styles.roleStudent
                              }`}>
                                {q.role}
                              </span>
                            </td>
                            <td>{q.department}</td>
                            <td style={{ fontWeight: 600 }}>{q.current_usage}</td>
                            <td>{q.allocated_quota}</td>
                            <td>{q.remaining}</td>
                            <td>
                              <div className={styles.quotaBarWrapper}>
                                <div className={styles.progressBarBg}>
                                  <div
                                    className={`${styles.progressBarFill} ${
                                      isWarning ? styles.progressFillRed :
                                      usagePct >= 75 ? styles.progressFillOrange : styles.progressFillPurple
                                    }`}
                                    style={{ width: `${Math.min(usagePct, 100)}%` }}
                                  />
                                </div>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: isWarning ? '#ef4444' : '#1e1b4b' }}>
                                  {usagePct}%
                                </span>
                              </div>
                            </td>
                            <td>{q.reset_date}</td>
                            <td>
                              <span className={`${styles.statusBadge} ${isWarning ? styles.statusWarning : styles.statusActive}`}>
                                <span className={styles.statusDot} />
                                {q.status}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button
                                  className={styles.actionBtn}
                                  onClick={() => {
                                    setQuotaModalUser({ id: q.user_id, name: q.name, current_quota: q.allocated_quota_raw });
                                    setEditQuotaVal(q.allocated_quota_raw);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  className={styles.iconBtn}
                                  title="Reset Quota"
                                  onClick={() => handleResetUserQuota(q.user_id, q.name)}
                                >
                                  <RefreshCw size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className={styles.paginationRow}>
                <span>Showing {(quotaPage - 1) * 8 + 1}-{Math.min(quotaPage * 8, quotasData.user_quotas.length)} of {quotasData.user_quotas.length} users</span>
                <div className={styles.paginationControls}>
                  <button
                    className={`${styles.pageBtn} ${quotaPage === 1 ? styles.pageBtnDisabled : ''}`}
                    disabled={quotaPage === 1}
                    onClick={() => setQuotaPage(p => p - 1)}
                  >
                    &lt;
                  </button>
                  {Array.from({ length: Math.ceil(quotasData.user_quotas.length / 8) }).map((_, idx) => (
                    <button
                      key={idx}
                      className={`${styles.pageBtn} ${quotaPage === idx + 1 ? styles.pageBtnActive : ''}`}
                      onClick={() => setQuotaPage(idx + 1)}
                    >
                      {idx + 1}
                    </button>
                  ))}
                  <button
                    className={`${styles.pageBtn} ${quotaPage >= Math.ceil(quotasData.user_quotas.length / 8) ? styles.pageBtnDisabled : ''}`}
                    disabled={quotaPage >= Math.ceil(quotasData.user_quotas.length / 8)}
                    onClick={() => setQuotaPage(p => p + 1)}
                  >
                    &gt;
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 4: FEATURE CONTROLS (Matching Image 4)
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'features' && featuresData && (
          <>
            {/* 4 Feature KPIs */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Total Features</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                    <SlidersHorizontal size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{featuresData.kpis.total_features}</div>
                <div className={styles.kpiBadgeSubtitle}>AI features available</div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Enabled Features</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dcfce7', color: '#16a34a' }}>
                    <CheckCircle2 size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{featuresData.kpis.enabled_features}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  {Math.round((featuresData.kpis.enabled_features / featuresData.kpis.total_features) * 100)}% of total
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Disabled Features</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#fee2e2', color: '#dc2626' }}>
                    <XCircle size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{featuresData.kpis.disabled_features}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeDanger}`}>
                  {Math.round((featuresData.kpis.disabled_features / featuresData.kpis.total_features) * 100)}% of total
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Role Configurations</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                    <Users size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{featuresData.kpis.role_configurations}</div>
                <div className={styles.kpiBadgeSubtitle}>Student, Instructor, TA, Admin</div>
              </div>
            </div>

            {/* Filter Row */}
            <div className={styles.tableFilterRow}>
              <div className={styles.searchBox}>
                <Search size={14} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Search features..."
                  value={featureSearch}
                  onChange={e => setFeatureSearch(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <select
                  className={styles.chartSelect}
                  value={featureCategoryFilter}
                  onChange={e => setFeatureCategoryFilter(e.target.value)}
                >
                  <option value="all">All Categories</option>
                  <option value="Learning">Learning</option>
                  <option value="Development">Development</option>
                  <option value="Assessment">Assessment</option>
                  <option value="Content">Content</option>
                  <option value="Analytics">Analytics</option>
                  <option value="Integrity">Integrity</option>
                  <option value="Productivity">Productivity</option>
                  <option value="Accessibility">Accessibility</option>
                  <option value="Vision">Vision</option>
                </select>

                <select
                  className={styles.chartSelect}
                  value={featureRoleFilter}
                  onChange={e => setFeatureRoleFilter(e.target.value)}
                >
                  <option value="all">All Roles</option>
                  <option value="student">Students</option>
                  <option value="instructor">Instructors</option>
                  <option value="ta">TAs</option>
                  <option value="admin">Admins</option>
                </select>

                <select
                  className={styles.chartSelect}
                  value={featureStatusFilter}
                  onChange={e => setFeatureStatusFilter(e.target.value)}
                >
                  <option value="all">All Status</option>
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            </div>

            {/* 2-Column Feature List & Inspector */}
            <div className={styles.featureControlsLayout}>
              {/* Left Column: 12 Feature List */}
              <div className={styles.card} style={{ padding: 0 }}>
                {featuresData.features
                  .filter(f => !featureSearch || f.name.toLowerCase().includes(featureSearch.toLowerCase()) || f.description.toLowerCase().includes(featureSearch.toLowerCase()))
                  .filter(f => featureCategoryFilter === 'all' || f.category.toLowerCase() === featureCategoryFilter.toLowerCase())
                  .filter(f => featureRoleFilter === 'all' || f.available_roles.some(r => r.toLowerCase().includes(featureRoleFilter)))
                  .filter(f => featureStatusFilter === 'all' || (featureStatusFilter === 'enabled' ? f.enabled : !f.enabled))
                  .map(feat => {
                    const isSelected = selectedFeature?.id === feat.id;
                    return (
                      <div
                        key={feat.id}
                        className={`${styles.featureItemCard} ${isSelected ? styles.featureItemSelected : ''}`}
                        onClick={() => setSelectedFeature(feat)}
                      >
                        <div className={styles.featureLeft}>
                          <div
                            className={styles.featureIcon}
                            style={{
                              background: feat.category === 'Learning' ? '#ede9fe' :
                                feat.category === 'Development' ? '#dbeafe' :
                                feat.category === 'Assessment' ? '#fce7f3' :
                                feat.category === 'Content' ? '#fef3c7' : '#dcfce7',
                              color: feat.category === 'Learning' ? '#7c3aed' :
                                feat.category === 'Development' ? '#2563eb' :
                                feat.category === 'Assessment' ? '#db2777' :
                                feat.category === 'Content' ? '#d97706' : '#16a34a'
                            }}
                          >
                            <Sparkles size={18} />
                          </div>
                          <div>
                            <div className={styles.featureTitle}>{feat.name}</div>
                            <div className={styles.featureDesc}>{feat.description}</div>
                            <div className={styles.featureMetaPills}>
                              <span className={styles.metaPill} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                                {feat.category}
                              </span>
                              {feat.available_roles.map((role, ri) => (
                                <span key={ri} className={styles.metaPill} style={{ textTransform: 'capitalize' }}>
                                  {role}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <label className={styles.switch} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={feat.enabled}
                              onChange={() => handleFeatureToggle(feat)}
                            />
                            <span className={styles.slider} />
                          </label>

                          <button
                            className={styles.actionBtn}
                            onClick={e => {
                              e.stopPropagation();
                              setSelectedFeature(feat);
                              setEditFeatureModal(feat);
                              setFeatureRateLimit(feat.rate_limit_per_hour);
                              setFeatureModel(feat.default_model);
                            }}
                          >
                            Configure
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Right Column: Selected Feature Inspector Card */}
              {selectedFeature && (
                <div className={styles.featureInspector}>
                  <div className={styles.inspectorHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className={styles.featureIcon} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                        <Sparkles size={20} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e1b4b' }}>
                          {selectedFeature.name}
                        </h4>
                        <span style={{ fontSize: 12, color: '#64748b' }}>
                          {selectedFeature.description}
                        </span>
                      </div>
                    </div>

                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={selectedFeature.enabled}
                        onChange={() => handleFeatureToggle(selectedFeature)}
                      />
                      <span className={styles.slider} />
                    </label>
                  </div>

                  {/* Sub-tabs inside Inspector */}
                  <div className={styles.filterPills}>
                    {(['overview', 'roles', 'settings', 'stats'] as const).map(t => (
                      <button
                        key={t}
                        className={`${styles.filterPill} ${featureTab === t ? styles.filterPillActive : ''}`}
                        onClick={() => setFeatureTab(t)}
                        style={{ textTransform: 'capitalize', padding: '4px 10px', fontSize: 11.5 }}
                      >
                        {t === 'roles' ? 'Role Access' : t === 'stats' ? 'Usage Stats' : t}
                      </button>
                    ))}
                  </div>

                  {featureTab === 'overview' && (
                    <div className={styles.inspectorMetaGrid}>
                      <p style={{ margin: 0, fontSize: 12.5, color: '#475569', lineHeight: 1.4 }}>
                        Allows users to interact with {selectedFeature.name} directly inside labs, assignments, and study sessions. Powered by advanced LLMs with institution-specific context.
                      </p>

                      <div className={styles.inspectorMetaRow}>
                        <span className={styles.inspectorMetaLabel}>Category</span>
                        <span className={styles.inspectorMetaVal}>{selectedFeature.category}</span>
                      </div>

                      <div className={styles.inspectorMetaRow}>
                        <span className={styles.inspectorMetaLabel}>Supported Content</span>
                        <span className={styles.inspectorMetaVal}>{selectedFeature.supported_content}</span>
                      </div>

                      <div className={styles.inspectorMetaRow}>
                        <span className={styles.inspectorMetaLabel}>Default Model</span>
                        <span className={styles.inspectorMetaVal}>{selectedFeature.default_model}</span>
                      </div>

                      <div className={styles.inspectorMetaRow}>
                        <span className={styles.inspectorMetaLabel}>Rate Limit</span>
                        <span className={styles.inspectorMetaVal}>{selectedFeature.rate_limit_per_hour} req/hr/user</span>
                      </div>

                      <div className={styles.inspectorMetaRow}>
                        <span className={styles.inspectorMetaLabel}>Cost per 1K tokens</span>
                        <span className={styles.inspectorMetaVal}>${selectedFeature.cost_per_1k?.toFixed(3) ?? '0.002'} (est.)</span>
                      </div>

                      <div className={styles.inspectorMetaRow}>
                        <span className={styles.inspectorMetaLabel}>Status</span>
                        <span className={`${styles.statusBadge} ${selectedFeature.enabled ? styles.statusActive : styles.statusDanger}`}>
                          {selectedFeature.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        <button
                          className={styles.btnSecondary}
                          style={{ flex: 1 }}
                          onClick={() => switchTab('overview')}
                        >
                          View Analytics
                        </button>
                        <button
                          className={styles.btnPrimary}
                          style={{ flex: 1 }}
                          onClick={() => {
                            setEditFeatureModal(selectedFeature);
                            setFeatureRateLimit(selectedFeature.rate_limit_per_hour);
                            setFeatureModel(selectedFeature.default_model);
                          }}
                        >
                          Edit Config
                        </button>
                      </div>
                    </div>
                  )}

                  {featureTab === 'roles' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>Authorized institutional roles:</span>
                      {['Student', 'Instructor', 'TA', 'Admin'].map(r => {
                        const hasRole = selectedFeature.available_roles.some(ar => ar.toLowerCase() === r.toLowerCase());
                        return (
                          <div key={r} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: 8 }}>
                            <span style={{ textTransform: 'capitalize', fontSize: 13, fontWeight: 600 }}>{r}s</span>
                            <span className={`${styles.statusBadge} ${hasRole ? styles.statusActive : styles.statusDanger}`}>
                              {hasRole ? 'Granted' : 'Restricted'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {featureTab === 'settings' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Rate Limit (Requests/Hour)</label>
                        <input
                          type="number"
                          className={styles.inputField}
                          value={selectedFeature.rate_limit_per_hour}
                          readOnly
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Inference Model</label>
                        <input
                          type="text"
                          className={styles.inputField}
                          value={selectedFeature.default_model}
                          readOnly
                        />
                      </div>
                    </div>
                  )}

                  {featureTab === 'stats' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className={styles.inspectorMetaRow}>
                        <span className={styles.inspectorMetaLabel}>30-Day Invocations</span>
                        <span className={styles.inspectorMetaVal}>4,812 calls</span>
                      </div>
                      <div className={styles.inspectorMetaRow}>
                        <span className={styles.inspectorMetaLabel}>Avg. Latency</span>
                        <span className={styles.inspectorMetaVal}>340 ms</span>
                      </div>
                      <div className={styles.inspectorMetaRow}>
                        <span className={styles.inspectorMetaLabel}>Error / Flag Rate</span>
                        <span className={styles.inspectorMetaVal}>0.2%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 5: SAFETY & COMPLIANCE (Matching Image 5)
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'safety' && securityData && (
          <>
            {/* 4 Security KPIs */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Security Score</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                    <ShieldCheck size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{securityData.kpis.security_score.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} /> {securityData.kpis.security_score.change || '+4 vs. last month'}
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Active Users</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dcfce7', color: '#16a34a' }}>
                    <Users size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{securityData.kpis.active_users.value}</div>
                <div className={styles.kpiBadgeSubtitle}>{securityData.kpis.active_users.sub}</div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Security Alerts</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#fee2e2', color: '#dc2626' }}>
                    <AlertTriangle size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{securityData.kpis.security_alerts.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeDanger}`}>
                  {securityData.kpis.security_alerts.sub || '1 critical, 2 medium'}
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Compliance Status</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dbeafe', color: '#2563eb' }}>
                    <CheckCircle2 size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{securityData.kpis.compliance_status.value}</div>
                <div className={styles.kpiBadgeSubtitle}>{securityData.kpis.compliance_status.sub}</div>
              </div>
            </div>

            {/* Row 2: Security Events Trend, Login Locations, Quick Actions */}
            <div className={styles.dashboardMainRow}>
              {/* Security Events Trend Chart */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Security Events</h3>
                    <span className={styles.cardSubtitle}>Login attempts, policy violations, and system events (last 30 days)</span>
                  </div>
                  <div className={styles.chartLegend}>
                    <span><span className={styles.legendDot} style={{ background: '#7c3aed' }} />Successful logins</span>
                    <span><span className={styles.legendDot} style={{ background: '#ef4444' }} />Failed logins</span>
                    <span><span className={styles.legendDot} style={{ background: '#f59e0b' }} />Policy violations</span>
                  </div>
                </div>

                <div className={styles.chartContainer}>
                  {securityData.trend && (
                    <SecurityEventsChart data={securityData.trend} />
                  )}
                </div>
              </div>

              {/* Login Locations Breakdown */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Login Locations</h3>
                    <span className={styles.cardSubtitle}>Active user locations (last 30 days)</span>
                  </div>
                </div>

                <div className={styles.securityWorldMapBox}>
                  {securityData.locations.map((loc, i) => (
                    <div key={i} className={styles.deptItem}>
                      <div className={styles.locationBarItem}>
                        <span style={{ fontWeight: 600 }}>{loc.country}</span>
                        <span>{loc.percent}% ({loc.users} users)</span>
                      </div>
                      <div className={styles.progressBarBg}>
                        <div
                          className={styles.progressBarFill}
                          style={{
                            width: `${loc.percent}%`,
                            background: loc.color || '#7c3aed'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Actions Card */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>Quick Actions</h3>
                </div>

                <div className={styles.quickActionsList}>
                  <div className={styles.quickActionItem} onClick={() => showToast('2FA policy broadcasted to all users!')}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><Lock size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Enforce 2FA for All Users</div>
                        <div className={styles.quickActionSubtitle}>Require multi-factor auth</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>

                  <div className={styles.quickActionItem} onClick={() => switchTab('users')}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><Users size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Manage User Access</div>
                        <div className={styles.quickActionSubtitle}>Elevate or restrict privileges</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>

                  <div className={styles.quickActionItem} onClick={handleExportCSV}>
                    <div className={styles.quickActionLeft}>
                      <div className={styles.quickActionIcon}><Download size={16} /></div>
                      <div>
                        <div className={styles.quickActionTitle}>Export Audit Logs</div>
                        <div className={styles.quickActionSubtitle}>Download security events</div>
                      </div>
                    </div>
                    <ChevronRight size={14} color="#94a3b8" />
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Recent Security Events & Compliance Frameworks */}
            <div className={styles.twoColGrid}>
              {/* Recent Security Events Table */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Recent Security Events</h3>
                    <span className={styles.cardSubtitle}>Latest security-related activities in your institution</span>
                  </div>
                  <button className={styles.cardAction} onClick={() => switchTab('logs')}>
                    View All Logs <ChevronRight size={12} />
                  </button>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Event</th>
                        <th>User</th>
                        <th>IP Address</th>
                        <th>Location</th>
                        <th>Severity</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {securityData.recent_events.map((ev, i) => (
                        <tr key={ev.id}>
                          <td>{i + 1}</td>
                          <td style={{ fontWeight: 600 }}>{ev.title}</td>
                          <td>{ev.user_name}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{ev.ip_address}</td>
                          <td>{ev.location}</td>
                          <td>
                            <span className={`${styles.statusBadge} ${
                              ev.severity === 'critical' ? styles.statusDanger :
                              ev.severity === 'high' ? styles.statusDanger :
                              ev.severity === 'medium' ? styles.statusWarning : styles.statusActive
                            }`}>
                              {ev.severity}
                            </span>
                          </td>
                          <td>{ev.formatted_time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Compliance Frameworks & Data Retention */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Compliance Frameworks</h3>
                    <button className={styles.cardAction} onClick={() => showToast('All compliance frameworks are active.')}>
                      Manage
                    </button>
                  </div>

                  <div className={styles.frameworkList}>
                    {securityData.compliance_frameworks.map((cf, i) => (
                      <div key={i} className={styles.frameworkItem}>
                        <div className={styles.frameworkLeft}>
                          <CheckCircle2 size={18} color="#16a34a" />
                          <div>
                            <div className={styles.frameworkName}>{cf.name}</div>
                            <div className={styles.frameworkDesc}>{cf.title}</div>
                          </div>
                        </div>
                        <span className={`${styles.statusBadge} ${styles.statusActive}`}>
                          {cf.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Data Retention</h3>
                    <button className={styles.cardAction} onClick={() => showToast('Data retention policies loaded.')}>
                      Configure
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(securityData.data_retention).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span style={{ color: '#475569', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                        <span style={{ fontWeight: 700, color: '#1e1b4b' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════════════
            TAB 6: AI USAGE LOGS (Matching Image 2)
           ══════════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'logs' && (
          <>
            {/* Top 4 KPI Cards */}
            <div className={styles.kpiGrid}>
              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Total Logs</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                    <FileText size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{logKpis.total_logs.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} /> {logKpis.total_logs.change || '+18% vs. last 30 days'}
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Unique Users</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dcfce7', color: '#16a34a' }}>
                    <Users size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{logKpis.unique_users.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} /> {logKpis.unique_users.change || '+12%'}
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Total Tokens</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#dbeafe', color: '#2563eb' }}>
                    <Database size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{logKpis.total_tokens.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeUp}`}>
                  <TrendingUp size={12} /> {logKpis.total_tokens.change || '+25%'}
                </div>
              </div>

              <div className={styles.kpiCard}>
                <div className={styles.kpiHeader}>
                  <span className={styles.kpiLabel}>Failed Requests</span>
                  <div className={styles.kpiIconBadge} style={{ background: '#fee2e2', color: '#dc2626' }}>
                    <AlertTriangle size={18} />
                  </div>
                </div>
                <div className={styles.kpiValue}>{logKpis.failed_requests.value}</div>
                <div className={`${styles.kpiBadge} ${styles.kpiBadgeDanger}`}>
                  <AlertTriangle size={12} /> {logKpis.failed_requests.change || '+6%'}
                </div>
              </div>
            </div>

            {/* Row 2: Activity Trend Chart & Logs by Event Type Donut */}
            <div className={styles.dashboardMainRow}>
              {/* Activity Trend Chart */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Activity Trend</h3>
                    <span className={styles.cardSubtitle}>Number of AI requests over time (last 30 days)</span>
                  </div>
                  <div className={styles.chartControls}>
                    <div className={styles.chartLegend}>
                      <span><span className={styles.legendDot} style={{ background: '#7c3aed' }} />Successful</span>
                      <span><span className={styles.legendDot} style={{ background: '#ef4444' }} />Failed</span>
                      <span><span className={styles.legendDot} style={{ background: '#06b6d4' }} />Avg. Response Time</span>
                    </div>
                  </div>
                </div>

                <div className={styles.chartContainer}>
                  <ActivityTrendChart
                    data={logActivityTrend}
                    hoveredIdx={hoveredLogTrendIdx}
                    onHover={setHoveredLogTrendIdx}
                  />
                </div>
              </div>

              {/* Logs by Event Type (Donut Chart) */}
              <div className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h3 className={styles.cardTitle}>Logs by Event Type</h3>
                    <span className={styles.cardSubtitle}>Categorized event distribution</span>
                  </div>
                </div>

                <div className={styles.donutWrapper}>
                  <div className={styles.donutSvgBox}>
                    <DonutChart
                      data={logEventBreakdown.map(d => ({
                        feature: d.name,
                        percent: d.percent,
                        color: d.color
                      }))}
                    />
                    <div className={styles.donutCenterText}>
                      <div className={styles.donutCenterValue}>{logKpis.total_logs.value}</div>
                      <div className={styles.donutCenterLabel}>Total Logs</div>
                    </div>
                  </div>

                  <div className={styles.donutLegend}>
                    {logEventBreakdown.map((item, idx) => (
                      <div key={idx} className={styles.donutLegendItem}>
                        <div className={styles.donutLegendLeft}>
                          <span className={styles.legendDot} style={{ background: item.color }} />
                          <span>{item.name}</span>
                        </div>
                        <span className={styles.donutLegendPct}>{item.percent}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: 2-Column Split (Table + Log Details Inspector) */}
            <div className={styles.twoColGrid}>
              {/* Left Column: Logs Table */}
              <div className={styles.card}>
                <div className={styles.tableFilterRow}>
                  <div className={styles.searchBox} style={{ flex: '1 1 240px' }}>
                    <Search size={14} color="#94a3b8" />
                    <input
                      type="text"
                      placeholder="Search logs (user, feature, request ID, etc...)"
                      value={logSearch}
                      onChange={e => setLogSearch(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <select
                      className={styles.chartSelect}
                      value={logEventTypeFilter}
                      onChange={e => setLogEventTypeFilter(e.target.value)}
                    >
                      <option value="all">All Event Types</option>
                      <option value="AI Request">AI Request</option>
                      <option value="Quota Limit">Quota Limit</option>
                      <option value="Feature Access">Feature Access</option>
                      <option value="Auth Event">Auth Events</option>
                      <option value="Error">Errors</option>
                      <option value="System Event">System Events</option>
                    </select>

                    <select
                      className={styles.chartSelect}
                      value={logUserFilter}
                      onChange={e => setLogUserFilter(e.target.value)}
                    >
                      <option value="all">All Users</option>
                      <option value="students">Students</option>
                      <option value="instructors">Instructors</option>
                      <option value="tas">TAs</option>
                      <option value="admins">Admins</option>
                    </select>

                    <select
                      className={styles.chartSelect}
                      value={logFeatureFilter}
                      onChange={e => setLogFeatureFilter(e.target.value)}
                    >
                      <option value="all">All Features</option>
                      <option value="Chat Assistant">Chat Assistant</option>
                      <option value="Answer Evaluation">Answer Evaluation</option>
                      <option value="Code Help">Code Help</option>
                      <option value="Content Generation">Content Generation</option>
                      <option value="Data Analysis">Data Analysis</option>
                      <option value="Hint System">Hint System</option>
                      <option value="Viva Question">Viva Question</option>
                      <option value="Image Analysis">Image Analysis</option>
                    </select>

                    <select
                      className={styles.chartSelect}
                      value={logStatusFilter}
                      onChange={e => setLogStatusFilter(e.target.value)}
                    >
                      <option value="all">All Status</option>
                      <option value="success">Success</option>
                      <option value="blocked">Blocked</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                </div>

                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ width: 30 }}><input type="checkbox" /></th>
                        <th>#</th>
                        <th>Timestamp ↓</th>
                        <th>User</th>
                        <th>Event Type</th>
                        <th>Feature</th>
                        <th>Model</th>
                        <th>Tokens</th>
                        <th>Status</th>
                        <th>Response Time</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logList
                        .filter(l => logEventTypeFilter === 'all' || l.event_type.toLowerCase() === logEventTypeFilter.toLowerCase())
                        .map((log, idx) => {
                          const isSelected = (selectedLog?.id || currentActiveLog.id) === log.id;
                          return (
                            <tr
                              key={log.id}
                              className={isSelected ? styles.tableRowSelected : ''}
                              onClick={() => setSelectedLog(log)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td onClick={e => e.stopPropagation()}>
                                <input type="checkbox" />
                              </td>
                              <td>{(logPage - 1) * logRowsPerPage + idx + 1}</td>
                              <td style={{ fontSize: 12, color: '#64748b' }}>
                                {log.timestamp}
                              </td>
                              <td>
                                <div className={styles.userCell}>
                                  <div className={styles.avatar}>
                                    {log.user_name.slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div className={styles.userName}>{log.user_name}</div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className={`${styles.eventTypeBadge} ${
                                  log.event_type === 'AI Request' ? styles.eventTypeAi :
                                  log.event_type === 'Quota Limit' ? styles.eventTypeQuota :
                                  log.event_type === 'Feature Access' ? styles.eventTypeFeature :
                                  log.event_type === 'Auth Event' ? styles.eventTypeAuth :
                                  log.event_type === 'Error' ? styles.eventTypeError : styles.eventTypeSystem
                                }`}>
                                  {log.event_type === 'AI Request' && <Sparkles size={11} />}
                                  {log.event_type === 'Quota Limit' && <AlertTriangle size={11} />}
                                  {log.event_type === 'Feature Access' && <Shield size={11} />}
                                  {log.event_type === 'Auth Event' && <Lock size={11} />}
                                  {log.event_type === 'Error' && <XCircle size={11} />}
                                  {log.event_type === 'System Event' && <Settings size={11} />}
                                  {log.event_type}
                                </span>
                              </td>
                              <td style={{ fontWeight: 500 }}>{log.feature}</td>
                              <td style={{ fontSize: 12, color: '#475569' }}>{log.model}</td>
                              <td style={{ fontWeight: 600 }}>{log.tokens > 0 ? formatNum(log.tokens) : '0'}</td>
                              <td>
                                <span className={`${styles.statusBadge} ${
                                  log.status === 'Success' ? styles.statusActive :
                                  log.status === 'Blocked' ? styles.statusDanger : styles.statusWarning
                                }`}>
                                  <span className={styles.statusDot} />
                                  {log.status}
                                </span>
                              </td>
                              <td style={{ fontSize: 12 }}>{log.response_time}</td>
                              <td>
                                <button
                                  className={styles.iconBtn}
                                  title="Inspect Log"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setSelectedLog(log);
                                  }}
                                >
                                  <Eye size={14} color={isSelected ? '#7c3aed' : '#64748b'} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className={styles.paginationRow}>
                  <span>Showing {(logPage - 1) * logRowsPerPage + 1}-{Math.min(logPage * logRowsPerPage, totalLogsCount)} of {formatNum(totalLogsCount)} logs</span>
                  <div className={styles.paginationControls}>
                    <button
                      className={`${styles.pageBtn} ${logPage === 1 ? styles.pageBtnDisabled : ''}`}
                      disabled={logPage === 1}
                      onClick={() => setLogPage(p => p - 1)}
                    >
                      &lt;
                    </button>
                    {[1, 2, 3, 4, 5].map(p => (
                      <button
                        key={p}
                        className={`${styles.pageBtn} ${logPage === p ? styles.pageBtnActive : ''}`}
                        onClick={() => setLogPage(p)}
                      >
                        {p}
                      </button>
                    ))}
                    <span style={{ margin: '0 4px' }}>...</span>
                    <button
                      className={`${styles.pageBtn} ${logPage === 12484 ? styles.pageBtnActive : ''}`}
                      onClick={() => setLogPage(12484)}
                    >
                      12,484
                    </button>
                    <button
                      className={`${styles.pageBtn} ${logPage >= 12484 ? styles.pageBtnDisabled : ''}`}
                      disabled={logPage >= 12484}
                      onClick={() => setLogPage(p => p + 1)}
                    >
                      &gt;
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Log Details Inspector matching Image 2 */}
              {currentActiveLog && (
                <div className={styles.logInspector}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className={styles.pageIconBadge} style={{ width: 38, height: 38, borderRadius: 10 }}>
                        <Sparkles size={18} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e1b4b' }}>
                          {currentActiveLog.event_type}
                        </h4>
                        <span style={{ fontSize: 11.5, color: '#64748b' }}>
                          {currentActiveLog.timestamp}
                        </span>
                      </div>
                    </div>

                    <span className={`${styles.statusBadge} ${currentActiveLog.status === 'Success' ? styles.statusActive : styles.statusDanger}`}>
                      <span className={styles.statusDot} />
                      {currentActiveLog.status}
                    </span>
                  </div>

                  <div className={styles.inspectorMetaGrid}>
                    <div className={styles.inspectorMetaRow}>
                      <span className={styles.inspectorMetaLabel}>Request ID</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#475569' }}>
                          {currentActiveLog.request_id}
                        </span>
                        <button
                          className={styles.copyBtn}
                          onClick={() => copyToClipboard(currentActiveLog.request_id, 'Request ID')}
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>

                    <div className={styles.inspectorMetaRow}>
                      <span className={styles.inspectorMetaLabel}>User</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={styles.avatar} style={{ width: 24, height: 24, fontSize: 10 }}>
                          {currentActiveLog.user_name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className={styles.inspectorMetaVal}>{currentActiveLog.user_name}</span>
                      </div>
                    </div>

                    <div className={styles.inspectorMetaRow}>
                      <span className={styles.inspectorMetaLabel}>Role</span>
                      <span className={`${styles.roleBadge} ${currentActiveLog.role.toLowerCase() === 'instructor' ? styles.roleInstructor : styles.roleStudent}`}>
                        {currentActiveLog.role}
                      </span>
                    </div>

                    <div className={styles.inspectorMetaRow}>
                      <span className={styles.inspectorMetaLabel}>Feature</span>
                      <span className={styles.inspectorMetaVal}>{currentActiveLog.feature}</span>
                    </div>

                    <div className={styles.inspectorMetaRow}>
                      <span className={styles.inspectorMetaLabel}>Model</span>
                      <span className={styles.inspectorMetaVal}>{currentActiveLog.model}</span>
                    </div>

                    <div className={styles.inspectorMetaRow}>
                      <span className={styles.inspectorMetaLabel}>Tokens Used</span>
                      <span className={styles.inspectorMetaVal}>
                        {formatNum(currentActiveLog.tokens)} ({formatNum(currentActiveLog.input_tokens)} in + {formatNum(currentActiveLog.output_tokens)} out)
                      </span>
                    </div>

                    <div className={styles.inspectorMetaRow}>
                      <span className={styles.inspectorMetaLabel}>Response Time</span>
                      <span className={styles.inspectorMetaVal}>{currentActiveLog.response_time}</span>
                    </div>

                    <div className={styles.inspectorMetaRow}>
                      <span className={styles.inspectorMetaLabel}>IP Address</span>
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#334155' }}>
                        {currentActiveLog.ip_address}
                      </span>
                    </div>

                    <div className={styles.inspectorMetaRow}>
                      <span className={styles.inspectorMetaLabel}>Location</span>
                      <span className={styles.inspectorMetaVal}>{currentActiveLog.location}</span>
                    </div>

                    <div className={styles.inspectorMetaRow}>
                      <span className={styles.inspectorMetaLabel}>Timestamp</span>
                      <span className={styles.inspectorMetaVal}>{currentActiveLog.timestamp}</span>
                    </div>

                    <div className={styles.inspectorMetaRow}>
                      <span className={styles.inspectorMetaLabel}>Status</span>
                      <span className={`${styles.statusBadge} ${currentActiveLog.status === 'Success' ? styles.statusActive : styles.statusDanger}`}>
                        <span className={styles.statusDot} />
                        {currentActiveLog.status}
                      </span>
                    </div>
                  </div>

                  {/* Request Preview */}
                  <div>
                    <div className={styles.previewHeader}>
                      <span>Request Preview</span>
                      <button
                        className={styles.copyBtn}
                        onClick={() => copyToClipboard(currentActiveLog.prompt, 'Prompt')}
                      >
                        <Copy size={12} /> Copy
                      </button>
                    </div>
                    <div className={styles.previewBox}>
                      {currentActiveLog.prompt}
                    </div>
                  </div>

                  {/* Response Preview */}
                  <div>
                    <div className={styles.previewHeader}>
                      <span>Response Preview</span>
                      <button
                        className={styles.copyBtn}
                        onClick={() => copyToClipboard(currentActiveLog.response, 'Response')}
                      >
                        <Copy size={12} /> Copy
                      </button>
                    </div>
                    <div className={styles.previewBox}>
                      {currentActiveLog.response}
                    </div>
                  </div>

                  <button
                    className={styles.btnSecondary}
                    style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={() => {
                      setSelectedLog(currentActiveLog);
                      setLogModalOpen(true);
                    }}
                  >
                    View Full Response <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ══ MODAL: SET INDIVIDUAL QUOTA ══ */}
      {quotaModalUser && (
        <div className={styles.modalBackdrop} onClick={() => setQuotaModalUser(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Update Quota - {quotaModalUser.name}</h3>
              <button className={styles.iconBtn} onClick={() => setQuotaModalUser(null)}>
                <XCircle size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  Monthly Token Quota
                </label>
                <input
                  type="number"
                  className={styles.inputField}
                  style={{ marginTop: 6 }}
                  value={editQuotaVal}
                  onChange={e => setEditQuotaVal(Number(e.target.value))}
                />
                <span style={{ fontSize: 11.5, color: '#64748b', marginTop: 4, display: 'block' }}>
                  Current allocation: {formatNum(editQuotaVal)} tokens/month
                </span>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setQuotaModalUser(null)}>
                Cancel
              </button>
              <button className={styles.btnPrimary} onClick={handleSaveIndividualQuota}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: BULK UPDATE QUOTAS ══ */}
      {showBulkQuotaModal && (
        <div className={styles.modalBackdrop} onClick={() => setShowBulkQuotaModal(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Bulk Update User Quotas</h3>
              <button className={styles.iconBtn} onClick={() => setShowBulkQuotaModal(false)}>
                <XCircle size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Target Role</label>
                <select
                  className={styles.inputField}
                  style={{ marginTop: 6 }}
                  value={bulkRole}
                  onChange={e => setBulkRole(e.target.value)}
                >
                  <option value="student">All Students</option>
                  <option value="instructor">All Instructors</option>
                  <option value="ta">All TAs</option>
                  <option value="admin">All Admins</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  New Monthly Token Limit
                </label>
                <input
                  type="number"
                  className={styles.inputField}
                  style={{ marginTop: 6 }}
                  value={bulkQuotaVal}
                  onChange={e => setBulkQuotaVal(Number(e.target.value))}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setShowBulkQuotaModal(false)}>
                Cancel
              </button>
              <button className={styles.btnPrimary} onClick={handleBulkUpdateQuotas}>
                Apply to Role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: EDIT FEATURE CONFIGURATION ══ */}
      {editFeatureModal && (
        <div className={styles.modalBackdrop} onClick={() => setEditFeatureModal(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Configure {editFeatureModal.name}</h3>
              <button className={styles.iconBtn} onClick={() => setEditFeatureModal(null)}>
                <XCircle size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Rate Limit (req/hour/user)</label>
                <input
                  type="number"
                  className={styles.inputField}
                  style={{ marginTop: 6 }}
                  value={featureRateLimit}
                  onChange={e => setFeatureRateLimit(Number(e.target.value))}
                />
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Inference Model</label>
                <input
                  type="text"
                  className={styles.inputField}
                  style={{ marginTop: 6 }}
                  value={featureModel}
                  onChange={e => setFeatureModel(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={() => setEditFeatureModal(null)}>
                Cancel
              </button>
              <button className={styles.btnPrimary} onClick={handleSaveFeatureConfig}>
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL: VIEW FULL LOG RESPONSE & DETAILS ══ */}
      {logModalOpen && currentActiveLog && (
        <div className={styles.modalBackdrop} onClick={() => setLogModalOpen(false)}>
          <div className={styles.modalContent} style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>AI Request Details</h3>
                <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>
                  {currentActiveLog.request_id || currentActiveLog.id}
                </span>
              </div>
              <button className={styles.iconBtn} onClick={() => setLogModalOpen(false)}>
                <XCircle size={18} />
              </button>
            </div>
            <div className={styles.modalBody} style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Metadata Badges */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div>
                  <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>User</span>
                  <strong style={{ fontSize: 12.5, color: '#1e293b' }}>{currentActiveLog.user_name}</strong>
                  <span style={{ fontSize: 11, color: '#94a3b8', display: 'block' }}>{currentActiveLog.user_email}</span>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Role / Feature</span>
                  <strong style={{ fontSize: 12.5, color: '#1e293b' }}>{currentActiveLog.role}</strong>
                  <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>{currentActiveLog.feature}</span>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Model / Status</span>
                  <strong style={{ fontSize: 12.5, color: '#1e293b' }}>{currentActiveLog.model || 'GPT-4o'}</strong>
                  <div>
                    <span className={`${styles.statusBadge} ${currentActiveLog.status === 'Success' ? styles.statusSuccess : currentActiveLog.status === 'Blocked' ? styles.statusBlocked : styles.statusFailed}`}>
                      {currentActiveLog.status}
                    </span>
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>Tokens & Latency</span>
                  <strong style={{ fontSize: 12.5, color: '#1e293b' }}>{currentActiveLog.tokens.toLocaleString()} tokens</strong>
                  <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>{currentActiveLog.response_time} ({currentActiveLog.location})</span>
                </div>
              </div>

              {/* Prompt Box */}
              <div>
                <div className={styles.previewHeader}>
                  <strong style={{ fontSize: 13, color: '#334155' }}>User Prompt / Request</strong>
                  <button className={styles.copyBtn} onClick={() => copyToClipboard(currentActiveLog.prompt, 'Prompt')}>
                    <Copy size={12} /> Copy Prompt
                  </button>
                </div>
                <div className={styles.previewBox} style={{ maxHeight: 180, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {currentActiveLog.prompt}
                </div>
              </div>

              {/* Full Response Box */}
              <div>
                <div className={styles.previewHeader}>
                  <strong style={{ fontSize: 13, color: '#334155' }}>AI Generated Response</strong>
                  <button className={styles.copyBtn} onClick={() => copyToClipboard(currentActiveLog.response, 'Response')}>
                    <Copy size={12} /> Copy Response
                  </button>
                </div>
                <div className={styles.previewBox} style={{ maxHeight: 260, whiteSpace: 'pre-wrap', lineHeight: 1.6, background: '#faf5ff', borderColor: '#e9d5ff' }}>
                  {currentActiveLog.response}
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                className={styles.btnSecondary}
                onClick={() => copyToClipboard(JSON.stringify(currentActiveLog, null, 2), 'Log JSON')}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Copy size={13} /> Copy JSON
              </button>
              <button className={styles.btnPrimary} onClick={() => setLogModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </InstitutionShell>
  );
}

// ── SVG Trend Line Chart Component ───────────────────────────────────────────
function TrendLineChart({
  data,
  hoveredIdx,
  onHover
}: {
  data: { date: string; label: string; calls: number; unique_users: number }[];
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
}) {
  if (!data || data.length === 0) return null;

  const width = 600;
  const height = 210;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };

  const maxVal = Math.max(...data.map(d => Math.max(d.calls, d.unique_users)), 1000);
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const pointsCalls = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartW,
    y: padding.top + chartH - (d.calls / maxVal) * chartH,
    ...d
  }));

  const pointsUsers = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1)) * chartW,
    y: padding.top + chartH - (d.unique_users / maxVal) * chartH,
    ...d
  }));

  const makePath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cx = (pts[i].x + pts[i + 1].x) / 2;
      d += ` Q ${pts[i].x} ${pts[i].y}, ${cx} ${(pts[i].y + pts[i + 1].y) / 2}`;
    }
    d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
    return d;
  };

  const pathCalls = makePath(pointsCalls);
  const pathUsers = makePath(pointsUsers);
  const areaCalls = `${pathCalls} L ${pointsCalls[pointsCalls.length - 1].x} ${height - padding.bottom} L ${pointsCalls[0].x} ${height - padding.bottom} Z`;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
          const y = padding.top + chartH * (1 - frac);
          return (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#f1f5f9"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                fill="#94a3b8"
                fontSize="10"
                textAnchor="end"
              >
                {Math.round(frac * maxVal)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaCalls} fill="url(#callsGrad)" />

        {/* Lines */}
        <path d={pathUsers} fill="none" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" />
        <path d={pathCalls} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" />

        {/* Points & Hover targets */}
        {pointsCalls.map((p, idx) => (
          <g key={idx}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hoveredIdx === idx ? 5 : 2}
              fill="#7c3aed"
              stroke="#ffffff"
              strokeWidth="2"
            />
            <rect
              x={p.x - chartW / (data.length * 2)}
              y={padding.top}
              width={chartW / data.length}
              height={chartH}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHover(idx)}
            />
          </g>
        ))}

        {/* Date Labels */}
        {data.map((d, i) => {
          if (i % 6 !== 0 && i !== data.length - 1) return null;
          const x = padding.left + (i / (data.length - 1)) * chartW;
          return (
            <text
              key={i}
              x={x}
              y={height - 8}
              fill="#94a3b8"
              fontSize="10"
              textAnchor="middle"
            >
              {d.label || d.date.slice(5)}
            </text>
          );
        })}
      </svg>

      {/* Hover Tooltip */}
      {hoveredIdx !== null && data[hoveredIdx] && (
        <div
          style={{
            position: 'absolute',
            left: `${(pointsCalls[hoveredIdx].x / width) * 100}%`,
            top: `${(pointsCalls[hoveredIdx].y / height) * 100}%`,
            transform: 'translate(-50%, -120%)',
            background: '#1e1b4b',
            color: '#ffffff',
            padding: '6px 12px',
            borderRadius: '8px',
            fontSize: '11px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            pointerEvents: 'none',
            zIndex: 10
          }}
        >
          <div style={{ color: '#c4b5fd', marginBottom: 2 }}>{data[hoveredIdx].label || data[hoveredIdx].date}</div>
          <div>Calls: <span style={{ color: '#a78bfa' }}>{data[hoveredIdx].calls}</span></div>
          <div>Users: <span style={{ color: '#67e8f9' }}>{data[hoveredIdx].unique_users}</span></div>
        </div>
      )}
    </div>
  );
}

// ── SVG Donut Chart Component ────────────────────────────────────────────────
function DonutChart({ data }: { data: { feature: string; count?: number; percent: number; color: string }[] }) {
  if (!data || data.length === 0) return null;

  const size = 150;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
      {data.map((item, idx) => {
        const strokeDasharray = `${(item.percent / 100) * circumference} ${circumference}`;
        const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
        accumulatedPercent += item.percent;

        return (
          <circle
            key={idx}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            stroke={item.color}
            strokeWidth={strokeWidth}
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        );
      })}
    </svg>
  );
}

// ── SVG Quota Timeline Chart ─────────────────────────────────────────────────
function QuotaTimelineChart({ data }: { data: { label: string; used_tokens: number; allocated_tokens: number }[] }) {
  const width = 600;
  const height = 210;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };

  const maxVal = Math.max(...data.map(d => Math.max(d.used_tokens, d.allocated_tokens)), 500000);
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const pointsUsed = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.used_tokens / maxVal) * chartH
  }));

  const pointsAlloc = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.allocated_tokens / maxVal) * chartH
  }));

  const makePath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cx = (pts[i].x + pts[i + 1].x) / 2;
      d += ` Q ${pts[i].x} ${pts[i].y}, ${cx} ${(pts[i].y + pts[i + 1].y) / 2}`;
    }
    d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
    return d;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      {[0, 0.5, 1].map((frac, idx) => {
        const y = padding.top + chartH * (1 - frac);
        return (
          <g key={idx}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f1f5f9" strokeDasharray="4 4" />
            <text x={padding.left - 6} y={y + 4} fill="#94a3b8" fontSize="10" textAnchor="end">
              {Math.round((frac * maxVal) / 1000)}K
            </text>
          </g>
        );
      })}
      <path d={makePath(pointsAlloc)} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4 4" />
      <path d={makePath(pointsUsed)} fill="none" stroke="#7c3aed" strokeWidth="2.5" />
    </svg>
  );
}

// ── SVG Security Events Chart ────────────────────────────────────────────────
function SecurityEventsChart({ data }: { data: { label: string; successful_logins: number; failed_logins: number; policy_violations: number }[] }) {
  const width = 600;
  const height = 210;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };

  const maxVal = Math.max(...data.map(d => Math.max(d.successful_logins, d.failed_logins, d.policy_violations)), 80);
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const ptsSuccess = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.successful_logins / maxVal) * chartH
  }));

  const ptsFailed = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.failed_logins / maxVal) * chartH
  }));

  const ptsViolations = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.policy_violations / maxVal) * chartH
  }));

  const makePath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cx = (pts[i].x + pts[i + 1].x) / 2;
      d += ` Q ${pts[i].x} ${pts[i].y}, ${cx} ${(pts[i].y + pts[i + 1].y) / 2}`;
    }
    d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
    return d;
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%', overflow: 'visible' }}>
      {[0, 0.5, 1].map((frac, idx) => {
        const y = padding.top + chartH * (1 - frac);
        return (
          <g key={idx}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f1f5f9" strokeDasharray="4 4" />
            <text x={padding.left - 6} y={y + 4} fill="#94a3b8" fontSize="10" textAnchor="end">
              {Math.round(frac * maxVal)}
            </text>
          </g>
        );
      })}
      <path d={makePath(ptsSuccess)} fill="none" stroke="#7c3aed" strokeWidth="2.2" />
      <path d={makePath(ptsFailed)} fill="none" stroke="#ef4444" strokeWidth="2.2" />
      <path d={makePath(ptsViolations)} fill="none" stroke="#f59e0b" strokeWidth="2.2" />
    </svg>
  );
}

// ── SVG Activity Trend Chart Component (Tab 6 - Matching Image 2) ────────────
function ActivityTrendChart({
  data,
  hoveredIdx,
  onHover
}: {
  data: Array<{
    date: string;
    label: string;
    total_requests: number;
    successful: number;
    failed: number;
    avg_response_time: number;
  }>;
  hoveredIdx: number | null;
  onHover: (idx: number | null) => void;
}) {
  if (!data || data.length === 0) return null;

  const width = 600;
  const height = 210;
  const padding = { top: 20, right: 20, bottom: 30, left: 45 };

  const maxRequests = Math.max(...data.map(d => Math.max(d.total_requests, d.successful, d.failed)), 100);
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const pointsSuccess = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.successful / maxRequests) * chartH,
    ...d
  }));

  const pointsFailed = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - (d.failed / maxRequests) * chartH,
    ...d
  }));

  const maxRespTime = Math.max(...data.map(d => d.avg_response_time || 0), 1);
  const pointsRespTime = data.map((d, i) => ({
    x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
    y: padding.top + chartH - ((d.avg_response_time || 0) / maxRespTime) * chartH,
    ...d
  }));

  const makePath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const cx = (pts[i].x + pts[i + 1].x) / 2;
      d += ` Q ${pts[i].x} ${pts[i].y}, ${cx} ${(pts[i].y + pts[i + 1].y) / 2}`;
    }
    d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
    return d;
  };

  const pathSuccess = makePath(pointsSuccess);
  const pathFailed = makePath(pointsFailed);
  const pathRespTime = makePath(pointsRespTime);
  const areaSuccess = `${pathSuccess} L ${pointsSuccess[pointsSuccess.length - 1].x} ${height - padding.bottom} L ${pointsSuccess[0].x} ${height - padding.bottom} Z`;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
        onMouseLeave={() => onHover(null)}
      >
        <defs>
          <linearGradient id="actSuccessGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
          const y = padding.top + chartH * (1 - frac);
          const val = Math.round(frac * maxRequests);
          const displayVal = val >= 1000 ? `${(val / 1000).toFixed(0)}K` : val;
          return (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#f1f5f9"
                strokeDasharray="4 4"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                fill="#94a3b8"
                fontSize="10"
                textAnchor="end"
              >
                {displayVal}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaSuccess} fill="url(#actSuccessGrad)" />

        {/* Lines */}
        <path d={pathSuccess} fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" />
        <path d={pathFailed} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        <path d={pathRespTime} fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeDasharray="3 3" strokeLinecap="round" />

        {/* Interactive hover targets & points */}
        {pointsSuccess.map((p, idx) => (
          <g key={idx}>
            <circle
              cx={p.x}
              cy={p.y}
              r={hoveredIdx === idx ? 5.5 : 2}
              fill="#7c3aed"
              stroke="#ffffff"
              strokeWidth="2"
            />
            {hoveredIdx === idx && (
              <line
                x1={p.x}
                y1={padding.top}
                x2={p.x}
                y2={height - padding.bottom}
                stroke="#cbd5e1"
                strokeDasharray="3 3"
              />
            )}
            <rect
              x={p.x - chartW / (data.length * 2)}
              y={padding.top}
              width={chartW / data.length}
              height={chartH}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => onHover(idx)}
            />
          </g>
        ))}

        {/* Date Labels */}
        {data.map((d, i) => {
          if (i % 5 !== 0 && i !== data.length - 1) return null;
          const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
          return (
            <text
              key={i}
              x={x}
              y={height - 8}
              fill="#94a3b8"
              fontSize="10"
              textAnchor="middle"
            >
              {d.label || d.date.slice(5)}
            </text>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoveredIdx !== null && data[hoveredIdx] && (
        <div
          style={{
            position: 'absolute',
            left: `${(pointsSuccess[hoveredIdx].x / width) * 100}%`,
            top: `${(pointsSuccess[hoveredIdx].y / height) * 100}%`,
            transform: 'translate(-50%, -125%)',
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '10px 14px',
            fontSize: '11.5px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08)',
            pointerEvents: 'none',
            zIndex: 25,
            minWidth: '175px'
          }}
        >
          <div style={{ fontWeight: 700, color: '#334155', marginBottom: 6, borderBottom: '1px solid #f1f5f9', paddingBottom: 4 }}>
            {data[hoveredIdx].label || data[hoveredIdx].date}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366f1' }} /> Total requests:
            </span>
            <strong style={{ color: '#0f172a' }}>{data[hoveredIdx].total_requests.toLocaleString()}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed' }} /> Successful:
            </span>
            <strong style={{ color: '#7c3aed' }}>{data[hoveredIdx].successful.toLocaleString()}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> Failed:
            </span>
            <strong style={{ color: '#ef4444' }}>{data[hoveredIdx].failed.toLocaleString()}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#06b6d4' }} /> Avg. Time:
            </span>
            <strong style={{ color: '#0891b2' }}>{data[hoveredIdx].avg_response_time}s</strong>
          </div>
        </div>
      )}
    </div>
  );
}
