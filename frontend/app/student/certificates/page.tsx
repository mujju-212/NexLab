'use client';

import { useState } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import styles from './page.module.css';

const CERTS = [
  { id: 1, exp: 'Mechanics: Projectile Motion Lab', subject: 'Physics',    score: 95, date: 'Jun 12, 2026', grade: 'A+', color: 'linear-gradient(135deg,#a855f7,#7c3aed)' },
  { id: 2, exp: 'Organic Chemistry: Titration Lab', subject: 'Chemistry',  score: 82, date: 'Jul 19, 2026', grade: 'A',  color: 'linear-gradient(135deg,#22c55e,#16a34a)' },
  { id: 3, exp: 'Data Structures: Stack Implementation', subject: 'CS',    score: 88, date: 'Jul 3, 2026',  grade: 'A',  color: 'linear-gradient(135deg,#6366f1,#4f46e5)' },
];

const NOTIFS = [
  { id: 1, type: 'session', msg: 'Upcoming session: Data Structures — Stack Lab starts in 2 hours', time: '2h ago',   unread: true  },
  { id: 2, type: 'grade',   msg: 'Your Titration Lab submission has been graded: 82/100 (A)', time: '1d ago',   unread: true  },
  { id: 3, type: 'reminder', msg: 'Pre-lab reminder: Complete Heat Transfer pre-lab before Aug 2', time: '2d ago',  unread: false },
  { id: 4, type: 'cert',    msg: 'Certificate issued for Projectile Motion Lab — download now!', time: '5d ago',  unread: false },
  { id: 5, type: 'session', msg: 'Session recap: Circuit Design Lab session recording available', time: '1w ago',  unread: false },
];

const NOTIF_ICONS: Record<string, string> = {
  session: '🗓', grade: '📊', reminder: '⏰', cert: '🏆',
};

export default function CertificatesPage() {
  const [activeTab, setActiveTab] = useState<'certs' | 'notifs'>('certs');

  return (
    <StudentShell activePage="Certificates & Notifications" title="Certificates & Notifications" subtitle="Your achievements and lab session updates">

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${activeTab === 'certs' ? styles.tabActive : ''}`} onClick={() => setActiveTab('certs')}>
          🏆 Certificates ({CERTS.length})
        </button>
        <button className={`${styles.tab} ${activeTab === 'notifs' ? styles.tabActive : ''}`} onClick={() => setActiveTab('notifs')}>
          🔔 Notifications <span className={styles.unreadBadge}>{NOTIFS.filter(n => n.unread).length}</span>
        </button>
      </div>

      {activeTab === 'certs' && (
        <div className={styles.certGrid}>
          {CERTS.map(c => (
            <div key={c.id} className={styles.certCard}>
              <div className={styles.certBanner} style={{ background: c.color }}>
                <div className={styles.certSeal}>🏅</div>
                <p className={styles.certTitle}>Certificate of Completion</p>
                <p className={styles.certSub}>AI Virtual Laboratory</p>
              </div>
              <div className={styles.certBody}>
                <p className={styles.certExp}>{c.exp}</p>
                <div className={styles.certMeta}>
                  <span>📚 {c.subject}</span>
                  <span>📅 {c.date}</span>
                </div>
                <div className={styles.certScore}>
                  <span className={styles.scoreVal}>{c.score}/100</span>
                  <span className={`${styles.gradeBadge}`}>{c.grade}</span>
                </div>
                <div className={styles.certActions}>
                  <button className={styles.downloadBtn}>⬇ Download PDF</button>
                  <button className={styles.shareBtn}>🔗 Share</button>
                </div>
              </div>
            </div>
          ))}

          {/* Empty state if none */}
          {CERTS.length === 0 && (
            <div className={styles.emptyState}>
              <div style={{ fontSize: 48 }}>🏆</div>
              <h3>No certificates yet</h3>
              <p>Complete lab sessions to earn certificates</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'notifs' && (
        <div className={styles.notifList}>
          {NOTIFS.map(n => (
            <div key={n.id} className={`${styles.notifCard} ${n.unread ? styles.notifUnread : ''}`}>
              <div className={styles.notifIcon}>{NOTIF_ICONS[n.type]}</div>
              <div className={styles.notifContent}>
                <p className={styles.notifMsg}>{n.msg}</p>
                <p className={styles.notifTime}>{n.time}</p>
              </div>
              {n.unread && <span className={styles.unreadDot} />}
            </div>
          ))}
        </div>
      )}
    </StudentShell>
  );
}
