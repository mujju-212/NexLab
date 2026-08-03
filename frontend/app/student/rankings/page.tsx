'use client';

import StudentShell from '@/components/layout/StudentShell';
import styles from './page.module.css';

const RANKINGS = [
  { rank: 1,  name: 'Arjun Mehta',   roll: 'CS21001', score: 98.2, labs: 8, badge: '🥇' },
  { rank: 2,  name: 'Priya Sharma',  roll: 'CS21002', score: 96.5, labs: 8, badge: '🥈' },
  { rank: 3,  name: 'Rohan Gupta',   roll: 'CS21003', score: 94.1, labs: 7, badge: '🥉' },
  { rank: 4,  name: 'Neha Pillai',   roll: 'CS21004', score: 93.4, labs: 7, badge: ''   },
  { rank: 5,  name: 'Karan Joshi',   roll: 'CS21005', score: 92.9, labs: 8, badge: ''   },
  { rank: 6,  name: 'Sneha Rao',     roll: 'CS21006', score: 91.7, labs: 6, badge: ''   },
  { rank: 7,  name: 'Vikram Nair',   roll: 'CS21007', score: 90.3, labs: 7, badge: ''   },
  { rank: 8,  name: 'Pooja Iyer',    roll: 'CS21008', score: 89.8, labs: 6, badge: ''   },
  { rank: 9,  name: 'Dev Chatterjee',roll: 'CS21009', score: 88.5, labs: 5, badge: ''   },
  { rank: 10, name: 'Ananya Singh',  roll: 'CS21010', score: 87.9, labs: 6, badge: ''   },
  { rank: 11, name: 'Rahul Verma',   roll: 'CS21011', score: 87.2, labs: 5, badge: ''   },
  { rank: 12, name: 'Riya Singh',    roll: 'CS21012', score: 92.5, labs: 5, badge: '', isMe: true },
  { rank: 13, name: 'Isha Kumar',    roll: 'CS21013', score: 86.1, labs: 5, badge: ''   },
  { rank: 14, name: 'Amit Das',      roll: 'CS21014', score: 85.4, labs: 4, badge: ''   },
  { rank: 15, name: 'Nisha Reddy',   roll: 'CS21015', score: 84.2, labs: 4, badge: ''   },
];

const AVATARS = ['#8b5cf6','#ec4899','#f59e0b','#0ea5e9','#22c55e','#f97316','#6366f1','#14b8a6'];

export default function RankingsPage() {
  const me = RANKINGS.find(r => r.isMe)!;
  return (
    <StudentShell activePage="Ranking" title="Class Rankings" subtitle="Compare your performance with peers in your section">

      {/* My Position Banner */}
      <div className={styles.myBanner}>
        <div className={styles.myLeft}>
          <div className={styles.myRank}># {me.rank}</div>
          <div>
            <p className={styles.myName}>🙋 Your Position</p>
            <p className={styles.mySub}>Score: {me.score}% · {me.labs} Labs Completed</p>
          </div>
        </div>
        <div className={styles.myRight}>
          <div className={styles.myProgress}>
            <span>Next rank: {me.rank - 1}</span>
            <div className={styles.myTrack}>
              <div className={styles.myFill} style={{ width: `${(me.score / RANKINGS[me.rank - 2]?.score) * 100}%` }} />
            </div>
            <span>{(RANKINGS[me.rank - 2]?.score - me.score).toFixed(1)}% gap</span>
          </div>
        </div>
      </div>

      {/* Podium Top 3 */}
      <div className={styles.podium}>
        {[RANKINGS[1], RANKINGS[0], RANKINGS[2]].map((r, i) => (
          <div key={r.rank} className={`${styles.podiumCard} ${i === 1 ? styles.podiumFirst : ''}`}>
            <div className={styles.podiumBadge}>{r.badge}</div>
            <div className={styles.podiumAvatar} style={{ background: AVATARS[r.rank % AVATARS.length] }}>
              {r.name.split(' ').map(n => n[0]).join('')}
            </div>
            <p className={styles.podiumName}>{r.name}</p>
            <p className={styles.podiumScore}>{r.score}%</p>
          </div>
        ))}
      </div>

      {/* Full Table */}
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Student</th>
              <th>Roll No.</th>
              <th>Score</th>
              <th>Labs Done</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {RANKINGS.map(r => (
              <tr key={r.rank} className={r.isMe ? styles.myRow : ''}>
                <td>
                  <span className={`${styles.rankPill} ${r.rank <= 3 ? styles.rankTop : ''}`}>
                    {r.badge || `#${r.rank}`}
                  </span>
                </td>
                <td>
                  <div className={styles.studentCell}>
                    <div className={styles.studentAvatar} style={{ background: AVATARS[r.rank % AVATARS.length] }}>
                      {r.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <span className={styles.studentName}>{r.name} {r.isMe && <span className={styles.youTag}>You</span>}</span>
                  </div>
                </td>
                <td className={styles.rollNo}>{r.roll}</td>
                <td className={styles.scoreTd}>{r.score}%</td>
                <td className={styles.labsTd}>{r.labs}</td>
                <td>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${r.score}%`, background: r.isMe ? '#8b5cf6' : r.rank <= 3 ? '#f59e0b' : '#22c55e' }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StudentShell>
  );
}
