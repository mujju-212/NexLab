'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Radio, Play, Square, AlertTriangle, MonitorPlay, MessageSquare, Send, CheckCircle2,
  Clock, ShieldAlert, Code, Eye, Bell, Users, Video, Mic, RefreshCw, X, Sparkles
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

interface LiveStudent {
  id: string;
  name: string;
  roll: string;
  cameraOk: boolean;
  micOk: boolean;
  focusScore: number; // 0 - 100
  checkpoint: string;
  lastActive: string;
  code: string;
}

const INITIAL_LIVE_STUDENTS: LiveStudent[] = [
  {
    id: 'l1',
    name: 'Arjun Mehta',
    roll: 'CS21001',
    cameraOk: true,
    micOk: true,
    focusScore: 94,
    checkpoint: 'Checkpoint #3: Pop operation completed',
    lastActive: 'Just now',
    code: `class Stack:\n    def __init__(self):\n        self.items = []\n    def push(self, item):\n        self.items.append(item)\n    def pop(self):\n        if not self.is_empty():\n            return self.items.pop()`,
  },
  {
    id: 'l2',
    name: 'Priya Sharma',
    roll: 'CS21002',
    cameraOk: true,
    micOk: true,
    focusScore: 88,
    checkpoint: 'Checkpoint #3: Peek operation completed',
    lastActive: '1 min ago',
    code: `class Stack:\n    def __init__(self):\n        self.stack = []\n    def push(self, val):\n        self.stack.append(val)\n    def peek(self):\n        return self.stack[-1] if self.stack else None`,
  },
  {
    id: 'l3',
    name: 'Amit Das',
    roll: 'CS21005',
    cameraOk: true,
    micOk: false,
    focusScore: 48, // Alert low focus
    checkpoint: 'Checkpoint #1: Boilerplate initialized',
    lastActive: '5 mins ago',
    code: `# Stack implementation starting...\nclass Stack:\n    pass`,
  },
  {
    id: 'l4',
    name: 'Neha Pillai',
    roll: 'CS21004',
    cameraOk: false,
    micOk: true,
    focusScore: 90,
    checkpoint: 'Checkpoint #2: Push method working',
    lastActive: 'Just now',
    code: `class Stack:\n    def __init__(self):\n        self.data = []\n    def push(self, x):\n        self.data.append(x)`,
  },
];

export default function InstructorLiveLabPage() {
  const router = useRouter();
  const [sessionActive, setSessionActive] = useState<boolean>(true);
  const [students, setStudents] = useState<LiveStudent[]>(INITIAL_LIVE_STUDENTS);
  const [selectedStudent, setSelectedStudent] = useState<LiveStudent | null>(null);

  // Announcement State
  const [announcementText, setAnnouncementText] = useState<string>('');
  const [announcements, setAnnouncements] = useState<string[]>([
    'Welcome! Please remember to save your progress at Checkpoint #2 before 10:30 AM.',
  ]);

  // Private Chat State
  const [privateMessage, setPrivateMessage] = useState<string>('');
  const [chatLog, setChatLog] = useState<{ sender: string; text: string }[]>([
    { sender: 'Instructor', text: 'Hi Amit, I noticed your focus score dropped. Do you need a hint with Checkpoint #2?' },
    { sender: 'Amit Das', text: 'Yes Dr. Ramesh, I am getting an IndexError on popping an empty stack.' },
  ]);

  const handleBroadcastAnnouncement = () => {
    if (!announcementText) return;
    setAnnouncements([announcementText, ...announcements]);
    setAnnouncementText('');
  };

  const handleSendPrivateHint = () => {
    if (!privateMessage) return;
    setChatLog([...chatLog, { sender: 'Instructor', text: privateMessage }]);
    setPrivateMessage('');
  };

  return (
    <InstructorShell
      activePage="Live Lab Control"
      title="Live Lab Control Center"
      subtitle="Workflow 5: Monitor active class sessions, real-time code editor streams, face focus alerts, and private channels"
    >
      {/* Session Header Banner */}
      <div className={styles.sectionCard} style={{ background: sessionActive ? 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(15,118,110,0.08))' : '#f8fafc', marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span className={`${styles.badge} ${sessionActive ? styles.greenBadge : styles.slateBadge}`}>
                <Radio size={14} /> {sessionActive ? 'Live Session Active' : 'Session Stopped'}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>CS301 Section A · Stack Implementation Lab</span>
            </div>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Active Class Operations</h2>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {sessionActive ? (
              <>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => alert('Triggering real-time checkpoint sync across all student Monaco editors...')}
                >
                  <RefreshCw size={15} /> Sync Checkpoints
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => router.push('/instructor/grading')}
                >
                  <Code size={15} /> Auto-Grade All
                </button>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  style={{ background: 'linear-gradient(135deg, #dc2626, #b91c1c)' }}
                  onClick={() => setSessionActive(false)}
                >
                  <Square size={15} /> End Session
                </button>
              </>
            ) : (
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setSessionActive(true)}
              >
                <Play size={15} /> Start Live Session
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Connected Students</p>
          <p className={styles.kpiValue} style={{ color: '#2563eb' }}>{students.length} / 28</p>
          <p className={styles.kpiSub}>26 active, 2 idle</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Media & Jitsi Status</p>
          <p className={styles.kpiValue} style={{ color: '#16a34a' }}>Stable</p>
          <p className={styles.kpiSub}>Camera & Mic verified</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Low Focus Alerts</p>
          <p className={styles.kpiValue} style={{ color: '#b45309' }}>01</p>
          <p className={styles.kpiSub}>Amit Das · FaceMesh signal</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Judge0 Execution</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>14 Runs</p>
          <p className={styles.kpiSub}>Code test cases passing</p>
        </div>
      </div>

      {/* Main Grid: Student Roster & Live Channel */}
      <div className={styles.gridTwo}>
        {/* Real-Time Student Roster */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Workflow 5: Student Live Monitor</h2>
              <p className={styles.sectionSub}>Attendance, camera status, focus score, and code inspection.</p>
            </div>
          </div>

          <div className={styles.list}>
            {students.map((st) => (
              <div key={st.id} className={styles.listRow}>
                <div className={styles.rowBody}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <p className={styles.rowTitle}>{st.name} <span style={{ fontSize: '12px', color: '#64748b' }}>({st.roll})</span></p>
                    <span className={`${styles.badge} ${st.focusScore >= 80 ? styles.greenBadge : styles.amberBadge}`}>
                      Focus {st.focusScore}%
                    </span>
                  </div>
                  <p className={styles.rowSub} style={{ marginBottom: '6px' }}>{st.checkpoint}</p>
                  <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: '#64748b' }}>
                    <span>🎥 Camera: {st.cameraOk ? 'On' : 'Off'}</span>
                    <span>🎙️ Mic: {st.micOk ? 'On' : 'Muted'}</span>
                    <span>⏱️ Active: {st.lastActive}</span>
                  </div>
                </div>

                <div className={styles.rowSide}>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    style={{ minHeight: '34px', padding: '0 12px', fontSize: '12px' }}
                    onClick={() => setSelectedStudent(st)}
                  >
                    <Eye size={13} /> Inspect Code
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Private Instructor Channel & Announcements */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Announcement Broadcast Box */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Broadcast Announcement</h2>
                <p className={styles.sectionSub}>Push immediate pop-up notice to all student editors.</p>
              </div>
            </div>

            <div className={styles.formGroup}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  className={styles.input}
                  style={{ flex: 1 }}
                  placeholder="Type lab announcement or hint..."
                  value={announcementText}
                  onChange={(e) => setAnnouncementText(e.target.value)}
                />
                <button type="button" className={styles.primaryBtn} onClick={handleBroadcastAnnouncement}>
                  <Send size={15} /> Send
                </button>
              </div>
            </div>

            <div style={{ marginTop: '12px', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Recent Broadcast</p>
              <p style={{ margin: 0, fontSize: '13px', color: '#334155' }}>📢 {announcements[0]}</p>
            </div>
          </section>

          {/* Private Instructor Channel (1-on-1 Help) */}
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Private Channel (1-on-1 Help)</h2>
                <p className={styles.sectionSub}>Active chat with Amit Das (Low focus alert)</p>
              </div>
            </div>

            <div style={{ height: '150px', overflowY: 'auto', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {chatLog.map((c, i) => (
                <div key={i} style={{ alignSelf: c.sender === 'Instructor' ? 'flex-end' : 'flex-start', background: c.sender === 'Instructor' ? '#dbeafe' : '#ffffff', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(0,0,0,0.05)', maxWidth: '85%' }}>
                  <p style={{ margin: '0 0 2px', fontSize: '10.5px', fontWeight: 700, color: '#475569' }}>{c.sender}</p>
                  <p style={{ margin: 0, fontSize: '12.5px', color: '#0f172a' }}>{c.text}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className={styles.input}
                style={{ flex: 1 }}
                placeholder="Send private hint or message..."
                value={privateMessage}
                onChange={(e) => setPrivateMessage(e.target.value)}
              />
              <button type="button" className={styles.secondaryBtn} onClick={handleSendPrivateHint}>
                Reply
              </button>
            </div>
          </section>
        </div>
      </div>

      {/* CODE INSPECTION MODAL */}
      {selectedStudent && (
        <div className={styles.modalOverlay} onClick={() => setSelectedStudent(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Live Code Inspection: {selectedStudent.name}</h3>
                <p className={styles.sectionSub}>{selectedStudent.roll} · {selectedStudent.checkpoint}</p>
              </div>
              <button type="button" className={styles.closeBtn} onClick={() => setSelectedStudent(null)}>
                <X size={18} />
              </button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Monaco Code Editor State (Real-time stream)</label>
              <pre className={styles.codeBlock}>{selectedStudent.code}</pre>
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '14px', borderRadius: '12px', marginBottom: '16px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '13px', fontWeight: 700, color: '#1e40af' }}>🤖 Groq AI Hint Assistant Suggestion</p>
              <p style={{ margin: 0, fontSize: '12.5px', color: '#1e3a8a' }}>
                Student code is missing an empty stack check in `pop()`. Recommend suggesting `if len(self.items) == 0:` check.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => {
                  setPrivateMessage(`Hint: Make sure to check if stack is empty before popping!`);
                  setSelectedStudent(null);
                }}
              >
                <Sparkles size={15} /> Send AI Hint to Student
              </button>
              <button type="button" className={styles.primaryBtn} onClick={() => setSelectedStudent(null)}>
                Close Viewer
              </button>
            </div>
          </div>
        </div>
      )}
    </InstructorShell>
  );
}
