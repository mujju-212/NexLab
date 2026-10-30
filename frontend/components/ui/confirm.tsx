'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Promise-based styled replacement for native window.confirm().
 * Native confirms block the whole renderer (and freeze embedded/automated
 * browsers), so every destructive action in the portal routes through here.
 *
 * Mount <AppConfirmDialog /> once per shell (next to <AppToaster />), then:
 *   if (!(await confirmDialog({ title: 'Delete X?', danger: true }))) return;
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Danger actions render a red confirm button. */
  danger?: boolean;
}

type PendingRequest = ConfirmOptions & { resolve: (ok: boolean) => void };

let activeListener: ((req: PendingRequest) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (activeListener) {
      activeListener({ ...opts, resolve });
    } else {
      // No host mounted — fail safe to native behaviour rather than
      // silently swallowing the destructive action.
      // eslint-disable-next-line no-alert
      resolve(window.confirm(opts.message || opts.title));
    }
  });
}

export function AppConfirmDialog() {
  const [req, setReq] = useState<PendingRequest | null>(null);

  useEffect(() => {
    activeListener = (r) => setReq(r);
    return () => { activeListener = null; };
  }, []);

  if (!req) return null;

  const finish = (ok: boolean) => {
    req.resolve(ok);
    setReq(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, zIndex: 12000, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
        background: 'rgba(15,10,30,.55)', backdropFilter: 'blur(2px)',
      }}
      onClick={() => finish(false)}
    >
      <div
        style={{
          width: '100%', maxWidth: 400, background: '#fff', borderRadius: 16,
          padding: '24px 22px', boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div
            style={{
              width: 38, height: 38, borderRadius: 11, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              background: req.danger ? 'rgba(239,68,68,.1)' : 'rgba(124,58,237,.1)',
              color: req.danger ? '#ef4444' : '#7c3aed',
            }}
          >
            <AlertTriangle size={19} />
          </div>
          <h2 style={{ margin: 0, fontSize: 16.5, fontWeight: 800, color: '#0f172a' }}>{req.title}</h2>
        </div>
        {req.message && (
          <p style={{ margin: '0 0 18px', fontSize: 13.5, lineHeight: 1.5, color: '#64748b' }}>{req.message}</p>
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => finish(false)}
            style={{
              padding: '9px 16px', borderRadius: 9, border: '1px solid #e2e8f0',
              background: '#fff', color: '#334155', fontSize: 13.5, fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {req.cancelLabel || 'Cancel'}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => finish(true)}
            style={{
              padding: '9px 18px', borderRadius: 9, border: 'none',
              background: req.danger
                ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                : 'linear-gradient(135deg,#7c3aed,#9333ea)',
              color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {req.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
