'use client';

import StudentShell from '@/components/layout/StudentShell';
import styles from './page.module.css';

const CONCEPTS = [
  { name: 'Sorting Algorithms',    mastery: 92 },
  { name: 'Stack & Queue',         mastery: 78 },
  { name: 'Binary Trees',          mastery: 65 },
  { name: 'Graph Algorithms',      mastery: 55 },
  { name: 'Dynamic Programming',   mastery: 48 },
  { name: 'Acid-Base Chemistry',   mastery: 85 },
  { name: 'Thermodynamics',        mastery: 72 },
];

const SCORES = [
  { exp: 'Stack Implementation',   score: 88, max: 100, date: 'Jul 2'  },
  { exp: 'Projectile Motion',      score: 95, max: 100, date: 'Jun 11' },
  { exp: 'Titration Lab',          score: 82, max: 100, date: 'Jul 18' },
  { exp: 'Circuit Design',         score: 76, max: 100, date: 'Jul 5'  },
  { exp: 'Heat Transfer',          score: 91, max: 100, date: 'Jul 10' },
];

const BAR_H = 120;

export default function AnalyticsPage() {
  const avg = Math.round(SCORES.reduce((s, r) => s + r.score, 0) / SCORES.length);

  return (
    <StudentShell activePage="Performance Analytics" title="Performance Analytics" subtitle="Track your learning progress and concept mastery">
      {/* KPI Strip */}
      <div className={styles.kpiRow}>
        {[
          { label: 'Overall Score', value: `${avg}%`,   color: '#8b5cf6', sub: 'Average across all labs'     },
          { label: 'Experiments',   value: '5',         color: '#22c55e', sub: 'Completed this semester'      },
          { label: 'Current Rank',  value: '#12',       color: '#f59e0b', sub: 'Out of 45 students'           },
          { label: 'Study Hours',   value: '18.5h',     color: '#ec4899', sub: 'This week'                    },
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
          <div className={styles.barChart}>
            {SCORES.map(r => (
              <div key={r.exp} className={styles.barGroup}>
                <div className={styles.barWrap}>
                  <div
                    className={styles.bar}
                    style={{
                      height: `${(r.score / r.max) * BAR_H}px`,
                      background: r.score >= 90 ? 'linear-gradient(180deg,#22c55e,#16a34a)' :
                                  r.score >= 75 ? 'linear-gradient(180deg,#8b5cf6,#7c3aed)' :
                                                  'linear-gradient(180deg,#f59e0b,#f2994a)',
                    }}
                  />
                </div>
                <p className={styles.barScore}>{r.score}</p>
                <p className={styles.barLabel}>{r.date}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Concept Mastery */}
        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Concept Mastery</h2>
          <div className={styles.masteryList}>
            {CONCEPTS.map(c => (
              <div key={c.name} className={styles.masteryRow}>
                <span className={styles.masteryName}>{c.name}</span>
                <div className={styles.masteryTrack}>
                  <div
                    className={styles.masteryFill}
                    style={{
                      width: `${c.mastery}%`,
                      background: c.mastery >= 80 ? '#22c55e' : c.mastery >= 60 ? '#8b5cf6' : '#f59e0b',
                    }}
                  />
                </div>
                <span className={styles.masteryPct}>{c.mastery}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Score Table */}
      <div className={styles.tableCard}>
        <h2 className={styles.chartTitle}>Experiment Results</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Experiment</th>
              <th>Score</th>
              <th>Max</th>
              <th>Percentage</th>
              <th>Date</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {SCORES.map(r => {
              const pct = Math.round((r.score / r.max) * 100);
              const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : 'C';
              return (
                <tr key={r.exp}>
                  <td className={styles.tdName}>{r.exp}</td>
                  <td className={styles.tdScore}>{r.score}</td>
                  <td>{r.max}</td>
                  <td>
                    <div className={styles.pctBar}>
                      <div className={styles.pctFill} style={{ width: `${pct}%`, background: pct >= 90 ? '#22c55e' : pct >= 75 ? '#8b5cf6' : '#f59e0b' }} />
                      <span>{pct}%</span>
                    </div>
                  </td>
                  <td>{r.date}</td>
                  <td><span className={`${styles.gradePill} ${pct >= 90 ? styles.gradeA : pct >= 75 ? styles.gradeB : styles.gradeC}`}>{grade}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </StudentShell>
  );
}
