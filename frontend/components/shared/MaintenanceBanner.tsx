'use client';

import { useEffect, useState } from 'react';
import { X, Wrench } from 'lucide-react';
import { apiClient } from '@/services/api-client';
import { getGlobalSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth-store';

export default function MaintenanceBanner() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [notice, setNotice] = useState<{ enabled: boolean; message: string }>({ enabled: false, message: '' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient.get<{ enabled: boolean; message: string }>('/platform/config/maintenance/status')
      .then(({ data }) => {
        if (!cancelled) setNotice({ enabled: Boolean(data.enabled), message: data.message || '' });
      })
      .catch(() => { /* Maintenance status is non-critical; do not block the app. */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = getGlobalSocket();
    if (!socket) return;
    const onMaintenance = (payload: { enabled?: boolean; message?: string }) => {
      setNotice({ enabled: Boolean(payload.enabled), message: payload.message || '' });
      setDismissed(false);
    };
    socket.on('maintenance_mode', onMaintenance);
    return () => { socket.off('maintenance_mode', onMaintenance); };
  }, [isAuthenticated]);

  if (!notice.enabled || dismissed) return null;
  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', inset: '0 0 auto', zIndex: 20000, display: 'flex', alignItems: 'center',
      justifyContent: 'center', gap: 10, padding: '10px 48px', background: '#7c2d12', color: '#fff7ed',
      boxShadow: '0 4px 18px rgba(15,23,42,.22)', fontSize: 13, fontWeight: 700, textAlign: 'center',
    }}>
      <Wrench size={15} aria-hidden="true" />
      <span>{notice.message || 'NexLab is undergoing scheduled maintenance.'}</span>
      <button type="button" aria-label="Dismiss maintenance notice" onClick={() => setDismissed(true)} style={{
        position: 'absolute', right: 10, top: 7, border: 0, background: 'transparent', color: 'inherit',
        cursor: 'pointer', padding: 4, display: 'inline-flex',
      }}><X size={16} /></button>
    </div>
  );
}
