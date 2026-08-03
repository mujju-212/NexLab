'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageSquare, Star, ThumbsUp, AlertCircle, CheckCircle2, Filter
} from 'lucide-react';
import InstructorShell from '@/components/layout/InstructorShell';
import styles from '../shared.module.css';

interface FeedbackItem {
  id: string;
  student: string;
  lab: string;
  rating: number;
  comment: string;
  sentiment: 'Positive' | 'Neutral' | 'Needs Attention';
  date: string;
}

const INITIAL_FEEDBACK: FeedbackItem[] = [
  { id: 'f1', student: 'Arjun Mehta', lab: 'Stack Implementation', rating: 5, comment: 'The AI hints were extremely helpful when I got stuck on boundary conditions!', sentiment: 'Positive', date: 'Jul 26, 2026' },
  { id: 'f2', student: 'Priya Sharma', lab: 'Stack Implementation', rating: 4, comment: 'Great lab! The pre-lab quiz prepared me well for the live coding session.', sentiment: 'Positive', date: 'Jul 26, 2026' },
  { id: 'f3', student: 'Amit Das', lab: 'Stack Implementation', rating: 2, comment: 'I struggled with the 60-minute duration limit. Could we have 90 minutes next time?', sentiment: 'Needs Attention', date: 'Jul 25, 2026' },
];

export default function FeedbackPage() {
  const router = useRouter();
  const [feedback, setFeedback] = useState<FeedbackItem[]>(INITIAL_FEEDBACK);

  return (
    <InstructorShell
      activePage="Feedback"
      title="Student Feedback & Lab Sentiment"
      subtitle="Review post-lab student ratings, difficulty feedback, and platform suggestions"
    >
      {/* KPI Cards */}
      <div className={styles.kpiRow}>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Avg Lab Satisfaction</p>
          <p className={styles.kpiValue} style={{ color: '#2563eb' }}>4.6 / 5.0</p>
          <p className={styles.kpiSub}>Based on 48 responses</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>AI Hint Helpfulness</p>
          <p className={styles.kpiValue} style={{ color: '#16a34a' }}>92%</p>
          <p className={styles.kpiSub}>Positive rating</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Duration Feedback</p>
          <p className={styles.kpiValue} style={{ color: '#b45309' }}>Adequate</p>
          <p className={styles.kpiSub}>85% comfortable</p>
        </div>
        <div className={styles.kpiCard}>
          <p className={styles.kpiLabel}>Action Items</p>
          <p className={styles.kpiValue} style={{ color: '#7c3aed' }}>01</p>
          <p className={styles.kpiSub}>Duration review requested</p>
        </div>
      </div>

      {/* Feedback List */}
      <section className={styles.sectionCard}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Student Feedback Stream</h2>
            <p className={styles.sectionSub}>Submitted upon lab completion</p>
          </div>
        </div>

        <div className={styles.list}>
          {feedback.map((item) => (
            <div key={item.id} className={styles.listRow}>
              <div className={styles.rowIcon}>
                <MessageSquare size={20} />
              </div>
              <div className={styles.rowBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <p className={styles.rowTitle}>{item.student}</p>
                  <span className={`${styles.badge} ${item.sentiment === 'Positive' ? styles.greenBadge : styles.amberBadge}`}>
                    {item.sentiment}
                  </span>
                </div>
                <p className={styles.rowMeta}>{item.lab} · Rating: {'★'.repeat(item.rating)} ({item.rating}/5)</p>
                <p className={styles.rowSub}>"{item.comment}"</p>
              </div>
              <span className={styles.rowMeta}>{item.date}</span>
            </div>
          ))}
        </div>
      </section>
    </InstructorShell>
  );
}
