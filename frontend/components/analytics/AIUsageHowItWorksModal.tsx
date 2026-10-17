'use client';

import React from 'react';
import { X, Sparkles, Cpu, Layers, AlertTriangle, CheckCircle2, BarChart2 } from 'lucide-react';

interface AIUsageHowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIUsageHowItWorksModal({ isOpen, onClose }: AIUsageHowItWorksModalProps) {
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
            <Sparkles size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              How AI Usage & Telemetry Works
            </h3>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
              Real-time query telemetry, token consumption metering, and cognitive reliance tracking
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, color: '#334155', fontSize: '0.875rem', lineHeight: 1.6 }}>
          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.925rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={18} color="#7c3aed" />
              1. Real-Time AI Query & Token Metering
            </h4>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              Every time a learner requests assistance in the IDE (code explanations, runtime debugging, progressive hints, or oral viva preparation), a telemetry record is logged with prompt tokens, completion tokens, latency, and success status.
            </p>
          </div>

          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.925rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={18} color="#06b6d4" />
              2. Feature & Subject Attribution
            </h4>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              AI interactions are categorized by pedagogical intent (Code Explanation 32.8%, Debug Help 22.1%, Concept Explanation 16.0%, Lab Guidance 13.1%, Viva Prep 8.8%) and linked to the active lab subject (e.g., Data Structures, Operating Systems) to detect where learners face the greatest friction.
            </p>
          </div>

          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.925rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart2 size={18} color="#10b981" />
              3. AI Reliance Index
            </h4>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              The <em>AI Reliance Index</em> measures the proportion of experiments and code runs where automated AI assistance was requested versus solved independently. A balanced index (20–40%) reflects constructive scaffolding, while an index exceeding 70% suggests heavy dependence.
            </p>
          </div>

          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.925rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} color="#ef4444" />
              4. High Reliance Student Safeguards
            </h4>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              Students who consistently lean on AI for more than 70% of experimental tasks are surfaced in the High Reliance roster. Faculty can view historical usage trends, open the Student 360 profile, and adapt academic coaching to encourage independent mastery.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 20px',
              borderRadius: 10,
              border: 'none',
              background: '#7c3aed',
              color: '#ffffff',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Got it, close
          </button>
        </div>
      </div>
    </div>
  );
}
