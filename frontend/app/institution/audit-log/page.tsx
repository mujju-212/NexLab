'use client';

import { useEffect, useState } from 'react';
import InstitutionShell from '@/components/layout/InstitutionShell';
import { institutionService, type AuditLog } from '@/services/institution.service';
import { ShieldCheck, Filter, Download } from 'lucide-react';
import styles from '../dashboard/page.module.css';

const ACTION_COLORS: Record<string, string> = {
  force_logout: '#ef4444',
  create_user:  '#22c55e',
  toggle_active:'#f59e0b',
  default:      '#9333ea',
};

export default function AuditLogPage() {
  const [logs,    setLogs]    = useState<AuditLog[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [days,    setDays]    = useState(30);
  const [action,  setAction]  = useState('');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [exporting, setExporting] = useState(false);
  // True once the user has touched the date range — switches the backend off the
  // rolling `days` window and onto explicit from/to bounds.
  const [customRange, setCustomRange] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const page = await institutionService.getAuditLog({
        days: customRange ? undefined : days,
        action: action || undefined,
        limit: 200,
        from: customRange ? from || undefined : undefined,
        to: customRange ? to || undefined : undefined,
      });
      setLogs(page.logs);
      setTotal(page.total);
      // Only refresh the action dropdown from the unfiltered response so the
      // current selection never disappears out from under the user.
      if (!action) setActions(page.actions ?? []);
    } catch {
      setLogs([]);
      setTotal(0);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [days, action, from, to, customRange]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await institutionService.exportAuditLog({
        days: customRange ? undefined : days,
        action: action || undefined,
        from: customRange ? from || undefined : undefined,
        to: customRange ? to || undefined : undefined,
      });
    } catch (e: any) {
      alert(e?.response?.data?.error || 'Export failed — try again.');
    } finally { setExporting(false); }
  };

  const color = (a: string) => ACTION_COLORS[a] ?? ACTION_COLORS.default;
  const fmtAction = (a: string) => a.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <InstitutionShell activePage="Audit Log" title="Audit Log" subtitle="Full history of admin actions in your institution.">

      <div className={styles.toolbar} style={{ flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, color:'#726a85', fontSize:13.5, fontWeight:600 }}>
          <Filter size={14} /> Filter:
        </div>
        <select className={styles.filterSelect} value={days}
          onChange={e => { setCustomRange(false); setDays(Number(e.target.value)); }}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <span style={{ fontSize: 12.5, color: '#9891a6', fontWeight: 600 }}>or</span>
        <input type="date" value={from} max={to || undefined} aria-label="From date"
          onChange={e => { setCustomRange(true); setFrom(e.target.value); }}
          style={{ border:'1px solid #e9d5ff', borderRadius:10, padding:'6px 10px', fontSize:12.5, color:'#201b2e', background:'#fff', fontFamily:"'Manrope',sans-serif" }} />
        <span style={{ fontSize: 12.5, color: '#9891a6', fontWeight: 600 }}>→</span>
        <input type="date" value={to} min={from || undefined} aria-label="To date"
          onChange={e => { setCustomRange(true); setTo(e.target.value); }}
          style={{ border:'1px solid #e9d5ff', borderRadius:10, padding:'6px 10px', fontSize:12.5, color:'#201b2e', background:'#fff', fontFamily:"'Manrope',sans-serif" }} />
        <select className={styles.filterSelect} value={action} onChange={e => setAction(e.target.value)}>
          <option value="">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{fmtAction(a)}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={exportCsv}
            disabled={exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #7c3aed, #9333ea)', color: '#fff',
              fontSize: 12.5, fontWeight: 700, fontFamily: "'Manrope', sans-serif",
              opacity: exporting ? .6 : 1,
            }}>
            <Download size={14} strokeWidth={2} />
            {exporting ? 'Preparing…' : 'Export CSV'}
          </button>
          {!loading && (
            <span style={{ fontSize: 12.5, color: '#9891a6', fontWeight: 600 }}>
              {total} event{total === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className={styles.emptyState}>Loading…</div>
      ) : logs.length === 0 ? (
        <div className={styles.emptyState}>
          <ShieldCheck size={32} strokeWidth={1.4} style={{ color:'#d8b4fe', marginBottom:8 }} />
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
                  {fmtAction(log.action)}
                </p>
                <p className={styles.auditDetail}>{log.detail || `${log.target_type} · ${log.target_id}`}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                {log.actor_name && (
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: '#726a85' }}>{log.actor_name}</p>
                )}
                <span className={styles.auditTime}>
                  {new Date(log.created_at).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </InstitutionShell>
  );
}
