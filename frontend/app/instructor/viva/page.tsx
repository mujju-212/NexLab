'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare, Sparkles, CheckCircle2, Award, User, Code, Save, RefreshCw, Star
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

interface VivaQuestion {
  q: string;
  expectedConcept: string;
}

const SAMPLE_VIVA_QUESTIONS: Record<string, VivaQuestion[]> = {
  'Arjun Mehta': [
    { q: 'Why did you use an array list for stack implementation instead of a linked list?', expectedConcept: 'Dynamic array reallocation memory trade-off.' },
    { q: 'What is the time complexity of your pop() operation?', expectedConcept: 'O(1) amortized constant time complexity.' },
    { q: 'How does your code prevent an IndexError when popping an empty stack?', expectedConcept: 'is_empty() check before pop().' },
  ],
  'Priya Sharma': [
    { q: 'What occurs if pop() is called when the stack is empty in your code?', expectedConcept: 'IndexError handling or error boundary.' },
    { q: 'Explain how stack data structures are used in recursion and call stacks.', expectedConcept: 'Function call frame push/pop.' },
  ],
};

export default function VivaPage() {
  const router = useRouter();
  const [selectedStudent, setSelectedStudent] = useState<string>('Arjun Mehta');
  const [questions, setQuestions] = useState<VivaQuestion[]>(SAMPLE_VIVA_QUESTIONS['Arjun Mehta']);
  const [scores, setScores] = useState<Record<number, number>>({ 0: 5, 1: 5, 2: 4 });
  const [notes, setNotes] = useState<string>('Student demonstrated strong grasp of stack memory overhead and O(1) time complexity.');
  const [toast, setToast] = useState<string | null>(null);

  const handleSelectStudent = (name: string) => {
    setSelectedStudent(name);
    const qList = SAMPLE_VIVA_QUESTIONS[name] || SAMPLE_VIVA_QUESTIONS['Arjun Mehta'];
    setQuestions(qList);
  };

  const handleGenerateQuestions = () => {
    setToast('AI Groq microservice analyzed code AST & generated 3 new viva questions!');
    setTimeout(() => setToast(null), 4000);
  };

  const handleSaveViva = () => {
    setToast(`Viva score saved for ${selectedStudent}! Recorded to PostgreSQL student record.`);
    setTimeout(() => setToast(null), 4000);
  };

  return (
    <InstructorShell
      activePage="Viva"
      title="AI Viva Assistant & Oral Evaluation"
      subtitle="AI-assisted oral exam generator: Analyzes student submission code and generates targeted viva questions"
    >
      {/* Action Bar */}
      <div className={styles.actionRow}>
        <button type="button" className={styles.primaryBtn} onClick={handleGenerateQuestions}>
          <Sparkles size={16} strokeWidth={2} /> Generate AI Viva Questions
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/grading')}>
          <Code size={16} strokeWidth={1.9} /> Return to Post-Grading
        </button>
      </div>

      {toast && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#166534', fontSize: '13.5px', fontWeight: 600 }}>
          ✨ {toast}
        </div>
      )}

      <div className={styles.gridTwo}>
        {/* Student Selection List */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Oral Exam Candidates</h2>
              <p className={styles.sectionSub}>Submissions requiring oral viva verification.</p>
            </div>
          </div>

          <div className={styles.list}>
            {['Arjun Mehta (CS21001)', 'Priya Sharma (CS21002)', 'Rohan Gupta (CS21003)'].map((st) => {
              const name = st.split(' (')[0];
              const isSel = selectedStudent === name;
              return (
                <div
                  key={st}
                  className={`${styles.listRow} ${isSel ? styles.rowActive : ''}`}
                  style={{ cursor: 'pointer', borderLeft: isSel ? '4px solid #2563eb' : 'none' }}
                  onClick={() => handleSelectStudent(name)}
                >
                  <div className={styles.rowIcon} style={{ background: isSel ? '#dbeafe' : '#f1f5f9', color: isSel ? '#1d4ed8' : '#64748b' }}>
                    <User size={18} />
                  </div>
                  <div className={styles.rowBody}>
                    <p className={styles.rowTitle}>{st}</p>
                    <p className={styles.rowSub}>Stack Implementation Lab · Auto-score: 90%</p>
                  </div>
                  <span className={isSel ? styles.pillBlue : styles.pillSlate}>
                    {isSel ? 'Selected' : 'Select'}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* AI Question & Rating Panel */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Viva Evaluation Sheet: {selectedStudent}</h2>
              <p className={styles.sectionSub}>Targeted questions generated from submitted code logic</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
            {questions.map((q, idx) => (
              <div key={idx} style={{ background: '#ffffff', padding: '14px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.08)' }}>
                <p style={{ margin: '0 0 6px', fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                  Q{idx + 1}: {q.q}
                </p>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#64748b' }}>
                  💡 Expected Concept: <em>{q.expectedConcept}</em>
                </p>

                {/* Rating 1 - 5 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Answer Score:</span>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: (scores[idx] || 0) >= star ? '#f59e0b' : '#cbd5e1',
                        padding: '2px',
                      }}
                      onClick={() => setScores({ ...scores, [idx]: star })}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Instructor Viva Notes</label>
            <textarea
              className={styles.textarea}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button type="button" className={styles.primaryBtn} onClick={handleSaveViva}>
              <Save size={16} /> Save Viva Evaluation
            </button>
          </div>
        </section>
      </div>
    </InstructorShell>
  );
}
