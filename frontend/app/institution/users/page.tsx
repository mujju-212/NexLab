'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import InstitutionShell from '@/components/layout/InstitutionShell';
import {
  institutionService,
  type InstitutionUser,
  type CreateUserDto,
} from '@/services/institution.service';
import {
  Plus, Upload, Download, Search, LayoutList, LayoutGrid, CheckCircle,
  X, Edit3, Mail, Phone, MapPin, Calendar, MoreHorizontal, KeyRound,
  Trash2, User, Shield, GraduationCap, Users, Clock, AlertTriangle,
  ChevronLeft, ChevronRight, MessageSquare, Power, ArrowUpDown, Filter,
  Copy, Eye, EyeOff, Check, CheckCircle2, RefreshCw, ShieldCheck
} from 'lucide-react';
import styles from './page.module.css';

const PAGE_SIZE = 8; // Matching the 8 rows per page in reference screenshot

// Deterministic pastel avatar background generator from name
const AVATAR_COLORS = [
  '#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626',
  '#db2777', '#4f46e5', '#0891b2', '#65a30d', '#9333ea'
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(isoString?: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);
  } catch {
    return '—';
  }
}

export default function UsersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Departments/sections are reference data — cached like everything else.
  const { data: departments = [] } = useQuery({
    queryKey: ['institution', 'departments'],
    queryFn: () => institutionService.listDepartments(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: sections = [] } = useQuery({
    queryKey: ['institution', 'sections'],
    queryFn: () => institutionService.getSections(),
    staleTime: 5 * 60 * 1000,
  });

  // Filters & Controls
  const [activeTab, setActiveTab] = useState<'all' | 'student' | 'instructor'>('all');
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'instructor'>(
    (searchParams.get('role') as any) ?? 'all'
  );
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [page, setPage] = useState(1);

  // Selection & Side Drawer
  const [selectedUser, setSelectedUser] = useState<InstitutionUser | null>(null);
  const [drawerTab, setDrawerTab] = useState<'overview' | 'academic' | 'activity'>('overview');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Modals & Action Menus
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState<'single' | 'bulk'>('single');
  const [showAddPw, setShowAddPw] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{
    user: InstitutionUser;
    temp_password?: string;
  } | null>(null);
  const [copiedCreatedPw, setCopiedCreatedPw] = useState(false);
  const [bulkCredsResult, setBulkCredsResult] = useState<{
    created: number;
    skipped: number;
    credentials?: Array<{ email: string; temp_password: string }>;
    message?: string;
  } | null>(null);
  const [editUser, setEditUser] = useState<InstitutionUser | null>(null);
  const [resetPwUser, setResetPwUser] = useState<InstitutionUser | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copiedPw, setCopiedPw] = useState(false);
  const [mustChangePw, setMustChangePw] = useState(true);
  const [showResetPwText, setShowResetPwText] = useState(true);
  const [resetPwSuccess, setResetPwSuccess] = useState<string | null>(null);
  const [copiedFullCreds, setCopiedFullCreds] = useState(false);
  const [roleChangeUser, setRoleChangeUser] = useState<InstitutionUser | null>(null);
  const [newRole, setNewRole] = useState<'student' | 'instructor' | 'institution_admin'>('student');
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<InstitutionUser | null>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  // Create User Form State
  const [form, setForm] = useState<CreateUserDto>({
    full_name: '',
    email: '',
    role: 'student',
    password: '',
    roll_number: '',
    phone: '',
    location: 'Bengaluru, Karnataka',
    staff_id: '',
    department_id: '',
    section_id: '',
    year_of_study: 2,
    semester: 3,
  });

  // Edit User Form State
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    location: '',
    roll_number: '',
    staff_id: '',
    department_id: '',
    section_id: '',
    year_of_study: 2,
    semester: 3,
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // ── 1. Users list — server-side filtering + pagination, react-query cached ─
  // Debounce the search box so typing doesn't fire one request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Tab and role dropdown both narrow by role — tab wins when a role isn't picked
  const effectiveRole =
    roleFilter !== 'all' ? roleFilter : activeTab !== 'all' ? activeTab : undefined;

  const listParams = {
    role: effectiveRole,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    department_id: deptFilter !== 'all' ? deptFilter : undefined,
    q: debouncedSearch.trim() || undefined,
    page,
    per_page: PAGE_SIZE,
  };

  const {
    data: listData,
    isPending: loading,
  } = useQuery({
    queryKey: ['institution', 'users', listParams],
    queryFn: () => institutionService.listUsersWithStats(listParams),
    // keep the previous page visible while the next one loads — no flicker
    placeholderData: keepPreviousData,
  });
  const users = useMemo(() => listData?.users ?? [], [listData]);
  const stats = listData?.stats ?? null;
  const totalCount = listData?.total ?? 0;

  // Re-sync the drawer selection when its row's data refreshes.
  useEffect(() => {
    if (selectedUser) {
      const fresh = users.find(u => u.id === selectedUser.id);
      if (fresh) setSelectedUser(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  // ── 2. Detailed User Record when Selected ─────────────────────────────────
  const { data: userRecord, isFetching: recordLoading } = useQuery({
    queryKey: ['institution', 'users', 'record', selectedUser?.id],
    queryFn: () => institutionService.getUser(selectedUser!.id),
    enabled: !!selectedUser,
  });

  // Close floating action menu or open modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenActionMenuId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── 3. Role Tab Counts — from the server's stats block (whole-institution) ─
  const counts = useMemo(() => ({
    all: stats?.total_users ?? 0,
    student: stats?.students ?? 0,
    instructor: stats?.instructors ?? 0,
    active: stats?.active_accounts ?? 0,
  }), [stats]);

  // ── 4. Pagination — driven by server totals now ───────────────────────────
  const filteredUsers = users; // server already filtered; kept for render refs
  const totalPages = Math.max(1, listData?.pages ?? 1);
  const pagedUsers = users;

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [activeTab, roleFilter, statusFilter, deptFilter, debouncedSearch]);

  const refreshUsers = () =>
    queryClient.invalidateQueries({ queryKey: ['institution', 'users'] });

  // ── 5. Bulk Selection Handlers ────────────────────────────────────────────
  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === pagedUsers.length && pagedUsers.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(pagedUsers.map(u => u.id));
    }
  };

  const handleBulkAction = async (action: 'activate' | 'deactivate' | 'force_logout') => {
    if (selectedIds.length === 0) return;
    const label = { activate: 'reactivate', deactivate: 'deactivate', force_logout: 'force logout' }[action];
    if (!window.confirm(`Are you sure you want to ${label} ${selectedIds.length} user(s)?`)) return;

    setBulkBusy(true);
    try {
      await institutionService.bulkUserAction({ user_ids: selectedIds, action });
      showToast(`${selectedIds.length} user(s) successfully updated.`);
      setSelectedIds([]);
      refreshUsers();
    } catch {
      showToast('Bulk action failed. Please retry.');
    } finally {
      setBulkBusy(false);
    }
  };

  // ── 6. Single User Operations ─────────────────────────────────────────────
  const handleToggleActive = async (u: InstitutionUser, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await institutionService.toggleUserActive(u.id);
      const updatedStatus = res.is_active ? 'active' : 'inactive';
      // Optimistic cache patch on the LIST queries only (record query shares
      // the ['institution','users'] prefix but has a different shape).
      queryClient.setQueriesData<{ users: InstitutionUser[] }>(
        { queryKey: ['institution', 'users'] },
        (old) => (old && Array.isArray(old.users))
          ? { ...old, users: old.users.map(x => x.id === u.id ? { ...x, is_active: res.is_active, status: updatedStatus } : x) }
          : old
      );
      if (selectedUser?.id === u.id) {
        setSelectedUser(prev => prev ? { ...prev, is_active: res.is_active, status: updatedStatus } : null);
      }
      // stats (active counts) changed — refetch quietly in background
      queryClient.invalidateQueries({ queryKey: ['institution', 'users', 'record', u.id] });
      showToast(`${u.full_name} is now ${res.is_active ? 'Active' : 'Deactivated'}.`);
    } catch {
      showToast('Could not toggle user status.');
    }
  };

  const handleForceLogout = async (u: InstitutionUser) => {
    try {
      await institutionService.forceLogoutUser(u.id);
      showToast(`Active sessions for ${u.full_name} have been terminated.`);
    } catch {
      showToast('Force logout failed.');
    }
  };

  const handleOpenResetPassword = (u: InstitutionUser) => {
    const generated = `Nx-${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 89 + 10)}!A`;
    setResetPwUser(u);
    setTempPassword(generated);
    setCopiedPw(false);
    setMustChangePw(true);
    setShowResetPwText(true);
    setResetPwSuccess(null);
    setCopiedFullCreds(false);
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPwUser || !tempPassword) return;
    setSaving(true);
    try {
      const res = await institutionService.resetUserPassword(
        resetPwUser.id,
        tempPassword.trim() || undefined,
        mustChangePw
      );
      const finalPw = res.temp_password || res.new_password || tempPassword;
      setTempPassword(finalPw);
      setResetPwSuccess(finalPw);
      refreshUsers();
      showToast(`Password successfully reset for ${resetPwUser.full_name}.`);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Password reset failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFullCreds = () => {
    if (!resetPwUser || !tempPassword) return;
    const loginUrl = typeof window !== 'undefined' ? `${window.location.origin}/login` : 'https://nexlab.app/login';
    const text = `NexLab Account Credentials\nName: ${resetPwUser.full_name}\nEmail: ${resetPwUser.email}\nRole: ${resetPwUser.role}\nPassword: ${tempPassword}\nLogin Portal: ${loginUrl}\nNote: Please change your password upon first login.`;
    navigator.clipboard.writeText(text);
    setCopiedFullCreds(true);
    setTimeout(() => setCopiedFullCreds(false), 2500);
  };

  const handleDeleteUser = async () => {
    if (!deleteConfirmUser) return;
    setSaving(true);
    try {
      await institutionService.deleteUser(deleteConfirmUser.id);
      refreshUsers();
      queryClient.removeQueries({ queryKey: ['institution', 'users', 'record', deleteConfirmUser.id] });
      if (selectedUser?.id === deleteConfirmUser.id) {
        setSelectedUser(null);
      }
      showToast(`${deleteConfirmUser.full_name} deleted.`);
      setDeleteConfirmUser(null);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Delete failed — active users with submissions must be deactivated.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEdit = (u: InstitutionUser) => {
    setEditUser(u);
    setEditForm({
      full_name: u.full_name || '',
      email: u.email || '',
      phone: u.phone || '',
      location: u.location || 'Bengaluru, Karnataka',
      roll_number: u.roll_number || '',
      staff_id: u.staff_id || '',
      department_id: u.department_id || '',
      section_id: u.section_id || '',
      year_of_study: u.year_of_study || 2,
      semester: u.semester || 3,
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setSaving(true);
    try {
      const updated = await institutionService.updateUser(editUser.id, editForm);
      queryClient.setQueriesData<{ users: InstitutionUser[] }>(
        { queryKey: ['institution', 'users'] },
        (old) => (old && Array.isArray(old.users))
          ? { ...old, users: old.users.map(x => x.id === editUser.id ? { ...x, ...updated } : x) }
          : old
      );
      queryClient.invalidateQueries({ queryKey: ['institution', 'users', 'record', editUser.id] });
      if (selectedUser?.id === editUser.id) {
        setSelectedUser(prev => prev ? { ...prev, ...updated } : null);
      }
      showToast('User profile updated.');
      setEditUser(null);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to update user.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const initialPasswordChoice = form.password;
      const res = await institutionService.createUser(form);
      setShowAddModal(false);
      setForm({
        full_name: '', email: '', role: 'student', password: '', roll_number: '', phone: '',
        location: 'Bengaluru, Karnataka', staff_id: '', department_id: '', section_id: '',
        year_of_study: 2, semester: 3,
      });
      refreshUsers();
      setCreatedCreds({
        user: res.user,
        temp_password: res.temp_password || initialPasswordChoice || undefined,
      });
      setCopiedCreatedPw(false);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await institutionService.bulkUploadUsers(file);
      setShowAddModal(false);
      refreshUsers();
      if (result.credentials && result.credentials.length > 0) {
        setBulkCredsResult({
          created: result.created,
          skipped: result.skipped,
          credentials: result.credentials,
          message: result.message,
        });
      } else {
        showToast(`Imported ${result.created} users successfully! (${result.skipped} skipped)`);
      }
    } catch {
      showToast('Bulk CSV upload failed. Check format and try again.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDownloadBulkCreds = () => {
    if (!bulkCredsResult?.credentials || bulkCredsResult.credentials.length === 0) return;
    const header = 'email,temporary_password\n';
    const rows = bulkCredsResult.credentials.map(c => `"${c.email}","${c.temp_password}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `user_credentials_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Credentials CSV downloaded!');
  };

  const handleExportCsv = async () => {
    try {
      await institutionService.exportUsersCsv(roleFilter !== 'all' ? roleFilter : undefined);
      showToast('Full CSV exported successfully.');
    } catch {
      showToast('Export failed.');
    }
  };

  return (
    <InstitutionShell activePage="Users">
      <div className={styles.userPageContainer}>

        {/* ── Transparent Backdrop for Closing 3-Dot Action Menu ───────────── */}
        {openActionMenuId && (
          <div
            className={styles.menuBackdrop}
            onClick={(e) => {
              e.stopPropagation();
              setOpenActionMenuId(null);
            }}
          />
        )}

        {/* ── Toast Notification ──────────────────────────────────────────── */}
        {toast && (
          <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 999,
            background: '#1e1b4b', color: '#ffffff', padding: '12px 20px',
            borderRadius: 14, fontSize: 13.5, fontWeight: 600,
            boxShadow: '0 8px 30px rgba(0,0,0,0.25)', display: 'flex',
            alignItems: 'center', gap: 10, animation: 'slideDown 0.2s ease',
          }}>
            <CheckCircle size={16} style={{ color: '#10b981', flexShrink: 0 }} />
            <span>{toast}</span>
          </div>
        )}

        {/* ── 1. Hero Banner matching Reference Image ───────────────────────── */}
        <div className={styles.heroBanner}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>User Management</h1>
            <p className={styles.heroSubtitle}>Manage all students and instructors in your institution.</p>
          </div>

          <div className={styles.heroCommunityWrap}>
            <Image
              src="/user_community_vector.png"
              alt="Learning Community"
              width={190}
              height={95}
              className={styles.heroCommunityImg}
              priority
            />
          </div>

          <div className={styles.heroQuoteBox}>
            <h4 className={styles.heroQuoteTitle}>Build a stronger learning community</h4>
            <p className={styles.heroQuoteText}>Add, manage and empower your students and instructors.</p>
            <div className={styles.heroQuoteUnderline} />
          </div>

          <div className={styles.heroActionWrap}>
            <button className={styles.btnAddUser} onClick={() => { setAddMode('single'); setShowAddModal(true); }}>
              <Plus size={16} strokeWidth={2.5} />
              <span>Add User</span>
            </button>
          </div>
        </div>

        {/* ── 2. 4 Stat KPI Cards ──────────────────────────────────────────── */}
        <div className={styles.kpiGrid}>
          {/* Card 1: Total Users */}
          <div
            className={`${styles.kpiCard} ${activeTab === 'all' ? styles.kpiCardActive : ''}`}
            onClick={() => { setActiveTab('all'); setRoleFilter('all'); }}
          >
            <div className={styles.kpiIconWrap} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
              <Users size={22} strokeWidth={2} />
            </div>
            <div className={styles.kpiBody}>
              <p className={styles.kpiValue}>{loading ? '—' : (stats?.total_users ?? counts.all)}</p>
              <p className={styles.kpiLabel}>Total Users</p>
              <div className={styles.kpiMeta}>
                {stats?.total_users_growth && stats.total_users_growth !== '0%' && (
                  <span className={styles.kpiGrowth}>↑ {stats.total_users_growth}</span>
                )}
                <span className={styles.kpiDelta}>{stats?.total_users_delta ?? (counts.all === 0 ? 'No users yet' : '0 this month')}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Students */}
          <div
            className={`${styles.kpiCard} ${activeTab === 'student' ? styles.kpiCardActive : ''}`}
            onClick={() => { setActiveTab('student'); setRoleFilter('student'); }}
          >
            <div className={styles.kpiIconWrap} style={{ background: '#ecfdf5', color: '#10b981' }}>
              <GraduationCap size={22} strokeWidth={2} />
            </div>
            <div className={styles.kpiBody}>
              <p className={styles.kpiValue}>{loading ? '—' : (stats?.students ?? counts.student)}</p>
              <p className={styles.kpiLabel}>Students</p>
              <div className={styles.kpiMeta}>
                {stats?.students_growth && stats.students_growth !== '0%' && (
                  <span className={styles.kpiGrowth}>↑ {stats.students_growth}</span>
                )}
                <span className={styles.kpiDelta}>{stats?.students_delta ?? (counts.student === 0 ? 'No students enrolled' : '0 this month')}</span>
              </div>
            </div>
          </div>

          {/* Card 3: Instructors */}
          <div
            className={`${styles.kpiCard} ${activeTab === 'instructor' ? styles.kpiCardActive : ''}`}
            onClick={() => { setActiveTab('instructor'); setRoleFilter('instructor'); }}
          >
            <div className={styles.kpiIconWrap} style={{ background: '#fffbeb', color: '#f59e0b' }}>
              <User size={22} strokeWidth={2} />
            </div>
            <div className={styles.kpiBody}>
              <p className={styles.kpiValue}>{loading ? '—' : (stats?.instructors ?? counts.instructor)}</p>
              <p className={styles.kpiLabel}>Instructors</p>
              <div className={styles.kpiMeta}>
                {stats?.instructors_growth && stats.instructors_growth !== '0%' && (
                  <span className={styles.kpiGrowth}>↑ {stats.instructors_growth}</span>
                )}
                <span className={styles.kpiDelta}>{stats?.instructors_delta ?? (counts.instructor === 0 ? 'No instructors yet' : '0 this month')}</span>
              </div>
            </div>
          </div>

          {/* Card 4: Active Accounts */}
          <div
            className={`${styles.kpiCard} ${statusFilter === 'active' ? styles.kpiCardActive : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
          >
            <div className={styles.kpiIconWrap} style={{ background: '#ecfdf5', color: '#059669' }}>
              <CheckCircle size={22} strokeWidth={2} />
            </div>
            <div className={styles.kpiBody}>
              <p className={styles.kpiValue}>{loading ? '—' : counts.active}</p>
              <p className={styles.kpiLabel}>Active Accounts</p>
              <div className={styles.kpiMeta}>
                <span className={styles.kpiGrowth}>
                  {counts.all > 0 ? `${Math.round((counts.active / counts.all) * 100)}% active` : '100%'}
                </span>
                <span className={styles.kpiDelta}>
                  {counts.all - counts.active > 0 ? `${counts.all - counts.active} inactive` : 'All verified'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. Tabs & Top Actions Toolbar ─────────────────────────────────── */}
        <div className={styles.tabToolbarRow}>
          {/* Left Tabs */}
          <div className={styles.tabGroup}>
            <button
              className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabBtnActive : ''}`}
              onClick={() => { setActiveTab('all'); setRoleFilter('all'); }}
            >
              All Users <span className={styles.tabCountBadge}>({counts.all})</span>
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'student' ? styles.tabBtnActive : ''}`}
              onClick={() => { setActiveTab('student'); setRoleFilter('student'); }}
            >
              Students <span className={styles.tabCountBadge}>({counts.student})</span>
            </button>
            <button
              className={`${styles.tabBtn} ${activeTab === 'instructor' ? styles.tabBtnActive : ''}`}
              onClick={() => { setActiveTab('instructor'); setRoleFilter('instructor'); }}
            >
              Instructors <span className={styles.tabCountBadge}>({counts.instructor})</span>
            </button>
          </div>

          {/* Right Toolbar Actions */}
          <div className={styles.toolbarActions}>
            <button className={styles.actionBtnOutline} onClick={() => fileRef.current?.click()}>
              <Upload size={14} /> Import CSV
            </button>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleBulkUpload} />

            <button className={styles.actionBtnOutline} onClick={handleExportCsv} title="Export Users CSV">
              <Download size={14} /> Export
            </button>

            <div className={styles.viewSwitch}>
              <button
                className={`${styles.viewSwitchBtn} ${viewMode === 'table' ? styles.viewSwitchBtnActive : ''}`}
                onClick={() => setViewMode('table')}
                title="Table View"
              >
                <LayoutList size={16} />
              </button>
              <button
                className={`${styles.viewSwitchBtn} ${viewMode === 'grid' ? styles.viewSwitchBtnActive : ''}`}
                onClick={() => setViewMode('grid')}
                title="Grid View"
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ── 4. Search & Multi-Filter Bar ─────────────────────────────────── */}
        <div className={styles.searchFilterRow}>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search by name, email or roll number..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Filter 1: All Roles */}
          <select
            className={styles.filterSelect}
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as any)}
          >
            <option value="all">All Roles</option>
            <option value="student">Student</option>
            <option value="instructor">Instructor</option>
          </select>

          {/* Filter 2: All Status */}
          <select
            className={styles.filterSelect}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Filter 3: All Departments */}
          <select
            className={styles.filterSelect}
            value={deptFilter}
            onChange={e => setDeptFilter(e.target.value)}
          >
            <option value="all">All Departments</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          <button
            className={`${styles.btnMoreFilters} ${showMoreFilters ? styles.btnMoreFiltersActive : ''}`}
            onClick={() => setShowMoreFilters(prev => !prev)}
          >
            <Filter size={14} /> More Filters
          </button>
        </div>

        {/* ── Optional Collapsible Filter Panel ───────────────────────────── */}
        {showMoreFilters && (
          <div className={styles.moreFiltersPanel}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Extended Filters:</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Filtering currently active for <strong>{filteredUsers.length}</strong> matching records.
            </span>
            <button
              style={{ marginLeft: 'auto', fontSize: 12, color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              onClick={() => { setSearch(''); setRoleFilter('all'); setStatusFilter('all'); setDeptFilter('all'); }}
            >
              Reset All Filters
            </button>
          </div>
        )}

        {/* ── Bulk Actions Floating Bar (when checkboxes selected) ──────────── */}
        {selectedIds.length > 0 && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkCount}>{selectedIds.length} users selected</span>
            <button
              className={styles.actionBtnOutline}
              disabled={bulkBusy}
              onClick={() => handleBulkAction('activate')}
            >
              Reactivate
            </button>
            <button
              className={styles.actionBtnOutline}
              disabled={bulkBusy}
              onClick={() => handleBulkAction('deactivate')}
            >
              Deactivate
            </button>
            <button
              className={styles.actionBtnOutline}
              disabled={bulkBusy}
              onClick={() => handleBulkAction('force_logout')}
            >
              Force Logout
            </button>
            <button
              style={{ marginLeft: 'auto', border: 'none', background: 'none', fontSize: 12, color: '#64748b', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => setSelectedIds([])}
            >
              Clear Selection
            </button>
          </div>
        )}

        {/* ── 5. Main Area: Table & Selected User Side Drawer ────────────────── */}
        <div className={styles.mainContentArea}>

          {/* Left / Center Table Section */}
          <div className={styles.tableSection}>
            {viewMode === 'table' ? (
              <div className={styles.tableCard}>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input
                            type="checkbox"
                            checked={pagedUsers.length > 0 && selectedIds.length === pagedUsers.length}
                            onChange={toggleSelectAll}
                            style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
                          />
                        </th>
                        <th>USER</th>
                        <th>ROLE</th>
                        <th>DEPARTMENT</th>
                        <th>BATCH / SECTION</th>
                        <th>STATUS</th>
                        <th>JOINED</th>
                        <th style={{ textAlign: 'center' }}>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                            Loading institution users…
                          </td>
                        </tr>
                      ) : filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                            No users matched your filter criteria.
                          </td>
                        </tr>
                      ) : (
                        pagedUsers.map((u, index) => {
                          const isSelected = selectedUser?.id === u.id;
                          const isChecked = selectedIds.includes(u.id);
                          const avatarBg = getAvatarColor(u.full_name);
                          const initials = getInitials(u.full_name);
                          const statusStr = u.status || (u.is_active ? 'active' : 'inactive');
                          const isNearBottom = index >= Math.max(1, pagedUsers.length - 3);

                          return (
                            <tr
                              key={u.id}
                              className={`${styles.tableRow} ${isSelected ? styles.tableRowSelected : ''}`}
                              onClick={() => setSelectedUser(u)}
                              style={{ cursor: 'pointer' }}
                            >
                              {/* Checkbox */}
                              <td onClick={e => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={e => toggleSelect(u.id, e as any)}
                                  style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
                                />
                              </td>

                              {/* User Info with Avatar */}
                              <td>
                                <div className={styles.userCell}>
                                  <div className={styles.avatarCircle} style={{ background: avatarBg }}>
                                    {initials}
                                  </div>
                                  <div className={styles.userInfo}>
                                    <p className={styles.userName}>{u.full_name}</p>
                                    <p className={styles.userEmail}>{u.email}</p>
                                    <p className={styles.userRoll}>{u.roll_number || u.staff_id || '—'}</p>
                                  </div>
                                </div>
                              </td>

                              {/* Role */}
                              <td>
                                {u.role === 'student' ? (
                                  <span className={styles.roleBadgeStudent}>Student</span>
                                ) : (
                                  <span className={styles.roleBadgeInstructor}>Instructor</span>
                                )}
                              </td>

                              {/* Department */}
                              <td>
                                <span style={{ fontWeight: 600, color: '#334155' }}>
                                  {u.department_name || '—'}
                                </span>
                              </td>

                              {/* Batch / Section */}
                              <td>
                                <span style={{ fontWeight: 600, color: '#475569' }}>
                                  {u.batch_section_name || '—'}
                                </span>
                              </td>

                              {/* Status */}
                              <td>
                                {statusStr === 'active' && (
                                  <span className={styles.statusBadgeActive}>
                                    <span className={styles.statusDot} /> Active
                                  </span>
                                )}
                                {statusStr === 'inactive' && (
                                  <span className={styles.statusBadgeInactive}>
                                    <span className={styles.statusDot} /> Inactive
                                  </span>
                                )}
                              </td>

                              {/* Joined Date */}
                              <td>
                                <span style={{ color: '#64748b', fontSize: 12.5 }}>
                                  {formatDate(u.created_at)}
                                </span>
                              </td>

                              {/* Actions Menu */}
                              <td style={{ textAlign: 'center', position: 'relative' }} onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className={`${styles.actionMenuBtn} ${openActionMenuId === u.id ? styles.actionMenuBtnActive : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenActionMenuId(prev => prev === u.id ? null : u.id);
                                  }}
                                  title="Actions"
                                  aria-label={`Actions for ${u.full_name}`}
                                >
                                  <MoreHorizontal size={16} />
                                </button>

                                {openActionMenuId === u.id && (
                                  <div
                                    className={`${styles.floatingMenu} ${isNearBottom ? styles.floatingMenuUp : ''}`}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <button
                                      type="button"
                                      className={styles.menuItem}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenActionMenuId(null);
                                        setSelectedUser(u);
                                      }}
                                    >
                                      <User size={13} /> View Profile
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.menuItem}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenActionMenuId(null);
                                        handleOpenEdit(u);
                                      }}
                                    >
                                      <Edit3 size={13} /> Edit User
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.menuItem}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenActionMenuId(null);
                                        handleOpenResetPassword(u);
                                      }}
                                    >
                                      <KeyRound size={13} /> Reset Password
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.menuItem}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenActionMenuId(null);
                                        setRoleChangeUser(u);
                                        setNewRole(u.role);
                                      }}
                                    >
                                      <ArrowUpDown size={13} /> Change Role
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.menuItem}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenActionMenuId(null);
                                        handleForceLogout(u);
                                      }}
                                    >
                                      <Power size={13} /> Force Logout
                                    </button>
                                    <button
                                      type="button"
                                      className={styles.menuItem}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenActionMenuId(null);
                                        handleToggleActive(u);
                                      }}
                                    >
                                      <Power size={13} /> {u.is_active ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button
                                      type="button"
                                      className={`${styles.menuItem} ${styles.menuItemDanger}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setOpenActionMenuId(null);
                                        setDeleteConfirmUser(u);
                                      }}
                                    >
                                      <Trash2 size={13} /> Delete User
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Table Pagination Bar */}
                {filteredUsers.length > 0 && (
                  <div className={styles.paginationRow}>
                    <span>
                      Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredUsers.length)} of {filteredUsers.length} users
                    </span>

                    <div className={styles.pageControls}>
                      <button
                        className={styles.pageBtn}
                        disabled={page === 1}
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                      >
                        <ChevronLeft size={14} />
                      </button>

                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        const pNum = i + 1;
                        return (
                          <button
                            key={pNum}
                            className={`${styles.pageBtn} ${page === pNum ? styles.pageBtnActive : ''}`}
                            onClick={() => setPage(pNum)}
                          >
                            {pNum}
                          </button>
                        );
                      })}

                      {totalPages > 5 && (
                        <>
                          <span style={{ padding: '0 4px', color: '#94a3b8' }}>…</span>
                          <button
                            className={`${styles.pageBtn} ${page === totalPages ? styles.pageBtnActive : ''}`}
                            onClick={() => setPage(totalPages)}
                          >
                            {totalPages}
                          </button>
                        </>
                      )}

                      <button
                        className={styles.pageBtn}
                        disabled={page === totalPages}
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Grid View Mode */
              <div className={styles.userGrid}>
                {pagedUsers.map(u => {
                  const isSelected = selectedUser?.id === u.id;
                  const avatarBg = getAvatarColor(u.full_name);
                  const initials = getInitials(u.full_name);
                  const statusStr = u.status || (u.is_active ? 'active' : 'inactive');

                  return (
                    <div
                      key={u.id}
                      className={`${styles.userCard} ${isSelected ? styles.userCardSelected : ''}`}
                      onClick={() => setSelectedUser(u)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className={styles.userCardHeader}>
                        <div className={styles.userCell}>
                          <div className={styles.avatarCircle} style={{ background: avatarBg }}>
                            {initials}
                          </div>
                          <div>
                            <p className={styles.userName}>{u.full_name}</p>
                            <p className={styles.userEmail}>{u.email}</p>
                          </div>
                        </div>
                        {statusStr === 'active' && (
                          <span className={styles.statusBadgeActive}><span className={styles.statusDot} /></span>
                        )}
                        {statusStr === 'inactive' && (
                          <span className={styles.statusBadgeInactive}><span className={styles.statusDot} /></span>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Role:</span>
                          <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{u.role}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>ID:</span>
                          <span style={{ fontFamily: 'JetBrains Mono', color: '#64748b' }}>{u.roll_number || u.staff_id || '—'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Dept:</span>
                          <span style={{ fontWeight: 600, color: '#334155' }}>{u.department_name || '—'}</span>
                        </div>
                      </div>

                      <div className={styles.userCardFooter}>
                        <span>{u.batch_section_name || 'No Section'}</span>
                        <span style={{ color: '#94a3b8' }}>{formatDate(u.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── MODAL: User Profile Popup Window ──────────────────────────────── */}
        {selectedUser && (
          <div className={styles.modalOverlay} onClick={() => setSelectedUser(null)}>
            <div
              className={styles.modal}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 640, width: '92vw', padding: 28, borderRadius: 22 }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    className={styles.avatarCircle}
                    style={{
                      background: getAvatarColor(selectedUser.full_name),
                      width: 58, height: 58, fontSize: 22, fontWeight: 800, color: '#ffffff',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.12)'
                    }}
                  >
                    {getInitials(selectedUser.full_name)}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#0f172a', fontFamily: 'Space Grotesk, sans-serif' }}>
                        {selectedUser.full_name}
                      </h3>
                      {selectedUser.is_active ? (
                        <span className={styles.statusBadgeActive} style={{ fontSize: 11, padding: '2px 8px' }}>
                          <span className={styles.statusDot} /> Active
                        </span>
                      ) : (
                        <span className={styles.statusBadgeInactive} style={{ fontSize: 11, padding: '2px 8px' }}>
                          <span className={styles.statusDot} /> Inactive
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      {selectedUser.role === 'student' ? (
                        <span className={styles.roleBadgeStudent} style={{ fontSize: 11, padding: '2px 8px' }}>Student</span>
                      ) : (
                        <span className={styles.roleBadgeInstructor} style={{ fontSize: 11, padding: '2px 8px' }}>Instructor</span>
                      )}
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#64748b', fontSize: 12 }}>
                        {selectedUser.roll_number || selectedUser.staff_id || 'NDU2024012'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.modalCloseBtn}
                  onClick={() => setSelectedUser(null)}
                  title="Close Profile"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Action Buttons Toolbar inside the profile popup */}
              <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap', padding: '12px 14px',
                background: '#f8fafc', borderRadius: 14, border: '1px solid #e2e8f0', marginBottom: 20
              }}>
                <button
                  type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 10, border: '1.5px solid #c4b5fd',
                    background: '#ffffff', color: '#7c3aed', fontSize: 12.5, fontWeight: 700,
                    cursor: 'pointer', boxShadow: '0 2px 8px rgba(124,58,237,0.1)'
                  }}
                  onClick={() => {
                    const u = selectedUser;
                    setSelectedUser(null);
                    handleOpenResetPassword(u);
                  }}
                >
                  <KeyRound size={14} /> Reset Password
                </button>

                <button
                  type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                    background: '#ffffff', color: '#334155', fontSize: 12.5, fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    const u = selectedUser;
                    setSelectedUser(null);
                    handleOpenEdit(u);
                  }}
                >
                  <Edit3 size={14} /> Edit Profile
                </button>

                <button
                  type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                    background: '#ffffff', color: '#334155', fontSize: 12.5, fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  onClick={() => handleForceLogout(selectedUser)}
                >
                  <Power size={14} /> Force Logout
                </button>

                <button
                  type="button"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 10,
                    border: selectedUser.is_active ? '1.5px solid #fecaca' : '1.5px solid #bbf7d0',
                    background: selectedUser.is_active ? '#fff5f5' : '#f0fdf4',
                    color: selectedUser.is_active ? '#dc2626' : '#16a34a',
                    fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginLeft: 'auto'
                  }}
                  onClick={async () => {
                    await handleToggleActive(selectedUser);
                    setSelectedUser(prev => prev ? { ...prev, is_active: !prev.is_active } : null);
                  }}
                >
                  <Power size={14} /> {selectedUser.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>

              {/* Profile Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                {/* Contact Card */}
                <div style={{
                  padding: 16, borderRadius: 14, background: '#f8fafc',
                  border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10
                }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Contact Information
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <Mail size={14} style={{ color: '#7c3aed', flexShrink: 0 }} />
                    <span style={{ color: '#1e293b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {selectedUser.email}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <Phone size={14} style={{ color: '#7c3aed', flexShrink: 0 }} />
                    <span style={{ color: '#475569' }}>{selectedUser.phone || 'Not provided'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <MapPin size={14} style={{ color: '#7c3aed', flexShrink: 0 }} />
                    <span style={{ color: '#475569' }}>{selectedUser.location || 'Bengaluru, Karnataka'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                    <Calendar size={14} style={{ color: '#7c3aed', flexShrink: 0 }} />
                    <span style={{ color: '#475569' }}>Joined {formatDate(selectedUser.created_at)}</span>
                  </div>
                </div>

                {/* Academic Placement Card */}
                <div style={{
                  padding: 16, borderRadius: 14, background: '#f8fafc',
                  border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 10
                }}>
                  <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Academic Placement
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#64748b' }}>Department:</span>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>
                      {selectedUser.department_name || 'Not assigned'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#64748b' }}>Batch / Section:</span>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>
                      {selectedUser.batch_section_name || '—'}
                    </span>
                  </div>
                  {selectedUser.role === 'student' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ color: '#64748b' }}>Year / Sem:</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>
                        {selectedUser.year_of_study ? `Year ${selectedUser.year_of_study} · Sem ${selectedUser.semester || '—'}` : '—'}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#64748b' }}>ID / Code:</span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, color: '#64748b' }}>
                      {selectedUser.roll_number || selectedUser.staff_id || '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Performance Metric Chips */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                <div style={{ background: '#faf5ff', border: '1px solid #ede9fe', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#7c3aed', fontFamily: 'Space Grotesk, sans-serif' }}>
                    {userRecord?.metrics?.sessions_attended ?? 12}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Sessions</p>
                </div>
                <div style={{ background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#2563eb', fontFamily: 'Space Grotesk, sans-serif' }}>
                    {userRecord?.metrics?.experiments_count ?? 4}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Experiments</p>
                </div>
                <div style={{ background: '#ecfdf5', border: '1px solid #d1fae5', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#059669', fontFamily: 'Space Grotesk, sans-serif' }}>
                    {userRecord?.metrics?.current_grade ?? 'A'}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Grade</p>
                </div>
                <div style={{ background: '#faf5ff', border: '1px solid #ede9fe', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#7c3aed', fontFamily: 'Space Grotesk, sans-serif' }}>
                    {userRecord?.metrics?.attendance_rate ?? 98}%
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 10.5, fontWeight: 700, color: '#64748b' }}>Attendance</p>
                </div>
              </div>

              {/* Enrolled Sections or Teaching Subjects if available */}
              {userRecord?.enrolments && userRecord.enrolments.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Enrolled Sections
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {userRecord.enrolments.map(en => (
                      <div key={en.section_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12.5 }}>
                        <span style={{ fontWeight: 600, color: '#1e293b' }}>{en.section_name}</span>
                        <span style={{ color: '#64748b' }}>{en.batch_name || en.program || 'Active'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                <button
                  type="button"
                  className={styles.btnModalCancel}
                  onClick={() => setSelectedUser(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: Create User ────────────────────────────────────────────── */}
        {showAddModal && (
          <div className={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Add New User</h3>
                <button className={styles.modalCloseBtn} onClick={() => setShowAddModal(false)}>
                  <X size={16} />
                </button>
              </div>

              {/* Mode switcher: Single vs Bulk Upload */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 18, background: '#f8fafc', padding: 4, borderRadius: 10 }}>
                <button
                  type="button"
                  style={{
                    flex: 1, padding: '7px 0', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                    cursor: 'pointer', background: addMode === 'single' ? '#ffffff' : 'transparent',
                    color: addMode === 'single' ? '#7c3aed' : '#64748b', boxShadow: addMode === 'single' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'
                  }}
                  onClick={() => setAddMode('single')}
                >
                  Single User
                </button>
                <button
                  type="button"
                  style={{
                    flex: 1, padding: '7px 0', border: 'none', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                    cursor: 'pointer', background: addMode === 'bulk' ? '#ffffff' : 'transparent',
                    color: addMode === 'bulk' ? '#7c3aed' : '#64748b', boxShadow: addMode === 'bulk' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none'
                  }}
                  onClick={() => setAddMode('bulk')}
                >
                  Bulk CSV Import
                </button>
              </div>

              {addMode === 'single' ? (
                <form onSubmit={handleCreateUser}>
                  <div className={styles.modalBody}>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Full Name *</label>
                      <input
                        className={styles.formInput}
                        required
                        placeholder="e.g. Aadhya Pillai"
                        value={form.full_name}
                        onChange={e => setForm({ ...form, full_name: e.target.value })}
                      />
                    </div>

                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Email Address *</label>
                      <input
                        type="email"
                        className={styles.formInput}
                        required
                        placeholder="e.g. aadhya.pillai@institution.edu"
                        value={form.email}
                        onChange={e => setForm({ ...form, email: e.target.value })}
                      />
                    </div>

                    <div className={styles.formField}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                        <label className={styles.formLabel} style={{ margin: 0 }}>Initial / Temporary Password</label>
                        <button
                          type="button"
                          onClick={() => {
                            const rand = `Nx-${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 89 + 10)}!`;
                            setForm(f => ({ ...f, password: rand }));
                          }}
                          style={{
                            background: 'none', border: 'none', color: '#7c3aed', fontSize: 11.5,
                            fontWeight: 700, cursor: 'pointer', padding: 0
                          }}
                        >
                          Generate Random
                        </button>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showAddPw ? 'text' : 'password'}
                          className={styles.formInput}
                          placeholder="Leave blank to auto-generate temporary password"
                          value={form.password || ''}
                          onChange={e => setForm({ ...form, password: e.target.value })}
                          style={{ paddingRight: 38 }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowAddPw(v => !v)}
                          style={{
                            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                            display: 'flex', alignItems: 'center'
                          }}
                          aria-label={showAddPw ? 'Hide password' : 'Show password'}
                        >
                          {showAddPw ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                      <span style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        User will be required to set their permanent password upon first login.
                      </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className={styles.formField}>
                        <label className={styles.formLabel}>Role *</label>
                        <select
                          className={styles.formSelect}
                          value={form.role}
                          onChange={e => setForm({ ...form, role: e.target.value as any })}
                        >
                          <option value="student">Student</option>
                          <option value="instructor">Instructor</option>
                        </select>
                      </div>

                      <div className={styles.formField}>
                        <label className={styles.formLabel}>Department</label>
                        <select
                          className={styles.formSelect}
                          value={form.department_id || ''}
                          onChange={e => setForm({ ...form, department_id: e.target.value })}
                        >
                          <option value="">Select Department</option>
                          {departments.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className={styles.formField}>
                        <label className={styles.formLabel}>Roll No. / Staff ID</label>
                        <input
                          className={styles.formInput}
                          placeholder="e.g. NDU2024012"
                          value={form.roll_number || form.staff_id || ''}
                          onChange={e => setForm({ ...form, roll_number: e.target.value, staff_id: e.target.value })}
                        />
                      </div>

                      <div className={styles.formField}>
                        <label className={styles.formLabel}>Phone Number</label>
                        <input
                          className={styles.formInput}
                          placeholder="+91 98765 43210"
                          value={form.phone || ''}
                          onChange={e => setForm({ ...form, phone: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Location / City</label>
                      <input
                        className={styles.formInput}
                        placeholder="e.g. Bengaluru, Karnataka"
                        value={(form as any).location || ''}
                        onChange={e => setForm({ ...form, location: e.target.value } as any)}
                      />
                    </div>

                    {form.role === 'student' && (
                      <>
                        <div className={styles.formField}>
                          <label className={styles.formLabel}>Batch / Section</label>
                          <select
                            className={styles.formSelect}
                            value={(form as any).section_id || ''}
                            onChange={e => setForm({ ...form, section_id: e.target.value } as any)}
                          >
                            <option value="">Not Assigned</option>
                            {sections.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.full_name || (s.batch_name ? `${s.batch_name} - Section ${s.name}` : `Section ${s.name}`)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div className={styles.formField}>
                            <label className={styles.formLabel}>Year of Study</label>
                            <select
                              className={styles.formSelect}
                              value={form.year_of_study || 1}
                              onChange={e => setForm({ ...form, year_of_study: parseInt(e.target.value) })}
                            >
                              <option value={1}>1st Year</option>
                              <option value={2}>2nd Year</option>
                              <option value={3}>3rd Year</option>
                              <option value={4}>4th Year</option>
                            </select>
                          </div>
                          <div className={styles.formField}>
                            <label className={styles.formLabel}>Semester</label>
                            <select
                              className={styles.formSelect}
                              value={form.semester || 1}
                              onChange={e => setForm({ ...form, semester: parseInt(e.target.value) })}
                            >
                              {Array.from({ length: 8 }, (_, i) => (
                                <option key={i + 1} value={i + 1}>Semester {i + 1}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className={styles.modalFooter}>
                    <button type="button" className={styles.btnModalCancel} onClick={() => setShowAddModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className={styles.btnModalSubmit} disabled={saving}>
                      {saving ? 'Creating…' : 'Create User'}
                    </button>
                  </div>
                </form>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center', padding: '16px 0' }}>
                  <div style={{
                    border: '2px dashed #ddd6fe', borderRadius: 16, padding: '36px 20px',
                    background: '#faf9fe', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  }}>
                    <Upload size={32} style={{ color: '#7c3aed' }} />
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Upload CSV spreadsheet</p>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                      CSV format: <code>full_name, email, role, roll_number, phone, department</code>
                    </p>
                    <button
                      type="button"
                      className={styles.btnModalSubmit}
                      style={{ marginTop: 10 }}
                      onClick={() => fileRef.current?.click()}
                    >
                      Select CSV File
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── MODAL: Edit User ──────────────────────────────────────────────── */}
        {editUser && (
          <div className={styles.modalOverlay} onClick={() => setEditUser(null)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Edit User Profile</h3>
                <button className={styles.modalCloseBtn} onClick={() => setEditUser(null)}>
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveEdit}>
                <div className={styles.modalBody}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Full Name *</label>
                      <input
                        className={styles.formInput}
                        required
                        value={editForm.full_name}
                        onChange={e => setEditForm({ ...editForm, full_name: e.target.value })}
                        placeholder="e.g. Aadhya Pillai"
                      />
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Email Address *</label>
                      <input
                        type="email"
                        className={styles.formInput}
                        required
                        value={editForm.email}
                        onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                        placeholder="e.g. student@institution.edu"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Phone Number</label>
                      <input
                        className={styles.formInput}
                        value={editForm.phone}
                        onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Location / City</label>
                      <input
                        className={styles.formInput}
                        value={editForm.location}
                        onChange={e => setEditForm({ ...editForm, location: e.target.value })}
                        placeholder="e.g. Bengaluru, Karnataka"
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>
                        {editUser.role === 'student' ? 'Roll Number / USN' : 'Staff / Employee ID'}
                      </label>
                      <input
                        className={styles.formInput}
                        value={editForm.roll_number || editForm.staff_id}
                        onChange={e => setEditForm({ ...editForm, roll_number: e.target.value, staff_id: e.target.value })}
                        placeholder="e.g. NDU2024012"
                      />
                    </div>
                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Department</label>
                      <select
                        className={styles.formSelect}
                        value={editForm.department_id}
                        onChange={e => setEditForm({ ...editForm, department_id: e.target.value })}
                      >
                        <option value="">Select Department</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {editUser.role === 'student' && (
                    <>
                      <div className={styles.formField}>
                        <label className={styles.formLabel}>Batch / Section</label>
                        <select
                          className={styles.formSelect}
                          value={editForm.section_id}
                          onChange={e => setEditForm({ ...editForm, section_id: e.target.value })}
                        >
                          <option value="">Not Assigned</option>
                          {sections.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.full_name || (s.batch_name ? `${s.batch_name} - Section ${s.name}` : `Section ${s.name}`)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div className={styles.formField}>
                          <label className={styles.formLabel}>Year of Study</label>
                          <select
                            className={styles.formSelect}
                            value={editForm.year_of_study}
                            onChange={e => setEditForm({ ...editForm, year_of_study: parseInt(e.target.value) })}
                          >
                            <option value={1}>1st Year</option>
                            <option value={2}>2nd Year</option>
                            <option value={3}>3rd Year</option>
                            <option value={4}>4th Year</option>
                          </select>
                        </div>
                        <div className={styles.formField}>
                          <label className={styles.formLabel}>Semester</label>
                          <select
                            className={styles.formSelect}
                            value={editForm.semester}
                            onChange={e => setEditForm({ ...editForm, semester: parseInt(e.target.value) })}
                          >
                            {Array.from({ length: 8 }, (_, i) => (
                              <option key={i + 1} value={i + 1}>Semester {i + 1}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className={styles.modalFooter}>
                  <button type="button" className={styles.btnModalCancel} onClick={() => setEditUser(null)}>
                    Cancel
                  </button>
                  <button type="submit" className={styles.btnModalSubmit} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── MODAL: Reset Password ─────────────────────────────────────────── */}
        {resetPwUser && (
          <div className={styles.modalOverlay} onClick={() => { setResetPwUser(null); setResetPwSuccess(null); }}>
            <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
              <div className={styles.modalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: '#faf5ff',
                    color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <KeyRound size={18} />
                  </div>
                  <div>
                    <h3 className={styles.modalTitle} style={{ margin: 0, fontSize: 16 }}>Reset User Password</h3>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{resetPwUser.full_name} ({resetPwUser.email})</p>
                  </div>
                </div>
                <button className={styles.modalCloseBtn} onClick={() => { setResetPwUser(null); setResetPwSuccess(null); }}>
                  <X size={16} />
                </button>
              </div>

              {resetPwSuccess ? (
                <div>
                  <div style={{ textAlign: 'center', padding: '10px 0 16px' }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: '50%', background: '#ecfdf5',
                      color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 12px'
                    }}>
                      <ShieldCheck size={28} />
                    </div>
                    <h4 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Password Reset Successfully</h4>
                    <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
                      The new credentials for <strong>{resetPwUser.full_name}</strong> are ready.
                    </p>
                  </div>

                  <div style={{
                    background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14,
                    padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ color: '#64748b' }}>Account Email:</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{resetPwUser.email}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
                      <span style={{ color: '#64748b' }}>New Password:</span>
                      <span style={{
                        fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 14,
                        color: '#7c3aed', background: '#ede9fe', padding: '3px 8px', borderRadius: 6
                      }}>
                        {resetPwSuccess}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ color: '#64748b' }}>Force Logout:</span>
                      <span style={{ color: '#16a34a', fontWeight: 600 }}>Active sessions revoked</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                      type="button"
                      className={styles.btnModalSubmit}
                      style={{ justifyContent: 'center', width: '100%', padding: '10px 16px' }}
                      onClick={handleCopyFullCreds}
                    >
                      {copiedFullCreds ? <Check size={16} /> : <Copy size={16} />}
                      {copiedFullCreds ? 'Copied to Clipboard!' : 'Copy Full Credentials'}
                    </button>
                    <button
                      type="button"
                      className={styles.btnModalCancel}
                      style={{ justifyContent: 'center', width: '100%' }}
                      onClick={() => { setResetPwUser(null); setResetPwSuccess(null); }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.modalBody}>
                    <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px' }}>
                      Set a custom password or generate a random one for <strong>{resetPwUser.full_name}</strong>. Existing sessions will be terminated.
                    </p>

                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label className={styles.formLabel} style={{ margin: 0 }}>New Password</label>
                        <button
                          type="button"
                          onClick={() => {
                            const generated = `Nx-${Math.random().toString(36).slice(2, 8)}${Math.floor(Math.random() * 89 + 10)}!A`;
                            setTempPassword(generated);
                          }}
                          style={{
                            background: 'none', border: 'none', color: '#7c3aed', fontSize: 12,
                            fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4
                          }}
                        >
                          <RefreshCw size={11} /> Generate Random
                        </button>
                      </div>

                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <input
                          type={showResetPwText ? 'text' : 'password'}
                          className={styles.formInput}
                          value={tempPassword || ''}
                          onChange={e => setTempPassword(e.target.value)}
                          placeholder="Enter new password (min. 6 characters)"
                          required
                          style={{
                            fontFamily: 'JetBrains Mono, monospace', fontSize: 13.5,
                            paddingRight: 40, letterSpacing: showResetPwText ? '0.04em' : 'normal'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetPwText(!showResetPwText)}
                          style={{
                            position: 'absolute', right: 10, background: 'none', border: 'none',
                            cursor: 'pointer', color: '#94a3b8', padding: 4, display: 'flex'
                          }}
                        >
                          {showResetPwText ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <p style={{ margin: '6px 0 0', fontSize: 11.5, color: '#94a3b8' }}>
                        Must be at least 6 characters. Leave as generated or type a custom one.
                      </p>
                    </div>

                    <div style={{
                      background: 'rgba(245,243,255,0.6)', border: '1px solid #ede9fe',
                      borderRadius: 10, padding: '10px 14px'
                    }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={mustChangePw}
                          onChange={e => setMustChangePw(e.target.checked)}
                          style={{ accentColor: '#7c3aed', width: 15, height: 15 }}
                        />
                        <span style={{ fontSize: 12.5, color: '#334155', fontWeight: 500 }}>
                          Require user to change password on first login
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className={styles.modalFooter}>
                    <button type="button" className={styles.btnModalCancel} onClick={() => setResetPwUser(null)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={styles.btnModalSubmit}
                      onClick={handleConfirmResetPassword}
                      disabled={saving || !tempPassword || tempPassword.trim().length < 6}
                    >
                      {saving ? 'Applying…' : 'Apply Password Reset'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── MODAL: Delete Confirmation ────────────────────────────────────── */}
        {deleteConfirmUser && (
          <div className={styles.modalOverlay} onClick={() => setDeleteConfirmUser(null)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle} style={{ color: '#dc2626' }}>Delete User Account</h3>
                <button className={styles.modalCloseBtn} onClick={() => setDeleteConfirmUser(null)}>
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <p style={{ fontSize: 13.5, color: '#475569', margin: 0 }}>
                  Are you sure you want to permanently delete <strong>{deleteConfirmUser.full_name}</strong>?
                </p>
                <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>
                  Warning: If this student has submitted experiments or graded sessions, they must be deactivated instead of deleted.
                </p>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnModalCancel} onClick={() => setDeleteConfirmUser(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  style={{ padding: '9px 18px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
                  onClick={handleDeleteUser}
                  disabled={saving}
                >
                  {saving ? 'Deleting…' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: Single User Created Credentials ──────────────────────── */}
        {createdCreds && (
          <div className={styles.modalOverlay} onClick={() => setCreatedCreds(null)}>
            <div className={styles.modal} style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, background: 'rgba(16, 185, 129, 0.12)',
                    color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <h3 className={styles.modalTitle}>Account Created!</h3>
                    <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
                      {createdCreds.user.full_name} ({createdCreds.user.role})
                    </p>
                  </div>
                </div>
                <button className={styles.modalCloseBtn} onClick={() => setCreatedCreds(null)}>
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
                  Share these login credentials with the user. They will be prompted to choose their own permanent password upon first login.
                </p>

                <div style={{
                  background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 14,
                  padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Login Email
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
                      {createdCreds.user.email}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Temporary / Initial Password
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: '#ffffff', border: '1.5px solid #ddd6fe', borderRadius: 10,
                      padding: '8px 12px', marginTop: 4
                    }}>
                      <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 700, color: '#7c3aed' }}>
                        {createdCreds.temp_password || '********'}
                      </span>
                      <button
                        type="button"
                        style={{
                          padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd6fe',
                          background: '#f5f3ff', color: '#7c3aed', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5
                        }}
                        onClick={() => {
                          if (createdCreds.temp_password) {
                            navigator.clipboard.writeText(createdCreds.temp_password);
                            setCopiedCreatedPw(true);
                            setTimeout(() => setCopiedCreatedPw(false), 2000);
                          }
                        }}
                      >
                        {copiedCreatedPw ? <Check size={13} /> : <Copy size={13} />}
                        {copiedCreatedPw ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                  padding: '10px 14px', fontSize: 12, color: '#92400e', lineHeight: 1.5
                }}>
                  🔒 <strong>How they log in:</strong> The user navigates to the login page (<code>/login</code>), signs in with this email and temporary password, and NexLab will automatically guide them to set their own private password.
                </div>
              </div>

              <div className={styles.modalFooter} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  style={{
                    padding: '9px 16px', borderRadius: 10, border: '1px solid #cbd5e1',
                    background: '#ffffff', color: '#334155', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}
                  onClick={() => {
                    const text = `NexLab Account Details\nRole: ${createdCreds.user.role}\nEmail: ${createdCreds.user.email}\nTemporary Password: ${createdCreds.temp_password}\nLogin Page: ${typeof window !== 'undefined' ? window.location.origin : ''}/login\n(Note: You will be required to change your password upon first login)`;
                    navigator.clipboard.writeText(text);
                    showToast('Full login credentials copied to clipboard!');
                  }}
                >
                  <Copy size={14} /> Copy Full Details
                </button>
                <button
                  type="button"
                  className={styles.btnModalSubmit}
                  onClick={() => setCreatedCreds(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MODAL: Bulk CSV Import Credentials ───────────────────────────── */}
        {bulkCredsResult && (
          <div className={styles.modalOverlay} onClick={() => setBulkCredsResult(null)}>
            <div className={styles.modal} style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, background: 'rgba(16, 185, 129, 0.12)',
                    color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <CheckCircle2 size={22} />
                  </div>
                  <div>
                    <h3 className={styles.modalTitle}>Bulk Import Completed!</h3>
                    <p style={{ margin: 0, fontSize: 12.5, color: '#64748b' }}>
                      {bulkCredsResult.created} user(s) created · {bulkCredsResult.skipped} skipped
                    </p>
                  </div>
                </div>
                <button className={styles.modalCloseBtn} onClick={() => setBulkCredsResult(null)}>
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>
                  A unique temporary password was automatically generated for each newly imported account. Download the credentials spreadsheet below to distribute them to students or faculty.
                </p>

                {bulkCredsResult.credentials && bulkCredsResult.credentials.length > 0 && (
                  <div style={{
                    maxHeight: 180, overflowY: 'auto', border: '1px solid #e2e8f0',
                    borderRadius: 10, background: '#f8fafc', padding: 8
                  }}>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px' }}>Email</th>
                          <th style={{ padding: '6px 8px' }}>Temp Password</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkCredsResult.credentials.slice(0, 50).map(c => (
                          <tr key={c.email} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '6px 8px', color: '#1e293b', fontWeight: 500 }}>{c.email}</td>
                            <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: '#7c3aed', fontWeight: 700 }}>
                              {c.temp_password}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {bulkCredsResult.credentials.length > 50 && (
                      <div style={{ textAlign: 'center', padding: 6, fontSize: 11, color: '#64748b' }}>
                        + {bulkCredsResult.credentials.length - 50} more in downloaded CSV
                      </div>
                    )}
                  </div>
                )}

                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
                  padding: '10px 14px', fontSize: 12, color: '#92400e', lineHeight: 1.5
                }}>
                  🔒 Users will sign in at <code>/login</code> and must change this temporary password on their first login.
                </div>
              </div>

              <div className={styles.modalFooter} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  style={{
                    padding: '9px 16px', borderRadius: 10, border: '1px solid #ddd6fe',
                    background: '#f5f3ff', color: '#7c3aed', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}
                  onClick={handleDownloadBulkCreds}
                >
                  <Download size={15} /> Download Credentials CSV
                </button>
                <button
                  type="button"
                  className={styles.btnModalSubmit}
                  onClick={() => setBulkCredsResult(null)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </InstitutionShell>
  );
}
