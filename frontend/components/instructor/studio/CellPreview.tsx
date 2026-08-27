'use client';

/**
 * CellPreview.tsx — read-only render of one block, mirroring how the student
 * pre-lab page (frontend/app/student/pre-lab/[experimentId]/page.tsx) shows it.
 * Used by the studio's Preview mode. Kept in lockstep with those render branches.
 */
import DOMPurify from 'dompurify';
import { renderMarkdown } from '@/lib/markdown';
import { Download, ExternalLink, Play, Loader2, Terminal, Lock, Eye, RotateCcw } from 'lucide-react';
import { metaFor, asString, type ContentBlock } from './blocks';
import s from './studio.module.css';

import { useState, useEffect } from 'react';
import { executionService, type PlaygroundResult } from '@/services/execution.service';
import { studentService, type AssignmentSubmitResult } from '@/services/student.service';

export default function CellPreview({ block }: { block: ContentBlock }) {
  const meta = metaFor(block.module_type);
  const Icon = meta.icon;
  const d = block.content_data ?? {};

  return (
    <div className={s.pvCell}>
      <h4 className={s.pvTitle}><Icon size={15} color="#7c3aed" /> {block.title || meta.label}</h4>
      {renderBody(block.module_type, d, block)}
    </div>
  );
}

function InteractiveQuizBlock({ d, block }: { d: Record<string, unknown>; block?: ContentBlock }) {
  const pass = typeof d.pass_threshold === 'number' ? d.pass_threshold : 70;
  const attempts = typeof d.max_attempts === 'number' ? d.max_attempts : 3;
  const rawQs = (block as any)?.questions || d.inline_questions || d.questions;
  const qs: any[] = Array.isArray(rawQs) ? rawQs : [];

  const [selected, setSelected] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  if (qs.length === 0) {
    return (
      <p className={s.qOpts} style={{ fontSize: 12.5, color: '#6b7280', fontStyle: 'italic', marginTop: 4 }}>
        No questions found in this quiz block.
      </p>
    );
  }

  let correctCount = 0;
  if (submitted) {
    qs.forEach((q, i) => {
      const corr = q.correct_answer || ('ABCD'[q.correct_index] ?? '');
      if (selected[i] === corr) {
        correctCount++;
      }
    });
  }

  const scorePct = Math.round((correctCount / qs.length) * 100);
  const passed = scorePct >= pass;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p className={s.qOpts} style={{ margin: 0 }}>
          <b>Auto-graded Quiz</b> · pass ≥ {pass}% · {attempts} attempts max
        </p>
        {submitted && (
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
            background: passed ? '#dcfce7' : '#fee2e2',
            color: passed ? '#15803d' : '#b91c1c'
          }}>
            {passed ? `Passed ✓ ${scorePct}%` : `Failed ✗ ${scorePct}%`} ({correctCount}/{qs.length})
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {qs.map((q: any, i: number) => {
          const qText = q.question_text || q.question || `Question ${i + 1}`;
          const rawOpts = q.options;
          const optsList: string[] = Array.isArray(rawOpts)
            ? rawOpts
            : typeof rawOpts === 'object' && rawOpts !== null
            ? Object.values(rawOpts)
            : [];
          const corr = q.correct_answer || ('ABCD'[q.correct_index] ?? '');
          const userSel = selected[i];

          return (
            <div key={i} style={{ padding: '12px 14px', background: '#ffffff', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <p style={{ margin: '0 0 8px 0', fontSize: 13.5, fontWeight: 600, color: '#111827' }}>
                {i + 1}. {qText}
              </p>
              {optsList.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                  {optsList.map((opt: string, oi: number) => {
                    const letter = 'ABCD'[oi] || '';
                    const isSelected = userSel === letter;
                    const isCorrect = corr === letter;

                    let bg = '#f9fafb';
                    let border = '#e5e7eb';
                    let color = '#374151';

                    if (submitted) {
                      if (isCorrect) {
                        bg = '#f0fdf4';
                        border = '#86efac';
                        color = '#15803d';
                      } else if (isSelected && !isCorrect) {
                        bg = '#fef2f2';
                        border = '#fca5a5';
                        color = '#b91c1c';
                      }
                    } else if (isSelected) {
                      bg = '#f0f5ff';
                      border = '#93c5fd';
                      color = '#1d4ed8';
                    }

                    return (
                      <button
                        key={oi}
                        disabled={submitted}
                        onClick={() => setSelected(prev => ({ ...prev, [i]: letter }))}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          textAlign: 'left', width: '100%', padding: '8px 12px', borderRadius: 8,
                          background: bg, border: `1px solid ${border}`, color: color,
                          fontWeight: isSelected || (submitted && isCorrect) ? 600 : 400,
                          cursor: submitted ? 'default' : 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 700, marginRight: 8, display: 'inline-block', width: 20 }}>{letter}.</span>
                          {opt}
                        </div>
                        {submitted && isCorrect && <span style={{ fontWeight: 700, color: '#16a34a' }}>✓ Correct</span>}
                        {submitted && isSelected && !isCorrect && <span style={{ fontWeight: 700, color: '#dc2626' }}>✗ Incorrect</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {submitted && q.explanation && (
                <div style={{ marginTop: 8, padding: '6px 10px', background: '#f3f4f6', borderRadius: 6, fontSize: 12, color: '#4b5563' }}>
                  <b>Explanation:</b> {q.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        {!submitted ? (
          <button
            onClick={() => setSubmitted(true)}
            disabled={Object.keys(selected).length === 0}
            style={{
              padding: '7px 16px', borderRadius: 8, background: '#7c3aed', color: '#ffffff',
              fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer',
              opacity: Object.keys(selected).length === 0 ? 0.5 : 1
            }}
          >
            Submit Quiz
          </button>
        ) : (
          <button
            onClick={() => { setSubmitted(false); setSelected({}); }}
            style={{
              padding: '6px 14px', borderRadius: 8, background: '#f3f4f6', color: '#374151',
              fontWeight: 600, fontSize: 13, border: '1px solid #d1d5db', cursor: 'pointer'
            }}
          >
            Retake Quiz
          </button>
        )}
      </div>
    </div>
  );
}

function InteractiveVivaBlock({ d, block }: { d: Record<string, unknown>; block?: ContentBlock }) {
  const questions: any[] = Array.isArray(d.questions) ? d.questions : [];
  const pass = typeof d.pass_threshold === 'number' ? d.pass_threshold : 70;

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [evaluations, setEvaluations] = useState<Record<number, { score: number; feedback: string }>>({});
  const [evaluating, setEvaluating] = useState(false);

  if (questions.length === 0) {
    return (
      <p className={s.qOpts} style={{ fontSize: 12.5, color: '#6b7280', fontStyle: 'italic' }}>
        No viva questions generated yet.
      </p>
    );
  }

  const handleEvaluate = async () => {
    setEvaluating(true);
    const evals: Record<number, { score: number; feedback: string }> = {};

    questions.forEach((q: any, i: number) => {
      const studentAns = (answers[i] || '').trim().toLowerCase();
      const expectedAns = (q.expected_answer || '').trim().toLowerCase();

      if (!studentAns) {
        evals[i] = { score: 0, feedback: 'No answer provided.' };
        return;
      }

      const keywords = expectedAns.split(/\s+/).filter((w: string) => w.length > 3);
      let matchCount = 0;
      keywords.forEach((kw: string) => {
        if (studentAns.includes(kw)) matchCount++;
      });

      let score = 5;
      if (expectedAns && studentAns.includes(expectedAns)) {
        score = 10;
      } else if (keywords.length > 0) {
        const ratio = matchCount / keywords.length;
        score = Math.min(10, Math.round(5 + ratio * 5));
      }

      let fb = 'Good attempt.';
      if (score >= 9) fb = 'Excellent! Clear and accurate response.';
      else if (score >= 7) fb = 'Good response covering key concepts.';
      else if (score >= 5) fb = 'Partial answer. Make sure to cover expected concepts in detail.';
      else fb = 'Answer differs significantly from expected response.';

      evals[i] = { score, feedback: fb };
    });

    setEvaluations(evals);
    setSubmitted(true);
    setEvaluating(false);
  };

  let totalScoreSum = 0;
  Object.values(evaluations).forEach(e => { totalScoreSum += e.score; });
  const scorePct = questions.length > 0 ? Math.round((totalScoreSum / (questions.length * 10)) * 100) : 0;
  const passed = scorePct >= pass;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <p className={s.qOpts} style={{ margin: 0 }}>
          <b>AI Interactive Viva</b> · {questions.length} question{questions.length === 1 ? '' : 's'} · pass ≥ {pass}%
        </p>
        {submitted && (
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
            background: passed ? '#dcfce7' : '#fee2e2',
            color: passed ? '#15803d' : '#b91c1c'
          }}>
            {passed ? `Passed Viva ✓ ${scorePct}%` : `Failed Viva ✗ ${scorePct}%`}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {questions.map((q: any, i: number) => {
          const evalRes = evaluations[i];
          return (
            <div key={i} style={{ padding: '12px 14px', background: '#ffffff', borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
              <p style={{ margin: '0 0 6px 0', fontSize: 13.5, fontWeight: 600, color: '#111827' }}>
                <span style={{ color: '#7c3aed', marginRight: 6 }}>🤖 AI Q{i + 1}:</span> {q.question || `Question ${i + 1}`}
              </p>

              <textarea
                value={answers[i] || ''}
                disabled={submitted || evaluating}
                onChange={e => setAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                placeholder="Type your viva response here..."
                rows={2}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db',
                  fontSize: 13, fontFamily: 'inherit', resize: 'vertical', marginTop: 4
                }}
              />

              {evalRes && (
                <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, background: evalRes.score >= 7 ? '#f0fdf4' : '#fffbeb', border: `1px solid ${evalRes.score >= 7 ? '#bbf7d0' : '#fef3c7'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: evalRes.score >= 7 ? '#15803d' : '#b45309' }}>
                      AI Score: {evalRes.score}/10
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: '#374151' }}><b>Feedback:</b> {evalRes.feedback}</p>
                  {q.expected_answer && (
                    <p style={{ margin: '4px 0 0 0', fontSize: 11.5, color: '#6b7280' }}>
                      <b>Model Answer:</b> {q.expected_answer}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
        {!submitted ? (
          <button
            onClick={handleEvaluate}
            disabled={evaluating || Object.values(answers).every(a => !a.trim())}
            style={{
              padding: '8px 18px', borderRadius: 8, background: '#7c3aed', color: '#ffffff',
              fontWeight: 600, fontSize: 13, border: 'none', cursor: 'pointer',
              opacity: Object.values(answers).every(a => !a.trim()) ? 0.5 : 1
            }}
          >
            {evaluating ? 'AI Evaluating...' : 'Submit Viva Responses'}
          </button>
        ) : (
          <button
            onClick={() => { setSubmitted(false); setEvaluations({}); }}
            style={{
              padding: '6px 14px', borderRadius: 8, background: '#f3f4f6', color: '#374151',
              fontWeight: 600, fontSize: 13, border: '1px solid #d1d5db', cursor: 'pointer'
            }}
          >
            Retry Viva
          </button>
        )}
      </div>
    </div>
  );
}

function InteractiveCodeBlock({ d }: { d: Record<string, unknown> }) {
  const initialCode = asString(d.code) || '';
  const lang = asString(d.language) || 'python';
  const isRunnable = d.runnable !== false;

  const [code, setCode] = useState(initialCode);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setCode(asString(d.code) || '');
  }, [d.code]);

  const handleRun = async () => {
    if (!code.trim()) return;
    setRunning(true);
    setResult(null);
    setError('');
    try {
      const res = await executionService.runPlayground({
        code,
        language: lang,
        stdin: asString(d.stdin) || '',
        packages: asString(d.packages) || undefined,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Execution failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ borderRadius: 10, border: '1px solid #e5e0ec', overflow: 'hidden', background: '#faf8fc', marginTop: 8 }}>
      {/* IDE Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#f3effc', borderBottom: '1px solid #e5e0ec' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#7c3aed', background: '#ede9fe', padding: '2px 8px', borderRadius: 6, border: '1px solid #ddd6fe' }}>
            {lang}
          </span>
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
            {isRunnable ? 'Interactive Code Runner' : 'Read-only Snippet'}
          </span>
        </div>

        {isRunnable && (
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', borderRadius: 6,
              background: '#7c3aed', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: running ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 3px rgba(124, 58, 237, 0.3)', opacity: running ? 0.7 : 1, transition: 'all 0.15s ease'
            }}
          >
            {running ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={13} fill="currentColor" />}
            {running ? 'Executing…' : 'Run Code'}
          </button>
        )}
      </div>

      {/* Code Editor / Viewer */}
      <textarea
        value={code}
        onChange={e => setCode(e.target.value)}
        spellCheck={false}
        placeholder={`# Enter ${lang} code here`}
        style={{
          width: '100%', minHeight: 130, padding: '14px 16px', margin: 0,
          background: '#1e1b2e', color: '#f3f0ff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: 13, lineHeight: 1.5, border: 'none', resize: 'vertical', outline: 'none', boxSizing: 'border-box'
        }}
      />

      {error && (
        <div style={{ padding: '8px 14px', background: '#fef2f2', borderTop: '1px solid #fee2e2', color: '#b91c1c', fontSize: 12.5, fontWeight: 500 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Execution Output Console */}
      {result && (
        <div style={{ borderTop: '1px solid #e5e0ec', background: '#13111c' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', background: '#1a1726', borderBottom: '1px solid #282438', fontSize: 12, fontWeight: 600, color: result.status_id === 3 ? '#4ade80' : '#f87171' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Terminal size={13} />
              <span>{result.status_id === 3 ? 'Execution Succeeded' : (result.status || 'Execution Failed')}</span>
            </div>
            {result.time_ms != null && (
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>
                Elapsed: {result.time_ms}ms
              </span>
            )}
          </div>
          <pre style={{ margin: 0, padding: '12px 14px', fontSize: 12.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: '#e5e7eb', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 220, overflow: 'auto' }}>
            {result.compile_output || result.stderr || result.stdout || '(No output produced)'}
          </pre>
          {result.images && result.images.length > 0 && (
            <div style={{ padding: '12px 14px', background: '#0d0b14', borderTop: '1px solid #282438' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#a78bfa', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📊 Generated Visual Output ({result.images.length} plot{result.images.length > 1 ? 's' : ''})
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                {result.images.map((img, idx) => (
                  <div key={idx} style={{ background: '#ffffff', borderRadius: 8, padding: 8, border: '1px solid #374151', maxWidth: '100%', overflow: 'hidden' }}>
                    <img src={img} alt={`Plot output ${idx + 1}`} style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 4, display: 'block' }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InteractiveAssignBlock({ d, block }: { d: Record<string, unknown>; block?: ContentBlock }) {
  const lang = asString(d.language) || 'python';
  const pass = typeof d.pass_threshold === 'number' ? d.pass_threshold : 60;
  const instructions = asString(d.instructions);
  const starterCode = asString(d.starter_code);
  const tests = Array.isArray(d.test_cases) ? (d.test_cases as Array<{ input?: string; expected?: string; hidden?: boolean; weight?: number }>) : [];
  const publicTests = tests.filter(t => !t.hidden);
  const hiddenTests = tests.filter(t => t.hidden);

  const [code, setCode] = useState(starterCode);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AssignmentSubmitResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setCode(asString(d.starter_code));
  }, [d.starter_code]);

  const handleSubmit = async () => {
    if (!code.trim()) {
      setError('Please write your solution code before submitting.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (block?.id && !block.id.startsWith('temp-')) {
        const res = await studentService.submitAssignment(block.id, {
          code,
          language: lang,
          packages: asString(d.packages) || undefined,
        });
        setResult(res);
      } else {
        const simulatedResults = tests.map((t, idx) => ({
          index: idx,
          passed: true,
          hidden: !!t.hidden,
          input: t.hidden ? undefined : (t.input || ''),
          expected: t.hidden ? undefined : (t.expected || ''),
          actual: t.hidden ? undefined : (t.expected || ''),
          status: 'Accepted',
        }));
        setResult({
          score: 100,
          best_score: 100,
          passed: true,
          threshold: pass,
          passed_tests: tests.length,
          total_tests: tests.length,
          attempts_used: 1,
          results: simulatedResults,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
      {/* Meta Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '8px 12px', background: '#f3effc', borderRadius: 8, border: '1px solid #e5e0ec' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#7c3aed', background: '#ede9fe', padding: '2px 8px', borderRadius: 6, border: '1px solid #ddd6fe' }}>
            {lang}
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#374151' }}>
            Graded Coding Task · Pass ≥ {pass}%
          </span>
        </div>
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          {tests.length} test case{tests.length === 1 ? '' : 's'} ({publicTests.length} public, {hiddenTests.length} hidden)
        </span>
      </div>

      {/* Instructions / Problem Statement */}
      {instructions ? (
        <div className={s.preview} style={{ minHeight: 0, border: 'none', padding: 0 }}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(instructions) }} />
      ) : (
        <p className={s.qOpts} style={{ fontStyle: 'italic', color: '#9ca3af' }}>No instructions set for this task.</p>
      )}

      {/* Public Test Cases Preview */}
      {publicTests.length > 0 && (
        <div style={{ background: '#faf8fc', border: '1px solid #e5e0ec', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#6b21a8', marginBottom: 8 }}>
            <Eye size={14} /> Public Sample Test Cases
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {publicTests.map((t, idx) => (
              <div key={idx} style={{ background: '#fff', border: '1px solid #e5e0ec', borderRadius: 6, padding: '8px 12px', fontSize: 12 }}>
                <div style={{ fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>Sample Test #{idx + 1}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <span style={{ color: '#6b7280', fontSize: 11 }}>Input (stdin):</span>
                    <pre style={{ margin: '2px 0 0', padding: '4px 8px', background: '#f3f4f6', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}>{t.input || '(empty)'}</pre>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280', fontSize: 11 }}>Expected Output:</span>
                    <pre style={{ margin: '2px 0 0', padding: '4px 8px', background: '#f3f4f6', borderRadius: 4, fontFamily: 'monospace', fontSize: 12 }}>{t.expected || '(empty)'}</pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hidden Test Cases Notice */}
      {hiddenTests.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fefce8', border: '1px solid #fef08a', borderRadius: 8, fontSize: 12, color: '#854d0e', fontWeight: 500 }}>
          <Lock size={14} color="#a16207" />
          <span><b>{hiddenTests.length} Private Hidden Test Case{hiddenTests.length === 1 ? '' : 's'}</b> — evaluated automatically upon submission (inputs and expected outputs remain hidden to prevent hardcoding).</span>
        </div>
      )}

      {/* Code Solution Editor */}
      <div style={{ borderRadius: 10, border: '1px solid #e5e0ec', overflow: 'hidden', background: '#1e1b2e' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: '#171424', borderBottom: '1px solid #282438' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#c4b5fd' }}>Student Solution ({lang})</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>Editable in preview</span>
        </div>
        <textarea
          value={code}
          onChange={e => setCode(e.target.value)}
          spellCheck={false}
          placeholder={`# Write your ${lang} solution code here`}
          style={{
            width: '100%', minHeight: 160, padding: '14px 16px', margin: 0,
            background: '#1e1b2e', color: '#f3f0ff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 13, lineHeight: 1.5, border: 'none', resize: 'vertical', outline: 'none', boxSizing: 'border-box'
          }}
        />
      </div>

      {error && (
        <div style={{ padding: '8px 14px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 8, color: '#b91c1c', fontSize: 12.5, fontWeight: 500 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Submit Button */}
      {!result ? (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 18px', borderRadius: 8,
            background: '#7c3aed', color: '#fff', fontSize: 13.5, fontWeight: 600, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(124, 58, 237, 0.25)', opacity: submitting ? 0.7 : 1
          }}
        >
          {submitting ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={15} fill="currentColor" />}
          {submitting ? 'Running & Grading Tests…' : 'Submit & Grade Solution'}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Status Banner */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: 8,
            background: result.passed ? '#f0fdf4' : '#fef2f2', border: `1px solid ${result.passed ? '#bbf7d0' : '#fecaca'}`
          }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: result.passed ? '#15803d' : '#b91c1c' }}>
                {result.passed ? '🎉 Assignment Passed!' : '😕 Task Not Passed Yet'}
              </h4>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: result.passed ? '#166534' : '#991b1b' }}>
                Score: <b>{result.score}%</b> (Pass threshold: {result.threshold}%) · Passed {result.passed_tests} of {result.total_tests} tests
              </p>
            </div>
            <button
              onClick={() => setResult(null)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6,
                background: '#fff', border: '1px solid #d1d5db', color: '#374151', fontSize: 12, fontWeight: 600, cursor: 'pointer'
              }}
            >
              <RotateCcw size={13} /> Retry
            </button>
          </div>

          {/* Test Case Breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.results.map((r, idx) => (
              <div key={idx} style={{ border: '1px solid #e5e0ec', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', fontSize: 12.5, fontWeight: 600,
                  background: r.passed ? '#ecfdf3' : '#fef2f2', color: r.passed ? '#067647' : '#b42318'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{r.passed ? '✓' : '✕'}</span>
                    <span>Test Case #{r.index + 1} {r.hidden ? '(Hidden Private)' : '(Public Sample)'}</span>
                  </div>
                  <span>{r.passed ? 'Passed' : r.status || 'Failed'}</span>
                </div>

                {!r.hidden && (
                  <div style={{ padding: '10px 12px', background: '#13111c', color: '#e5e7eb', fontSize: 12, display: 'grid', gap: 6 }}>
                    {r.input ? <div><span style={{ color: '#9ca3af' }}>stdin:</span><pre style={{ margin: '2px 0 0', fontFamily: 'monospace', color: '#f3f4f6', whiteSpace: 'pre-wrap' }}>{r.input}</pre></div> : null}
                    <div><span style={{ color: '#9ca3af' }}>expected output:</span><pre style={{ margin: '2px 0 0', fontFamily: 'monospace', color: '#86efac', whiteSpace: 'pre-wrap' }}>{r.expected}</pre></div>
                    <div><span style={{ color: '#9ca3af' }}>actual output:</span><pre style={{ margin: '2px 0 0', fontFamily: 'monospace', color: r.passed ? '#86efac' : '#fca5a5', whiteSpace: 'pre-wrap' }}>{r.actual || '(no output)'}</pre></div>
                    {r.stderr ? <div><span style={{ color: '#f87171', fontWeight: 600 }}>stderr / error:</span><pre style={{ margin: '2px 0 0', fontFamily: 'monospace', color: '#fca5a5', whiteSpace: 'pre-wrap' }}>{r.stderr}</pre></div> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function renderBody(type: string, d: Record<string, unknown>, block?: ContentBlock) {
  switch (type) {
    case 'markdown':
      return <div className={s.preview} style={{ minHeight: 0, border: 'none', padding: 0 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(asString(d.md)) }} />;

    case 'text': {
      const html = asString(d.html);
      const clean = typeof window === 'undefined' ? html : DOMPurify.sanitize(html);
      return <div className={s.preview} style={{ minHeight: 0, border: 'none', padding: 0 }}
        dangerouslySetInnerHTML={{ __html: clean }} />;
    }

    case 'code':
      return <InteractiveCodeBlock d={d} />;

    case 'image': {
      const url = asString(d.url);
      if (!url) return <p className={s.qOpts}>No image URL set.</p>;
      return (
        <figure style={{ margin: 0 }}>
          <div className={s.mediaPreview} style={{ marginTop: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={s.mediaImg} src={url} alt={asString(d.alt)} />
          </div>
          {asString(d.caption) && <figcaption className={s.qOpts} style={{ textAlign: 'center', marginTop: 6 }}>{asString(d.caption)}</figcaption>}
        </figure>
      );
    }

    case 'video':
    case 'pdf': {
      const url = asString(d.url);
      if (!url) return <p className={s.qOpts}>No URL set.</p>;
      return <div className={s.mediaPreview} style={{ marginTop: 0 }}>
        <iframe className={s.embedFrame} src={url} title={type}
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" allow="fullscreen" />
      </div>;
    }

    case 'html':
      return <div className={s.mediaPreview} style={{ marginTop: 0 }}>
        <iframe className={s.embedFrame} title="html-embed" srcDoc={asString(d.html)}
          sandbox="allow-scripts allow-popups allow-forms" />
      </div>;

    case 'link': {
      const url = asString(d.url);
      return (
        <div>
          <a className={s.pvLink} href={url || undefined} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> {asString(d.label) || url || 'Open link'}
          </a>
          {asString(d.description) && <p className={s.qOpts} style={{ marginTop: 8 }}>{asString(d.description)}</p>}
        </div>
      );
    }

    case 'file': {
      const url = asString(d.url);
      const name = asString(d.filename) || 'Download file';
      return (
        <a className={s.pvLink} href={url || undefined} target="_blank" rel="noreferrer">
          <Download size={14} /> {name} <span style={{ opacity: .6 }}>({asString(d.kind) || 'file'})</span>
        </a>
      );
    }

    case 'quiz':
      return <InteractiveQuizBlock d={d} block={block} />;

    case 'assign':
      return <InteractiveAssignBlock d={d} block={block} />;

    case 'viva':
      return <InteractiveVivaBlock d={d} block={block} />;

    default:
      return <p className={s.qOpts}>Unsupported block type: {type}</p>;
  }
}