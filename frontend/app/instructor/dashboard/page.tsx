'use client';

import { useRouter } from 'next/navigation';
import InstructorShell from '@/components/layout/InstructorShell';
import {
  PlayCircle, ClipboardCheck, Users, BarChart3,
  FlaskConical, CalendarClock, ArrowUp, ArrowDown,
  Radio, Clock, CheckCircle2, AlertCircle, BookOpen
} from 'lucide-react';
import styles from './page.module.css';

const SESSIONS = [
  { id:'stack-lab-live',       title:'Data Structures — Stack Lab',    section:'Section A', time:'Today, 10:00 AM', students:28, status:'live',      route:'/instructor/live-lab'        },
  { id:'os-scheduling',        title:'OS — Process Scheduling',        section:'Section B', time:'Today, 2:00 PM',  students:24, status:'upcoming',   route:'/instructor/sessions'        },
  { id:'dbms-sql',             title:'DBMS — SQL Queries Lab',         section:'Section A', time:'Tomorrow, 11 AM', students:26, status:'upcoming',   route:'/instructor/sessions'        },
  { id:'chem-titration-done',  title:'Chemistry — Titration Lab',      section:'Section A', time:'Jul 18, 2026',    students:28, status:'completed',  route:'/instructor/grading'         },
];

const PENDING_SUBS = [
  { id:'arjun-stack',  name:'Arjun Mehta',  roll:'CS21001', exp:'Stack Implementation',  submitted:'30 min ago',  auto:'82%', bg:'#7c3aed' },
  { id:'priya-stack',  name:'Priya Sharma', roll:'CS21002', exp:'Stack Implementation',  submitted:'1 hour ago',  auto:'88%', bg:'#0ea5e9' },
  { id:'rohan-heat',   name:'Rohan Gupta',  roll:'CS21003', exp:'Heat Transfer Lab',      submitted:'2 hours ago', auto:'Review', bg:'#f59e0b' },
  { id:'neha-titr',    name:'Neha Pillai',  roll:'CS21004', exp:'Titration Lab',          submitted:'3 hours ago', auto:'Viva', bg:'#22c55e' },
];

export default function InstructorDashboard() {
  const router = useRouter();

  return (
    <InstructorShell activePage="Dashboard">

      {/* ── Welcome Banner ─────────────────────────────────────────────── */}
      <div className={styles.welcomeBanner}>
        <div className={styles.welcomeLeft}>
          <h1>Good morning, Dr. Ramesh 👋</h1>
          <div className={styles.welcomeMeta}>
            <span className={styles.welcomeTag}>
              <FlaskConical size={13} strokeWidth={2} />
              CS301 — Data Structures & Algorithms
            </span>
            <span className={styles.welcomeTag}>
              <Users size={13} strokeWidth={2} />
              Section A · 28 Students
            </span>
          </div>
        </div>
        <div className={styles.welcomeRight}>
          <button className={styles.quickBtn} onClick={() => router.push('/instructor/live-lab')}>
            <Radio size={14} strokeWidth={2} /> Join Live Lab
          </button>
          <button className={styles.quickBtn} onClick={() => router.push('/instructor/grading')}>
            <ClipboardCheck size={14} strokeWidth={2} /> Grade Submissions
          </button>
        </div>
      </div>

      {/* ── 4 Stat Cards ──────────────────────────────────────────────── */}
      <div className={styles.statGrid4}>
        {[
          { label:'Active Students',    value:'28',  sub:'Section A · CS301',              Icon: Users,          bg:'linear-gradient(135deg,#7c3aed,#9333ea)', trend:'up',   delta:'+2',  route:'/instructor/students'  },
          { label:'Sessions This Week', value:'4',   sub:'1 live · 2 upcoming · 1 done',   Icon: PlayCircle,     bg:'linear-gradient(135deg,#0ea5e9,#06b6d4)', trend:'up',   delta:'+1',  route:'/instructor/sessions'  },
          { label:'Pending Grading',    value:'12',  sub:'Code · lab report · viva review', Icon: ClipboardCheck, bg:'linear-gradient(135deg,#f59e0b,#f2994a)', trend:'down', delta:'−5',  route:'/instructor/grading'   },
          { label:'Class Readiness',    value:'84%', sub:'Pre-lab gate cleared, all batches',Icon: BarChart3,     bg:'linear-gradient(135deg,#22c55e,#16a34a)', trend:'up',   delta:'+3%', route:'/instructor/analytics' },
        ].map(s => (
          <div
            key={s.label}
            className={styles.statCard}
            onClick={() => router.push(s.route)}
            style={{ cursor:'pointer' }}
          >
            <div className={styles.statIcon} style={{ background: s.bg }}>
              <s.Icon size={17} strokeWidth={1.9} color="#fff" />
            </div>
            <p className={styles.statLabel}>{s.label}</p>
            <div className={styles.statRow}>
              <span className={styles.statValue}>{s.value}</span>
              <span className={`${styles.badge} ${s.trend === 'up' ? styles.badgeUp : styles.badgeDown}`}>
                {s.trend === 'up' ? <ArrowUp size={11} strokeWidth={2.5}/> : <ArrowDown size={11} strokeWidth={2.5}/>}
                {s.delta}
              </span>
            </div>
            <p className={styles.statSub}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Activity Board ─────────────────────────────────────────────── */}
      <div className={styles.boardSection}>
        <div className={styles.boardHeader}>
          <h2>Teaching Overview</h2>
          <a onClick={() => router.push('/instructor/sessions')} style={{ cursor:'pointer' }}>View all sessions</a>
        </div>
        <div className={styles.boardColumns}>

          {/* Sessions */}
          <div>
            <p className={styles.colTitle}>
              Sessions <span className={styles.countPill}>4</span>
            </p>
            {SESSIONS.map(s => (
              <div
                key={s.id}
                className={styles.actCard}
                onClick={() => router.push(s.route)}
                style={{ cursor:'pointer' }}
              >
                <div className={styles.actTop}>
                  <div className={styles.actIcon} style={{
                    background: s.status === 'live' ? 'linear-gradient(135deg,#22c55e,#16a34a)' :
                      s.status === 'upcoming' ? 'linear-gradient(135deg,#7c3aed,#9333ea)' :
                      'linear-gradient(135deg,#64748b,#475569)'
                  }}>
                    {s.status === 'live' ? <Radio size={15} strokeWidth={1.9} color="#fff" /> :
                     s.status === 'upcoming' ? <CalendarClock size={15} strokeWidth={1.9} color="#fff" /> :
                     <CheckCircle2 size={15} strokeWidth={1.9} color="#fff" />}
                  </div>
                  <div>
                    <p className={styles.actName}>{s.title}</p>
                    <p className={styles.actMeta}>{s.section} · {s.students} students</p>
                  </div>
                  <div className={styles.actStatus}>
                    <span className={`${styles.statusPill} ${
                      s.status === 'live' ? styles.statusActive :
                      s.status === 'upcoming' ? styles.statusPending :
                      styles.statusDone
                    }`}>
                      {s.status === 'live' ? 'Live' : s.status === 'upcoming' ? 'Upcoming' : 'Done'}
                    </span>
                  </div>
                </div>
                <p className={styles.actFooter}>
                  <Clock size={11} strokeWidth={2} /> {s.time}
                </p>
              </div>
            ))}
            <div className={styles.addRow} onClick={() => router.push('/instructor/sessions/schedule')} style={{ cursor:'pointer' }}>
              <CalendarClock size={15} strokeWidth={2} /> Schedule new session
            </div>
          </div>

          {/* Pending Grading */}
          <div>
            <p className={styles.colTitle}>
              Pending Grading <span className={styles.countPill}>12</span>
            </p>
            {PENDING_SUBS.map(sub => (
              <div
                key={sub.id}
                className={styles.actCard}
                onClick={() => router.push(`/instructor/grading/${sub.id}`)}
                style={{ cursor:'pointer' }}
              >
                <div className={styles.actTop}>
                  <div className={styles.avatar} style={{ background: sub.bg, width:36, height:36, fontSize:13 }}>
                    {sub.name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                  </div>
                  <div>
                    <p className={styles.actName}>{sub.name} <span style={{ color:'#9891a6', fontSize:12 }}>{sub.roll}</span></p>
                    <p className={styles.actMeta}>{sub.exp}</p>
                  </div>
                  <div className={styles.actStatus}>
                    <span className={`${styles.statusPill} ${styles.statusPending}`}>
                      <AlertCircle size={10} strokeWidth={2} /> {sub.auto}
                    </span>
                  </div>
                </div>
                <p className={styles.actFooter}>Submitted {sub.submitted}</p>
              </div>
            ))}
            <div className={styles.addRow} onClick={() => router.push('/instructor/grading')} style={{ cursor:'pointer' }}>
              <ClipboardCheck size={15} strokeWidth={2} /> Open grading dashboard
            </div>
          </div>

          {/* Quick Actions */}
          <div>
            <p className={styles.colTitle}>Quick Actions</p>
            {[
              { label:'Create Experiment',    sub:'Aim, theory, code assets',     Icon: FlaskConical,   bg:'linear-gradient(135deg,#7c3aed,#9333ea)', route:'/instructor/experiments/new'       },
              { label:'Content Library',      sub:'PDFs, videos, datasets',       Icon: BookOpen,       bg:'linear-gradient(135deg,#ec4899,#d6409f)', route:'/instructor/content'               },
              { label:'Analytics & Insights', sub:'Class performance, at-risk',   Icon: BarChart3,      bg:'linear-gradient(135deg,#f59e0b,#f2994a)', route:'/instructor/analytics'             },
              { label:'Student Management',   sub:'Roster, attendance, catch-up', Icon: Users,          bg:'linear-gradient(135deg,#0ea5e9,#06b6d4)', route:'/instructor/students'              },
              { label:'Viva Panel',           sub:'Schedule & conduct vivas',     Icon: ClipboardCheck, bg:'linear-gradient(135deg,#22c55e,#16a34a)', route:'/instructor/viva'                  },
            ].map(q => (
              <div key={q.label} className={styles.quickCard} onClick={() => router.push(q.route)}>
                <div className={styles.quickCardIcon} style={{ background: q.bg }}>
                  <q.Icon size={15} strokeWidth={1.9} color="#fff" />
                </div>
                <div>
                  <p className={styles.quickCardLabel}>{q.label}</p>
                  <p className={styles.quickCardSub}>{q.sub}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </InstructorShell>
  );
}
