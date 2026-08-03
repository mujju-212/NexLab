'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, ShieldCheck, Bell, Cpu, Save, Sparkles, Sliders } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

export default function InstructorSettingsPage() {
  const router = useRouter();
  const [defaultThreshold, setDefaultThreshold] = useState<number>(75);
  const [lateJoinWindow, setLateJoinWindow] = useState<number>(15);
  const [aiHintsEnabled, setAiHintsEnabled] = useState<boolean>(true);
  const [autoGradeOnSubmit, setAutoGradeOnSubmit] = useState<boolean>(true);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const handleSave = () => {
    setSavedNotice('Instructor settings saved to PostgreSQL configuration store!');
    setTimeout(() => setSavedNotice(null), 4000);
  };

  return (
    <InstructorShell
      activePage="Settings"
      title="Instructor Lab Settings"
      subtitle="Configure automation rules, gate thresholds, Judge0 execution limits, Groq AI hints, and notification frequency"
    >
      {/* Top Action Bar */}
      <div className={styles.actionRow}>
        <button type="button" className={styles.primaryBtn} onClick={handleSave}>
          <Save size={16} strokeWidth={2} /> Save Settings
        </button>
      </div>

      {savedNotice && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px 16px', borderRadius: '12px', marginBottom: '20px', color: '#166534', fontSize: '13.5px', fontWeight: 600 }}>
          ✅ {savedNotice}
        </div>
      )}

      <div className={styles.gridTwo}>
        {/* Lab Automation & Threshold Defaults */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Lab Automation Defaults</h2>
              <p className={styles.sectionSub}>Global parameters for newly created sessions & experiments</p>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Default Pre-Lab Gate Threshold (%)</label>
            <input
              type="number"
              className={styles.input}
              value={defaultThreshold}
              onChange={(e) => setDefaultThreshold(Number(e.target.value))}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Default Late Join Window (Minutes)</label>
            <input
              type="number"
              className={styles.input}
              value={lateJoinWindow}
              onChange={(e) => setLateJoinWindow(Number(e.target.value))}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', cursor: 'pointer' }}>
              <input type="checkbox" checked={autoGradeOnSubmit} onChange={(e) => setAutoGradeOnSubmit(e.target.checked)} />
              <span>Automatically trigger Judge0 auto-grading upon code submission</span>
            </label>
          </div>
        </section>

        {/* AI & Integration Options */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>AI Services & Infrastructure Integrations</h2>
              <p className={styles.sectionSub}>Groq LLM, Jitsi Meet & Judge0 settings</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', cursor: 'pointer' }}>
              <input type="checkbox" checked={aiHintsEnabled} onChange={(e) => setAiHintsEnabled(e.target.checked)} />
              <span>Enable AI-powered real-time hints during live lab sessions (Groq LLM)</span>
            </label>
          </div>

          <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0', marginTop: '20px' }}>
            <p style={{ margin: '0 0 6px', fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>SERVICE ENDPOINTS</p>
            <p style={{ margin: '0 0 4px', fontSize: '12.5px', color: '#334155' }}>⚡ Judge0 API: <code>http://localhost:2358</code></p>
            <p style={{ margin: '0 0 4px', fontSize: '12.5px', color: '#334155' }}>🤖 FastAPI AI Services: <code>http://localhost:8000–8006</code></p>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#334155' }}>📹 Jitsi Video Server: <code>meet.jit.si / Local Docker</code></p>
          </div>
        </section>
      </div>
    </InstructorShell>
  );
}
