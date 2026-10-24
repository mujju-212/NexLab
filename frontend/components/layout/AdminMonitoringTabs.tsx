'use client';

import Link from 'next/link';
import { Activity, Brain, Container } from 'lucide-react';
import styles from './AdminMonitoringTabs.module.css';

const ITEMS = [
  { id: 'health', label: 'System Health', href: '/admin/monitoring', Icon: Activity },
  { id: 'ai', label: 'AI Usage', href: '/admin/monitoring/ai-usage', Icon: Brain },
  { id: 'execution', label: 'Execution Resources', href: '/admin/monitoring/docker-resources', Icon: Container },
] as const;

export default function AdminMonitoringTabs({ active }: { active: (typeof ITEMS)[number]['id'] }) {
  return (
    <nav className={styles.tabs} aria-label="Platform monitoring">
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
