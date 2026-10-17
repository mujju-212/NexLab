'use client';

import React from 'react';
import { X, HelpCircle, Sigma, Award, TrendingUp } from 'lucide-react';

interface BenchmarkHowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BenchmarkHowItWorksModal({ isOpen, onClose }: BenchmarkHowItWorksModalProps) {
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

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: '#f3e8ff',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <HelpCircle size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
              How Cohort Benchmarking Works
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#64748b' }}>
              Statistical standardization across academic cohorts, sections, and departments
            </p>
          </div>
        </div>

        {/* Content sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Card 1: Standardized Z-Score */}
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: '#faf5ff',
              border: '1px solid #ede9fe',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Sigma size={16} style={{ color: '#7c3aed' }} />
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#5b21b6' }}>
                Standardized Z-Score (σ)
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#4c1d95', lineHeight: 1.5 }}>
              Measures how many standard deviations a section deviates from the campus baseline mean (μ).
              A score of <strong>+1.0σ</strong> places the section approximately in the top 16% of all campus cohorts.
            </p>
            <div
              style={{
                marginTop: 8,
                padding: '6px 12px',
                borderRadius: 8,
                background: '#ffffff',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                color: '#6d28d9',
                display: 'inline-block',
              }}
            >
              Z = (Section Average - Campus Mean) / Standard Deviation
            </div>
          </div>

          {/* Card 2: Performance Distribution */}
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: '#f0fdf4',
              border: '1px solid #dcfce7',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Award size={16} style={{ color: '#16a34a' }} />
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#166534' }}>
                Cohort Performance Bands
              </h4>
            </div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '0.785rem', color: '#14532d', lineHeight: 1.6 }}>
              <li><strong>Above Average (Z ≥ +0.5σ):</strong> Consistently outperforming cohort peers.</li>
              <li><strong>On Par (-0.5σ ≤ Z &lt; +0.5σ):</strong> Academic delivery closely aligned with campus mean.</li>
              <li><strong>Below Average (-1.5σ ≤ Z &lt; -0.5σ):</strong> Moderate variance requiring monitoring.</li>
              <li><strong>Significantly Below (Z &lt; -1.5σ):</strong> Critical deviation triggering academic intervention.</li>
            </ul>
          </div>

          {/* Card 3: Percentile Ranking */}
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: '#fffbeb',
              border: '1px solid #fef3c7',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <TrendingUp size={16} style={{ color: '#d97706' }} />
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#92400e' }}>
                Percentile Ranking
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#78350f', lineHeight: 1.5 }}>
              Calculates the cumulative percentile rank of the section relative to all active sections in the selected cohort. A section ranked in <strong>Top 5%</strong> outperforms 95% of sections campus-wide.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #7c3aed, #9333ea)',
              color: '#ffffff',
              border: 'none',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(124, 58, 237, 0.25)',
            }}
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
}
