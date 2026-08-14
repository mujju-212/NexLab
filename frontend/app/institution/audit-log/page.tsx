'use client';

import { useEffect, useState } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService, type AuditLog } from '@/services/institution.service';
import { ShieldCheck, Filter } from 'lucide-react';
import styles from '../dashboard/page.module.css';

const ACTION_COLORS: Record<string, string> = {
  force_logout: '#ef4444',
  create_user:  '#22c55e',
  toggle_active:'#f59e0b',
  default:      '#9333ea',
};

export default function AuditLogPage() {
  const [logs,    setLogs]    = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(30);
  const [action,  setAction]  = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await institutionService.getAuditLog({ days, action: action || undefined });
      setLogs(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [days, action]);

  const color = (a: string) => ACTION_COLORS[a] ?? ACTION_COLORS.default;

  return (
    <InstitutionShell activePage="Audit Log" title="Audit Log" subtitle="Full history of admin actions in your institution.">

      <div className={styles.toolbar}>
        <div style={{ display:'flex', alignItems:'center', gap:6, color:'#726a85', fontSize:13.5, fontWeight:600 }}>
          <Filter size={14} /> Filter:
        </div>
        <select className={styles.filterSelect} value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <select className={styles.filterSelect} value={action} onChange={e => setAction(e.target.value)}>
          <option value="">All Actions</option>
          <option value="force_logout">Force Logout</option>
          <option value="create_user">Create User</option>
          <option value="toggle_active">Toggle Active</option>
        </select>
      </div>

      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : logs.length === 0 ? (
        <div className={styles.emptyState}>
          <ShieldCheck size={32} strokeWidth={1.4} style={{ color:'#c4b5fd', marginBottom:8 }} />
          <p>No audit events found for selected filters.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {logs.map(log => (
            <div key={log.id} className={styles.auditRow}>
              <div className={styles.auditIcon} style={{ background:`${color(log.action)}15`, color:color(log.action) }}>
                <ShieldCheck size={15} />
              </div>
              <div style={{ flex:1 }}>
                <p className={styles.auditAction} style={{ color:color(log.action) }}>
                  {log.action.replace(/_/g,' ')}
                </p>
                <p className={styles.auditDetail}>{log.detail || `${log.target_type} · ${log.target_id}`}</p>
              </div>
              <span className={styles.auditTime}>
                {new Date(log.created_at).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </InstitutionShell>
  );
}
