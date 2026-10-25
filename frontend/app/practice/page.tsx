'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth-store';
import IndividualShell from '@/components/layout/IndividualShell';
import { platformUserService, type PlatformCourse, type Progress } from '@/services/platform-user.service';
import styles from './practice.content.module.css';
import {
  BookOpen, Code2, Trophy, Search, RefreshCw, ChevronRight,
  BarChart2, LayoutGrid, Sparkles, ChevronDown, Check,
  Layers, Database, FileText
} from 'lucide-react';

/* ── Difficulty styling map ── */
const DIFF_CONFIG = {
  beginner:     { label: 'Beginner',     cls: styles.diffBeginner     },
  intermediate: { label: 'Intermediate', cls: styles.diffIntermediate },
  advanced:     { label: 'Advanced',     cls: styles.diffAdvanced     },
} as const;

/* ── Custom High-Fidelity Course Icons matching mockup ── */
function CourseIcon({ slug, language }: { slug: string; language: string }) {
  const s = slug.toLowerCase();
  const l = (language || '').toLowerCase();

  // 1. Python (Python Foundations, Python Basics)
  if (s.includes('python-foundations') || s.includes('python-basics') || (l === 'python' && !s.includes('lab'))) {
    return (
      <svg width="38" height="38" viewBox="0 0 128 128" fill="none">
        <path d="M63.5 12C42.8 12 44.2 21 44.2 21L44.3 30.3H64.2V33.2H36.3C22.6 33.2 12.8 44.9 12.8 58.7C12.8 74.8 20.8 73.2 28.5 73.2H34.4V64.9C34.4 53.6 43.8 44.5 55.4 44.5H74.4C83.5 44.5 90.9 37 90.9 27.8V17.9C90.9 17.9 84.1 12 63.5 12ZM52.4 20.4C55.7 20.4 58.3 23 58.3 26.3C58.3 29.5 55.7 32.1 52.4 32.1C49.2 32.1 46.5 29.5 46.5 26.3C46.5 23 49.2 20.4 52.4 20.4Z" fill="#3776AB"/>
        <path d="M64.5 116C85.2 116 83.8 107 83.8 107L83.7 97.7H63.8V94.8H91.7C105.4 94.8 115.2 83.1 115.2 69.3C115.2 53.2 107.2 54.8 99.5 54.8H93.6V63.1C93.6 74.4 84.2 83.5 72.6 83.5H53.6C44.5 83.5 37.1 91 37.1 100.2V110.1C37.1 110.1 43.9 116 64.5 116ZM75.6 107.6C72.3 107.6 69.7 105 69.7 101.7C69.7 98.5 72.3 95.9 75.6 95.9C78.8 95.9 81.5 98.5 81.5 101.7C81.5 105 78.8 107.6 75.6 107.6Z" fill="#FFD43B"/>
      </svg>
    );
  }

  // 2. Algorithm Basics (Connected node graph)
  if (s.includes('algo') || s.includes('algorithm')) {
    return (
      <svg width="38" height="38" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="10" r="5" fill="#38bdf8" stroke="#0284c7" strokeWidth="2.5"/>
        <circle cx="10" cy="36" r="5" fill="#60a5fa" stroke="#2563eb" strokeWidth="2.5"/>
        <circle cx="38" cy="36" r="5" fill="#818cf8" stroke="#4f46e5" strokeWidth="2.5"/>
        <circle cx="24" cy="26" r="4.5" fill="#9333ea" stroke="#7e22ce" strokeWidth="2"/>
        <line x1="24" y1="15" x2="24" y2="21.5" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="20.5" y1="28.5" x2="13.5" y2="33" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="27.5" y1="28.5" x2="34.5" y2="33" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    );
  }

  // 3. Python Programming Lab (Erlenmeyer science flask)
  if (s.includes('lab') || s.includes('flask') || s.includes('simulation')) {
    return (
      <svg width="38" height="38" viewBox="0 0 48 48" fill="none">
        <path d="M21 8H27V16L37 34C38.5 36.8 36.5 40 33.3 40H14.7C11.5 40 9.5 36.8 11 34L21 16V8Z" fill="#fef08a" stroke="#ca8a04" strokeWidth="2.5" strokeLinejoin="round"/>
        <path d="M14.5 32L17.5 27C19.5 29 23 29 25 27C27 29 30.5 29 33.5 32L34.5 34C35.2 35.3 34.2 37 32.7 37H15.3C13.8 37 12.8 35.3 13.5 34L14.5 32Z" fill="#eab308"/>
        <circle cx="20" cy="32" r="1.5" fill="#ffffff"/>
        <circle cx="27" cy="30" r="2" fill="#ffffff"/>
        <circle cx="23" cy="22" r="1.2" fill="#ca8a04"/>
        <line x1="18" y1="8" x2="30" y2="8" stroke="#ca8a04" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
    );
  }

  // 4. Data Structures (Isometric 3D colored blocks)
  if (s.includes('data-structure') || s.includes('dsa') && !s.includes('problem-solving')) {
    return (
      <svg width="38" height="38" viewBox="0 0 48 48" fill="none">
        {/* Top cube */}
        <polygon points="24,6 34,11 24,16 14,11" fill="#34d399"/>
        <polygon points="14,11 24,16 24,25 14,20" fill="#059669"/>
        <polygon points="24,16 34,11 34,20 24,25" fill="#10b981"/>
        {/* Bottom left cube */}
        <polygon points="14,24 24,29 14,34 4,29" fill="#38bdf8"/>
        <polygon points="4,29 14,34 14,42 4,37" fill="#0284c7"/>
        <polygon points="14,34 24,29 24,37 14,42" fill="#0ea5e9"/>
        {/* Bottom right cube */}
        <polygon points="34,24 44,29 34,34 24,29" fill="#818cf8"/>
        <polygon points="24,29 34,34 34,42 24,37" fill="#4338ca"/>
        <polygon points="34,34 44,29 44,37 34,42" fill="#6366f1"/>
      </svg>
    );
  }

  // 5. SQL Foundations (Database cylinder stack)
  if (s.includes('sql') || l === 'sql') {
    return (
      <svg width="38" height="38" viewBox="0 0 48 48" fill="none">
        <ellipse cx="24" cy="13" rx="16" ry="6" fill="#818cf8" stroke="#4f46e5" strokeWidth="2"/>
        <path d="M8 13V23C8 26.3 15.2 29 24 29C32.8 29 40 26.3 40 23V13" fill="#6366f1" stroke="#4f46e5" strokeWidth="2"/>
        <ellipse cx="24" cy="23" rx="16" ry="6" fill="#a5b4fc" stroke="#4f46e5" strokeWidth="1.5"/>
        <path d="M8 23V33C8 36.3 15.2 39 24 39C32.8 39 40 36.3 40 33V23" fill="#4f46e5" stroke="#3730a3" strokeWidth="2"/>
        <rect x="15" y="27" width="18" height="10" rx="3" fill="#1e1b4b"/>
        <text x="24" y="34.5" fill="#38bdf8" fontSize="6.5" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">SQL</text>
      </svg>
    );
  }

  // 6. Java Essentials (Steaming coffee cup)
  if (s.includes('java') || l === 'java') {
    return (
      <svg width="38" height="38" viewBox="0 0 48 48" fill="none">
        <path d="M12 20H32V32C32 36.4 28.4 40 24 40C19.6 40 16 36.4 16 32V20" fill="#0284c7" stroke="#0369a1" strokeWidth="2"/>
        <path d="M32 23H35C37.2 23 39 24.8 39 27C39 29.2 37.2 31 35 31H32" stroke="#0369a1" strokeWidth="2.5" strokeLinecap="round"/>
        <ellipse cx="22" cy="20" rx="10" ry="2.5" fill="#38bdf8" stroke="#0284c7" strokeWidth="1.5"/>
        <path d="M19 15C19 12 21 11 21 8" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
        <path d="M25 16C25 13 27 12 27 9" stroke="#ea580c" strokeWidth="2" strokeLinecap="round"/>
        <ellipse cx="22" cy="42" rx="13" ry="2" fill="#cbd5e1"/>
      </svg>
    );
  }

  // 7. Web Development (HTML5 & CSS3 & JS badges)
  if (s.includes('web') || l === 'javascript' || s.includes('html')) {
    return (
      <svg width="40" height="38" viewBox="0 0 54 44" fill="none">
        {/* HTML Shield */}
        <path d="M6 6L9 36L21 39.5L33 36L36 6H6Z" fill="#ea580c"/>
        <path d="M21 9V36.5L30.5 33.8L33 9H21Z" fill="#f97316"/>
        <text x="21" y="27" fill="#ffffff" fontSize="16" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">5</text>
        {/* JS Badge overlap */}
        <rect x="25" y="16" width="22" height="22" rx="4" fill="#facc15" stroke="#ca8a04" strokeWidth="1.5"/>
        <text x="36" y="32" fill="#1e1b4b" fontSize="11" fontWeight="800" textAnchor="middle" fontFamily="sans-serif">JS</text>
      </svg>
    );
  }

  // 8. Problem Solving & DSA (Mountain peak with summit flag)
  if (s.includes('problem-solving') || s.includes('dsa') || s.includes('competitive')) {
    return (
      <svg width="38" height="38" viewBox="0 0 48 48" fill="none">
        <polygon points="24,10 6,40 42,40" fill="#a78bfa" stroke="#7c3aed" strokeWidth="2"/>
        <polygon points="24,10 18,20 23,24 27,21 30,23 24,10" fill="#ffffff"/>
        <polygon points="34,22 24,40 44,40" fill="#6d28d9"/>
        <line x1="24" y1="10" x2="24" y2="4" stroke="#b91c1c" strokeWidth="2" strokeLinecap="round"/>
        <polygon points="24,4 32,7 24,10" fill="#ef4444"/>
      </svg>
    );
  }

  // 9. C++ Essentials
  if (s.includes('cpp') || l === 'cpp') {
    return (
      <svg width="38" height="38" viewBox="0 0 48 48" fill="none">
        <polygon points="24,6 40,15 40,33 24,42 8,33 8,15" fill="#0284c7" stroke="#0369a1" strokeWidth="2"/>
        <text x="20" y="28" fill="#ffffff" fontSize="15" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">C</text>
        <text x="31" y="23" fill="#38bdf8" fontSize="10" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">++</text>
      </svg>
    );
  }

  // 10. AI & Machine Learning
  if (s.includes('intelligence') || s.includes('machine-learning') || s.includes('ai')) {
    return (
      <svg width="38" height="38" viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="7" fill="#7c3aed"/>
        <circle cx="12" cy="14" r="4" fill="#38bdf8"/>
        <circle cx="36" cy="14" r="4" fill="#ec4899"/>
        <circle cx="12" cy="34" r="4" fill="#34d399"/>
        <circle cx="36" cy="34" r="4" fill="#f59e0b"/>
        <line x1="24" y1="24" x2="12" y2="14" stroke="#7c3aed" strokeWidth="2"/>
        <line x1="24" y1="24" x2="36" y2="14" stroke="#7c3aed" strokeWidth="2"/>
        <line x1="24" y1="24" x2="12" y2="34" stroke="#7c3aed" strokeWidth="2"/>
        <line x1="24" y1="24" x2="36" y2="34" stroke="#7c3aed" strokeWidth="2"/>
      </svg>
    );
  }

  // Fallback: Terminal Code
  return (
    <div style={{ width: 38, height: 38, borderRadius: 10, background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed' }}>
      <Code2 size={22} strokeWidth={2.2} />
    </div>
  );
}

/* ── Custom Mini-Artwork for card right corner ── */
function CardMiniArt({ slug, language }: { slug: string; language: string }) {
  const s = slug.toLowerCase();

  // Python Foundations: Mini laptop with dark screen and Python logo
  if (s.includes('python-foundations') || s.includes('python-basics')) {
    return (
      <svg width="68" height="50" viewBox="0 0 68 50" fill="none">
        <rect x="12" y="8" width="44" height="28" rx="3" fill="#1e1b4b" stroke="#334155" strokeWidth="1.5"/>
        <rect x="8" y="36" width="52" height="4" rx="2" fill="#cbd5e1"/>
        <circle cx="34" cy="22" r="7" fill="#3776AB"/>
        <circle cx="37" cy="23" r="6" fill="#FFD43B"/>
        <circle cx="32" cy="19" r="1" fill="#ffffff"/>
        <circle cx="39" cy="26" r="1" fill="#1e1b4b"/>
      </svg>
    );
  }

  // Algorithm Basics: Blueprint / Document with connected nodes
  if (s.includes('algo')) {
    return (
      <svg width="68" height="50" viewBox="0 0 68 50" fill="none">
        <rect x="14" y="6" width="40" height="38" rx="4" fill="#ffffff" stroke="#c7d2fe" strokeWidth="1.5"/>
        <circle cx="26" cy="18" r="3.5" fill="#38bdf8"/>
        <circle cx="42" cy="22" r="3.5" fill="#818cf8"/>
        <circle cx="30" cy="34" r="3.5" fill="#4f46e5"/>
        <line x1="26" y1="18" x2="42" y2="22" stroke="#93c5fd" strokeWidth="2"/>
        <line x1="26" y1="18" x2="30" y2="34" stroke="#93c5fd" strokeWidth="2"/>
        <line x1="42" y1="22" x2="30" y2="34" stroke="#c7d2fe" strokeWidth="2"/>
      </svg>
    );
  }

  // Python Lab: Science beakers and glassware
  if (s.includes('lab') || s.includes('flask')) {
    return (
      <svg width="68" height="50" viewBox="0 0 68 50" fill="none">
        <rect x="12" y="10" width="44" height="30" rx="6" fill="#fef9c3" stroke="#fef08a" strokeWidth="1"/>
        <path d="M26 14H32V20L38 32C39 34 37.5 36 35 36H23C20.5 36 19 34 20 32L26 20V14Z" fill="#eab308" stroke="#ca8a04" strokeWidth="1.5"/>
        <circle cx="28" cy="30" r="1.5" fill="#ffffff"/>
        <circle cx="32" cy="28" r="1" fill="#ffffff"/>
        <rect x="42" y="20" width="8" height="16" rx="3" fill="#38bdf8" stroke="#0284c7" strokeWidth="1"/>
      </svg>
    );
  }

  // Data Structures: 3D block stacking
  if (s.includes('data-structure')) {
    return (
      <svg width="68" height="50" viewBox="0 0 68 50" fill="none">
        <polygon points="34,8 48,15 34,22 20,15" fill="#6ee7b7"/>
        <polygon points="20,15 34,22 34,31 20,24" fill="#059669"/>
        <polygon points="34,22 48,15 48,24 34,31" fill="#10b981"/>
        <polygon points="20,26 34,33 34,42 20,35" fill="#3b82f6"/>
        <polygon points="34,33 48,26 48,35 34,42" fill="#60a5fa"/>
      </svg>
    );
  }

  // SQL Foundations: Database disks
  if (s.includes('sql')) {
    return (
      <svg width="68" height="50" viewBox="0 0 68 50" fill="none">
        <ellipse cx="34" cy="15" rx="18" ry="6" fill="#a5b4fc" stroke="#6366f1" strokeWidth="1.5"/>
        <path d="M16 15V25C16 28.3 24 31 34 31C44 31 52 28.3 52 25V15" fill="#818cf8" stroke="#6366f1" strokeWidth="1.5"/>
        <path d="M16 25V35C16 38.3 24 41 34 41C44 41 52 38.3 52 35V25" fill="#6366f1" stroke="#4f46e5" strokeWidth="1.5"/>
      </svg>
    );
  }

  // Java Essentials: Steaming cup with beans
  if (s.includes('java')) {
    return (
      <svg width="68" height="50" viewBox="0 0 68 50" fill="none">
        <rect x="20" y="18" width="24" height="20" rx="5" fill="#0284c7" stroke="#0369a1" strokeWidth="1.5"/>
        <path d="M44 22H48C49.5 22 51 23.5 51 25C51 26.5 49.5 28 48 28H44" stroke="#0369a1" strokeWidth="2"/>
        <path d="M26 12C26 9 28 8 28 5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M34 13C34 10 36 9 36 6" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"/>
        <ellipse cx="32" cy="40" rx="18" ry="3" fill="#e2e8f0"/>
      </svg>
    );
  }

  // Web Development: Browser window mockup
  if (s.includes('web')) {
    return (
      <svg width="68" height="50" viewBox="0 0 68 50" fill="none">
        <rect x="10" y="8" width="48" height="34" rx="4" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5"/>
        <rect x="10" y="8" width="48" height="8" rx="4" fill="#f1f5f9"/>
        <circle cx="16" cy="12" r="1.5" fill="#ef4444"/>
        <circle cx="21" cy="12" r="1.5" fill="#f59e0b"/>
        <circle cx="26" cy="12" r="1.5" fill="#10b981"/>
        <rect x="14" y="20" width="16" height="18" rx="2" fill="#fed7aa"/>
        <rect x="34" y="20" width="20" height="8" rx="2" fill="#bfdbfe"/>
        <rect x="34" y="30" width="20" height="8" rx="2" fill="#fef08a"/>
      </svg>
    );
  }

  // Problem Solving & DSA: Summit mountain flag
  if (s.includes('problem-solving') || s.includes('dsa')) {
    return (
      <svg width="68" height="50" viewBox="0 0 68 50" fill="none">
        <polygon points="34,8 14,40 54,40" fill="#c4b5fd" stroke="#8b5cf6" strokeWidth="1.5"/>
        <polygon points="34,8 26,20 32,23 37,20 34,8" fill="#ffffff"/>
        <line x1="34" y1="8" x2="34" y2="2" stroke="#dc2626" strokeWidth="2" strokeLinecap="round"/>
        <polygon points="34,2 44,5 34,8" fill="#ef4444"/>
      </svg>
    );
  }

  // Fallback: IDE window
  return (
    <svg width="68" height="50" viewBox="0 0 68 50" fill="none">
      <rect x="12" y="8" width="44" height="32" rx="4" fill="#1e1b4b" stroke="#334155" strokeWidth="1.5"/>
      <rect x="12" y="8" width="44" height="7" rx="3" fill="#334155"/>
      <circle cx="16" cy="11.5" r="1.2" fill="#ef4444"/>
      <circle cx="20" cy="11.5" r="1.2" fill="#f59e0b"/>
      <circle cx="24" cy="11.5" r="1.2" fill="#10b981"/>
      <text x="34" y="27" fill="#a78bfa" fontSize="9" fontWeight="800" textAnchor="middle" fontFamily="monospace">&lt;/&gt;</text>
    </svg>
  );
}

/* ── Hero Desk Illustration matching mockup ── */
function HeroDeskArtwork() {
  return (
    <svg width="290" height="135" viewBox="0 0 290 135" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="learnGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>

      {/* Desk surface line */}
      <line x1="10" y1="120" x2="275" y2="120" stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round"/>

      {/* Succulent Potted Plant on left */}
      <path d="M22 104L24 120H38L40 104H22Z" fill="#a855f7" rx="1"/>
      <ellipse cx="31" cy="104" rx="9" ry="2.5" fill="#c084fc"/>
      {/* Plant leaves */}
      <path d="M31 104C28 92 18 86 16 93C15 97 25 102 31 104Z" fill="#10b981"/>
      <path d="M31 104C34 92 44 86 46 93C47 97 37 102 31 104Z" fill="#34d399"/>
      <path d="M31 104C29 88 33 80 31 82C29 84 29 96 31 104Z" fill="#059669"/>
      <circle cx="31" cy="94" r="4.5" fill="#10b981"/>

      {/* Stack of 4 Books */}
      {/* Book 1 (Bottom - Navy) */}
      <rect x="52" y="112" width="56" height="8" rx="2" fill="#1e1b4b"/>
      <rect x="54" y="114" width="4" height="4" fill="#e2e8f0"/>
      {/* Book 2 (Teal) */}
      <rect x="50" y="104" width="54" height="8" rx="2" fill="#0d9488"/>
      <line x1="56" y1="108" x2="98" y2="108" stroke="#5eead4" strokeWidth="1.5"/>
      {/* Book 3 (Rose/Pink) */}
      <rect x="54" y="96" width="48" height="8" rx="2" fill="#e11d48"/>
      {/* Book 4 (Top - Purple) */}
      <rect x="52" y="88" width="46" height="8" rx="2" fill="#7c3aed"/>
      <line x1="56" y1="92" x2="92" y2="92" stroke="#d8b4fe" strokeWidth="1.5"/>

      {/* Open Laptop */}
      {/* Laptop base */}
      <rect x="105" y="115" width="76" height="5" rx="2" fill="#64748b"/>
      <rect x="134" y="115" width="18" height="2" rx="1" fill="#94a3b8"/>
      {/* Laptop screen body */}
      <rect x="110" y="66" width="66" height="49" rx="4" fill="#1e1b4b" stroke="#334155" strokeWidth="1.5"/>
      {/* Glowing screen display */}
      <rect x="113" y="69" width="60" height="42" rx="2" fill="#0f172a"/>
      {/* Screen code symbols </> */}
      <text x="143" y="94" fill="#a855f7" fontSize="16" fontWeight="900" textAnchor="middle" fontFamily="monospace">&lt;/&gt;</text>

      {/* Dynamic Purple Arched Arrow pointing up to words */}
      <path d="M192 110 C 205 106, 208 85, 204 70" stroke="#a855f7" strokeWidth="2" strokeDasharray="3 3" fill="none"/>
      <path d="M201 68 L204 70 L207 68" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>

      {/* Handwritten / Script style text: Learn Practice Build Grow */}
      <g transform="translate(216, 42)">
        <text x="0" y="0" fill="url(#learnGrad)" fontSize="13" fontStyle="italic" fontWeight="700" fontFamily="serif">Learn</text>
        <text x="3" y="15" fill="url(#learnGrad)" fontSize="13" fontStyle="italic" fontWeight="700" fontFamily="serif">Practice</text>
        <text x="6" y="30" fill="url(#learnGrad)" fontSize="13" fontStyle="italic" fontWeight="700" fontFamily="serif">Build</text>
        <text x="8" y="45" fill="url(#learnGrad)" fontSize="13.5" fontStyle="italic" fontWeight="800" fontFamily="serif">Grow</text>
      </g>
    </svg>
  );
}

export default function PracticePage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [courses, setCourses] = useState<PlatformCourse[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [diffFilter, setDiffFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('popular');

  useEffect(() => {
    Promise.all([
      platformUserService.listCourses(),
      platformUserService.getProgress().catch(() => null),
    ])
      .then(([coursesData, progressData]) => {
        setCourses(coursesData);
        setProgress(progressData);
      })
      .finally(() => setLoading(false));
  }, []);

  // Filter & Sort Logic
  const filteredCourses = useMemo(() => {
    return courses
      .filter(c => {
        // Search query
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchTitle = c.title.toLowerCase().includes(q);
          const matchDesc = (c.description || '').toLowerCase().includes(q);
          const matchTags = (c.tags || []).some(t => t.toLowerCase().includes(q));
          const matchLang = (c.language || '').toLowerCase().includes(q);
          if (!matchTitle && !matchDesc && !matchTags && !matchLang) return false;
        }

        // Level
        if (diffFilter !== 'all' && c.difficulty !== diffFilter) {
          return false;
        }

        // Category
        if (categoryFilter !== 'all') {
          const cat = categoryFilter.toLowerCase();
          const tags = (c.tags || []).map(t => t.toLowerCase());
          const slug = (c.slug || '').toLowerCase();
          const lang = (c.language || '').toLowerCase();

          if (cat === 'languages') {
            if (!['python', 'java', 'cpp'].includes(lang) && !tags.includes('programming') && !tags.includes('basics')) {
              return false;
            }
          } else if (cat === 'dsa') {
            const isDsa = tags.some(t => ['dsa', 'algorithms', 'trees', 'graphs', 'arrays'].includes(t)) ||
                          slug.includes('algo') || slug.includes('data-structure') || slug.includes('problem-solving');
            if (!isDsa) return false;
          } else if (cat === 'web') {
            const isWeb = tags.some(t => ['web', 'html', 'css', 'javascript'].includes(t)) || slug.includes('web');
            if (!isWeb) return false;
          } else if (cat === 'databases') {
            const isDb = tags.some(t => ['database', 'sql', 'data analysis'].includes(t)) || slug.includes('sql');
            if (!isDb) return false;
          } else if (cat === 'ai') {
            const isAi = tags.some(t => ['ai', 'machine learning', 'simulation', 'virtual lab'].includes(t)) ||
                         slug.includes('intelligence') || slug.includes('machine-learning') || slug.includes('lab');
            if (!isAi) return false;
          }
        }

        // Language
        if (langFilter !== 'all') {
          const target = langFilter.toLowerCase();
          const cLang = (c.language || '').toLowerCase();
          const tags = (c.tags || []).map(t => t.toLowerCase());
          const slug = (c.slug || '').toLowerCase();

          if (target === 'python' && (cLang === 'python' || slug.includes('python'))) return true;
          if (target === 'java' && (cLang === 'java' || slug.includes('java'))) return true;
          if (target === 'cpp' && (cLang === 'cpp' || slug.includes('cpp'))) return true;
          if (target === 'javascript' && (cLang === 'javascript' || slug.includes('web') || tags.includes('javascript'))) return true;
          if (target === 'sql' && (cLang === 'sql' || slug.includes('sql'))) return true;
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'title') {
          return a.title.localeCompare(b.title);
        }
        if (sortBy === 'exercises') {
          return (b.exercise_count || 0) - (a.exercise_count || 0);
        }
        if (sortBy === 'xp') {
          const xpA = a.total_xp || (a.exercise_count ? a.exercise_count * 20 : 200);
          const xpB = b.total_xp || (b.exercise_count ? b.exercise_count * 20 : 200);
          return xpB - xpA;
        }
        // default: popular (order_index)
        return (a.order_index || 0) - (b.order_index || 0);
      });
  }, [courses, search, diffFilter, categoryFilter, langFilter, sortBy]);

  const totalExercises = courses.reduce((a, c) => a + (c.exercise_count || 0), 0);

  const resetAllFilters = () => {
    setSearch('');
    setDiffFilter('all');
    setCategoryFilter('all');
    setLangFilter('all');
    setSortBy('popular');
  };

  const hasActiveFilters = search || diffFilter !== 'all' || categoryFilter !== 'all' || langFilter !== 'all' || sortBy !== 'popular';

  return (
    <IndividualShell activePage="Courses">
      <div className={styles.pageWrapper}>
        
        {/* ══ 1. HERO BANNER ══ */}
        <div className={styles.heroCard}>
          <div className={styles.heroContent}>
            <h1 className={styles.heroTitle}>Explore courses</h1>
            <p className={styles.heroSubtitle}>
              Build real skills through guided lessons, coding challenges, and interactive labs.
            </p>

            <div className={styles.pillRow}>
              <div className={styles.pillChip}>
                <BookOpen size={16} className={styles.pillIconPurple} />
                <span><strong>{courses.length}</strong> Courses</span>
              </div>
              <div className={styles.pillChip}>
                <Code2 size={16} className={styles.pillIconPurple} />
                <span><strong>{totalExercises || '65'}+</strong> Exercises</span>
              </div>
              <div className={styles.pillChip}>
                <Trophy size={16} className={styles.pillIconPurple} />
                <span><strong>XP</strong> Rewards</span>
              </div>
              <div className={styles.pillChip}>
                <BarChart2 size={16} className={styles.pillIconPurple} />
                <span>Learn at your own pace</span>
              </div>
            </div>
          </div>

          <div className={styles.heroIllustrationWrapper}>
            <HeroDeskArtwork />
          </div>
        </div>

        {/* ══ 2. SEARCH & FILTER CONTROLS ══ */}
        <div className={styles.filterSection}>
          
          {/* Top Row: Search Box + Level Pill Toggles */}
          <div className={styles.filterRowTop}>
            <div className={styles.searchBox}>
              <Search size={17} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                placeholder="Search courses or topics (e.g. Python, DSA, SQL, Web...)"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13, padding: '0 4px' }}
                >
                  ✕
                </button>
              )}
            </div>

            <div className={styles.levelFilterGroup}>
              {(['all', 'beginner', 'intermediate', 'advanced'] as const).map(lvl => (
                <button
                  key={lvl}
                  className={`${styles.levelBtn} ${diffFilter === lvl ? styles.levelBtnActive : ''}`}
                  onClick={() => setDiffFilter(lvl)}
                >
                  {lvl === 'all' ? 'All Levels' : DIFF_CONFIG[lvl]?.label ?? lvl}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Row: 3 Dropdown Filters */}
          <div className={styles.filterRowBottom}>
            
            {/* Category Dropdown */}
            <div className={styles.dropdownWrapper}>
              <div className={`${styles.selectBox} ${categoryFilter !== 'all' ? styles.selectBoxActive : ''}`}>
                <LayoutGrid size={15} className={styles.selectIcon} />
                <span className={styles.selectLabel}>
                  {categoryFilter === 'all' && 'All Categories'}
                  {categoryFilter === 'languages' && 'Programming Languages'}
                  {categoryFilter === 'dsa' && 'Data Structures & Algorithms'}
                  {categoryFilter === 'web' && 'Web Development'}
                  {categoryFilter === 'databases' && 'Databases'}
                  {categoryFilter === 'ai' && 'AI & Virtual Labs'}
                </span>
                <ChevronDown size={14} className={styles.selectChevron} />
                <select
                  className={styles.nativeSelect}
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  aria-label="Filter by Category"
                >
                  <option value="all">All Categories</option>
                  <option value="languages">Programming Languages</option>
                  <option value="dsa">Data Structures &amp; Algorithms</option>
                  <option value="web">Web Development</option>
                  <option value="databases">Databases</option>
                  <option value="ai">AI &amp; Virtual Labs</option>
                </select>
              </div>
            </div>

            {/* Language Dropdown */}
            <div className={styles.dropdownWrapper}>
              <div className={`${styles.selectBox} ${langFilter !== 'all' ? styles.selectBoxActive : ''}`}>
                <Code2 size={15} className={styles.selectIcon} />
                <span className={styles.selectLabel}>
                  {langFilter === 'all' && 'All Languages'}
                  {langFilter === 'python' && 'Python'}
                  {langFilter === 'java' && 'Java'}
                  {langFilter === 'cpp' && 'C++'}
                  {langFilter === 'javascript' && 'JavaScript'}
                  {langFilter === 'sql' && 'SQL'}
                </span>
                <ChevronDown size={14} className={styles.selectChevron} />
                <select
                  className={styles.nativeSelect}
                  value={langFilter}
                  onChange={e => setLangFilter(e.target.value)}
                  aria-label="Filter by Language"
                >
                  <option value="all">All Languages</option>
                  <option value="python">Python</option>
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                  <option value="javascript">JavaScript</option>
                  <option value="sql">SQL</option>
                </select>
              </div>
            </div>

            {/* Sort Dropdown */}
            <div className={styles.dropdownWrapper}>
              <div className={`${styles.selectBox} ${sortBy !== 'popular' ? styles.selectBoxActive : ''}`}>
                <Sparkles size={15} className={styles.selectIcon} />
                <span className={styles.selectLabel}>
                  {sortBy === 'popular' && 'Most Popular'}
                  {sortBy === 'title' && 'Title (A - Z)'}
                  {sortBy === 'exercises' && 'Most Exercises'}
                  {sortBy === 'xp' && 'Highest XP'}
                </span>
                <ChevronDown size={14} className={styles.selectChevron} />
                <select
                  className={styles.nativeSelect}
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  aria-label="Sort courses"
                >
                  <option value="popular">Most Popular</option>
                  <option value="title">Title (A - Z)</option>
                  <option value="exercises">Most Exercises</option>
                  <option value="xp">Highest XP</option>
                </select>
              </div>
            </div>

            {/* Filter Count & Reset */}
            <div className={styles.filterStatus}>
              Showing {filteredCourses.length} of {courses.length} courses
              {hasActiveFilters && (
                <button className={styles.resetBtn} onClick={resetAllFilters}>
                  Reset filters
                </button>
              )}
            </div>

          </div>

        </div>

        {/* ══ 3. COURSE CARDS GRID ══ */}
        {loading ? (
          <div className={styles.loadingContainer}>
            <RefreshCw size={26} className={styles.spinAnimation} />
            <span>Loading courses catalog…</span>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className={styles.emptyContainer}>
            <p className={styles.emptyTitle}>No courses match your search or filter</p>
            <p className={styles.emptySubtitle}>
              Try adjusting your query, selecting different tags, or clearing the level filter.
            </p>
            <button className={styles.clearFilterBtn} onClick={resetAllFilters}>
              Clear all filters
            </button>
          </div>
        ) : (
          <div className={styles.coursesGrid}>
            {filteredCourses.map(course => {
              const diffConfig = DIFF_CONFIG[course.difficulty] ?? DIFF_CONFIG.beginner;
              const courseProgress = progress?.by_course?.[course.id];
              const solvedCount = courseProgress?.solved ?? 0;
              const totalCount = course.exercise_count || 1;
              const percent = Math.min(100, Math.round((solvedCount / totalCount) * 100));
              const displayXp = course.total_xp || (course.exercise_count ? course.exercise_count * 20 : 200);

              return (
                <div
                  key={course.id}
                  className={styles.courseCard}
                  onClick={() => router.push(user ? `/practice/${course.slug || course.id}` : `/login?next=${encodeURIComponent(`/practice/${course.slug || course.id}`)}`)}
                >
                  {/* Top Header Row */}
                  <div className={styles.cardTopRow}>
                    <div className={styles.cardLeftHeader}>
                      <div className={styles.badgeAndIcon}>
                        <div className={styles.courseLogoBox}>
                          <CourseIcon slug={course.slug || course.title} language={course.language} />
                        </div>
                        <span className={`${styles.diffBadge} ${diffConfig.cls}`}>
                          {diffConfig.label}
                        </span>
                      </div>
                      <h2 className={styles.cardTitle}>{course.title}</h2>
                    </div>

                    <div className={styles.miniArtBox}>
                      <CardMiniArt slug={course.slug || course.title} language={course.language} />
                    </div>
                  </div>

                  {/* Description */}
                  <p className={styles.cardDesc}>{course.description}</p>

                  {/* Topic Tags */}
                  <div className={styles.tagsRow}>
                    {(course.tags || []).slice(0, 4).map(t => (
                      <span key={t} className={styles.tagPill}>{t}</span>
                    ))}
                  </div>

                  {/* Footer Stats & View course link */}
                  <div className={styles.cardFooter}>
                    <div className={styles.footerStats}>
                      <div className={styles.statItem}>
                        <FileText size={14} className={styles.statIconDoc} />
                        <span>{course.exercise_count} exercises</span>
                      </div>
                      <div className={styles.statItem}>
                        <Trophy size={14} className={styles.statIconTrophy} />
                        <span>{displayXp} XP</span>
                      </div>
                    </div>

                    <button
                      className={styles.viewCourseLink}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(user ? `/practice/${course.slug || course.id}` : `/login?next=${encodeURIComponent(`/practice/${course.slug || course.id}`)}`);
                      }}
                    >
                      View course <ChevronRight size={14} />
                    </button>
                  </div>

                  {/* Progress Status Bar */}
                  <div className={styles.progressRow}>
                    {solvedCount > 0 ? (
                      <>
                        <div className={styles.progressTrack}>
                          <div
                            className={styles.progressFill}
                            style={{ width: `${Math.max(8, percent)}%` }}
                          />
                        </div>
                        <span className={styles.progressText}>{percent}% complete</span>
                      </>
                    ) : (
                      <span className={styles.notStartedText}>Not started</span>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>
    </IndividualShell>
  );
}
