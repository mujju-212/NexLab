'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2, ArrowLeft, CheckCircle2, XCircle, Trophy, Code2, HelpCircle, CalendarClock,
} from 'lucide-react';
import StudentShell from '@/components/layout/StudentShell';
import styles from '../../exams.module.css';
import { examService, type ExamResult, type ExamResultReviewItem } from '@/services/exam.service';

/** JS mirror of the backend `_norm_mcq` so revealed answers line up with the student's. */
const normMcq = (val: unknown): string | null => {
  if (val == null) return null;
  const s = String(val).trim();
  if (!s) return null;
  if (s.length === 1 && /[a-zA-Z]/.test(s)) return String(s.toUpperCase().charCodeAt(0) - 65);
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? s.toLowerCase() : String(n);
};

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

function McqReview({ item }: { item: ExamResultReviewItem }) {
  const selected = normMcq(item.your_answer);
  const correct = normMcq(item.correct_answer);
  return (
    <div>
      {(item.options || []).map((opt, i) => {
        const isSel = selected === String(i);
        const isCorr = correct === String(i);
        const cls = isCorr ? styles.optCorrect : isSel ? styles.optWrong : '';
        return (
          <div key={i} className={`${styles.optRow} ${cls}`}>
            <span className={styles.mcqLetter}>{String.fromCharCode(65 + i)}</span>
            <span>{opt || `Option ${String.fromCharCode(65 + i)}`}</span>
            {isCorr && <span className={styles.optTag} style={{ color: '#059669' }}><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> Correct</span>}
            {isSel && !isCorr && <span className={styles.optTag} style={{ color: '#b91c1c' }}><XCircle size={14} style={{ verticalAlign: -2 }} /> Your answer</span>}
          </div>
        );
      })}
      {selected == null && <p className={styles.reviewRow} style={{ color: '#9ca3af' }}>You did not answer this question.</p>}
    </div>
  );
}

function CodingReview({ item }: { item: ExamResultReviewItem }) {
  const code = typeof item.your_answer === 'string' ? item.your_answer : '';
  const results = (item.results || []) as Array<Record<string, unknown>>;
  return (
    <div>
      <p className={styles.tcLabel}>Your code</p>
      <pre className={styles.codePre}>{code || '(no code submitted)'}</pre>
      {results.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <p className={styles.tcLabel}>Test cases</p>
          {results.map((r, i) => {
            const passed = !!r.passed;
            const hidden = !!r.hidden;
            return (
              <div key={i} className={`${styles.tcResultRow} ${passed ? styles.tcPass : styles.tcFail}`}>
                {passed ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                <span style={{ fontWeight: 700 }}>Case {Number(r.index ?? i) + 1}</span>
                <span>{passed ? 'Passed' : 'Failed'}</span>
                {hidden ? (
                  <span style={{ marginLeft: 'auto', opacity: .75 }}>hidden</span>
                ) : (
                  <span style={{ marginLeft: 'auto', opacity: .8, fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>
                    in: {String(r.input ?? '') || '—'} · exp: {String(r.expected ?? '') || '—'} · got: {String(r.actual ?? '') || '—'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StudentExamResultPage({ params }: { params: Promise<{ examId: string }> }) {
  const router = useRouter();
  const [examId, setExamId] = useState<string | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => { const { examId: id } = await params; setExamId(id); })();
  }, [params]);

  useEffect(() => {
    if (!examId) return;
    examService.getResult(examId)
      .then(setResult)
      .catch(e => {
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setError(msg || 'Could not load your result.');
      })
      .finally(() => setLoading(false));
  }, [examId]);

  if (loading) {
    return (
      <StudentShell activePage="Exams" title="Result" subtitle="Loading…">
        <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading result…</div>
      </StudentShell>
    );
  }

  if (error || !result) {
    return (
      <StudentShell activePage="Exams" title="Result" subtitle="Unavailable">
        <div className={styles.errorBox}>⚠️ {error || 'No submitted attempt found for this exam.'}</div>
        <button type="button" className={styles.secondaryBtn}
          onClick={() => router.push(examId ? `/student/exams/${examId}` : '/student/exams')}>
          <ArrowLeft size={16} /> Back
        </button>
      </StudentShell>
    );
  }

  const { attempt, exam, score, passed, total_points, max_points, review } = result;
  const correctCount = review.filter(r => r.correct).length;
  const circleBg = passed
    ? 'linear-gradient(135deg, #10b981, #059669)'
    : 'linear-gradient(135deg, #f87171, #ef4444)';

  return (
    <StudentShell activePage="Exams" title={exam.title} subtitle="Your submission has been graded">
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/student/exams')}>
          <ArrowLeft size={16} /> My Exams
        </button>
        <button type="button" className={styles.ghostBtn} onClick={() => router.push(`/student/exams/${examId}`)}>
          <CalendarClock size={16} /> Exam Details
        </button>
      </div>

      {/* Score hero */}
      <div className={styles.resultHero}>
        <div className={styles.scoreCircle} style={{ background: circleBg }}>
          <span className={styles.scoreNum}>{Math.round(score)}%</span>
          <span className={styles.scoreDen}>score</span>
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, color: '#111827', display: 'flex', alignItems: 'center', gap: 9 }}>
            {passed ? <Trophy size={22} style={{ color: '#059669' }} /> : <XCircle size={22} style={{ color: '#ef4444' }} />}
            {passed ? 'Passed' : 'Not passed'}
          </h2>
          <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#475569' }}>
            Pass mark {exam.pass_threshold}% · You scored {Math.round(score)}%
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <span className={`${styles.badge} ${styles.blueBadge}`}>
              {total_points} / {max_points} points
            </span>
            <span className={`${styles.badge} ${styles.slateBadge}`}>
              {correctCount} / {review.length} correct
            </span>
            <span className={`${styles.badge} ${attempt.status === 'expired' ? styles.amberBadge : styles.greenBadge}`}>
              {attempt.status === 'expired' ? 'Auto-submitted (time up)' : 'Submitted'}
            </span>
          </div>
          {attempt.submitted_at && (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: '#9ca3af' }}>Submitted {fmtDateTime(attempt.submitted_at)}</p>
          )}
        </div>
      </div>

      {/* Per-question review */}
      <h3 style={{ margin: '4px 0 14px', fontSize: 15, fontWeight: 700, color: '#111827' }}>Answer review</h3>
      {review.length === 0 ? (
        <p style={{ color: '#9ca3af', fontSize: 13.5 }}>This exam had no questions.</p>
      ) : (
        review.map((item, i) => (
          <div key={item.id} className={`${styles.reviewItem} ${item.correct ? styles.reviewCorrect : styles.reviewWrong}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10, flexWrap: 'wrap' }}>
              <span className={`${styles.badge} ${item.correct ? styles.greenBadge : styles.redBadge}`}>
                {item.correct ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                {item.correct ? 'Correct' : 'Incorrect'}
              </span>
              <span className={`${styles.badge} ${item.question_type === 'mcq' ? styles.blueBadge : styles.slateBadge}`}>
                {item.question_type === 'mcq' ? <HelpCircle size={11} /> : <Code2 size={11} />}
                {item.question_type === 'mcq' ? 'MCQ' : 'Coding'}
              </span>
              <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600, marginLeft: 'auto' }}>
                Q{i + 1} · {item.earned} / {item.points} pts
              </span>
            </div>

            <p className={styles.reviewPrompt}>{item.prompt}</p>

            {item.question_type === 'mcq' ? <McqReview item={item} /> : <CodingReview item={item} />}

            {item.explanation && (
              <div className={styles.explanation}>
                <strong>Explanation:</strong> {item.explanation}
              </div>
            )}
          </div>
        ))
      )}
    </StudentShell>
  );
}
