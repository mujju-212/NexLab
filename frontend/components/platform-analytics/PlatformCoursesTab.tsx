'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  CheckCircle2,
  Award,
  Zap,
  ArrowRight,
  Search,
  Bookmark,
  MoreHorizontal,
  Copy,
  ExternalLink,
  Share2,
  Check,
  X,
  Trophy,
  Download,
} from 'lucide-react';
import {
  platformUserService,
  type PlatformCoursesAnalytics,
  type PlatformCourseItem,
} from '@/services/platform-user.service';
import styles from './platform-analytics.module.css';

/**
 * Clean course titles and remove any stray inter-character em-dashes or replacement characters
 */
export const formatDisplayTitle = (raw: string): string => {
  if (!raw) return '';
  // Check if string was corrupted with inter-character em-dashes (e.g., "—S—Q—L— —F—o—u—n—d—a—t—i—o—n—s—")
  if (raw.includes('—') && /—[A-Za-z0-9]—/.test(raw)) {
    const cleaned = raw.replace(/—/g, '').replace(/\s+/g, ' ').trim();
    if (cleaned === 'Data Structures 1') return 'Data Structures - 1';
    if (cleaned === 'Python Programming Advanced') return 'Python Programming - Advanced';
    return cleaned;
  }
  return raw.replace(/[\ufffd\uFFFD]/g, '-').trim();
};

interface PlatformCoursesTabProps {
  initialCourses?: PlatformCourseItem[];
  onOpenShare?: () => void;
}

export const PlatformCoursesTab: React.FC<PlatformCoursesTabProps> = ({
  initialCourses,
  onOpenShare,
}) => {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('All Levels');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'completed' | 'not_started'>('all');
  const [techFilter, setTechFilter] = useState<string>('All Technologies');
  const [sortBy, setSortBy] = useState<string>('Recently Added');
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [viewingCert, setViewingCert] = useState<{
    certId: string | null;
    courseTitle: string;
    courseId?: string;
    completedAt?: string;
    downloadUrl?: string;
  } | null>(null);

  // Load persistent bookmarks from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('nexlab_bookmarked_courses');
      if (saved) {
        setBookmarkedIds(new Set(JSON.parse(saved)));
      }
    } catch {
      // ignore
    }
  }, []);

  // Save persistent bookmarks
  const toggleBookmark = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      const isAdding = !next.has(id);
      if (isAdding) next.add(id);
      else next.delete(id);
      try {
        localStorage.setItem('nexlab_bookmarked_courses', JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      showToast(isAdding ? 'Course bookmarked' : 'Bookmark removed');
      return next;
    });
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Close card context menus on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActiveMenuId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  // Query Courses Analytics from real platform API
  const { data: coursesData, isLoading } = useQuery<PlatformCoursesAnalytics>({
    queryKey: ['free-courses-analytics'],
    queryFn: () => platformUserService.getCoursesAnalytics(),
    staleTime: 30 * 1000,
  });

  // Real Database Courses
  const allCourses: PlatformCourseItem[] = useMemo(() => {
    const list = coursesData?.courses ?? initialCourses ?? [];
    return list.map((c) => ({
      ...c,
      title: formatDisplayTitle(c.title),
    }));
  }, [coursesData?.courses, initialCourses]);

  // Real Metrics from Database
  const totalEnrolled = coursesData?.enrolled_courses ?? allCourses.length;
  const enrolledThisMonth = coursesData?.enrolled_this_month;
  const completedCourses = coursesData?.completed_courses ?? 0;
  const completedPct = coursesData?.completed_pct ?? (allCourses.length > 0 ? Math.round((completedCourses / allCourses.length) * 100) : 0);
  const totalSolved = coursesData?.total_exercises_solved ?? 0;
  const verifiedCerts = coursesData?.certificates?.length ?? 0;

  // Filter & sort logic on real courses
  const filteredCourses = useMemo(() => {
    const result = allCourses.filter((c) => {
      // Search filter
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.title.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        (c.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        (c.language || '').toLowerCase().includes(q);

      // Level filter
      const matchesLevel =
        levelFilter === 'All Levels' ||
        (c.difficulty || '').toLowerCase() === levelFilter.toLowerCase();

      // Tech filter
      const matchesTech =
        techFilter === 'All Technologies' ||
        (c.language || '').toLowerCase().includes(techFilter.toLowerCase()) ||
        (c.title || '').toLowerCase().includes(techFilter.toLowerCase()) ||
        (c.tags || []).some((t) => t.toLowerCase().includes(techFilter.toLowerCase()));

      // Status filter
      const pct = Math.round(c.completion_pct ?? 0);
      let matchesStatus = true;
      if (statusFilter === 'completed') matchesStatus = pct >= 100 || c.cert_eligible;
      else if (statusFilter === 'in_progress') matchesStatus = pct > 0 && pct < 100;
      else if (statusFilter === 'not_started') matchesStatus = pct === 0;

      return matchesSearch && matchesLevel && matchesTech && matchesStatus;
    });

    // Sorting
    if (sortBy === 'Progress: High to Low') {
      result.sort((a, b) => (b.completion_pct ?? 0) - (a.completion_pct ?? 0));
    } else if (sortBy === 'Progress: Low to High') {
      result.sort((a, b) => (a.completion_pct ?? 0) - (b.completion_pct ?? 0));
    } else if (sortBy === 'Alphabetical') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'Most Lessons') {
      result.sort((a, b) => (b.exercise_count ?? 0) - (a.exercise_count ?? 0));
    }

    return result;
  }, [allCourses, search, levelFilter, techFilter, statusFilter, sortBy]);

  const handleCopyCourseLink = (courseSlug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId(null);
    const url = `${window.location.origin}/practice/${courseSlug}`;
    navigator.clipboard.writeText(url);
    showToast('Course link copied to clipboard!');
  };

  const handleViewCert = (course: PlatformCourseItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveMenuId(null);
    const cert = (coursesData?.certificates || []).find((ct) => ct.course_id === course.id);
    setViewingCert({
      certId: cert?.certificate_id || null,
      courseTitle: course.title,
      courseId: course.id,
      completedAt: cert?.completed_at || course.completed_at || undefined,
      downloadUrl: cert?.download_url || `/api/platform-user/courses/${course.id}/certificate`,
    });
  };

  /**
   * Crisp, authentic vector logos for modern technology topics
   */
  const renderTechLogo = (lang: string, title: string) => {
    const t = (title || '').toLowerCase();
    const l = (lang || '').toLowerCase();

    // 1. Python Programming Lab / Simulations (Chemistry Beaker)
    if (t.includes('lab') || t.includes('simulation')) {
      return (
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
          <path
            d="M20 8H28M22 8V18L10 38C8.5 40.5 10.3 43 13.2 43H34.8C37.7 43 39.5 40.5 38 38L26 18V8"
            stroke="#0284c7"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M13 36L19 26H29L35 36C33 39 15 39 13 36Z"
            fill="#38bdf8"
            opacity="0.85"
          />
          <circle cx="21" cy="32" r="2" fill="#ffffff" />
          <circle cx="27" cy="30" r="1.5" fill="#ffffff" />
        </svg>
      );
    }

    // 2. Data Structures & Algorithms (3D isometric cubes)
    if (t.includes('dsa') || t.includes('data structures & algorithms')) {
      return (
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
          <path d="M24 6L38 14V28L24 36L10 28V14L24 6Z" fill="#3b82f6" opacity="0.85" />
          <path d="M24 6L38 14L24 22L10 14L24 6Z" fill="#60a5fa" />
          <path d="M24 22V36L10 28V14L24 22Z" fill="#2563eb" />
          <path d="M24 22L38 14V28L24 36V22Z" fill="#1d4ed8" />
          <circle cx="34" cy="34" r="7" fill="#f43f5e" />
          <circle cx="16" cy="36" r="5" fill="#10b981" />
        </svg>
      );
    }

    // 3. Algorithm Basics (Network graph)
    if (t.includes('algorithm') || t.includes('algo')) {
      return (
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
          <circle cx="14" cy="14" r="6" fill="#8b5cf6" />
          <circle cx="34" cy="18" r="5" fill="#3b82f6" />
          <circle cx="22" cy="34" r="6.5" fill="#6366f1" />
          <circle cx="38" cy="36" r="4.5" fill="#ec4899" />
          <line x1="18" y1="17" x2="30" y2="19" stroke="#cbd5e1" strokeWidth="2.5" />
          <line x1="16" y1="19" x2="20" y2="28" stroke="#cbd5e1" strokeWidth="2.5" />
          <line x1="28" y1="34" x2="34" y2="35" stroke="#cbd5e1" strokeWidth="2.5" />
          <line x1="33" y1="23" x2="25" y2="30" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="2 2" />
        </svg>
      );
    }

    // 4. Data Structures — 1 / Data Structures (Database cylinder stack)
    if (t.includes('data structures') || t.includes('graphs & trees') || t.includes('trees')) {
      return (
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
          <ellipse cx="24" cy="12" rx="14" ry="5" fill="#38bdf8" stroke="#0284c7" strokeWidth="2.5" />
          <path d="M10 12V22C10 24.8 16.3 27 24 27C31.7 27 38 24.8 38 22V12" stroke="#0284c7" strokeWidth="2.5" fill="#0284c7" opacity="0.3" />
          <path d="M10 22V32C10 34.8 16.3 37 24 37C31.7 37 38 34.8 38 32V22" stroke="#0284c7" strokeWidth="2.5" fill="#0284c7" opacity="0.6" />
        </svg>
      );
    }

    // 5. Java / OOP (Steaming coffee cup)
    if (t.includes('oop') || t.includes('java') || t.includes('object oriented') || l.includes('java')) {
      return (
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
          <path
            d="M32 20H14C11.8 20 10 21.8 10 24V32C10 37.5 14.5 42 20 42H26C31.5 42 36 37.5 36 32V24C36 21.8 34.2 20 32 20Z"
            fill="#0284c7"
          />
          <path
            d="M36 24H38C40.2 24 42 25.8 42 28C42 30.2 40.2 32 38 32H36V24Z"
            stroke="#0284c7"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M18 10C18 10 20 12 18 15M23 8C23 8 26 11 23 16M28 10C28 10 30 12 28 15"
            stroke="#ea580c"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    // 6. SQL Foundations (Amber database cylinder)
    if (t.includes('sql') || l.includes('sql')) {
      return (
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
          <ellipse cx="24" cy="14" rx="14" ry="5.5" fill="#f59e0b" />
          <path d="M10 14V34C10 37 16.3 39.5 24 39.5C31.7 39.5 38 37 38 34V14" stroke="#d97706" strokeWidth="3" fill="#fbbf24" opacity="0.6" />
          <path d="M10 24C10 27 16.3 29 24 29C31.7 29 38 27 38 24" stroke="#d97706" strokeWidth="2.5" />
        </svg>
      );
    }

    // 7. C++ Essentials (Blue shield)
    if (t.includes('c++') || l.includes('cpp')) {
      return (
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
          <path d="M24 6L40 15.5V32.5L24 42L8 32.5V15.5L24 6Z" fill="#00599C" />
          <path d="M23 20C20.8 20 19 21.8 19 24C19 26.2 20.8 28 23 28H25" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          <path d="M30 24H34M32 22V26M37 24H41M39 22V26" stroke="#659AD2" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    }

    // 8. Artificial Intelligence & ML (Neural chip)
    if (t.includes('ai') || t.includes('intelligence') || t.includes('machine learning')) {
      return (
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
          <rect x="12" y="12" width="24" height="24" rx="6" fill="#8b5cf6" />
          <path d="M18 24H30M24 18V30" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          <line x1="24" y1="6" x2="24" y2="12" stroke="#7c3aed" strokeWidth="2.5" />
          <line x1="24" y1="36" x2="24" y2="42" stroke="#7c3aed" strokeWidth="2.5" />
          <line x1="6" y1="24" x2="12" y2="24" stroke="#7c3aed" strokeWidth="2.5" />
          <line x1="36" y1="24" x2="42" y2="24" stroke="#7c3aed" strokeWidth="2.5" />
        </svg>
      );
    }

    // 9. Web Development Basics (Emerald browser window)
    if (t.includes('web') || t.includes('html') || t.includes('css') || l.includes('javascript')) {
      return (
        <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
          <rect x="6" y="8" width="36" height="32" rx="6" fill="#ecfdf5" stroke="#10b981" strokeWidth="2.8" />
          <line x1="6" y1="17" x2="42" y2="17" stroke="#10b981" strokeWidth="2.5" />
          <circle cx="12" cy="12.5" r="1.8" fill="#10b981" />
          <circle cx="17" cy="12.5" r="1.8" fill="#10b981" />
          <circle cx="22" cy="12.5" r="1.8" fill="#10b981" />
          <path d="M16 28L12 32L16 36M24 27L20 37M28 28L32 32L28 36" stroke="#047857" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    }

    // 10. Python Foundations / Python Basics (Authentic Python snakes logo)
    if (t.includes('python') || l.includes('python')) {
      return (
        <svg width="24" height="24" viewBox="0 0 128 128" fill="none">
          <path
            d="M63.5 12C37.5 12 39 23.5 39 23.5L39.1 35.5H64V39H25.5C14 39 4 48.5 4 64C4 79 12 80.5 20.5 80.5H29V71C29 59.5 39 49.5 50.5 49.5H74.5C83.5 49.5 90.5 42 90.5 33V20C90.5 14 83.5 12 63.5 12ZM50 20C52.8 20 55 22.2 55 25C55 27.8 52.8 30 50 30C47.2 30 45 27.8 45 25C45 22.2 47.2 20 50 20Z"
            fill="#3776AB"
          />
          <path
            d="M64.5 116C90.5 116 89 104.5 89 104.5L88.9 92.5H64V89H102.5C114 89 124 79.5 124 64C124 49 116 47.5 107.5 47.5H99V57C99 68.5 89 78.5 77.5 78.5H53.5C44.5 78.5 37.5 86 37.5 95V108C37.5 114 44.5 116 64.5 116ZM78 108C75.2 108 73 105.8 73 103C73 100.2 75.2 98 78 98C80.8 98 83 100.2 83 103C83 105.8 80.8 108 78 108Z"
            fill="#FFD43B"
          />
        </svg>
      );
    }

    // Default Code Document
    return (
      <svg width="24" height="24" viewBox="0 0 48 48" fill="none">
        <path d="M12 8H30L38 16V40H12V8Z" fill="#3b82f6" opacity="0.85" />
        <path d="M30 8V16H38" fill="#93c5fd" />
        <line x1="18" y1="24" x2="26" y2="24" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="30" x2="30" y2="30" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            background: '#0f172a',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: '10px',
            fontSize: '12.5px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            zIndex: 9999,
            fontFamily: "'Space Grotesk', sans-serif",
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <Check size={15} color="#10b981" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          1. HERO HEADER: Title + 3D Graduation Artwork
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.coursesHeroCard}>
        <div className={styles.coursesHeroLeft}>
          <div className={styles.coursesHeroIconBox}>
            <BookOpen size={24} />
          </div>
          <div>
            <h2 className={styles.coursesHeroTitle}>Courses &amp; Certificates</h2>
            <p className={styles.coursesHeroSubtitle}>
              Learn structured courses, build real skills, and earn certificates to showcase your progress.
            </p>
          </div>
        </div>

        <div className={styles.coursesHeroRight}>
          <div className={styles.gradArtBox} title="NexLab Verified Academic Progress">
            {/* Photorealistic 3D Isometric Graduation Cap & Diploma SVG */}
            <svg width="180" height="88" viewBox="0 0 180 88" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="capTopGrad" x1="10" y1="20" x2="110" y2="52" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#8b5cf6" />
                  <stop offset="0.5" stopColor="#7c3aed" />
                  <stop offset="1" stopColor="#5b21b6" />
                </linearGradient>
                <linearGradient id="capBodyGrad" x1="30" y1="42" x2="90" y2="70" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6d28d9" />
                  <stop offset="1" stopColor="#4c1d95" />
                </linearGradient>
                <linearGradient id="diplomaGrad" x1="100" y1="24" x2="168" y2="74" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ffffff" />
                  <stop offset="1" stopColor="#ede9fe" />
                </linearGradient>
                <filter id="glowFilter" x="-10" y="-10" width="200" height="110" filterUnits="userSpaceOnUse">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Ambient Glow */}
              <circle cx="60" cy="40" r="30" fill="#a78bfa" opacity="0.25" filter="url(#glowFilter)" />
              <circle cx="134" cy="45" r="25" fill="#c4b5fd" opacity="0.3" filter="url(#glowFilter)" />

              {/* Diploma Scroll / Certificate Plaque */}
              <g transform="translate(100, 20) rotate(-6)">
                <rect x="0" y="0" width="62" height="46" rx="6" fill="url(#diplomaGrad)" stroke="#c4b5fd" strokeWidth="1.8" />
                <line x1="8" y1="10" x2="44" y2="10" stroke="#cbd5e1" strokeWidth="2.2" strokeLinecap="round" />
                <line x1="8" y1="18" x2="38" y2="18" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
                <line x1="8" y1="25" x2="48" y2="25" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
                <line x1="8" y1="32" x2="32" y2="32" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />

                {/* Gold Seal Emblem on Certificate */}
                <circle cx="48" cy="33" r="6" fill="#fef08a" stroke="#f59e0b" strokeWidth="1.8" />
                <circle cx="48" cy="33" r="3.5" fill="#f59e0b" />
                <path d="M46 39L44 45L48 43L52 45L50 39" fill="#d97706" />
              </g>

              {/* 3D Mortarboard Cap */}
              {/* Cap Lower Base / Skullcap */}
              <path
                d="M28 42V55C28 62 44 67 60 67C76 67 92 62 92 55V42"
                fill="url(#capBodyGrad)"
              />
              <path
                d="M28 55C28 62 44 67 60 67C76 67 92 62 92 55"
                stroke="#4c1d95"
                strokeWidth="2"
              />

              {/* Cap Upper Rhombus / Diamond */}
              <path
                d="M60 18L106 33L60 48L14 33L60 18Z"
                fill="url(#capTopGrad)"
                stroke="#6d28d9"
                strokeWidth="1.5"
              />

              {/* Gold Tassel Button & String */}
              <circle cx="60" cy="33" r="3" fill="#fef08a" stroke="#d97706" strokeWidth="1.2" />
              <path
                d="M60 33Q34 38 24 49"
                stroke="#f59e0b"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
              <ellipse cx="23.5" cy="51" rx="2.5" ry="4.5" fill="#f59e0b" />
            </svg>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          2. TOP 4 METRICS CARDS (Real Database Values)
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.coursesTopGrid4}>
        {/* Card 1: Enrolled */}
        <div className={styles.courseStatCard}>
          <div className={styles.courseStatIconWrap} style={{ background: '#ede9fe', color: '#7c3aed' }}>
            <BookOpen size={20} />
          </div>
          <div className={styles.courseStatContent}>
            <div className={styles.courseStatVal}>{totalEnrolled}</div>
            <div className={styles.courseStatLbl}>Enrolled Courses</div>
            <div className={`${styles.courseStatSub} ${styles.courseStatGreen}`}>
              {enrolledThisMonth != null ? `+${enrolledThisMonth} this month` : ''}
            </div>
          </div>
        </div>

        {/* Card 2: Completed */}
        <div className={styles.courseStatCard}>
          <div className={styles.courseStatIconWrap} style={{ background: '#dcfce7', color: '#10b981' }}>
            <CheckCircle2 size={20} />
          </div>
          <div className={styles.courseStatContent}>
            <div className={styles.courseStatVal}>{completedCourses}</div>
            <div className={styles.courseStatLbl}>Completed Courses</div>
            <div className={`${styles.courseStatSub} ${styles.courseStatGreen}`}>
              {completedPct}% completion
            </div>
          </div>
        </div>

        {/* Card 3: Exercises Solved */}
        <div className={styles.courseStatCard}>
          <div className={styles.courseStatIconWrap} style={{ background: '#ffedd5', color: '#f97316' }}>
            <Zap size={20} />
          </div>
          <div className={styles.courseStatContent}>
            <div className={styles.courseStatVal}>{totalSolved}</div>
            <div className={styles.courseStatLbl}>Total Exercises Solved</div>
            <div className={`${styles.courseStatSub} ${styles.courseStatMuted}`}>
              Across all courses
            </div>
          </div>
        </div>

        {/* Card 4: Verified Certs */}
        <div className={styles.courseStatCard}>
          <div className={styles.courseStatIconWrap} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
            <Award size={20} />
          </div>
          <div className={styles.courseStatContent}>
            <div className={styles.courseStatVal}>{verifiedCerts}</div>
            <div className={styles.courseStatLbl}>Verified Certificates</div>
            <div className={`${styles.courseStatSub} ${styles.courseStatMuted}`}>
              Showcase your achievements
            </div>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          2b. EARNED CERTIFICATES SHOWCASE (Live Database Tracking)
         ═════════════════════════════════════════════════════════════════════ */}
      {coursesData?.certificates && coursesData.certificates.length > 0 && (
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '1rem', padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Award size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  Earned Verified Certificates ({coursesData.certificates.length})
                </h3>
                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                  Official credentials issued for complete curriculum mastery.
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {coursesData.certificates.map((cert) => (
              <div
                key={cert.certificate_id}
                style={{
                  border: '1px solid #c4b5fd',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #ffffff 0%, #faf5ff 100%)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#7c3aed', letterSpacing: '0.5px' }}>
                      {cert.certificate_id}
                    </span>
                    <span style={{ fontSize: '0.72rem', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> Verified
                    </span>
                  </div>
                  <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
                    {cert.course_title}
                  </h4>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Completed {new Date(cert.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const dlUrl = cert.download_url || `/api/platform-user/courses/${cert.course_id}/certificate`;
                      window.open(dlUrl, '_blank');
                    }}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      background: '#7c3aed',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <Download size={13} />
                    <span>Download PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewingCert({
                        certId: cert.certificate_id,
                        courseTitle: cert.course_title,
                        courseId: cert.course_id,
                        completedAt: cert.completed_at,
                        downloadUrl: cert.download_url,
                      });
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      background: '#ffffff',
                      color: '#64748b',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      border: '1px solid #cbd5e1',
                      cursor: 'pointer',
                    }}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          3. SEARCH, FILTERS & STATUS PILLS BAR
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.coursesFilterBar}>
        {/* Search */}
        <div className={styles.coursesSearchBox}>
          <Search size={16} className={styles.coursesSearchIcon} />
          <input
            type="text"
            placeholder="Search courses, topics, or technologies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.coursesSearchInput}
          />
        </div>

        {/* Filter dropdowns + Segmented pills */}
        <div className={styles.coursesFiltersRight}>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className={styles.matrixSelect}
          >
            <option value="All Levels">All Levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className={styles.matrixSelect}
          >
            <option value="all">All Status</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="not_started">Not Started</option>
          </select>

          <select
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
            className={styles.matrixSelect}
          >
            <option value="All Technologies">All Technologies</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
            <option value="dsa">DSA</option>
            <option value="web">Web</option>
            <option value="sql">SQL</option>
            <option value="cpp">C++</option>
            <option value="ai">AI</option>
          </select>

          {/* Segmented Status Pills */}
          <div className={styles.pillsGroup}>
            <button
              type="button"
              className={`${styles.pillOption} ${statusFilter === 'all' ? styles.pillOptionActive : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All Courses
            </button>
            <button
              type="button"
              className={`${styles.pillOption} ${statusFilter === 'in_progress' ? styles.pillOptionActive : ''}`}
              onClick={() => setStatusFilter('in_progress')}
            >
              In Progress
            </button>
            <button
              type="button"
              className={`${styles.pillOption} ${statusFilter === 'completed' ? styles.pillOptionActive : ''}`}
              onClick={() => setStatusFilter('completed')}
            >
              Completed
            </button>
            <button
              type="button"
              className={`${styles.pillOption} ${statusFilter === 'not_started' ? styles.pillOptionActive : ''}`}
              onClick={() => setStatusFilter('not_started')}
            >
              Not Started
            </button>
          </div>
        </div>
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          4. MAIN CATALOG: Section Header & 4-Column Course Cards Grid
         ═════════════════════════════════════════════════════════════════════ */}
      <div className={styles.coursesCatalogCard}>
        <div className={styles.coursesCatalogHeader}>
          <div className={styles.catalogTitleWrap}>
            <div className={styles.catalogIconSquare}>
              <BookOpen size={18} />
            </div>
            <div>
              <h3 className={styles.catalogSectionTitle}>
                My Enrolled Courses ({filteredCourses.length})
              </h3>
              <p className={styles.catalogSectionSubtitle}>
                Continue learning and complete your courses to earn certificates.
              </p>
            </div>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className={styles.matrixSelect}
          >
            <option value="Recently Added">Recently Added</option>
            <option value="Progress: High to Low">Progress: High to Low</option>
            <option value="Progress: Low to High">Progress: Low to High</option>
            <option value="Alphabetical">Alphabetical</option>
            <option value="Most Lessons">Most Lessons</option>
          </select>
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '3.5rem', color: '#64748b' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>⏳</div>
            Loading your courses…
          </div>
        ) : filteredCourses.length > 0 ? (
          <div className={styles.enrolledGrid4}>
            {filteredCourses.map((course) => {
              const isBookmarked = bookmarkedIds.has(course.id);
              const diffNormalized = (course.difficulty || 'beginner').toLowerCase();
              const levelStyle =
                diffNormalized === 'beginner'
                  ? { bg: '#dcfce7', text: '#15803d' }
                  : diffNormalized === 'intermediate'
                  ? { bg: '#f3e8ff', text: '#7c3aed' }
                  : { bg: '#fee2e2', text: '#dc2626' };

              const pct = Math.round(course.completion_pct ?? 0);
              const ringR = 15;
              const ringCirc = 2 * Math.PI * ringR;
              const ringOffset = ringCirc - (pct / 100) * ringCirc;
              const isMenuOpen = activeMenuId === course.id;

              // Ring stroke color: green if 100%, red/orange if ~25%, purple if progress, gray if 0
              const ringColor =
                pct >= 100
                  ? '#10b981'
                  : pct === 25
                  ? '#ea580c'
                  : pct > 0
                  ? '#7c3aed'
                  : '#e2e8f0';

              return (
                <div
                  key={course.id}
                  className={styles.enrolledCard}
                  onClick={() => router.push(`/practice/${course.slug || course.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div>
                    {/* Top Row: Tech Logo + Level Pill + 3-Dots Menu */}
                    <div className={styles.enrolledCardTop}>
                      <div className={styles.enrolledTechIconWrap}>
                        <div className={styles.enrolledTechIcon}>
                          {renderTechLogo(course.language, course.title)}
                        </div>
                        <span
                          className={styles.enrolledLevelPill}
                          style={{
                            background: levelStyle.bg,
                            color: levelStyle.text,
                            textTransform: 'capitalize',
                          }}
                        >
                          {course.difficulty || 'Beginner'}
                        </span>
                      </div>

                      <div className={styles.enrolledCardTopRight}>
                        <button
                          type="button"
                          className={styles.enrolledMenuBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuId(isMenuOpen ? null : course.id);
                          }}
                          title="Course options"
                        >
                          <MoreHorizontal size={16} />
                        </button>

                        {/* Card Context Menu */}
                        {isMenuOpen && (
                          <div className={styles.cardDropdownMenu} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className={styles.cardDropdownItem}
                              onClick={() => {
                                setActiveMenuId(null);
                                router.push(`/practice/${course.slug || course.id}`);
                              }}
                            >
                              <ExternalLink size={13} />
                              <span>Go to Course</span>
                            </button>
                            <button
                              type="button"
                              className={styles.cardDropdownItem}
                              onClick={(e) => handleCopyCourseLink(course.slug, e)}
                            >
                              <Copy size={13} />
                              <span>Copy Link</span>
                            </button>
                            {(pct >= 100 || course.cert_eligible) && (
                              <button
                                type="button"
                                className={styles.cardDropdownItem}
                                onClick={(e) => handleViewCert(course, e)}
                                style={{ color: '#10b981' }}
                              >
                                <Award size={13} />
                                <span>Certificate</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Title & Circular Progress Ring Row */}
                    <div className={styles.enrolledTitleRow}>
                      <h4 className={styles.enrolledTitleText}>{course.title}</h4>

                      <div className={styles.enrolledRingWrap}>
                        <svg width="38" height="38" viewBox="0 0 38 38">
                          <circle
                            cx="19"
                            cy="19"
                            r={ringR}
                            stroke="#f1f5f9"
                            strokeWidth="3.5"
                            fill="none"
                          />
                          <circle
                            cx="19"
                            cy="19"
                            r={ringR}
                            stroke={ringColor}
                            strokeWidth="3.5"
                            strokeDasharray={`${ringCirc} ${ringCirc}`}
                            strokeDashoffset={ringOffset}
                            strokeLinecap="round"
                            fill="none"
                            transform="rotate(-90 19 19)"
                          />
                        </svg>
                        <div className={styles.enrolledRingPct}>{pct}%</div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className={styles.enrolledDescText}>
                      {course.description || 'Hands-on curriculum with interactive coding labs'}
                    </p>

                    {/* Tags */}
                    {course.tags && course.tags.length > 0 && (
                      <div className={styles.enrolledTagsFlex}>
                        {course.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className={styles.enrolledTagItem}>
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Horizontal Progress Bar + Lessons Meta + Actions Row */}
                  <div>
                    <div className={styles.enrolledProgressInfo}>
                      <div className={styles.enrolledLessonTrack}>
                        <div
                          className={styles.enrolledLessonFill}
                          style={{
                            width: `${pct}%`,
                            background:
                              pct >= 100
                                ? '#10b981'
                                : pct === 25
                                ? '#ea580c'
                                : 'linear-gradient(90deg, #7c3aed, #9333ea)',
                          }}
                        />
                      </div>

                      <div className={styles.enrolledLessonCountRow}>
                        <span>
                          {course.solved_count ?? 0} / {course.exercise_count ?? 0} lessons
                        </span>
                        <span className={styles.enrolledXpSpan}>
                          <Zap size={11} fill="#d97706" /> +{course.xp_earned ?? 0} XP
                        </span>
                      </div>
                    </div>

                    <div className={styles.enrolledActionsRow}>
                      <button
                        type="button"
                        className={styles.enrolledStartBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/practice/${course.slug || course.id}`);
                        }}
                      >
                        <span>{pct >= 100 ? 'Review Course' : pct > 0 ? 'Continue Learning' : 'Start Course'}</span>
                        <ArrowRight size={13} />
                      </button>

                      <button
                        type="button"
                        className={`${styles.enrolledBookmarkBtn} ${isBookmarked ? styles.enrolledBookmarkActive : ''}`}
                        onClick={(e) => toggleBookmark(course.id, e)}
                        title={isBookmarked ? 'Remove bookmark' : 'Bookmark course'}
                      >
                        <Bookmark size={15} fill={isBookmarked ? '#7c3aed' : 'none'} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              padding: '3rem',
              textAlign: 'center',
              background: '#f8fafc',
              borderRadius: '1rem',
              border: '1px dashed #cbd5e1',
            }}
          >
            <BookOpen size={36} color="#94a3b8" style={{ margin: '0 auto 0.75rem' }} />
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 800, color: '#334155' }}>
              No matching courses found
            </h4>
            <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.85rem' }}>
              Try adjusting your search query, difficulty level, or technology filter.
            </p>
            <button
              onClick={() => {
                setSearch('');
                setLevelFilter('All Levels');
                setStatusFilter('all');
                setTechFilter('All Technologies');
              }}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '0.625rem',
                background: '#7c3aed',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.85rem',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* ═════════════════════════════════════════════════════════════════════
          5. VERIFIED CERTIFICATE MODAL
         ═════════════════════════════════════════════════════════════════════ */}
      {viewingCert && (
        <div className={styles.certModalOverlay} onClick={() => setViewingCert(null)}>
          <div className={styles.certModalBox} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={styles.certModalCloseBtn}
              onClick={() => setViewingCert(null)}
              title="Close"
            >
              <X size={16} />
            </button>

            <div className={styles.certEmblemBox}>
              <Trophy size={32} />
            </div>

            <h3 className={styles.certModalHeading}>Certificate of Completion</h3>
            <p className={styles.certModalSub}>
              Officially verified by NexLab Academic Engineering
            </p>

            <div className={styles.certCourseBadge}>
              <h4 className={styles.certCourseTitle}>{viewingCert.courseTitle}</h4>
              <div className={styles.certMetaRow}>
                <span>ID: <strong>{viewingCert.certId}</strong></span>
                <span>•</span>
                <span>Verified: <strong>100% Curriculum Mastered</strong></span>
              </div>
            </div>

            <div className={styles.certActionsRow}>
              <button
                type="button"
                className={styles.certPrimaryBtn}
                onClick={() => {
                  const url = viewingCert.downloadUrl || `/api/platform-user/courses/${viewingCert.courseId}/certificate`;
                  window.open(url, '_blank');
                }}
                style={{ background: '#7c3aed', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                className={styles.certSecondaryBtn}
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/verify/${viewingCert.certId}`);
                  showToast('Verification URL copied!');
                }}
              >
                <Share2 size={14} />
                <span>Share Link</span>
              </button>
              <button
                type="button"
                className={styles.certSecondaryBtn}
                onClick={() => setViewingCert(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlatformCoursesTab;
