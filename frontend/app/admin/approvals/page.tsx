'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService, type Institution, type AdminDirectoryUser } from '@/services/admin.service';
import { useAuthStore } from '@/store/auth-store';
import styles from './page.module.css';

type ChangeRequest = {
  id: string; user_id: string; requested_by: string; approved_by: string | null;
  from_role: string; from_institution_id: string | null; to_role: string; to_institution_id: string;
  reason: string; review_note: string | null; status: 'pending' | 'approved' | 'rejected';
  created_at: string; decided_at: string | null; user_name: string | null; user_email: string | null;
  requester_name: string | null; reviewer_name: string | null;
  from_institution_name: string | null; to_institution_name: string | null;
};

export default function AccessApprovalsPage() {
  const currentUserId = useAuthStore(s => s.user?.id);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [candidates, setCandidates] = useState<AdminDirectoryUser[]>([]);
  const [status, setStatus] = useState('pending');
  const [query, setQuery] = useState('');
  const [userId, setUserId] = useState('');
  const [toRole, setToRole] = useState('student');
  const [toInstitution, setToInstitution] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [result, orgs] = await Promise.all([
        adminService.getUserChangeRequests(status), adminService.listInstitutions(),
      ]);
      setRequests(result.requests || []);
      setInstitutions(orgs || []);
      if (!toInstitution && orgs?.length) setToInstitution(orgs.find(i => i.is_active)?.id || '');
    } catch (e) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not load access change requests.');
    } finally { setLoading(false); }
  }, [status, toInstitution]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) { setCandidates([]); return; }
    const timer = window.setTimeout(async () => {
      try {
        const result = await adminService.searchUsers({ q: query.trim() }) as { users?: AdminDirectoryUser[] };
        if (!cancelled) setCandidates((result.users || []).filter(u => u.role !== 'platform_admin'));
      } catch { if (!cancelled) setCandidates([]); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const createRequest = async () => {
    if (!userId || !toInstitution || reason.trim().length < 20) { setError('Choose a user and destination, and provide a reason of at least 20 characters.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      await adminService.createUserChangeRequest({ user_id: userId, to_role: toRole, to_institution_id: toInstitution, reason: reason.trim() });
      setNotice('Change request submitted. A different platform admin must review it.');
      setUserId(''); setQuery(''); setCandidates([]); setReason('');
      await load();
    } catch (e) { setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not submit the request.'); }
    finally { setBusy(false); }
  };

  const decide = async (item: ChangeRequest, decision: 'approve' | 'reject') => {
    if (item.requested_by === currentUserId) { setError('A different platform admin must review this request.'); return; }
    const note = decision === 'reject' ? (window.prompt('Reason for rejection (optional):') || '') : '';
    if (decision === 'approve' && !window.confirm(`Approve ${item.user_email} → ${item.to_role} at ${item.to_institution_name}? Their active sessions will be signed out.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = decision === 'approve'
        ? await adminService.approveUserChangeRequest(item.id, note)
        : await adminService.rejectUserChangeRequest(item.id, note);
      setNotice(result.message || `Request ${decision}d.`);
      await load();
    } catch (e) { setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || `Could not ${decision} request.`); }
    finally { setBusy(false); }
  };

  const activeInstitutions = institutions.filter(i => i.is_active);
  const badgeClass = (s: string) => s === 'pending' ? styles.badgePending : s === 'approved' ? styles.badgeApproved : styles.badgeRejected;

  return (
    <AdminShell activePage="Access Approvals" title="Access Approvals" subtitle="Two-person review for tenant role and institution moves">
      <div className={styles.pageWrap}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Access change approvals</h1>
            <p className={styles.pageSub}>Requests require a second platform admin. Platform-admin grants and account transfers are excluded.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className={styles.btn}>
            <RefreshCw size={15} /> Refresh
          </button>
        </header>
        <div className={styles.noteRow}><AlertTriangle size={16} />Approved changes update the account’s role and tenant and force a fresh login. Platform-admin role changes must use a separate out-of-band security process.</div>

        {error && <div role="alert" className={styles.alert}>{error}</div>}
        {notice && <div role="status" className={styles.success}>{notice}</div>}

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Request a role or institution change</h2>
          <div className={styles.formGrid}>
            <label className={styles.label}>Find user
              <input value={query} onChange={e => { setQuery(e.target.value); setUserId(''); }} placeholder="Search by name or email" className={styles.input} />
              <select value={userId} onChange={e => setUserId(e.target.value)} className={styles.input}>
                <option value="">Select a user…</option>
                {candidates.map(u => <option key={u.id} value={u.id}>{u.full_name} · {u.email} · {u.role}</option>)}
              </select>
            </label>
            <label className={styles.label}>Requested role
              <select value={toRole} onChange={e => setToRole(e.target.value)} className={styles.input}>
                <option value="student">Student</option><option value="instructor">Instructor</option><option value="institution_admin">Institution admin</option>
              </select>
            </label>
            <label className={styles.label}>Destination institution
              <select value={toInstitution} onChange={e => setToInstitution(e.target.value)} className={styles.input}>
                <option value="">Select an active institution…</option>
                {activeInstitutions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
              </select>
            </label>
            <label className={styles.formGridWide}>Business reason (20–1000 characters)
              <textarea value={reason} maxLength={1000} rows={3} onChange={e => setReason(e.target.value)} className={styles.input} style={{ resize: 'vertical' }} />
            </label>
          </div>
          <div className={styles.formFooter}>
            <button type="button" disabled={busy || !userId || !toInstitution || reason.trim().length < 20} onClick={() => void createRequest()} className={styles.btnPrimary}>
              {busy ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />} Submit for independent approval
            </button>
          </div>
        </section>

        <section style={{ marginTop: 24 }}>
          <div className={styles.queueHeader}>
            <h2 className={styles.queueTitle}>Review queue</h2>
            <select value={status} onChange={e => setStatus(e.target.value)} className={styles.selectCompact}>
              <option value="pending">Pending</option><option value="all">All requests</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
            </select>
          </div>
          {loading ? <p style={{ color: '#716b80' }}>Loading requests…</p> : requests.length === 0 ? (
            <div className={styles.empty}>No requests in this view.</div>
          ) : (
            <div className={styles.requestList}>
              {requests.map(item => (
                <article key={item.id} className={styles.card}>
                  <div className={styles.requestTop}>
                    <div>
                      <strong className={styles.requestName}>{item.user_name || item.user_email}</strong>
                      <div className={styles.requestMeta}>{item.user_email} · requested by {item.requester_name || 'platform admin'}</div>
                    </div>
                    <span className={badgeClass(item.status)}>{item.status.toUpperCase()}</span>
                  </div>
                  <p className={styles.requestMove}><strong>{item.from_role}</strong> at {item.from_institution_name || 'No tenant'} → <strong>{item.to_role}</strong> at <strong>{item.to_institution_name || 'Unknown tenant'}</strong></p>
                  <p className={styles.requestReason}>{item.reason}</p>
                  <div className={styles.requestFooter}>
                    <span className={styles.requestTimestamp}>
                      Submitted {new Date(item.created_at).toLocaleString()}
                      {item.reviewer_name ? ` · reviewed by ${item.reviewer_name}` : ''}
                      {item.review_note ? ` · ${item.review_note}` : ''}
                    </span>
                    {item.status === 'pending' && item.requested_by !== currentUserId && (
                      <div className={styles.actions}>
                        <button type="button" disabled={busy} onClick={() => void decide(item, 'reject')} className={styles.btnDanger}><X size={14} /> Reject</button>
                        <button type="button" disabled={busy} onClick={() => void decide(item, 'approve')} className={styles.btnPrimary}><Check size={14} /> Approve</button>
                      </div>
                    )}
                    {item.status === 'pending' && item.requested_by === currentUserId && <span className={styles.waitNote}>Waiting for another platform admin</span>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
