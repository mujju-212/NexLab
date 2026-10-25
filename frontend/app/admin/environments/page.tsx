'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock3, Loader2, RefreshCw, X } from 'lucide-react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService } from '@/services/admin.service';

type EnvironmentRequest = {
  id: string;
  name: string;
  display_name: string;
  docker_image: string;
  institution_id: string | null;
  is_platform_default: boolean;
  pip_packages: string[];
  apt_packages: string[];
  build_status: string;
  created_at: string | null;
};

export default function AdminEnvironmentsPage() {
  const [requests, setRequests] = useState<EnvironmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await adminService.getPendingEnvironments();
      setRequests(result.pending || []);
    } catch (e) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Could not load environment requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const decide = async (request: EnvironmentRequest, action: 'approve' | 'reject') => {
    if (action === 'reject' && !window.confirm(`Reject the request “${request.display_name}”?`)) return;
    setWorkingId(request.id);
    setError('');
    setNotice('');
    try {
      const result = action === 'approve'
        ? await adminService.approveEnvironment(request.id)
        : await adminService.rejectEnvironment(request.id);
      setNotice(result.message || `Request ${action}d.`);
      await load();
    } catch (e) {
      setError((e as { response?: { data?: { error?: string } } })?.response?.data?.error || `Could not ${action} request.`);
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <AdminShell activePage="Environment Profiles" title="Environment Profiles" subtitle="Review environment profile requests">
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '8px 0 40px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 22 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, color: '#19152b' }}>Environment requests</h1>
            <p style={{ color: '#716b80', margin: '7px 0 0', fontSize: 14 }}>Review pending requests and record an approval decision.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} style={buttonStyle('secondary')}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#fff8e8', border: '1px solid #f3ddb0', color: '#805c18', borderRadius: 12, padding: 14, marginBottom: 18, fontSize: 13, lineHeight: 1.5 }}>
          <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><strong>Approval is governance-only.</strong> This workspace has no image builder, and approved custom Docker images are not run by the execution service. Do not treat approval as a completed build or runtime activation.</span>
        </div>

        {error && <div role="alert" style={{ background: '#fff0f0', border: '1px solid #f5c4c4', color: '#a4262c', borderRadius: 10, padding: 12, marginBottom: 14 }}>{error}</div>}
        {notice && <div role="status" style={{ background: '#effaf2', border: '1px solid #c8ead0', color: '#216e39', borderRadius: 10, padding: 12, marginBottom: 14 }}>{notice}</div>}

        {loading ? (
          <div style={{ padding: 56, textAlign: 'center', color: '#716b80' }}><Loader2 size={20} className="spin" /> <span style={{ marginLeft: 8 }}>Loading requests…</span></div>
        ) : requests.length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,.75)', border: '1px solid #ece9f2', borderRadius: 16, padding: 36, textAlign: 'center', color: '#716b80' }}>
            <Clock3 size={24} style={{ margin: '0 auto 10px', opacity: .65 }} />
            <div style={{ color: '#302a41', fontWeight: 700 }}>No pending requests</div>
            <div style={{ fontSize: 13, marginTop: 5 }}>New profile requests will appear here for review.</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {requests.map(request => (
              <article key={request.id} style={{ background: 'rgba(255,255,255,.82)', border: '1px solid #ece9f2', borderRadius: 16, padding: 20, boxShadow: '0 4px 14px rgba(34,24,60,.04)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 750, color: '#241e35' }}>{request.display_name}</div>
                    <div style={{ fontSize: 12, color: '#777184', marginTop: 4 }}>{request.name} · {request.institution_id ? `Institution ${request.institution_id}` : 'Platform request'}</div>
                  </div>
                  <span style={{ borderRadius: 999, padding: '5px 10px', background: '#fff4dc', color: '#946200', fontSize: 11, fontWeight: 700 }}>PENDING REVIEW</span>
                </div>
                <dl style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr)', gap: '7px 12px', fontSize: 13, margin: '18px 0', color: '#5b5568' }}>
                  <dt style={{ fontWeight: 700 }}>Image reference</dt><dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{request.docker_image}</dd>
                  <dt style={{ fontWeight: 700 }}>Python packages</dt><dd style={{ margin: 0 }}>{request.pip_packages?.length ? request.pip_packages.join(', ') : 'None listed'}</dd>
                  <dt style={{ fontWeight: 700 }}>System packages</dt><dd style={{ margin: 0 }}>{request.apt_packages?.length ? request.apt_packages.join(', ') : 'None listed'}</dd>
                  {request.created_at && <><dt style={{ fontWeight: 700 }}>Submitted</dt><dd style={{ margin: 0 }}>{new Date(request.created_at).toLocaleString()}</dd></>}
                </dl>
                <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => void decide(request, 'reject')} disabled={workingId === request.id} style={buttonStyle('danger')}>
                    {workingId === request.id ? <Loader2 size={15} className="spin" /> : <X size={15} />} Reject
                  </button>
                  <button type="button" onClick={() => void decide(request, 'approve')} disabled={workingId === request.id} style={buttonStyle('primary')}>
                    {workingId === request.id ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Approve request
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function buttonStyle(variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties {
  const palettes = {
    primary: { background: '#5b3cc4', color: '#fff', border: '1px solid #5b3cc4' },
    secondary: { background: '#fff', color: '#433b55', border: '1px solid #ddd8e8' },
    danger: { background: '#fff', color: '#a4262c', border: '1px solid #ecc6c8' },
  };
  return { ...palettes[variant], borderRadius: 9, padding: '9px 13px', display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 650, fontSize: 13, cursor: 'pointer' };
}
