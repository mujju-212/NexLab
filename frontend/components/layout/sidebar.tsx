'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Role = 'admin' | 'instructor' | 'student';

const navItems: Record<Role, { href: string; label: string }[]> = {
  admin: [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/users/students', label: 'Students' },
    { href: '/admin/users/instructors', label: 'Instructors' },
    { href: '/admin/academic/departments', label: 'Departments' },
    { href: '/admin/academic/subjects', label: 'Subjects' },
    { href: '/admin/assignments', label: 'Assignments' },
    { href: '/admin/analytics', label: 'Analytics' },
    { href: '/admin/monitoring/server-health', label: 'Monitoring' },
    { href: '/admin/settings', label: 'Settings' },
  ],
  instructor: [
    { href: '/instructor/dashboard', label: 'Dashboard' },
    { href: '/instructor/experiments', label: 'Experiments' },
    { href: '/instructor/sessions', label: 'Sessions' },
    { href: '/instructor/grading', label: 'Grading' },
    { href: '/instructor/viva', label: 'Viva' },
    { href: '/instructor/analytics', label: 'Analytics' },
    { href: '/instructor/feedback', label: 'Feedback' },
  ],
  student: [
    { href: '/student/dashboard', label: 'Dashboard' },
    { href: '/student/submissions', label: 'Submissions' },
    { href: '/student/analytics', label: 'Analytics' },
    { href: '/student/rankings', label: 'Rankings' },
    { href: '/student/certificates', label: 'Certificates' },
    { href: '/student/profile', label: 'Profile' },
  ],
};

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navItems[role];

  return (
    <aside className="w-64 h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800">
        <span className="text-lg font-bold text-blue-600">AI Virtual Lab</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              pathname.startsWith(item.href)
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
