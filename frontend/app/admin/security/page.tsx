'use client';

import { useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import {
  Shield, Users, Key, ClipboardList, Eye,
  CheckCircle2, XCircle, AlertTriangle, Lock, Unlock
} from 'lucide-react';
import styles from './page.module.css';

const ROLES = [
  { role:'Super Admin',       users:1,  perms:['Full Access','System Config','User Management','Reports'], color:'#7c3aed' },
  { role:'Department Admin',  users:4,  perms:['Dept Users','Academic Setup','Dept Reports'],               color:'#ec4899' },
  { role:'Instructor',        users:89, perms:['Create Experiments','Schedule Sessions','Grade Students'],  color:'#f59e0b' },
  { role:'Student',           users:1247,perms:['Join Lab Sessions','Submit Code','View Grades'],           color:'#22c55e' },
];

const AUDIT_LOGS = [
  { time:'10:47 AM', user:'admin@hkbk.edu.in',     action:'Created Academic Year 2026-27',           type:'create',  ip:'192.168.1.10' },
  { time:'10:32 AM', user:'coord.cse@hkbk.edu.in', action:'Added 45 students via bulk CSV upload',   type:'create',  ip:'192.168.1.22' },
  { time:'10:15 AM', user:'admin@hkbk.edu.in',     action:'Assigned Prof. Suma Nair to CS301-A',     type:'update',  ip:'192.168.1.10' },
  { time:'09:58 AM', user:'STU089 (student)',       action:'Failed login attempt — wrong password',   type:'warning', ip:'192.168.2.41' },
  { time:'09:45 AM', user:'admin@hkbk.edu.in',     action:'Exported Student Performance Report (PDF)',type:'export',  ip:'192.168.1.10' },
  { time:'09:30 AM', user:'coord.ece@hkbk.edu.in', action:'Updated Section ECE-5A capacity to 50',   type:'update',  ip:'192.168.1.35' },
  { time:'09:15 AM', user:'admin@hkbk.edu.in',     action:'Deleted inactive user account STU002',    type:'delete',  ip:'192.168.1.10' },
  { time:'09:02 AM', user:'arun.k@hkbk.edu.in',    action:'Instructor login from new device',         type:'info',    ip:'192.168.3.77' },
];

const AUTH_SETTINGS = [
  { key:'JWT Token Expiry',          value:'24 hours',    editable:true  },
  { key:'Session Timeout',           value:'60 minutes',  editable:true  },
  { key:'Max Login Attempts',        value:'5',           editable:true  },
  { key:'Two-Factor Authentication', value:'Disabled',    editable:true  },
  { key:'Password Min Length',       value:'8 characters',editable:true  },
  { key:'Force Password Reset',      value:'90 days',     editable:true  },
];

export default function SecurityPage() {
  const [tab, setTab] = useState<'roles'|'audit'|'auth'>('roles');

  const auditIcon = (type: string) => {
    if (type === 'warning' || type === 'delete') return <AlertTriangle size={14} strokeWidth={2} color="#f59e0b" />;
    if (type === 'create') return <CheckCircle2 size={14} strokeWidth={2} color="#22c55e" />;
    if (type === 'export') return <Eye size={14} strokeWidth={2} color="#7c3aed" />;
    return <ClipboardList size={14} strokeWidth={2} color="#0ea5e9" />;
  };

  return (
    <AdminShell activePage="Security" title="Security & Access Control" subtitle="Role management, audit logs and authentication settings">

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className={styles.tabs}>
        {[
          { id:'roles', label:'Role Management', Icon: Users },
          { id:'audit', label:'Audit Logs',      Icon: ClipboardList },
          { id:'auth',  label:'Auth Settings',   Icon: Key },
        ].map(t => (
          <button
            key={t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id as typeof tab)}
          >
            <t.Icon size={14} strokeWidth={2} /> {t.label}
          </button>
        ))}
      </div>

      {/* ── Roles ─────────────────────────────────────────────────────── */}
      {tab === 'roles' && (
        <div className={styles.roleGrid}>
          {ROLES.map(r => (
            <div key={r.role} className={styles.roleCard}>
              <div className={styles.roleHeader}>
                <div className={styles.roleIcon} style={{ background: r.color + '22', color: r.color }}>
                  <Shield size={20} strokeWidth={1.9} />
                </div>
                <div>
                  <p className={styles.roleTitle}>{r.role}</p>
                  <p className={styles.roleCount}>{r.users.toLocaleString()} user{r.users !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className={styles.permsList}>
                {r.perms.map(p => (
                  <span key={p} className={styles.permTag}>
                    <CheckCircle2 size={11} strokeWidth={2} color={r.color} /> {p}
                  </span>
                ))}
              </div>
              <button className={styles.editRoleBtn}>Edit Permissions</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Audit Logs ────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr><th>Time</th><th>Type</th><th>User</th><th>Action</th><th>IP Address</th></tr>
            </thead>
            <tbody>
              {AUDIT_LOGS.map((log, i) => (
                <tr key={i}>
                  <td style={{ fontFamily:'JetBrains Mono,monospace', fontSize:12, color:'#9891a6' }}>{log.time}</td>
                  <td>{auditIcon(log.type)}</td>
                  <td><code className={styles.code}>{log.user}</code></td>
                  <td>{log.action}</td>
                  <td style={{ fontFamily:'JetBrains Mono,monospace', fontSize:12, color:'#9891a6' }}>{log.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={styles.tableFooter}>
            <span>Showing 8 of 2,847 audit entries</span>
            <button className={styles.exportBtn}>Export Logs (CSV)</button>
          </div>
        </div>
      )}

      {/* ── Auth Settings ─────────────────────────────────────────────── */}
      {tab === 'auth' && (
        <div className={styles.authWrap}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Setting</th><th>Current Value</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {AUTH_SETTINGS.map(s => (
                  <tr key={s.key}>
                    <td><strong style={{ color:'#201b2e' }}>{s.key}</strong></td>
                    <td><code className={styles.code}>{s.value}</code></td>
                    <td>
                      <button className={styles.editBtn}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.dangerZone}>
            <h3 className={styles.dangerTitle}>
              <AlertTriangle size={16} strokeWidth={2} color="#ef4444" /> Danger Zone
            </h3>
            <div className={styles.dangerActions}>
              <button className={styles.dangerBtn}>
                <Lock size={14} strokeWidth={2} /> Force All Sessions Logout
              </button>
              <button className={styles.dangerBtn}>
                <XCircle size={14} strokeWidth={2} /> Reset All Passwords
              </button>
              <button className={styles.dangerBtnSafe}>
                <Unlock size={14} strokeWidth={2} /> Unlock Locked Accounts
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
