'use client';

import React, { useState } from 'react';
import { X, CalendarClock, Loader2 } from 'lucide-react';
import { experienceService } from '@/services/experience.service';
import styles from '../class-management.module.css';

interface StudentOption {
  id: string;
  name: string;
  rollNumber?: string;
}

interface ExperimentOption {
  id: string;
  title: string;
  expNumber?: number;
}

interface GrantReliefModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentOption[];
  experiments: ExperimentOption[];
  initialStudentId?: string;
  onSuccess: (msg: string) => void;
}

const REASON_PRESETS = [
  'Medical Leave',
  'Health Issue',
  'Exam Conflict',
  'Personal Issue',
  'Family Event',
  'Technical Difficulty',
  'Academic Accommodations',
];

export const GrantReliefModal: React.FC<GrantReliefModalProps> = ({
  isOpen,
  onClose,
  students,
  experiments,
  initialStudentId,
  onSuccess,
}) => {
  const [studentId, setStudentId] = useState<string>(initialStudentId || (students[0]?.id || ''));
  const [experimentId, setExperimentId] = useState<string>(experiments[0]?.id || '');
  const [extensionUntil, setExtensionUntil] = useState<string>('');
  const [reason, setReason] = useState<string>('Medical Leave');
  const [customReason, setCustomReason] = useState<string>('');
  const [excused, setExcused] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !experimentId || !extensionUntil) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const finalReason = reason === 'Other' ? customReason.trim() : reason;
      await experienceService.grantExtension({
        student_id: studentId,
        experiment_id: experimentId,
        extension_until: new Date(extensionUntil).toISOString(),
        reason: finalReason || undefined,
        excused: excused,
      });
      onSuccess('Deadline relief granted and student notified.');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to grant deadline relief.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarClock size={20} color="#7c3aed" />
            <h3 className={styles.modalTitle}>Grant Deadline Relief</h3>
          </div>
          <button className={styles.modalCloseBtn} onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '0.6rem 0.8rem', borderRadius: 8, fontSize: '0.8rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Student</label>
            <select
              className={styles.formSelect}
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            >
              <option value="">Select a student...</option>
              {students.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name} {st.rollNumber ? `(${st.rollNumber})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Experiment / Lab</label>
            <select
              className={styles.formSelect}
              value={experimentId}
              onChange={(e) => setExperimentId(e.target.value)}
              required
            >
              <option value="">Select an experiment...</option>
              {experiments.map((exp) => (
                <option key={exp.id} value={exp.id}>
                  {exp.expNumber != null ? `Exp ${exp.expNumber}: ` : ''}{exp.title}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>New Extended Deadline</label>
            <input
              type="datetime-local"
              className={styles.formInput}
              value={extensionUntil}
              onChange={(e) => setExtensionUntil(e.target.value)}
              required
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Primary Reason</label>
            <select
              className={styles.formSelect}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {REASON_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="Other">Other Reason...</option>
            </select>
          </div>

          {reason === 'Other' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Specify Reason</label>
              <input
                type="text"
                className={styles.formInput}
                placeholder="Enter specific justification..."
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                required
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem' }}>
            <input
              type="checkbox"
              id="excusedCheckbox"
              checked={excused}
              onChange={(e) => setExcused(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#7c3aed', cursor: 'pointer' }}
            />
            <label htmlFor="excusedCheckbox" style={{ fontSize: '0.8rem', color: '#334155', cursor: 'pointer' }}>
              Mark as Excused Absence / Penalty Waiver
            </label>
          </div>

          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Granting...
                </>
              ) : (
                'Grant Relief'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
