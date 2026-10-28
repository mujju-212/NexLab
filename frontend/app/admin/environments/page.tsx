'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Clock3, Loader2, RefreshCw, X } from 'lucide-react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService } from '@/services/admin.service';
import styles from './page.module.css';

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
      <div className={styles.pageWrap}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.pageTitle}>Environment requests</h1>
            <p className={styles.pageSub}>Review pending requests and record an approval decision.</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className={styles.btn}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>

        <div className={styles.note}>
          <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
          <span><strong>Approval is governance-only.</strong> This workspace has no image builder, and approved custom Docker images are not run by the execution service. Do not treat approval as a completed build or runtime activation.</span>
        </div>

        {error && <div role="alert" className={styles.alert}>{error}</div>}
        {notice && <div role="status" className={styles.success}>{notice}</div>}

        {loading ? (
          <div className={styles.loading}><Loader2 size={20} className="spin" /> Loading requests…</div>
        ) : requests.length === 0 ? (
          <div className={styles.empty}>
            <Clock3 size={24} style={{ margin: '0 auto 10px', opacity: .65 }} />
            <div className={styles.emptyTitle}>No pending requests</div>
            <div className={styles.emptySub}>New profile requests will appear here for review.</div>
          </div>
        ) : (
          <div className={styles.requestList}>
            {requests.map(request => (
              <article key={request.id} className={styles.requestCard}>
                <div className={styles.requestTop}>
                  <div>
                    <div className={styles.requestName}>{request.display_name}</div>
                    <div className={styles.requestMeta}>{request.name} · {request.institution_id ? `Institution ${request.institution_id}` : 'Platform request'}</div>
                  </div>
                  <span className={styles.pendingBadge}>PENDING REVIEW</span>
                </div>
                <dl className={styles.requestDl}>
                  <dt>Image reference</dt><dd>{request.docker_image}</dd>
                  <dt>Python packages</dt><dd>{request.pip_packages?.length ? request.pip_packages.join(', ') : 'None listed'}</dd>
                  <dt>System packages</dt><dd>{request.apt_packages?.length ? request.apt_packages.join(', ') : 'None listed'}</dd>
                  {request.created_at && <><dt>Submitted</dt><dd>{new Date(request.created_at).toLocaleString()}</dd></>}
                </dl>
                <div className={styles.requestActions}>
                  <button type="button" onClick={() => void decide(request, 'reject')} disabled={workingId === request.id} className={styles.btnDanger}>
                    {workingId === request.id ? <Loader2 size={15} className="spin" /> : <X size={15} />} Reject
                  </button>
                  <button type="button" onClick={() => void decide(request, 'approve')} disabled={workingId === request.id} className={styles.btnPrimary}>
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
