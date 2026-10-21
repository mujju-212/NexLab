'use client';

import React, { useState } from 'react';
import { Star, X, Loader2, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { studentService } from '@/services/student.service';

interface SessionFeedbackModalProps {
  sessionId: string;
  sessionTitle?: string;
  instructorName?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function SessionFeedbackModal({
  sessionId,
  sessionTitle,
  instructorName,
  isOpen,
  onClose,
  onSuccess,
}: SessionFeedbackModalProps) {
  const [clarity, setClarity] = useState<number>(5);
  const [pacing, setPacing] = useState<number>(4);
  const [aiHelp, setAiHelp] = useState<number>(5);
  const [overall, setOverall] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await studentService.submitFeedback({
        session_id: sessionId,
        experiment_clarity: clarity,
        session_pacing: pacing,
        ai_hint_helpfulness: aiHelp,
        overall_rating: overall,
        comment: comment.trim() || undefined,
      });
      setSubmitted(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
        setSubmitted(false);
      }, 1800);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to submit session feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStarPicker = (value: number, onChange: (val: number) => void, label: string) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>{label}</label>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed' }}>{value} / 5</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            <Star
              size={24}
              fill={star <= value ? '#f59e0b' : 'none'}
              color={star <= value ? '#f59e0b' : '#cbd5e1'}
              strokeWidth={1.8}
            />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 20,
          width: '100%',
          maxWidth: 520,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
            padding: '20px 24px',
            color: '#ffffff',
            position: 'relative',
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 18,
              right: 18,
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.2)', padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
            <Sparkles size={12} />
            <span>STUDENT VOICE</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
            Rate Live Lab Session
          </h2>
          <p style={{ fontSize: 13, color: '#e0e7ff', margin: '4px 0 0 0' }}>
            {sessionTitle || 'Interactive Laboratory Session'}
            {instructorName ? ` · ${instructorName}` : ''}
          </p>
        </div>

        {/* Body */}
        {submitted ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#ecfdf5',
                color: '#10b981',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <CheckCircle2 size={36} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
              Thank You for Your Feedback!
            </h3>
            <p style={{ fontSize: 13, color: '#64748b' }}>
              Your ratings help instructors refine pacing and practical demonstrations.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '8px 12px',
                marginBottom: 18,
                fontSize: 12,
                color: '#475569',
              }}
            >
              <ShieldCheck size={16} color="#10b981" />
              <span>
                <b>100% Anonymous:</b> Your name and identity are never revealed to the instructor.
              </span>
            </div>

            {renderStarPicker(overall, setOverall, 'Overall Session Experience')}
            {renderStarPicker(clarity, setClarity, 'Lab Experiment Clarity & Explanations')}
            {renderStarPicker(pacing, setPacing, 'Session Pacing & Time Management')}
            {renderStarPicker(aiHelp, setAiHelp, 'AI Guidance & Workbench Support')}

            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Additional Suggestions or Comments (Optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What went well? What could be improved for next time?"
                rows={3}
                style={{
                  width: '100%',
                  borderRadius: 10,
                  border: '1.5px solid #cbd5e1',
                  padding: '10px 12px',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 12.5,
                  marginBottom: 16,
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  color: '#475569',
                  padding: '9px 16px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6366f1 100%)',
                  border: 'none',
                  color: '#ffffff',
                  padding: '9px 20px',
                  borderRadius: 10,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(124, 58, 237, 0.25)',
                }}
              >
                {submitting ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                <span>{submitting ? 'Submitting…' : 'Submit Anonymous Feedback'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
