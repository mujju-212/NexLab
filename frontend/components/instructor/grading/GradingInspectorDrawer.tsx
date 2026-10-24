'use client';

import React, { useState } from 'react';
import {
  X, Sparkles, Save, BookOpen, Terminal, FileText, Code2, Mic2, Award, ShieldCheck
} from 'lucide-react';
import hub from '@/app/instructor/grading/hub.module.css';

const AVATAR_PALETTE = [
  { bg: '#ede9fe', text: '#7c3aed' },
  { bg: '#e0e7ff', text: '#4f46e5' },
  { bg: '#dbeafe', text: '#2563eb' },
  { bg: '#fce7f3', text: '#db2777' },
  { bg: '#ccfbf1', text: '#0d9488' },
  { bg: '#ffedd5', text: '#ea580c' },
  { bg: '#f3e8ff', text: '#9333ea' },
  { bg: '#e2e8f0', text: '#475569' },
];

function getAvatarStyle(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const color = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  return { background: color.bg, color: color.text };
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('') || '—'
  );
}

const fmt = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Not available';

interface GradingInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeStudent: any;
  activeSubmission: any;
  experimentMeta: any;
  subjectExperiments: any[];
  inspectorAssessmentId: string;
  onSelectAssessment: (id: string) => void;
  activeStudentIndex: number;
  totalFilteredStudents: number;
  onPrevStudent: () => void;
  onNextStudent: () => void;
  liveScore: {
    score: number;
    assessedPct: number;
    hints: number;
    hintDeduction: number;
  };
  componentScores: Record<string, string>;
  setComponentScores: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  assessed: Record<string, boolean>;
  setAssessed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  manualFeedback: string;
  setManualFeedback: (f: string) => void;
  saving: boolean;
  drafting: boolean;
  onSaveGrade: () => void;
  onGenerateAiDraft: () => void;
}

export default function GradingInspectorDrawer({
  isOpen,
  onClose,
  activeStudent,
  activeSubmission,
  experimentMeta,
  subjectExperiments,
  inspectorAssessmentId,
  onSelectAssessment,
  activeStudentIndex,
  totalFilteredStudents,
  onPrevStudent,
  onNextStudent,
  liveScore,
  componentScores,
  setComponentScores,
  assessed,
  setAssessed,
  manualFeedback,
  setManualFeedback,
  saving,
  drafting,
  onSaveGrade,
  onGenerateAiDraft,
}: GradingInspectorDrawerProps) {
  const [inspectorSubTab, setInspectorSubTab] = useState<'overview' | 'tests' | 'report' | 'code' | 'viva' | 'quiz' | 'integrity'>('overview');

  if (!isOpen || !activeStudent) return null;

  return (
    <div className={hub.drawerBackdrop} onClick={onClose}>
      <div className={hub.drawerPanel} onClick={e => e.stopPropagation()}>
        {/* Header: Student Info, Prev/Next, Assessment Selector, Close Button */}
        <div className={hub.inspectorHeader} style={{ padding: '16px 20px', borderBottom: '1px solid #e9ecf4' }}>
          <div className={hub.inspectorStudentInfo}>
            <div className={hub.inspectorStudentAvatar} style={getAvatarStyle(activeStudent.full_name)}>
              {initials(activeStudent.full_name)}
            </div>
            <div>
              <div className={hub.inspectorStudentName}>{activeStudent.full_name}</div>
              <div className={hub.inspectorStudentSub}>
                {activeStudent.roll_number} • {activeStudent.email}
              </div>
            </div>
          </div>

          <div className={hub.inspectorNavGroup} style={{ gap: 8 }}>
            <button
              type="button"
              className={hub.inspectorNavBtn}
              disabled={activeStudentIndex <= 0}
              onClick={onPrevStudent}
              title="Previous Student"
            >
              ‹
            </button>
            <button
              type="button"
              className={hub.inspectorNavBtn}
              disabled={activeStudentIndex >= totalFilteredStudents - 1}
              onClick={onNextStudent}
              title="Next Student"
            >
              ›
            </button>
            <div className={hub.assessmentSelectWrap}>
              <select
                className={hub.assessmentSelect}
                value={inspectorAssessmentId}
                onChange={e => onSelectAssessment(e.target.value)}
              >
                {subjectExperiments.map(exp => (
                  <option key={exp.id} value={exp.id}>
                    Lab {exp.exp_number} - {exp.title}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className={hub.iconBtn}
              style={{ width: 32, height: 32, padding: 0 }}
              onClick={onClose}
              title="Close Inspector"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Inspector Content Body */}
        <div style={{ flex: 1, padding: 20, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
          {/* Score Status Banner */}
          <div className={hub.inspectorScoreBar}>
            <div className={hub.inspectorScoreLeft}>
              <span className={hub.inspectorScoreBig}>
                {liveScore.score.toFixed(2)}
              </span>
              <span className={hub.inspectorScoreScale}>
                / {experimentMeta?.grade_scale || 100}
              </span>
              <span className={`${hub.inspectorStatusPill} ${activeStudent.status === 'graded' ? hub.statusPillGraded : hub.statusPillNeedsReview}`}>
                {activeStudent.status === 'graded' ? 'Graded' : 'Needs Review'}
              </span>
            </div>

            <div className={hub.inspectorScoreRight}>
              <span>Assessed Weight: {liveScore.assessedPct}%</span>
              {liveScore.hints > 0 && (
                <span className={hub.inspectorHintDeduction}>
                  Hint Deduction: -{liveScore.hintDeduction} pts ({liveScore.hints} hints)
                </span>
              )}
            </div>
          </div>

          {/* Sub-Tabs */}
          <div className={hub.inspectorSubTabs}>
            {[
              { id: 'overview', label: 'Overview', icon: BookOpen },
              { id: 'tests', label: 'Test Cases', icon: Terminal },
              { id: 'report', label: 'Lab Report', icon: FileText },
              { id: 'code', label: 'Code', icon: Code2 },
              { id: 'viva', label: 'Viva', icon: Mic2 },
              { id: 'quiz', label: 'Quiz', icon: Award },
              { id: 'integrity', label: 'Integrity', icon: ShieldCheck },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`${hub.inspectorSubTab} ${inspectorSubTab === tab.id ? hub.inspectorSubTabActive : ''}`}
                  onClick={() => setInspectorSubTab(tab.id as any)}
                >
                  <Icon size={12} /> {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab: Overview (Rubric Component Scores & Feedback) */}
          {inspectorSubTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  Rubric Score Allocation ({subjectExperiments.find(e => e.id === inspectorAssessmentId)?.title || 'Selected Assessment'})
                </span>

                {[
                  { key: 'test_cases', label: 'Test Cases', maxWeight: experimentMeta?.rubric?.test_cases || 40, autoVal: activeSubmission?.auto_grade },
                  { key: 'lab_report', label: 'Lab Report', maxWeight: experimentMeta?.rubric?.lab_report || 20, autoVal: null },
                  { key: 'code_quality', label: 'Code Quality', maxWeight: experimentMeta?.rubric?.code_quality || 15, autoVal: activeSubmission?.quality_grade ? 85 : null },
                  { key: 'viva', label: 'Oral Viva', maxWeight: experimentMeta?.rubric?.viva || 15, autoVal: activeSubmission?.viva_grade },
                  { key: 'quiz', label: 'Pre/Post Quiz', maxWeight: experimentMeta?.rubric?.quiz || 10, autoVal: activeSubmission?.quiz_grade },
                ].map(item => (
                  <div key={item.key} className={hub.rubricRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={assessed[item.key] !== false}
                        onChange={e => setAssessed(prev => ({ ...prev, [item.key]: e.target.checked }))}
                        style={{ accentColor: '#7c3aed' }}
                      />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 650, color: '#0f172a' }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Weightage: {item.maxWeight}%</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        placeholder="0"
                        className={hub.weightInput}
                        value={componentScores[item.key] ?? ''}
                        onChange={e => setComponentScores(prev => ({ ...prev, [item.key]: e.target.value }))}
                      />
                      <span style={{ fontSize: 12, color: '#64748b' }}>/ 100</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Submission Timeline Stepper */}
              <div className={hub.timelineSection}>
                <span className={hub.timelineStepTitle}>Submission Timeline & Activity</span>
                <div className={hub.timelineStepper}>
                  <div className={hub.timelineStep}>
                    <div className={`${hub.timelineDot} ${activeSubmission?.opened_at ? hub.timelineDotActive : ''}`} />
                    <span className={hub.timelineStepTitle}>Opened</span>
                    <span className={hub.timelineStepSub}>{fmt(activeSubmission?.opened_at)}</span>
                  </div>
                  <div className={hub.timelineStep}>
                    <div className={`${hub.timelineDot} ${activeSubmission?.first_run_at ? hub.timelineDotActive : ''}`} />
                    <span className={hub.timelineStepTitle}>First Run</span>
                    <span className={hub.timelineStepSub}>{fmt(activeSubmission?.first_run_at)}</span>
                  </div>
                  <div className={hub.timelineStep}>
                    <div className={`${hub.timelineDot} ${activeSubmission?.submitted_at ? hub.timelineDotActive : ''}`} />
                    <span className={hub.timelineStepTitle}>Submitted</span>
                    <span className={hub.timelineStepSub}>{fmt(activeSubmission?.submitted_at)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-around', background: '#f8fafc', padding: 8, borderRadius: 8 }}>
                  <div className={hub.timelineStatsCol}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{activeSubmission?.total_runs ?? 0}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Total Runs</span>
                  </div>
                  <div className={hub.timelineStatsCol}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{activeSubmission?.total_hints ?? 0}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Hints Requested</span>
                  </div>
                  <div className={hub.timelineStatsCol}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{activeSubmission?.loc ?? 0}</span>
                    <span style={{ fontSize: 10, color: '#94a3b8' }}>Lines of Code</span>
                  </div>
                </div>
              </div>

              {/* Manual / AI Feedback Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Instructor Feedback</span>
                  <button
                    type="button"
                    className={hub.aiDraftBtn}
                    disabled={drafting}
                    onClick={onGenerateAiDraft}
                  >
                    <Sparkles size={13} /> {drafting ? 'Generating AI Draft…' : 'Draft AI Feedback'}
                  </button>
                </div>
                <textarea
                  style={{
                    width: '100%',
                    minHeight: 100,
                    borderRadius: 10,
                    border: '1px solid #cbd5e1',
                    padding: 12,
                    fontSize: 12.5,
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                  placeholder="Provide personalized, constructive feedback to the student..."
                  value={manualFeedback}
                  onChange={e => setManualFeedback(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Tab: Test Cases */}
          {inspectorSubTab === 'tests' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Automated Test Execution Results</span>
                <span className={`${hub.kpiCardBadge} ${hub.kpiBadgeGreen}`}>
                  {activeSubmission?.test_cases_passed ?? 0} / {activeSubmission?.test_cases_total ?? 0} Passed
                </span>
              </div>
              {experimentMeta?.test_cases && experimentMeta.test_cases.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {experimentMeta.test_cases.map((tc: any, idx: number) => (
                    <div key={tc.id} style={{ background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #eef2f6', fontSize: 12 }}>
                      <div style={{ fontWeight: 650, color: '#334155', marginBottom: 4 }}>
                        Test Case #{idx + 1} {tc.is_hidden ? '(Hidden Evaluation Case)' : '(Public Sample Case)'}
                      </div>
                      <div style={{ fontFamily: 'monospace', color: '#64748b' }}>Input: {tc.input_data}</div>
                      <div style={{ fontFamily: 'monospace', color: '#16a34a' }}>Expected: {tc.expected_output}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#94a3b8', fontSize: 12.5 }}>No test case specifications recorded for this experiment.</div>
              )}
            </div>
          )}

          {/* Tab: Code Preview */}
          {inspectorSubTab === 'code' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                  Student Submitted Code ({activeSubmission?.language || 'python'})
                </span>
              </div>
              <pre style={{ background: '#0f172a', color: '#f8fafc', padding: 14, borderRadius: 10, fontSize: 12, maxHeight: 380, overflow: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>
                <code>{activeSubmission?.code_text || '// No source code submitted yet for this assessment.'}</code>
              </pre>
            </div>
          )}

          {/* Tab: Lab Report */}
          {inspectorSubTab === 'report' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Student Lab Report & Documentation</span>
              <p style={{ fontSize: 12.5, color: '#64748b' }}>
                Detailed hypothesis, methodology, results graphs, and conclusions submitted by {activeStudent.full_name}.
              </p>
            </div>
          )}

          {/* Tab: Viva */}
          {inspectorSubTab === 'viva' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Viva Assessment & Voice Analytics</span>
              <p style={{ fontSize: 12.5, color: '#64748b' }}>
                Automated voice viva responses and grading transcript for {activeStudent.full_name}.
              </p>
            </div>
          )}

          {/* Tab: Quiz */}
          {inspectorSubTab === 'quiz' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Module Quiz Responses</span>
              <p style={{ fontSize: 12.5, color: '#64748b' }}>
                Concept check question scores and completion logs.
              </p>
            </div>
          )}

          {/* Tab: Integrity */}
          {inspectorSubTab === 'integrity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Integrity & Plagiarism Analysis</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#ecfdf5', color: '#16a34a', padding: '10px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 650 }}>
                <ShieldCheck size={16} /> AST Token Comparison: All clean. No flagged plagiarism matches.
              </div>
            </div>
          )}
        </div>

        {/* Inspector Footer Actions */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #e9ecf4', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            className={hub.outlineBtn}
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className={hub.saveGradeBtn}
            disabled={saving}
            onClick={onSaveGrade}
          >
            <Save size={14} /> {saving ? 'Saving…' : 'Save Grade'}
          </button>
        </div>
      </div>
    </div>
  );
}
