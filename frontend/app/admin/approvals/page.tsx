'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, RefreshCw, ShieldCheck, X } from 'lucide-react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService, type Institution, type AdminDirectoryUser } from '@/services/admin.service';
import { useAuthStore } from '@/store/auth-store';

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

  return (
    <AdminShell activePage="Access Approvals" title="Access Approvals" subtitle="Two-person review for tenant role and institution moves">
      <main style={{ maxWidth: 1060, margin: '0 auto', paddingBottom: 40 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
          <div><h1 style={{ margin: 0, fontSize: 25, color: '#201a30' }}>Access change approvals</h1><p style={{ color: '#716b80', fontSize: 13, margin: '6px 0 0' }}>Requests require a second platform admin. Platform-admin grants and account transfers are excluded.</p></div>
          <button type="button" onClick={() => void load()} disabled={loading} style={buttonStyle}><RefreshCw size={15} /> Refresh</button>
        </header>
        <div style={{ display: 'flex', gap: 9, background: '#fff7e6', border: '1px solid #f3ddb0', color: '#805c18', borderRadius: 11, padding: 12, marginBottom: 16, fontSize: 12.5 }}><AlertTriangle size={16} style={{ flexShrink: 0 }} />Approved changes update the account’s role and tenant and force a fresh login. Platform-admin role changes must use a separate out-of-band security process.</div>

        {error && <div role="alert" style={alertStyle}>{error}</div>}{notice && <div role="status" style={noticeStyle}>{notice}</div>}

        <section style={cardStyle}>
          <h2 style={{ fontSize: 16, margin: '0 0 14px', color: '#302a41' }}>Request a role or institution change</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
            <label style={labelStyle}>Find user
              <input value={query} onChange={e => { setQuery(e.target.value); setUserId(''); }} placeholder="Search by name or email" style={inputStyle} />
              <select value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle}>
                <option value="">Select a user…</option>
                {candidates.map(u => <option key={u.id} value={u.id}>{u.full_name} · {u.email} · {u.role}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Requested role
              <select value={toRole} onChange={e => setToRole(e.target.value)} style={inputStyle}>
                <option value="student">Student</option><option value="instructor">Instructor</option><option value="institution_admin">Institution admin</option>
              </select>
            </label>
            <label style={labelStyle}>Destination institution
              <select value={toInstitution} onChange={e => setToInstitution(e.target.value)} style={inputStyle}>
                <option value="">Select an active institution…</option>
                {activeInstitutions.map(i => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}
              </select>
            </label>
            <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>Business reason (20–1000 characters)
              <textarea value={reason} maxLength={1000} rows={3} onChange={e => setReason(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><button type="button" disabled={busy || !userId || !toInstitution || reason.trim().length < 20} onClick={() => void createRequest()} style={primaryButton}>{busy ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />} Submit for independent approval</button></div>
        </section>

        <section style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}><h2 style={{ fontSize: 17, margin: 0, color: '#302a41' }}>Review queue</h2>
            <select value={status} onChange={e => setStatus(e.target.value)} style={{ ...inputStyle, width: 150 }}><option value="pending">Pending</option><option value="all">All requests</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select>
          </div>
          {loading ? <p style={{ color: '#716b80' }}>Loading requests…</p> : requests.length === 0 ? <div style={{ ...cardStyle, textAlign: 'center', color: '#716b80' }}>No requests in this view.</div> : <div style={{ display: 'grid', gap: 11 }}>
            {requests.map(item => <article key={item.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div><strong style={{ color: '#292337' }}>{item.user_name || item.user_email}</strong><div style={{ color: '#716b80', fontSize: 12, marginTop: 4 }}>{item.user_email} · requested by {item.requester_name || 'platform admin'}</div></div>
                <span style={{ padding: '4px 9px', height: 'fit-content', borderRadius: 999, background: item.status === 'pending' ? '#fff4dc' : item.status === 'approved' ? '#e9f8ef' : '#fff0f0', color: item.status === 'pending' ? '#946200' : item.status === 'approved' ? '#216e39' : '#a4262c', fontSize: 11, fontWeight: 750 }}>{item.status.toUpperCase()}</span>
              </div>
              <p style={{ margin: '14px 0 6px', fontSize: 13, color: '#534d60' }}><strong>{item.from_role}</strong> at {item.from_institution_name || 'No tenant'} → <strong>{item.to_role}</strong> at <strong>{item.to_institution_name || 'Unknown tenant'}</strong></p>
              <p style={{ margin: '7px 0', whiteSpace: 'pre-wrap', fontSize: 13, color: '#625b70' }}>{item.reason}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginTop: 13 }}>
                <span style={{ fontSize: 11, color: '#8b8498' }}>Submitted {new Date(item.created_at).toLocaleString()}{item.reviewer_name ? ` · reviewed by ${item.reviewer_name}` : ''}{item.review_note ? ` · ${item.review_note}` : ''}</span>
                {item.status === 'pending' && item.requested_by !== currentUserId && <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" disabled={busy} onClick={() => void decide(item, 'reject')} style={buttonStyle}><X size={14} /> Reject</button>
                  <button type="button" disabled={busy} onClick={() => void decide(item, 'approve')} style={primaryButton}><Check size={14} /> Approve</button>
                </div>}
                {item.status === 'pending' && item.requested_by === currentUserId && <span style={{ fontSize: 12, color: '#946200' }}>Waiting for another platform admin</span>}
              </div>
            </article>)}
          </div>}
        </section>
      </main>
    </AdminShell>
  );
}

const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,.8)', border: '1px solid #ece9f2', borderRadius: 14, padding: 18 };
const labelStyle: React.CSSProperties = { display: 'grid', gap: 7, color: '#514a60', fontWeight: 700, fontSize: 12 };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', border: '1px solid #ddd8e8', borderRadius: 9, padding: '10px 11px', font: 'inherit', fontSize: 13, color: '#302a41', background: '#fff' };
const buttonStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 11px', borderRadius: 9, border: '1px solid #ddd8e8', background: '#fff', color: '#433b55', cursor: 'pointer', fontWeight: 650, fontSize: 12 };
const primaryButton: React.CSSProperties = { ...buttonStyle, background: '#5b3cc4', color: '#fff', borderColor: '#5b3cc4' };
const alertStyle: React.CSSProperties = { background: '#fff0f0', border: '1px solid #f5c4c4', color: '#a4262c', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 };
const noticeStyle: React.CSSProperties = { background: '#effaf2', border: '1px solid #c8ead0', color: '#216e39', borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 13 };
