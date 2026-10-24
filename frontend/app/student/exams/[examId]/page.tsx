'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, Clock, HelpCircle, CheckCircle2, CalendarClock,
  Play, Timer, BarChart3, AlertTriangle,
} from 'lucide-react';
import StudentShell from '@/components/layout/StudentShell';
import styles from '../exams.module.css';
import { examService, type Exam, type ExamAttempt } from '@/services/exam.service';
import { useServerCountdown } from '@/lib/countdown';

const fmtDateTime = (iso: string | null) => {
  if (!iso) return 'No limit';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
};

export default function StudentExamDetailPage({ params }: { params: Promise<{ examId: string }> }) {
  const router = useRouter();
  const [examId, setExamId] = useState<string | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [serverNow, setServerNow] = useState<string>(new Date().toISOString());
  const [attemptsUsed, setAttemptsUsed] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(0);
  const [canStart, setCanStart] = useState(false);
  const [codeExecutionAvailable, setCodeExecutionAvailable] = useState(true);
  const [inProgress, setInProgress] = useState<ExamAttempt | null>(null);
  const [latest, setLatest] = useState<ExamAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => { const { examId: id } = await params; setExamId(id); })();
  }, [params]);

  const load = useCallback(async (id: string) => {
    try {
      setError(null);
      const res = await examService.getMyExam(id);
      setExam(res.exam);
      setServerNow(res.server_now);
      setAttemptsUsed(res.attempts_used);
      setAttemptsRemaining(res.attempts_remaining);
      setCanStart(res.can_start);
      setCodeExecutionAvailable(res.code_execution_available !== false);
      setInProgress(res.in_progress_attempt);
      setLatest(res.latest_attempt);
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Could not load this exam.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (examId) load(examId); }, [examId, load]);

  // Countdown target: to start (upcoming) or to deadline (open).
  const cdTarget = exam?.window_state === 'upcoming' ? exam.available_from : exam?.due_at;
  const cd = useServerCountdown(cdTarget ?? null, serverNow);

  if (loading) {
    return (
      <StudentShell activePage="Exams" title="Exam" subtitle="Loading…">
        <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading exam…</div>
      </StudentShell>
    );
  }

  const graded = latest && (latest.status === 'submitted' || latest.status === 'expired');

  return (
    <StudentShell activePage="Exams" title={exam?.title || 'Exam'} subtitle="Read the instructions carefully before you start">
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/student/exams')}>
          <ArrowLeft size={16} /> All Exams
        </button>
        {graded && (
          <button type="button" className={styles.ghostBtn} onClick={() => router.push(`/student/exams/${examId}/result`)}>
            <BarChart3 size={16} /> View My Result
          </button>
        )}
      </div>

      {error && <div className={styles.errorBox}>⚠️ {error}</div>}
      {!codeExecutionAvailable && (
        <div role="alert" className={styles.errorBox} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 16 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>Coding execution is unavailable on this server, so this coding assessment cannot be started or resumed here.</span>
        </div>
      )}

      {exam && (
        <>
          <div className={styles.panel}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
              <h2 className={styles.panelTitle} style={{ margin: 0 }}>{exam.title}</h2>
              <span className={`${styles.badge} ${exam.window_state === 'open' ? styles.greenBadge : exam.window_state === 'upcoming' ? styles.blueBadge : styles.slateBadge}`}>
                <CalendarClock size={11} /> {exam.window_state}
              </span>
            </div>
            {exam.description && <p className={styles.instructions} style={{ marginBottom: 18 }}>{exam.description}</p>}

            <div className={styles.factGrid}>
              <div className={styles.fact}>
                <p className={styles.factLabel}><Clock size={11} style={{ verticalAlign: -1 }} /> Duration</p>
                <p className={styles.factValue}>{exam.duration_minutes} min</p>
              </div>
              <div className={styles.fact}>
                <p className={styles.factLabel}><HelpCircle size={11} style={{ verticalAlign: -1 }} /> Questions</p>
                <p className={styles.factValue}>{exam.question_count}</p>
              </div>
              <div className={styles.fact}>
                <p className={styles.factLabel}><CheckCircle2 size={11} style={{ verticalAlign: -1 }} /> Pass Mark</p>
                <p className={styles.factValue}>{exam.pass_threshold}%</p>
              </div>
              <div className={styles.fact}>
                <p className={styles.factLabel}>Attempts Left</p>
                <p className={styles.factValue}>{attemptsRemaining} / {exam.max_attempts}</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#475569', marginBottom: 20 }}>
              <span><strong>Available from:</strong> {fmtDateTime(exam.available_from)}</span>
              <span><strong>Submission deadline:</strong> {fmtDateTime(exam.due_at)}</span>
              {exam.shuffle_questions && <span style={{ color: '#9ca3af' }}>Question order is shuffled per attempt.</span>}
            </div>

            {/* Countdown + Start */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              {cdTarget && !cd.expired && (
                <span className={`${styles.countdownPill} ${cd.warn ? styles.countdownWarn : ''}`}>
                  <Timer size={16} />
                  {exam.window_state === 'upcoming' ? 'Opens in ' : 'Closes in '}{cd.label}
                </span>
              )}

              {inProgress ? (
                codeExecutionAvailable ? (
                  <button type="button" className={styles.primaryBtn} onClick={() => router.push(`/student/exams/${examId}/take`)}>
                    <Play size={17} /> Resume Attempt
                  </button>
                ) : (
                  <button type="button" className={styles.primaryBtn} disabled>Code Runner Unavailable</button>
                )
              ) : canStart ? (
                <button type="button" className={styles.primaryBtn} onClick={() => router.push(`/student/exams/${examId}/take`)}>
                  <Play size={17} /> Start Exam
                </button>
              ) : (
                <button type="button" className={styles.primaryBtn} disabled>
                  {!codeExecutionAvailable ? 'Code Runner Unavailable'
                    : exam.window_state === 'upcoming' ? 'Not Started Yet'
                      : exam.window_state === 'closed' ? 'Deadline Passed'
                        : attemptsRemaining <= 0 ? 'No Attempts Left' : 'Unavailable'}
                </button>
              )}
            </div>

            {canStart && !inProgress && (
              <p style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '16px 0 0', fontSize: 12.5, color: '#b45309' }}>
                <AlertTriangle size={14} /> The {exam.duration_minutes}-minute timer starts the moment you begin and cannot be paused.
              </p>
            )}
          </div>
        </>
      )}
    </StudentShell>
  );
}
