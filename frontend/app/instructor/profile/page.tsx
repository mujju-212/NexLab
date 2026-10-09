'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Mail, GraduationCap, BookOpen, ShieldCheck } from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import { useAuthStore } from '@/store/auth-store';
import { sessionService } from '@/services/session.service';
import styles from '../shared.module.css';

interface SectionSubjectLite {
  section_subject_id: string;
  subject_name: string;
  subject_code: string;
  section_name: string;
  student_count: number;
}

export default function InstructorProfilePage() {
  const user = useAuthStore((s) => s.user);
  const [assignments, setAssignments] = useState<SectionSubjectLite[]>([]);

  const { data, isLoading: loadingAssignments } = useQuery({
    queryKey: ['instructor', 'section-subjects'],
    queryFn: () => sessionService.getSectionSubjects(),
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (data) setAssignments(data.section_subjects ?? []);
  }, [data]);

  const name = user?.full_name ?? 'Instructor';
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'IN';
  const roleLabel = (user?.role ?? 'instructor').replace('_', ' ');

  return (
    <InstructorShell
      activePage="Profile"
      title="Instructor Profile & Account"
      subtitle={`${name} · Signed in as ${roleLabel}`}
    >
      <div className={styles.gridTwo}>
        {/* Profile Card */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', background: '#d946ef', color: '#fff',
                fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontFamily: 'Space Grotesk',
              }}>
                {initials}
              </div>
              <div>
                <h2 className={styles.sectionTitle}>{name}</h2>
                <p className={styles.sectionSub} style={{ textTransform: 'capitalize' }}>{roleLabel} account</p>
                <span className={`${styles.pill} ${styles.pillGreen}`} style={{ marginTop: 4 }}>
                  <ShieldCheck size={12} /> Verified
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            <div style={{ display: 'flex', gap: 10, fontSize: 13, color: '#475569' }}>
              <Mail size={16} style={{ color: '#7c3aed' }} />
              <span>{user?.email ?? '—'}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 13, color: '#475569' }}>
              <GraduationCap size={16} style={{ color: '#0f766e' }} />
              <span>User ID: {user?.id ?? '—'}</span>
            </div>
          </div>
        </section>

        {/* Assigned Subjects */}
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Assigned Subjects & Sections</h2>
              <p className={styles.sectionSub}>Teaching assignments from your institution</p>
            </div>
          </div>

          <div className={styles.list}>
            {assignments.map((a) => (
              <div key={a.section_subject_id} className={styles.listRow}>
                <div className={styles.rowIcon}><BookOpen size={18} /></div>
                <div className={styles.rowBody}>
                  <p className={styles.rowTitle}>{a.subject_name}</p>
                  <p className={styles.rowSub}>
                    {a.subject_code ? `${a.subject_code} · ` : ''}{a.section_name} ({a.student_count} students)
                  </p>
                </div>
                <span className={`${styles.pill} ${styles.pillBlue}`}>Active</span>
              </div>
            ))}
            {assignments.length === 0 && (
              <p className={styles.sectionSub} style={{ padding: 16 }}>
                No teaching assignments found. Ask your institution admin to assign sections.
              </p>
            )}
          </div>
        </section>
      </div>
    </InstructorShell>
  );
}
