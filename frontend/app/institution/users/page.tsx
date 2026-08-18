'use client';

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService, type InstitutionUser, type CreateUserDto, type Department } from '@/services/institution.service';
import {
  Plus, Upload, Download, Search, ToggleLeft, ToggleRight, LogOut, X, Eye, Trash2, Edit3,
  Mail, Phone, Shield, Calendar, MoreHorizontal, KeyRound, Ban, CheckCircle, User, AlertTriangle, Repeat,
  GraduationCap, Building2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import styles from '../dashboard/page.module.css';

const PAGE_SIZE = 25;

export default function UsersPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [users, setUsers]           = useState<InstitutionUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState(searchParams.get('search') ?? '');
  const [page, setPage]             = useState(1);
  const [roleFilter, setRoleFilter] = useState(searchParams.get('role') ?? 'all');
  const [showModal, setShowModal]   = useState(searchParams.get('create') === 'student' || searchParams.get('create') === 'instructor');
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState<string | null>(null);
  const [viewUser, setViewUser]     = useState<InstitutionUser | null>(null);
  const [editUser, setEditUser]     = useState<InstitutionUser | null>(null);
  const [actionMenu, setActionMenu] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ user: InstitutionUser; action: string } | null>(null);
  const [roleChangeUser, setRoleChangeUser] = useState<InstitutionUser | null>(null);
  const [newRole, setNewRole] = useState<'student' | 'instructor' | 'institution_admin'>('student');
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<CreateUserDto>({
    full_name: '', email: '', role: searchParams.get('create') === 'instructor' ? 'instructor' : 'student',
    password: 'Welcome@123', roll_number: '', phone: '', staff_id: '', department_id: '',
    year_of_study: undefined, semester: undefined,
  });

  const [editForm, setEditForm] = useState({
    full_name: '', phone: '', roll_number: '', staff_id: '', department_id: '',
    year_of_study: undefined as number | undefined, semester: undefined as number | undefined,
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await institutionService.listUsers(roleFilter === 'all' ? undefined : { role: roleFilter });
      setUsers(data);
    } catch {
      setUsers([]);
      showToast('Could not load users. Please retry.');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [roleFilter]);
  useEffect(() => { setPage(1); }, [search, roleFilter]);
  useEffect(() => { institutionService.listDepartments().then(setDepartments).catch(() => {}); }, []);

  const deptName = (id?: string | null) => departments.find(d => d.id === id)?.name ?? '—';

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await institutionService.createUser(form);
      showToast('User created successfully!');
      setShowModal(false);
      setForm({
        full_name: '', email: '', role: 'student', password: 'Welcome@123', roll_number: '', phone: '',
        staff_id: '', department_id: '', year_of_study: undefined, semester: undefined,
      });
      load();
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Failed to create user.');
    } finally { setSaving(false); }
  };

  const changeRole = async () => {
    if (!roleChangeUser) return;
    try {
      const updated = await institutionService.changeUserRole(roleChangeUser.id, newRole);
      setUsers(prev => prev.map(x => x.id === updated.id ? updated : x));
      showToast(`${roleChangeUser.full_name}'s role changed to ${newRole}.`);
      setRoleChangeUser(null);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Role change failed.');
    }
  };

  const toggleActive = async (u: InstitutionUser) => {
    try {
      await institutionService.toggleUserActive(u.id);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !x.is_active } : x));
      showToast(`${u.full_name} ${u.is_active ? 'deactivated' : 'activated'}.`);
    } catch { showToast('Action failed.'); }
  };

  const forceLogout = async (u: InstitutionUser) => {
    try {
      await institutionService.forceLogoutUser(u.id);
      showToast(`${u.full_name} has been logged out.`);
    } catch { showToast('Force logout failed.'); }
  };

  const resetPassword = async (u: InstitutionUser) => {
    try {
      const { apiClient } = await import('@/services/api-client');
      await apiClient.post(`/institution/users/${u.id}/reset-password`);
      showToast(`Password reset for ${u.full_name}. Temp password: Welcome@123`);
    } catch { showToast('Password reset failed.'); }
  };

  const deleteUser = async (u: InstitutionUser) => {
    try {
      await institutionService.deleteUser(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      showToast(`${u.full_name} deleted.`);
      setConfirmAction(null);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Delete failed — users with submission/grade history must be deactivated instead.');
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setSaving(true);
    try {
      const updated = await institutionService.updateUser(editUser.id, editForm);
      setUsers(prev => prev.map(x => x.id === editUser.id ? updated : x));
      showToast('User updated!');
      setEditUser(null);
    } catch (err: any) {
      showToast(err?.response?.data?.error ?? 'Update failed.');
    } finally { setSaving(false); }
  };

  const bulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await institutionService.bulkUploadUsers(file);
      showToast(`Created ${result.created} users. Skipped ${result.skipped}.`);
      load();
    } catch { showToast('Bulk upload failed.'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.roll_number ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage  = Math.min(page, pageCount);
  const paged     = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const exportCsv = () => {
    if (filtered.length === 0) { showToast('Nothing to export.'); return; }
    const esc = (v: any) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ['Name', 'Email', 'Role', 'Roll Number', 'Staff ID', 'Department', 'Status', 'Joined'];
    const rows = filtered.map(u => [
      u.full_name, u.email, u.role, u.roll_number ?? '', u.staff_id ?? '',
      deptName(u.department_id), u.is_active ? 'Active' : 'Inactive',
      new Date(u.created_at).toLocaleDateString('en-IN'),
    ].map(esc).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Exported ${filtered.length} user${filtered.length === 1 ? '' : 's'}.`);
  };

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const roleCounts = {
    all: users.length,
    student: users.filter(u => u.role === 'student').length,
    instructor: users.filter(u => u.role === 'instructor').length,
  };

  return (
    <InstitutionShell activePage="Users" title="User Management" subtitle="Manage students and instructors in your institution.">

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 300, background: '#201b2e', color: '#fff', padding: '12px 20px', borderRadius: 12, fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={14} /> {toast}
        </div>
      )}

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Users', count: roleCounts.all, color: '#9333ea', bg: '#faf5ff' },
          { label: 'Students', count: roleCounts.student, color: '#10b981', bg: '#ecfdf5' },
          { label: 'Instructors', count: roleCounts.instructor, color: '#f59e0b', bg: '#fffbeb' },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', background: 'rgba(255,255,255,0.7)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.9)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color }}>
              <User size={15} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#201b2e' }}>{loading ? '—' : s.count}</p>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#9891a6', textTransform: 'uppercase', letterSpacing: '.03em' }}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9891a6' }} />
          <input className={styles.searchInput} style={{ paddingLeft: 36 }} placeholder="Search by name, email, roll no…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className={styles.filterSelect} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="all">All Roles ({roleCounts.all})</option>
          <option value="student">Students ({roleCounts.student})</option>
          <option value="instructor">Instructors ({roleCounts.instructor})</option>
        </select>
        <button className={styles.btnSecondary} onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Bulk Upload
        </button>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={bulkUpload} />
        <button className={styles.btnSecondary} onClick={exportCsv} title="Export current list to CSV">
          <Download size={14} /> Export
        </button>
        <button className={styles.btnPrimary} onClick={() => setShowModal(true)}>
          <Plus size={14} /> Add User
        </button>
      </div>

      {/* Table */}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>User</th><th>Roll No.</th><th>Role</th><th>Status</th><th>Joined</th><th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9891a6', padding: 32 }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9891a6', padding: 32 }}>No users found.</td></tr>
            ) : paged.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: u.role === 'student' ? 'linear-gradient(135deg,#9333ea,#7c3aed)' : 'linear-gradient(135deg,#10b981,#059669)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 12, fontWeight: 700,
                    }}>
                      {initials(u.full_name)}
                    </div>
                    <div>
                      <button onClick={() => setViewUser(u)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, color: '#201b2e', fontSize: 14, padding: 0, textAlign: 'left' }}>
                        {u.full_name}
                      </button>
                      <div style={{ fontSize: 12, color: '#9891a6' }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ color: '#726a85', fontSize: 13 }}>{u.roll_number ?? '—'}</td>
                <td>
                  <span className={`${styles.badgeRole} ${u.role === 'student' ? styles.badgeStudent : styles.badgeInstructor}`}>
                    {u.role}
                  </span>
                </td>
                <td>
                  <span className={u.is_active ? styles.badgeActive : styles.badgeInactive}>
                    {u.is_active ? '● Active' : '○ Inactive'}
                  </span>
                </td>
                <td style={{ color: '#9891a6', fontSize: 12 }}>
                  {new Date(u.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end', position: 'relative' }}>
                    <button className={styles.btnSecondary} style={{ padding: '5px 8px', fontSize: 12 }}
                      onClick={() => setViewUser(u)} title="View Profile">
                      <Eye size={13} />
                    </button>
                    <button className={styles.btnSecondary} style={{ padding: '5px 8px', fontSize: 12 }}
                      onClick={() => { setEditUser(u); setEditForm({
                        full_name: u.full_name, phone: u.phone ?? '', roll_number: u.roll_number ?? '',
                        staff_id: u.staff_id ?? '', department_id: u.department_id ?? '',
                        year_of_study: u.year_of_study ?? undefined, semester: u.semester ?? undefined,
                      }); }}
                      title="Edit">
                      <Edit3 size={13} />
                    </button>
                    <button className={styles.btnSecondary} style={{ padding: '5px 8px', fontSize: 12 }}
                      onClick={() => setActionMenu(actionMenu === u.id ? null : u.id)} title="More Actions">
                      <MoreHorizontal size={13} />
                    </button>
                    {/* Action dropdown */}
                    {actionMenu === u.id && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
                        background: '#fff', borderRadius: 12, boxShadow: '0 8px 28px rgba(0,0,0,0.12)', border: '1px solid #f1f5f9',
                        minWidth: 180, overflow: 'hidden',
                      }}>
                        <button onClick={() => { toggleActive(u); setActionMenu(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#201b2e' }}>
                          {u.is_active ? <ToggleLeft size={14} style={{ color: '#f59e0b' }} /> : <ToggleRight size={14} style={{ color: '#22c55e' }} />}
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => { resetPassword(u); setActionMenu(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#201b2e' }}>
                          <KeyRound size={14} style={{ color: '#9333ea' }} /> Reset Password
                        </button>
                        <button onClick={() => { forceLogout(u); setActionMenu(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#201b2e' }}>
                          <LogOut size={14} style={{ color: '#726a85' }} /> Force Logout
                        </button>
                        <button onClick={() => { setRoleChangeUser(u); setNewRole(u.role === 'student' ? 'instructor' : 'student'); setActionMenu(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#201b2e' }}>
                          <Repeat size={14} style={{ color: '#7c3aed' }} /> Change Role
                        </button>
                        <div style={{ height: 1, background: '#f1f5f9' }} />
                        <button onClick={() => { setConfirmAction({ user: u, action: 'delete' }); setActionMenu(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#ef4444' }}>
                          <Trash2 size={14} /> Delete User
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && filtered.length > PAGE_SIZE && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <span style={{ fontSize: 12.5, color: '#9891a6', fontWeight: 600 }}>
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className={styles.btnSecondary} style={{ padding: '6px 10px', opacity: safePage <= 1 ? 0.5 : 1 }}
              disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
              <ChevronLeft size={14} /> Prev
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#726a85', padding: '0 6px' }}>
              Page {safePage} / {pageCount}
            </span>
            <button className={styles.btnSecondary} style={{ padding: '6px 10px', opacity: safePage >= pageCount ? 0.5 : 1 }}
              disabled={safePage >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ VIEW USER DRAWER ═══ */}
      {viewUser && (
        <div className={styles.modalOverlay} onClick={() => setViewUser(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'fixed', right: 0, top: 0, bottom: 0, width: 420, background: '#fff',
            boxShadow: '-8px 0 32px rgba(0,0,0,0.1)', overflow: 'auto', padding: 32,
            animation: 'slideInRight .25s cubic-bezier(.16,1,.3,1)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#201b2e', fontFamily: "'Space Grotesk', sans-serif" }}>User Profile</h2>
              <button onClick={() => setViewUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9891a6' }}><X size={20} /></button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: viewUser.role === 'student' ? 'linear-gradient(135deg,#9333ea,#7c3aed)' : 'linear-gradient(135deg,#10b981,#059669)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 22, fontWeight: 700, flexShrink: 0,
              }}>
                {initials(viewUser.full_name)}
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#201b2e' }}>{viewUser.full_name}</p>
                <span className={`${styles.badgeRole} ${viewUser.role === 'student' ? styles.badgeStudent : styles.badgeInstructor}`}>{viewUser.role}</span>
              </div>
            </div>

            {/* Detail rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {[
                { Icon: Mail, label: 'Email', value: viewUser.email },
                { Icon: Phone, label: 'Phone', value: viewUser.phone || '—' },
                ...(viewUser.role === 'student' ? [
                  { Icon: Shield, label: 'Roll Number', value: viewUser.roll_number || '—' },
                  { Icon: GraduationCap, label: 'Year / Semester', value: `${viewUser.year_of_study ? `Year ${viewUser.year_of_study}` : '—'} / ${viewUser.semester ? `Sem ${viewUser.semester}` : '—'}` },
                ] : [
                  { Icon: Shield, label: 'Staff ID', value: viewUser.staff_id || '—' },
                ]),
                { Icon: Building2, label: 'Department', value: deptName(viewUser.department_id) },
                { Icon: Calendar, label: 'Joined', value: new Date(viewUser.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) },
                { Icon: CheckCircle, label: 'Status', value: viewUser.is_active ? 'Active' : 'Inactive' },
              ].map(({ Icon, label, value }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <Icon size={16} style={{ color: '#9333ea', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#9891a6', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 600, color: '#201b2e' }}>{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 28 }}>
              <button className={styles.btnPrimary} style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { setEditUser(viewUser); setEditForm({
                  full_name: viewUser.full_name, phone: viewUser.phone ?? '', roll_number: viewUser.roll_number ?? '',
                  staff_id: viewUser.staff_id ?? '', department_id: viewUser.department_id ?? '',
                  year_of_study: viewUser.year_of_study ?? undefined, semester: viewUser.semester ?? undefined,
                }); setViewUser(null); }}>
                <Edit3 size={14} /> Edit Profile
              </button>
              <button className={styles.btnSecondary} style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { toggleActive(viewUser); setViewUser(null); }}>
                {viewUser.is_active ? <Ban size={14} /> : <CheckCircle size={14} />}
                {viewUser.is_active ? 'Deactivate User' : 'Activate User'}
              </button>
              <button className={styles.btnSecondary} style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { resetPassword(viewUser); }}>
                <KeyRound size={14} /> Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ EDIT USER MODAL ═══ */}
      {editUser && (
        <div className={styles.modalOverlay} onClick={() => setEditUser(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className={styles.modalTitle}>Edit User — {editUser.full_name}</h2>
              <button onClick={() => setEditUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9891a6' }}><X size={20} /></button>
            </div>
            <form onSubmit={saveEdit}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Full Name</label>
                <input className={styles.input} required value={editForm.full_name}
                  onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Email</label>
                <input className={styles.input} type="email" disabled value={editUser.email}
                  style={{ opacity: 0.6, cursor: 'not-allowed' }} title="Email cannot be changed here" />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Phone</label>
                <input className={styles.input} placeholder="+91 98765 43210" value={editForm.phone}
                  onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Department</label>
                <select className={styles.select} value={editForm.department_id}
                  onChange={e => setEditForm(f => ({ ...f, department_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              {editUser.role === 'student' && (
                <>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Roll Number</label>
                    <input className={styles.input} value={editForm.roll_number}
                      onChange={e => setEditForm(f => ({ ...f, roll_number: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className={styles.field} style={{ flex: 1 }}>
                      <label className={styles.fieldLabel}>Year of Study</label>
                      <input className={styles.input} type="number" min={1} max={6} placeholder="e.g. 2"
                        value={editForm.year_of_study ?? ''}
                        onChange={e => setEditForm(f => ({ ...f, year_of_study: e.target.value ? Number(e.target.value) : undefined }))} />
                    </div>
                    <div className={styles.field} style={{ flex: 1 }}>
                      <label className={styles.fieldLabel}>Semester</label>
                      <input className={styles.input} type="number" min={1} max={12} placeholder="e.g. 3"
                        value={editForm.semester ?? ''}
                        onChange={e => setEditForm(f => ({ ...f, semester: e.target.value ? Number(e.target.value) : undefined }))} />
                    </div>
                  </div>
                </>
              )}
              {(editUser.role === 'instructor' || editUser.role === 'institution_admin') && (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Staff ID</label>
                  <input className={styles.input} value={editForm.staff_id}
                    onChange={e => setEditForm(f => ({ ...f, staff_id: e.target.value }))} />
                </div>
              )}
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={() => setEditUser(null)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ CONFIRM DELETE DIALOG ═══ */}
      {confirmAction && (
        <div className={styles.modalOverlay} onClick={() => setConfirmAction(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fef2f2', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={22} style={{ color: '#ef4444' }} />
            </div>
            <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#201b2e' }}>Delete {confirmAction.user.full_name}?</h3>
            <p style={{ margin: '0 0 24px', fontSize: 13, color: '#726a85' }}>
              This action cannot be undone. All associated data will be permanently removed.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className={styles.btnSecondary} onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className={styles.btnDanger} onClick={() => deleteUser(confirmAction.user)} style={{
                background: '#ef4444', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 10,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ CREATE USER MODAL ═══ */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className={styles.modalTitle}>Add New User</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9891a6' }}><X size={20} /></button>
            </div>
            <form onSubmit={createUser}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Role</label>
                <select className={styles.select} value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))}>
                  <option value="student">Student</option>
                  <option value="instructor">Instructor</option>
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Full Name *</label>
                <input className={styles.input} required placeholder="Full name"
                  value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Email *</label>
                <input className={styles.input} type="email" required placeholder="email@example.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Department</label>
                <select className={styles.select} value={form.department_id}
                  onChange={e => setForm(f => ({ ...f, department_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              {form.role === 'student' ? (
                <>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Roll Number / USN</label>
                    <input className={styles.input} placeholder="e.g. CS2022001"
                      value={form.roll_number} onChange={e => setForm(f => ({ ...f, roll_number: e.target.value }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div className={styles.field} style={{ flex: 1 }}>
                      <label className={styles.fieldLabel}>Year of Study</label>
                      <input className={styles.input} type="number" min={1} max={6} placeholder="e.g. 2"
                        value={form.year_of_study ?? ''}
                        onChange={e => setForm(f => ({ ...f, year_of_study: e.target.value ? Number(e.target.value) : undefined }))} />
                    </div>
                    <div className={styles.field} style={{ flex: 1 }}>
                      <label className={styles.fieldLabel}>Semester</label>
                      <input className={styles.input} type="number" min={1} max={12} placeholder="e.g. 3"
                        value={form.semester ?? ''}
                        onChange={e => setForm(f => ({ ...f, semester: e.target.value ? Number(e.target.value) : undefined }))} />
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>Staff / Employee ID</label>
                  <input className={styles.input} placeholder="e.g. EMP1042"
                    value={form.staff_id} onChange={e => setForm(f => ({ ...f, staff_id: e.target.value }))} />
                </div>
              )}
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Phone</label>
                <input className={styles.input} placeholder="+91 98765 43210"
                  value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel}>Temp Password</label>
                <input className={styles.input} value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.btnSecondary} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className={styles.btnPrimary} disabled={saving}>
                  {saving ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ CHANGE ROLE MODAL ═══ */}
      {roleChangeUser && (
        <div className={styles.modalOverlay} onClick={() => setRoleChangeUser(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className={styles.modalTitle}>Change Role — {roleChangeUser.full_name}</h2>
              <button onClick={() => setRoleChangeUser(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9891a6' }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: 13, color: '#726a85', margin: '0 0 16px' }}>
              Current role: <strong style={{ color: '#201b2e' }}>{roleChangeUser.role}</strong>
            </p>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>New Role</label>
              <select className={styles.select} value={newRole} onChange={e => setNewRole(e.target.value as any)}>
                <option value="student">Student</option>
                <option value="instructor">Instructor</option>
                <option value="institution_admin">Institution Admin</option>
              </select>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnSecondary} onClick={() => setRoleChangeUser(null)}>Cancel</button>
              <button type="button" className={styles.btnPrimary} onClick={changeRole}>Confirm Change</button>
            </div>
          </div>
        </div>
      )}
    </InstitutionShell>
  );
}
