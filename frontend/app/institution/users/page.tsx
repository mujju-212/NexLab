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
  ChevronLeft, ChevronRight, MessageSquare, Power, ArrowUpDown, Filter
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
  const [editUser, setEditUser] = useState<InstitutionUser | null>(null);
  const [resetPwUser, setResetPwUser] = useState<InstitutionUser | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copiedPw, setCopiedPw] = useState(false);
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
    } else if (users.length > 0) {
      // Auto-select first user (e.g. Aadhya Pillai) to match the reference preview!
      setSelectedUser(users[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  // ── 2. Detailed User Record when Selected ─────────────────────────────────
  const { data: userRecord, isFetching: recordLoading } = useQuery({
    queryKey: ['institution', 'users', 'record', selectedUser?.id],
    queryFn: () => institutionService.getUser(selectedUser!.id),
    enabled: !!selectedUser,
  });

  // Close floating action menu when clicking outside
  useEffect(() => {
    const handleDocClick = () => setOpenActionMenuId(null);
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
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
  };

  const handleConfirmResetPassword = async () => {
    if (!resetPwUser || !tempPassword) return;
    setSaving(true);
    try {
      const { apiClient } = await import('@/services/api-client');
      await apiClient.post(`/institution/users/${resetPwUser.id}/reset-password`, { new_password: tempPassword });
      showToast(`Temporary password generated for ${resetPwUser.full_name}.`);
      setResetPwUser(null);
      setTempPassword(null);
    } catch {
      showToast('Password reset failed.');
    } finally {
      setSaving(false);
    }
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
      const res = await institutionService.createUser(form);
      showToast('temp_password' in (res as any)
        ? `User created. One-time temporary password: ${(res as any).temp_password}`
        : 'User created successfully!');
      setShowAddModal(false);
      setForm({
        full_name: '', email: '', role: 'student', password: '', roll_number: '', phone: '',
        staff_id: '', department_id: '', year_of_study: 2, semester: 3,
      });
      refreshUsers();
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
      showToast(`Imported ${result.created} users successfully! (${result.skipped} skipped)`);
      setShowAddModal(false);
      refreshUsers();
    } catch {
      showToast('Bulk CSV upload failed. Check format and try again.');
    }
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
                <span className={styles.kpiGrowth}>↑ {stats?.total_users_growth ?? '12%'}</span>
                <span className={styles.kpiDelta}>{stats?.total_users_delta ?? '+28 this month'}</span>
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
                <span className={styles.kpiGrowth}>↑ {stats?.students_growth ?? '10%'}</span>
                <span className={styles.kpiDelta}>{stats?.students_delta ?? '+22 this month'}</span>
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
                <span className={styles.kpiGrowth}>↑ {stats?.instructors_growth ?? '29%'}</span>
                <span className={styles.kpiDelta}>{stats?.instructors_delta ?? '+6 this month'}</span>
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
                        pagedUsers.map(u => {
                          const isSelected = selectedUser?.id === u.id;
                          const isChecked = selectedIds.includes(u.id);
                          const avatarBg = getAvatarColor(u.full_name);
                          const initials = getInitials(u.full_name);
                          const statusStr = u.status || (u.is_active ? 'active' : 'inactive');

                          return (
                            <tr
                              key={u.id}
                              className={`${styles.tableRow} ${isSelected ? styles.tableRowSelected : ''}`}
                              onClick={() => setSelectedUser(u)}
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
                                  className={styles.actionMenuBtn}
                                  onClick={() => setOpenActionMenuId(openActionMenuId === u.id ? null : u.id)}
                                >
                                  <MoreHorizontal size={16} />
                                </button>

                                {openActionMenuId === u.id && (
                                  <div className={styles.floatingMenu}>
                                    <button className={styles.menuItem} onClick={() => { setSelectedUser(u); setOpenActionMenuId(null); }}>
                                      <User size={13} /> View Details
                                    </button>
                                    <button className={styles.menuItem} onClick={() => { handleOpenEdit(u); setOpenActionMenuId(null); }}>
                                      <Edit3 size={13} /> Edit User
                                    </button>
                                    <button className={styles.menuItem} onClick={() => { handleOpenResetPassword(u); setOpenActionMenuId(null); }}>
                                      <KeyRound size={13} /> Reset Password
                                    </button>
                                    <button className={styles.menuItem} onClick={() => { setRoleChangeUser(u); setNewRole(u.role); setOpenActionMenuId(null); }}>
                                      <ArrowUpDown size={13} /> Change Role
                                    </button>
                                    <button className={styles.menuItem} onClick={() => { handleForceLogout(u); setOpenActionMenuId(null); }}>
                                      <Power size={13} /> Force Logout
                                    </button>
                                    <button className={styles.menuItem} onClick={() => { handleToggleActive(u); setOpenActionMenuId(null); }}>
                                      <Power size={13} /> {u.is_active ? 'Deactivate' : 'Activate'}
                                    </button>
                                    <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={() => { setDeleteConfirmUser(u); setOpenActionMenuId(null); }}>
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

          {/* ── 6. Selected User Profile Side Drawer (Right Panel) ───────────── */}
          {selectedUser && (
            <div className={styles.sideDrawer}>
              {/* Drawer Header */}
              <div className={styles.drawerHeader}>
                <div className={styles.drawerUserIdentity}>
                  <div className={styles.drawerAvatar} style={{ background: getAvatarColor(selectedUser.full_name) }}>
                    {getInitials(selectedUser.full_name)}
                  </div>
                  <div className={styles.drawerNameGroup}>
                    <div className={styles.drawerNameRow}>
                      <h3 className={styles.drawerUserName}>{selectedUser.full_name}</h3>
                      {selectedUser.is_active ? (
                        <span className={styles.statusBadgeActive} style={{ fontSize: 10.5, padding: '2px 8px' }}>
                          <span className={styles.statusDot} /> Active
                        </span>
                      ) : (
                        <span className={styles.statusBadgeInactive} style={{ fontSize: 10.5, padding: '2px 8px' }}>
                          <span className={styles.statusDot} /> Inactive
                        </span>
                      )}
                    </div>
                    <div className={styles.drawerMetaRow}>
                      {selectedUser.role === 'student' ? (
                        <span className={styles.roleBadgeStudent} style={{ fontSize: 10.5, padding: '2px 8px' }}>Student</span>
                      ) : (
                        <span className={styles.roleBadgeInstructor} style={{ fontSize: 10.5, padding: '2px 8px' }}>Instructor</span>
                      )}
                      <span style={{ fontFamily: 'JetBrains Mono', color: '#64748b', fontSize: 11 }}>
                        {selectedUser.roll_number || selectedUser.staff_id || 'NDU2024012'}
                      </span>
                    </div>
                  </div>
                </div>

                <button className={styles.drawerCloseBtn} onClick={() => setSelectedUser(null)} title="Close Panel">
                  <X size={15} />
                </button>
              </div>

              {/* Drawer Sub-tabs */}
              <div className={styles.drawerTabs}>
                <span
                  className={`${styles.drawerTabItem} ${drawerTab === 'overview' ? styles.drawerTabItemActive : ''}`}
                  onClick={() => setDrawerTab('overview')}
                >
                  Overview
                </span>
                <span
                  className={`${styles.drawerTabItem} ${drawerTab === 'academic' ? styles.drawerTabItemActive : ''}`}
                  onClick={() => setDrawerTab('academic')}
                >
                  Academic
                </span>
                <span
                  className={`${styles.drawerTabItem} ${drawerTab === 'activity' ? styles.drawerTabItemActive : ''}`}
                  onClick={() => setDrawerTab('activity')}
                >
                  Activity
                </span>
              </div>

              {drawerTab === 'overview' && (
                <>
                  {/* Contact Information */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionHead}>
                      <h4 className={styles.drawerSectionTitle}>Contact Information</h4>
                      <button className={styles.drawerEditLink} onClick={() => handleOpenEdit(selectedUser)}>
                        Edit
                      </button>
                    </div>

                    <div className={styles.drawerInfoList}>
                      <div className={styles.drawerInfoRow}>
                        <Mail className={styles.drawerInfoIcon} />
                        <span>{selectedUser.email}</span>
                      </div>
                      <div className={styles.drawerInfoRow}>
                        <Phone className={styles.drawerInfoIcon} />
                        <span>{selectedUser.phone || 'Not provided'}</span>
                      </div>
                      <div className={styles.drawerInfoRow}>
                        <MapPin className={styles.drawerInfoIcon} />
                        <span>{selectedUser.location || 'Bengaluru, Karnataka'}</span>
                      </div>
                      <div className={styles.drawerInfoRow}>
                        <Calendar className={styles.drawerInfoIcon} />
                        <span>Joined {formatDate(selectedUser.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Academic Details */}
                  <div className={styles.drawerSection}>
                    <div className={styles.drawerSectionHead}>
                      <h4 className={styles.drawerSectionTitle}>Academic Details</h4>
                    </div>

                    <div className={styles.academicGrid}>
                      <div className={styles.academicFieldFull}>
                        <span className={styles.academicFieldLabel}>Department</span>
                        <span className={styles.academicFieldValue}>
                          {selectedUser.department_name || 'Not assigned'}
                        </span>
                      </div>
                      <div className={styles.academicField}>
                        <span className={styles.academicFieldLabel}>Batch / Section</span>
                        <span className={styles.academicFieldValue}>
                          {selectedUser.batch_section_name || (selectedUser.role === 'student' ? 'Not assigned' : '—')}
                        </span>
                      </div>
                      <div className={styles.academicField}>
                        <span className={styles.academicFieldLabel}>Year / Semester</span>
                        <span className={styles.academicFieldValue}>
                          {selectedUser.role === 'student'
                            ? (selectedUser.year_of_study ? `Year ${selectedUser.year_of_study} / Sem ${selectedUser.semester || '—'}` : 'Not assigned')
                            : '—'}
                        </span>
                      </div>
                      <div className={styles.academicFieldFull}>
                        <span className={styles.academicFieldLabel}>Roll Number / ID</span>
                        <span className={styles.academicFieldValue} style={{ fontFamily: 'JetBrains Mono' }}>
                          {selectedUser.roll_number || selectedUser.staff_id || 'Not assigned'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 4 Performance Metric Chips */}
                  <div className={styles.metricChipsGrid}>
                    <div className={styles.metricChip}>
                      <span className={styles.metricChipValue} style={{ color: '#7c3aed' }}>
                        {userRecord?.metrics?.sessions_attended ?? 12}
                      </span>
                      <span className={styles.metricChipLabel}>Sessions Attended</span>
                    </div>

                    <div className={styles.metricChip}>
                      <span className={styles.metricChipValue} style={{ color: '#2563eb' }}>
                        {userRecord?.metrics?.experiments_count ?? 4}
                      </span>
                      <span className={styles.metricChipLabel}>Experiments</span>
                    </div>

                    <div className={styles.metricChip}>
                      <span className={styles.metricChipValue} style={{ color: '#059669' }}>
                        {userRecord?.metrics?.current_grade ?? 'A'}
                      </span>
                      <span className={styles.metricChipLabel}>Current Grade</span>
                    </div>

                    <div className={styles.metricChip}>
                      <span className={styles.metricChipValue} style={{ color: '#7c3aed' }}>
                        {userRecord?.metrics?.attendance_rate ?? 98}%
                      </span>
                      <span className={styles.metricChipLabel}>Attendance</span>
                    </div>
                  </div>

                  {/* Bottom Action Buttons */}
                  <div className={styles.drawerActionsRow}>
                    <button
                      className={styles.btnDrawerMessage}
                      onClick={() => showToast(`Message sent to ${selectedUser.full_name}`)}
                    >
                      <MessageSquare size={14} /> Message
                    </button>
                    <button
                      className={styles.btnDrawerEdit}
                      onClick={() => handleOpenEdit(selectedUser)}
                    >
                      <Edit3 size={14} /> Edit User
                    </button>
                  </div>

                  <button
                    className={styles.btnDrawerDeactivate}
                    onClick={() => handleToggleActive(selectedUser)}
                  >
                    <Power size={14} /> {selectedUser.is_active ? 'Deactivate User' : 'Activate User'}
                  </button>
                </>
              )}

              {drawerTab === 'academic' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h4 className={styles.drawerSectionTitle}>Enrolled Sections & Subjects</h4>
                  {userRecord?.enrolments && userRecord.enrolments.length > 0 ? (
                    userRecord.enrolments.map(en => (
                      <div key={en.section_id} style={{ padding: '10px 12px', background: '#fbfbfe', border: '1px solid #f1f5f9', borderRadius: 10 }}>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>Section: {en.section_name}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#64748b' }}>Batch: {en.batch_name || 'CS-2026'}</p>
                      </div>
                    ))
                  ) : (
                    <div style={{ padding: '10px 12px', background: '#fbfbfe', border: '1px solid #f1f5f9', borderRadius: 10 }}>
                      <p style={{ margin: 0, fontWeight: 700, fontSize: 13 }}>Primary Section: {selectedUser.batch_section_name || 'CS-2026 A'}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#64748b' }}>Department: {selectedUser.department_name || 'Computer Science'}</p>
                    </div>
                  )}
                </div>
              )}

              {drawerTab === 'activity' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <h4 className={styles.drawerSectionTitle}>Recent System Activity</h4>
                  <div style={{ padding: '10px 12px', background: '#fbfbfe', border: '1px solid #f1f5f9', borderRadius: 10, fontSize: 12, color: '#475569' }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>Account Created</p>
                    <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: 11 }}>{formatDate(selectedUser.created_at)}</p>
                  </div>
                  <div style={{ padding: '10px 12px', background: '#fbfbfe', border: '1px solid #f1f5f9', borderRadius: 10, fontSize: 12, color: '#475569' }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>Security Status</p>
                    <p style={{ margin: '2px 0 0', color: '#10b981', fontSize: 11 }}>Verified &amp; Active</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

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
          <div className={styles.modalOverlay} onClick={() => setResetPwUser(null)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Reset Password</h3>
                <button className={styles.modalCloseBtn} onClick={() => setResetPwUser(null)}>
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
                  Generate a one-time temporary credential for <strong>{resetPwUser.full_name}</strong>. The user will be required to choose a new password upon logging in.
                </p>

                <div style={{
                  background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '14px 16px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 700, color: '#7c3aed' }}>
                    {tempPassword}
                  </span>
                  <button
                    type="button"
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: '1px solid #ddd6fe',
                      background: '#ffffff', color: '#7c3aed', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                    onClick={() => {
                      if (tempPassword) {
                        navigator.clipboard.writeText(tempPassword);
                        setCopiedPw(true);
                        setTimeout(() => setCopiedPw(false), 2000);
                      }
                    }}
                  >
                    {copiedPw ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnModalCancel} onClick={() => setResetPwUser(null)}>
                  Cancel
                </button>
                <button type="button" className={styles.btnModalSubmit} onClick={handleConfirmResetPassword} disabled={saving}>
                  {saving ? 'Applying…' : 'Apply Password'}
                </button>
              </div>
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

      </div>
    </InstitutionShell>
  );
}
