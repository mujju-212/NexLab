'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  FileClock, Megaphone, Upload, TrendingUp, Trophy, ShieldCheck,
  Code2, FlaskConical, Terminal, UserCircle2, LogOut, ChevronRight,
  Library, GraduationCap, Flame, Zap, BookMarked, BookOpen, Sparkles
} from 'lucide-react';
import StudentShell from '@/components/layout/StudentShell';
import { useAuthStore } from '@/store/auth-store';
import { authService } from '@/services/auth.service';
import styles from './more.module.css';

interface MoreItem {
  label: string;
  desc: string;
  Icon: React.ElementType;
  route: string;
  tone: 'violet' | 'emerald' | 'sky' | 'amber' | 'indigo' | 'orange' | 'rose' | 'purple';
  badge?: string;
  badgeType?: 'hot' | 'new' | 'default';
}

interface MoreSection {
  title: string;
  tag?: string;
  items: MoreItem[];
}

const SECTIONS: MoreSection[] = [
  {
    title: 'Platform Offered',
    tag: 'Practice & Upskilling',
    items: [
      { label: 'Practice Library', desc: 'Curated problem sets, algorithms & virtual lab', Icon: Library, route: '/student/practice', tone: 'violet' },
      { label: 'Platform Courses', desc: 'Self-paced certified courses & hands-on modules', Icon: GraduationCap, route: '/student/courses', tone: 'indigo', badge: 'Certified', badgeType: 'new' },
      { label: 'Study Plans', desc: 'Structured skill roadmaps & career paths', Icon: BookMarked, route: '/student/practice/study-plans', tone: 'emerald' },
      { label: 'Daily Challenge', desc: 'Daily coding challenge & streak booster', Icon: Flame, route: '/student/practice/daily', tone: 'orange', badge: 'Streak', badgeType: 'hot' },
      { label: 'Skill Quests', desc: 'Gamified quests, achievements & XP rewards', Icon: Zap, route: '/student/practice/quest', tone: 'amber', badge: 'Rewards' },
      { label: 'Live Coding Lab', desc: 'Collaborative live lab sessions with instructor', Icon: Terminal, route: '/student/live-lab', tone: 'sky' },
    ],
  },
  {
    title: 'Academics & Curricular',
    tag: 'Institution',
    items: [
      { label: 'My Exams', desc: 'Take exams, timed quizzes & check attempts', Icon: FileClock, route: '/student/exams', tone: 'amber' },
      { label: 'My Subjects', desc: 'Enrolled courses, syllabus & lab experiments', Icon: BookOpen, route: '/student/subjects', tone: 'violet' },
      { label: 'Announcements', desc: 'Official notices from your instructors', Icon: Megaphone, route: '/student/announcements', tone: 'sky' },
      { label: 'My Submissions', desc: 'Track every experiment submission & score', Icon: Upload, route: '/student/submissions', tone: 'violet' },
    ],
  },
  {
    title: 'Progress & Recognition',
    tag: 'Growth',
    items: [
      { label: 'Performance Analytics', desc: 'Concept mastery radar, grade trends & radar', Icon: TrendingUp, route: '/student/analytics', tone: 'emerald' },
      { label: 'Leaderboard & Ranks', desc: 'Class cohort & global competitive platform ladder', Icon: Trophy, route: '/student/rankings', tone: 'amber' },
      { label: 'Certificates & Records', desc: 'Verified achievement credentials & signed lab records', Icon: ShieldCheck, route: '/student/certificates', tone: 'sky' },
    ],
  },
  {
    title: 'Lab Tools & Sandbox',
    items: [
      { label: 'Pre-Lab Prep', desc: 'Interactive study guide & AI viva preparation', Icon: FlaskConical, route: '/student/pre-lab', tone: 'violet' },
      { label: 'Cloud Compiler', desc: 'Multi-language playground & cloud executor', Icon: Code2, route: '/student/compiler', tone: 'emerald' },
    ],
  },
];

export default function StudentMorePage() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  const handleLogout = async () => {
    await authService.logout();
    clearAuth();
    router.push('/login');
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'TS';

  const getToneClass = (tone: MoreItem['tone']) => {
    switch (tone) {
      case 'violet': return styles.toneViolet;
      case 'emerald': return styles.toneEmerald;
      case 'sky': return styles.toneSky;
      case 'amber': return styles.toneAmber;
      case 'indigo': return styles.toneIndigo;
      case 'orange': return styles.toneOrange;
      case 'rose': return styles.toneRose;
      case 'purple': return styles.tonePurple;
      default: return styles.toneViolet;
    }
  };

  return (
    <StudentShell activePage="More" title="More">
      <div className={styles.stack}>

        {/* ── Profile card ── */}
        <button type="button" className={styles.profileCard} onClick={() => router.push('/student/profile')}>
          <span className={styles.profileAvatar}>{initials}</span>
          <span className={styles.profileMeta}>
            <span className={styles.profileName}>{user?.full_name || 'Student'}</span>
            <span className={styles.profileEmail}>{user?.email || 'View profile & settings'}</span>
          </span>
          <ChevronRight size={18} strokeWidth={2.2} className={styles.profileChevron} />
        </button>

        {/* ── Sectioned link groups ── */}
        {SECTIONS.map(section => (
          <div key={section.title} className={styles.section}>
            <div className={styles.sectionHeaderRow}>
              <span className={styles.sectionLabel}>{section.title}</span>
              {section.tag && <span className={styles.sectionTag}>{section.tag}</span>}
            </div>
            <div className={styles.group}>
              {section.items.map(({ label, desc, Icon, route, tone, badge, badgeType }) => (
                <button key={route} type="button" className={styles.row} onClick={() => router.push(route)}>
                  <span className={`${styles.rowIcon} ${getToneClass(tone)}`}>
                    <Icon size={19} strokeWidth={2} />
                  </span>
                  <span className={styles.rowMeta}>
                    <span className={styles.rowTitleRow}>
                      <span className={styles.rowLabel}>{label}</span>
                      {badge && (
                        <span className={`${styles.rowBadge} ${badgeType === 'hot' ? styles.rowBadgeHot : badgeType === 'new' ? styles.rowBadgeNew : ''}`}>
                          {badge}
                        </span>
                      )}
                    </span>
                    <span className={styles.rowDesc}>{desc}</span>
                  </span>
                  <ChevronRight size={16} strokeWidth={2.2} className={styles.rowChevron} />
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* ── Platform Promo Card: Keep Learning Go Further ── */}
        <div className={styles.promoBanner} onClick={() => router.push('/student/practice')}>
          <div className={styles.promoCube}>
            <Image src="/icon_cube_3d.jpg" alt="Learn" width={44} height={44} className={styles.promoCubeImg} />
          </div>
          <div className={styles.promoText}>
            <p className={styles.promoTitle}>Keep Learning</p>
            <p className={styles.promoSub}>Go Further</p>
            <p className={styles.promoDesc}>Practice problems. Complete quests. Earn badges.</p>
          </div>
          <div className={styles.promoArrowBtn}>
            <ChevronRight size={15} strokeWidth={2.5} />
          </div>
        </div>

        {/* ── Account & Session ── */}
        <div className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <span className={styles.sectionLabel}>Account & Session</span>
          </div>
          <div className={styles.group}>
            <button type="button" className={styles.row} onClick={() => router.push('/student/profile')}>
              <span className={`${styles.rowIcon} ${styles.toneViolet}`}>
                <UserCircle2 size={19} strokeWidth={2} />
              </span>
              <span className={styles.rowMeta}>
                <span className={styles.rowLabel}>Profile & Preferences</span>
                <span className={styles.rowDesc}>Personal info, security, password & presence</span>
              </span>
              <ChevronRight size={16} strokeWidth={2.2} className={styles.rowChevron} />
            </button>
            <button type="button" className={styles.row} onClick={handleLogout}>
              <span className={styles.rowIconLogout}>
                <LogOut size={19} strokeWidth={2} />
              </span>
              <span className={styles.rowMeta}>
                <span className={`${styles.rowLabel} ${styles.rowLabelDanger}`}>Log out</span>
                <span className={styles.rowDesc}>Sign out of your session securely</span>
              </span>
            </button>
          </div>
        </div>

        <p className={styles.versionNote}>NexLab · Virtual Lab & Experiential Platform</p>
      </div>
    </StudentShell>
  );
}
