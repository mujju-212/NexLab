'use client';

import { useEffect, useState } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { StudentRanking, SectionSubject } from '@/types';
import { Loader2, Trophy } from 'lucide-react';
import styles from './page.module.css';

const COMPONENT_META: { key: keyof StudentRanking['components']; label: string; weight: string; color: string }[] = [
  { key: 'mastery',     label: 'Concept Mastery', weight: '30%', color: '#9333ea' },
  { key: 'engagement',  label: 'Engagement',      weight: '20%', color: '#22c55e' },
  { key: 'effort',      label: 'Effort',          weight: '20%', color: '#f59e0b' },
  { key: 'efficiency',  label: 'Efficiency',      weight: '15%', color: '#ec4899' },
  { key: 'consistency', label: 'Consistency',     weight: '15%', color: '#38bdf8' },
];

export default function RankingsPage() {
  const [rankings, setRankings] = useState<StudentRanking[]>([]);
  const [subjects, setSubjects] = useState<SectionSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([studentService.getRankings(), studentService.getSubjects()])
      .then(([r, s]) => {
        setRankings(r.sort((a, b) => (a.rank_position ?? 9999) - (b.rank_position ?? 9999)));
        setSubjects(s);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load rankings'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <StudentShell activePage="Ranking" title="My Rankings" subtitle="Your holistic rank score in each enrolled subject">
        <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading rankings…</div>
      </StudentShell>
    );
  }

  const subjectById = new Map(subjects.map(s => [s.section_subject_id, s]));
  const best = rankings.length > 0 ? rankings[0] : null;

  return (
    <StudentShell activePage="Ranking" title="My Rankings" subtitle="Your holistic rank score in each enrolled subject">
      {error && <div className={styles.errorBox}>⚠️ {error}</div>}

      {best && (
        <div className={styles.myBanner}>
          <div className={styles.myLeft}>
            <div className={styles.myRank}>{best.rank_position != null ? `# ${best.rank_position}` : '—'}</div>
            <div>
              <p className={styles.myName}><Trophy size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} />Your Best Position</p>
              <p className={styles.mySub}>
                {subjectById.get(best.section_subject_id)?.subject_name || 'Subject'} · Rank score {best.rank_score}
              </p>
            </div>
          </div>
          <div className={styles.myRight}>
            <p className={styles.mySub}>
              Rank score blends mastery (30%), engagement (20%), effort (20%), efficiency (15%) and consistency (15%).
            </p>
          </div>
        </div>
      )}

      {rankings.length === 0 && !error ? (
        <div className={styles.loadingBox}>No rankings computed yet — rankings appear after your first graded activity.</div>
      ) : (
        <div className={styles.rankGrid}>
          {rankings.map(r => {
            const sub = subjectById.get(r.section_subject_id);
            return (
              <div key={r.section_subject_id} className={styles.rankCard}>
                <div className={styles.rankHead}>
                  <div>
                    <p className={styles.rankSubject}>{sub?.subject_name || 'Subject'}</p>
                    <p className={styles.rankCode}>{sub?.subject_code || '—'}</p>
                  </div>
                  <div className={styles.rankPosBox}>
                    <span className={styles.rankPos}>{r.rank_position != null ? `#${r.rank_position}` : '—'}</span>
                    <span className={styles.rankScore}>{r.rank_score} pts</span>
                  </div>
                </div>
                <div className={styles.compList}>
                  {COMPONENT_META.map(c => {
                    const val = r.components[c.key];
                    return (
                      <div key={c.key} className={styles.compRow}>
                        <span className={styles.compLabel}>{c.label} <em>({c.weight})</em></span>
                        <div className={styles.compTrack}>
                          <div className={styles.compFill} style={{ width: `${Math.min(val, 100)}%`, background: c.color }} />
                        </div>
                        <span className={styles.compVal}>{val}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StudentShell>
  );
}
