'use client';

import { useState } from 'react';
import AdminShell from '@/components/layout/AdminShell';
import {
  TrendingUp, Users, AlertTriangle, Brain, Activity,
  BarChart3, ArrowUp, ArrowDown, Filter
} from 'lucide-react';
import styles from './page.module.css';

const AT_RISK = [
  { name:'Kiran Reddy',   dept:'CSE Sem 5', att:'42%', score:38, trend:'down' },
  { name:'Ananya Nair',   dept:'ME Sem 3',  att:'51%', score:44, trend:'down' },
  { name:'Vijay Bhat',    dept:'ECE Sem 7', att:'55%', score:52, trend:'up'   },
  { name:'Meena Shetty',  dept:'CSE Sem 3', att:'58%', score:55, trend:'up'   },
  { name:'Rohit Verma',   dept:'EEE Sem 5', att:'54%', score:48, trend:'down' },
];

const DEPT_STATS = [
  { dept:'CSE', students:480, completion:82, atRisk:5,  avgScore:74, color:'#7c3aed' },
  { dept:'ECE', students:340, completion:78, atRisk:4,  avgScore:71, color:'#0ea5e9' },
  { dept:'ME',  students:290, completion:75, atRisk:6,  avgScore:68, color:'#f59e0b' },
  { dept:'EEE', students:220, completion:80, atRisk:3,  avgScore:72, color:'#22c55e' },
];

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('week');

  return (
    <AdminShell activePage="Platform Analytics" title="Platform Analytics" subtitle="Usage trends, student performance and AI intelligence insights">

      {/* ── Period Filter ─────────────────────────────────────────────── */}
      <div className={styles.topBar}>
        <div className={styles.tabs}>
          {['week','month','semester'].map(p => (
            <button key={p} className={`${styles.tab} ${period===p ? styles.tabActive : ''}`} onClick={() => setPeriod(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <button className={styles.btnSecondary}><Filter size={14} strokeWidth={2} /> Filter</button>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        {[
          { label:'Platform Completion', value:'79%', delta:'+4%', up:true, Icon: TrendingUp,    bg:'linear-gradient(135deg,#7c3aed,#9333ea)' },
          { label:'Active Students',     value:'934', delta:'+8%', up:true, Icon: Users,         bg:'linear-gradient(135deg,#ec4899,#d6409f)' },
          { label:'AI Hints Served',     value:'3.2K',delta:'+21%',up:true, Icon: Brain,         bg:'linear-gradient(135deg,#f59e0b,#f2994a)' },
          { label:'At-Risk Students',    value:'12',  delta:'−3',  up:false,Icon: AlertTriangle,  bg:'linear-gradient(135deg,#f87171,#ef4444)' },
          { label:'Live Sessions Today', value:'8',   delta:'Same',up:true, Icon: Activity,      bg:'linear-gradient(135deg,#06b6d4,#0ea5e9)' },
          { label:'Avg Session Score',   value:'68%', delta:'+2%', up:true, Icon: BarChart3,     bg:'linear-gradient(135deg,#22c55e,#16a34a)' },
        ].map(k => (
          <div key={k.label} className={styles.kpiCard}>
            <div className={styles.kpiIcon} style={{ background: k.bg }}>
              <k.Icon size={17} strokeWidth={1.9} color="#fff" />
            </div>
            <p className={styles.kpiLabel}>{k.label}</p>
            <div className={styles.kpiRow}>
              <span className={styles.kpiValue}>{k.value}</span>
              <span className={`${styles.badge} ${k.up ? styles.badgeUp : styles.badgeDown}`}>
                {k.up ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />}
                {k.delta}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Department Performance ────────────────────────────────────── */}
      <div className={styles.twoCol}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Department Performance</h2>
          {DEPT_STATS.map(d => (
            <div key={d.dept} className={styles.deptRow}>
              <div className={styles.deptTag} style={{ background: d.color + '22', color: d.color }}>
                {d.dept}
              </div>
              <div className={styles.deptMeta}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span className={styles.deptLabel}>{d.students} students</span>
                  <span className={styles.deptPct}>{d.completion}% complete</span>
                </div>
                <div className={styles.barTrack}>
                  <div className={styles.barFill} style={{ width:`${d.completion}%`, background:d.color }} />
                </div>
              </div>
              <span className={styles.scoreChip}>Avg: {d.avgScore}%</span>
            </div>
          ))}
        </div>

        {/* ── At-Risk Students ─────────────────────────────────────────── */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>At-Risk Students <span className={styles.pill}>12</span></h2>
          {AT_RISK.map(s => (
            <div key={s.name} className={styles.riskRow}>
              <div className={styles.riskAvatar}>
                {s.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
              </div>
              <div className={styles.riskInfo}>
                <p className={styles.riskName}>{s.name}</p>
                <p className={styles.riskDept}>{s.dept}</p>
              </div>
              <div className={styles.riskMetrics}>
                <span className={styles.attBadge}>{s.att} att.</span>
                <span className={`${styles.trendBadge} ${s.trend === 'up' ? styles.trendUp : styles.trendDown}`}>
                  {s.trend === 'up' ? <ArrowUp size={10} strokeWidth={2.5} /> : <ArrowDown size={10} strokeWidth={2.5} />}
                  {s.score}%
                </span>
              </div>
            </div>
          ))}
          <button className={styles.viewAllBtn}>View all 12 at-risk students →</button>
        </div>
      </div>

      {/* ── AI Usage ──────────────────────────────────────────────────── */}
      <div className={styles.card} style={{ marginTop:18 }}>
        <h2 className={styles.cardTitle}>Knowledge Intelligence Engine — Usage (Workflow 8)</h2>
        <div className={styles.aiGrid}>
          {[
            { label:'DKVMN Inferences',    value:'94 / day',   pct:62, color:'#7c3aed' },
            { label:'Groq AI Hint Calls',  value:'312 / day',  pct:78, color:'#ec4899' },
            { label:'Recommendation Runs', value:'228 / day',  pct:55, color:'#f59e0b' },
            { label:'Leaderboard Updates', value:'48 / day',   pct:30, color:'#22c55e' },
          ].map(a => (
            <div key={a.label} className={styles.aiCard}>
              <p className={styles.aiLabel}>{a.label}</p>
              <p className={styles.aiValue}>{a.value}</p>
              <div className={styles.aiBarTrack}>
                <div className={styles.aiBarFill} style={{ width:`${a.pct}%`, background:a.color }} />
              </div>
              <p className={styles.aiPct}>{a.pct}% capacity</p>
            </div>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
