'use client';

import React from 'react';
import { X, ShieldAlert, AlertTriangle, Eye, Lock, CheckCircle2 } from 'lucide-react';

interface IntegrityHowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IntegrityHowItWorksModal({ isOpen, onClose }: IntegrityHowItWorksModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1px solid #ede9fe',
          boxShadow: '0 25px 50px -12px rgba(124, 58, 237, 0.25)',
          width: '100%',
          maxWidth: 620,
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '28px 32px',
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 20,
            right: 20,
            border: 'none',
            background: '#f1f5f9',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#64748b',
          }}
        >
          <X size={16} />
        </button>

        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#f5f3ff',
              border: '1px solid #ddd6fe',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7c3aed',
            }}
          >
            <ShieldAlert size={22} strokeWidth={2.2} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              How Integrity Telemetry Works
            </h2>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
              Standardized telemetry, discrete violation detection, and score models
            </p>
          </div>
        </div>

        {/* Content Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 20 }}>
          {/* Section 1 */}
          <div
            style={{
              padding: '16px',
              borderRadius: 14,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Eye size={16} style={{ color: '#7c3aed' }} />
              <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>
                1. Discrete ProctorEvent Telemetry
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.775rem', color: '#475569', lineHeight: 1.5 }}>
              NexLab captures standardized browser events emitted during live lab sessions and exams. Events include tab switches (via Page Visibility API), exiting fullscreen mode, lockdown security violations (blocked clipboard or developer tool attempts), screen share termination, and multi-face detections.
            </p>
          </div>

          {/* Section 2 */}
          <div
            style={{
              padding: '16px',
              borderRadius: 14,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <AlertTriangle size={16} style={{ color: '#ef4444' }} />
              <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>
                2. Weighted Severity & Campus Integrity Index
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.775rem', color: '#475569', lineHeight: 1.5 }}>
              Each violation is weighted by severity: <strong>Critical (4.0 pts)</strong>, <strong>High (3.0 pts)</strong>, <strong>Medium (2.0 pts)</strong>, and <strong>Low (1.0 pt)</strong>. The <em>Campus Integrity Index</em> (0–100) measures aggregate cohort integrity, penalizing frequent violations relative to active students.
            </p>
          </div>

          {/* Section 3 */}
          <div
            style={{
              padding: '16px',
              borderRadius: 14,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Lock size={16} style={{ color: '#10b981' }} />
              <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>
                3. Privacy Compliance & Audit Verification
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.775rem', color: '#475569', lineHeight: 1.5 }}>
              Telemetry only records discrete structural events and timestamped logs. No invasive screen scraping or raw video feeds are permanently stored, ensuring student privacy compliance under FERPA and GDPR standards while providing instructors and admins with auditable incident logs.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 10,
              background: '#7c3aed',
              color: '#ffffff',
              fontSize: '0.8125rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
            }}
          >
            Got it, thanks!
          </button>
        </div>
      </div>
    </div>
  );
}
