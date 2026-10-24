'use client';

import Link from 'next/link';
import { FlaskConical, ClipboardList } from 'lucide-react';
import styles from './InstructorWorkspaceTabs.module.css';

const ITEMS = [
  { id: 'experiments', label: 'Experiments', href: '/instructor/experiments', Icon: FlaskConical },
  { id: 'timed-exams', label: 'Timed Exams', href: '/instructor/exams', Icon: ClipboardList },
] as const;

export default function InstructorWorkspaceTabs({ active }: { active: (typeof ITEMS)[number]['id'] }) {
  return (
    <nav className={styles.tabs} aria-label="Experiments and exams">
      {ITEMS.map(({ id, label, href, Icon }) => (
        <Link
          key={id}
          href={href}
          className={`${styles.tab} ${active === id ? styles.active : ''}`}
          aria-current={active === id ? 'page' : undefined}
        >
          <Icon size={15} strokeWidth={2} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}
