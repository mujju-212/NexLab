'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { LabSession, Experiment } from '@/types';
import { Radio, Clock, Users, Loader2, RotateCcw, Video } from 'lucide-react';
import styles from './page.module.css';

interface SessionWithMeta extends LabSession {
  my_attendance?: { status: string; joined_at?: string | null };
  duration_minutes?: number | null;
}

const fmtDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export default function LiveLabListPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionWithMeta[]>([]);
  const [expTitles, setExpTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [catchupBusy, setCatchupBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sess, subjects] = await Promise.all([
          studentService.getSessions(),
          studentService.getSubjects(),
        ]);
        if (cancelled) return;
        setSessions(sess as SessionWithMeta[]);
        const expLists = await Promise.all(
          subjects.map(s => studentService.getExperiments(s.subject_id).catch(() => [] as Experiment[]))
        );
        if (cancelled) return;
        const titles: Record<string, string> = {};
        expLists.flat().forEach(e => { titles[e.id] = e.title; });
        setExpTitles(titles);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load sessions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const startCatchup = async (session: SessionWithMeta) => {
    setCatchupBusy(session.id);
    setNotice('');
    try {
      await studentService.startCatchup(session.id);
      router.push(`/student/live-lab/${session.id}`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not start catch-up');
    } finally {
      setCatchupBusy(null);
    }
  };

  const active = sessions.filter(s => s.status === 'active');
  const scheduled = sessions.filter(s => s.status === 'scheduled');
  const ended = sessions.filter(s => s.status === 'ended');

  const renderSession = (s: SessionWithMeta) => {
    const attended = s.my_attendance && ['present', 'late', 'partial'].includes(s.my_attendance.status);
    const catchupAvailable = s.status === 'ended' && s.catchup_enabled && !attended;
    return (
      <div key={s.id} className={styles.sessionCard}>
        <div className={styles.sessionBadge} style={{ alignSelf: 'flex-start' }}>
          {s.status === 'active' ? <><Radio size={13} /> LIVE</> : s.status === 'scheduled' ? <><Clock size={13} /> UPCOMING</> : <><RotateCcw size={13} /> ENDED</>}
        </div>
        <h2 className={styles.sessionTitle}>{expTitles[s.experiment_id] || 'Lab Session'}</h2>
        <div className={styles.sessionMeta}>
          <span><Clock size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> {fmtDateTime(s.scheduled_at)}</span>
          {s.duration_minutes != null && <span>⏱ {s.duration_minutes} min</span>}
          <span><Users size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} /> Gate ≥ {s.gate_score_threshold}%</span>
          {s.my_attendance && s.my_attendance.status !== 'absent' && <span>✅ Attendance: {s.my_attendance.status}</span>}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {s.status === 'active' && (
            <button className={styles.joinBtn} onClick={() => router.push(`/student/live-lab/${s.id}`)}>
              <Video size={15} /> Join Session
            </button>
          )}
          {s.status === 'scheduled' && (
            <button className={styles.joinBtn} onClick={() => router.push(`/student/pre-lab`)}>
              📖 Prepare Pre-Lab
            </button>
          )}
          {catchupAvailable && (
            <button
              className={styles.joinBtn}
              disabled={catchupBusy === s.id}
              onClick={() => startCatchup(s)}
            >
              {catchupBusy === s.id ? <Loader2 size={14} className={styles.spinner} /> : <RotateCcw size={14} />}
              {catchupBusy === s.id ? 'Starting…' : 'Start Catch-Up'}
            </button>
          )}
          {s.status === 'ended' && !catchupAvailable && (
            <span style={{ fontSize: 13, color: '#9891a6', fontWeight: 600 }}>
              {!attended && !s.catchup_enabled ? 'Catch-up not enabled for this session' : attended ? 'Session complete — see submissions for your grade' : 'Catch-up deadline passed'}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <StudentShell activePage="Join Lab" title="Live Lab Sessions" subtitle="Join active sessions or catch up on missed ones">
      {loading && <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading sessions…</div>}
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}
      {notice && <div className={styles.errorBox}>⚠️ {notice}</div>}

      {!loading && !error && (
        <div className={styles.joinFlow}>
          {active.length > 0 && (
            <>
              <h3 className={styles.checksTitle}>Happening Now</h3>
              {active.map(renderSession)}
            </>
          )}

          {scheduled.length > 0 && (
            <>
              <h3 className={styles.checksTitle}>Upcoming</h3>
              {scheduled.map(renderSession)}
            </>
          )}

          {ended.length > 0 && (
            <>
              <h3 className={styles.checksTitle}>Past Sessions</h3>
              {ended.map(renderSession)}
            </>
          )}

          {sessions.length === 0 && (
            <div className={styles.errorBox}>No lab sessions found for your sections yet.</div>
          )}
        </div>
      )}
    </StudentShell>
  );
}
