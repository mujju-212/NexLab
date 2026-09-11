'use client';

import { useEffect, useState, useMemo } from 'react';
import StudentShell from '@/components/layout/StudentShell';
import { studentService } from '@/services/student.service';
import { getGlobalSocket } from '@/lib/socket';
import {
  Megaphone, Bell, Check, ThumbsUp, Paperclip,
  Clock, ShieldAlert, Sparkles, Loader2, ArrowRight
} from 'lucide-react';
import styles from './page.module.css';

interface Announcement {
  id: string;
  title: string;
  message: string;
  priority: 'normal' | 'important' | 'urgent';
  category: 'general' | 'cancellation' | 'schedule' | 'exam' | 'event';
  author_name: string;
  author_role: string;
  attachment_name?: string | null;
  attachment_url?: string | null;
  attachment_size?: string | null;
  sent_at?: string | null;
  created_at: string;
  likes_count: number;
  is_read: boolean;
  is_liked: boolean;
}

export default function StudentAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'important' | 'exam' | 'schedule'>('all');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = async () => {
    try {
      const res = await studentService.getAnnouncements();
      setAnnouncements(res.announcements);
      setUnreadCount(res.unread_count);
    } catch {
      // keep fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen to real-time new announcements
    const socket = getGlobalSocket();
    if (socket) {
      const handleNew = (data: any) => {
        showToast(`New Announcement: ${data.title}`);
        loadData();
      };
      socket.on('new_announcement', handleNew);
      return () => {
        socket.off('new_announcement', handleNew);
      };
    }
  }, []);

  const handleMarkRead = async (id: string) => {
    // Optimistic UI
    setAnnouncements(prev =>
      prev.map(a => (a.id === id ? { ...a, is_read: true } : a))
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      await studentService.markAnnouncementRead(id);
    } catch {
      // revert if failed
    }
  };

  const handleToggleLike = async (id: string) => {
    // Optimistic UI
    setAnnouncements(prev =>
      prev.map(a => {
        if (a.id === id) {
          const nextLiked = !a.is_liked;
          return {
            ...a,
            is_liked: nextLiked,
            likes_count: nextLiked ? a.likes_count + 1 : Math.max(0, a.likes_count - 1),
          };
        }
        return a;
      })
    );

    try {
      await studentService.toggleAnnouncementLike(id);
    } catch {
      // revert
    }
  };

  const filtered = useMemo(() => {
    return announcements.filter(a => {
      if (filter === 'unread') return !a.is_read;
      if (filter === 'important') return a.priority === 'important' || a.priority === 'urgent';
      if (filter === 'exam') return a.category === 'exam';
      if (filter === 'schedule') return a.category === 'schedule' || a.category === 'cancellation';
      return true;
    });
  }, [announcements, filter]);

  return (
    <StudentShell activePage="Announcements" title="Announcements" subtitle="Stay informed with class updates, lab schedules, and campus notices.">
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 1100,
          background: '#1a1528', color: '#fff', padding: '12px 22px',
          borderRadius: 12, fontSize: 13.5, fontWeight: 600,
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', gap: 8
        }}>
          <Sparkles size={16} color="#c084fc" />
          {toast}
        </div>
      )}

      <div className={styles.container}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.headerTitle}>Campus & Lab Announcements</h1>
            <p className={styles.headerSub}>
              {unreadCount > 0 ? `You have ${unreadCount} unread announcement(s)` : 'You are all caught up!'}
            </p>
          </div>

          <div className={styles.filterChips}>
            <button
              type="button"
              className={`${styles.filterChip} ${filter === 'all' ? styles.filterChipActive : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({announcements.length})
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${filter === 'unread' ? styles.filterChipActive : ''}`}
              onClick={() => setFilter('unread')}
            >
              Unread ({unreadCount})
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${filter === 'important' ? styles.filterChipActive : ''}`}
              onClick={() => setFilter('important')}
            >
              Important
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${filter === 'exam' ? styles.filterChipActive : ''}`}
              onClick={() => setFilter('exam')}
            >
              Exams
            </button>
            <button
              type="button"
              className={`${styles.filterChip} ${filter === 'schedule' ? styles.filterChipActive : ''}`}
              onClick={() => setFilter('schedule')}
            >
              Schedules
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <p style={{ margin: 0, fontSize: 14 }}>Loading your announcements...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: '#fff', borderRadius: 16, border: '1px solid #ede8f5' }}>
            <Megaphone size={32} color="#9ca3af" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 700, color: '#111827' }}>No announcements found</h3>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7280' }}>There are currently no notices matching this filter.</p>
          </div>
        ) : (
          <div className={styles.announcementsList}>
            {filtered.map(ann => {
              const dateStr = ann.sent_at || ann.created_at;
              const formattedDate = dateStr
                ? new Date(dateStr).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })
                : 'Recent';

              return (
                <div key={ann.id} className={styles.announcementCard}>
                  {!ann.is_read && <div className={styles.unreadDot} title="Unread" />}

                  <div className={styles.cardTopRow}>
                    <div className={styles.authorMeta}>
                      <div className={styles.authorAvatar}>
                        {ann.author_name ? ann.author_name.slice(0, 2).toUpperCase() : 'NL'}
                      </div>
                      <div>
                        <p className={styles.authorName}>{ann.author_name || 'NexLab Admin'}</p>
                        <p className={styles.sentTime}>{formattedDate} • {ann.author_role.replace('_', ' ')}</p>
                      </div>
                    </div>

                    <div className={styles.badgeRow}>
                      {ann.priority === 'urgent' && (
                        <span className={`${styles.priorityBadge} ${styles.priorityUrgent}`}>
                          🔥 Urgent
                        </span>
                      )}
                      {ann.priority === 'important' && (
                        <span className={`${styles.priorityBadge} ${styles.priorityImportant}`}>
                          ! Important
                        </span>
                      )}
                      <span className={`${styles.priorityBadge} ${styles.priorityNormal}`}>
                        {ann.category.charAt(0).toUpperCase() + ann.category.slice(1)}
                      </span>
                    </div>
                  </div>

                  <h3 className={styles.cardTitle}>{ann.title}</h3>
                  <p className={styles.cardMessage}>{ann.message}</p>

                  {ann.attachment_name && (
                    <a
                      href={ann.attachment_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.attachmentPill}
                    >
                      <Paperclip size={14} color="#7c3aed" />
                      <span>{ann.attachment_name}</span>
                      <span style={{ color: '#9ca3af', fontSize: 11.5 }}>
                        ({ann.attachment_size || 'Document'})
                      </span>
                    </a>
                  )}

                  <div className={styles.cardBottomRow}>
                    <div className={styles.bottomActions}>
                      <button
                        type="button"
                        className={`${styles.actionBtn} ${ann.is_liked ? styles.actionBtnLiked : ''}`}
                        onClick={() => handleToggleLike(ann.id)}
                      >
                        <ThumbsUp size={13} fill={ann.is_liked ? '#dc2626' : 'none'} />
                        <span>{ann.likes_count > 0 ? ann.likes_count : 'Like'}</span>
                      </button>

                      <button
                        type="button"
                        className={`${styles.actionBtn} ${ann.is_read ? styles.actionBtnActive : ''}`}
                        onClick={() => handleMarkRead(ann.id)}
                      >
                        <Check size={13} />
                        <span>{ann.is_read ? 'Read' : 'Mark as Read'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </StudentShell>
  );
}
