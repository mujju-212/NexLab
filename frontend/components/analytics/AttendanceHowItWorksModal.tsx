'use client';

import React from 'react';
import { X, Calendar, UserCheck, AlertTriangle, Clock, Layers, CheckCircle2 } from 'lucide-react';

interface AttendanceHowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AttendanceHowItWorksModal({ isOpen, onClose }: AttendanceHowItWorksModalProps) {
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
            <Calendar size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              How Attendance Matrix Works
            </h3>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
              Real-time telemetry, session verification, and cohort engagement scoring
            </p>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, color: '#334155', fontSize: '0.875rem', lineHeight: 1.6 }}>
          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.925rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserCheck size={18} color="#10b981" />
              1. Real-Time Session Attendance Tracking
            </h4>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              Attendance is captured continuously during scheduled lab slots via authenticated IDE telemetry, biometric heartbeat check-ins, and instructor verification. Present records represent active lab participation, while absent records signify missed scheduled coursework.
            </p>
          </div>

          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.925rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={18} color="#7c3aed" />
              2. Departmental Benchmarking
            </h4>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              The matrix aggregates individual attendance across departments (e.g., Computer Science, Electronics, Mechanical), calculating normalized rates that allow institutional leadership to compare engagement parity across colleges and majors.
            </p>
          </div>

          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.925rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={18} color="#f59e0b" />
              3. Day & Hour Heatmap Matrix
            </h4>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              The 6-day (Monday to Saturday) by 10-hour (8 AM to 5 PM) density matrix classifies attendance percentage into 5 tiers:
            </p>
            <ul style={{ margin: '6px 0 0 0', paddingLeft: 20, fontSize: '0.785rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              <li><strong style={{ color: '#059669' }}>≥ 90%</strong>: Optimal peak participation</li>
              <li><strong style={{ color: '#10b981' }}>75–89%</strong>: Healthy attendance zone</li>
              <li><strong style={{ color: '#d97706' }}>50–74%</strong>: Warning zone / low turnout</li>
              <li><strong style={{ color: '#ea580c' }}>25–49%</strong>: Critical slump slot</li>
              <li><strong style={{ color: '#dc2626' }}>&lt; 25%</strong>: Severe absenteeism</li>
            </ul>
          </div>

          <div style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 6px 0', fontSize: '0.925rem', fontWeight: 700, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={18} color="#ef4444" />
              4. Low Attendance Early Warning Roster
            </h4>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              Students falling below the institutional mandatory threshold (&lt; 75%) are automatically escalated with their missed session count, historical attendance trend sparkline, and immediate 1-click drilldown into their Student 360 analytics profile.
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
