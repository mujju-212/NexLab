'use client';

import { useState } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { BarChart2, Activity } from 'lucide-react';
import type { InstitutionDashboard } from '@/services/institution.service';
import styles from './page.module.css';

// Split out of dashboard/page.tsx and loaded via next/dynamic so the whole
// recharts bundle stays out of the dashboard's first-load JS — the KPIs and
// the shell paint immediately, the charts stream in right after.
export default function DashboardCharts({ data, stats }: {
  data: InstitutionDashboard | undefined;
  stats: InstitutionDashboard['stats'] | undefined;
}) {
  const [growthPeriod, setGrowthPeriod] = useState<'6m' | '12m'>('6m');
  const [sessionPeriod, setSessionPeriod] = useState<'week' | 'month'>('week');

  return (
    <>
      {/* Card 1: Student & Instructor Growth */}
      <div className={styles.chartCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <BarChart2 size={18} className={styles.cardTitleIcon} />
            <h3 className={styles.cardTitle}>Student &amp; Instructor Growth</h3>
          </div>
          <select
            className={styles.cardSelect}
            value={growthPeriod}
            onChange={e => setGrowthPeriod(e.target.value as '6m' | '12m')}
          >
            <option value="6m">Last 6 Months</option>
            <option value="12m">Last 12 Months</option>
          </select>
        </div>

        <div className={styles.chartLegendRow}>
          <div className={styles.legendItems}>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#7c3aed' }} />
              Students
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#c084fc' }} />
              Instructors
            </span>
          </div>
          <div className={styles.legendCallout}>
            Sep 2026: {stats?.students ?? 245} Students · {stats?.instructors ?? 18} Instructors
          </div>
        </div>

        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data?.growth_chart || [
                { month: 'Apr', students: 110, instructors: 12 },
                { month: 'May', students: 130, instructors: 14 },
                { month: 'Jun', students: 145, instructors: 16 },
                { month: 'Jul', students: 160, instructors: 18 },
                { month: 'Aug', students: 180, instructors: 19 },
                { month: 'Sep', students: 245, instructors: 22 },
              ]}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              barGap={4}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#ffffff', borderRadius: 10, border: '1px solid #ede9fe', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}
                labelStyle={{ fontWeight: 700, color: '#111827' }}
              />
              <Bar dataKey="students" fill="#7c3aed" radius={[5, 5, 0, 0]} maxBarSize={22} />
              <Bar dataKey="instructors" fill="#c084fc" radius={[5, 5, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Card 2: Session Activity */}
      <div className={styles.chartCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <Activity size={18} className={styles.cardTitleIcon} />
            <h3 className={styles.cardTitle}>Session Activity</h3>
          </div>
          <select
            className={styles.cardSelect}
            value={sessionPeriod}
            onChange={e => setSessionPeriod(e.target.value as 'week' | 'month')}
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>

        <div className={styles.chartLegendRow}>
          <div className={styles.legendItems}>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#c084fc' }} />
              Scheduled
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#10b981' }} />
              Completed
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: '#6366f1' }} />
              Live
            </span>
          </div>
        </div>

        <div className={styles.chartArea}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data?.session_activity || [
                { day: 'Mon', scheduled: 12, completed: 5, live: 2 },
                { day: 'Tue', scheduled: 9, completed: 4, live: 2 },
                { day: 'Wed', scheduled: 13, completed: 6, live: 3 },
                { day: 'Thu', scheduled: 16, completed: 7, live: 5 },
                { day: 'Fri', scheduled: 10, completed: 4, live: 2 },
                { day: 'Sat', scheduled: 11, completed: 4, live: 4 },
                { day: 'Sun', scheduled: 11, completed: 4, live: 2 },
              ]}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              barGap={2}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#ffffff', borderRadius: 10, border: '1px solid #ede9fe', boxShadow: '0 4px 14px rgba(0,0,0,0.06)' }}
                labelStyle={{ fontWeight: 700, color: '#111827' }}
              />
              <Bar dataKey="scheduled" fill="#c084fc" radius={[3, 3, 0, 0]} maxBarSize={14} />
              <Bar dataKey="completed" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={14} />
              <Bar dataKey="live" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}
