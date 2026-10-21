'use client';

import React from 'react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
} from 'recharts';
import { Compass, CheckCircle2, AlertTriangle, Sparkles, BookOpen } from 'lucide-react';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import styles from './student-analytics.module.css';

interface BlendedKnowledgeRadarProps {
  knowledgeMap: UnifiedStudentOverview['knowledge_map'] | undefined;
  prerequisiteBlocks?: Array<{ concept: string; blocked_by: string[] }>;
  focusTopics?: string[];
}

export const BlendedKnowledgeRadar: React.FC<BlendedKnowledgeRadarProps> = ({
  knowledgeMap = [],
  prerequisiteBlocks = [],
  focusTopics = [],
}) => {
  // Format radar data
  const radarData = (knowledgeMap || []).map((k) => ({
    topic: k.topic.length > 14 ? `${k.topic.slice(0, 12)}…` : k.topic,
    fullTopic: k.topic,
    academic: k.academic_score ?? 0,
    practice: k.practice_strength ?? 0,
    blended: k.blended_score,
  }));

  const getBandClass = (band: string) => {
    switch (band) {
      case 'Mastered':
        return styles.bandMastered;
      case 'Proficient':
        return styles.bandProficient;
      case 'Developing':
      case 'Learning':
        return styles.bandLearning;
      default:
        return styles.bandNeedsPractice;
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleWrap}>
          <div className={styles.cardIconBox}>
            <Compass size={20} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Blended Knowledge Map</h2>
            <p className={styles.cardSubtitle}>
              Dual-source competency engine fusing Academic Mastery (60%) and Practice Strength (40%)
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className={styles.metaBadge}>
            <Sparkles size={12} color="#7c3aed" /> 60% Academic · 40% Practice
          </span>
        </div>
      </div>

      {/* Prerequisite Warnings if any */}
      {Array.isArray(prerequisiteBlocks) && prerequisiteBlocks.length > 0 && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#b45309',
            fontSize: '0.85rem',
          }}
        >
          <AlertTriangle size={16} />
          <span>
            <strong>Prerequisite Diagnostic:</strong>{' '}
            {(() => {
              const first = prerequisiteBlocks[0] as any;
              const conceptName = typeof first === 'string' ? first : first?.concept || 'Topic';
              const blockedBy = typeof first === 'object' && first !== null ? first.blocked_by : null;
              const blockedText = Array.isArray(blockedBy)
                ? blockedBy.join(', ')
                : typeof blockedBy === 'string'
                ? blockedBy
                : '';
              return blockedText
                ? `${conceptName} is blocked until you master ${blockedText}.`
                : `${conceptName} is currently blocked by prerequisite requirements.`;
            })()}
          </span>
        </div>
      )}

      {knowledgeMap.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
          <BookOpen size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
          <p>No competency data recorded yet. Complete experiments and practice problems to illuminate your map.</p>
        </div>
      ) : (
        <div className={styles.blendedGrid}>
          {/* Recharts Radar */}
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="topic" tick={{ fill: '#475569', fontSize: 11 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Radar
                  name="Academic (60%)"
                  dataKey="academic"
                  stroke="#7c3aed"
                  fill="#7c3aed"
                  fillOpacity={0.4}
                />
                <Radar
                  name="Practice (40%)"
                  dataKey="practice"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.35}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, paddingTop: 10 }}
                  formatter={(value) => <span style={{ color: '#334155', fontWeight: 600 }}>{value}</span>}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div
                          style={{
                            background: '#ffffff',
                            padding: '0.65rem 0.85rem',
                            border: '1px solid #e2e8f0',
                            borderRadius: '0.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            fontSize: '0.8rem',
                          }}
                        >
                          <p style={{ fontWeight: 700, margin: '0 0 0.35rem', color: '#0f172a' }}>
                            {d.fullTopic}
                          </p>
                          <p style={{ margin: '0 0 0.2rem', color: '#7c3aed' }}>
                            Academic Mastery: <strong>{d.academic}%</strong>
                          </p>
                          <p style={{ margin: '0 0 0.2rem', color: '#10b981' }}>
                            Practice Strength: <strong>{d.practice}%</strong>
                          </p>
                          <p style={{ margin: '0', color: '#0f172a', fontWeight: 700 }}>
                            Blended Score: {d.blended}%
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Topic Breakdown List */}
          <div className={styles.topicList}>
            {knowledgeMap.map((item) => {
              const pct = Math.min(100, Math.max(0, item.blended_score));
              const isFocus = focusTopics.includes(item.topic);
              return (
                <div key={item.topic} className={styles.topicItem}>
                  <div className={styles.topicRow}>
                    <div className={styles.topicName}>
                      {item.topic}
                      {isFocus && (
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.7rem',
                            color: '#e11d48',
                            fontWeight: 600,
                          }}
                        >
                          (Focus Area)
                        </span>
                      )}
                    </div>
                    <div className={styles.topicScores}>
                      <span className={`${styles.scoreBadge} ${getBandClass(item.band)}`}>
                        {item.band}
                      </span>
                      <strong style={{ color: '#0f172a' }}>{item.blended_score}%</strong>
                    </div>
                  </div>

                  <div className={styles.barTrack}>
                    <div
                      className={styles.barFill}
                      style={{
                        width: `${pct}%`,
                        background:
                          item.band === 'Mastered'
                            ? 'linear-gradient(90deg, #10b981, #059669)'
                            : item.band === 'Proficient'
                            ? 'linear-gradient(90deg, #0284c7, #2563eb)'
                            : item.band === 'Learning' || item.band === 'Developing'
                            ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                            : 'linear-gradient(90deg, #ef4444, #dc2626)',
                      }}
                    />
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.72rem',
                      color: '#64748b',
                      marginTop: '0.35rem',
                    }}
                  >
                    <span>Acad: {item.academic_score != null ? `${item.academic_score}%` : 'N/A'}</span>
                    {(() => {
                      const rawConf = String(item.confidence || (item.academic_score != null && item.practice_strength != null ? 'high' : (item.academic_score != null || item.practice_strength != null ? 'medium' : 'low'))).toLowerCase();
                      const displayConf = rawConf.charAt(0).toUpperCase() + rawConf.slice(1);
                      return (
                        <span>
                          Confidence:{' '}
                          <strong
                            style={{
                              color: rawConf === 'high' ? '#16a34a' : rawConf === 'medium' ? '#d97706' : '#dc2626',
                            }}
                          >
                            {displayConf}
                          </strong>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
