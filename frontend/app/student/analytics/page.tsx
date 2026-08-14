'use client';

import { useEffect, useState } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import type { StudentDashboard } from '@/types';
import { Loader2 } from 'lucide-react';
import styles from './page.module.css';

interface MasteryRow {
  concept: string;
  mastery_score: number;
  experiment_count: number;
  last_updated: string | null;
}

interface GradeRow {
  id: string;
  auto_grade: number | null;
  manual_grade: number | null;
  manual_feedback: string | null;
  viva_grade: number | null;
  code_quality_grade: number | null;
  hint_deduction: number;
  final_grade: number | null;
  graded_at: string | null;
  is_locked: boolean;
}

const BAR_H = 120;

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

export default function AnalyticsPage() {
  const [dash, setDash] = useState<StudentDashboard | null>(null);
  const [mastery, setMastery] = useState<MasteryRow[]>([]);
  const [grades, setGrades] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      studentService.getDashboard(),
      studentService.getMastery(),
      studentService.getGrades(),
    ])
      .then(([d, m, g]) => {
        setDash(d);
        setMastery(m as MasteryRow[]);
        setGrades((g as GradeRow[]).filter(r => r.final_grade != null)
          .sort((a, b) => (a.graded_at || '').localeCompare(b.graded_at || '')));
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <StudentShell activePage="Performance Analytics" title="Performance Analytics" subtitle="Track your learning progress and concept mastery">
        <div className={styles.loadingBox}><Loader2 size={20} className={styles.spinner} /> Loading analytics…</div>
      </StudentShell>
    );
  }

  if (error) {
    return (
      <StudentShell activePage="Performance Analytics" title="Performance Analytics" subtitle="Track your learning progress and concept mastery">
        <div className={styles.errorBox}>⚠️ {error}</div>
      </StudentShell>
    );
  }

  const bestPosition = dash?.best_rank?.rank_position ?? null;

  return (
    <StudentShell activePage="Performance Analytics" title="Performance Analytics" subtitle="Track your learning progress and concept mastery">
      {/* KPI Strip */}
      <div className={styles.kpiRow}>
        {[
          { label: 'Overall Score', value: dash?.avg_grade != null ? `${dash.avg_grade}%` : '—', color: '#9333ea', sub: 'Average final grade' },
          { label: 'Submissions',   value: `${dash?.total_submissions ?? 0}`,                     color: '#22c55e', sub: 'Code attempts submitted' },
          { label: 'Best Rank',     value: bestPosition != null ? `#${bestPosition}` : '—',       color: '#f59e0b', sub: 'Best position in a subject' },
          { label: 'Hints Used',    value: `${dash?.hints_used_today ?? 0}`,                      color: '#ec4899', sub: 'AI hints used today' },
        ].map(k => (
          <div key={k.label} className={styles.kpiCard}>
            <p className={styles.kpiLabel}>{k.label}</p>
            <p className={styles.kpiValue} style={{ color: k.color }}>{k.value}</p>
            <p className={styles.kpiSub}>{k.sub}</p>
          </div>
        ))}
      </div>

      <div className={styles.chartRow}>
        {/* Score History Bar Chart */}
        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Score History</h2>
          {grades.length === 0 ? (
            <p className={styles.emptyNote}>No graded experiments yet.</p>
          ) : (
            <div className={styles.barChart}>
              {grades.slice(-8).map(r => {
                const score = Math.round(r.final_grade ?? 0);
                return (
                  <div key={r.id} className={styles.barGroup}>
                    <div className={styles.barWrap}>
                      <div
                        className={styles.bar}
                        style={{
                          height: `${(score / 100) * BAR_H}px`,
                          background: score >= 90 ? 'linear-gradient(180deg,#22c55e,#16a34a)' :
                                      score >= 75 ? 'linear-gradient(180deg,#9333ea,#7c3aed)' :
                                                    'linear-gradient(180deg,#f59e0b,#f2994a)',
                        }}
                      />
                    </div>
                    <p className={styles.barScore}>{score}</p>
                    <p className={styles.barLabel}>{fmtDate(r.graded_at)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Concept Mastery */}
        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Concept Mastery</h2>
          {mastery.length === 0 ? (
            <p className={styles.emptyNote}>No concepts tracked yet — complete experiments to build mastery.</p>
          ) : (
            <div className={styles.masteryList}>
              {mastery.map(c => {
                const pct = Math.round(c.mastery_score);
                return (
                  <div key={c.concept} className={styles.masteryRow}>
                    <span className={styles.masteryName}>{c.concept}</span>
                    <div className={styles.masteryTrack}>
                      <div
                        className={styles.masteryFill}
                        style={{
                          width: `${pct}%`,
                          background: pct >= 80 ? '#22c55e' : pct >= 60 ? '#9333ea' : '#f59e0b',
                        }}
                      />
                    </div>
                    <span className={styles.masteryPct}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Grade Breakdown Table */}
      <div className={styles.tableCard}>
        <h2 className={styles.chartTitle}>Grade Breakdown</h2>
        {grades.length === 0 ? (
          <p className={styles.emptyNote}>Nothing graded yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Graded On</th>
                <th>Auto</th>
                <th>Manual</th>
                <th>Viva</th>
                <th>Hint Penalty</th>
                <th>Final</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {grades.map(r => {
                const pct = Math.round(r.final_grade ?? 0);
                return (
                  <tr key={r.id}>
                    <td>{fmtDate(r.graded_at)}</td>
                    <td>{r.auto_grade != null ? Math.round(r.auto_grade) : '—'}</td>
                    <td>{r.manual_grade != null ? Math.round(r.manual_grade) : '—'}</td>
                    <td>{r.viva_grade != null ? Math.round(r.viva_grade) : '—'}</td>
                    <td>{r.hint_deduction ? `−${r.hint_deduction}` : '0'}</td>
                    <td className={styles.tdScore}>{pct}</td>
                    <td>
                      <span className={`${styles.gradePill} ${pct >= 90 ? styles.gradeA : pct >= 75 ? styles.gradeB : styles.gradeC}`}>
                        {r.is_locked ? '🔒 Locked' : 'Published'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </StudentShell>
  );
}
