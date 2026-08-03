'use client';

import { useState } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import styles from './page.module.css';

export default function ProfilePage() {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: 'Riya Singh', email: 'riya.singh@ailab.edu',
    phone: '+91 98765 43210', bio: 'Passionate about Data Structures and AI research.',
    github: 'github.com/riyasingh', linkedin: 'linkedin.com/in/riyasingh',
  });
  const [temp, setTemp] = useState(form);

  const save = () => { setForm(temp); setEditing(false); };

  return (
    <StudentShell activePage="Profile" title="My Profile" subtitle="Manage your personal information and settings">
      <div className={styles.layout}>

        {/* Left: Avatar + Info */}
        <div className={styles.leftCol}>
          <div className={styles.avatarCard}>
            <div className={styles.avatarCircle} style={{ background: 'linear-gradient(135deg,#8b5cf6,#d6409f)' }}>RS</div>
            <h2 className={styles.userName}>{form.name}</h2>
            <p className={styles.userRole}>🎓 Student</p>
            <div className={styles.infoPills}>
              <span className={styles.pill}>CS — Section A</span>
              <span className={styles.pill}>Batch 2024-2026</span>
              <span className={styles.pill}>Roll: CS21012</span>
            </div>
          </div>

          {/* Stats */}
          <div className={styles.statsCard}>
            <h3 className={styles.statsTitle}>My Stats</h3>
            {[
              { label: 'Labs Completed', value: '5' },
              { label: 'Avg Score',      value: '88%' },
              { label: 'Current Rank',   value: '#12' },
              { label: 'Certificates',   value: '3' },
              { label: 'Study Hours',    value: '42h' },
            ].map(s => (
              <div key={s.label} className={styles.statRow}>
                <span className={styles.statLabel}>{s.label}</span>
                <span className={styles.statValue}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Edit Form */}
        <div className={styles.rightCol}>
          <div className={styles.formCard}>
            <div className={styles.formCardHeader}>
              <h3 className={styles.formCardTitle}>Personal Information</h3>
              {!editing ? (
                <button className={styles.editBtn} onClick={() => { setTemp(form); setEditing(true); }}>✏️ Edit</button>
              ) : (
                <div className={styles.formBtns}>
                  <button className={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
                  <button className={styles.saveBtn} onClick={save}>Save Changes</button>
                </div>
              )}
            </div>

            <div className={styles.formGrid}>
              {[
                { label: 'Full Name',     key: 'name',     type: 'text'  },
                { label: 'Email',         key: 'email',    type: 'email' },
                { label: 'Phone',         key: 'phone',    type: 'tel'   },
                { label: 'GitHub',        key: 'github',   type: 'text'  },
                { label: 'LinkedIn',      key: 'linkedin', type: 'text'  },
              ].map(f => (
                <div key={f.key} className={styles.formField}>
                  <label className={styles.fieldLabel}>{f.label}</label>
                  {editing ? (
                    <input
                      type={f.type}
                      className={styles.fieldInput}
                      value={temp[f.key as keyof typeof temp]}
                      onChange={e => setTemp(t => ({ ...t, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <p className={styles.fieldValue}>{form[f.key as keyof typeof form]}</p>
                  )}
                </div>
              ))}

              <div className={`${styles.formField} ${styles.fieldFull}`}>
                <label className={styles.fieldLabel}>Bio</label>
                {editing ? (
                  <textarea
                    className={styles.fieldTextarea}
                    value={temp.bio}
                    onChange={e => setTemp(t => ({ ...t, bio: e.target.value }))}
                    rows={3}
                  />
                ) : (
                  <p className={styles.fieldValue}>{form.bio}</p>
                )}
              </div>
            </div>
          </div>

          {/* Enrolled Subjects */}
          <div className={styles.subjectsCard}>
            <h3 className={styles.formCardTitle}>Enrolled Subjects</h3>
            <div className={styles.subGrid}>
              {[
                { name: 'Data Structures & Algorithms', code: 'CS301', color: '#8b5cf6' },
                { name: 'Operating Systems',            code: 'CS401', color: '#0ea5e9' },
                { name: 'Database Management',          code: 'CS402', color: '#f59e0b' },
                { name: 'Computer Networks',            code: 'CS403', color: '#ec4899' },
              ].map(s => (
                <div key={s.code} className={styles.subChip}>
                  <div className={styles.subChipDot} style={{ background: s.color }} />
                  <div>
                    <p className={styles.subChipCode}>{s.code}</p>
                    <p className={styles.subChipName}>{s.name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </StudentShell>
  );
}
