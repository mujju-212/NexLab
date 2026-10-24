'use client';

import React, { useState, useMemo } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import styles from '../class-management.module.css';

interface ConceptMasteryTabProps {
  masteryData: any;
  trendsData: any;
  onSelectStudent: (studentId: string) => void;
}

export const ConceptMasteryTab: React.FC<ConceptMasteryTabProps> = ({
  masteryData,
  trendsData,
  onSelectStudent,
}) => {
  const [conceptSearch, setConceptSearch] = useState<string>('');
  const [selectedConcept, setSelectedConcept] = useState<string>('Stacks & Queues');
  const [selectedExpFilter, setSelectedExpFilter] = useState<string>('all');

  // Concepts list derived from backend masteryData
  const concepts = useMemo(() => {
    // If backend provided concepts map
    if (masteryData?.top_strengths || masteryData?.top_weaknesses) {
      const all = [
        ...(masteryData.top_strengths || []),
        ...(masteryData.top_weaknesses || []),
      ];
      if (all.length > 0) {
        return all.map((c: any) => ({
          name: c.name || c.concept,
          pct: Math.round(c.avg_mastery ?? c.mastery_score ?? 50),
          ratio: `${Math.round(c.mastered_students || 120)}/${c.total_students || 245}`,
        }));
      }
    }

    // Default core concepts aligned with CS / Data Structures curriculum
    return [
      { name: 'Arrays', pct: 78, ratio: '172/245' },
      { name: 'Linked Lists', pct: 58, ratio: '142/245' },
      { name: 'Stacks & Queues', pct: 46, ratio: '112/245' },
      { name: 'Trees', pct: 62, ratio: '152/245' },
      { name: 'Graphs', pct: 38, ratio: '94/245' },
      { name: 'Dynamic Programming', pct: 25, ratio: '60/245' },
      { name: 'Greedy Algorithms', pct: 52, ratio: '128/245' },
    ];
  }, [masteryData]);

  const filteredConcepts = useMemo(() => {
    return concepts.filter((c) =>
      c.name.toLowerCase().includes(conceptSearch.toLowerCase().trim())
    );
  }, [concepts, conceptSearch]);

  // Students Heatmap Matrix derived from backend trendsData.students_heatmap
  const heatmapRows = useMemo(() => {
    if (trendsData?.students_heatmap && trendsData.students_heatmap.length > 0) {
      return trendsData.students_heatmap;
    }

    // Fallback based on students
    return [
      { student_alias: 'Aadhya Pillai', experiments: [ { score: 85 }, { score: 65 }, { score: 45 }, { score: 80 }, { score: 90 }, { score: 55 }, { score: 70 }, { score: 85 } ] },
      { student_alias: 'Aarav Gupta', experiments: [ { score: 75 }, { score: 70 }, { score: 60 }, { score: 40 }, { score: 85 }, { score: 90 }, { score: 65 }, { score: 75 } ] },
      { student_alias: 'Aarav Iyer', experiments: [ { score: 90 }, { score: 85 }, { score: 75 }, { score: 65 }, { score: 70 }, { score: 80 }, { score: 85 }, { score: 90 } ] },
      { student_alias: 'Aarav Mehta', experiments: [ { score: 60 }, { score: 50 }, { score: 70 }, { score: 85 }, { score: 60 }, { score: 45 }, { score: 75 }, { score: 80 } ] },
      { student_alias: 'Aditi Sharma', experiments: [ { score: 85 }, { score: 90 }, { score: 80 }, { score: 75 }, { score: 70 }, { score: 85 }, { score: 90 }, { score: 95 } ] },
      { student_alias: 'Aditya Nair', experiments: [ { score: 70 }, { score: 65 }, { score: 55 }, { score: 50 }, { score: 60 }, { score: 70 }, { score: 65 }, { score: 75 } ] },
      { student_alias: 'Akash Verma', experiments: [ { score: 40 }, { score: 50 }, { score: 60 }, { score: 45 }, { score: 55 }, { score: 60 }, { score: 50 }, { score: 65 } ] },
      { student_alias: 'Ananya Rao', experiments: [ { score: 95 }, { score: 90 }, { score: 85 }, { score: 80 }, { score: 90 }, { score: 95 }, { score: 85 }, { score: 90 } ] },
      { student_alias: 'Arjun Kulkarni', experiments: [ { score: 80 }, { score: 75 }, { score: 70 }, { score: 65 }, { score: 85 }, { score: 80 }, { score: 75 }, { score: 85 } ] },
      { student_alias: 'Diya Shetty', experiments: [ { score: 65 }, { score: 70 }, { score: 60 }, { score: 75 }, { score: 70 }, { score: 65 }, { score: 80 }, { score: 75 } ] },
    ];
  }, [trendsData]);

  const getCellClass = (score: number | null | undefined) => {
    if (score == null) return styles.cellNone;
    if (score >= 75) return styles.cellHigh;
    if (score >= 50) return styles.cellMed;
    return styles.cellLow;
  };

  return (
    <div className={styles.twoColGrid}>
      {/* ── LEFT PANE: CONCEPTS LIST ─────────────────────────────────── */}
      <div className={styles.conceptListPane}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h4 className={styles.cardTitle}>Concepts</h4>
          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Mastery rate</span>
        </div>

        <div className={styles.searchBox} style={{ width: '100%', minWidth: 'unset' }}>
          <Search size={14} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search concepts..."
            className={styles.searchInput}
            value={conceptSearch}
            onChange={(e) => setConceptSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.35rem' }}>
          {filteredConcepts.map((c) => {
            const isSelected = selectedConcept === c.name;
            return (
              <div
                key={c.name}
                className={`${styles.conceptItem} ${isSelected ? styles.conceptItemActive : ''}`}
                onClick={() => setSelectedConcept(c.name)}
              >
                <span>{c.name}</span>
                <div className={styles.conceptItemMeta}>
                  <span style={{ color: isSelected ? '#7c3aed' : '#0f172a' }}>
                    {c.pct}%
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    ({c.ratio})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── RIGHT PANE: HEATMAP MATRIX ───────────────────────────────── */}
      <div className={styles.heatmapMatrixCard}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h4 className={styles.cardTitle}>
              Student × Concept Heatmap
            </h4>
            <span style={{ fontSize: '0.78rem', color: '#7c3aed', fontWeight: 600, background: '#f5f3ff', padding: '0.15rem 0.5rem', borderRadius: 6 }}>
              {selectedConcept}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select
              className={styles.filterSelect}
              value={selectedExpFilter}
              onChange={(e) => setSelectedExpFilter(e.target.value)}
            >
              <option value="all">All Experiments</option>
              <option value="exp1">Exp 1 – 4</option>
              <option value="exp2">Exp 5 – 8</option>
            </select>
          </div>
        </div>

        {/* Heatmap Table */}
        <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
          <table className={styles.heatmapTable}>
            <thead>
              <tr>
                <th style={{ width: 160 }}>Student</th>
                {Array.from({ length: 8 }).map((_, i) => (
                  <th key={i}>Exp {i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmapRows.slice(0, 10).map((row: any, rIdx: number) => {
                const sName = row.student_alias || row.full_name || `Student ${rIdx + 1}`;
                const exps = row.experiments || [];

                return (
                  <tr key={row.student_id || rIdx}>
                    <td style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}>
                      <span
                        style={{ cursor: 'pointer' }}
                        onClick={() => row.student_id && onSelectStudent(row.student_id)}
                      >
                        {sName}
                      </span>
                    </td>
                    {Array.from({ length: 8 }).map((_, cIdx) => {
                      const expCell = exps[cIdx];
                      const score = expCell?.score;
                      return (
                        <td key={cIdx} style={{ padding: '2px 3px' }}>
                          <div
                            className={`${styles.heatmapCell} ${getCellClass(score)}`}
                            title={score != null ? `${score}%` : 'Not Attempted'}
                          >
                            {score != null ? `${Math.round(score)}%` : '—'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className={styles.heatmapLegend}>
          <div className={styles.heatmapLegendItem}>
            <span className={`${styles.heatmapLegendSwatch} ${styles.cellHigh}`} />
            <span>High (&gt; 75%)</span>
          </div>
          <div className={styles.heatmapLegendItem}>
            <span className={`${styles.heatmapLegendSwatch} ${styles.cellMed}`} />
            <span>Medium (50–74%)</span>
          </div>
          <div className={styles.heatmapLegendItem}>
            <span className={`${styles.heatmapLegendSwatch} ${styles.cellLow}`} />
            <span>Low (&lt; 50%)</span>
          </div>
          <div className={styles.heatmapLegendItem}>
            <span className={`${styles.heatmapLegendSwatch} ${styles.cellNone}`} />
            <span>Not Attempted</span>
          </div>
        </div>
      </div>
    </div>
  );
};
