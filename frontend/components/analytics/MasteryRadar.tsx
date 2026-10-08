'use client';

import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from 'recharts';
import { Compass } from 'lucide-react';
import styles from './analytics.module.css';

interface MasteryRadarProps {
  title?: string;
  subtitle?: string;
  data: Array<{ concept: string; mastery_score: number }>;
  height?: number;
  color?: string;
}

export function MasteryRadar({
  title = 'Concept Mastery Map',
  subtitle = 'Multidimensional concept proficiency radar (0–100%)',
  data,
  height = 320,
  color = '#7c3aed',
}: MasteryRadarProps) {
  if (!data || !data.length) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardTitleGroup}>
            <Compass size={18} className={styles.cardTitleIcon} />
            <h3 className={styles.cardTitle}>{title}</h3>
          </div>
        </div>
        <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
          No concept mastery telemetry available yet.
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleGroup}>
          <Compass size={18} className={styles.cardTitleIcon} />
          <div>
            <h3 className={styles.cardTitle}>{title}</h3>
            {subtitle && <p className={styles.cardSubtitle}>{subtitle}</p>}
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
            <PolarGrid stroke="#e5e7eb" />
            <PolarAngleAxis
              dataKey="concept"
              tick={{ fill: '#4b5563', fontSize: 11, fontWeight: 600 }}
            />
            <PolarRadiusAxis
              angle={30}
              domain={[0, 100]}
              tick={{ fill: '#9ca3af', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                background: '#ffffff',
                borderRadius: 10,
                border: '1px solid #ede9fe',
                boxShadow: '0 4px 16px rgba(124,58,237,0.08)',
                fontSize: 12,
              }}
              formatter={(val: any) => [`${val}%`, 'Mastery']}
            />
            <Radar
              name="Mastery %"
              dataKey="mastery_score"
              stroke={color}
              fill={color}
              fillOpacity={0.4}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
