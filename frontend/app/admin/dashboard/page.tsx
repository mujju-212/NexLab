'use client';

import { useRouter } from 'next/navigation';
import AdminShell from '@/components/layout/AdminShell';
import {
  UserPlus, Download, Users, GraduationCap, FlaskConical, Layers,
  Activity, Calendar, AlertTriangle, ArrowUp, ArrowDown
} from 'lucide-react';
import styles from './page.module.css';

export default function AdminDashboard() {
  const router = useRouter();

  return (
    <AdminShell activePage="Dashboard">

      {/* ── Welcome Banner ─────────────────────────────────────────────── */}
      <div className={styles.welcomeBanner}>
        <div className={styles.welcomeLeft}>
          <h1>Welcome, Admin 👋</h1>
          <div className={styles.welcomeMeta}>
            <span className={styles.welcomeTag}>
              <GraduationCap size={13} strokeWidth={2} />
              HKBK College of Engineering
            </span>
            <span className={styles.welcomeTag}>
              <Layers size={13} strokeWidth={2} />
              Academic Year 2026–27
            </span>
          </div>
        </div>
        <div className={styles.welcomeRight}>
          <button className={styles.quickBtn} onClick={() => router.push('/admin/users')}>
            <UserPlus size={14} strokeWidth={2} />
            Add User
          </button>
          <button className={styles.quickBtn} onClick={() => router.push('/admin/reports')}>
            <Download size={14} strokeWidth={2} />
            Export Report
          </button>
        </div>
      </div>

      {/* ── Stat Row 1 — 4 cards ───────────────────────────────────────── */}
      <div className={styles.statGrid4}>
        {[
          { label:'Total Students', value:'1,247', sub:'Active enrollments',   Icon: Users,          bg:'linear-gradient(135deg,#8b5cf6,#7c3aed)', trend:'up',      delta:'+8%',     route:'/admin/users'       },
          { label:'Total Faculty',  value:'89',    sub:'Across departments',   Icon: GraduationCap,  bg:'linear-gradient(135deg,#ec4899,#d6409f)', trend:'up',      delta:'+3%',     route:'/admin/assignments' },
          { label:'Subjects',       value:'24',    sub:'This semester',         Icon: FlaskConical,   bg:'linear-gradient(135deg,#f59e0b,#f2994a)', trend:'neutral', delta:'Same',    route:'/admin/academic'    },
          { label:'Sections',       value:'48',    sub:'Active sections',       Icon: Layers,         bg:'linear-gradient(135deg,#22c55e,#16a34a)', trend:'up',      delta:'+2',      route:'/admin/academic'    },
        ].map(s => (
          <div
            key={s.label}
            className={styles.statCard}
            onClick={() => router.push(s.route)}
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.statIcon} style={{ background: s.bg }}>
              <s.Icon size={17} strokeWidth={1.9} color="#fff" />
            </div>
            <p className={styles.statLabel}>{s.label}</p>
            <div className={styles.statRow}>
              <span className={styles.statValue}>{s.value}</span>
              <span className={`${styles.badge} ${s.trend === 'up' ? styles.badgeUp : s.trend === 'down' ? styles.badgeDown : styles.badgeNeutral}`}>
                {s.trend === 'up' && <ArrowUp size={11} strokeWidth={2.5} />}
                {s.delta}
              </span>
            </div>
            <p className={styles.statSub}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Stat Row 2 — 3 alert cards ────────────────────────────────── */}
      <div className={styles.statGrid3}>
        {[
          { label:'Live Labs Now',     value:'3',  sub:'Currently in progress',  Icon: Activity,       bg:'linear-gradient(135deg,#06b6d4,#0ea5e9)', trend:'up',   delta:'+1',       route:'/admin/monitoring' },
          { label:"Today's Sessions",  value:'8',  sub:'Scheduled for today',    Icon: Calendar,       bg:'linear-gradient(135deg,#a855f7,#9333ea)', trend:'neutral', delta:'On track', route:'/admin/monitoring' },
          { label:'Students At Risk',  value:'12', sub:'Below 60% attendance',   Icon: AlertTriangle,  bg:'linear-gradient(135deg,#f87171,#ef4444)', trend:'down', delta:'−3%',      route:'/admin/analytics'  },
        ].map(s => (
          <div
            key={s.label}
            className={styles.statCard}
            onClick={() => router.push(s.route)}
            style={{ cursor: 'pointer' }}
          >
            <div className={styles.statIcon} style={{ background: s.bg }}>
              <s.Icon size={17} strokeWidth={1.9} color="#fff" />
            </div>
            <p className={styles.statLabel}>{s.label}</p>
            <div className={styles.statRow}>
              <span className={styles.statValue}>{s.value}</span>
              <span className={`${styles.badge} ${s.trend === 'up' ? styles.badgeUp : s.trend === 'down' ? styles.badgeDown : styles.badgeNeutral}`}>
                {s.trend === 'down' && <ArrowDown size={11} strokeWidth={2.5} />}
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
          <h2>System Overview</h2>
          <a onClick={() => router.push('/admin/monitoring')} style={{ cursor: 'pointer' }}>View all</a>
        </div>
        <div className={styles.boardColumns}>

          {/* Today's Sessions */}
          <div>
            <p className={styles.colTitle}>Today&apos;s Sessions <span className={styles.countPill}>8</span></p>
            {[
              { name:'Organic Chemistry Lab',  dept:'CS — Section A',  time:'09:00 AM', status:'Active',   cls: styles.statusActive  },
              { name:'Digital Logic Lab',      dept:'ECE — Section B', time:'11:00 AM', status:'Active',   cls: styles.statusActive  },
              { name:'Data Structures Lab',    dept:'CS — Section C',  time:'02:00 PM', status:'Upcoming', cls: styles.statusPending },
              { name:'Circuit Design Lab',     dept:'EEE — Section A', time:'04:00 PM', status:'Upcoming', cls: styles.statusPending },
            ].map(s => (
              <div
                key={s.name}
                className={styles.actCard}
                onClick={() => router.push('/admin/monitoring')}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.actTop}>
                  <div className={styles.actIcon} style={{ background:'linear-gradient(135deg,#8b5cf6,#7c3aed)' }}>
                    <FlaskConical size={16} strokeWidth={1.9} color="#fff" />
                  </div>
                  <div>
                    <p className={styles.actName}>{s.name}</p>
                    <p className={styles.actMeta}>{s.dept}</p>
                  </div>
                  <div className={styles.actStatus}>
                    <span className={`${styles.statusPill} ${s.cls}`}>{s.status}</span>
                  </div>
                </div>
                <p className={styles.actFooter}>Starts: <strong>{s.time}</strong></p>
              </div>
            ))}
          </div>

          {/* New Registrations */}
          <div>
            <p className={styles.colTitle}>New Registrations <span className={styles.countPill}>5</span></p>
            {[
              { name:'Priya Sharma',    role:'Student',    dept:'CS — Sem 3', bg:'#8b5cf6' },
              { name:'Dr. Arun Kumar', role:'Instructor', dept:'ECE Dept',   bg:'#d6409f' },
              { name:'Rahul Mehta',    role:'Student',    dept:'ME — Sem 5', bg:'#f59e0b' },
              { name:'Sneha Patil',    role:'Student',    dept:'CS — Sem 1', bg:'#22c55e' },
            ].map(u => (
              <div
                key={u.name}
                className={styles.actCard}
                onClick={() => router.push('/admin/users')}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.actTop}>
                  <div className={styles.avatar} style={{ background: u.bg, width:36, height:36, fontSize:13 }}>
                    {u.name.split(' ').map(w => w[0]).join('').slice(0,2)}
                  </div>
                  <div>
                    <p className={styles.actName}>{u.name}</p>
                    <p className={styles.actMeta}>{u.dept}</p>
                  </div>
                  <div className={styles.actStatus}>
                    <span className={`${styles.statusPill} ${u.role === 'Student' ? styles.statusActive : styles.statusPending}`}>
                      {u.role}
                    </span>
                  </div>
                </div>
                <p className={styles.actFooter}>First login: <strong>Pending setup</strong></p>
              </div>
            ))}
            <div className={styles.addRow} onClick={() => router.push('/admin/users')} style={{ cursor: 'pointer' }}>
              <UserPlus size={15} strokeWidth={2} /> Add new user
            </div>
          </div>

          {/* At-Risk Students */}
          <div>
            <p className={styles.colTitle}>At-Risk Students <span className={styles.countPill}>12</span></p>
            {[
              { name:'Kiran Reddy',  dept:'CS — Sem 5',  pct:'42%', bg:'#ef4444' },
              { name:'Ananya Nair',  dept:'ME — Sem 3',  pct:'51%', bg:'#f97316' },
              { name:'Vijay Bhat',   dept:'ECE — Sem 7', pct:'55%', bg:'#f59e0b' },
              { name:'Meena Shetty', dept:'CS — Sem 3',  pct:'58%', bg:'#eab308' },
            ].map(u => (
              <div
                key={u.name}
                className={styles.actCard}
                onClick={() => router.push('/admin/analytics')}
                style={{ cursor: 'pointer' }}
              >
                <div className={styles.actTop}>
                  <div className={styles.avatar} style={{ background: u.bg, width:36, height:36, fontSize:13 }}>
                    {u.name.split(' ').map(w => w[0]).join('').slice(0,2)}
                  </div>
                  <div>
                    <p className={styles.actName}>{u.name}</p>
                    <p className={styles.actMeta}>{u.dept}</p>
                  </div>
                  <div className={styles.actStatus}>
                    <span className={`${styles.statusPill} ${styles.statusRisk}`}>{u.pct} att.</span>
                  </div>
                </div>
                <p className={styles.actFooter}>Last active: <strong>3 days ago</strong></p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </AdminShell>
  );
}
