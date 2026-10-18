'use client';

import React, { useState, useMemo } from 'react';
import {
  Brain,
  CheckCircle2,
  AlertTriangle,
  Layers,
  LayoutGrid,
  GitFork,
  Lightbulb,
  Users,
  Search,
  Download,
  ChevronRight,
  Info,
  Trophy,
} from 'lucide-react';
import styles from './mastery-tab.module.css';
import { type MasteryOverviewData } from '@/services/analytics.service';
import { exportCSV } from '@/lib/analytics-utils';

interface MasteryTabProps {
  data: MasteryOverviewData;
  onSelectStudent?: (studentId: string) => void;
  onRefresh?: () => void;
}

// Mini SVG sparkline for KPI cards
function MiniSparkline({ points, color }: { points: number[]; color: string }) {
  if (!points || points.length === 0) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const width = 88;
  const height = 30;

  const pts = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * (width - 10) + 5;
    const y = height - 5 - ((p - min) / range) * (height - 10);
    return `${x},${y}`;
  });

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts.join(' ')}
      />
    </svg>
  );
}

export function MasteryTab({ data, onSelectStudent }: MasteryTabProps) {
  // Local state
  const [selectedGroup, setSelectedGroup] = useState<string>('Data Structures');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [selectedDagNode, setSelectedDagNode] = useState<string | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    cat: string;
    col: string;
    val: number;
    x: number;
    y: number;
  } | null>(null);

  // Toggle category expand
  const toggleCategory = (catId: string) => {
    setExpandedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  // Helper for score pill classes
  const getScoreClass = (score: number) => {
    if (score >= 70) return styles.cellGreen;
    if (score >= 50) return styles.cellAmber;
    return styles.cellRed;
  };

  // Student matrix filtering & search
  const currentColumns = useMemo(() => {
    const groupCols = data.student_matrix.group_columns[selectedGroup] || [];
    return [...groupCols, 'Overall'];
  }, [data.student_matrix.group_columns, selectedGroup]);

  const filteredStudents = useMemo(() => {
    let list = data.student_matrix.students;
    if (studentSearch.trim()) {
      const q = studentSearch.toLowerCase();
      list = list.filter(
        (s) =>
          s.student_name.toLowerCase().includes(q) ||
          s.roll_number.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data.student_matrix.students, studentSearch]);

  // CSV export handler
  const handleExportCSV = () => {
    const csvRows = filteredStudents.map((s) => {
      const gScores = s.groups[selectedGroup] || {};
      const row: Record<string, string | number> = {
        'Student Name': s.student_name,
        'Roll Number': s.roll_number,
      };
      currentColumns.forEach((col) => {
        row[col] = gScores[col] !== undefined ? `${gScores[col]}%` : '—';
      });
      return row;
    });
    exportCSV(csvRows, `student_${selectedGroup.toLowerCase().replace(/\s+/g, '_')}_mastery`);
  };

  return (
    <div className={styles.container}>
      {/* ──────────────────────────────────────────────────────────────────────────
          1. TOP 4 KPI SUMMARY CARDS
         ────────────────────────────────────────────────────────────────────────── */}
      <div className={styles.kpiGrid}>
        {/* Card 1: Overall Mastery */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#f3e8ff', color: '#7c3aed' }}>
                <Brain size={22} />
              </div>
              <span className={styles.kpiTitle}>Overall Mastery</span>
            </div>
            <span className={`${styles.kpiBadge} ${styles.kpiBadgeGreen}`}>
              {data.kpis.overall_mastery.delta}
            </span>
          </div>
          <div className={styles.kpiBody}>
            <div>
              <div className={styles.kpiValue}>{data.kpis.overall_mastery.value}</div>
              <div className={styles.kpiLabel}>{data.kpis.overall_mastery.label}</div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.overall_mastery.sparkline} color="#7c3aed" />
            </div>
          </div>
        </div>

        {/* Card 2: Mastered Concepts */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#dcfce7', color: '#16a34a' }}>
                <CheckCircle2 size={22} />
              </div>
              <span className={styles.kpiTitle}>Mastered Concepts</span>
            </div>
            <span className={`${styles.kpiBadge} ${styles.kpiBadgeGreen}`}>
              {data.kpis.mastered_concepts.delta}
            </span>
          </div>
          <div className={styles.kpiBody}>
            <div>
              <div className={styles.kpiValue}>{data.kpis.mastered_concepts.value}</div>
              <div className={styles.kpiLabel}>{data.kpis.mastered_concepts.label}</div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.mastered_concepts.sparkline} color="#10b981" />
            </div>
          </div>
        </div>

        {/* Card 3: Students at Risk */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#fee2e2', color: '#ef4444' }}>
                <AlertTriangle size={22} />
              </div>
              <span className={styles.kpiTitle}>Students at Risk (Mastery)</span>
            </div>
            <span className={`${styles.kpiBadge} ${styles.kpiBadgeRed}`}>
              {data.kpis.students_at_risk.delta}
            </span>
          </div>
          <div className={styles.kpiBody}>
            <div>
              <div className={styles.kpiValue}>{data.kpis.students_at_risk.value}</div>
              <div className={styles.kpiLabel}>{data.kpis.students_at_risk.label}</div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.students_at_risk.sparkline} color="#ef4444" />
            </div>
          </div>
        </div>

        {/* Card 4: Average Concept Attempts */}
        <div className={styles.kpiCard}>
          <div className={styles.kpiHeader}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <div className={styles.kpiIconWrapper} style={{ background: '#e0f2fe', color: '#0284c7' }}>
                <Layers size={22} />
              </div>
              <span className={styles.kpiTitle}>Average Concept Attempts</span>
            </div>
            <span className={`${styles.kpiBadge} ${styles.kpiBadgeGreen}`}>
              {data.kpis.avg_concept_attempts.delta}
            </span>
          </div>
          <div className={styles.kpiBody}>
            <div>
              <div className={styles.kpiValue}>{data.kpis.avg_concept_attempts.value}</div>
              <div className={styles.kpiLabel}>{data.kpis.avg_concept_attempts.label}</div>
            </div>
            <div className={styles.kpiSparkline}>
              <MiniSparkline points={data.kpis.avg_concept_attempts.sparkline} color="#3b82f6" />
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          2. MIDDLE ROW: CONCEPT MASTERY HEATMAP & PREREQUISITE GRAPH
         ────────────────────────────────────────────────────────────────────────── */}
      <div className={styles.middleGrid}>
        {/* Left: Concept Mastery Heatmap */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderLeft}>
              <div className={styles.cardIconBox}>
                <LayoutGrid size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Concept Mastery Heatmap</h3>
                <div className={styles.cardSubtitle}>Class average mastery by concept (grouped by prerequisite structure)</div>
              </div>
            </div>

            <div className={styles.cardControls}>
              <div className={styles.controlItem}>
                <span>View:</span>
                <select className={styles.selectInput} defaultValue="Class Average">
                  <option>Class Average</option>
                  <option>Passing Students</option>
                  <option>Struggling Students</option>
                </select>
              </div>

              <div className={styles.controlItem}>
                <span>Group:</span>
                <select className={styles.selectInput} defaultValue="By Prerequisite">
                  <option>By Prerequisite</option>
                  <option>By Category</option>
                  <option>Alphabetical</option>
                </select>
              </div>
            </div>
          </div>

          <div className={styles.heatmapContainer}>
            <table className={styles.heatmapTable}>
              <thead>
                <tr>
                  <th style={{ width: '230px', minWidth: '180px' }}></th>
                  {data.heatmap.columns.map((col, idx) => (
                    <th key={idx} className={styles.thAngled}>
                      <span className={styles.rotatedText}>{col}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.heatmap.rows.map((row) => {
                  const isOpen = !!expandedCategories[row.id];
                  return (
                    <React.Fragment key={row.id}>
                      <tr>
                        <td>
                          <div
                            className={styles.categoryRowHeader}
                            onClick={() => toggleCategory(row.id)}
                            title="Click to toggle category details"
                          >
                            <ChevronRight
                              size={15}
                              className={`${styles.chevronIcon} ${isOpen ? styles.chevronOpen : ''}`}
                            />
                            <span>{row.name}</span>
                          </div>
                        </td>
                        {row.values.map((val, cIdx) => (
                          <td
                            key={cIdx}
                            className={`${styles.heatmapCell} ${getScoreClass(val)}`}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setHoveredCell({
                                cat: row.short_name,
                                col: data.heatmap.columns[cIdx],
                                val,
                                x: rect.left + rect.width / 2,
                                y: rect.top,
                              });
                            }}
                            onMouseLeave={() => setHoveredCell(null)}
                          >
                            {val}%
                          </td>
                        ))}
                      </tr>

                      {/* Expanded Sub-concepts */}
                      {isOpen &&
                        row.children?.map((child, chIdx) => (
                          <tr key={chIdx} className={styles.childRow}>
                            <td className={styles.childConceptName}>• {child.concept}</td>
                            <td colSpan={data.heatmap.columns.length} style={{ padding: '6px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span
                                  className={`${styles.scorePill} ${getScoreClass(child.mastery)}`}
                                  style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                                >
                                  {child.mastery}%
                                </span>
                                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                  Status: <strong>{child.status}</strong>
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className={styles.legendContainer}>
            {data.heatmap.legend.map((item, idx) => (
              <div key={idx} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: item.color }} />
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Prerequisite Dependency Graph */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderLeft}>
              <div className={styles.cardIconBox}>
                <GitFork size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Prerequisite Dependency Graph</h3>
              </div>
            </div>
          </div>

          <div className={styles.dagContainer}>
            {/* SVG Interactive Directed Graph */}
            <div className={styles.dagSvgWrapper}>
              <svg width="100%" height="280" viewBox="0 0 460 290" style={{ overflow: 'visible' }}>
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="7"
                    markerHeight="7"
                    refX="5"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 7 3.5, 0 7" fill="#94a3b8" />
                  </marker>
                </defs>

                {/* Dynamic Connecting Edges */}
                {(data.prerequisite_graph.edges || []).map((edge) => {
                  const s = data.prerequisite_graph.nodes.find(
                    (n) => n.id === edge.from || n.label.toLowerCase() === edge.from.toLowerCase()
                  );
                  const t = data.prerequisite_graph.nodes.find(
                    (n) => n.id === edge.to || n.label.toLowerCase() === edge.to.toLowerCase()
                  );
                  if (!s || !t) return null;
                  const sx = (s as any).x ?? 120;
                  const sy = (s as any).y ?? 30;
                  const tx = (t as any).x ?? 120;
                  const ty = (t as any).y ?? 120;

                  return (
                    <path
                      key={`${edge.from}->${edge.to}`}
                      d={`M ${sx} ${sy + 14} C ${sx} ${(sy + ty) / 2}, ${tx} ${(sy + ty) / 2}, ${tx} ${ty - 14}`}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth="1.5"
                      markerEnd="url(#arrowhead)"
                      opacity="0.8"
                    />
                  );
                })}

                {/* Dynamic Nodes from Curriculum Database */}
                {(data.prerequisite_graph.nodes || []).map((node) => {
                  const isSelected = selectedDagNode === node.label;
                  const pillWidth = Math.max(88, Math.min(136, node.label.length * 6.5 + 24));
                  const halfW = pillWidth / 2;
                  const nx = (node as any).x ?? 120;
                  const ny = (node as any).y ?? 30;

                  let fill = '#ecfdf5';
                  let stroke = '#10b981';
                  let textFill = '#065f46';
                  let circleFill = '#10b981';

                  if (node.status === 'weak' || node.mastery < 50) {
                    fill = '#fee2e2';
                    stroke = '#ef4444';
                    textFill = '#991b1b';
                    circleFill = '#ef4444';
                  } else if (node.status === 'developing' || node.mastery < 70) {
                    fill = '#fef3c7';
                    stroke = '#f59e0b';
                    textFill = '#92400e';
                    circleFill = '#f59e0b';
                  }

                  return (
                    <g
                      key={node.id}
                      className={styles.dagNodePill}
                      transform={`translate(${nx}, ${ny})`}
                      onClick={() => setSelectedDagNode(isSelected ? null : node.label)}
                      style={{ cursor: 'pointer' }}
                    >
                      <rect
                        x={-halfW}
                        y="-14"
                        width={pillWidth}
                        height="28"
                        rx="14"
                        fill={fill}
                        stroke={isSelected ? '#7c3aed' : stroke}
                        strokeWidth={isSelected ? '2.5' : '1.5'}
                      />
                      <circle cx={-halfW + 11} cy="0" r="3.5" fill={circleFill} />
                      <text
                        x={-halfW + 20}
                        y="4"
                        fill={textFill}
                        fontSize="10"
                        fontWeight="700"
                      >
                        {node.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Selected Node Drilldown Popover */}
            {selectedDagNode && (
              <div style={{
                marginTop: 8,
                padding: '8px 12px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.78rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{selectedDagNode}</span>
                  <span style={{ color: '#64748b' }}>
                    Mastery: <strong>{data.prerequisite_graph.nodes.find(n => n.label === selectedDagNode)?.mastery ?? 0}%</strong>
                  </span>
                  <span style={{
                    padding: '2px 7px',
                    borderRadius: 10,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    background: (data.prerequisite_graph.nodes.find(n => n.label === selectedDagNode)?.mastery ?? 0) >= 70 ? '#dcfce7' : (data.prerequisite_graph.nodes.find(n => n.label === selectedDagNode)?.mastery ?? 0) >= 50 ? '#fef3c7' : '#fee2e2',
                    color: (data.prerequisite_graph.nodes.find(n => n.label === selectedDagNode)?.mastery ?? 0) >= 70 ? '#15803d' : (data.prerequisite_graph.nodes.find(n => n.label === selectedDagNode)?.mastery ?? 0) >= 50 ? '#b45309' : '#b91c1c'
                  }}>
                    {data.prerequisite_graph.nodes.find(n => n.label === selectedDagNode)?.status.toUpperCase() ?? 'ACTIVE'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDagNode(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#64748b',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  ✕ Dismiss
                </button>
              </div>
            )}

            {/* Key Insight Card */}
            <div className={styles.keyInsightBox}>
              <Info size={17} className={styles.keyInsightIcon} />
              <div>
                <div className={styles.keyInsightTitle}>
                  {data.prerequisite_graph.key_insight.title}
                </div>
                <div className={styles.keyInsightText}>
                  {data.prerequisite_graph.key_insight.message}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          3. BOTTOM ROW: TOP STRENGTHS & WEAKNESSES + STUDENT MATRIX
         ────────────────────────────────────────────────────────────────────────── */}
      <div className={styles.bottomGrid}>
        {/* Left: Top Strengths and Weaknesses */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderLeft}>
              <div className={styles.cardIconBox}>
                <Lightbulb size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Top Strengths and Weaknesses</h3>
                <div className={styles.cardSubtitle}>Highest and lowest mastery concepts across the class</div>
              </div>
            </div>
          </div>

          <div className={styles.twoColWrapper}>
            {/* Top 5 Strengths */}
            <div>
              <div className={styles.strengthColHeader}>
                <Trophy size={16} />
                <span>Top 5 Strengths</span>
              </div>
              <table className={styles.miniTable}>
                <thead>
                  <tr>
                    <th style={{ width: 24 }}>#</th>
                    <th>Concept</th>
                    <th style={{ textAlign: 'right' }}>Mastery</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_strengths_and_weaknesses.strengths.map((item) => (
                    <tr key={item.rank}>
                      <td className={styles.rankNum}>{item.rank}</td>
                      <td className={styles.conceptName}>{item.concept}</td>
                      <td className={styles.strengthPct}>{item.mastery}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top 5 Weaknesses */}
            <div>
              <div className={styles.weaknessColHeader}>
                <AlertTriangle size={16} />
                <span>Top 5 Weaknesses</span>
              </div>
              <table className={styles.miniTable}>
                <thead>
                  <tr>
                    <th style={{ width: 24 }}>#</th>
                    <th>Concept</th>
                    <th style={{ textAlign: 'right' }}>Mastery</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_strengths_and_weaknesses.weaknesses.map((item) => (
                    <tr key={item.rank}>
                      <td className={styles.rankNum}>{item.rank}</td>
                      <td className={styles.conceptName}>{item.concept}</td>
                      <td className={styles.weaknessPct}>{item.mastery}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Student Concept Mastery Matrix */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderLeft}>
              <div className={styles.cardIconBox}>
                <Users size={20} />
              </div>
              <div>
                <h3 className={styles.cardTitle}>Student Concept Mastery Matrix</h3>
                <div className={styles.cardSubtitle}>Individual student mastery for selected concept group</div>
              </div>
            </div>

            <div className={styles.cardControls}>
              <select
                className={styles.selectInput}
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value)}
              >
                {data.student_matrix.available_groups.map((grp) => (
                  <option key={grp} value={grp}>
                    {grp}
                  </option>
                ))}
              </select>

              <div className={styles.searchBox}>
                <Search size={14} className={styles.searchIcon} />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className={styles.searchInput}
                />
              </div>

              <button className={styles.csvBtn} onClick={handleExportCSV}>
                <Download size={13} />
                <span>CSV</span>
              </button>
            </div>
          </div>

          <div className={styles.matrixTableContainer}>
            <table className={styles.matrixTable}>
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>Student</th>
                  {currentColumns.map((col) => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((stu) => {
                  const gScores = stu.groups[selectedGroup] || {};
                  return (
                    <tr
                      key={stu.student_id}
                      onClick={() => onSelectStudent?.(stu.student_id)}
                      style={{ cursor: onSelectStudent ? 'pointer' : 'default' }}
                    >
                      <td>
                        <div className={styles.studentNameCell}>
                          <span className={styles.studentNameText}>{stu.student_name}</span>
                          {stu.roll_number && (
                            <span className={styles.studentRollText}>{stu.roll_number}</span>
                          )}
                        </div>
                      </td>
                      {currentColumns.map((col) => {
                        const val = gScores[col] !== undefined ? gScores[col] : 65;
                        return (
                          <td key={col}>
                            <span className={`${styles.scorePill} ${getScoreClass(val)}`}>
                              {val}%
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
