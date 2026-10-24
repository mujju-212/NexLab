'use client';

import React, { useState } from 'react';
import { X, HeartHandshake, Loader2 } from 'lucide-react';
import { experienceService } from '@/services/experience.service';
import styles from '../class-management.module.css';

interface StudentOption {
  id: string;
  name: string;
  rollNumber?: string;
}

interface AddInterventionModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentOption[];
  initialStudentId?: string;
  onSuccess: (msg: string) => void;
}

const ACTION_OPTIONS = [
  { value: '1_on_1_review', label: '1:1 Diagnostic Review' },
  { value: 'practice_assignment', label: 'Remedial Practice Assigned' },
  { value: 'deadline_extension', label: 'Targeted Deadline Extension' },
  { value: 'contacted_guardian', label: 'Guardian Contact' },
  { value: 'counseling', label: 'Academic Counseling' },
  { value: 'peer_tutoring', label: 'Peer Tutor / TA Pairing' },
  { value: 'talked_to_student', label: 'Direct Mentorship Talk' },
  { value: 'resources_shared', label: 'Curated Study Resources' },
];

export const AddInterventionModal: React.FC<AddInterventionModalProps> = ({
  isOpen,
  onClose,
  students,
  initialStudentId,
  onSuccess,
}) => {
  const [studentId, setStudentId] = useState<string>(initialStudentId || (students[0]?.id || ''));
  const [actionType, setActionType] = useState<string>('1_on_1_review');
  const [note, setNote] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      setError('Please select a student.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await experienceService.createIntervention({
        student_id: studentId,
        action_type: actionType,
        note: note.trim() || undefined,
        follow_up_at: targetDate || undefined,
      });
      onSuccess('Intervention created successfully.');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create intervention.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HeartHandshake size={20} color="#7c3aed" />
            <h3 className={styles.modalTitle}>Add Student Intervention</h3>
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
            <label className={styles.formLabel}>Action Type</label>
            <select
              className={styles.formSelect}
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              required
            >
              {ACTION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Target / Follow-up Date</label>
            <input
              type="date"
              className={styles.formInput}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Intervention Notes / Plan</label>
            <textarea
              className={styles.formTextarea}
              rows={3}
              placeholder="Describe diagnostic observations, assigned tasks, or action steps..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
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
                  <Loader2 size={14} className="animate-spin" /> Saving...
                </>
              ) : (
                'Save Intervention'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
