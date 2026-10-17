'use client';

import React from 'react';
import { X, Users, Activity, AlertTriangle, ShieldCheck, Zap, Info, Clock, CheckCircle } from 'lucide-react';

interface EngagementHowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EngagementHowItWorksModal({ isOpen, onClose }: EngagementHowItWorksModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
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
          maxWidth: 680,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          border: '1px solid #ede9fe',
          padding: 28,
          position: 'relative',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#7c3aed',
              }}
            >
              <Activity size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                How Engagement Signals Work
              </h3>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
                Understand how NexLab measures laboratory participation, focus, and learner health
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Section 1: Engagement Rate */}
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Users size={16} color="#7c3aed" />
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                1. Active Learners & Engagement Rate
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#475569', lineHeight: 1.55 }}>
              A student is classified as an <strong>Active Learner</strong> if they have attended at least one scheduled
              hands-on lab session within the specified time window (default 30 days). The <strong>Engagement Rate</strong>{' '}
              is the ratio of active learners over the total registered cohort in the institution or filtered department.
            </p>
          </div>

          {/* Section 2: Dormant Students */}
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: '#fef2f2',
              border: '1px solid #fee2e2',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <AlertTriangle size={16} color="#dc2626" />
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#991b1b' }}>
                2. Dormancy Thresholds
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#7f1d1d', lineHeight: 1.55 }}>
              Learners who have had <strong>no recorded lab activity for ≥ 7 consecutive days</strong> are classified as{' '}
              <strong>Dormant</strong>. Learners with 4–6 days of inactivity or an overall attendance rate below 30% are
              flagged <strong>At Risk</strong>, while those between 30%–40% are placed on <strong>Watch</strong>.
            </p>
          </div>

          {/* Section 3: Average Focus Score */}
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: '#f0fdf4',
              border: '1px solid #dcfce7',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Zap size={16} color="#059669" />
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#166534' }}>
                3. Behavioral Focus Score Calculation
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#14532d', lineHeight: 1.55 }}>
              Focus score ranges from <strong>0 to 100</strong> and is computed from real-time session telemetry:
              active code execution frequency, continuous terminal time, low tab-switching penalties, and proctoring
              event frequency (e.g. absent gaze or unauthorized background tabs).
            </p>
          </div>

          {/* Section 4: Activity Distribution */}
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              background: '#faf5ff',
              border: '1px solid #f3e8ff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Clock size={16} color="#7c3aed" />
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#6b21a8' }}>
                4. Activity Distribution Heatmap
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#581c87', lineHeight: 1.55 }}>
              Aggregates all student minutes spent in active lab environments by day of the week (Mon–Sun) and hour of
              day (8AM–5PM). Peak hours like laboratory practicals on Wednesday and Thursday 11AM–2PM display the highest
              density (deep purple).
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: '#7c3aed',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              padding: '10px 22px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
            }}
          >
            Got it, close
          </button>
        </div>
      </div>
    </div>
  );
}
