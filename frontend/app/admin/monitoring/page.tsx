'use client';

import { useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import {
  Server, Container, Code2, Brain,
  CheckCircle2, AlertTriangle, XCircle, RefreshCw,
  TrendingUp, Clock, Zap, Cpu, HardDrive, Wifi
} from 'lucide-react';
import styles from './page.module.css';

type MonSection = 'all' | 'server' | 'docker' | 'judge0' | 'ai';

const SYSTEM_LOGS = [
  { time:'10:47 AM', level:'INFO',  service:'Judge0 API',      msg:'Submission compiled & executed successfully (ID: 84271)' },
  { time:'10:45 AM', level:'INFO',  service:'Auth Service',     msg:'User STU089 logged in from 192.168.1.42' },
  { time:'10:43 AM', level:'WARN',  service:'Docker Engine',    msg:'Container judge0-worker-3 high CPU: 87%' },
  { time:'10:41 AM', level:'INFO',  service:'AI Hint Service',  msg:'Hint generated for session 4821 (2.1s response)' },
  { time:'10:39 AM', level:'INFO',  service:'Session Manager',  msg:'Live lab session started: CS301 — Section A (12 students)' },
  { time:'10:36 AM', level:'ERROR', service:'Notification Svc', msg:'Email delivery failed for 3 recipients — retrying' },
  { time:'10:34 AM', level:'INFO',  service:'Knowledge Tracing',msg:'DKVMN model inference completed (batch 48)' },
  { time:'10:31 AM', level:'INFO',  service:'Judge0 API',       msg:'Submission compiled & executed successfully (ID: 84268)' },
  { time:'10:28 AM', level:'WARN',  service:'Memory',           msg:'Heap usage at 78% — approaching threshold' },
  { time:'10:25 AM', level:'INFO',  service:'MediaPipe',        msg:'Face detection active for 8 live lab students' },
];

export default function MonitoringPage() {
  const [section, setSection] = useState<MonSection>('all');

  const cards = [
    {
      id: 'server' as MonSection,
      Icon: Server,
      label: 'Server Health',
      status: 'Healthy',
      statusOk: true,
      metrics: [
        { label:'CPU Usage',    value:'34%',   Icon: Cpu,       color:'#7c3aed' },
        { label:'RAM',          value:'6.2 GB', Icon: HardDrive, color:'#0ea5e9' },
        { label:'Uptime',       value:'14d 7h', Icon: Clock,     color:'#22c55e' },
        { label:'Disk Used',    value:'58%',    Icon: HardDrive, color:'#f59e0b' },
      ],
      bg:'linear-gradient(135deg,#7c3aed,#9333ea)',
    },
    {
      id: 'docker' as MonSection,
      Icon: Container,
      label: 'Docker Resources',
      status: '1 Warning',
      statusOk: false,
      metrics: [
        { label:'Running Containers', value:'14',   Icon: Container, color:'#0ea5e9' },
        { label:'CPU Avg',            value:'52%',  Icon: Cpu,       color:'#f59e0b' },
        { label:'Memory Pool',        value:'8 GB', Icon: HardDrive, color:'#7c3aed' },
        { label:'Net I/O',            value:'1.2GB/s', Icon: Wifi,   color:'#22c55e' },
      ],
      bg:'linear-gradient(135deg,#0ea5e9,#06b6d4)',
    },
    {
      id: 'judge0' as MonSection,
      Icon: Code2,
      label: 'Judge0 API',
      status: 'Operational',
      statusOk: true,
      metrics: [
        { label:'Submissions/Day', value:'847',   Icon: TrendingUp, color:'#7c3aed' },
        { label:'Success Rate',    value:'98.4%', Icon: CheckCircle2, color:'#22c55e' },
        { label:'Avg Exec Time',   value:'1.3s',  Icon: Clock,       color:'#f59e0b' },
        { label:'Queue Length',    value:'3',     Icon: Zap,         color:'#ec4899' },
      ],
      bg:'linear-gradient(135deg,#22c55e,#16a34a)',
    },
    {
      id: 'ai' as MonSection,
      Icon: Brain,
      label: 'AI / ML Services',
      status: 'Operational',
      statusOk: true,
      metrics: [
        { label:'Hint Requests/Day', value:'312',  Icon: Zap,       color:'#7c3aed' },
        { label:'Avg Response',      value:'2.3s', Icon: Clock,     color:'#0ea5e9' },
        { label:'KB Tracing Runs',   value:'94',   Icon: Brain,     color:'#ec4899' },
        { label:'Groq API Calls',    value:'628',  Icon: TrendingUp,color:'#22c55e' },
      ],
      bg:'linear-gradient(135deg,#ec4899,#d6409f)',
    },
  ];

  const display = section === 'all' ? cards : cards.filter(c => c.id === section);

  return (
    <AdminShell activePage="System Monitoring" title="System Monitoring" subtitle="Real-time platform health, resource usage & service status">

      {/* ── Filter Tabs ───────────────────────────────────────────────── */}
      <div className={styles.tabs}>
        {(['all','server','docker','judge0','ai'] as MonSection[]).map(t => (
          <button key={t} className={`${styles.tab} ${section===t ? styles.tabActive : ''}`} onClick={() => setSection(t)}>
            {t === 'all' ? 'All Services' : t === 'judge0' ? 'Judge0 API' : t === 'ai' ? 'AI / ML' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <button className={styles.refreshBtn} title="Refresh">
          <RefreshCw size={14} strokeWidth={2} /> Refresh
        </button>
      </div>

      {/* ── Service Cards ─────────────────────────────────────────────── */}
      <div className={styles.cardsGrid}>
        {display.map(card => (
          <div key={card.id} className={`${styles.serviceCard} ${section === card.id ? styles.serviceCardActive : ''}`}
            onClick={() => setSection(card.id)} style={{ cursor:'pointer' }}>
            <div className={styles.cardHeader}>
              <div className={styles.cardIconWrap} style={{ background: card.bg }}>
                <card.Icon size={20} strokeWidth={1.9} color="#fff" />
              </div>
              <div>
                <p className={styles.cardLabel}>{card.label}</p>
                <span className={`${styles.statusBadge} ${card.statusOk ? styles.statusOk : styles.statusWarn}`}>
                  {card.statusOk ? <CheckCircle2 size={12} strokeWidth={2} /> : <AlertTriangle size={12} strokeWidth={2} />}
                  {card.status}
                </span>
              </div>
            </div>
            <div className={styles.metricsGrid}>
              {card.metrics.map(m => (
                <div key={m.label} className={styles.metric}>
                  <m.Icon size={14} strokeWidth={2} color={m.color} />
                  <p className={styles.metricLabel}>{m.label}</p>
                  <p className={styles.metricValue}>{m.value}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── System Logs ───────────────────────────────────────────────── */}
      <div className={styles.logsSection}>
        <div className={styles.logsHeader}>
          <h2 className={styles.logsTitle}>Live System Logs</h2>
          <span className={styles.liveDot} /><span style={{ fontSize:12, color:'#9891a6', fontWeight:600 }}>Live</span>
        </div>
        <div className={styles.logsWrap}>
          {SYSTEM_LOGS.map((log, i) => (
            <div key={i} className={styles.logRow}>
              <span className={styles.logTime}>{log.time}</span>
              <span className={`${styles.logLevel} ${log.level === 'ERROR' ? styles.logError : log.level === 'WARN' ? styles.logWarn : styles.logInfo}`}>
                {log.level}
              </span>
              <span className={styles.logService}>{log.service}</span>
              <span className={styles.logMsg}>{log.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
