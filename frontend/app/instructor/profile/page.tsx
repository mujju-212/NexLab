'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Mail, GraduationCap, BookOpen, Clock, ShieldCheck, Award } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

export default function InstructorProfilePage() {
  const router = useRouter();

  return (
    <InstructorShell
      activePage="Profile"
      title="Instructor Profile & Account"
      subtitle="Dr. Ramesh Kumar · Department of Computer Science & Engineering"
    >
      <div className={styles.gridTwo}>
        {/* Profile Card */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#0ea5e9', color: '#fff', fontSize: '24px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Space Grotesk' }}>
                DR
              </div>
              <div>
                <h2 className={styles.sectionTitle}>Dr. Ramesh Kumar</h2>
                <p className={styles.sectionSub}>Associate Professor · CS Department</p>
                <span className={styles.pillGreen} style={{ marginTop: '4px' }}>Instructor Verified</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '10px', fontSize: '13px', color: '#475569' }}>
              <Mail size={16} style={{ color: '#2563eb' }} />
              <span>ramesh.kumar@aivirtuallab.edu</span>
            </div>
            <div style={{ display: 'flex', gap: '10px', fontSize: '13px', color: '#475569' }}>
              <GraduationCap size={16} style={{ color: '#0f766e' }} />
              <span>Ph.D. in Computer Science (Distributed Systems)</span>
            </div>
            <div style={{ display: 'flex', gap: '10px', fontSize: '13px', color: '#475569' }}>
              <Clock size={16} style={{ color: '#b45309' }} />
              <span>Office Hours: Tue & Thu, 2:00 PM – 4:00 PM (Lab 302)</span>
            </div>
          </div>
        </section>

        {/* Assigned Subjects */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Assigned Subjects & Sections</h2>
              <p className={styles.sectionSub}>Academic Year 2024-2025</p>
            </div>
          </div>

          <div className={styles.list}>
            <div className={styles.listRow}>
              <div className={styles.rowIcon}><BookOpen size={18} /></div>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>CS301 Data Structures & Algorithms</p>
                <p className={styles.rowSub}>Section A (28 Students) · 4 Credits</p>
              </div>
              <span className={styles.pillBlue}>Active</span>
            </div>
            <div className={styles.listRow}>
              <div className={styles.rowIcon}><BookOpen size={18} /></div>
              <div className={styles.rowBody}>
                <p className={styles.rowTitle}>CS302 Operating Systems</p>
                <p className={styles.rowSub}>Section B (24 Students) · 4 Credits</p>
              </div>
              <span className={styles.pillBlue}>Active</span>
            </div>
          </div>
        </section>
      </div>
    </InstructorShell>
  );
}
