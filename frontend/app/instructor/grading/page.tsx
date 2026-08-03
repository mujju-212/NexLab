'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ClipboardCheck, CheckCircle2, AlertCircle, FileText, Code, Sparkles, MessageSquare,
  X, Check, ChevronRight, Eye, Award, Download, Send
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

interface Submission {
  id: string;
  name: string;
  roll: string;
  exp: string;
  subject: string;
  submittedAt: string;
  visiblePassed: number;
  visibleTotal: number;
  hiddenPassed: number;
  hiddenTotal: number;
  autoScore: number;
  finalScore: number | null;
  status: 'Pending Review' | 'Viva Recommended' | 'Graded';
  code: string;
  feedback: string;
}

const INITIAL_SUBMISSIONS: Submission[] = [
  {
    id: 'sub-arjun',
    name: 'Arjun Mehta',
    roll: 'CS21001',
    exp: 'Stack Data Structure Implementation',
    subject: 'CS301 Data Structures',
    submittedAt: '30 mins ago',
    visiblePassed: 3,
    visibleTotal: 3,
    hiddenPassed: 2,
    hiddenTotal: 2,
    autoScore: 100,
    finalScore: 95,
    status: 'Graded',
    code: `class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item):\n        self.items.append(item)\n    def pop(self):\n        if not self.is_empty():\n            return self.items.pop()\n    def is_empty(self):\n        return len(self.items) == 0`,
    feedback: 'Excellent implementation! Clean code structure and robust bounds checking.',
  },
  {
    id: 'sub-priya',
    name: 'Priya Sharma',
    roll: 'CS21002',
    exp: 'Stack Data Structure Implementation',
    subject: 'CS301 Data Structures',
    submittedAt: '1 hour ago',
    visiblePassed: 3,
    visibleTotal: 3,
    hiddenPassed: 1,
    hiddenTotal: 2,
    autoScore: 80,
    finalScore: null,
    status: 'Pending Review',
    code: `class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item):\n        self.items.append(item)\n    def pop(self):\n        return self.items.pop()`,
    feedback: '',
  },
  {
    id: 'sub-rohan',
    name: 'Rohan Gupta',
    roll: 'CS21003',
    exp: 'CPU Process Scheduling Simulator',
    subject: 'CS302 OS',
    submittedAt: '2 hours ago',
    visiblePassed: 2,
    visibleTotal: 4,
    hiddenPassed: 1,
    hiddenTotal: 2,
    autoScore: 50,
    finalScore: null,
    status: 'Viva Recommended',
    code: `# FCFS simulator code\ndef fcfs(processes):\n    pass`,
    feedback: '',
  },
];

export default function GradingPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = useState<Submission[]>(INITIAL_SUBMISSIONS);
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);

  // Review Modal Form State
  const [score, setScore] = useState<number>(85);
  const [feedbackText, setFeedbackText] = useState<string>('');

  const filtered = submissions.filter((s) => {
    if (filterStatus === 'All') return true;
    return s.status === filterStatus;
  });

  const handleOpenReview = (sub: Submission) => {
    setSelectedSub(sub);
    setScore(sub.finalScore ?? sub.autoScore);
    setFeedbackText(sub.feedback || 'Good effort. Make sure to review edge cases for full marks.');
  };

  const handleGenerateAIFeedback = () => {
    if (!selectedSub) return;
    setFeedbackText(`AI Evaluation: Passed ${selectedSub.visiblePassed + selectedSub.hiddenPassed}/${selectedSub.visibleTotal + selectedSub.hiddenTotal} test cases. Code is clear and well-structured. Recommended score: ${selectedSub.autoScore}%.`);
  };

  const handlePublishGrade = () => {
    if (!selectedSub) return;
    setSubmissions(submissions.map(s => s.id === selectedSub.id ? { ...s, finalScore: score, feedback: feedbackText, status: 'Graded' } : s));
    setSelectedSub(null);
  };

  return (
    <InstructorShell
      activePage="Grading"
      title="Post-Session Grading Studio"
      subtitle="Workflow 6: Review code submissions, inspect Judge0 test case evaluation, adjust scores, and publish feedback"
    >
      {/* Action Row */}
      <div className={styles.actionRow}>
        <button type="button" className={styles.primaryBtn} onClick={() => router.push('/instructor/viva')}>
          <MessageSquare size={16} strokeWidth={2} /> Oral Viva Panel
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/analytics')}>
          <Award size={16} strokeWidth={1.9} /> Gradebook & Class Score
        </button>
      </div>

      {/* Filter Chips */}
      <div className={styles.tabRow}>
        {['All', 'Pending Review', 'Viva Recommended', 'Graded'].map((st) => (
          <button
            key={st}
            type="button"
            className={`${styles.tabChip} ${filterStatus === st ? styles.tabChipActive : ''}`}
            onClick={() => setFilterStatus(st)}
          >
            {st} ({st === 'All' ? submissions.length : submissions.filter(s => s.status === st).length})
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Total Submissions</p>
          <p className={styles.kpiValue} style={{ color: '#2563eb' }}>{submissions.length}</p>
          <p className={styles.kpiSub}>Across active labs</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Pending Evaluation</p>
          <p className={styles.kpiValue} style={{ color: '#b45309' }}>{submissions.filter(s => s.status !== 'Graded').length}</p>
          <p className={styles.kpiSub}>Needs instructor action</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Judge0 Auto-Score Avg</p>
          <p className={styles.kpiValue} style={{ color: '#0f766e' }}>76%</p>
          <p className={styles.kpiSub}>Test case pass rate</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>AI Feedback Assistance</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>Ready</p>
          <p className={styles.kpiSub}>Groq LLM service connected</p>
        </div>
      </div>

      {/* Submissions Table / Cards */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Submissions Queue</h2>
            <p className={styles.sectionSub}>Workflow 6: Code correctness, hidden test cases, rubric mapping, and feedback publishing.</p>
          </div>
        </div>

        <div className={styles.list}>
          {filtered.map((sub) => (
            <div key={sub.id} className={styles.listRow}>
              <div className={styles.rowIcon}>
                <Code size={20} strokeWidth={1.9} />
              </div>

              <div className={styles.rowBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <p className={styles.rowTitle}>{sub.name} <span style={{ fontSize: '12px', color: '#64748b' }}>({sub.roll})</span></p>
                  <span className={`${styles.badge} ${sub.status === 'Graded' ? styles.greenBadge : sub.status === 'Viva Recommended' ? styles.purpleBadge : styles.amberBadge}`}>
                    {sub.status}
                  </span>
                </div>
                <p className={styles.rowMeta}>{sub.exp} · {sub.subject}</p>
                <p className={styles.rowSub}>
                  🧪 Visible Cases: {sub.visiblePassed}/{sub.visibleTotal} | 🔒 Hidden Cases: {sub.hiddenPassed}/{sub.hiddenTotal} | ⚡ Auto-Score: {sub.autoScore}%
                </p>
              </div>

              <div className={styles.rowSide}>
                <span className={styles.rowTitle} style={{ color: '#0f62fe', fontSize: '16px' }}>
                  {sub.finalScore !== null ? `${sub.finalScore}%` : 'Unassigned'}
                </span>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  style={{ minHeight: '34px', padding: '0 14px', fontSize: '12px' }}
                  onClick={() => handleOpenReview(sub)}
                >
                  <Eye size={13} /> Review Submission
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* GRADING STUDIO REVIEW MODAL */}
      {selectedSub && (
        <div className={styles.modalOverlay} onClick={() => setSelectedSub(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Workflow 6: Review & Grade Submission</h3>
                <p className={styles.sectionSub}>{selectedSub.name} ({selectedSub.roll}) · {selectedSub.exp}</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setSelectedSub(null)}>
                <X size={18} />
              </button>
            </div>

            {/* Test Case Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>VISIBLE TEST CASES</p>
                <strong style={{ fontSize: '16px', color: '#166534' }}>{selectedSub.visiblePassed} / {selectedSub.visibleTotal} Passed</strong>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>HIDDEN TEST CASES</p>
                <strong style={{ fontSize: '16px', color: '#1d4ed8' }}>{selectedSub.hiddenPassed} / {selectedSub.hiddenTotal} Passed</strong>
              </div>
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <p style={{ margin: '0 0 4px', fontSize: '11px', color: '#64748b', fontWeight: 700 }}>AUTO-GRADE SCORE</p>
                <strong style={{ fontSize: '16px', color: '#7c3aed' }}>{selectedSub.autoScore}%</strong>
              </div>
            </div>

            {/* Submitted Code Viewer */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Submitted Code File</label>
              <pre className={styles.codeBlock}>{selectedSub.code}</pre>
            </div>

            {/* Score Adjustment */}
            <div className={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className={styles.formLabel}>Final Instructor Score (%)</label>
                <strong style={{ fontSize: '18px', color: '#0f62fe', fontFamily: 'Space Grotesk' }}>{score}%</strong>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={score}
                onChange={(e) => setScore(Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            {/* Feedback Editor with AI Assistance */}
            <div className={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label className={styles.formLabel}>Instructor Feedback</label>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  style={{ minHeight: '28px', padding: '0 10px', fontSize: '11px' }}
                  onClick={handleGenerateAIFeedback}
                >
                  <Sparkles size={12} /> Auto-Generate AI Feedback
                </button>
              </div>
              <textarea
                className={styles.textarea}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Write student feedback or click AI auto-generate..."
              />
            </div>

            {/* Publish Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setSelectedSub(null)}>
                Cancel
              </button>
              <button type="button" className={styles.primaryBtn} onClick={handlePublishGrade}>
                <Send size={16} /> Publish Grade & Notify Student
              </button>
            </div>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
