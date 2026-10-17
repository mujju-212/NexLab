'use client';

import React, { useState } from 'react';
import { Clock } from 'lucide-react';

interface ActivityHeatmapProps {
  dayHourMatrix?: Array<{
    day: string;
    day_index: number;
    buckets: Array<{ hour: number; count: number }>;
  }>;
  peakHours?: Array<{ hour: number; session_count: number }>;
}

export function ActivityHeatmap({ dayHourMatrix, peakHours }: ActivityHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ day: string; hour: number; count: number } | null>(null);

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hourBuckets = [0, 4, 8, 12, 16, 20];

  // Map from dayHourMatrix or zeros
  const rows = days.map((d, dIdx) => {
    const matrixRow = dayHourMatrix?.find(m => m.day === d || m.day_index === dIdx);
    if (matrixRow && matrixRow.buckets && matrixRow.buckets.length > 0) {
      return {
        day: d,
        buckets: hourBuckets.map(b => {
          const match = matrixRow.buckets.find(mb => mb.hour === b);
          return { hour: b, count: match ? match.count : 0 };
        }),
      };
    }
    return {
      day: d,
      buckets: hourBuckets.map(b => ({ hour: b, count: 0 })),
    };
  });

  // Calculate max count for scaling
  let maxCount = 1;
  rows.forEach(r => r.buckets.forEach(b => {
    if (b.count > maxCount) maxCount = b.count;
  }));

  const getCellColor = (count: number) => {
    if (count === 0) return '#f1f5f9';
    const intensity = Math.min(1, Math.max(0.12, count / maxCount));
    // Interpolate from light lavender to deep indigo
    if (intensity < 0.25) return 'rgba(124, 58, 237, 0.18)';
    if (intensity < 0.5) return 'rgba(124, 58, 237, 0.42)';
    if (intensity < 0.75) return 'rgba(109, 40, 217, 0.68)';
    return 'rgba(76, 29, 149, 0.92)';
  };

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
        position: 'relative',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
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
            <Clock size={16} />
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
            Campus Peak Hours - Lab Activity
          </h3>
        </div>

        {/* Legend color scale */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: '#64748b' }}>
          <span>High</span>
          <div
            style={{
              width: 50,
              height: 10,
              borderRadius: 4,
              background: 'linear-gradient(90deg, #4c1d95, #7c3aed, rgba(124, 58, 237, 0.2))',
            }}
          />
          <span>Low</span>
        </div>
      </div>

      {/* Grid container */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, justifyContent: 'center' }}>
        {rows.map(r => (
          <div key={r.day} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Day label */}
            <span
              style={{
                width: 28,
                fontSize: '0.7rem',
                fontWeight: 600,
                color: '#64748b',
                textAlign: 'left',
              }}
            >
              {r.day}
            </span>

            {/* Heatmap cells */}
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {r.buckets.map(b => {
                const bg = getCellColor(b.count);
                const isHovered = hoveredCell?.day === r.day && hoveredCell?.hour === b.hour;
                return (
                  <div
                    key={b.hour}
                    onMouseEnter={() => setHoveredCell({ day: r.day, hour: b.hour, count: b.count })}
                    onMouseLeave={() => setHoveredCell(null)}
                    style={{
                      flex: 1,
                      height: 20,
                      borderRadius: 4,
                      background: bg,
                      transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                      cursor: 'pointer',
                      transform: isHovered ? 'scale(1.12)' : 'scale(1)',
                      boxShadow: isHovered ? '0 2px 8px rgba(124, 58, 237, 0.35)' : 'none',
                      zIndex: isHovered ? 2 : 1,
                    }}
                    title={`${r.day} ${b.hour}:00 - ${b.hour + 4}:00: ${b.count} sessions`}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Bottom Hour Labels */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <span style={{ width: 28 }} />
          <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', padding: '0 4px' }}>
            {hourBuckets.map(h => (
              <span
                key={h}
                style={{
                  fontSize: '0.675rem',
                  fontWeight: 600,
                  color: '#94a3b8',
                }}
              >
                {h}h
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip notice */}
      {hoveredCell && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 18,
            background: '#0f172a',
            color: '#ffffff',
            padding: '4px 10px',
            borderRadius: 6,
            fontSize: '0.725rem',
            fontWeight: 600,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {hoveredCell.day} {hoveredCell.hour}:00–{hoveredCell.hour + 4}:00 : {hoveredCell.count} sessions
        </div>
      )}
    </div>
  );
}
