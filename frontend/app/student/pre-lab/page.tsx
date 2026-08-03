'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import styles from './page.module.css';

const PRELABS = [
  {
    id: 'exp-001',
    title: 'Thermodynamics: Heat Transfer Experiment',
    subject: 'Physics',
    sessionDate: 'Aug 2, 2026 · 10:00 AM',
    theory: 'Heat transfer occurs through three mechanisms: conduction, convection, and radiation. In conduction, heat moves through solid materials via molecular collision. In convection, heat moves through fluid motion. Radiation involves electromagnetic waves that carry thermal energy.',
    videoUrl: '#',
    steps: [
      { id: 1, label: 'Read Theory', done: true },
      { id: 2, label: 'Watch Video', done: true },
      { id: 3, label: 'Open Virtual Lab', done: false },
      { id: 4, label: 'Run Interactive Code', done: false },
      { id: 5, label: 'Take Quiz', done: false },
      { id: 6, label: 'Unlock Session', done: false },
    ],
    quiz: [
      { q: 'Which heat transfer mechanism does NOT require a medium?', opts: ['Conduction', 'Convection', 'Radiation', 'Advection'], ans: 2 },
      { q: 'What is the SI unit of thermal conductivity?', opts: ['W/m·K', 'J/kg', 'kJ/mol', 'Pa·s'], ans: 0 },
      { q: 'In convection, heat is transferred by:', opts: ['Molecular vibration', 'Fluid motion', 'Electromagnetic waves', 'Chemical bonds'], ans: 1 },
    ],
    threshold: 2,
    color: 'linear-gradient(135deg,#f97316,#ef4444)',
    progress: 33,
    status: 'in-progress',
  },
  {
    id: 'exp-002',
    title: 'Data Structures: Stack Implementation',
    subject: 'CS',
    sessionDate: 'Aug 5, 2026 · 02:00 PM',
    theory: 'A Stack is a linear data structure following LIFO (Last In, First Out) principle. The main operations are: push() - adds element to top, pop() - removes element from top, peek() - returns top element without removing it.',
    videoUrl: '#',
    steps: [
      { id: 1, label: 'Read Theory', done: false },
      { id: 2, label: 'Watch Video', done: false },
      { id: 3, label: 'Open Virtual Lab', done: false },
      { id: 4, label: 'Run Interactive Code', done: false },
      { id: 5, label: 'Take Quiz', done: false },
      { id: 6, label: 'Unlock Session', done: false },
    ],
    quiz: [
      { q: 'Which principle does a Stack follow?', opts: ['FIFO', 'LIFO', 'FILO', 'LILO'], ans: 1 },
      { q: 'What does the peek() operation do?', opts: ['Removes top element', 'Adds element', 'Returns top without removing', 'Clears stack'], ans: 2 },
      { q: 'Time complexity of push() in a stack?', opts: ['O(n)', 'O(log n)', 'O(1)', 'O(n²)'], ans: 2 },
    ],
    threshold: 2,
    color: '#6366f1',
    progress: 0,
    status: 'pending',
  },
  {
    id: 'exp-003',
    title: 'Organic Chemistry: Titration Lab',
    subject: 'Chemistry',
    sessionDate: 'Aug 8, 2026 · 11:00 AM',
    theory: 'Titration is a quantitative chemical analysis technique to determine the concentration of an unknown solution (analyte) using a standard solution (titrant) of known concentration. The equivalence point is indicated by a color change using an indicator.',
    videoUrl: '#',
    steps: [
      { id: 1, label: 'Read Theory', done: true },
      { id: 2, label: 'Watch Video', done: true },
      { id: 3, label: 'Open Virtual Lab', done: true },
      { id: 4, label: 'Run Interactive Code', done: true },
      { id: 5, label: 'Take Quiz', done: true },
      { id: 6, label: 'Unlock Session', done: true },
    ],
    quiz: [],
    threshold: 2,
    color: 'linear-gradient(135deg,#22c55e,#16a34a)',
    progress: 100,
    status: 'unlocked',
  },
];

export default function PreLabPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<'theory' | 'video' | 'code' | 'quiz'>('theory');
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [codeValue, setCodeValue] = useState(`# Heat Transfer Example
def conduction_rate(k, A, dT, dx):
    """
    Calculate heat transfer rate via conduction (Fourier's Law)
    k  = thermal conductivity (W/m·K)
    A  = cross-sectional area (m²)
    dT = temperature difference (K)
    dx = thickness (m)
    """
    return k * A * dT / dx

# Example: Copper rod
k = 385      # W/m·K for copper
A = 0.01     # 0.01 m² area
dT = 100     # 100K temperature difference
dx = 0.5     # 0.5 m thick

rate = conduction_rate(k, A, dT, dx)
print(f"Heat Transfer Rate: {rate:.2f} W")
`);
  const [output, setOutput] = useState('');
  const [running, setRunning] = useState(false);

  const exp = PRELABS.find(e => e.id === selected);

  const runCode = () => {
    setRunning(true);
    setOutput('');
    setTimeout(() => {
      const lines = codeValue.split('\n');
      const printLines = lines.filter(l => l.trim().startsWith('print('));
      let out = '';
      // Simulate the specific output
      if (codeValue.includes('conduction_rate')) {
        out = 'Heat Transfer Rate: 770.00 W\n\n✅ Code executed successfully in 0.12s';
      } else if (codeValue.includes('def ')) {
        out = '✅ Function defined successfully.\n>>> Output: See console below.\n\n✅ Code executed in 0.08s';
      } else {
        out = printLines.map(l => l.replace(/print\(f?["'](.+?)["']\)/, '$1')
          .replace(/\{rate:.2f\}/, '770.00')).join('\n') || '✅ Code executed successfully in 0.10s';
      }
      setOutput(out);
      setRunning(false);
    }, 1200);
  };

  const submitQuiz = () => {
    setQuizSubmitted(true);
  };

  const getScore = () => {
    if (!exp) return 0;
    return exp.quiz.filter((q, i) => quizAnswers[i] === q.ans).length;
  };

  const passed = exp ? getScore() >= exp.threshold : false;

  return (
    <StudentShell activePage="Pre-Lab" title="Pre-Lab Activities" subtitle="Complete theory, video and quiz to unlock your live lab session">
      <div className={styles.layout}>

        {/* ── Experiment List ── */}
        <div className={styles.expList}>
          {PRELABS.map(e => (
            <div
              key={e.id}
              className={`${styles.expCard} ${selected === e.id ? styles.expCardActive : ''}`}
              onClick={() => { setSelected(e.id); setTab('theory'); setQuizSubmitted(false); setQuizAnswers({}); }}
            >
              <div className={styles.expCardTop}>
                <div className={styles.expDot} style={{ background: e.color }} />
                <span className={`${styles.statusBadge} ${
                  e.status === 'unlocked' ? styles.badgeGreen :
                  e.status === 'in-progress' ? styles.badgeBlue : styles.badgeGray}`}>
                  {e.status === 'unlocked' ? '✓ Unlocked' : e.status === 'in-progress' ? '⟳ In Progress' : '○ Pending'}
                </span>
              </div>
              <p className={styles.expTitle}>{e.title}</p>
              <p className={styles.expMeta}>{e.subject} · {e.sessionDate}</p>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${e.progress}%`, background: e.color }} />
              </div>
              <p className={styles.progressPct}>{e.progress}% complete</p>

              {/* Steps */}
              <div className={styles.stepsRow}>
                {e.steps.map(s => (
                  <div key={s.id} className={`${styles.stepDot} ${s.done ? styles.stepDone : ''}`} title={s.label}>
                    {s.done ? '✓' : s.id}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Experiment Detail ── */}
        {exp ? (
          <div className={styles.detailPanel}>
            <div className={styles.detailHeader}>
              <div>
                <h2 className={styles.detailTitle}>{exp.title}</h2>
                <p className={styles.detailMeta}>🗓 Session: {exp.sessionDate}</p>
              </div>
              {exp.status === 'unlocked' && (
                <button className={styles.joinBtn} onClick={() => router.push('/student/live-lab')}>
                  🚀 Join Live Lab
                </button>
              )}
            </div>

            {/* Tabs */}
            <div className={styles.tabs}>
              {(['theory', 'video', 'code', 'quiz'] as const).map(t => (
                <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
                  {t === 'theory' ? '📖 Theory' : t === 'video' ? '🎬 Video' : t === 'code' ? '💻 Code' : '📝 Quiz'}
                </button>
              ))}
            </div>

            <div className={styles.tabContent}>
              {tab === 'theory' && (
                <div className={styles.theoryBox}>
                  <h3 className={styles.theoryHeading}>📚 Theory</h3>
                  <p className={styles.theoryText}>{exp.theory}</p>
                  <div className={styles.theoryCards}>
                    <div className={styles.theoryCard} style={{ borderLeft: '4px solid #8b5cf6' }}>
                      <strong>Key Concept</strong>
                      <p>Understanding the core principles is essential before the lab session begins.</p>
                    </div>
                    <div className={styles.theoryCard} style={{ borderLeft: '4px solid #22c55e' }}>
                      <strong>Objective</strong>
                      <p>Apply theoretical knowledge through hands-on virtual experiments and interactive code.</p>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'video' && (
                <div className={styles.videoBox}>
                  <div className={styles.videoPlayer}>
                    <div className={styles.videoInner}>
                      <div className={styles.videoPlayBtn}>▶</div>
                      <p className={styles.videoLabel}>Pre-Lab Instructional Video</p>
                      <p className={styles.videoSub}>{exp.title}</p>
                    </div>
                  </div>
                  <p className={styles.videoCaption}>Watch the full instructional video before attempting the quiz. Duration: ~8 minutes.</p>
                </div>
              )}

              {tab === 'code' && (
                <div className={styles.codeBox}>
                  <div className={styles.editorHeader}>
                    <span className={styles.editorTitle}>💻 Interactive Code Environment</span>
                    <div className={styles.editorDots}>
                      <span style={{ background: '#ef4444' }} />
                      <span style={{ background: '#f59e0b' }} />
                      <span style={{ background: '#22c55e' }} />
                    </div>
                  </div>
                  <textarea
                    className={styles.codeEditor}
                    value={codeValue}
                    onChange={e => setCodeValue(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                  />
                  <div className={styles.editorActions}>
                    <button className={styles.runBtn} onClick={runCode} disabled={running}>
                      {running ? <span className={styles.runSpinner} /> : '▶'} {running ? 'Running...' : 'Run Code'}
                    </button>
                    <button className={styles.clearBtn} onClick={() => setOutput('')}>Clear Output</button>
                  </div>
                  {(output || running) && (
                    <div className={styles.outputBox}>
                      <p className={styles.outputLabel}>Output</p>
                      <pre className={styles.outputPre}>{running ? 'Executing...' : output}</pre>
                    </div>
                  )}
                </div>
              )}

              {tab === 'quiz' && (
                <div className={styles.quizBox}>
                  {exp.status === 'unlocked' ? (
                    <div className={styles.unlockedMsg}>
                      <div className={styles.unlockedIcon}>🎉</div>
                      <h3>Session Already Unlocked!</h3>
                      <p>You have completed all pre-lab requirements. Join your live lab session.</p>
                      <button className={styles.joinBtn} onClick={() => router.push('/student/live-lab')}>
                        🚀 Join Live Lab Session
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className={styles.quizHeader}>
                        <h3 className={styles.quizTitle}>📝 Knowledge Check</h3>
                        <span className={styles.quizThreshold}>Pass threshold: {exp.threshold}/{exp.quiz.length}</span>
                      </div>
                      {exp.quiz.map((q, qi) => (
                        <div key={qi} className={styles.question}>
                          <p className={styles.questionText}>Q{qi + 1}. {q.q}</p>
                          <div className={styles.options}>
                            {q.opts.map((opt, oi) => (
                              <button
                                key={oi}
                                disabled={quizSubmitted}
                                className={`${styles.optBtn} ${quizAnswers[qi] === oi ? styles.optSelected : ''}
                                  ${quizSubmitted && oi === q.ans ? styles.optCorrect : ''}
                                  ${quizSubmitted && quizAnswers[qi] === oi && oi !== q.ans ? styles.optWrong : ''}`}
                                onClick={() => !quizSubmitted && setQuizAnswers(a => ({ ...a, [qi]: oi }))}
                              >
                                <span className={styles.optLetter}>{String.fromCharCode(65 + oi)}</span>
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {!quizSubmitted ? (
                        <button
                          className={styles.submitBtn}
                          disabled={Object.keys(quizAnswers).length < exp.quiz.length}
                          onClick={submitQuiz}
                        >
                          Submit Quiz
                        </button>
                      ) : (
                        <div className={`${styles.quizResult} ${passed ? styles.quizPass : styles.quizFail}`}>
                          {passed ? (
                            <>
                              <div className={styles.resultIcon}>🎉</div>
                              <h3>Passed! Score: {getScore()}/{exp.quiz.length}</h3>
                              <p>Congratulations! Your lab session is now unlocked.</p>
                              <button className={styles.joinBtn} onClick={() => router.push('/student/live-lab')}>
                                🚀 Join Live Lab Session
                              </button>
                            </>
                          ) : (
                            <>
                              <div className={styles.resultIcon}>😕</div>
                              <h3>Score: {getScore()}/{exp.quiz.length} — Try Again</h3>
                              <p>You need at least {exp.threshold} correct answers. Review the theory and retry.</p>
                              <button className={styles.retryBtn} onClick={() => { setQuizAnswers({}); setQuizSubmitted(false); setTab('theory'); }}>
                                🔄 Review & Retry
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className={styles.placeholder}>
            <div className={styles.placeholderIcon}>🧪</div>
            <h3 className={styles.placeholderTitle}>Select a Pre-Lab</h3>
            <p className={styles.placeholderSub}>Choose an experiment from the list to start your pre-lab preparation</p>
          </div>
        )}
      </div>
    </StudentShell>
  );
}
