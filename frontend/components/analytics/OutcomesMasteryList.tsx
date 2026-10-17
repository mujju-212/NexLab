'use client';

import React, { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { SubjectOutcomes } from '@/services/institution.service';

interface OutcomesMasteryListProps {
  subjects?: SubjectOutcomes[];
}

export function OutcomesMasteryList({ subjects }: OutcomesMasteryListProps) {
  const [filter, setFilter] = useState('6');

  const items = (subjects && subjects.length > 0)
    ? subjects
        .map(s => ({
          name: s.subject_name,
          pct: Math.round(s.pass_rate_pct ?? s.avg_grade ?? 0),
        }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, Number(filter) || 6)
    : [];

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #f1f5f9',
        borderRadius: 16,
        padding: '20px 22px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        minHeight: 290,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: '#f3e8ff',
              color: '#7c3aed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={16} />
          </div>
          <h3
            style={{
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 700,
              color: '#0f172a',
              letterSpacing: '-0.01em',
            }}
          >
            Learning Outcomes Mastery
          </h3>
        </div>

        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            height: 30,
            padding: '0 8px',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: '#ffffff',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#334155',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="6">Top 6 Subjects</option>
          <option value="8">Top 8 Subjects</option>
          <option value="12">All Subjects</option>
        </select>
      </div>

      {/* Progress Bars List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 13, flex: 1, justifyContent: 'center' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8', fontSize: '0.85rem' }}>
            No learning outcomes mastery data available for current selection.
          </div>
        ) : (
          items.map(item => (
            <div key={item.name} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>
                  {item.name}
                </span>
                <span style={{ fontWeight: 700, color: '#6d28d9' }}>
                  {item.pct}%
                </span>
              </div>

              {/* Pill Progress Bar */}
              <div
                style={{
                  width: '100%',
                  height: 8,
                  borderRadius: 9999,
                  background: '#f1f5f9',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(5, item.pct))}%`,
                    height: '100%',
                    borderRadius: 9999,
                    background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                    transition: 'width 0.5s ease-out',
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
