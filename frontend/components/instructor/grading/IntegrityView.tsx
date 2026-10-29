'use client';

import React, { useState } from 'react';
import { Search, SlidersHorizontal, FileText, AlertTriangle, AlertCircle, Sparkles, MoreVertical } from 'lucide-react';
import hub from '@/app/instructor/grading/hub.module.css';

const AVATAR_PALETTE = [
  { bg: '#ede9fe', text: '#7c3aed' },
  { bg: '#e0e7ff', text: '#4f46e5' },
  { bg: '#dbeafe', text: '#2563eb' },
  { bg: '#fce7f3', text: '#db2777' },
  { bg: '#ccfbf1', text: '#0d9488' },
  { bg: '#ffedd5', text: '#ea580c' },
  { bg: '#f3e8ff', text: '#9333ea' },
  { bg: '#e2e8f0', text: '#475569' },
];

function getAvatarStyle(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const color = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  return { background: color.bg, color: color.text };
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? '')
      .join('') || '—'
  );
}

interface IntegrityViewProps {
  plagiarismFlags: any[];
  subjectExperiments: any[];
  onViewFlaggedStudent: (studentName: string) => void;
}

export default function IntegrityView({
  plagiarismFlags,
  subjectExperiments,
  onViewFlaggedStudent,
}: IntegrityViewProps) {
  const [integritySearch, setIntegritySearch] = useState<string>('');
  const [integrityRiskFilter, setIntegrityRiskFilter] = useState<string>('all');
  const [integrityStatusFilter, setIntegrityStatusFilter] = useState<string>('all');

  // Real flags from the backend — { id, student_a_name, student_a_roll,
  // student_b_name, experiment_title, similarity_pct, status, detected_at }.
  const rows = plagiarismFlags.map(f => ({
    id: f.id,
    name: f.student_a_name || 'Unknown',
    roll: f.student_a_roll || '—',
    assessment: f.experiment_title || '—',
    sim: Math.round(Number(f.similarity_pct) || 0),
    risk: Number(f.similarity_pct) > 80 ? 'High' : Number(f.similarity_pct) > 50 ? 'Medium' : 'Low',
    status: f.status === 'pending' ? 'Pending' : f.status === 'cleared' ? 'Cleared' : 'Actioned',
    matched: f.student_b_name ? `Matched with ${f.student_b_name}` : '—',
  }));

  return (
    <div className={hub.viewContainer}>
      {/* Top Description and Filters Toolbar */}
      <div className={hub.tableToolbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 260 }}>
          <span style={{ fontSize: 12.5, color: '#64748b', fontWeight: 550 }}>
            Detect potential plagiarism, unusual submission patterns, and suspicious behavior...
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select className={hub.filterSelect}>
            <option value="all">All Assessments</option>
            {subjectExperiments.map(e => (
              <option key={e.id} value={e.id}>Lab {e.exp_number} - {e.title}</option>
            ))}
          </select>

          <select
            className={hub.filterSelect}
            value={integrityRiskFilter}
            onChange={e => setIntegrityRiskFilter(e.target.value)}
          >
            <option value="all">All Risk Levels</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            className={hub.filterSelect}
            value={integrityStatusFilter}
            onChange={e => setIntegrityStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="under_review">Under Review</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
          </select>

          <div className={hub.searchBox} style={{ minWidth: 200 }}>
            <Search size={14} color="#94a3b8" />
            <input
              type="text"
              className={hub.searchInput}
              placeholder="Search by student name or roll number..."
              value={integritySearch}
              onChange={e => setIntegritySearch(e.target.value)}
            />
          </div>

          <button type="button" className={hub.iconBtn}>
            <SlidersHorizontal size={13} /> Filters
          </button>
        </div>
      </div>

      {/* 4 Summary KPI Cards */}
      <div className={hub.overviewKpiGrid}>
        <div className={hub.kpiCardV2}>
          <div className={hub.kpiCardTopRow}>
            <span className={hub.kpiCardTitle}>Flagged submissions</span>
            <div className={`${hub.kpiCardIconBox} ${hub.kpiIconRed}`}>
              <FileText size={16} />
            </div>
          </div>
          <span className={hub.kpiCardNumber} style={{ color: '#dc2626' }}>
            {plagiarismFlags.length}
          </span>
        </div>

        <div className={hub.kpiCardV2}>
          <div className={hub.kpiCardTopRow}>
            <span className={hub.kpiCardTitle}>High similarity (&gt;80%)</span>
            <div className={`${hub.kpiCardIconBox} ${hub.kpiIconRed}`}>
              <AlertTriangle size={16} />
            </div>
          </div>
          <span className={hub.kpiCardNumber} style={{ color: '#dc2626' }}>
            {plagiarismFlags.filter(f => Number(f.similarity_pct) > 80).length}
          </span>
        </div>

        <div className={hub.kpiCardV2}>
          <div className={hub.kpiCardTopRow}>
            <span className={hub.kpiCardTitle}>Moderate similarity (50-80%)</span>
            <div className={`${hub.kpiCardIconBox} ${hub.kpiIconGold}`}>
              <AlertCircle size={16} />
            </div>
          </div>
          <span className={hub.kpiCardNumber} style={{ color: '#ea580c' }}>
            {plagiarismFlags.filter(f => Number(f.similarity_pct) > 50 && Number(f.similarity_pct) <= 80).length}
          </span>
        </div>

        <div className={hub.kpiCardV2}>
          <div className={hub.kpiCardTopRow}>
            <span className={hub.kpiCardTitle}>Suspicious patterns</span>
            <div className={`${hub.kpiCardIconBox} ${hub.kpiIconPurple}`}>
              <Sparkles size={16} />
            </div>
          </div>
          <span className={hub.kpiCardNumber} style={{ color: '#7c3aed' }}>
            {plagiarismFlags.filter(f => f.status === 'pending').length}
          </span>
        </div>
      </div>

      {/* Plagiarism Flags Table */}
      <div className={hub.rosterTableContainer}>
        <table className={hub.rosterTable}>
          <thead>
            <tr>
              <th style={{ width: 36, textAlign: 'center' }}>
                <input type="checkbox" />
              </th>
              <th style={{ width: 40 }}>#</th>
              <th>Student</th>
              <th>Assessment</th>
              <th>Similarity</th>
              <th>Risk</th>
              <th>Status</th>
              <th>Matched With</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '26px 0', fontSize: 12.5, color: '#9891a6', fontWeight: 600 }}>
                  No plagiarism flags — integrity checks are running after each session.
                </td>
              </tr>
            ) : rows
              .filter(f => {
                if (integritySearch.trim()) {
                  const q = integritySearch.toLowerCase();
                  if (!f.name.toLowerCase().includes(q) && !f.roll.toLowerCase().includes(q)) return false;
                }
                if (integrityRiskFilter !== 'all' && f.risk.toLowerCase() !== integrityRiskFilter) return false;
                if (integrityStatusFilter !== 'all' && f.status.toLowerCase().replace(/\s+/g, '_') !== integrityStatusFilter) return false;
                return true;
              })
              .map((flag, idx) => (
                <tr key={flag.id}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" />
                  </td>
                  <td style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                  <td>
                    <div className={hub.studentCell}>
                      <div className={hub.studentAvatar} style={getAvatarStyle(flag.name)}>
                        {initials(flag.name)}
                      </div>
                      <div className={hub.studentInfo}>
                        <span className={hub.studentName}>{flag.name}</span>
                        <span className={hub.studentRoll}>{flag.roll}</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: '#334155' }}>
                    {flag.assessment}
                  </td>
                  <td>
                    <span className={flag.sim >= 80 ? hub.similarityPillHigh : hub.similarityPillMed}>
                      {flag.sim}%
                    </span>
                  </td>
                  <td>
                    {flag.risk === 'High' ? (
                      <span className={`${hub.riskBadge} ${hub.riskCritical}`}>High</span>
                    ) : flag.risk === 'Medium' ? (
                      <span className={`${hub.riskBadge} ${hub.riskHigh}`}>Medium</span>
                    ) : (
                      <span className={`${hub.riskBadge} ${hub.riskWatch}`}>Low</span>
                    )}
                  </td>
                  <td>
                    <span className={`${hub.riskBadge} ${flag.status === 'Actioned' ? hub.riskOk : (flag.status === 'Cleared' ? hub.riskWatch : hub.riskHigh)}`}>
                      {flag.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12.5, color: '#64748b', fontWeight: 550 }}>
                    {flag.matched}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        className={hub.tableActionBtn}
                        onClick={() => onViewFlaggedStudent(flag.name)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className={hub.iconBtn}
                        style={{ width: 28, height: 28, padding: 0 }}
                      >
                        <MoreVertical size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
