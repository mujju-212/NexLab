'use client';

import { useCallback, useEffect, useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import { adminService } from '@/services/admin.service';
import {
  Server, Database, Code2, Brain, Building2,
  CheckCircle2, AlertTriangle, XCircle, RefreshCw, Loader2
} from 'lucide-react';
import styles from './page.module.css';

type Health = Record<string, string>;

export default function MonitoringPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [groqUsage, setGroqUsage] = useState<{ date: string; usage: { institution_id: string; count: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, g] = await Promise.all([
        adminService.getHealth(),
        adminService.getGroqUsage().catch(() => null),
      ]);
      setHealth(h.health);
      setGroqUsage(g);
      setLastChecked(new Date().toLocaleTimeString());
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ok = (s?: string) => s === 'online' || s === 'configured';
  const warn = (s?: string) => s === 'degraded' || s === 'not_configured' || s === 'unknown';

  const statusBadge = (s?: string) => {
    if (!s) return <span className={`${styles.statusBadge} ${styles.statusWarn}`}><Loader2 size={12} strokeWidth={2} /> Checking…</span>;
    if (ok(s)) return <span className={`${styles.statusBadge} ${styles.statusOk}`}><CheckCircle2 size={12} strokeWidth={2} /> {s}</span>;
    if (warn(s)) return <span className={`${styles.statusBadge} ${styles.statusWarn}`}><AlertTriangle size={12} strokeWidth={2} /> {s}</span>;
    return <span className={`${styles.statusBadge} ${styles.statusWarn}`}><XCircle size={12} strokeWidth={2} /> {s}</span>;
  };

  const cards = [
    {
      id: 'database',
      Icon: Database,
      label: 'PostgreSQL Database',
      status: health?.database,
      bg: 'linear-gradient(135deg,#7c3aed,#9333ea)',
      desc: 'Primary data store — institutions, users, sessions, submissions.',
    },
    {
      id: 'execution',
      Icon: Code2,
      label: 'Docker Execution Engine',
      status: health?.execution,
      bg: 'linear-gradient(135deg,#22c55e,#16a34a)',
      desc: 'Docker sandbox — code compilation & test execution.',
    },
    {
      id: 'groq',
      Icon: Brain,
      label: 'Groq AI Service',
      status: health?.groq,
      bg: 'linear-gradient(135deg,#ec4899,#d6409f)',
      desc: 'LLM provider for AI hints and feedback generation.',
    },
  ];

  return (
    <AdminShell activePage="System Monitoring" title="System Monitoring" subtitle="Live platform health checks & AI consumption — straight from the backend">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className={styles.tabs}>
        <span style={{ fontSize: 12.5, color: '#9891a6', fontWeight: 600 }}>
          {lastChecked ? `Last checked ${lastChecked}` : 'Checking services…'}
        </span>
        <button className={styles.refreshBtn} onClick={load} title="Refresh">
          <RefreshCw size={14} strokeWidth={2} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* ── Service Health Cards ─────────────────────────────────────────── */}
      <div className={styles.cardsGrid}>
        {cards.map(card => (
          <div key={card.id} className={styles.serviceCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrap} style={{ background: card.bg }}>
                <card.Icon size={20} strokeWidth={1.9} color="#fff" />
              </div>
              <div>
                <p className={styles.cardLabel}>{card.label}</p>
                {statusBadge(card.status)}
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: '#9891a6', margin: '10px 0 0', lineHeight: 1.5 }}>{card.desc}</p>
          </div>
        ))}
      </div>

      {/* ── Groq Usage Today ─────────────────────────────────────────────── */}
      <div className={styles.logsSection}>
        <div className={styles.logsHeader}>
          <h2 className={styles.logsTitle}>
            <Brain size={16} strokeWidth={2} color="#7c3aed" /> AI (Groq) Usage — {groqUsage?.date ?? 'today'}
          </h2>
          {loading ? (
            <Loader2 size={14} strokeWidth={2} color="#9891a6" className="spin" />
          ) : (
            <span style={{ fontSize: 12, color: '#9891a6', fontWeight: 600 }}>
              {groqUsage?.usage.reduce((s, u) => s + u.count, 0) ?? 0} calls total
            </span>
          )}
        </div>
        <div className={styles.logsWrap}>
          {!groqUsage || groqUsage.usage.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9891a6', padding: '14px 16px', margin: 0 }}>
              No AI calls recorded today. Usage appears here per institution once hints are served.
            </p>
          ) : (
            groqUsage.usage.map(u => (
              <div key={u.institution_id} className={styles.logRow}>
                <span className={styles.logService}><Building2 size={13} strokeWidth={2} /> institution</span>
                <span className={styles.logMsg} style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 12 }}>{u.institution_id.slice(0, 18)}…</span>
                <span className={`${styles.logLevel} ${styles.logInfo}`}>{u.count} calls</span>
              </div>
            ))
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#9891a6', marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Server size={13} strokeWidth={2} /> Host metrics (CPU/RAM) and Docker container stats require infrastructure agents and are not exposed by the API yet.
      </p>
    </AdminShell>
  );
}
