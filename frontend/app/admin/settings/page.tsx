'use client';

import { useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import {
  Building2, CalendarDays, Zap, Mail, Bell, Shield, Save, ToggleLeft, ToggleRight
} from 'lucide-react';
import styles from './page.module.css';

type SettingToggle = {
  key: string;
  label: string;
  desc: string;
  value: boolean;
};

const defaultToggles: SettingToggle[] = [
  { key:'ai_hints',       label:'AI Hint System',           desc:'Enable Groq AI-powered hints during live lab sessions.',       value:true  },
  { key:'viva_mode',      label:'Viva Mode (Post-Lab)',      desc:'Enable oral viva examination after session grading.',         value:true  },
  { key:'leaderboard',    label:'Student Leaderboard',       desc:'Show ranked leaderboard visible to all students.',           value:true  },
  { key:'catchup_mode',   label:'Catch-Up Mode',             desc:'Allow absent students to access recorded sessions.',         value:true  },
  { key:'face_detection', label:'Face Detection (MediaPipe)',desc:'Enable proctoring via webcam during live sessions.',         value:false },
  { key:'email_notifs',   label:'Email Notifications',       desc:'Send automated email alerts for sessions and submissions.',  value:true  },
  { key:'push_notifs',    label:'Push Notifications',        desc:'Enable in-app push notifications for students.',             value:true  },
];

export default function SettingsPage() {
  const [toggles, setToggles] = useState(defaultToggles);
  const [college, setCollege] = useState('HKBK College of Engineering');
  const [year, setYear] = useState('2026-27');
  const [saved, setSaved] = useState(false);

  const toggle = (key: string) =>
    setToggles(prev => prev.map(t => t.key === key ? { ...t, value: !t.value } : t));

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <AdminShell activePage="Settings" title="Platform Settings" subtitle="Configure global platform settings, features and notifications">

      <div className={styles.grid}>

        {/* ── Institution Settings ─────────────────────────────────────── */}
        <div className={styles.settingsCard}>
          <div className={styles.cardHeader}>
            <Building2 size={18} strokeWidth={1.9} color="#7c3aed" />
            <h2 className={styles.cardTitle}>Institution</h2>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>College Name</label>
            <input className={styles.input} value={college} onChange={e => setCollege(e.target.value)} />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Current Academic Year</label>
            <input className={styles.input} value={year} onChange={e => setYear(e.target.value)} />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Timezone</label>
            <select className={styles.select}>
              <option>Asia/Kolkata (IST +05:30)</option>
              <option>UTC</option>
            </select>
          </div>
        </div>

        {/* ── Academic Year Dates ───────────────────────────────────────── */}
        <div className={styles.settingsCard}>
          <div className={styles.cardHeader}>
            <CalendarDays size={18} strokeWidth={1.9} color="#ec4899" />
            <h2 className={styles.cardTitle}>Academic Calendar</h2>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Year Start Date</label>
            <input className={styles.input} type="date" defaultValue="2026-07-01" />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Year End Date</label>
            <input className={styles.input} type="date" defaultValue="2027-04-30" />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Exam Period Start</label>
            <input className={styles.input} type="date" defaultValue="2027-03-01" />
          </div>
        </div>

        {/* ── Feature Toggles ───────────────────────────────────────────── */}
        <div className={`${styles.settingsCard} ${styles.fullWidth}`}>
          <div className={styles.cardHeader}>
            <Zap size={18} strokeWidth={1.9} color="#f59e0b" />
            <h2 className={styles.cardTitle}>Feature Configuration</h2>
          </div>
          <div className={styles.toggleGrid}>
            {toggles.map(t => (
              <div key={t.key} className={styles.toggleRow} onClick={() => toggle(t.key)}>
                <div>
                  <p className={styles.toggleLabel}>{t.label}</p>
                  <p className={styles.toggleDesc}>{t.desc}</p>
                </div>
                <button
                  className={`${styles.toggleBtn} ${t.value ? styles.toggleOn : styles.toggleOff}`}
                  onClick={e => { e.stopPropagation(); toggle(t.key); }}
                >
                  {t.value
                    ? <ToggleRight size={28} strokeWidth={1.8} />
                    : <ToggleLeft size={28} strokeWidth={1.8} />
                  }
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Notification Settings ─────────────────────────────────────── */}
        <div className={styles.settingsCard}>
          <div className={styles.cardHeader}>
            <Bell size={18} strokeWidth={1.9} color="#0ea5e9" />
            <h2 className={styles.cardTitle}>Notifications</h2>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Reminder — 24h Before Session</label>
            <select className={styles.select}><option>Email + In-App</option><option>Email Only</option><option>In-App Only</option><option>Disabled</option></select>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Reminder — 1h Before Session</label>
            <select className={styles.select}><option>Email + In-App</option><option>In-App Only</option><option>Disabled</option></select>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>At-Risk Alert Threshold</label>
            <select className={styles.select}><option>60% attendance</option><option>50% attendance</option><option>70% attendance</option></select>
          </div>
        </div>

        {/* ── Email Settings ─────────────────────────────────────────────── */}
        <div className={styles.settingsCard}>
          <div className={styles.cardHeader}>
            <Mail size={18} strokeWidth={1.9} color="#22c55e" />
            <h2 className={styles.cardTitle}>Email Configuration</h2>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>SMTP Host</label>
            <input className={styles.input} defaultValue="smtp.hkbk.edu.in" />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>SMTP Port</label>
            <input className={styles.input} defaultValue="587" />
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>From Address</label>
            <input className={styles.input} defaultValue="noreply@hkbk.edu.in" />
          </div>
        </div>

      </div>

      {/* ── Save Button ───────────────────────────────────────────────── */}
      <div className={styles.saveBar}>
        <button className={`${styles.saveBtn} ${saved ? styles.saveBtnSaved : ''}`} onClick={save}>
          {saved
            ? <><Shield size={15} strokeWidth={2} /> Saved Successfully!</>
            : <><Save size={15} strokeWidth={2} /> Save All Changes</>
          }
        </button>
        <button className={styles.resetBtn}>Reset to Defaults</button>
      </div>
    </AdminShell>
  );
}
