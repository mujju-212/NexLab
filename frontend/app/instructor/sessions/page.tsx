'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock, PlayCircle, Radio, Clock, Users, CheckCircle2, AlertCircle,
  Plus, Bell, ChevronRight, X, Calendar, ShieldCheck, Mail, Send
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

interface Session {
  id: string;
  title: string;
  subject: string;
  section: string;
  experiment: string;
  dateTime: string;
  durationMinutes: number;
  gateThreshold: number;
  lateJoinWindow: number;
  catchUpDeadlineDays: number;
  studentsEnrolled: number;
  status: 'Live' | 'Upcoming' | 'Completed';
}

const INITIAL_SESSIONS: Session[] = [
  {
    id: 'stack-lab-live',
    title: 'CS301 Section A: Stack Implementation',
    subject: 'Data Structures (CS301)',
    section: 'Section A',
    experiment: 'Stack Data Structure Implementation',
    dateTime: 'Today, 10:00 AM',
    durationMinutes: 90,
    gateThreshold: 75,
    lateJoinWindow: 15,
    catchUpDeadlineDays: 3,
    studentsEnrolled: 28,
    status: 'Live',
  },
  {
    id: 'os-cpu-upcoming',
    title: 'CS302 Section B: Process Scheduling',
    subject: 'Operating Systems (CS302)',
    section: 'Section B',
    experiment: 'CPU Process Scheduling Simulator',
    dateTime: 'Today, 2:00 PM',
    durationMinutes: 90,
    gateThreshold: 70,
    lateJoinWindow: 10,
    catchUpDeadlineDays: 3,
    studentsEnrolled: 24,
    status: 'Upcoming',
  },
  {
    id: 'dbms-sql-upcoming',
    title: 'CS303 Section A: Relational Joins',
    subject: 'DBMS (CS303)',
    section: 'Section A',
    experiment: 'Relational Database Joins & Aggregations',
    dateTime: 'Tomorrow, 11:00 AM',
    durationMinutes: 120,
    gateThreshold: 75,
    lateJoinWindow: 15,
    catchUpDeadlineDays: 5,
    studentsEnrolled: 26,
    status: 'Upcoming',
  },
  {
    id: 'chem-titration-completed',
    title: 'CH101 Section A: Titration Lab',
    subject: 'Chemistry (CH101)',
    section: 'Section A',
    experiment: 'Acid-Base Titration Analysis',
    dateTime: 'Jul 18, 2026',
    durationMinutes: 60,
    gateThreshold: 70,
    lateJoinWindow: 15,
    catchUpDeadlineDays: 3,
    studentsEnrolled: 28,
    status: 'Completed',
  },
];

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>(INITIAL_SESSIONS);
  const [filterStatus, setFilterStatus] = useState<'All' | 'Live' | 'Upcoming' | 'Completed'>('All');
  const [noticeSent, setNoticeSent] = useState<string | null>(null);

  // Wizard Modal State (Workflow 3)
  const [showScheduleModal, setShowScheduleModal] = useState<boolean>(false);
  const [step, setStep] = useState<number>(1);
  const [subject, setSubject] = useState<string>('Data Structures (CS301)');
  const [section, setSection] = useState<string>('Section A');
  const [experiment, setExperiment] = useState<string>('Stack Data Structure Implementation');
  const [date, setDate] = useState<string>('2026-08-01');
  const [time, setTime] = useState<string>('10:00');
  const [duration, setDuration] = useState<number>(90);
  const [gateThreshold, setGateThreshold] = useState<number>(75);
  const [lateJoinWindow, setLateJoinWindow] = useState<number>(15);
  const [catchUpDeadline, setCatchUpDeadline] = useState<number>(3);

  const filteredSessions = sessions.filter(
    (s) => filterStatus === 'All' || s.status === filterStatus
  );

  const handleConfirmSchedule = () => {
    const newSession: Session = {
      id: `session-${Date.now()}`,
      title: `${subject.split(' ')[0]} ${section}: ${experiment}`,
      subject,
      section,
      experiment,
      dateTime: `${date} at ${time}`,
      durationMinutes: duration,
      gateThreshold,
      lateJoinWindow,
      catchUpDeadlineDays: catchUpDeadline,
      studentsEnrolled: 28,
      status: 'Upcoming',
    };
    setSessions([newSession, ...sessions]);
    setShowScheduleModal(false);
    setNoticeSent(`Session scheduled for ${section}! Push notifications & calendar invites sent to 28 students.`);
    setTimeout(() => setNoticeSent(null), 5000);
    // Reset step
    setStep(1);
  };

  const sendReminder = (sessionTitle: string) => {
    setNoticeSent(`Reminder notification sent to all enrolled students for "${sessionTitle}"!`);
    setTimeout(() => setNoticeSent(null), 4000);
  };

  return (
    <InstructorShell
      activePage="Sessions"
      title="Session Scheduling & Operations"
      subtitle="Workflow 3: Schedule sessions, define gate thresholds, manage late join windows, and trigger notifications"
    >
      {/* Top Action Bar */}
      <div className={styles.actionRow}>
        <button type="button" className={styles.primaryBtn} onClick={() => setShowScheduleModal(true)}>
          <CalendarClock size={16} strokeWidth={2} /> Schedule New Session
        </button>
        <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/instructor/live-lab')}>
          <Radio size={16} strokeWidth={1.9} /> Live Lab Control
        </button>
        <button type="button" className={styles.ghostBtn} onClick={() => router.push('/instructor/catch-up')}>
          <Clock size={16} strokeWidth={1.9} /> Catch-Up Reviews
        </button>
      </div>

      {noticeSent && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#1e40af', fontSize: '13.5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} /> {noticeSent}
        </div>
      )}

      {/* Filter Chips */}
      <div className={styles.tabRow}>
        {(['All', 'Live', 'Upcoming', 'Completed'] as const).map((st) => (
          <button
            key={st}
            type="button"
            className={`${styles.tabChip} ${filterStatus === st ? styles.tabChipActive : ''}`}
            onClick={() => setFilterStatus(st)}
          >
            {st} Sessions ({st === 'All' ? sessions.length : sessions.filter(s => s.status === st).length})
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Live Class</p>
          <p className={styles.kpiValue} style={{ color: '#16a34a' }}>01</p>
          <p className={styles.kpiSub}>Stack Lab · 28 connected</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Scheduled Upcoming</p>
          <p className={styles.kpiValue} style={{ color: '#2563eb' }}>{sessions.filter(s => s.status === 'Upcoming').length}</p>
          <p className={styles.kpiSub}>Calendar invites synced</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Avg Pre-Lab Gate</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>74%</p>
          <p className={styles.kpiSub}>Threshold required</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Integrations</p>
          <p className={styles.kpiValue} style={{ color: '#0ea5e9' }}>Active</p>
          <p className={styles.kpiSub}>Redis + Email + Calendar</p>
        </div>
      </div>

      {/* Sessions Grid / Table */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Lab Sessions List</h2>
            <p className={styles.sectionSub}>Workflow 3 details: Gate threshold, late join, and catch-up rules.</p>
          </div>
        </div>

        <div className={styles.list}>
          {filteredSessions.map((session) => (
            <div key={session.id} className={styles.listRow}>
              <div className={styles.rowIcon}>
                <CalendarClock size={20} strokeWidth={1.9} />
              </div>
              <div className={styles.rowBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <p className={styles.rowTitle}>{session.title}</p>
                  <span className={`${styles.badge} ${session.status === 'Live' ? styles.greenBadge : session.status === 'Upcoming' ? styles.blueBadge : styles.slateBadge}`}>
                    {session.status}
                  </span>
                </div>
                <p className={styles.rowMeta}>
                  {session.subject} · {session.section} · ⏰ {session.dateTime} ({session.durationMinutes} mins)
                </p>
                <p className={styles.rowSub}>
                  🎯 Experiment: {session.experiment} | 🔒 Gate: {session.gateThreshold}% | ⏱️ Late Join: {session.lateJoinWindow}m | 📅 Catch-up: {session.catchUpDeadlineDays}d
                </p>
              </div>

              <div className={styles.rowSide}>
                <span className={styles.rowMeta}>👥 {session.studentsEnrolled} Students</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {session.status === 'Live' ? (
                    <button
                      type="button"
                      className={styles.primaryBtn}
                      style={{ minHeight: '34px', padding: '0 12px', fontSize: '12px' }}
                      onClick={() => router.push('/instructor/live-lab')}
                    >
                      <Radio size={12} /> Enter Live
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.ghostBtn}
                      style={{ minHeight: '34px', padding: '0 12px', fontSize: '12px' }}
                      onClick={() => sendReminder(session.title)}
                    >
                      <Send size={12} /> Send Reminder
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* WORKFLOW 3 SCHEDULING WIZARD MODAL */}
      {showScheduleModal && (
        <div className={styles.modalOverlay} onClick={() => setShowScheduleModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Workflow 3: Schedule Lab Session</h3>
                <p className={styles.sectionSub}>Step {step} of 3: {step === 1 ? 'Subject & Experiment' : step === 2 ? 'Date, Time & Duration' : 'Thresholds & Confirm'}</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setShowScheduleModal(false)}>
                <X size={18} />
              </button>
            </div>

            {step === 1 && (
              <div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Select Subject</label>
                  <select className={styles.select} value={subject} onChange={(e) => setSubject(e.target.value)}>
                    <option>Data Structures (CS301)</option>
                    <option>Operating Systems (CS302)</option>
                    <option>DBMS (CS303)</option>
                    <option>Chemistry (CH101)</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Select Section</label>
                  <select className={styles.select} value={section} onChange={(e) => setSection(e.target.value)}>
                    <option>Section A (28 Students)</option>
                    <option>Section B (24 Students)</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Select Experiment to Schedule</label>
                  <select className={styles.select} value={experiment} onChange={(e) => setExperiment(e.target.value)}>
                    <option>Stack Data Structure Implementation</option>
                    <option>CPU Process Scheduling Simulator</option>
                    <option>Relational Database Joins & Aggregations</option>
                    <option>Acid-Base Titration Analysis</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" className={styles.primaryBtn} onClick={() => setStep(2)}>
                    Next: Date & Time →
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Session Date</label>
                    <input type="date" className={styles.input} value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Start Time</label>
                    <input type="time" className={styles.input} value={time} onChange={(e) => setTime(e.target.value)} />
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Session Duration (Minutes)</label>
                  <select className={styles.select} value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes</option>
                    <option value={120}>120 minutes</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => setStep(1)}>
                    ← Back
                  </button>
                  <button type="button" className={styles.primaryBtn} onClick={() => setStep(3)}>
                    Next: Gate Rules →
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Gate Threshold (Minimum Pre-Lab Quiz % score required to enter)</label>
                  <input type="number" className={styles.input} value={gateThreshold} onChange={(e) => setGateThreshold(Number(e.target.value))} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Late Join Window (mins)</label>
                    <input type="number" className={styles.input} value={lateJoinWindow} onChange={(e) => setLateJoinWindow(Number(e.target.value))} />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Catch-up Deadline (days)</label>
                    <input type="number" className={styles.input} value={catchUpDeadline} onChange={(e) => setCatchUpDeadline(Number(e.target.value))} />
                  </div>
                </div>

                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '14px', borderRadius: '12px', marginTop: '12px' }}>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#166534', fontWeight: 600 }}>
                    🔔 System Automation: Creating Calendar Event, sending email invites & multi-channel push reminders (24h, 1h, 15m before session).
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
                  <button type="button" className={styles.secondaryBtn} onClick={() => setStep(2)}>
                    ← Back
                  </button>
                  <button type="button" className={styles.primaryBtn} onClick={handleConfirmSchedule}>
                    <CheckCircle2 size={16} /> Confirm & Schedule Session
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
