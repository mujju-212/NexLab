'use client';

import React from 'react';
import { X, Sparkles, BookOpen, Target, CheckCircle2, Award, HelpCircle } from 'lucide-react';

interface OutcomesHowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OutcomesHowItWorksModal({
  isOpen,
  onClose,
}: OutcomesHowItWorksModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(4px)',
        zIndex: 9999,
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
          padding: 28,
          border: '1px solid #f1f5f9',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f1f5f9',
            paddingBottom: 16,
            marginBottom: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(124, 58, 237, 0.1)',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={20} />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: '#1e293b',
                }}
              >
                How Learning Outcomes Work
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                Statistical methodology and competency measurement
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 6,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Section 1: Concept Mastery */}
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Target size={18} style={{ color: '#10b981' }} />
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                Concept Mastery Threshold
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5 }}>
              A student is classified as having achieved <strong>Concept Mastery</strong> in a subject
              when their weighted assessment score across quizzes, automated code test cases, and viva
              evaluations equals or exceeds <strong>50.0%</strong>. The campus mastery rate reflects the proportion
              of evaluated students meeting or exceeding this threshold.
            </p>
          </div>

          {/* Section 2: Performance Levels */}
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Award size={18} style={{ color: '#7c3aed' }} />
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                Performance Level Tiers
              </h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#10b981' }} />
                <span><strong>Excellent:</strong> Score ≥ 80 pts</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#34d399' }} />
                <span><strong>Good:</strong> Score 65 – 79 pts</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                <span><strong>Average:</strong> Score 50 – 64 pts</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f97316' }} />
                <span><strong>Below Avg:</strong> Score 35 – 49 pts</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, gridColumn: 'span 2' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ef4444' }} />
                <span><strong>At Risk:</strong> Score &lt; 35 pts (triggers Early Warning Alert)</span>
              </div>
            </div>
          </div>

          {/* Section 3: Difficulty Index */}
          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <BookOpen size={18} style={{ color: '#0284c7' }} />
              <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
                Curriculum Difficulty Index
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5 }}>
              The <strong>Difficulty Index</strong> scales from 0.00 (easiest) to 1.00 (most challenging).
              It is calculated inversely from the pass rate and average student grade:
            </p>
            <div
              style={{
                margin: '8px 0',
                padding: '8px 12px',
                borderRadius: 8,
                background: '#ede9fe',
                color: '#5b21b6',
                fontFamily: 'monospace',
                fontSize: '0.8125rem',
                fontWeight: 600,
              }}
            >
              Difficulty = 1.0 - (PassRate% / 100) × (AvgGrade / 100)
            </div>
            <p style={{ margin: 0, fontSize: '0.785rem', color: '#64748b' }}>
              Subjects with an index ≥ 0.80 indicate rigorous curriculum bottlenecks where students
              frequently encounter complex concepts requiring additional instructor intervention.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
              color: '#ffffff',
              fontSize: '0.8125rem',
              fontWeight: 600,
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
