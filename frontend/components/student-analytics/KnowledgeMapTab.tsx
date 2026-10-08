'use client';

import React, { useState, useMemo } from 'react';
import {
  Compass,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Filter,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { DataTable, Column, MasteryRadar } from '@/components/analytics';
import type { UnifiedStudentOverview } from '@/services/student-analytics.service';
import { BlendedKnowledgeRadar } from './BlendedKnowledgeRadar';
import styles from './student-analytics.module.css';

interface KnowledgeMapTabProps {
  knowledgeMap: UnifiedStudentOverview['knowledge_map'] | undefined;
  focusTopics?: string[];
  prerequisiteBlocks?: Array<{ concept: string; blocked_by: string[] }>;
}

export const KnowledgeMapTab: React.FC<KnowledgeMapTabProps> = ({
  knowledgeMap = [],
  focusTopics = [],
  prerequisiteBlocks = [],
}) => {
  // View mode filter: 'all' | 'academic' | 'practice' | 'blended'
  const [viewMode, setViewMode] = useState<'all' | 'academic' | 'practice' | 'blended'>('all');

  // Filter and sort items: weakest topics bubble to the top if needed
  const filteredMap = useMemo(() => {
    let list = [...(knowledgeMap || [])];
    if (viewMode === 'academic') {
      list = list.filter((item) => item.academic_score != null);
    } else if (viewMode === 'practice') {
      list = list.filter((item) => item.practice_strength != null);
    }
    return list;
  }, [knowledgeMap, viewMode]);

  const columns: Column<any>[] = [
    {
      key: 'topic',
      header: 'Topic / Concept',
      render: (r) => {
        const isFocus = focusTopics.includes(r.topic);
        return (
          <div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.9rem' }}>
              {r.topic}
              {isFocus && (
                <span
                  style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.7rem',
                    background: '#fee2e2',
                    color: '#b91c1c',
                    padding: '0.1rem 0.4rem',
                    borderRadius: '0.25rem',
                    fontWeight: 700,
                  }}
                >
                  Weak Spot
                </span>
              )}
            </div>
            <small style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
              Confidence:
              {(() => {
                const raw = String(r.confidence || (r.academic_score != null && r.practice_strength != null ? 'high' : (r.academic_score != null || r.practice_strength != null ? 'medium' : 'low'))).toLowerCase();
                const display = raw.charAt(0).toUpperCase() + raw.slice(1);
                return (
                  <span
                    style={{
                      fontWeight: 600,
                      color: raw === 'high' ? '#16a34a' : raw === 'medium' ? '#d97706' : '#dc2626',
                    }}
                  >
                    {display}
                  </span>
                );
              })()}
            </small>
          </div>
        );
      },
    },
    {
      key: 'academic_score',
      header: 'Academic Mastery (60%)',
      sortable: true,
      render: (r) =>
        r.academic_score != null ? (
          <span style={{ fontWeight: 700, color: '#7c3aed' }}>{r.academic_score}%</span>
        ) : (
          <span style={{ color: '#94a3b8' }}>N/A</span>
        ),
    },
    {
      key: 'practice_strength',
      header: 'Practice Strength (40%)',
      sortable: true,
      render: (r) =>
        r.practice_strength != null ? (
          <span style={{ fontWeight: 700, color: '#059669' }}>{r.practice_strength}%</span>
        ) : (
          <span style={{ color: '#94a3b8' }}>N/A</span>
        ),
    },
    {
      key: 'blended_score',
      header: 'Blended Score',
      sortable: true,
      render: (r) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <strong style={{ fontSize: '0.95rem', color: '#0f172a' }}>{r.blended_score}%</strong>
          <div
            style={{
              width: 50,
              height: 5,
              background: '#e2e8f0',
              borderRadius: 9999,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, r.blended_score))}%`,
                height: '100%',
                background:
                  r.band === 'Mastered'
                    ? '#10b981'
                    : r.band === 'Proficient'
                    ? '#0284c7'
                    : r.band === 'Learning'
                    ? '#f59e0b'
                    : '#ef4444',
              }}
            />
          </div>
        </div>
      ),
    },
    {
      key: 'band',
      header: 'Proficiency Band',
      render: (r) => {
        const bg =
          r.band === 'Mastered'
            ? '#dcfce7'
            : r.band === 'Proficient'
            ? '#e0f2fe'
            : r.band === 'Learning'
            ? '#fef3c7'
            : '#fee2e2';
        const color =
          r.band === 'Mastered'
            ? '#15803d'
            : r.band === 'Proficient'
            ? '#0369a1'
            : r.band === 'Learning'
            ? '#b45309'
            : '#b91c1c';
        return (
          <span
            style={{
              padding: '0.2rem 0.55rem',
              borderRadius: '0.35rem',
              fontSize: '0.75rem',
              fontWeight: 700,
              background: bg,
              color: color,
            }}
          >
            {r.band}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Next Action',
      render: (r) => (
        <Link
          href={`/student/practice?topic=${encodeURIComponent(r.topic)}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            padding: '0.25rem 0.6rem',
            borderRadius: '0.35rem',
            background: '#f5f3ff',
            color: '#7c3aed',
            fontSize: '0.75rem',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Practice This <ExternalLink size={11} />
        </Link>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* 1. Header Banner & View Mode Toggles */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '1rem',
          padding: '1rem 1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Compass size={18} color="#7c3aed" />
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>
            Telemetry Source Filter:
          </span>
        </div>

        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '0.5rem', padding: '0.2rem' }}>
          {[
            { id: 'all', label: 'All Topics' },
            { id: 'blended', label: 'Blended (60/40)' },
            { id: 'academic', label: 'Academic Only' },
            { id: 'practice', label: 'Practice Only' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setViewMode(mode.id as any)}
              style={{
                border: 'none',
                background: viewMode === mode.id ? '#ffffff' : 'transparent',
                color: viewMode === mode.id ? '#7c3aed' : '#64748b',
                fontWeight: 600,
                fontSize: '0.78rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '0.35rem',
                cursor: 'pointer',
                boxShadow: viewMode === mode.id ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Prerequisite Blockers Callout */}
      {Array.isArray(prerequisiteBlocks) && prerequisiteBlocks.length > 0 && (
        <div
          style={{
            padding: '1rem',
            borderRadius: '0.875rem',
            background: '#fffbeb',
            border: '1px solid #fef3c7',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            color: '#b45309',
            fontSize: '0.85rem',
          }}
        >
          <AlertTriangle size={18} />
          <div>
            <strong>Prerequisite Diagnostic Alert:</strong>{' '}
            {prerequisiteBlocks.map((b: any, idx: number) => {
              const conceptName = typeof b === 'string' ? b : b?.concept || `Concept #${idx + 1}`;
              const blockedBy = typeof b === 'object' && b !== null ? b.blocked_by : null;
              const blockedText = Array.isArray(blockedBy)
                ? blockedBy.join(', ')
                : typeof blockedBy === 'string'
                ? blockedBy
                : '';
              return (
                <span key={conceptName + idx}>
                  {conceptName}
                  {blockedText ? (
                    <> requires mastering <em>{blockedText}</em> first.</>
                  ) : (
                    ' is currently blocked by prerequisite requirements.'
                  )}{' '}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Blended Knowledge Radar */}
      <BlendedKnowledgeRadar
        knowledgeMap={filteredMap}
        focusTopics={focusTopics}
        prerequisiteBlocks={prerequisiteBlocks}
      />

      {/* 4. Full Sortable & Searchable DataTable */}
      <DataTable
        title="Comprehensive Topic Competency Register"
        subtitle="Cross-track evaluation fusing coursework viva/code grades with algorithm test passes"
        columns={columns}
        data={filteredMap}
        pageSize={10}
        exportFilename="blended-knowledge-map"
        searchPlaceholder="Filter topics or concepts..."
      />
    </div>
  );
};
